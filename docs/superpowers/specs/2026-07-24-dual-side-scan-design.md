# 앞뒷면 통합 스캔 (Dual-side Scan) 설계

- 작성일: 2026-07-24
- 대상 릴리스: 다음 배포
- 상태: 승인됨

## 목적

일부 명함은 앞면에 회사/이름만 있고 연락처·주소·부서 등이 뒷면에 배치되어 있다. 현재 시스템은 이미지 한 장을 기준으로 OCR을 수행하므로 이 경우 필수 정보가 누락된 채 저장된다. 앞뒷면 두 장을 하나의 명함 데이터로 통합 저장·추출하는 흐름을 추가한다.

## 스코프

### 포함
- 신규 등록 시 "양면 스캔" 모드 지원.
- 앞뒷면 두 이미지를 단일 OCR 호출에 함께 전달하여 하나의 통합 JSON을 얻는다.
- Supabase 스토리지에 두 이미지 각각 업로드하고, DB에 `image_url`(앞) + `back_image_url`(뒷) 저장.
- 상세 뷰(`viewingCard`)에서 뒷면이 있으면 표시.

### 제외 (YAGNI)
- 이미 저장된 명함에 뒷면을 나중에 추가하는 기능.
- 배치(여러 장 연속) 모드에서의 양면 지원 — 배치는 기존대로 단면만.
- 상세 뷰에서 뒷면 편집/재추출.

## 사용자 흐름

1. 사용자가 카메라 진입 시 상단에 `단면 / 양면` 토글이 노출된다. 기본값은 `단면`(현재 흐름 유지).
2. `양면` 선택 시:
   1. 하단 안내 배지에 "앞면 촬영" 표시. 첫 셔터로 앞면 캡처.
   2. 안내 배지가 "이제 뒷면 촬영"으로 전환. 두 번째 셔터로 뒷면 캡처.
   3. 두 캡처가 완료되면 `onDualSideSelected(front, back)` 콜백으로 이미지 두 개를 상위로 전달.
3. 상위(page.js)에서 앞면 → 뒷면 순으로 `ImageCropper`를 순차 오픈. 각각 트림 완료 시 다음 단계로 진행.
4. 두 트림 결과를 단일 `/api/extract` 호출에 함께 전송. 모델이 앞뒷면 정보를 통합해 하나의 JSON 반환.
5. 편집 화면(`editingCard`)에 앞·뒷 썸네일이 나란히 노출된다. 사용자가 검토·수정 후 저장.
6. 저장 시 두 이미지 각각 Supabase에 업로드하고 `image_url`, `back_image_url` 컬럼에 URL 기록.

배치 모드는 양면 모드가 아닐 때만 이용 가능하며 기존 로직 그대로 유지.

## 데이터 모델

### `business_cards` 테이블
```sql
ALTER TABLE public.business_cards
  ADD COLUMN IF NOT EXISTS back_image_url TEXT;

NOTIFY pgrst, 'reload schema';
```

### `history` JSONB
기존 항목 스키마에 `back_image_url` 필드를 선택적으로 포함하도록 확장한다(중복 갱신 시 이전 앞·뒷 이미지 모두 히스토리에 누적). 히스토리 렌더링은 `back_image_url`이 있을 때만 조건부로 표시.

## API 변경 (`/api/extract`)

### 요청
- 기존: `FormData`의 `image` 필드 (필수)
- 신규: `image_back` 필드 (선택). 있으면 양면 모드.

### 프롬프트
양면 모드일 때만 아래 지시를 추가한다.

> 두 개의 이미지가 제공됩니다. 첫 번째는 명함의 앞면, 두 번째는 뒷면입니다. 두 면의 정보를 종합하여 하나의 JSON으로 반환하세요. 동일 필드가 양쪽에 다르게 있으면 앞면 값을 우선합니다. 어느 한 쪽에만 있는 정보는 반드시 포함하세요.

### 모델 호출
- Gemini: `generateContent`에 `[PROMPT, imagePart_front, imagePart_back]` 배열 전달.
- Claude: `messages.content`에 앞·뒷 두 개의 `image` 블록과 하나의 `text` 블록 포함.

### 응답
기존과 동일한 단일 JSON. 응답 구조 변경 없음.

## 컴포넌트 변경

