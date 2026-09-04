'use client';

import React from 'react';
import { Save, Sparkles, X } from 'lucide-react';

/** 여러 장을 한 번에 스캔한 결과 목록. 성공 건만 편집/저장할 수 있다. */
export default function BatchResults({ results, loading, onSelect, onSaveAll, onClose }) {
  const successCount = results.filter(c => c._status === 'success').length;

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
          {results.map((card, idx) => (
            <div
              key={idx}
              onClick={() => card._status === 'success' && onSelect(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px',
                background: card._status === 'success' ? 'rgba(99,102,241,0.1)' : 'rgba(239,68,68,0.1)',
                borderRadius: '12px',
                cursor: card._status === 'success' ? 'pointer' : 'default',
                border: `1px solid ${card._status === 'success' ? 'rgba(99,102,241,0.25)' : 'rgba(239,68,68,0.25)'}`,
                transition: 'transform 0.15s, box-shadow 0.15s'
              }}
              onMouseEnter={(e) => card._status === 'success' && (e.currentTarget.style.transform = 'translateY(-1px)')}
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
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {card.name || `카드 ${idx + 1}`}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {card._status === 'success'
                    ? `${card.company || ''}${card.title ? ' · ' + card.title : ''}`
                    : `❌ ${card._error || '인식 실패'}`
                  }
                </div>
              </div>
              {card._status === 'success' && (
                <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600, flexShrink: 0 }}>편집 →</div>
              )}
            </div>
          ))}
        </div>

        {successCount > 0 && (
          <button
            onClick={onSaveAll}
            disabled={loading}
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
            {loading ? '저장 중...' : `${successCount}장 전체 저장`}
          </button>
        )}
      </div>
  );
}
