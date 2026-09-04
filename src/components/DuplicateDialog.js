'use client';

import React from 'react';
import { AlertCircle, Plus, RefreshCw } from 'lucide-react';

/** 같은 사람의 명함이 이미 있을 때 업데이트/신규추가를 고르게 하는 모달. */
export default function DuplicateDialog({ existingCard, newCardData, loading, onUpdate, onAddNew, onCancel }) {
  return (
      <div className="modal-overlay" style={{ zIndex: 210 }}>
        <div className="glass" style={{
          padding: '28px',
          maxWidth: '440px',
          width: '100%',
          animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <AlertCircle size={22} style={{ color: '#f59e0b', flexShrink: 0 }} />
            <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              동일인 명함 발견
            </h3>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{existingCard.name}</strong> 님의 명함이 이미 등록되어 있습니다.
            기존 정보를 새 명함으로 업데이트하시겠습니까?
          </p>

          {/* 기존 vs 새 정보 비교 */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: '1fr 1fr', 
            gap: '12px', 
            marginBottom: '20px',
            fontSize: '12px'
          }}>
            <div style={{ 
              padding: '12px', 
              background: 'rgba(239,68,68,0.08)', 
              borderRadius: '10px',
              border: '1px solid rgba(239,68,68,0.2)'
            }}>
              <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: '8px', fontSize: '11px' }}>📋 기존 정보</div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <div>{existingCard.company || '(회사 없음)'}</div>
                <div>{existingCard.title || '(직함 없음)'}</div>
                <div>{existingCard.email || '(이메일 없음)'}</div>
              </div>
            </div>
            <div style={{ 
              padding: '12px', 
              background: 'rgba(34,197,94,0.08)', 
              borderRadius: '10px',
              border: '1px solid rgba(34,197,94,0.2)'
            }}>
              <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: '8px', fontSize: '11px' }}>✨ 새 정보</div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                <div>{newCardData.company || '(회사 없음)'}</div>
                <div>{newCardData.title || '(직함 없음)'}</div>
                <div>{newCardData.email || '(이메일 없음)'}</div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button
              onClick={onUpdate}
              disabled={loading}
              className="btn btn-primary"
              style={{ 
                width: '100%', justifyContent: 'center', gap: '8px',
                padding: '14px', fontSize: '15px', fontWeight: 700, borderRadius: '12px'
              }}
            >
              <RefreshCw size={18} />
              기존 명함 업데이트
            </button>
            <button
              onClick={onAddNew}
              disabled={loading}
              style={{ 
                width: '100%', padding: '14px', fontSize: '15px', fontWeight: 700, 
                borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', 
                justifyContent: 'center', gap: '8px'
              }}
            >
              <Plus size={18} />
              새 명함으로 추가
            </button>
            <button
              onClick={onCancel}
              style={{ 
                width: '100%', padding: '10px', fontSize: '13px',
                background: 'none', border: 'none', color: 'var(--text-secondary)',
                cursor: 'pointer'
              }}
            >
              취소
            </button>
          </div>
        </div>
      </div>
  );
}
