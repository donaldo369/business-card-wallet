# Dual-side Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 명함 등록 시 앞면·뒷면 두 이미지를 통합해 한 장의 카드로 OCR·저장한다.

**Architecture:** `CameraCapture`에 `단면/양면` 모드 토글 추가. 양면 모드는 셔터 두 번 순차 캡처 후 `onDualSideSelected(front, back)` 호출. `page.js`는 두 이미지를 각각 `ImageCropper`로 순차 트림한 뒤, 두 트림 결과를 단일 `/api/extract` 호출에 함께 전달한다. 서버는 두 이미지가 오면 Gemini/Claude에게 통합 프롬프트로 두 장을 동시 전달해 하나의 JSON을 반환한다. Supabase에는 앞면·뒷면 각각 업로드하고 `image_url`, `back_image_url` 두 컬럼에 URL을 저장한다.

**Tech Stack:** Next.js 16 App Router, JavaScript (no TypeScript), Supabase JS, Google Generative AI SDK, Anthropic SDK, Cropper.js 1.x, Tailwind + custom CSS.

## Global Constraints

- 프로젝트에 자동화된 테스트 인프라 없음 — 각 태스크는 브라우저 수동 검증으로 종료.
- 스펙 근거: `docs/superpowers/specs/2026-07-24-dual-side-scan-design.md`.
- 언어: 코드 주석과 UI 텍스트는 한국어(기존 코드 관례 따름). 의미가 자명하지 않은 경우만 최소 주석.
- 기존 단면(single) 흐름은 회귀 없음 — 모든 태스크에서 단면 시나리오 회귀 검사 필수.
- 각 태스크 끝에 커밋. 커밋 메시지는 기존 관례(`Feature: ...`, `Fix: ...`)를 따르며 `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` 트레일러 포함.

## File Structure

- Modify: `supabase_setup.sql` — 새 컬럼 CREATE 반영 및 기존 설치용 ALTER 스니펫.
- Modify: `src/app/api/extract/route.js` — `image_back` 처리, 모델 호출 두 이미지 지원.
- Modify: `src/components/ImageCropper.js` — `stageLabel` prop 추가.
- Modify: `src/components/CameraCapture.js` — 모드 토글, 이중 캡처 상태·플로우, `onDualSideSelected` prop.
- Modify: `src/app/page.js` — 이중 캡처 상태·핸들러, `extractCardInfo` 시그니처, 저장 플로우, 편집 폼 UI, 상세 뷰 UI.

---

### Task 1: DB 스키마 — `back_image_url` 컬럼 추가

**Files:**
- Modify: `supabase_setup.sql`

**Interfaces:**
- Produces: `business_cards.back_image_url` (TEXT, nullable) — 이후 모든 태스크가 이 컬럼을 사용.

- [ ] **Step 1: `supabase_setup.sql`의 CREATE TABLE 블록에 컬럼 추가**

`supabase_setup.sql` 2~20 라인의 CREATE TABLE에 `image_url TEXT` 다음 줄에 `back_image_url TEXT`를 추가한다.

```sql
CREATE TABLE public.business_cards (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    first_name TEXT,
    last_name TEXT,
    company TEXT,
    email TEXT,
    department TEXT,
    title TEXT,
    office_phone TEXT,
    mobile_phone TEXT,
    address TEXT,
    image_url TEXT,
    back_image_url TEXT,
    hubspot_id TEXT,
    history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
```

- [ ] **Step 2: 기존 테이블 업데이트용 ALTER 스니펫 추가**

`supabase_setup.sql` 마지막에 아래 블록을 추가한다.

```sql
-- ----------------------------------------------------
-- [뒷면 이미지 컬럼 추가 — 양면 스캔 기능 도입]
-- 기존 테이블에는 아래 블록을 SQL Editor에서 실행하세요.
-- ----------------------------------------------------

ALTER TABLE public.business_cards
    ADD COLUMN IF NOT EXISTS back_image_url TEXT;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 3: Supabase에서 ALTER 실행**

Supabase SQL Editor에 위 ALTER 스니펫을 붙여 실행. `SELECT column_name FROM information_schema.columns WHERE table_name = 'business_cards' AND column_name = 'back_image_url';` 로 컬럼 생성 확인.

- [ ] **Step 4: 커밋**

```bash
git add supabase_setup.sql
git commit -m "$(cat <<'EOF'
Feature: Add back_image_url column for dual-side scanning

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `/api/extract` — 뒷면 이미지 선택 수용

