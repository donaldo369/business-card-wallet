'use client';

import React from 'react';

/**
 * 반응형 셸 프레임. 상태를 모르고 슬롯만 배치한다.
 *   <1024px  단일 컬럼 (사이드바·상세 숨김)
 *   ≥1024px  사이드바 + 본문
 *   ≥1280px  사이드바 + 본문 + 상세
 */
export default function AppShell({ sidebar, main, detail }) {
  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar">{sidebar}</aside>
      <div className="app-shell-main">{main}</div>
      <aside className="app-shell-detail">{detail}</aside>
    </div>
  );
}
