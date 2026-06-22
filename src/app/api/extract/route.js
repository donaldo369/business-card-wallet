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
async function tryGemini({ apiKey, base64Image, mimeType }) {
  if (Date.now() < geminiDeadUntil) {
    return { error: new Error('Gemini quota cached as exhausted; skipping') };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  const imageParts = [{ inlineData: { data: base64Image, mimeType } }];
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
        console.log(`Gemini ${modelName} (attempt ${attempt + 1})`);
        const result = await model.generateContent([PROMPT, ...imageParts]);
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
async function tryClaude({ apiKey, base64Image, mimeType }) {
  const client = new Anthropic({ apiKey });
  try {
    console.log('Claude Haiku 4.5 fallback');
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64Image },
            },
            {
              type: 'text',
              text: `${PROMPT}\n\nJSON만 반환하고 다른 설명이나 코드블록 표시는 포함하지 마세요.`,
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

    let textResult = null;
    let engineUsed = null;
    let lastError = null;

    if (geminiKey) {
      const r = await tryGemini({ apiKey: geminiKey, base64Image, mimeType });
      if (r.text) {
        textResult = r.text;
        engineUsed = r.engine;
      } else {
        lastError = r.error;
      }
    }

    if (!textResult && anthropicKey) {
      console.log('Falling back to Claude');
      const r = await tryClaude({ apiKey: anthropicKey, base64Image, mimeType });
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
