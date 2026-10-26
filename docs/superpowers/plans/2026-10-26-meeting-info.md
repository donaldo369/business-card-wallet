# 만난 정보 기록 + HubSpot 일괄 전송 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스캔한 명함 묶음에 만난 날짜·행사명·공통 메모·사람별 메모를 붙여 저장하고, 명함별 스위치에 따라 HubSpot에 연락처·참석 행사·최근 만난 날짜·노트를 한 번에 보낸다.

**Architecture:** 만남 기록은 새 테이블 `card_meetings`(명함 1 : 만남 N)에 저장하고, HubSpot 반영 여부를 항목별(행사/날짜/노트)로 기록한다. 문자열·날짜 규칙은 순수 모듈 `src/lib/meetingInfo.mjs`, HubSpot 네트워크 호출은 `fetch`를 주입받는 `src/lib/hubspotMeetingSync.mjs`에 두어 `node --test`로 검증한다. 화면은 공용 컴포넌트 `MeetingInfoBox`를 한 장 편집 폼과 일괄 결과 화면에서 같이 쓰고, 일괄 전송은 브라우저에서 명함마다 `/api/hubspot`을 **순차** 호출한다(HubSpot 호출 제한과 행사 항목 추가 경합을 피하기 위해).

**Tech Stack:** Next.js 16.4 App Router (JavaScript, `'use client'` 컴포넌트), Supabase JS v2 (RLS), HubSpot CRM v3 API (비공개 앱 토큰), `node:test`

**Spec:** `docs/superpowers/specs/2026-10-26-meeting-info-design.md`

## Global Constraints

- 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 관련 문서(App Router의 Route Handlers)를 확인한다 (`AGENTS.md`).
- 작업 트리에 이 기능과 무관한 미커밋 변경이 있다: `src/lib/hubspotSubscriptions.mjs`, `src/lib/hubspotSubscriptions.test.mjs`, `scripts/backfill-hubspot-subscriptions.mjs`. **이 파일들은 수정·커밋하지 않는다.** 커밋은 항상 파일을 이름으로 지정해 `git add` 한다 (`git add -A`, `git add .` 금지).
- 화면 문구는 한국어, 기존 스타일(글래스 패널, 보라 계열 `#6366f1`/`#8b5cf6`, `premium-input`, `btn btn-primary`/`btn-secondary`)을 따른다.
- 기존 `/api/hubspot` 동작(연락처 생성/갱신, "이미 존재" 시 PATCH 전환, 이메일이 있으면 세 가지 구독 켜기)은 그대로 유지한다. 연락처 저장이 성공해야 나머지(구독, 행사, 날짜, 노트)를 진행하고, 부가 작업이 실패해도 연락처 저장은 되돌리지 않는다.
- "HubSpot에도 보내기" 스위치 기본값은 **켜짐**. HubSpot 토큰이 없으면 스위치를 숨기고 저장만 한다.
- HubSpot 연락처 칸: 내부 이름 `met_events`(라벨 "참석 행사", enumeration / checkbox), `last_met_date`(라벨 "최근 만난 날짜", date). 둘 다 `groupName: 'contactinformation'`.
- 같은 사람이 여러 행사에 오면 `met_events`에 **추가만** 한다(기존 값 보존). `last_met_date`는 더 최근일 때만 갱신.
- 행사명과 메모가 모두 비어 있으면 노트를 만들지 않는다. 날짜만 있는 만남 기록은 앱에 저장하고 `last_met_date`는 갱신한다.
- 기존 명함 **수정** 화면에는 만난 정보 박스를 넣지 않는다. 일괄 결과에서 명함 하나를 눌러 고치면 저장하지 않고 목록으로 돌아간다.
- 기존 그룹 기능은 건드리지 않는다.

## Review Focus

1. 같은 행사를 앞뒤 공백·연속 공백·영문 대소문자만 다르게 입력 → HubSpot에 새 항목을 만들지 않고 기존 항목에 체크돼야 한다. (Task 2 `normalizeEventName`, Task 3 `ensureEventOption` 테스트)
2. 행사명에 `;`가 들어간 경우 → HubSpot 다중 체크 값 구분자라 값이 쪼개지면 안 된다. `,`로 바꿔 저장한다. (Task 2 테스트)
3. 이미 HubSpot에 다른 행사가 체크된 사람을 다시 등록 → 기존 행사가 사라지지 않고 새 행사가 추가돼야 한다. (Task 2 `mergeEventValues`, Task 3 `syncMeetingParts` 테스트)
4. 예전 명함을 늦게 스캔해 만난 날짜가 HubSpot의 최근 만난 날짜보다 과거 → 날짜가 뒤로 가면 안 된다. (Task 2 `isLaterDate`, Task 3 테스트)
5. 토큰에 칸 설정/노트 권한이 없어 403, 또는 수십 장 전송 중 429(호출 제한) → 연락처는 저장되고 해당 항목만 실패로 기록되며, 403은 추가할 권한을 알려 주는 문구가 나와야 한다. 429는 `Retry-After`를 지켜 최대 2회 재시도한다. (Task 3 테스트)