**Files:**
- Modify: `src/app/api/extract/route.js`

**Interfaces:**
- Consumes: 없음 (독립).
- Produces: `POST /api/extract` FormData가 `image` + 선택적 `image_back` 필드를 수용. 응답 형식은 기존과 동일한 `{ data: {...}, engine: '...' }`.

- [ ] **Step 1: `PROMPT`에 양면 지시 추가용 상수 추가**

`route.js` 상단 `PROMPT` 상수 아래에 다음을 추가한다.

```js
const DUAL_SIDE_HINT = `
추가 지시: 이 요청에는 두 개의 이미지가 제공됩니다. 첫 번째는 명함의 앞면, 두 번째는 뒷면입니다.
두 면의 정보를 종합하여 하나의 JSON으로 반환해 주세요.
동일 필드가 양쪽에 다르게 있으면 앞면의 값을 우선합니다.
어느 한 쪽에만 있는 정보는 반드시 결과에 포함하세요.
`;
```

- [ ] **Step 2: `tryGemini` 시그니처 변경 — 이미지 배열 수용**

`tryGemini`의 파라미터를 `{ apiKey, base64Image, mimeType }` 에서 `{ apiKey, images }` 로 변경한다. `images`는 `[{ base64, mimeType }]`.

`imageParts` 구성과 프롬프트 선택을 아래로 교체.

```js
async function tryGemini({ apiKey, images }) {
  if (Date.now() < geminiDeadUntil) {
    return { error: new Error('Gemini quota cached as exhausted; skipping') };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  const imageParts = images.map(({ base64, mimeType }) => ({
    inlineData: { data: base64, mimeType },
  }));
  const promptText = images.length > 1 ? `${PROMPT}\n${DUAL_SIDE_HINT}` : PROMPT;
  let lastError = null;

  for (const modelName of modelsToTry) {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });

    const maxRateRetries = 2;
    let modelDone = false;
    for (let attempt = 0; attempt <= maxRateRetries && !modelDone; attempt++) {
      try {
        console.log(`Gemini ${modelName} (attempt ${attempt + 1}, images=${images.length})`);
        const result = await model.generateContent([promptText, ...imageParts]);
        return { text: result.response.text(), engine: `gemini:${modelName}` };
      } catch (err) {
        lastError = err;
        if (isQuotaExhausted(err)) {
          console.warn(`Gemini quota exhausted (${modelName}); caching for ${GEMINI_DEAD_CACHE_MS / 1000}s`);
          geminiDeadUntil = Date.now() + GEMINI_DEAD_CACHE_MS;
          return { error: err };
        }
        if (isRateLimitError(err) && attempt < maxRateRetries) {
          const wait = 500 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
          console.warn(`Gemini ${modelName} rate-limited, retrying in ${wait}ms`);
          await sleep(wait);
          continue;
        }
        console.warn(`Gemini ${modelName} failed: ${err.message}`);
        modelDone = true;
      }
    }
  }

  return { error: lastError };
}
```

- [ ] **Step 3: `tryClaude` 시그니처도 이미지 배열로 변경**

```js
async function tryClaude({ apiKey, images }) {
  const client = new Anthropic({ apiKey });
  try {
    console.log(`Claude Haiku 4.5 fallback (images=${images.length})`);
    const imageBlocks = images.map(({ base64, mimeType }) => ({
      type: 'image',
      source: { type: 'base64', media_type: mimeType, data: base64 },
    }));
    const promptText = images.length > 1 ? `${PROMPT}\n${DUAL_SIDE_HINT}` : PROMPT;
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            {
              type: 'text',
              text: `${promptText}\n\nJSON만 반환하고 다른 설명이나 코드블록 표시는 포함하지 마세요.`,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock) throw new Error('Claude 응답에 텍스트 블록이 없습니다.');
    return { text: textBlock.text, engine: 'claude:haiku-4-5' };
  } catch (err) {
    console.warn(`Claude fallback failed: ${err.message}`);
    return { error: err };
  }
}
```

