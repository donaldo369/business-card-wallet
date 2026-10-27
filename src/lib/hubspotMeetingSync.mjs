// 만난 정보(참석 행사, 최근 만난 날짜, 노트)를 HubSpot 연락처에 반영하는 모듈.
// fetch 는 ctx.fetchFn 으로 주입받아 테스트에서 가짜로 바꾼다.

import { normalizeEventName, eventKey, mergeEventValues, isLaterDate, buildNoteBody } from './meetingInfo.mjs';

export const EVENT_PROPERTY = 'met_events';
export const DATE_PROPERTY = 'last_met_date';

const API = 'https://api.hubapi.com';
const MAX_RETRIES = 2;
const NOTE_TO_CONTACT = 202;

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * HubSpot 호출. 429 면 Retry-After(초, 없으면 1) 만큼 기다렸다가 최대 2회 재시도.
 * @returns {Promise<{ ok: boolean, status: number, body: any }>}
 */
export async function hubspotFetch(fetchFn, token, url, init = {}) {
  const { sleep = defaultSleep, method = 'GET', body } = init;
  const request = {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetchFn(url, request);
    } catch (e) {
      return { ok: false, status: 0, body: { message: e?.message || '네트워크 오류' } };
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const seconds = Number(res.headers?.get?.('Retry-After'));
      await sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
      continue;
    }
    const parsed = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, body: parsed };
  }
}

// 스코프 이름은 HubSpot 개발자 문서(scopes 목록)의 crm.schemas.contacts.read / crm.schemas.contacts.write /
// crm.objects.contacts.write 설명 기준. 속성 확인은 GET(읽기), 옵션 추가는 PATCH(쓰기)라 두 스코프가 모두 필요하다. 노트 생성 스코프는 문서에 명시가 없어 연락처 쓰기 권한으로 안내한다.
export function describeScopeError(kind) {
  if (kind === 'schema') {
    return 'HubSpot 토큰에 연락처 속성 설정 권한이 없습니다. 비공개 앱 설정에서 crm.schemas.contacts.read, crm.schemas.contacts.write 스코프를 추가하고 토큰을 다시 발급해 주세요.';
  }
  return 'HubSpot 토큰에 노트 작성 권한이 없습니다. 비공개 앱 설정에서 crm.objects.contacts.write 스코프를 추가하고 토큰을 다시 발급해 주세요.';
}

const describeContactScopeError = () =>
  'HubSpot 토큰에 연락처 읽기/쓰기 권한이 없습니다. 비공개 앱 설정에서 crm.objects.contacts.read, crm.objects.contacts.write 스코프를 추가하고 토큰을 다시 발급해 주세요.';

const describeFailure = (res, kind, fallback) =>
  res.status === 403 ? (kind === 'contact' ? describeContactScopeError() : describeScopeError(kind)) : res.body?.message || `${fallback} (HTTP ${res.status}).`;

const call = (ctx, path, init) =>
  hubspotFetch(ctx.fetchFn, ctx.token, `${API}${path}`, { sleep: ctx.sleep, ...init });

const EVENT_PROPERTY_BASE = {
  label: '참석 행사',
  type: 'enumeration',
  fieldType: 'checkbox',
  groupName: 'contactinformation',
};

// 2026-09 OptionInput 은 label/value/displayOrder/hidden 이 필수이고 description 을 선택으로 받는다.
// PATCH 는 옵션 목록을 통째로 덮어쓰므로 기존 옵션의 description 도 그대로 실어 보내야 지워지지 않는다.
const toOptionInput = (o, i) => ({
  label: o.label,
  value: o.value,
  displayOrder: Number.isInteger(o.displayOrder) ? o.displayOrder : i,
  hidden: Boolean(o.hidden),
  ...(o.description ? { description: o.description } : {}),
});

/** 행사 체크박스 칸에 행사 옵션이 있도록 보장하고 옵션 value 를 돌려준다 */
export async function ensureEventOption(ctx, eventName) {
  const name = normalizeEventName(eventName);
  if (!name) return { error: '행사명이 비어 있습니다.' };
  const propPath = `/crm/properties/2026-09/contacts/${EVENT_PROPERTY}`;

  const got = await call(ctx, propPath);
  if (got.status === 404) {
    const created = await call(ctx, '/crm/properties/2026-09/contacts', {
      method: 'POST',
      body: { ...EVENT_PROPERTY_BASE, name: EVENT_PROPERTY, options: [toOptionInput({ label: name, value: name, displayOrder: 0 }, 0)] },
    });
    if (!created.ok) return { error: describeFailure(created, 'schema', '행사 속성을 만들지 못했습니다') };
    return { value: name };
  }
  if (!got.ok) return { error: describeFailure(got, 'schema', '행사 속성을 읽지 못했습니다') };

  const options = got.body?.options || [];
  const key = eventKey(name);
  const existing = options.find(o => eventKey(o.label) === key);
  if (existing) return { value: existing.value };

  // PATCH 는 옵션 목록을 통째로 교체하므로 기존 옵션을 모두 포함해 보낸다
  const patched = await call(ctx, propPath, {
    method: 'PATCH',
    body: { options: [...options.map(toOptionInput), toOptionInput({ label: name, value: name, displayOrder: options.length }, options.length)] },
  });
  if (!patched.ok) return { error: describeFailure(patched, 'schema', '행사 옵션을 추가하지 못했습니다') };
  return { value: name };
}

