'use client';

import React, { useId } from 'react';
import { Save, Sparkles, X } from 'lucide-react';

/**
 * OCR 추출 결과를 사람이 검토·교정하는 폼.
 * onChange 는 바뀐 필드만 담은 patch 를 넘기고, 병합은 호출자가 한다.
 */
export default function CardEditForm({ card, loading, formRef, onChange, onRemoveBack, onCancel, onSubmit }) {
  const uid = useId();
  return (
      <div ref={formRef} className="glass" style={{ padding: '28px', scrollMarginTop: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 className="section-title">
            <Sparkles size={18} className="color-violet" />
            추출 데이터 검토 및 교정
          </h3>
          <button
            onClick={onCancel}
            className="modal-close-btn"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="form-card-row">
            {/* 왼쪽 크롭된 이미지 썸네일 */}
            <div className="form-image-container">
              <div className="biz-card-sim" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#000' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={card.image_url}
                  alt="Cropped card front"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }}
                />
              </div>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '12px', letterSpacing: '0.05em' }}>
                앞면
              </span>

              {card.back_image_url && (
                <>
                  <div
                    className="biz-card-sim"
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '8px',
                      background: '#000',
                      marginTop: '16px',
                      position: 'relative',
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={card.back_image_url}
                      alt="Cropped card back"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        onRemoveBack()
                      }
                      style={{
                        position: 'absolute',
                        top: '6px',
                        right: '6px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'rgba(0,0,0,0.7)',
                        border: '1px solid rgba(255,255,255,0.2)',
                        color: '#fff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                      aria-label="뒷면 제거"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '12px', letterSpacing: '0.05em' }}>
                    뒷면
                  </span>
                </>
              )}
            </div>

            {/* 오른쪽 폼 입력 영역 */}
            <div className="form-grid" style={{ flex: 1 }}>
              <div className="form-group">
                <label htmlFor={`${uid}-f0`}>성 (Last Name)</label>
                <input
                  id={`${uid}-f0`}
                  type="text"
                  value={card.last_name || ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\s+/g, '');
                    onChange({
                      last_name: val,
                      name: `${val}${card.first_name || ''}`
                    });
                  }}
                  className="premium-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${uid}-f1`}>이름 (First Name)</label>
                <input
                  id={`${uid}-f1`}
                  type="text"
                  required
                  value={card.first_name || ''}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\s+/g, '');
                    onChange({
                      first_name: val,
                      name: `${card.last_name || ''}${val}`
                    });
                  }}
                  className="premium-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${uid}-f2`}>회사명</label>
                <input
                  id={`${uid}-f2`}
                  type="text"
                  value={card.company || ''}
                  onChange={(e) => onChange({ company: e.target.value })}
                  className="premium-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${uid}-f3`}>부서</label>
                <input
                  id={`${uid}-f3`}
                  type="text"
                  value={card.department || ''}
                  onChange={(e) => onChange({ department: e.target.value })}
                  className="premium-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${uid}-f4`}>직급/직책</label>
                <input
                  id={`${uid}-f4`}
                  type="text"
                  value={card.title || ''}
                  onChange={(e) => onChange({ title: e.target.value })}
                  className="premium-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${uid}-f5`}>핸드폰 번호</label>
                <input
                  id={`${uid}-f5`}
                  type="text"
                  value={card.mobile_phone || ''}
                  onChange={(e) => onChange({ mobile_phone: e.target.value })}
                  className="premium-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor={`${uid}-f6`}>사무실 전화번호</label>
                <input
                  id={`${uid}-f6`}
                  type="text"
                  value={card.office_phone || ''}
                  onChange={(e) => onChange({ office_phone: e.target.value })}
                  className="premium-input"
                />
              </div>
              <div className="form-group form-group-full">
                <label htmlFor={`${uid}-f7`}>이메일 주소</label>
                <input
                  id={`${uid}-f7`}
                  type="email"
                  value={card.email || ''}
                  onChange={(e) => onChange({ email: e.target.value })}
                  className="premium-input"
                />
              </div>
              <div className="form-group form-group-full">
                <label htmlFor={`${uid}-f8`}>주소</label>
                <input
                  id={`${uid}-f8`}
                  type="text"
                  value={card.address || ''}
                  onChange={(e) => onChange({ address: e.target.value })}
                  className="premium-input"
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '20px' }}>
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
            >
              취소
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary">
              <Save size={14} />
              명함 지갑에 보관
            </button>
          </div>
        </form>
      </div>
  );
}