- [ ] **Step 4: `POST` 핸들러에서 두 이미지 수용**

`const bytes = await file.arrayBuffer();` 이하 블록을 아래로 교체한다.

```js
    const bytes = await file.arrayBuffer();
    const base64Image = Buffer.from(bytes).toString('base64');
    const mimeType = file.type || 'image/jpeg';

    const images = [{ base64: base64Image, mimeType }];

    const backFile = formData.get('image_back');
    if (backFile && typeof backFile !== 'string') {
      const backBytes = await backFile.arrayBuffer();
      images.push({
        base64: Buffer.from(backBytes).toString('base64'),
        mimeType: backFile.type || 'image/jpeg',
      });
    }

    let textResult = null;
    let engineUsed = null;
    let lastError = null;

    if (geminiKey) {
      const r = await tryGemini({ apiKey: geminiKey, images });
      if (r.text) {
        textResult = r.text;
        engineUsed = r.engine;
      } else {
        lastError = r.error;
      }
    }

    if (!textResult && anthropicKey) {
      console.log('Falling back to Claude');
      const r = await tryClaude({ apiKey: anthropicKey, images });
      if (r.text) {
        textResult = r.text;
        engineUsed = r.engine;
      } else {
        lastError = r.error;
      }
    }
```

- [ ] **Step 5: 수동 검증 — 단면 회귀 확인**

`npm run dev` 실행. 기존 단면 흐름으로 아무 명함 하나 스캔해 OCR이 정상 동작하고 JSON이 반환되는지 확인. 네트워크 탭에서 `POST /api/extract` 200 응답.

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/extract/route.js
git commit -m "$(cat <<'EOF'
Feature: Accept optional back-side image in /api/extract

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `ImageCropper` — `stageLabel` prop

**Files:**
- Modify: `src/components/ImageCropper.js`

**Interfaces:**
- Consumes: 없음.
- Produces: `<ImageCropper stageLabel="앞면 트림" ... />` 로 헤더 라벨을 오버라이드 가능. `stageLabel` 미지정 시 기존 문구 유지.

- [ ] **Step 1: prop 시그니처와 헤더 텍스트 교체**

`src/components/ImageCropper.js` 8라인의 함수 시그니처를 아래로 변경.

```js
export default function ImageCropper({ imageSrc, onCropComplete, onCancel, stageLabel }) {
```

`<Sparkles size={16} ...` 아래의 헤더 텍스트 `명함 영역 자동 맞춤`을 아래로 교체.

```jsx
            {stageLabel || '명함 영역 자동 맞춤'}
```

- [ ] **Step 2: 수동 검증**

`npm run dev` 실행. 단면 흐름에서 크로퍼가 여전히 "명함 영역 자동 맞춤" 헤더로 표시되는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/components/ImageCropper.js
git commit -m "$(cat <<'EOF'
Feature: Accept stageLabel prop in ImageCropper

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `CameraCapture` — 양면 모드 토글과 이중 캡처 플로우

**Files:**
- Modify: `src/components/CameraCapture.js`

**Interfaces:**
- Consumes: 없음.
- Produces: 새 prop `onDualSideSelected: (frontDataUrl, backDataUrl) => void`. 양면 모드에서 두 번째 캡처(또는 두 번째 파일 선택) 완료 시 이 콜백이 호출된다. 단면 모드는 기존 `onImageSelected`/`onBatchSelected`로 유지.

- [ ] **Step 1: props 시그니처 확장**

`src/components/CameraCapture.js` 6라인을 아래로 변경.

```js
export default function CameraCapture({ onImageSelected, onBatchSelected, onDualSideSelected, onClose, onManualInput }) {
```

- [ ] **Step 2: 모드/스테이지 상태 추가**

기존 `const [capturedImages, setCapturedImages] = useState([]);` 위에 아래 상태를 추가.

```js
  const [captureMode, setCaptureMode] = useState('single'); // 'single' | 'dual'
  const [dualStage, setDualStage] = useState('front'); // 'front' | 'back'
  const [dualFront, setDualFront] = useState(null); // dual 모드에서 앞면 캡처 후 저장
```