---

### Task 1: `card_meetings` 테이블

**Files:**
- Modify: `supabase_setup.sql` (섹션 3 뒤, Storage 섹션 앞에 새 섹션 추가)

**Interfaces:**
- Produces: 테이블 `public.card_meetings`
  - `id UUID PK default gen_random_uuid()`
  - `card_id UUID NOT NULL REFERENCES business_cards(id) ON DELETE CASCADE`
  - `user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
  - `met_on DATE NOT NULL`
  - `event_name TEXT` (null 허용)
  - `shared_memo TEXT`, `personal_memo TEXT`
  - `hs_event_done BOOLEAN NOT NULL DEFAULT false`, `hs_date_done BOOLEAN NOT NULL DEFAULT false`, `hs_note_id TEXT`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())`
  - 인덱스: `(card_id)`, `(user_id, created_at DESC)`
  - RLS: 기존 테이블과 같은 4개 정책(SELECT/INSERT/UPDATE/DELETE, `auth.uid() = user_id`)

- [ ] **Step 1:** 위 정의대로 `CREATE TABLE IF NOT EXISTS`, 인덱스, `ENABLE ROW LEVEL SECURITY`, `DROP POLICY IF EXISTS` + `CREATE POLICY` 4개를 기존 섹션과 같은 형식·주석 스타일로 추가한다. 파일은 여러 번 실행해도 안전해야 한다.
- [ ] **Step 2:** 사용자에게 Supabase SQL Editor에서 **새 섹션만** 실행해 달라고 요청한다(파일 전체를 다시 실행해도 안전함). 실행 확인 후 `select count(*) from card_meetings;`가 0을 반환하는지 확인받는다. 이 단계는 사람의 조치가 필요하므로 완료될 때까지 Task 6 이후의 수동 확인은 미룬다.
- [ ] **Step 3: Commit**

```bash
git add supabase_setup.sql
git commit -m "Feature: Add card_meetings table for meeting date, event and memo"
```

---

### Task 2: 만난 정보 순수 로직 `meetingInfo.mjs`

**Files:**
- Create: `src/lib/meetingInfo.mjs`
- Test: `src/lib/meetingInfo.test.mjs`

**Interfaces:**
- Produces:
  - `toDateValue(date: Date) -> 'YYYY-MM-DD'` (로컬 날짜 기준)
  - `quickDateOptions(today: Date) -> Array<{ key: 'today'|'yesterday'|'dayBefore', label: '오늘'|'어제'|'그제', value: 'YYYY-MM-DD' }>`
  - `normalizeEventName(raw: string|null|undefined) -> string|null` — trim, 연속 공백 1칸, `;` → `,`, 빈 문자열이면 `null`
  - `eventKey(name: string) -> string` — `normalizeEventName` 후 소문자. 같은 행사 비교용
  - `recentEventNames(rows: Array<{event_name: string|null, created_at: string}>, limit = 8) -> string[]` — `created_at` 최신순, `eventKey` 기준 중복 제거(가장 최근 표기 유지), null 제외
  - `mergeEventValues(current: string|null|undefined, add: string) -> string` — HubSpot 다중 체크 값(`;` 구분)에 `add`를 추가. 이미 있으면(정확히 같은 값) 그대로 반환
  - `isLaterDate(current: string|null|undefined, candidate: 'YYYY-MM-DD') -> boolean` — `current`가 없거나 `candidate`가 더 늦으면 true. `current`는 `'YYYY-MM-DD'` 또는 HubSpot이 돌려주는 ISO/epoch-ms 문자열일 수 있다
  - `buildNoteBody(meeting: {met_on, event_name, shared_memo, personal_memo}) -> string|null` — 행사명·공통 메모·사람별 메모가 모두 비면 `null`. 아니면 HTML 문자열: 첫 줄 `YYYY.MM.DD` + 있는 것만 ` · `로 이어 붙인 행사명·공통 메모, 둘째 줄 사람별 메모, 줄 사이 `<br>`, 각 텍스트는 HTML 이스케이프, 메모 안 줄바꿈도 `<br>`
  - `pendingParts(meeting: {event_name, shared_memo, personal_memo, hs_event_done, hs_date_done, hs_note_id}) -> { event: boolean, date: boolean, note: boolean }` — event: 행사명 있고 미완료, date: 미완료, note: `buildNoteBody`가 null이 아니고 `hs_note_id` 없음
  - `hasPending(parts) -> boolean`

