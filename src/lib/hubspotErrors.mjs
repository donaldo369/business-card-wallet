// HubSpot 연락처 API 오류 메시지를 사용자가 조치할 수 있는 문구로 바꾸는 순수 로직.

// 이메일이 다른 연락처에 이미 있을 때 PATCH 가 돌려주는 메시지 예:
// "Cannot set PropertyValueCoordinates{..., propertyName=email, value=a@b.com} on 579512868573.
//  575276686050 already has that value."
const DUPLICATE_EMAIL_PATTERN =
  /propertyName=email,\s*value=([^}]*)\}\s*on\s*(\d+)\.\s*(\d+)\s+already has that value/i;

/**
 * 이메일 중복 오류면 안내 문구를 만든다. 다른 오류면 null.
 * @param {string} message HubSpot 오류 응답의 message
 * @returns {string|null}
 */
export function describeDuplicateEmailError(message) {
  const m = String(message ?? '').match(DUPLICATE_EMAIL_PATTERN);
  if (!m) return null;
  const [, email, targetId, ownerId] = m;
  return `같은 이메일(${email.trim()})을 쓰는 HubSpot 연락처(ID ${ownerId})가 이미 있어, 이 명함에 연결된 연락처(ID ${targetId})에 이메일을 넣지 못했습니다. HubSpot에서 두 연락처를 병합한 뒤 다시 시도해 주세요.`;
}
