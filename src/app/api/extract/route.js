import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { autoCorrectPhones } from '@/lib/phone';

const PROMPT = `
명함 이미지에서 정보를 추출하여 정확히 아래 형식의 JSON 구조로 반환해 주세요.
명함에 없는 정보는 null로 표시해 주세요.

특별 요구사항:
1. 성(last_name)과 이름(first_name)을 분리하여 기입하고, 성과 이름 내부에는 절대 공백이 포함되지 않도록 해주세요. (예: "홍 길동" -> last_name: "홍", first_name: "길동")
2. 전화번호(mobile_phone, office_phone)는 반드시 국제 표준 형식으로 변환해 주세요.
   - 한국 번호인 경우 앞자리 0을 빼고 국가코드 +82를 붙인 형식으로 통일합니다.
   - 핸드폰 예시: "010-1234-5678" -> "+82 10-1234-5678"
   - 사무실 예시: "02-123-4567" -> "+82 2-123-4567" 또는 "031-123-4567" -> "+82 31-123-4567"
3. 한국 명함에는 같은 정보가 한글과 영문으로 함께 표기되는 경우가 많습니다. 다음 필드는 한글 표기가 존재하면 반드시 한글을 우선 사용하고, 한글이 없을 때만 영문을 사용하세요. 영문 이름 옆의 한글 이름, 영문 회사명 위/아래의 한글 상호, 영문 직책과 나란히 적힌 한글 직책 등을 놓치지 마세요.
   - name / last_name / first_name (예: "Gil-dong Hong" 옆에 "홍길동"이 있으면 last_name="홍", first_name="길동", name="홍길동")
   - company (예: "ACOUSTIC ENG" 옆/위에 "어쿠스틱이엔지"가 있으면 "어쿠스틱이엔지")
   - department (예: "R&D Team" 옆에 "연구개발팀"이 있으면 "연구개발팀")
   - title (예: "General Manager" 옆에 "부장"이 있으면 "부장")
   - address (한글 주소가 있으면 한글 주소를 사용)
   단, email 및 phone은 언어 규칙과 무관하게 그대로 사용합니다.

반환할 JSON 형식:
{
  "last_name": "성 (문자열 또는 null)",
  "first_name": "이름 (문자열 또는 null)",
  "name": "성명 전체 (문자열 또는 null)",
  "company": "회사명 (문자열 또는 null)",
  "email": "이메일 주소 (문자열 또는 null)",
  "department": "부서명 (문자열 또는 null)",
  "title": "직급/직책 (문자열 또는 null)",
  "office_phone": "국제 형식의 사무실 전화번호 (문자열 또는 null)",
  "mobile_phone": "국제 형식의 핸드폰 번호 (문자열 또는 null)",
  "address": "주소 (문자열 또는 null)"
}
`;

const DUAL_SIDE_HINT = `
추가 지시: 이 요청에는 두 개의 이미지가 제공됩니다. 첫 번째는 명함의 앞면, 두 번째는 뒷면입니다.
두 면의 정보를 종합하여 하나의 JSON으로 반환해 주세요.
동일 필드가 양쪽에 다르게 있으면 앞면의 값을 우선합니다.
어느 한 쪽에만 있는 정보는 반드시 결과에 포함하세요.
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const isRateLimitError = (err) => {
  const msg = (err?.message || '').toLowerCase();
  return msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('resource_exhausted');
};

// Quota가 영구적으로 소진된 케이스(limit:0 또는 일일 한도). 재시도해도 풀리지 않음 → 즉시 포기.
const isQuotaExhausted = (err) => {
  const msg = err?.message || '';
  return /limit:\s*0/i.test(msg) || /quota exceeded for metric/i.test(msg);
};

// 모듈 스코프 캐시: Gemini가 quota 소진을 한 번 보고하면 일정 시간 시도 자체를 스킵.
// Vercel Fluid Compute는 warm 인스턴스를 재사용하므로 같은 인스턴스 안에서 효과 있음.
let geminiDeadUntil = 0;
const GEMINI_DEAD_CACHE_MS = 5 * 60 * 1000;

// Gemini 호출: quota 소진 시 즉시 포기, 일시적 429만 짧게 재시도.
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

// Claude Haiku 4.5 폴백. Vision + 텍스트 프롬프트로 동일한 JSON 추출.
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

// 모델 응답에서 JSON만 추려내기 (마크다운 코드블록 등 안전하게 제거)
function parseJSONFromText(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  }
  return JSON.parse(cleaned);
}

export async function POST(req) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY || req.headers.get('x-gemini-key');
    const anthropicKey = process.env.ANTHROPIC_API_KEY || req.headers.get('x-anthropic-key');

    if (!geminiKey && !anthropicKey) {
      return NextResponse.json(
        { error: 'OCR API Key가 설정되지 않았습니다. 설정에서 Gemini 또는 Anthropic API Key를 입력해주세요.' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('image');

    if (!file) {
      return NextResponse.json({ error: '이미지 파일이 전달되지 않았습니다.' }, { status: 400 });
    }

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

    if (!textResult) {
      const msg = anthropicKey
        ? `모든 OCR 엔진 호출에 실패했습니다. (최종 에러: ${lastError?.message})`
        : `Gemini 호출에 실패했고 Claude 폴백 키가 설정되지 않았습니다. (최종 에러: ${lastError?.message})`;
      throw new Error(msg);
    }

    const extractedData = parseJSONFromText(textResult);

    if (extractedData.last_name) extractedData.last_name = extractedData.last_name.replace(/\s+/g, '');
    if (extractedData.first_name) extractedData.first_name = extractedData.first_name.replace(/\s+/g, '');

    const ln = extractedData.last_name || '';
    const fn = extractedData.first_name || '';
    if (ln || fn) {
      const isHangul = /[가-힣]/.test(ln + fn);
      extractedData.name = isHangul ? `${ln}${fn}` : `${fn} ${ln}`.trim();
    } else if (extractedData.name) {
      extractedData.name = extractedData.name.replace(/\s+/g, ' ').trim();
    }

    // libphonenumber로 휴대폰/유선 분류 검증 후 자동 교정
    autoCorrectPhones(extractedData);

    return NextResponse.json({ data: extractedData, engine: engineUsed });
  } catch (error) {
    console.error('OCR Extraction Error:', error);
    return NextResponse.json(
      { error: `정보를 추출하는 중 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }
}