- [ ] **Step 1: Write the failing tests** (`src/lib/meetingInfo.test.mjs`, 기존 `hubspotSubscriptions.test.mjs`처럼 `node:test` + `assert/strict`, 테스트 이름은 한국어)

```js
test('quickDateOptions 는 오늘/어제/그제를 순서대로 준다', () => {
  const opts = quickDateOptions(new Date(2026, 9, 1)); // 10월 1일
  assert.deepEqual(opts.map(o => [o.label, o.value]),
    [['오늘', '2026-10-01'], ['어제', '2026-09-30'], ['그제', '2026-09-29']]);
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
test('buildNoteBody 는 HTML 을 이스케이프한다', () => {
  assert.equal(buildNoteBody({ met_on: '2026-10-26', event_name: null, shared_memo: '<b>A&B</b>', personal_memo: '' }),
    '2026.10.26 · &lt;b&gt;A&amp;B&lt;/b&gt;');
});
test('pendingParts 는 행사 없으면 event 를, 내용 없으면 note 를 요구하지 않는다', () => {
  assert.deepEqual(
    pendingParts({ event_name: null, shared_memo: '', personal_memo: '', hs_event_done: false, hs_date_done: false, hs_note_id: null }),
    { event: false, date: true, note: false });
  assert.deepEqual(
    pendingParts({ event_name: 'A', shared_memo: 'x', personal_memo: '', hs_event_done: true, hs_date_done: true, hs_note_id: '9' }),
    { event: false, date: false, note: false });
});
```

- [ ] **Step 2: Run** `node --test src/lib/meetingInfo.test.mjs` — Expected: FAIL (module not found)
- [ ] **Step 3: Implement** the functions above in `src/lib/meetingInfo.mjs` with a file header comment in the style of `hubspotSubscriptions.mjs`. `isLaterDate`: 순수 숫자 문자열은 epoch-ms로 보고 UTC 날짜 `YYYY-MM-DD`로 바꾼 뒤, 그 밖은 앞 10자를 날짜로 보고 문자열 비교한다.
- [ ] **Step 4: Run** `npm test` — Expected: 모든 테스트 PASS (기존 17개 포함)
- [ ] **Step 5: Commit**

```bash
git add src/lib/meetingInfo.mjs src/lib/meetingInfo.test.mjs
git commit -m "Feature: Pure helpers for meeting dates, event names and HubSpot note text"
```

---

### Task 3: HubSpot 만남 반영 모듈 `hubspotMeetingSync.mjs`

**Files:**
- Create: `src/lib/hubspotMeetingSync.mjs`
- Test: `src/lib/hubspotMeetingSync.test.mjs`

**Interfaces:**
- Consumes: Task 2의 `normalizeEventName`, `eventKey`, `mergeEventValues`, `isLaterDate`, `buildNoteBody`
- Produces:
  - `EVENT_PROPERTY = 'met_events'`, `DATE_PROPERTY = 'last_met_date'`
  - `hubspotFetch(fetchFn, token, url, init?) -> Promise<{ ok, status, body }>` — `Authorization: Bearer`, JSON. 429면 `Retry-After`(초, 없으면 1) 만큼 기다렸다가 최대 2회 재시도. 대기 함수는 테스트에서 바꿀 수 있게 `init.sleep` 또는 모듈 옵션으로 주입한다.
  - `ensureEventOption(ctx, eventName) -> Promise<{ value: string } | { error: string }>` — `ctx = { fetchFn, token, sleep? }`. `GET /crm/v3/properties/contacts/met_events`; 404면 `POST /crm/v3/properties/contacts`로 칸 생성(라벨 "참석 행사", `type:'enumeration'`, `fieldType:'checkbox'`, 옵션 1개); 있으면 기존 옵션 중 `eventKey(label)`가 같은 것의 `value`를 반환; 없으면 `PATCH /crm/v3/properties/contacts/met_events`에 **기존 옵션 전체 + 새 옵션**을 보낸다(PATCH는 옵션 목록을 통째로 교체하므로). 새 옵션은 `label = value = normalizeEventName(eventName)`, `displayOrder`는 기존 개수.
  - `ensureDateProperty(ctx) -> Promise<{ ok: true } | { error: string }>` — `GET .../last_met_date`, 404면 `type:'date'`, `fieldType:'date'`, 라벨 "최근 만난 날짜"로 생성
  - `syncMeetingParts(ctx, contactId, meetings) -> Promise<Array<{ id, event: 'done'|'skipped'|'failed', date: 'done'|'skipped'|'failed', note_id: string|null, note: 'done'|'skipped'|'failed', errors: string[] }>>`
    - `meetings`: `Array<{ id, met_on, event_name, shared_memo, personal_memo, pending: { event, date, note } }>`
    - 연락처의 현재 `met_events`, `last_met_date`를 한 번 `GET /crm/v3/objects/contacts/{id}?properties=met_events,last_met_date`로 읽는다.
    - pending.event인 만남마다 `ensureEventOption` 후 값을 `mergeEventValues`로 누적; pending.date인 것 중 가장 늦은 `met_on`이 `isLaterDate(현재값, 그 날짜)`면 갱신 대상. 둘을 **PATCH 한 번**으로 보낸다. 날짜가 과거라 갱신할 필요가 없으면 date는 `'done'`(반영할 것이 없으므로 완료로 기록).
    - pending.note인 만남마다 `POST /crm/v3/objects/notes` — `properties: { hs_note_body: buildNoteBody(m), hs_timestamp: '<met_on>T12:00:00+09:00' }`, `associations: [{ to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }]`. 성공하면 응답 `id`를 `note_id`로.
    - 항목별 실패는 그 항목만 `'failed'`로 두고 `errors`에 사람이 읽을 문구를 넣는다. 403이면 `describeScopeError(kind)`가 필요한 권한을 안내한다.
  - `describeScopeError(kind: 'schema'|'note') -> string` — 예: `'HubSpot 토큰에 연락처 속성 설정 권한이 없습니다. 비공개 앱 설정에서 crm.schemas.contacts.write 스코프를 추가하고 토큰을 다시 발급해 주세요.'`. **구현 전에 HubSpot 공식 문서에서 속성 생성/수정과 노트 생성에 필요한 스코프 이름을 확인해 문구에 정확히 넣는다.**