### `src/components/CameraCapture.js`
- 상단 컨트롤 바에 `단면 / 양면` 세그먼트 토글 추가(플래시 버튼 옆).
- 내부 상태: `captureMode: 'single' | 'dual'`, `dualStage: 'front' | 'back'`, `frontImage`.
- `dual` + `frontStage`에서 셔터 → `frontImage` 저장 후 `dualStage`를 `back`으로 전환.
- `dual` + `backStage`에서 셔터 → `onDualSideSelected(frontImage, backImage)` 호출.
- 양면 모드에서는 배치 촬영 썸네일 스트립을 숨김(모드 상호배타).
- 안내 배지 텍스트가 현재 단계를 반영.
- 새 prop: `onDualSideSelected: (front, back) => void`.

### `src/components/ImageCropper.js`
- 새 prop: `stageLabel?: string` — 헤더 제목을 대체하는 라벨(예: "앞면 트림", "뒷면 트림"). 미지정 시 기존 "명함 영역 자동 맞춤".
- 이 외 로직 변경 없음.

### `src/app/page.js`
- 신규 상태: `dualCapture: { front: string, back: string | null } | null`.
- 신규 핸들러 `handleDualSideSelected(front, back)` — `dualCapture` 세팅 후 앞면 크로퍼 오픈.
- `handleCropComplete` 흐름 확장:
  - `dualCapture` 상태가 있고 뒷면이 아직 트림 안 됐다면: 트림 결과를 `dualCapture.front`에 반영 후 뒷면 크로퍼 오픈.
  - 뒷면까지 트림 완료 시: `extractCardInfo(front, back)` 호출.
  - 단면 흐름은 기존 그대로.
- `extractCardInfo(front, back = null)` — `back`이 있으면 `FormData`에 `image_back` 추가. 결과를 `editingCard`에 반영하며 `image_url: front`, `back_image_url: back` 함께 세팅.
- `handleSaveCard` 흐름 확장:
  - `editingCard.image_url`가 base64면 업로드 → URL 치환(기존과 동일).
  - `editingCard.back_image_url`가 base64면 별도 업로드 → URL 치환.
  - DB `insert`/`update` 페이로드에 `back_image_url` 포함.
- `handleSaveBatchAll`은 배치가 단면 모드에서만 동작하므로 `back_image_url` 무관.
- 편집 폼(1543 라인대) 왼쪽 이미지 슬롯에 뒷면 썸네일 추가:
  - 앞면 위, 뒷면 아래(또는 좌우) 2단.
  - 뒷면 슬롯에 X 버튼(삭제)만 제공. "재촬영"·"편집" 등은 이 스코프에서 제외.
- 상세 뷰(`viewingCard`, 1890 라인대) — `back_image_url`이 있으면 앞면 아래에 뒷면 이미지도 렌더. 라이트박스 지원은 기존 `lightboxImage` 재활용.

## 오류 처리

- 카메라 도중 사용자가 취소(X) → 양면 상태 리셋, `dualCapture` 초기화.
- 앞면 트림 후 뒷면 크로퍼에서 취소 → 지금까지 캡처된 데이터를 버리고 카메라 화면으로 복귀(양면 모드 유지). 사용자 혼란 방지를 위해 첫 캡처부터 다시.
- OCR 실패 → 기존 단면 흐름의 알림과 동일. `editingCard`는 세팅되지 않고 사용자가 다시 시도.
- 저장 중 뒷면 업로드만 실패한 경우 → 앞면 업로드는 이미 커밋된 상태이므로 롤백은 하지 않고 에러 알림. 사용자가 편집 화면에 남아 재시도.

## 테스트 (수동)

- 단면 모드 신규 등록: 기존 흐름 회귀 없이 동작.
- 양면 모드 정상 흐름: 앞·뒷면 각각 트림 후 통합 OCR → 편집 화면에 두 썸네일 노출 → 저장 → DB에 두 URL, 스토리지에 두 파일.
- 양면 모드 뒷면 크로퍼 취소: 카메라로 복귀 후 재촬영 가능.
- 뒷면만 정보가 있는 명함(앞면=회사/이름): 통합 결과에 뒷면 필드 포함됨.
- 상세 뷰: 앞·뒷 모두 표시. 라이트박스로 각 이미지 확대.
- 배치 모드(단면): 회귀 없음.

## 마이그레이션

- Supabase SQL 에디터에서 `ALTER TABLE ... ADD COLUMN back_image_url` 실행.
- `supabase_setup.sql`의 신규 설치 블록과 기존 테이블 업데이트 안내 블록 모두에 이 변경 반영.
- 배포 후 즉시 반영 가능(기존 카드의 `back_image_url`는 NULL, UI에서 조건부 표시 처리).
