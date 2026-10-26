import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EVENT_PROPERTY,
  DATE_PROPERTY,
  hubspotFetch,
  ensureEventOption,
  ensureDateProperty,
  syncMeetingParts,
  describeScopeError,
} from './hubspotMeetingSync.mjs';
import { pendingParts } from './meetingInfo.mjs';

// routes: array of [method, urlMatcher(string|RegExp), response | response[]]; first match wins,
// array responses are consumed in order (last one repeats).
function setup(routes) {
  const calls = [];
  const waits = [];
  const fetchFn = async (url, init = {}) => {
    const method = init.method || 'GET';
    const call = { method, url, body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers };
    calls.push(call);
    const route = routes.find(([m, u]) => m === method && (u instanceof RegExp ? u.test(url) : url.includes(u)));
    if (!route) return mkRes({ status: 500, body: { message: `unrouted ${method} ${url}` } });
    const r = route[2];
    const res = Array.isArray(r) ? (r.length > 1 ? r.shift() : r[0]) : r;
    return mkRes(res);
  };
  const sleep = async ms => { waits.push(ms); };
  return { calls, waits, fetchFn, ctx: { fetchFn, token: 'tok', sleep } };
}

function mkRes({ status = 200, body = {}, headers = {} }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: k => headers[k] ?? headers[k.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function meeting(over = {}) {
  const m = { id: 'm1', met_on: '2026-10-26', event_name: null, shared_memo: '', personal_memo: '', ...over };
  return { ...m, pending: pendingParts(m), ...(over.pending ? { pending: over.pending } : {}) };
}

const PROP_URL = `/crm/v3/properties/contacts/${EVENT_PROPERTY}`;
const prop = options => ({ status: 200, body: { name: EVENT_PROPERTY, options } });
const opt = (v, i = 0) => ({ label: v, value: v, displayOrder: i });
const contactGet = (events, date) => ({ status: 200, body: { id: '1', properties: { met_events: events, last_met_date: date } } });

test('기존 옵션과 대소문자·공백만 다른 행사명은 새 옵션을 만들지 않는다', async () => {
  const { ctx, calls } = setup([['GET', PROP_URL, prop([opt('EduTech Korea')])]]);
  const r = await ensureEventOption(ctx, '  edutech   korea ');
  assert.deepEqual(r, { value: 'EduTech Korea' });
  assert.equal(calls.filter(c => c.method === 'PATCH').length, 0);
});

test('새 행사명은 기존 옵션을 모두 포함해 PATCH 한다', async () => {
  const { ctx, calls } = setup([
    ['GET', PROP_URL, prop([opt('A')])],
    ['PATCH', PROP_URL, { status: 200, body: {} }],
  ]);
  const r = await ensureEventOption(ctx, 'B');
  const patch = calls.find(c => c.method === 'PATCH');
  assert.deepEqual(patch.body.options.map(o => o.value), ['A', 'B']);
  assert.equal(patch.body.options[1].displayOrder, 1);
  assert.deepEqual(r, { value: 'B' });
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
});

test('칸이 없으면(404) 체크박스 칸을 만든다', async () => {
  const { ctx, calls } = setup([
    ['GET', PROP_URL, { status: 404 }],
    ['POST', '/crm/v3/properties/contacts', { status: 201, body: {} }],
  ]);
  const r = await ensureEventOption(ctx, 'A');
  const post = calls.find(c => c.method === 'POST');
  assert.equal(post.body.name, 'met_events');
  assert.equal(post.body.fieldType, 'checkbox');
  assert.equal(post.body.type, 'enumeration');
  assert.equal(post.body.label, '참석 행사');
  assert.deepEqual(post.body.options.map(o => o.value), ['A']);
  assert.deepEqual(r, { value: 'A' });
});

test('ensureEventOption: 403 이면 권한 안내 error', async () => {
  const { ctx } = setup([['GET', PROP_URL, { status: 403 }]]);
  const r = await ensureEventOption(ctx, 'A');
  assert.equal(r.error, describeScopeError('schema'));
});

test('ensureEventOption: 빈 행사명은 error', async () => {
  const { ctx } = setup([]);
  const r = await ensureEventOption(ctx, '  ');
  assert.ok(r.error);
});

test('ensureDateProperty: 있으면 ok, 404 면 date 칸 생성', async () => {
  const dateUrl = `/crm/v3/properties/contacts/${DATE_PROPERTY}`;
  let s = setup([['GET', dateUrl, { status: 200, body: {} }]]);
  assert.deepEqual(await ensureDateProperty(s.ctx), { ok: true });
  s = setup([
    ['GET', dateUrl, { status: 404 }],
    ['POST', '/crm/v3/properties/contacts', { status: 201, body: {} }],
  ]);
  assert.deepEqual(await ensureDateProperty(s.ctx), { ok: true });
  const post = s.calls.find(c => c.method === 'POST');
  assert.equal(post.body.name, 'last_met_date');
  assert.equal(post.body.type, 'date');
  assert.equal(post.body.fieldType, 'date');
  assert.equal(post.body.label, '최근 만난 날짜');
});

test('기존 참석 행사를 보존하고 새 행사를 추가한다', async () => {
  const { ctx, calls } = setup([
    ['GET', '/objects/contacts/1', contactGet('A', '2026-09-01')],
    ['GET', PROP_URL, prop([opt('A')])],
    ['PATCH', PROP_URL, { status: 200 }],
    ['GET', `/crm/v3/properties/contacts/${DATE_PROPERTY}`, { status: 200 }],
    ['PATCH', '/objects/contacts/1', { status: 200 }],
    ['POST', '/crm/v3/objects/notes', { status: 201, body: { id: '5' } }],
  ]);
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ event_name: 'B', met_on: '2026-10-24' })]);
  const contactPatch = calls.find(c => c.method === 'PATCH' && c.url.includes('/objects/contacts/1'));
  assert.equal(contactPatch.body.properties.met_events, 'A;B');
  assert.equal(contactPatch.body.properties.last_met_date, '2026-10-24');
  assert.equal(calls.filter(c => c.method === 'PATCH' && c.url.includes('/objects/contacts/')).length, 1);
  assert.equal(r.event, 'done');
  assert.equal(r.date, 'done');
  assert.equal(r.note, 'done'); // 행사명만 있어도 노트 본문이 생긴다
  assert.deepEqual(r.errors, []);
});