/** 최근 만난 날짜 칸이 있도록 보장 */
export async function ensureDateProperty(ctx) {
  const got = await call(ctx, `/crm/properties/2026-09/contacts/${DATE_PROPERTY}`);
  if (got.ok) return { ok: true };
  if (got.status !== 404) return { error: describeFailure(got, 'schema', '날짜 속성을 읽지 못했습니다') };

  const created = await call(ctx, '/crm/properties/2026-09/contacts', {
    method: 'POST',
    body: { name: DATE_PROPERTY, label: '최근 만난 날짜', type: 'date', fieldType: 'date', groupName: 'contactinformation' },
  });
  if (!created.ok) return { error: describeFailure(created, 'schema', '날짜 속성을 만들지 못했습니다') };
  return { ok: true };
}

/**
 * 만남들의 미반영 파트(행사/날짜/노트)를 HubSpot 연락처에 반영한다. 파트별로 성공/실패를 따로 돌려준다.
 */
export async function syncMeetingParts(ctx, contactId, meetings) {
  const results = meetings.map(m => ({
    id: m.id,
    event: m.pending.event ? 'failed' : 'skipped',
    date: m.pending.date ? 'failed' : 'skipped',
    note_id: null,
    note: m.pending.note ? 'failed' : 'skipped',
    errors: [],
  }));
  const idx = meetings.map((_, i) => i);
  const eventIdx = idx.filter(i => meetings[i].pending.event);
  const dateIdx = idx.filter(i => meetings[i].pending.date);
  const fail = (i, msg) => results[i].errors.push(msg);

  if (eventIdx.length || dateIdx.length) {
    const cur = await call(ctx, `/crm/objects/2026-09/contacts/${encodeURIComponent(contactId)}?properties=${EVENT_PROPERTY},${DATE_PROPERTY}`);
    if (!cur.ok) {
      const msg = describeFailure(cur, 'contact', '연락처를 읽지 못했습니다');
      for (const i of new Set([...eventIdx, ...dateIdx])) fail(i, msg);
    } else {
      const props = cur.body?.properties || {};
      const update = {};
      const optionCache = new Map(); // eventKey -> 결과 (같은 행사는 한 번만 확인)

      // 행사
      let merged = props[EVENT_PROPERTY] || '';
      const eventOk = [];
      for (const i of eventIdx) {
        const key = eventKey(meetings[i].event_name);
        if (!optionCache.has(key)) optionCache.set(key, await ensureEventOption(ctx, meetings[i].event_name));
        const opt = optionCache.get(key);
        if (opt.error) {
          fail(i, opt.error);
        } else {
          merged = mergeEventValues(merged, opt.value);
          eventOk.push(i);
        }
      }
      if (eventOk.length) update[EVENT_PROPERTY] = merged;

      // 날짜 (가장 늦은 만난 날짜, 과거로 되돌리지 않음)
      let dateOk = false;
      let dateNeedsPatch = false;
      if (dateIdx.length) {
        const latest = dateIdx.map(i => meetings[i].met_on).reduce((a, b) => (b > a ? b : a));
        if (isLaterDate(props[DATE_PROPERTY], latest)) {
          const ensured = await ensureDateProperty(ctx);
          if (ensured.error) {
            for (const i of dateIdx) fail(i, ensured.error);
          } else {
            update[DATE_PROPERTY] = latest;
            dateNeedsPatch = true;
          }
        } else {
          dateOk = true; // 반영할 것이 없으므로 완료
        }
      }

      let patched = true;
      if (Object.keys(update).length) {
        const res = await call(ctx, `/crm/objects/2026-09/contacts/${encodeURIComponent(contactId)}`, {
          method: 'PATCH',
          body: { properties: update },
        });
        patched = res.ok;
        if (!res.ok) {
          const msg = describeFailure(res, 'contact', '연락처를 갱신하지 못했습니다');
          for (const i of new Set([...eventOk, ...(dateNeedsPatch ? dateIdx : [])])) fail(i, msg);
        }
      }
      if (patched) {
        for (const i of eventOk) results[i].event = 'done';
        if (dateOk || dateNeedsPatch) for (const i of dateIdx) results[i].date = 'done';
      }
    }
  }

  // 노트
  for (const i of idx.filter(i => meetings[i].pending.note)) {
    const m = meetings[i];
    const res = await call(ctx, '/crm/objects/2026-09/notes', {
      method: 'POST',
      body: {
        properties: { hs_note_body: buildNoteBody(m), hs_timestamp: `${m.met_on}T12:00:00+09:00` },
        associations: [
          { to: { id: contactId }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: NOTE_TO_CONTACT }] },
        ],
      },
    });
    if (res.ok && res.body?.id != null) {
      results[i].note = 'done';
      results[i].note_id = String(res.body.id);
    } else {
      fail(i, describeFailure(res, 'note', '노트를 만들지 못했습니다'));
    }
  }

  return results;
}