- [ ] **Step 3: `handleCapture` 확장 — 양면 모드 분기**

현재 `handleCapture`의 마지막 두 줄을 교체한다. 기존:

```js
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    setCapturedImages(prev => [...prev, dataUrl]);
  };
```

아래로 교체:

```js
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    if (captureMode === 'dual') {
      if (dualStage === 'front') {
        setDualFront(dataUrl);
        setDualStage('back');
      } else {
        stopCamera();
        onDualSideSelected(dualFront, dataUrl);
      }
      return;
    }

    setCapturedImages(prev => [...prev, dataUrl]);
  };
```

- [ ] **Step 4: `handleFileChange` 확장 — 양면 모드 분기**

`handleFileChange` 내부의 `img.onload` 콜백 마지막 부분을 교체한다. 기존:

```js
            const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            onImageSelected(croppedDataUrl);
          };
          img.src = event.target.result;
        }
      };
      reader.readAsDataURL(file);
      stopCamera();
```

아래로 교체(주의: 양면 모드일 때는 앞면 선택 후 카메라 화면을 유지해야 하므로 `stopCamera` 위치가 다름):

```js
            const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);

            if (captureMode === 'dual') {
              if (dualStage === 'front') {
                setDualFront(croppedDataUrl);
                setDualStage('back');
                // 카메라 유지: 사용자가 뒷면을 이어서 촬영/선택
              } else {
                stopCamera();
                onDualSideSelected(dualFront, croppedDataUrl);
              }
              return;
            }

            stopCamera();
            onImageSelected(croppedDataUrl);
          };
          img.src = event.target.result;
        }
      };
      reader.readAsDataURL(file);
```

- [ ] **Step 5: 상단 컨트롤 바에 `단면/양면` 토글 추가**

상단 컨트롤 바(`<div style={{ display: 'flex', justifyContent: 'space-between', ... zIndex: 110 }}>`) 내부, 플래시 버튼과 닫기 버튼 사이 중앙에 아래 세그먼트 토글을 추가한다.

```jsx
        <div
          style={{
            display: 'flex',
            gap: '4px',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '999px',
            padding: '3px',
          }}
        >
          {['single', 'dual'].map((mode) => {
            const active = captureMode === mode;
            const canSwitch = capturedImages.length === 0 && !dualFront;
            return (
              <button
                key={mode}
                onClick={() => {
                  if (!canSwitch) return;
                  setCaptureMode(mode);
                  setDualStage('front');
                  setDualFront(null);
                }}
                disabled={!canSwitch}
                style={{
                  padding: '6px 14px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: active ? '#0f172a' : 'rgba(255,255,255,0.8)',
                  background: active ? '#ffffff' : 'transparent',
                  border: 'none',
                  borderRadius: '999px',
                  cursor: canSwitch ? 'pointer' : 'not-allowed',
                  opacity: canSwitch ? 1 : 0.5,
                }}
              >
                {mode === 'single' ? '단면' : '양면'}
              </button>
            );
          })}
        </div>
```

- [ ] **Step 6: 안내 배지에 양면 단계 표시**

기존 감지 상태 배지 (`{debugInfo || '초기화 중...'}`) 대체 텍스트를 양면 모드에서 단계 안내로 바꾼다. 배지의 JSX 내용을 아래로 교체.

```jsx
              {captureMode === 'dual'
                ? (dualStage === 'front' ? '① 앞면 촬영' : '② 이제 뒷면 촬영')
                : (debugInfo || '초기화 중...')}
```

- [ ] **Step 7: 배치 썸네일 스트립은 단면 모드에서만 노출**

`{capturedImages.length > 0 && (` 조건을 아래로 교체.

```jsx
      {captureMode === 'single' && capturedImages.length > 0 && (
```

- [ ] **Step 8: 수동 검증 — 단면 회귀**

`npm run dev`. 단면 모드(기본)에서 카메라 촬영 → 촬영 이미지 스트립 → 완료 흐름이 기존과 동일한지 확인. 파일 업로드 흐름도 동작 확인.

- [ ] **Step 9: 수동 검증 — 양면 모드 자체 흐름**

