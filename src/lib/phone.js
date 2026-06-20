// /max 메타데이터를 써야 getType()이 MOBILE/FIXED_LINE을 구분해서 돌려줍니다.
// 기본 'min' 메타데이터는 검증만 가능하고 타입 정보가 빠져 있어 undefined를 반환합니다.
import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

// 한 번호의 분류 결과:
//   'mobile'     — 휴대폰 (확실)
//   'fixed_line' — 유선 (확실)
//   'unknown'    — 번호는 유효하지만 모바일/유선 구분 불가 (예: 미국/캐나다)
//   'invalid'    — 파싱 실패 / 유효하지 않은 번호
//   null         — 입력값이 비어있음
export function classifyPhone(phoneStr) {
  if (!phoneStr || typeof phoneStr !== 'string') return null;
  try {
    let parsed = parsePhoneNumberFromString(phoneStr);
    // 국가코드 없는 번호는 한국 기본값으로 한 번 더 시도
    if (!parsed) parsed = parsePhoneNumberFromString(phoneStr, 'KR');
    if (!parsed || !parsed.isValid()) return 'invalid';
    const type = parsed.getType();
    if (type === 'MOBILE') return 'mobile';
    if (type === 'FIXED_LINE') return 'fixed_line';
    // VOIP, PERSONAL_NUMBER 등은 유선 취급
    if (type === 'VOIP' || type === 'PERSONAL_NUMBER') return 'fixed_line';
    // FIXED_LINE_OR_MOBILE → 구분 불가 (미국/캐나다 등)
    return 'unknown';
  } catch {
    return 'invalid';
  }
}

// LLM이 분류한 mobile_phone / office_phone 필드를 libphonenumber 결과로 검증 후 자동 교정.
// 명백한 미스매치(필드는 비어있는데 다른 필드에 잘못 들어가 있음 등)만 교정하고,
// LLM 판단이 애매한 경우는 건드리지 않습니다.
export function autoCorrectPhones(data) {
  if (!data || typeof data !== 'object') return data;

  const mobile = data.mobile_phone || null;
  const office = data.office_phone || null;

  const mobileType = classifyPhone(mobile);
  const officeType = classifyPhone(office);

  // Case 1: mobile_phone에 유선번호가 들어있고 office_phone은 비어있음 → office로 이동
  if (mobileType === 'fixed_line' && !office) {
    data.office_phone = mobile;
    data.mobile_phone = null;
    return data;
  }

  // Case 2: office_phone에 모바일이 들어있고 mobile_phone은 비어있음 → mobile로 이동
  if (officeType === 'mobile' && !mobile) {
    data.mobile_phone = office;
    data.office_phone = null;
    return data;
  }

  // Case 3: 두 필드가 서로 뒤바뀐 경우 → swap
  if (mobileType === 'fixed_line' && officeType === 'mobile') {
    data.mobile_phone = office;
    data.office_phone = mobile;
    return data;
  }

  return data;
}
