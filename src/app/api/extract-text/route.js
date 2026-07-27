import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import { autoCorrectPhones } from '@/lib/phone';

const PROMPT = `
아래 텍스트는 사용자가 붙여넣은 명함/연락처 정보입니다.
서명 블록, 이메일 서명, 사진에서 옮겨 적은 내용, 채팅에서 공유된 연락처 등 자유 형식으로 주어질 수 있습니다.
이 텍스트에서 명함 정보를 추출하여 정확히 아래 형식의 JSON 구조로 반환해 주세요.
텍스트에 없는 정보는 null로 표시해 주세요.

특별 요구사항:
1. 성(last_name)과 이름(first_name)을 분리하여 기입하고, 성과 이름 내부에는 절대 공백이 포함되지 않도록 해주세요. (예: "홍 길동" -> last_name: "홍", first_name: "길동")
2. 전화번호(mobile_phone, office_phone)는 반드시 국제 표준 형식으로 변환해 주세요.
   - 한국 번호인 경우 앞자리 0을 빼고 국가코드 +82를 붙인 형식으로 통일합니다.
   - 핸드폰 예시: "010-1234-5678" -> "+82 10-1234-5678"
   - 사무실 예시: "02-123-4567" -> "+82 2-123-4567" 또는 "031-123-4567" -> "+82 31-123-4567"
3. 라벨(예: "TEL", "MOBILE", "E-mail", "부장", "이메일", "주소") 자체는 값에 포함하지 말고 실제 값만 추출해 주세요.
4. 어떤 필드에 해당하는지 애매하면 문맥으로 추론하되, 근거가 없으면 null로 두세요.

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

const isQuotaExhausted = (err) => {
  const msg = err?.message || '';
  return /limit:\s*0/i.test(msg) || /quota exceeded for metric/i.test(msg);
};

let geminiDeadUntil = 0;
const GEMINI_DEAD_CACHE_MS = 5 * 60 * 1000;

async function tryGemini({ apiKey, text }) {
  if (Date.now() < geminiDeadUntil) {
    return { error: new Error('Gemini quota cached as exhausted; skipping') };
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
  const userContent = `${PROMPT}\n\n=== 입력 텍스트 시작 ===\n${text}\n=== 입력 텍스트 끝 ===`;
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
        console.log(`Gemini(text) ${modelName} (attempt ${attempt + 1})`);
        const result = await model.generateContent(userContent);
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

async function tryClaude({ apiKey, text }) {
  const client = new Anthropic({ apiKey });
  try {
    console.log(`Claude Haiku 4.5 fallback (text)`);
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `${PROMPT}\n\n=== 입력 텍스트 시작 ===\n${text}\n=== 입력 텍스트 끝 ===\n\nJSON만 반환하고 다른 설명이나 코드블록 표시는 포함하지 마세요.`,
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
        { error: 'API Key가 설정되지 않았습니다. 설정에서 Gemini 또는 Anthropic API Key를 입력해주세요.' },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const text = typeof body?.text === 'string' ? body.text.trim() : '';

    if (!text) {
      return NextResponse.json({ error: '텍스트가 전달되지 않았습니다.' }, { status: 400 });
    }
    if (text.length > 8000) {
      return NextResponse.json({ error: '텍스트가 너무 깁니다. 8000자 이내로 입력해 주세요.' }, { status: 400 });
    }

    let textResult = null;
    let engineUsed = null;
    let lastError = null;

    if (geminiKey) {
      const r = await tryGemini({ apiKey: geminiKey, text });
      if (r.text) {
        textResult = r.text;
        engineUsed = r.engine;
      } else {
        lastError = r.error;
      }
    }

    if (!textResult && anthropicKey) {
      console.log('Falling back to Claude (text)');
      const r = await tryClaude({ apiKey: anthropicKey, text });
      if (r.text) {
        textResult = r.text;
        engineUsed = r.engine;
      } else {
        lastError = r.error;
      }
    }

    if (!textResult) {
      const msg = anthropicKey
        ? `모든 AI 엔진 호출에 실패했습니다. (최종 에러: ${lastError?.message})`
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

    autoCorrectPhones(extractedData);

    return NextResponse.json({ data: extractedData, engine: engineUsed });
  } catch (error) {
    console.error('Text Extraction Error:', error);
    return NextResponse.json(
      { error: `정보를 추출하는 중 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }
}