test('만난 날짜가 기존보다 과거면 최근 만난 날짜를 바꾸지 않는다', async () => {
  const { ctx, calls } = setup([
    ['GET', '/objects/contacts/1', contactGet('', '2026-10-24')],
    ['GET', `/crm/v3/properties/contacts/${DATE_PROPERTY}`, { status: 200 }],
  ]);
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ event_name: null, met_on: '2026-09-01' })]);
  assert.equal(calls.some(c => c.method === 'PATCH' && c.url.includes('/objects/contacts/')), false);
  assert.equal(r.date, 'done');
  assert.equal(r.event, 'skipped');
});

test('노트는 연락처에 연결해 만들고 note_id 를 돌려준다', async () => {
  const { ctx, calls } = setup([
    ['GET', '/objects/contacts/1', contactGet(null, null)],
    ['GET', `/crm/v3/properties/contacts/${DATE_PROPERTY}`, { status: 200 }],
    ['PATCH', '/objects/contacts/1', { status: 200 }],
    ['POST', '/crm/v3/objects/notes', { status: 201, body: { id: '777' } }],
  ]);
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ shared_memo: '견적 요청' })]);
  const notePost = calls.find(c => c.url.endsWith('/crm/v3/objects/notes'));
  assert.equal(notePost.body.associations[0].types[0].associationTypeId, 202);
  assert.equal(notePost.body.associations[0].types[0].associationCategory, 'HUBSPOT_DEFINED');
  assert.equal(notePost.body.associations[0].to.id, '1');
  assert.equal(notePost.body.properties.hs_timestamp, '2026-10-26T12:00:00+09:00');
  assert.match(notePost.body.properties.hs_note_body, /견적 요청/);
  assert.equal(r.note_id, '777');
  assert.equal(r.note, 'done');
});

