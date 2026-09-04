'use client';

import React from 'react';
import Sheet from './Sheet';
import { Edit3, Plus, Trash2 } from 'lucide-react';
import { GROUP_COLORS, getGroupColor } from '../lib/groupColors';

/** 그룹 이름·색상 변경과 삭제. */
export default function GroupManageModal({
  groups, groupCounts, editingGroupId, editingGroupName,
  onStartRename, onChangeRenameValue, onCommitRename, onCancelRename,
  onSetColor, onDelete, onCreateNew, onClose,
}) {
  return (
    <Sheet title="그룹 관리" onClose={onClose} maxWidth="480px"
      footer={(
        <>
          <button
            type="button"
            onClick={onCreateNew}
            className="btn btn-primary"
          >
            <Plus size={14} /> 새 그룹
          </button>
        </>
      )}
    >
      {groups.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
          아직 그룹이 없습니다.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {groups.map(g => (
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
              {editingGroupId === g.id ? (
                <>
                  <input
                    autoFocus
                    value={editingGroupName}
                    onChange={(e) => onChangeRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onCommitRename(g.id);
                        else if (e.key === 'Escape') onCancelRename();
                      }}
                    className="premium-input"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => onCommitRename(g.id)}
                    className="btn btn-primary"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    저장
                  </button>
                  <button
                    type="button"
                    onClick={onCancelRename}
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <span
                    className="group-color-dot"
                    style={{ background: getGroupColor(g.color).solid }}
                  />
                  <span style={{ flex: 1, fontSize: '14px' }}>{g.name}</span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {groupCounts[g.id] || 0}개
                  </span>
                  <div className="manage-color-swatches">
                    {GROUP_COLORS.map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => onSetColor(g.id, c.key)}
                        className={`color-swatch color-swatch-sm ${g.color === c.key ? 'color-swatch-active' : ''}`}
                        style={{ background: c.solid }}
                        title={c.key}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onStartRename(g)}
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    <Edit3 size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(g.id)}
                    className="btn btn-danger"
                    style={{ padding: '6px 10px', fontSize: '12px' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
