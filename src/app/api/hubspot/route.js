import { NextResponse } from 'next/server';

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

    if (!response.ok) {
      console.error(`HubSpot API error [${response.status}]:`, result);
      return NextResponse.json(
        { error: result.message || 'HubSpot 연동 중 오류가 발생했습니다.' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, id: hubspot_id || result.id });
  } catch (error) {
    console.error('HubSpot Sync Error:', error);
    return NextResponse.json(
      { error: `HubSpot 동기화 중 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }
}
