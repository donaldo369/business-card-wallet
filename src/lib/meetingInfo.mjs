// 명함을 "언제, 어디서 만났는지" 기록하는 만난 정보 처리용 순수 로직.
// 날짜 빠른 선택, 행사명 정리/중복 제거, HubSpot 다중 체크 값 병합, 메모 HTML 생성,
// 파트별 미완료 판단만 한다. 네트워크/DB 호출은 호출하는 쪽이 담당 (테스트 가능하게 분리).

const pad = n => String(n).padStart(2, '0');

/** 로컬 날짜 기준 'YYYY-MM-DD' */
export function toDateValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 오늘/어제/그제 빠른 선택 옵션 */
export function quickDateOptions(today) {
  const defs = [
    ['today', '오늘', 0],
    ['yesterday', '어제', 1],
    ['dayBefore', '그제', 2],
  ];
  return defs.map(([key, label, back]) => ({
    key,
    label,
    value: toDateValue(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)),
  }));
}

/** 행사명 정리: trim, 연속 공백 1칸, ';' -> ','. 비면 null */
export function normalizeEventName(raw) {
  if (raw == null) return null;
  const s = String(raw).replace(/;/g, ',').replace(/\s+/g, ' ').trim();
  return s === '' ? null : s;
}

/** 같은 행사 비교용 키 */
export function eventKey(name) {
  return (normalizeEventName(name) ?? '').toLowerCase();
}

/** 최근 행사명 목록 (최신순, eventKey 기준 중복 제거, 가장 최근 표기 유지) */
export function recentEventNames(rows, limit = 8) {
  const sorted = [...rows].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
  const seen = new Set();
  const result = [];
  for (const row of sorted) {
    const name = normalizeEventName(row.event_name);
    if (!name) continue;
    const key = eventKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
    if (result.length >= limit) break;
  }
  return result;
}

/** HubSpot 다중 체크 값(';' 구분)에 행사 추가. 이미 있으면 그대로 */
export function mergeEventValues(current, add) {
  const list = current ? String(current).split(';').filter(Boolean) : [];
  if (list.includes(add)) return list.join(';');
  return [...list, add].join(';');
}

// HubSpot 이 돌려주는 값(YYYY-MM-DD, ISO, epoch-ms 문자열)을 'YYYY-MM-DD' 로
function toComparableDate(value) {
  const s = String(value).trim();
  if (/^\d+$/.test(s)) return new Date(Number(s)).toISOString().slice(0, 10);
  return s.slice(0, 10);
}

/** current 가 없거나 candidate 가 더 늦으면 true (과거로 되돌리지 않기 위함) */
export function isLaterDate(current, candidate) {
  if (!current) return true;
  return candidate > toComparableDate(current);
}

const escapeHtml = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const toHtmlText = s => escapeHtml(s).replace(/\r\n|\r|\n/g, '<br>');

/** HubSpot 노트 HTML. 행사명·공통 메모·사람별 메모가 모두 비면 null */
export function buildNoteBody({ met_on, event_name, shared_memo, personal_memo }) {
  const event = normalizeEventName(event_name);
  const shared = (shared_memo ?? '').trim();
  const personal = (personal_memo ?? '').trim();
  if (!event && !shared && !personal) return null;

  const firstLine = [met_on.replaceAll('-', '.'), event && escapeHtml(event), shared && toHtmlText(shared)]
    .filter(Boolean)
    .join(' · ');
  return personal ? `${firstLine}<br>${toHtmlText(personal)}` : firstLine;
}

/** HubSpot 으로 아직 보내지 못한 파트 */
export function pendingParts(meeting) {
  return {
    event: Boolean(normalizeEventName(meeting.event_name)) && !meeting.hs_event_done,
    date: !meeting.hs_date_done,
    note: buildNoteBody({ met_on: '', ...meeting }) !== null && !meeting.hs_note_id,
  };
}

export function hasPending(parts) {
  return parts.event || parts.date || parts.note;
}
