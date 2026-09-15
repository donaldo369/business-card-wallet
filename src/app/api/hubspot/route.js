import { NextResponse } from 'next/server';
import {
  TARGET_SUBSCRIPTION_NAMES,
  matchSubscriptions,
  buildStatusBody,
} from '../../../lib/hubspotSubscriptions.mjs';

const COMM_PREF_BASE = 'https://api.hubapi.com/communication-preferences/v4';

// 구독 API 실패를 사용자가 조치할 수 있는 문구로 바꾼다.
// 403 은 대부분 Private App 토큰에 스코프가 없는 경우라 따로 안내한다.
const describeSubscriptionError = (status, body) => {
  if (status === 403) {
    return 'HubSpot 토큰에 커뮤니케이션 구독 권한이 없습니다. 비공개 앱 설정에서 communication_preferences.read_write 스코프를 추가하고 토큰을 다시 발급해 주세요.';
  }
  return body?.message || `구독 상태 변경에 실패했습니다 (HTTP ${status}).`;
};

export async function POST(req) {
  try {
    let hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN || req.headers.get('x-hubspot-token');
    
    // "undefined" 또는 "null" 문자열이 들어오는 경우 예외 처리
    if (hubspotToken === 'undefined' || hubspotToken === 'null') {
      hubspotToken = null;
    }

    if (!hubspotToken) {
      return NextResponse.json(
        { error: 'HubSpot Access Token이 구성되지 않았습니다. Vercel 환경 변수 혹은 설정창에서 올바른 토큰을 입력해 주세요.' },
        { status: 400 }
      );
    }

    const { name, first_name, last_name, company, email, title, office_phone, mobile_phone, address, hubspot_id } = await req.json();

    // 보안을 위해 앞 10자리와 길이만 로그에 기록하여 올바른 토큰 타입(pat-로 시작)인지 확인
    console.log(`[HubSpot Sync] Token check - Length: ${hubspotToken.length}, Starts with: "${hubspotToken.substring(0, 10)}..."`);
    console.log(`[HubSpot Sync] Target ID: ${hubspot_id ? hubspot_id : 'NEW CONTACT'}`);

    // 1. 이미 분리된 성과 이름이 있다면 그것을 사용하고, 없으면 기존대로 전체 이름 분리 시도
    let finalFirstName = first_name || '';
    let finalLastName = last_name || '';

    if (!finalFirstName && !finalLastName && name) {
      if (name.trim().length >= 2 && name.trim().length <= 4) {
        finalLastName = name.trim().substring(0, 1);
        finalFirstName = name.trim().substring(1);
      } else {
        finalLastName = name.trim();
      }
    }

    // HubSpot Properties 매핑
    const properties = {
      firstname: finalFirstName,
      lastname: finalLastName,
      email: email || '',
      company: company || '',
      jobtitle: title || '',
      phone: office_phone || '',
      mobilephone: mobile_phone || '',
      address: address || '',
    };

    // 연락처 저장이 성공한 뒤에만 실행한다. 구독 처리는 부가 작업이므로 실패해도
    // 연락처 저장을 되돌리지 않고, 요약만 응답에 담아 UI 가 알릴 수 있게 한다.
    const syncSubscriptions = async () => {
      if (!email) {
        return { skipped: 'no_email' };
      }

      try {
        const defRes = await fetch(`${COMM_PREF_BASE}/definitions`, {
          headers: { 'Authorization': `Bearer ${hubspotToken}` },
        });
        const defBody = await defRes.json().catch(() => ({}));

        if (!defRes.ok) {
          console.error(`[HubSpot Sync] definitions failed [${defRes.status}]:`, defBody);
          return { error: describeSubscriptionError(defRes.status, defBody) };
        }

        const { matched, missing } = matchSubscriptions(defBody?.results, TARGET_SUBSCRIPTION_NAMES);

        if (matched.length === 0) {
          return { subscribed: [], missing, error: 'HubSpot 에서 대상 구독 유형을 찾지 못했습니다.' };
        }

        // 배치(batch/write) 는 Marketing Hub Enterprise 전용이라 단건으로 세 번 호출한다.
        const settled = await Promise.allSettled(
          matched.map(async ({ id, name }) => {
            const res = await fetch(`${COMM_PREF_BASE}/statuses/${encodeURIComponent(email)}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${hubspotToken}`,
              },
              body: JSON.stringify(buildStatusBody(id)),
            });
            if (!res.ok) {
              const errBody = await res.json().catch(() => ({}));
              console.error(`[HubSpot Sync] subscribe "${name}" failed [${res.status}]:`, errBody);
              throw new Error(describeSubscriptionError(res.status, errBody));
            }
            return name;
          })
        );

        const subscribed = settled.filter(r => r.status === 'fulfilled').map(r => r.value);
        const failures = settled.filter(r => r.status === 'rejected').map(r => r.reason?.message);

        return {
          subscribed,
          missing,
          // 여러 건이 같은 이유로 실패하는 경우가 많아 중복은 합친다
          ...(failures.length ? { error: [...new Set(failures)].join(' ') } : {}),
        };
      } catch (err) {
        console.error('[HubSpot Sync] subscription sync error:', err);
        return { error: `구독 상태 변경 중 오류가 발생했습니다: ${err.message}` };
      }
    };

    const patchExisting = async (existingId) => {
      const patchRes = await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${existingId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${hubspotToken}`,
        },
        body: JSON.stringify({ properties }),
      });
      const patchResult = await patchRes.json();
      return { ok: patchRes.ok, status: patchRes.status, result: patchResult };
    };

    let response;
    let url;

    if (hubspot_id) {
      // 2-1. 기존 연락처 수정 (PATCH)
      url = `https://api.hubapi.com/crm/v3/objects/contacts/${hubspot_id}`;
      response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${hubspotToken}`,
        },
        body: JSON.stringify({ properties }),
      });
    } else {
      // 2-2. 신규 연락처 등록 (POST)
      url = 'https://api.hubapi.com/crm/v3/objects/contacts';
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${hubspotToken}`,
        },
        body: JSON.stringify({ properties }),
      });
    }

    const result = await response.json();

    // 신규 등록 시도 중 "이미 존재" 응답을 받으면, 응답에서 기존 ID를 추출해 PATCH로 대체.
    // HubSpot 메시지 예: "Contact already exists. Existing ID: 476110062308"
    if (!response.ok && !hubspot_id) {
      const message = result?.message || '';
      const existingId = message.match(/Existing ID:\s*(\d+)/i)?.[1];
      if (existingId) {
        console.log(`[HubSpot Sync] Contact already exists (id=${existingId}); patching instead of creating.`);
        const patched = await patchExisting(existingId);
        if (patched.ok) {
          const subscriptions = await syncSubscriptions();
          return NextResponse.json({ success: true, id: existingId, merged: true, subscriptions });
        }
        console.error(`HubSpot PATCH after conflict failed [${patched.status}]:`, patched.result);
        return NextResponse.json(
          {
            error: patched.result?.message || 'HubSpot 기존 연락처 업데이트에 실패했습니다.',
            id: existingId,
            merged: false,
          },
          { status: patched.status }
        );
      }
    }

    if (!response.ok) {
      console.error(`HubSpot API error [${response.status}]:`, result);
      return NextResponse.json(
        { error: result.message || 'HubSpot 연동 중 오류가 발생했습니다.' },
        { status: response.status }
      );
    }

    const subscriptions = await syncSubscriptions();
    return NextResponse.json({ success: true, id: hubspot_id || result.id, subscriptions });
  } catch (error) {
    console.error('HubSpot Sync Error:', error);
    return NextResponse.json(
      { error: `HubSpot 동기화 중 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }
}