상단 토글로 `양면` 선택. 배지가 "① 앞면 촬영" 표시. 셔터 누르면 배지가 "② 이제 뒷면 촬영"으로 바뀌고 배치 스트립은 안 뜨는지 확인. 두 번째 셔터로 두 이미지가 `onDualSideSelected`로 전달되는지 콘솔 로그(임시 `console.log`로 확인)로 검증. 이 태스크에서는 아직 상위(page.js)와 연결되지 않았으므로 콘솔에서만 확인.

- [ ] **Step 10: 커밋**

```bash
git add src/components/CameraCapture.js
git commit -m "$(cat <<'EOF'
Feature: Add dual-side capture mode to CameraCapture

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `page.js` — `extractCardInfo`가 뒷면을 함께 전송

**Files:**
- Modify: `src/app/page.js`

**Interfaces:**
- Consumes: `/api/extract`가 `image_back` FormData 필드를 수용(Task 2).
- Produces: `extractCardInfo(frontBase64, backBase64 = null)` — 두 번째 인자가 있으면 `image_back` 필드로 함께 POST. `editingCard`에는 `image_url: frontBase64`, `back_image_url: backBase64` 함께 세팅.

- [ ] **Step 1: `extractCardInfo` 시그니처 확장**

`src/app/page.js`의 `extractCardInfo` (661라인대) 함수를 아래로 교체.

```js
  const extractCardInfo = async (base64Image, backBase64 = null) => {
    setIsExtracting(true);
    try {
      const compact = await compressForOCR(base64Image);
      const res = await fetch(compact);
      const blob = await res.blob();
      const file = new File([blob], 'card.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('image', file);

      if (backBase64) {
        const backCompact = await compressForOCR(backBase64);
        const backRes = await fetch(backCompact);
        const backBlob = await backRes.blob();
        const backFile = new File([backBlob], 'card_back.jpg', { type: 'image/jpeg' });
        formData.append('image_back', backFile);
      }

      const headers = {};
      if (settings.geminiKey) {
        headers['x-gemini-key'] = settings.geminiKey;
      }
      if (settings.anthropicKey) {
        headers['x-anthropic-key'] = settings.anthropicKey;
      }

      const ocrRes = await fetch('/api/extract', {
        method: 'POST',
        headers,
        body: formData,
      });

      const result = await ocrRes.json();
      if (!ocrRes.ok) throw new Error(result.error || 'OCR 추출에 실패했습니다.');

      setEditingCard({
        ...result.data,
        id: null,
        image_url: base64Image,
        back_image_url: backBase64,
      });
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setIsExtracting(false);
    }
  };
```

- [ ] **Step 2: 수동 검증**

`npm run dev`. 기존 단면 흐름을 다시 실행해 `extractCardInfo(base64)` 단일 인자 호출이 여전히 정상 동작하는지 확인. 저장까지 회귀 없이 성공해야 한다.

- [ ] **Step 3: 커밋**

```bash
git add src/app/page.js
git commit -m "$(cat <<'EOF'
Feature: extractCardInfo forwards optional back image to API

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `page.js` — 이중 캡처 → 이중 크롭 → 통합 OCR 배선

**Files:**
- Modify: `src/app/page.js`

**Interfaces:**
- Consumes: `CameraCapture`의 `onDualSideSelected(front, back)` (Task 4), `extractCardInfo(front, back)` (Task 5), `ImageCropper`의 `stageLabel` prop (Task 3).
- Produces: 새 state `dualPending`가 `null`이 아니면 편집 흐름이 아직 뒷면 대기 중임을 나타낸다. `handleCropComplete`는 이 상태를 보고 앞면/뒷면 분기.

- [ ] **Step 1: 상태 추가**

`page.js`의 `selectedImage` state 선언 근처(107라인)에 아래를 추가.

```js
  const [dualPending, setDualPending] = useState(null); // { front, back, croppedFront } | null
```

- [ ] **Step 2: `handleDualSideSelected` 핸들러 추가**

`handleCropComplete` 정의 위(859라인 위)에 아래 함수를 추가.

```js
  const handleDualSideSelected = (frontImg, backImg) => {
    setShowCapture(false);
    setDualPending({ front: frontImg, back: backImg, croppedFront: null });
    setSelectedImage(frontImg); // 앞면 크로퍼 오픈
  };
```

- [ ] **Step 3: `handleCropComplete`에 양면 분기 추가**

현재 함수(859~864라인)를 아래로 교체.

```js
  const handleCropComplete = async (croppedImg) => {
    if (dualPending) {
      if (!dualPending.croppedFront) {
        // 앞면 트림 완료 → 뒷면 크로퍼로 이어짐
        setDualPending({ ...dualPending, croppedFront: croppedImg });
        setSelectedImage(dualPending.back);
        return;
      }
      // 뒷면 트림 완료 → 통합 OCR
      const finalFront = dualPending.croppedFront;
      const finalBack = croppedImg;
      setCroppedImage(finalFront);
      setSelectedImage(null);
      setDualPending(null);
      setShowCapture(false);
      await extractCardInfo(finalFront, finalBack);
      return;
    }

    // 단면 흐름 (기존 동작)
    setCroppedImage(croppedImg);
    setSelectedImage(null);
    setShowCapture(false);
    await extractCardInfo(croppedImg);
  };
```

- [ ] **Step 4: `ImageCropper` 사용부에 `stageLabel` 전달**

1882~1888라인의 `<ImageCropper .../>` 를 아래로 교체.

```jsx
      {selectedImage && (
        <ImageCropper
          imageSrc={selectedImage}
          onCropComplete={handleCropComplete}
          onCancel={() => {
            if (dualPending) {
              // 양면 흐름 중단: 모든 상태를 초기화하고 카메라 재진입 유도
              setDualPending(null);
              setSelectedImage(null);
            } else {
              setSelectedImage(null);
            }
          }}
          stageLabel={
            dualPending
              ? (dualPending.croppedFront ? '뒷면 트림' : '앞면 트림')
              : undefined
          }
        />
      )}
```

- [ ] **Step 5: `CameraCapture` 사용부에 `onDualSideSelected` prop 연결**

1290~1316라인의 `<CameraCapture ... />` 에 아래 prop을 추가한다. `onManualInput` 위에 삽입.

```jsx
              onDualSideSelected={handleDualSideSelected}
```

- [ ] **Step 6: 수동 검증 — 양면 전체 흐름**

`npm run dev`. 카메라에서 `양면` 모드 선택 → 앞면 촬영 → 안내 배지 "② 이제 뒷면 촬영" → 뒷면 촬영 → 앞면 크로퍼("앞면 트림" 헤더) → 트림 완료 → 뒷면 크로퍼("뒷면 트림") → 트림 완료 → OCR 로딩 → 편집 화면 진입.

- [ ] **Step 7: 수동 검증 — 뒷면 크로퍼 취소**

양면 흐름 중 뒷면 크로퍼에서 취소(X 버튼). `dualPending` 초기화 확인, 편집 화면 진입 없이 홈으로 복귀되는지 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/app/page.js
git commit -m "$(cat <<'EOF'
Feature: Wire dual-side capture through sequential cropper stages

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `page.js` — 저장 플로우에 `back_image_url` 반영

**Files:**
- Modify: `src/app/page.js`

**Interfaces:**
- Consumes: `editingCard.back_image_url` (Task 5에서 세팅).
- Produces: DB `insert`/`update` 페이로드에 `back_image_url` 포함. base64 데이터면 Supabase 스토리지 업로드 후 URL로 치환.

- [ ] **Step 1: `handleSaveCard`에 뒷면 업로드/저장 로직 추가**

977~997라인의 `handleSaveCard` 내부를 아래로 교체 (finalImageUrl 이후에 finalBackImageUrl 추가하고 cardData에 포함).

```js
    setLoading(true);
    try {
      let finalImageUrl = editingCard.image_url;
      if (editingCard.image_url.startsWith('data:')) {
        finalImageUrl = await uploadImageToSupabase(editingCard.image_url);
      }

      let finalBackImageUrl = editingCard.back_image_url || null;
      if (finalBackImageUrl && finalBackImageUrl.startsWith('data:')) {
        finalBackImageUrl = await uploadImageToSupabase(finalBackImageUrl);
      }

      const { data: { session } } = await sb.auth.getSession();
      const cardData = {
        name: editingCard.name,
        first_name: editingCard.first_name,
        last_name: editingCard.last_name,
        company: editingCard.company,
        email: editingCard.email,
        department: editingCard.department,
        title: editingCard.title,
        office_phone: editingCard.office_phone,
        mobile_phone: editingCard.mobile_phone,
        address: editingCard.address,
        image_url: finalImageUrl,
        back_image_url: finalBackImageUrl,
        user_id: session?.user?.id || null,
      };
```

- [ ] **Step 2: `handleSaveBatchAll`도 뒷면 컬럼 안전 처리**

809~828라인의 배치 저장 블록에서 `cardData` 생성부에 `back_image_url: null` 명시적으로 추가(배치는 단면만이므로 항상 null).

```js
        const cardData = {
          name: card.name,
          first_name: card.first_name,
          last_name: card.last_name,
          company: card.company,
          email: card.email,
          department: card.department,
          title: card.title,
          office_phone: card.office_phone,
          mobile_phone: card.mobile_phone,
          address: card.address,
          image_url: finalImageUrl,
          back_image_url: null,
          user_id: session?.user?.id || null,
        };
```

- [ ] **Step 3: `makeHistoryEntry`에 뒷면 이미지 보존**

867~877라인의 `makeHistoryEntry` 함수를 아래로 교체. 동일인 재스캔으로 덮어쓰기 될 때 이전 뒷면 이미지가 히스토리에 남도록 한다.

```js
  const makeHistoryEntry = (existingCard) => ({
    image_url: existingCard.image_url,
    back_image_url: existingCard.back_image_url || null,
    company: existingCard.company,
    title: existingCard.title,
    department: existingCard.department,
    email: existingCard.email,
    office_phone: existingCard.office_phone,
    mobile_phone: existingCard.mobile_phone,
    address: existingCard.address,
    recorded_at: existingCard.updated_at || existingCard.created_at || new Date().toISOString(),
  });
```

- [ ] **Step 4: 수동 검증 — 양면 저장**

`npm run dev`. 양면 모드로 스캔 완료 후 편집 화면에서 저장. Supabase 대시보드에서 `business_cards` 새 행 확인 — `image_url`과 `back_image_url` 두 URL이 각각 채워졌는지, `card-images` 스토리지에 두 파일이 업로드됐는지 확인.

- [ ] **Step 5: 수동 검증 — 단면 저장 회귀**

단면 모드로 스캔 완료 후 저장. `back_image_url`이 `NULL`로 저장되는지, 기존 흐름 회귀 없음 확인.

- [ ] **Step 6: 수동 검증 — 재스캔 히스토리에 뒷면 보존**

양면으로 저장한 카드와 이름·핸드폰이 동일한 명함을 단면(또는 양면)으로 다시 스캔·저장. 상세 뷰의 명함 히스토리 항목에 이전 뒷면 이미지 URL이 남아있는지 DB에서 `history` JSONB 필드로 확인(UI 렌더링은 이 스코프에서 제외이므로 필드 존재만 검증).

- [ ] **Step 7: 커밋**

```bash
git add src/app/page.js
git commit -m "$(cat <<'EOF'
Feature: Persist back_image_url in save flow

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `page.js` — 편집 폼에 뒷면 썸네일 슬롯

**Files:**
- Modify: `src/app/page.js`

**Interfaces:**
- Consumes: `editingCard.back_image_url`.
- Produces: 편집 폼 왼쪽 이미지 컨테이너에 앞면 아래로 뒷면 썸네일 표시. 뒷면이 있을 때만 노출. X 버튼으로 삭제(값을 `null`로 설정).

- [ ] **Step 1: 편집 폼 이미지 컨테이너에 뒷면 슬롯 추가**

1563~1576라인의 `<div className="form-image-container">` 내부를 아래로 교체.

```jsx
                <div className="form-image-container">
                  <div className="biz-card-sim" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#000' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={editingCard.image_url}
                      alt="Cropped card front"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }}
                    />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '12px', letterSpacing: '0.05em' }}>
                    앞면
                  </span>

                  {editingCard.back_image_url && (
                    <>
                      <div
                        className="biz-card-sim"
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: '8px',
                          background: '#000',
                          marginTop: '16px',
                          position: 'relative',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={editingCard.back_image_url}
                          alt="Cropped card back"
                          style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setEditingCard({ ...editingCard, back_image_url: null })
                          }
                          style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            background: 'rgba(0,0,0,0.7)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            color: '#fff',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                          }}
                          aria-label="뒷면 제거"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '12px', letterSpacing: '0.05em' }}>
                        뒷면
                      </span>
                    </>
                  )}
                </div>
