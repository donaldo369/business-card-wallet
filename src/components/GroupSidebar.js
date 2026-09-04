'use client';

import React from 'react';
import { Layers, LogOut, Plus, Settings, Smartphone, Sliders } from 'lucide-react';
import { getGroupColor } from '../lib/groupColors';

/**
 * 데스크탑(≥1024px) 좌측 내비게이션. 그룹 필터와 계정/설정을 담당한다.
 * 좁은 폭에서는 AppShell 이 통째로 숨기고 그룹 칩 줄이 그 역할을 대신한다.
 */
export default function GroupSidebar({
  groups,
  counts,
  activeGroupId,
  userEmail,
  onSelectGroup,
  onCreateGroup,
  onManageGroups,
  onOpenSettings,
  onSignOut,
}) {
  return (
    <>
      <div className="logo-section">
        <div className="logo-icon-box">
          <Smartphone size={22} style={{ color: '#fff' }} />
        </div>
        <div className="logo-title-group">
          <h1 style={{ fontSize: '17px' }}>Smart Card Wallet</h1>
          <p>명함 AI 관리</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          type="button"
          className={`sidebar-nav-item ${activeGroupId === null ? 'sidebar-nav-item-active' : ''}`}
          onClick={() => onSelectGroup(null)}
        >
          <Layers size={14} />
          <span className="sidebar-nav-label">전체</span>
          <span className="sidebar-nav-count">{counts.all}</span>
        </button>

        {groups.length > 0 && <div className="sidebar-section-label">그룹</div>}

        {groups.map(g => {
          const c = getGroupColor(g.color);
          const active = activeGroupId === g.id;
          return (
            <button
              key={g.id}
              type="button"
              className={`sidebar-nav-item ${active ? 'sidebar-nav-item-active' : ''}`}
              onClick={() => onSelectGroup(g.id)}
              style={active ? { color: c.solid } : undefined}
            >
              <span className="group-color-dot" style={{ background: c.solid, margin: 0 }} />
              <span className="sidebar-nav-label">{g.name}</span>
              <span className="sidebar-nav-count">{counts.byGroup[g.id] || 0}</span>
            </button>
          );
        })}

        <button
          type="button"
          className={`sidebar-nav-item ${activeGroupId === 'ungrouped' ? 'sidebar-nav-item-active' : ''}`}
          onClick={() => onSelectGroup('ungrouped')}
        >
          <span className="group-color-dot" style={{ background: 'var(--text-secondary)', margin: 0 }} />
          <span className="sidebar-nav-label">그룹 없음</span>
          <span className="sidebar-nav-count">{counts.ungrouped}</span>
        </button>

        <div className="sidebar-section-label">관리</div>

        <button type="button" className="sidebar-nav-item" onClick={onCreateGroup}>
          <Plus size={14} />
          <span className="sidebar-nav-label">새 그룹</span>
        </button>

        {groups.length > 0 && (
          <button type="button" className="sidebar-nav-item" onClick={onManageGroups}>
            <Sliders size={14} />
            <span className="sidebar-nav-label">그룹 관리</span>
          </button>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user-email" title={userEmail}>{userEmail}</div>
        <button type="button" className="sidebar-nav-item" onClick={onOpenSettings}>
          <Settings size={14} />
          <span className="sidebar-nav-label">설정</span>
        </button>
        <button type="button" className="sidebar-nav-item" onClick={onSignOut}>
          <LogOut size={14} />
          <span className="sidebar-nav-label">로그아웃</span>
        </button>
      </div>
    </>
  );
}