- [ ] **Step 1: Write the failing tests** with a fake `fetchFn` that records calls and returns scripted responses (`{ status, body, headers }`), and `sleep` stub that records waits.

```js
test('기존 옵션과 대소문자·공백만 다른 행사명은 새 옵션을 만들지 않는다', async () => {
  // GET property → options [{label:'EduTech Korea', value:'EduTech Korea'}]
  const r = await ensureEventOption(ctx, '  edutech   korea ');
  assert.deepEqual(r, { value: 'EduTech Korea' });
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 0);
});
test('새 행사명은 기존 옵션을 모두 포함해 PATCH 한다', async () => {
  // GET → options [A]
  await ensureEventOption(ctx, 'B');
  const patch = calls.find(c => c.method === 'PATCH');
  assert.deepEqual(patch.body.options.map(o => o.value), ['A', 'B']);
});
test('칸이 없으면(404) 체크박스 칸을 만든다', async () => {
  // GET → 404, POST → 201
  await ensureEventOption(ctx, 'A');
  const post = calls.find(c => c.method === 'POST');
  assert.equal(post.body.name, 'met_events');
  assert.equal(post.body.fieldType, 'checkbox');
});
test('기존 참석 행사를 보존하고 새 행사를 추가한다', async () => {
  // contact GET → met_events 'A', last_met_date '2026-09-01'
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ event_name: 'B', met_on: '2026-10-24' })]);
  const contactPatch = calls.find(c => c.method === 'PATCH' && c.url.includes('/objects/contacts/1'));
  assert.equal(contactPatch.body.properties.met_events, 'A;B');
  assert.equal(contactPatch.body.properties.last_met_date, '2026-10-24');
  assert.equal(r.event, 'done');
});
test('만난 날짜가 기존보다 과거면 최근 만난 날짜를 바꾸지 않는다', async () => {
  // contact GET → last_met_date '2026-10-24'; meeting met_on '2026-09-01', event_name null
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ event_name: null, met_on: '2026-09-01' })]);
  assert.equal(calls.some(c => c.method === 'PATCH' && c.url.includes('/objects/contacts/')), false);
  assert.equal(r.date, 'done');
});
test('노트는 연락처에 연결해 만들고 note_id 를 돌려준다', async () => {
  // notes POST → { id: '777' }
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ shared_memo: '견적 요청' })]);
  const notePost = calls.find(c => c.url.endsWith('/crm/v3/objects/notes'));
  assert.equal(notePost.body.associations[0].types[0].associationTypeId, 202);
  assert.equal(r.note_id, '777');
});
test('속성 권한 403 이면 행사만 실패하고 노트는 진행한다', async () => {
  // property GET → 403; notes POST → 201
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ event_name: 'A', shared_memo: 'x' })]);
  assert.equal(r.event, 'failed');
  assert.equal(r.note, 'done');
  assert.match(r.errors[0], /스코프/);
});
test('429 는 Retry-After 만큼 기다렸다가 재시도한다', async () => {
  // first call 429 Retry-After: 2, second 200
  const res = await hubspotFetch(fetchFn, 'tok', 'https://api.hubapi.com/x', { sleep });
  assert.equal(res.ok, true);
  assert.deepEqual(waits, [2000]);
});
```