```

- [ ] **Step 2: 수동 검증 — 양면 편집 화면**

`npm run dev`. 양면 모드로 스캔 후 편집 화면 진입. 왼쪽에 앞면·뒷면 두 썸네일이 상하로 나타나는지 확인. 뒷면 슬롯 우상단 X를 눌러 삭제 시 뒷면이 사라지고 그 상태로 저장하면 DB `back_image_url`이 NULL로 저장되는지 확인.

- [ ] **Step 3: 수동 검증 — 단면 편집 회귀**

단면 모드로 스캔 시 편집 화면에 앞면 슬롯만 노출되고 "앞면" 라벨이 붙는지, 그리고 저장 흐름이 정상인지 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/page.js
git commit -m "$(cat <<'EOF'
Feature: Show back-side thumbnail slot in card edit form

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `page.js` — 상세 뷰에 뒷면 이미지 표시

**Files:**
- Modify: `src/app/page.js`

**Interfaces:**
- Consumes: `viewingCard.back_image_url`, 기존 `lightboxImage` state.
- Produces: 상세 모달에서 `back_image_url`이 있을 때만 앞면 아래에 뒷면 이미지 노출. 클릭하면 기존 라이트박스로 확대.

- [ ] **Step 1: `detail-card-preview` 아래에 뒷면 이미지 추가**

1908~1916라인의 `<div className="detail-card-preview">` 블록 바로 아래에 다음을 추가.

```jsx
              {viewingCard.back_image_url && (
                <div className="detail-card-preview" style={{ marginTop: '12px' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={viewingCard.back_image_url}
                    alt={`${viewingCard.name} 뒷면`}
                    onClick={() => setLightboxImage(viewingCard.back_image_url)}
                    style={{ cursor: 'zoom-in' }}
                  />
                </div>
              )}
```

- [ ] **Step 2: 수동 검증**

`npm run dev`. Task 7에서 양면으로 저장한 카드를 목록에서 클릭해 상세 모달 열기. 앞면 아래에 뒷면 이미지가 표시되고, 클릭 시 라이트박스로 확대되는지 확인. 뒷면이 없는(단면으로 저장된) 카드에서는 뒷면 이미지 영역이 렌더되지 않는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add src/app/page.js
git commit -m "$(cat <<'EOF'
Feature: Render back-side image in card detail view

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Final Manual Verification Checklist

전체 태스크 완료 후 브라우저에서 아래를 순차 검증한다.

- [ ] 단면 모드 신규 등록: 캡처 → 크롭 → OCR → 저장 → 목록·상세에서 정상.
- [ ] 양면 모드 신규 등록: 카메라 모드 토글 → 앞면 촬영 → 뒷면 촬영 → 앞면 트림 → 뒷면 트림 → 통합 OCR → 편집 화면에 두 썸네일 → 저장 → 상세에서 두 이미지 노출.
- [ ] 양면 모드에서 앞면에는 이름만, 뒷면에 연락처가 있는 명함으로 스캔 시 결과 JSON에 연락처가 포함되는지.
- [ ] 양면 모드에서 뒷면 크로퍼를 취소하면 dualPending이 초기화되고 편집 화면으로 넘어가지 않음.
- [ ] 단면 배치 모드(여러 장 연속): 기존 흐름 회귀 없음.
- [ ] 파일 업로드(사진첩)로 양면 흐름: 첫 파일 = 앞면, 두 번째 파일 = 뒷면으로 처리되는지.
- [ ] Supabase 스토리지: 양면 저장 시 두 이미지 파일이 별개로 업로드되어 있는지.
- [ ] 이미 저장된 카드(뒷면 없음)의 상세 뷰: 뒷면 영역이 렌더되지 않음.
