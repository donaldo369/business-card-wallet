// HubSpot 커뮤니케이션 구독 상태 처리용 순수 로직.
// 네트워크 호출은 route.js 가 담당하고, 이 파일은 구독 정의 목록을 받아
// 대상 구독을 골라내고 배치 요청 본문을 만드는 일만 한다 (테스트 가능하게 분리).

// 명함을 직접 받아 연락처를 등록/갱신할 때 구독 처리할 대상.
// HubSpot 포털의 구독 유형 이름과 일치해야 한다 (ID는 포털마다 달라 런타임에 조회).
export const TARGET_SUBSCRIPTION_NAMES = [
  '뉴스레터 구독 동의',
  '마케팅 정보 활용 동의',
  'One to One',
];

// HubSpot UI 의 "연락 당사자로부터 자유롭게 부여된 동의"에 해당하는 enum 값
export const LEGAL_BASIS = 'CONSENT_WITH_NOTICE';
export const LEGAL_BASIS_EXPLANATION = '명함을 직접 전달 받음';

export const SUBSCRIPTION_CHANNEL = 'EMAIL';

// 구독 유형 이름 비교용 정규화.
// HubSpot 쪽에서 이름을 손봤을 때(앞뒤 공백, 연속 공백, 영문 대소문자) 매칭이
// 깨지지 않도록 한다. 한글은 대소문자 개념이 없어 영문 구독명에만 영향.
const normalizeName = (name) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/**
 * 구독 정의 목록에서 대상 구독을 이름으로 찾는다.
 * @param {Array<{id: string|number, name: string, channel?: string}>} definitions
 * @param {string[]} wantedNames
 * @returns {{ matched: Array<{id: string, name: string}>, missing: string[] }}
 *          matched 는 wantedNames 순서를 따르고, missing 은 못 찾은 이름들.
 */
export function matchSubscriptions(definitions, wantedNames) {
  const emailDefs = (definitions || []).filter(
    // channel 이 응답에 없는 경우도 있어, 있을 때만 EMAIL 로 제한한다
    (d) => d && (d.channel === undefined || d.channel === SUBSCRIPTION_CHANNEL)
  );

  const matched = [];
  const missing = [];

  for (const wanted of wantedNames) {
    const target = normalizeName(wanted);
    // 동명이 여러 개면 첫 번째를 쓴다 (정의 목록의 순서를 신뢰)
    const found = emailDefs.find((d) => normalizeName(d.name) === target);
    if (found) {
      matched.push({ id: String(found.id), name: wanted });
    } else {
      missing.push(wanted);
    }
  }

  return { matched, missing };
}

/**
 * 단건 구독 상태 변경 요청의 본문을 만든다.
 * POST /communication-preferences/v4/statuses/{email} 용.
 * 배치(batch/write) 엔드포인트는 Marketing Hub Enterprise 전용이라 쓰지 않는다.
 * 구독자 이메일은 URL 경로로 들어가므로 본문에 포함하지 않는다.
 * @param {string} subscriptionId
 */
export function buildStatusBody(subscriptionId) {
  return {
    subscriptionId,
    statusState: 'SUBSCRIBED',
    legalBasis: LEGAL_BASIS,
    legalBasisExplanation: LEGAL_BASIS_EXPLANATION,
    channel: SUBSCRIPTION_CHANNEL,
  };
}