(`ctx`, `calls`, `meeting()` 기본값 `{ id:'m1', met_on:'2026-10-26', event_name:null, shared_memo:'', personal_memo:'', pending: pendingParts(...) }`는 테스트 파일 안의 작은 헬퍼로 만든다.)

- [ ] **Step 2: Run** `node --test src/lib/hubspotMeetingSync.test.mjs` — Expected: FAIL (module not found)
- [ ] **Step 3: Implement** `src/lib/hubspotMeetingSync.mjs` per the Interfaces block. 같은 호출 안에서 `ensureEventOption`이 읽은 속성 정의는 재사용해도 된다(묶음의 만남들이 같은 행사인 경우가 대부분).
- [ ] **Step 4: Run** `npm test` — Expected: 모든 테스트 PASS
- [ ] **Step 5: Commit**

```bash
git add src/lib/hubspotMeetingSync.mjs src/lib/hubspotMeetingSync.test.mjs
git commit -m "Feature: Sync meeting event, date and note to HubSpot contacts"
```

---

### Task 4: `/api/hubspot` 라우트 확장

**Files:**
- Modify: `src/app/api/hubspot/route.js`

**Interfaces:**
- Consumes: Task 3의 `syncMeetingParts`
- Produces:
  - `GET /api/hubspot` → `{ configured: boolean }` — 서버 환경 변수 `HUBSPOT_ACCESS_TOKEN` 또는 요청 헤더 `x-hubspot-token`(값이 `'undefined'`/`'null'`이면 무시)이 있으면 true. 토큰 값은 응답하지 않는다.
  - `POST /api/hubspot` 요청 본문에 선택 필드 `meetings` (Task 3의 `meetings` 형식) 추가. 응답에 `meetings: <syncMeetingParts 결과>` 추가. `meetings`가 없거나 비면 이 필드는 `[]`.
  - 연락처 저장이 성공한 두 경로(정상 생성/수정, "이미 존재" 후 PATCH 성공) 모두에서 구독 처리 다음에 `syncMeetingParts(ctx, contactId, meetings)`를 실행한다. 연락처 저장 실패 시에는 실행하지 않는다.

- [ ] **Step 1:** `node_modules/next/dist/docs/01-app/` 아래 Route Handlers 문서를 읽고 같은 파일에서 `GET`과 `POST`를 함께 내보내는 방식과 캐시 동작(GET이 정적으로 캐시되지 않게 하는 방법)을 확인한다.
- [ ] **Step 2:** 토큰 해석 로직을 `resolveToken(req)` 함수로 빼서 GET/POST가 같이 쓰게 하고, 위 Interfaces대로 구현한다. `syncMeetingParts`가 예외를 던져도 연락처 성공 응답은 유지하고 `meetings`에 각 만남을 `failed`로 채운다.
- [ ] **Step 3: Verify** `npm run build` — Expected: 성공, 라우트 목록에 `ƒ /api/hubspot`. `npm run dev` 상태에서 `curl -s localhost:3000/api/hubspot` — Expected: `{"configured":true}` 또는 `false` (토큰 값 노출 없음)
- [ ] **Step 4: Commit**

```bash
git add src/app/api/hubspot/route.js
git commit -m "Feature: Accept meetings in HubSpot sync route and report token status"
```

---

### Task 5: `MeetingInfoBox` 컴포넌트

**Files:**
- Create: `src/components/MeetingInfoBox.js`
- Modify: `src/app/globals.css` (필요한 클래스만 추가)

**Interfaces:**
- Consumes: Task 2의 `quickDateOptions`, `normalizeEventName`
- Produces: `<MeetingInfoBox value onChange recentEvents showSendSwitch memoLabel countLabel />`
  - `value: { met_on: 'YYYY-MM-DD', event_name: string, memo: string, send: boolean }`
  - `onChange(patch)` — 바뀐 필드만 넘긴다 (`CardEditForm`의 `onChange` 패턴과 같음)
  - `recentEvents: string[]` — 행사명 입력 아래 칩으로 표시, 누르면 `event_name`에 그대로 넣는다. 입력값이 있으면 그 글자를 포함하는 것만 보인다.
  - `showSendSwitch: boolean` — false면 "HubSpot에도 보내기" 스위치를 숨긴다
  - `memoLabel: string` — 한 장: `'메모 (선택)'`, 일괄: `'공통 메모 (선택)'`
  - `countLabel?: string` — 일괄일 때 제목 옆 `'· 3명 모두'`
