import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  quickDateOptions,
  normalizeEventName,
  eventKey,
  recentEventNames,
  mergeEventValues,
  isLaterDate,
  buildNoteBody,
  pendingParts,
  hasPending,
  toDateValue,
  summarizeSendResults,
} from './meetingInfo.mjs';

test('toDateValue 는 로컬 날짜를 YYYY-MM-DD 로 만든다', () => {
  assert.equal(toDateValue(new Date(2026, 0, 5)), '2026-01-05');
});
test('quickDateOptions 는 오늘/어제/그제를 순서대로 준다', () => {
  const opts = quickDateOptions(new Date(2026, 9, 1)); // 10월 1일
  assert.deepEqual(opts.map(o => [o.label, o.value]),
    [['오늘', '2026-10-01'], ['어제', '2026-09-30'], ['그제', '2026-09-29']]);
  assert.deepEqual(opts.map(o => o.key), ['today', 'yesterday', 'dayBefore']);
});
test('normalizeEventName 은 공백을 정리하고 ; 를 , 로 바꾼다', () => {
  assert.equal(normalizeEventName('  2026   교육박람회 '), '2026 교육박람회');
  assert.equal(normalizeEventName('A;B'), 'A,B');
  assert.equal(normalizeEventName('   '), null);
  assert.equal(normalizeEventName(undefined), null);
});
test('eventKey 는 영문 대소문자와 공백 차이를 무시한다', () => {
  assert.equal(eventKey('EduTech  Korea'), eventKey('edutech korea'));
});
test('recentEventNames 는 최신순, 중복 제거, null 제외', () => {
  const rows = [
    { event_name: 'EduTech Korea', created_at: '2026-10-20T00:00:00Z' },
    { event_name: null, created_at: '2026-10-25T00:00:00Z' },
    { event_name: '2026 교육박람회', created_at: '2026-10-24T00:00:00Z' },
    { event_name: 'edutech korea', created_at: '2026-10-01T00:00:00Z' },
  ];
  assert.deepEqual(recentEventNames(rows), ['2026 교육박람회', 'EduTech Korea']);
  assert.deepEqual(recentEventNames(rows, 1), ['2026 교육박람회']);
});
test('mergeEventValues 는 기존 행사를 보존하고 새 행사를 추가한다', () => {
  assert.equal(mergeEventValues('2025 교육박람회', '2026 교육박람회'), '2025 교육박람회;2026 교육박람회');
  assert.equal(mergeEventValues('A;B', 'B'), 'A;B');
  assert.equal(mergeEventValues('', 'A'), 'A');
  assert.equal(mergeEventValues(null, 'A'), 'A');
});
test('isLaterDate 는 과거 날짜로 되돌리지 않는다', () => {
  assert.equal(isLaterDate('2026-10-24', '2026-09-01'), false);
  assert.equal(isLaterDate('2026-10-24', '2026-10-24'), false);
  assert.equal(isLaterDate('2026-10-24', '2026-10-25'), true);
  assert.equal(isLaterDate(null, '2026-10-25'), true);
  assert.equal(isLaterDate('1792800000000', '2026-01-01'), false); // HubSpot epoch-ms (2026-10-24)
  assert.equal(isLaterDate('2026-10-24T00:00:00Z', '2026-10-25'), true);
});
test('buildNoteBody 는 내용이 없으면 null', () => {
  assert.equal(buildNoteBody({ met_on: '2026-10-26', event_name: null, shared_memo: ' ', personal_memo: '' }), null);
});
test('buildNoteBody 는 날짜·행사·공통 메모 한 줄, 사람별 메모 다음 줄', () => {
  assert.equal(
    buildNoteBody({ met_on: '2026-10-24', event_name: '2026 교육박람회', shared_memo: '부스 방문', personal_memo: '결정권자' }),
    '2026.10.24 · 2026 교육박람회 · 부스 방문<br>결정권자');
  assert.equal(
    buildNoteBody({ met_on: '2026-10-26', event_name: null, shared_memo: '한빛교육 본사 미팅, 견적 요청', personal_memo: '' }),
    '2026.10.26 · 한빛교육 본사 미팅, 견적 요청');
});
test('buildNoteBody 는 HTML 을 이스케이프하고 메모 줄바꿈을 <br> 로 바꾼다', () => {
  assert.equal(buildNoteBody({ met_on: '2026-10-26', event_name: null, shared_memo: '<b>A&B</b>', personal_memo: '' }),
    '2026.10.26 · &lt;b&gt;A&amp;B&lt;/b&gt;');
  assert.equal(buildNoteBody({ met_on: '2026-10-26', event_name: null, shared_memo: '', personal_memo: 'a\nb' }),
    '2026.10.26<br>a<br>b');
});
test('pendingParts 는 행사 없으면 event 를, 내용 없으면 note 를 요구하지 않는다', () => {
  assert.deepEqual(
    pendingParts({ event_name: null, shared_memo: '', personal_memo: '', hs_event_done: false, hs_date_done: false, hs_note_id: null }),
    { event: false, date: true, note: false });
  assert.deepEqual(
    pendingParts({ event_name: 'A', shared_memo: 'x', personal_memo: '', hs_event_done: true, hs_date_done: true, hs_note_id: '9' }),
    { event: false, date: false, note: false });
});
test('hasPending 은 하나라도 true 면 true', () => {
  assert.equal(hasPending({ event: false, date: false, note: false }), false);
  assert.equal(hasPending({ event: false, date: true, note: false }), true);
});
test('summarizeSendResults 는 성공/부분 성공/실패를 나눈다', () => {
  const s = summarizeSendResults([
    { name: '김민수', ok: true, meetingResults: [{ event: 'done', date: 'done', note: 'done', errors: [] }] },
    { name: '이정호', ok: true, meetingResults: [{ event: 'failed', date: 'done', note: 'done', errors: ['권한 없음'] }] },
    { name: '최유진', ok: false, error: 'HTTP 400', meetingResults: [] },
  ]);
  assert.deepEqual(s.success, ['김민수']);
  assert.deepEqual(s.partial, [{ name: '이정호', errors: ['권한 없음'] }]);
  assert.deepEqual(s.failed, [{ name: '최유진', error: 'HTTP 400' }]);
});
