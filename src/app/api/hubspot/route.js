import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN || req.headers.get('x-hubspot-token');
    if (!hubspotToken) {
      return NextResponse.json(
        { error: 'HubSpot Access Token이 구성되지 않았습니다. 설정에서 토큰을 입력하거나 서버 환경 변수를 설정해주세요.' },
        { status: 400 }
      );
    }

    const { name, first_name, last_name, company, email, title, office_phone, mobile_phone, address } = await req.json();

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

    const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${hubspotToken}`,
      },
      body: JSON.stringify({ properties }),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('HubSpot API error response:', result);
      return NextResponse.json(
        { error: result.message || 'HubSpot 연동 중 오류가 발생했습니다.' },
        { status: response.status }
      );
    }

    return NextResponse.json({ success: true, id: result.id });
  } catch (error) {
    console.error('HubSpot Sync Error:', error);
    return NextResponse.json(
      { error: `HubSpot 동기화 중 오류가 발생했습니다: ${error.message}` },
      { status: 500 }
    );
  }
}
