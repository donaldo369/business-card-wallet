'use client';

import React from 'react';
import { Building2, History, Mail, MapPin, Phone, Check } from 'lucide-react';
import { classifyPhone } from '../lib/phone';
import { getGroupColor } from '../lib/groupColors';

function PhoneTypeBadge({ phone }) {
  const type = classifyPhone(phone);
  if (!type || type === 'invalid') return null;

  let label, bg, color;
  if (type === 'mobile') {
    label = '✓ 휴대폰';
    bg = 'rgba(16, 185, 129, 0.12)';
    color = '#34d399';
  } else if (type === 'fixed_line') {
    label = '✓ 사무실';
    bg = 'rgba(99, 102, 241, 0.14)';
    color = '#a5b4fc';
  } else {
    label = '분류 불가';
    bg = 'rgba(245, 158, 11, 0.14)';
    color = '#fbbf24';
  }

  return (
    <span style={{
      marginLeft: '8px',
      padding: '2px 8px',
      borderRadius: '999px',
      background: bg,
      color,
      fontSize: '10px',
      fontWeight: 700,
      whiteSpace: 'nowrap',
      verticalAlign: 'middle',
    }}>
      {label}
    </span>
  );
}

/**
 * 명함 상세 본문. 컨테이너(우측 패널 / 모달 / 바텀시트)를 가리지 않는다.
 * 수정·삭제·HubSpot 액션 버튼은 컨테이너 쪽 책임이라 여기 없다.
 */
export default function CardDetail({ card, groups, activeGroupIds, onToggleGroup, onOpenImage }) {
  return (
    <>
      {/* 이미지 풀 뷰 */}
      <div className="detail-card-preview">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.image_url}
          alt={card.name}
          onClick={() => onOpenImage(card.image_url)}
          style={{ cursor: 'zoom-in' }}
        />
      </div>

      {card.back_image_url && (
        <div className="detail-card-preview" style={{ marginTop: '12px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={card.back_image_url}
            alt={`${card.name} 뒷면`}
            onClick={() => onOpenImage(card.back_image_url)}
            style={{ cursor: 'zoom-in' }}
          />
        </div>
      )}

      {/* 디테일 텍스트 */}
      <div className="detail-info-block">
        <div className="detail-title-section">
          <div className="detail-title-icon">
            <Building2 size={18} />
          </div>
          <div className="detail-title-group">
            <h2>{card.name}</h2>
            <p>
              {card.company} {card.department && ` • ${card.department}`} {card.title && ` • ${card.title}`}
            </p>
          </div>
        </div>

        <div className="detail-grid">
          {card.mobile_phone && (
            <div className="detail-item">
              <Phone size={14} className="color-violet" />
              <span>휴대폰: {card.mobile_phone}</span>
              <PhoneTypeBadge phone={card.mobile_phone} />
            </div>
          )}
          {card.office_phone && (
            <div className="detail-item">
              <Phone size={14} className="color-slate" />
              <span>사무실: {card.office_phone}</span>
              <PhoneTypeBadge phone={card.office_phone} />
            </div>
          )}
          {card.email && (
            <div className="detail-item detail-grid-full">
              <Mail size={14} className="color-cyan" />
              <span>이메일: {card.email}</span>
            </div>
          )}
          {card.address && (
            <div className="detail-item detail-grid-full">
              <MapPin size={14} className="color-rose" />
              <span>주소: {card.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* 그룹 지정 */}
      {groups.length > 0 && (
        <div className="detail-info-block" style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>
            그룹
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {groups.map(g => {
              const active = (activeGroupIds).includes(g.id);
              const c = getGroupColor(g.color);
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`group-chip ${active ? 'group-chip-active' : ''}`}
                  onClick={() => onToggleGroup(card.id, g.id)}
                  style={active ? { background: c.bg, borderColor: c.border, color: c.solid } : undefined}
                >
                  {active ? <Check size={12} /> : <span className="group-color-dot" style={{ background: c.solid }} />} {g.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 명함 히스토리 (과거에 스캔된 같은 인물의 명함 이미지) */}
      {card.history && card.history.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <History size={16} className="color-violet" />
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
              명함 히스토리 ({card.history.length}개)
            </h4>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {[...card.history]
              .sort((a, b) => new Date(b.recorded_at || 0) - new Date(a.recorded_at || 0))
              .map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px',
                    background: 'rgba(99, 102, 241, 0.06)',
                    border: '1px solid rgba(99, 102, 241, 0.14)',
                    borderRadius: '12px',
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={entry.image_url}
                    alt="이전 명함"
                    loading="lazy"
                    decoding="async"
                    onClick={() => onOpenImage(entry.image_url)}
                    style={{
                      width: '72px',
                      height: '46px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      flexShrink: 0,
                      cursor: 'zoom-in',
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      fontWeight: 700,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {entry.company || '(회사 없음)'}
                    </div>
                    <div style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {entry.title || '(직책 없음)'}
                      {entry.department ? ` · ${entry.department}` : ''}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      {entry.recorded_at
                        ? new Date(entry.recorded_at).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          }) + ' 등록'
                        : '등록일 정보 없음'}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  );
}
