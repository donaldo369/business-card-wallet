'use client';

import React from 'react';
import { Check, X } from 'lucide-react';
import { GROUP_COLORS } from '../lib/groupColors';

/** 새 그룹 이름과 색상을 받는다. */
export default function CreateGroupModal({ name, color, onNameChange, onColorChange, onCreate, onClose }) {
  return (
      <div
        className="modal-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="modal-content" style={{ maxWidth: '380px' }}>
          <div className="modal-header">
            <h3>새 그룹</h3>
            <button onClick={onClose} className="modal-close-btn">
              <X size={16} />
            </button>
          </div>
          <div className="modal-body">
            <div className="form-group">
              <label>이름</label>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && name.trim()) onCreate();
                  }}
                placeholder="예: 고객사, VIP"
                className="premium-input"
              />
            </div>
            <div className="form-group" style={{ marginTop: '12px' }}>
              <label>색상</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                {GROUP_COLORS.map(c => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => onColorChange(c.key)}
                    className={`color-swatch ${color === c.key ? 'color-swatch-active' : ''}`}
                    style={{ background: c.solid }}
                    title={c.key}
                  >
                    {color === c.key && <Check size={12} />}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} className="btn btn-secondary">
              취소
            </button>
            <button
              type="button"
              disabled={!name.trim()}
              onClick={onCreate}
              className="btn btn-primary"
            >
              만들기
            </button>
          </div>
        </div>
      </div>
  );
}