- 화면 구성(스펙 목업 그대로): 제목 "🤝 만난 정보", 날짜 칩 `오늘 / 어제 / 그제 / 📅 날짜 선택`(마지막은 `<input type="date">`를 연다. 선택한 날짜가 세 칩에 해당하지 않으면 📅 칩에 그 날짜를 표시하고 활성화), "행사명 (선택)" 입력 + 추천 칩, 메모 `<textarea rows=2>`, 스위치 "HubSpot에도 보내기". 모든 입력에 `label`/`htmlFor` 연결(`useId`).

- [ ] **Step 1:** 컴포넌트를 구현한다. 입력 저장 시 정규화는 호출자가 하므로 여기서는 원문을 유지한다.
- [ ] **Step 2: Verify** `npm run lint` — Expected: 새 파일에서 오류 0 (기존 오류 4건/경고 1건은 그대로)
- [ ] **Step 3: Commit**

```bash
git add src/components/MeetingInfoBox.js src/app/globals.css
git commit -m "Feature: MeetingInfoBox for meeting date, event and memo input"
```

---

### Task 6: 한 장 저장 흐름 + 공용 저장/전송 함수

**Files:**
- Modify: `src/app/page.js` (상태, `extractCardInfo`, `extractCardFromText`, `handleSelectBatchResult`, `handleSaveCard`, `syncToHubSpot`, `CardEditForm` 사용부)
- Modify: `src/components/CardEditForm.js`

**Interfaces:**
- Consumes: Task 1 테이블, Task 2 `toDateValue`/`normalizeEventName`/`recentEventNames`/`pendingParts`/`hasPending`, Task 4 API, Task 5 컴포넌트
- Produces (page.js 안의 함수, Task 7·8이 사용):
  - 상태 `hubspotConfigured: boolean` — 로그인 후 `GET /api/hubspot`(설정의 토큰 헤더 포함)으로 채운다. 설정 저장 후 다시 조회.
  - 상태 `recentEvents: string[]` + `loadRecentEvents()` — `card_meetings`에서 `event_name, created_at`를 `event_name is not null`, `created_at desc`, 최대 200행 읽어 `recentEventNames`로 만든다. 로그인 후와 만남 저장 후 호출.
  - `saveCardRecord(cardData, { allowMerge: true }) -> Promise<{ id: string, hubspot_id: string|null, merged: boolean }>` — 기존 새 스캔 저장 로직(중복이면 history 누적 후 update, 아니면 insert)을 함수로 뽑고, insert는 `.select('id, hubspot_id').single()`로 id를 받는다. `handleSaveCard`의 신규 분기와 `handleSaveBatchAll`이 같이 쓴다.
  - `insertMeeting(cardId, { met_on, event_name, shared_memo, personal_memo }) -> Promise<MeetingRow>` — `event_name`은 `normalizeEventName` 적용, 빈 메모는 null
  - `sendCardToHubSpot(card, meetings: MeetingRow[]) -> Promise<{ ok: boolean, hubspot_id?: string, result?: object, error?: string, meetingResults: [] }>` — 토스트 없이 `/api/hubspot` 호출, `meetings`는 `hasPending(pendingParts(m))`인 것만 `pending`과 함께 보낸다. 성공 시 `business_cards.hubspot_id` 저장, 응답의 만남 결과로 `card_meetings`의 `hs_event_done`/`hs_date_done`/`hs_note_id`를 갱신(`'done'`인 항목만).
  - 기존 `syncToHubSpot(card)`는 그 카드의 `card_meetings`를 읽어 `sendCardToHubSpot`을 호출하고 기존 토스트를 그대로 띄운다. 만남 항목 중 실패가 있으면 `toast.error`로 "HubSpot 일부 반영 실패: <errors>"를 추가로 띄운다.
- `CardEditForm` 새 props: `meeting`, `onMeetingChange`, `recentEvents`, `showMeeting: boolean`, `showSendSwitch: boolean`, `submitLabel: string`.

