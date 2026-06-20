import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export async function POST(req) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || req.headers.get('x-gemini-key');
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API Key가 구성되지 않았습니다. 설정에서 API Key를 입력하거나 서버 환경 변수를 설정해주세요.' },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('image');

    if (!file) {
      return NextResponse.json({ error: '이미지 파일이 전달되지 않았습니다.' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Gemini API 초기화
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // 시도할 모델 리스트: 가용 모델만, 무료 티어 RPM 분담을 위해 다양화
    const modelsToTry = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];
    let result = null;
    let lastError = null;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const isRateLimitError = (err) => {
      const msg = (err?.message || '').toLowerCase();
      return msg.includes('429') || msg.includes('rate') || msg.includes('quota') || msg.includes('resource_exhausted');
    };

    const prompt = `
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

    const imageParts = [
      {
        inlineData: {
          data: buffer.toString('base64'),
          mimeType: file.type,
        },
      },
    ];

    // 자동 모델 폴백(Failover) 루프 + Rate limit 시 짧은 대기 후 재시도
    outer: for (const modelName of modelsToTry) {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });

      const maxRateRetries = 3;
      for (let attempt = 0; attempt <= maxRateRetries; attempt++) {
        try {
          console.log(`Trying model: ${modelName} (attempt ${attempt + 1})`);
          result = await model.generateContent([prompt, ...imageParts]);
          if (result) break outer;
        } catch (err) {
          lastError = err;
          if (isRateLimitError(err) && attempt < maxRateRetries) {
            // 429: 지수 백오프로 대기 후 같은 모델 재시도
            const wait = 1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 400);
            console.warn(`${modelName} rate-limited, retrying in ${wait}ms`);
            await sleep(wait);
            continue;
          }
          console.warn(`${modelName} 모델 호출 실패, 다음 모델로 대체 시도합니다.`, err.message);
          break; // 다음 모델로
        }
      }
    }

    if (!result) {
      throw new Error(`모든 Gemini 모델 호출에 실패했습니다. (최종 에러: ${lastError?.message})`);
    }

    const responseText = result.response.text();
    
    // JSON 파싱
    const extractedData = JSON.parse(responseText.trim());

    // 성과 이름 공백 완전 제거 안전장치
    if (extractedData.last_name) {
      extractedData.last_name = extractedData.last_name.replace(/\s+/g, '');
    }
    if (extractedData.first_name) {
      extractedData.first_name = extractedData.first_name.replace(/\s+/g, '');
    }

    return NextResponse.json({ data: extractedData });
  } catch (error) {
    console.error('OCR Extraction Error:', error);
    return NextResponse.json(
      { error: `정보를 추출하는 중 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }
}
