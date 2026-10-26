'use client';

import React from 'react';
import { CalendarDays } from 'lucide-react';
import { pendingParts, hasPending } from '../lib/meetingInfo.mjs';

// 'YYYY-MM-DD' -> 'YYYY.MM.DD'
const formatDate = (d) => (d ? String(d).slice(0, 10).replace(/-/g, '.') : '');

const memoStyle = { fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 };

/** 명함 상세의 만남 기록. 0건이면 아무것도 그리지 않는다. 텍스트만 렌더(HTML 아님). */
export default function MeetingHistory({ meetings, showHubSpotStatus }) {
  if (!meetings || meetings.length === 0) return null;
  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
        <CalendarDays size={16} className="color-violet" />
        <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
          만남 기록 ({meetings.length})
        </h4>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {meetings.map((m) => {
          const pending = showHubSpotStatus && hasPending(pendingParts(m));
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                padding: '10px 12px',
                background: 'rgba(99, 102, 241, 0.06)',
                border: '1px solid rgba(99, 102, 241, 0.14)',
                borderRadius: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatDate(m.met_on)}</span>
                {m.event_name && (
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: 'rgba(139, 92, 246, 0.12)',
                      border: '1px solid rgba(139, 92, 246, 0.3)',
                      color: '#7c3aed',
                    }}
                  >
                    {m.event_name}
                  </span>
                )}
                {pending && (
                  <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: '#d97706' }}>HubSpot 미반영</span>
                )}
              </div>
              {m.shared_memo && <p style={memoStyle}>{m.shared_memo}</p>}
              {m.personal_memo && <p style={memoStyle}>{m.personal_memo}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