- [ ] **Step 1:** 새 스캔으로 편집 폼을 열 때(`extractCardInfo`, `extractCardFromText`) 상태 `editingMeeting = { met_on: toDateValue(new Date()), event_name: '', memo: '', send: true }`를 초기화한다.
- [ ] **Step 2:** `CardEditForm`에서 `showMeeting`이면 사진 영역과 입력 칸 사이(이름 칸보다 위, 폼 전체 폭)에 `MeetingInfoBox`를 렌더한다. page.js는 `showMeeting = !editingCard.id && typeof editingCard._batchIndex !== 'number'`, `showSendSwitch = hubspotConfigured`, `submitLabel = showMeeting && hubspotConfigured && editingMeeting.send ? '저장 + HubSpot 전송' : '명함 지갑에 보관'`로 넘긴다.
- [ ] **Step 3:** 일괄 카드 편집: `handleSaveCard`에서 `_batchIndex`가 숫자면 저장하지 않고 `batchResults[_batchIndex]`를 편집 내용으로 교체한 뒤(`_status: 'success'` 유지, 그 행의 사람별 메모·스위치 값 유지) 폼을 닫는다. 기존의 "저장 후 목록에서 제거" 코드는 지운다. 이 경우 제출 버튼 문구는 `'목록에 반영'`.
- [ ] **Step 4:** 신규 한 장 저장: `saveCardRecord` → `insertMeeting(cardId, { met_on, event_name, shared_memo: memo, personal_memo: null })` → `send && hubspotConfigured`면 `syncToHubSpot({ ...cardData, id, hubspot_id })`. 저장 성공 토스트는 기존 문구 유지. 기존 명함 수정 분기는 바꾸지 않는다.
- [ ] **Step 5: Verify** `npm test`, `npm run lint`(새 오류 0), `npm run build` 성공. `npm run dev`로 텍스트 입력 경로를 통해 한 장 저장: 만난 정보 박스가 이름 위에 보이고, 날짜 칩 "어제" 선택·메모 입력 후 저장하면 Supabase `card_meetings`에 `met_on`이 어제 날짜로 1행 생긴다. HubSpot 토큰이 있으면 연락처에 "참석 행사"/"최근 만난 날짜"/노트가 생긴다(테스트용 이메일 사용 후 HubSpot에서 삭제).
- [ ] **Step 6: Commit**

```bash
git add src/app/page.js src/components/CardEditForm.js
git commit -m "Feature: Record meeting info when saving a single scanned card"
```

---

### Task 7: 일괄 결과 화면 + 일괄 저장·전송

**Files:**
- Modify: `src/components/BatchResults.js`
- Modify: `src/app/page.js` (`handleBatchProcess` 결과 초기값, `handleSaveBatchAll`, `BatchResults` 사용부, 진행 표시)
- Modify: `src/lib/meetingInfo.mjs`, `src/lib/meetingInfo.test.mjs` (요약 함수 추가)

**Interfaces:**
- Consumes: Task 5 `MeetingInfoBox`, Task 6 `saveCardRecord`/`insertMeeting`/`sendCardToHubSpot`/`recentEvents`/`hubspotConfigured`
- Produces:
  - 일괄 결과 행에 `personal_memo: ''`, `send: true` 필드 (성공 행만)
  - 상태 `batchMeeting = { met_on: 오늘, event_name: '', memo: '', send: true }` — 일괄 스캔 결과가 나올 때 초기화
  - `BatchResults` 새 props: `meeting`, `onMeetingChange`, `recentEvents`, `showSendSwitch`, `onRowChange(index, patch)`, `sendProgress: { current, total } | null`
  - `summarizeSendResults(results: Array<{ name, ok, error?, meetingResults }>) -> { success: string[], partial: Array<{ name, errors: string[] }>, failed: Array<{ name, error }> }` in `meetingInfo.mjs` — 연락처 실패면 failed, 연락처 성공이지만 만남 항목 중 `'failed'`가 있으면 partial

- [ ] **Step 1: Write the failing test** for `summarizeSendResults`:

```js
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
```

- [ ] **Step 2: Run** `node --test src/lib/meetingInfo.test.mjs` — Expected: FAIL; implement; run again — Expected: PASS
- [ ] **Step 3:** `BatchResults`: 목록 위에 `MeetingInfoBox`(`memoLabel='공통 메모 (선택)'`, `countLabel='· N명 모두'`). 위쪽 스위치를 바꾸면 모든 성공 행의 `send`를 같은 값으로 바꾼다. 각 성공 행 아래에 사람별 메모 입력(항상 표시, placeholder `'이 분에 대한 메모…'`)과, `showSendSwitch`일 때 행 오른쪽에 HubSpot 체크(라벨 "HubSpot"). 메모 입력·체크를 누를 때 행의 편집 열기(`onSelect`)가 실행되지 않게 이벤트 전파를 막는다. 행 클릭으로 편집을 여는 동작은 이미지·이름 영역에만 둔다.
- [ ] **Step 4:** 하단 버튼 문구: 보낼 행 수 `M = showSendSwitch ? 성공 행 중 send 수 : 0`, `M > 0`이면 `'N장 저장 + M장 HubSpot 전송'`, 아니면 `'N장 저장'`. 전송 중이면 `'HubSpot 전송 중 (current/total)'`로 바꾸고 비활성화.
- [ ] **Step 5:** `handleSaveBatchAll`: 성공 행마다 이미지 업로드 → `saveCardRecord` → `insertMeeting(cardId, { met_on, event_name, shared_memo: batchMeeting.memo, personal_memo: row.personal_memo })`. 모두 저장한 뒤 `send`인 행만 **한 장씩 순서대로** `sendCardToHubSpot` 호출하며 `sendProgress`를 갱신한다. 끝나면 `summarizeSendResults`로 토스트: 성공은 `toast.success('HubSpot 전송: 성공 N건')`, 부분 성공/실패가 있으면 이름과 이유를 담아 `toast.error`. 기존 "처리 완료: N장 새로 추가, M장 업데이트" 토스트는 유지. 마지막에 `loadCards()`, `loadRecentEvents()`, 결과 목록 비우기.
- [ ] **Step 6: Verify** `npm test`, `npm run lint`(새 오류 0), `npm run build`. 데스크톱 `npm run dev`에서 이미지 3장을 한 번에 골라 일괄 스캔 → 위쪽에 만난 정보 박스, 행마다 메모 칸과 HubSpot 체크가 보인다. 한 행을 눌러 이름을 고치면 저장되지 않고 목록으로 돌아오며 고친 이름이 보인다. 한 행의 HubSpot 체크를 끄고 저장하면 버튼이 "3장 저장 + 2장 HubSpot 전송"이었고, `card_meetings`에 3행, HubSpot에는 2명만 생긴다.
- [ ] **Step 7: Commit**

