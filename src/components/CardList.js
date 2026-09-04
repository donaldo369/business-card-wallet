'use client';

import React, { useSyncExternalStore } from 'react';
import { FileText, RefreshCw, Search } from 'lucide-react';
import CardListItem from './CardListItem';

// 목록 밀도는 localStorage 가 원본이다. useEffect 로 뒤늦게 동기화하면 첫
// 페인트가 한 번 튀므로 useSyncExternalStore 로 직접 구독한다.
const DENSITY_KEY = 'cardListDensity';
const densityListeners = new Set();

const subscribeDensity = (onChange) => {
  densityListeners.add(onChange);
  return () => densityListeners.delete(onChange);
};

const getDensity = () =>
  (window.localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable');

// SSR 에는 localStorage 가 없으므로 기본값으로 렌더한다.
const getDensityOnServer = () => 'comfortable';

const writeDensity = (next) => {
  window.localStorage.setItem(DENSITY_KEY, next);
  densityListeners.forEach((onChange) => onChange());
};

export default function CardList({
  groupedByDate,
  totalCount,
  searchQuery,
  onClearSearch,
  initialLoading,
  selectionMode,
  selectedCardIds,
  resolveGroupBadges,
  onActivateCard,
}) {
  const density = useSyncExternalStore(subscribeDensity, getDensity, getDensityOnServer);

  return (
    <>
      <div className="section-header">
        <h2 className="section-title">
          <FileText size={18} className="color-violet" />
          내 명함 지갑
          <span className="count-badge">{totalCount}개</span>
        </h2>

        <div className="density-toggle" role="group" aria-label="목록 밀도">
          {[['comfortable', '넓게'], ['compact', '좁게']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => writeDensity(key)}
              className={`density-toggle-btn ${density === key ? 'density-toggle-btn-active' : ''}`}
              aria-pressed={density === key}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {initialLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
          <RefreshCw size={28} className="color-violet" style={{ animation: 'spin 1s infinite linear' }} />
        </div>
      ) : totalCount === 0 ? (
        searchQuery ? (
          <div className="empty-state">
            <div className="empty-icon-box">
              <Search size={24} />
            </div>
            <h3>&quot;{searchQuery}&quot; 검색 결과가 없습니다</h3>
            <p>이름, 회사명, 이메일, 전화번호로 다시 검색해 보세요.</p>
            <button
              type="button"
              onClick={onClearSearch}
              className="btn btn-secondary"
              style={{ marginTop: '16px' }}
            >
              검색 초기화
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon-box">
              <FileText size={24} />
            </div>
            <h3>저장된 명함이 없습니다</h3>
            <p>새 명함 추가 버튼을 눌러 첫 번째 명함을 카메라로 스캔하거나 이미지를 올려보세요.</p>
          </div>
        )
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {groupedByDate.map(([dateLabel, groupCards]) => (
            <div key={dateLabel} className="date-group-section">
              <div className="date-group-header">
                <span className="date-group-title">{dateLabel}</span>
                <span className="date-group-count">{groupCards.length}개</span>
              </div>
              <div className={`cards-grid cards-grid-${density}`}>
                {groupCards.map((card) => (
                  <CardListItem
                    key={card.id}
                    card={card}
                    groupBadges={resolveGroupBadges(card.id)}
                    selectionMode={selectionMode}
                    isSelected={selectedCardIds.has(card.id)}
                    onActivate={onActivateCard}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