test('속성 권한 403 이면 행사만 실패하고 노트는 진행한다', async () => {
  const { ctx } = setup([
    ['GET', '/objects/contacts/1', contactGet(null, null)],
    ['GET', PROP_URL, { status: 403 }],
    ['GET', `/crm/v3/properties/contacts/${DATE_PROPERTY}`, { status: 200 }],
    ['PATCH', '/objects/contacts/1', { status: 200 }],
    ['POST', '/crm/v3/objects/notes', { status: 201, body: { id: '9' } }],
  ]);
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ event_name: 'A', shared_memo: 'x' })]);
  assert.equal(r.event, 'failed');
  assert.equal(r.note, 'done');
  assert.equal(r.date, 'done');
  assert.match(r.errors[0], /스코프/);
});

test('노트 403 이면 note 만 실패하고 노트 권한 안내를 넣는다', async () => {
  const { ctx } = setup([
    ['GET', '/objects/contacts/1', contactGet(null, null)],
    ['POST', '/crm/v3/objects/notes', { status: 403 }],
  ]);
  const [r] = await syncMeetingParts(ctx, '1', [
    meeting({ shared_memo: 'x', pending: { event: false, date: false, note: true } }),
  ]);
  assert.equal(r.note, 'failed');
  assert.equal(r.note_id, null);
  assert.equal(r.errors[0], describeScopeError('note'));
});

test('연락처 PATCH 가 실패하면 event/date 모두 failed', async () => {
  const { ctx } = setup([
    ['GET', '/objects/contacts/1', contactGet(null, null)],
    ['GET', PROP_URL, prop([opt('A')])],
    ['GET', `/crm/v3/properties/contacts/${DATE_PROPERTY}`, { status: 200 }],
    ['PATCH', '/objects/contacts/1', { status: 500, body: { message: 'boom' } }],
  ]);
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ event_name: 'A' })]);
  assert.equal(r.event, 'failed');
  assert.equal(r.date, 'failed');
  assert.ok(r.errors.length >= 1);
});

test('연락처 조회가 실패하면 모든 대기 파트가 failed', async () => {
  const { ctx } = setup([['GET', '/objects/contacts/1', { status: 404, body: { message: 'nope' } }]]);
  const [r] = await syncMeetingParts(ctx, '1', [meeting({ event_name: 'A', shared_memo: 'x' })]);
  assert.equal(r.event, 'failed');
  assert.equal(r.date, 'failed');
  assert.equal(r.note, 'failed');
});

test('429 는 Retry-After 만큼 기다렸다가 재시도한다', async () => {
  const { fetchFn, waits } = setup([
    ['GET', '/x', [{ status: 429, headers: { 'Retry-After': '2' } }, { status: 200, body: { a: 1 } }]],
  ]);
  const res = await hubspotFetch(fetchFn, 'tok', 'https://api.hubapi.com/x', { sleep: async ms => waits.push(ms) });
  assert.equal(res.ok, true);
  assert.deepEqual(res.body, { a: 1 });
  assert.deepEqual(waits, [2000]);
});

test('429 가 계속되면 최대 2회 재시도 후 429 를 돌려준다 (Retry-After 없으면 1초)', async () => {
  const { fetchFn, calls, waits } = setup([['GET', '/x', { status: 429 }]]);
  const res = await hubspotFetch(fetchFn, 'tok', 'https://api.hubapi.com/x', { sleep: async ms => waits.push(ms) });
  assert.equal(res.status, 429);
  assert.equal(res.ok, false);
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [1000, 1000]);
});

test('describeScopeError 는 필요한 스코프 이름을 안내한다', () => {
  assert.match(describeScopeError('schema'), /crm\.schemas\.contacts\.write/);
  assert.match(describeScopeError('note'), /crm\.objects\.contacts\.write/);
});