```bash
git add src/components/BatchResults.js src/app/page.js src/lib/meetingInfo.mjs src/lib/meetingInfo.test.mjs
git commit -m "Feature: Shared meeting info, per-person memo and bulk HubSpot send for batch scans"
```

---

### Task 8: 명함 상세의 만남 기록 + 재전송

**Files:**
- Create: `src/components/MeetingHistory.js`
- Modify: `src/components/CardDetail.js`, `src/app/page.js`

**Interfaces:**
- Consumes: Task 6 `syncToHubSpot`(만남 포함 전송), Task 2 `pendingParts`/`hasPending`
- Produces:
  - 상태 `viewingMeetings: MeetingRow[]` — `viewingCard`가 바뀌면 `card_meetings`에서 `card_id = viewingCard.id`, `met_on desc, created_at desc`로 읽는다. `syncToHubSpot` 완료 후 다시 읽는다.
  - `<MeetingHistory meetings showHubSpotStatus />` — 행마다 `YYYY.MM.DD`, 행사명(있으면 보라 칩), 공통 메모, 사람별 메모. `showHubSpotStatus`이고 카드에 `hubspot_id`가 있으면 `hasPending(pendingParts(m))`인 행에 "HubSpot 미반영" 표시.
  - `CardDetail` 새 prop `meetings` — 그룹 블록과 명함 히스토리 사이에 "만남 기록 (N)" 섹션으로 렌더. 0건이면 섹션을 숨긴다.

- [ ] **Step 1:** 위대로 구현한다. 상세 화면의 기존 HubSpot 버튼(`HubSpot에 등록` / `HubSpot 업데이트`)은 Task 6에서 바뀐 `syncToHubSpot`을 쓰므로 미반영 만남이 함께 전송된다.
- [ ] **Step 2: Verify** `npm run lint`(새 오류 0), `npm run build`. dev에서 Task 7에서 HubSpot 체크를 끄고 저장한 명함을 열면 만남 기록 1건이 보이고, "HubSpot에 등록"을 누르면 HubSpot 연락처에 참석 행사·날짜·노트가 생긴다. 같은 버튼을 다시 눌러도 노트가 중복 생성되지 않는다.
- [ ] **Step 3: Commit**

```bash
git add src/components/MeetingHistory.js src/components/CardDetail.js src/app/page.js
git commit -m "Feature: Show meeting history on card detail and resend pending parts"
```

---

### Task 9: 마무리 확인

**Files:** 없음 (확인만)

- [ ] **Step 1: Run** `npm test` — Expected: 전체 PASS. `npm run lint` — Expected: 오류 4건/경고 1건(기존과 동일한 위치), 새 오류 없음. `npm run build` — Expected: 성공.
- [ ] **Step 2:** `git status --short`로 무관한 미커밋 파일 3개(`hubspotSubscriptions*.mjs`, `backfill-hubspot-subscriptions.mjs`)가 커밋되지 않고 그대로인지 확인한다.
- [ ] **Step 3:** 사용자에게 전달할 내용을 정리한다: (1) Supabase에 `card_meetings` 섹션 실행 여부, (2) HubSpot 비공개 앱에 추가해야 할 스코프 목록(Task 3에서 확인한 정확한 이름), (3) 토큰 재발급 시 Vercel `HUBSPOT_ACCESS_TOKEN` 갱신 필요.
