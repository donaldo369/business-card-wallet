'use client';

import React from 'react';
import { X } from 'lucide-react';

/** 다중 선택한 명함들을 그룹에 일괄 추가/제거한다. */
export default function BulkAssignModal({ groups, selectedIds, memberCountOf, onAssign, onRemove, onClose }) {
  return (
      <div
        className="modal-overlay"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="modal-content" style={{ maxWidth: '420px' }}>
          <div className="modal-header">
            <h3>그룹 선택 ({selectedIds.length}개)</h3>
            <button onClick={onClose} className="modal-close-btn">
              <X size={16} />
            </button>
          </div>
          <div className="modal-body">
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
              탭하면 선택한 명함을 해당 그룹에 추가합니다. 이미 포함된 경우 제외 처리할 수도 있습니다.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {groups.map(g => {
                const ids = selectedIds;
                const memberCount = memberCountOf(g.id);
                const allMembers = memberCount === ids.length;
                return (
                  <div
                    key={g.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'rgba(255,255,255,0.04)',
                    }}
                  >
                    <span style={{ flex: 1, fontSize: '14px' }}>{g.name}</span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {memberCount}/{ids.length}
                    </span>
                    {!allMembers && (
                      <button
                        type="button"
                        onClick={() => onAssign(g.id)}
                        className="btn btn-primary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        추가
                      </button>
                    )}
                    {memberCount > 0 && (
                      <button
                        type="button"
                        onClick={() => onRemove(g.id)}
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        제거
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
  );
}
