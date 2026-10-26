'use client';

import React from 'react';
import { Save, Sparkles, X } from 'lucide-react';
import MeetingInfoBox from './MeetingInfoBox';

// 행 안의 메모 입력·HubSpot 체크를 눌러도 편집 열기가 실행되지 않게 한다
const stop = (e) => e.stopPropagation();

/**
 * 여러 장을 한 번에 스캔한 결과 목록. 성공 건만 편집/저장할 수 있다.
 * 위쪽 "만난 정보"는 모든 성공 행에 공통으로 붙고, 행마다 사람별 메모와 HubSpot 전송 체크가 있다.
 */
export default function BatchResults({
  results,
  loading,
  onSelect,
  onSaveAll,
  onClose,
  meeting,
  onMeetingChange,
  recentEvents = [],
  showSendSwitch = false,
  onRowChange,
  sendProgress = null,
}) {
  const successRows = results.filter(c => c._status === 'success');
  const successCount = successRows.length;
  const sendCount = showSendSwitch ? successRows.filter(c => c.send).length : 0;
  const busy = loading || !!sendProgress;

  let saveLabel;
  if (sendProgress) saveLabel = `HubSpot 전송 중 (${sendProgress.current}/${sendProgress.total})`;
  else if (loading) saveLabel = '저장 중...';
  else if (sendCount > 0) saveLabel = `${successCount}장 저장 + ${sendCount}장 HubSpot 전송`;
  else saveLabel = `${successCount}장 저장`;

  return (
      <div className="glass" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h3 className="section-title">
            <Sparkles size={18} className="color-violet" />
            일괄 스캔 결과 ({successCount}/{results.length}장 인식)
          </h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {meeting && onMeetingChange && successCount > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <MeetingInfoBox
              value={meeting}
              onChange={onMeetingChange}
              recentEvents={recentEvents}
              showSendSwitch={showSendSwitch}
              memoLabel="공통 메모 (선택)"
              countLabel={`· ${successCount}명 모두`}
            />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {results.map((card, idx) => {
            const ok = card._status === 'success';
            return (
              <div
                key={idx}
                style={{
                  padding: '12px',
                  background: ok ? 'rgba(99,102,241,0.1)' : 'rgba(239,68,68,0.1)',
                  borderRadius: '12px',
                  border: `1px solid ${ok ? 'rgba(99,102,241,0.25)' : 'rgba(239,68,68,0.25)'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* 편집 열기는 이미지·이름 영역에서만 */}
                  <div
                    role={ok ? 'button' : undefined}
                    tabIndex={ok ? 0 : undefined}
                    title={ok ? '눌러서 편집' : undefined}
                    onClick={() => ok && onSelect(idx)}
                    onKeyDown={(e) => {
                      if (ok && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onSelect(idx);
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      flex: 1,
                      minWidth: 0,
                      cursor: ok ? 'pointer' : 'default',
                      transition: 'transform 0.15s',
                    }}
                    onMouseEnter={(e) => ok && (e.currentTarget.style.transform = 'translateY(-1px)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.image_url}
                      alt={card.name || '명함'}
                      loading="lazy"
                      decoding="async"
                      style={{
                        width: '64px',
                        height: '40px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        flexShrink: 0
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {card.name || `카드 ${idx + 1}`}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {ok
                          ? `${card.company || ''}${card.title ? ' · ' + card.title : ''}`
                          : `❌ ${card._error || '인식 실패'}`
                        }
                      </div>
                    </div>
                    {ok && (
                      <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600, flexShrink: 0 }}>편집 →</div>
                    )}
                  </div>

                  {ok && showSendSwitch && (
                    <label
                      onClick={stop}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer', flexShrink: 0 }}
                    >
                      <input
                        type="checkbox"
                        checked={!!card.send}
                        disabled={busy}
                        onClick={stop}
                        onChange={(e) => onRowChange && onRowChange(idx, { send: e.target.checked })}
                      />
                      HubSpot
                    </label>
                  )}
                </div>

                {ok && (
                  <input
                    type="text"
                    className="premium-input"
                    aria-label={`${card.name || `카드 ${idx + 1}`} 메모`}
                    placeholder="이 분에 대한 메모…"
                    value={card.personal_memo || ''}
                    disabled={busy}
                    onClick={stop}
                    onKeyDown={stop}
                    onChange={(e) => onRowChange && onRowChange(idx, { personal_memo: e.target.value })}
                    style={{ width: '100%', marginTop: '10px', padding: '8px 12px', fontSize: '13px', borderRadius: '10px' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {successCount > 0 && (
          <button
            onClick={onSaveAll}
            disabled={busy}
            className="btn btn-primary"
            style={{ 
              width: '100%', 
              justifyContent: 'center', 
              gap: '10px',
              padding: '18px 24px',
              fontSize: '17px',
              fontWeight: 700,
              borderRadius: '16px',
              marginTop: '4px'
            }}
          >
            <Save size={22} />
            {saveLabel}
          </button>
        )}
      </div>
  );
}
