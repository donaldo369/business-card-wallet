'use client';

import React, { useId, useRef } from 'react';
import { quickDateOptions } from '../lib/meetingInfo.mjs';

/**
 * "만난 정보" 입력 박스 (날짜 · 행사명 · 메모 · HubSpot 전송 스위치).
 * 제어 컴포넌트: onChange 는 바뀐 필드만 담은 patch 를 넘기고, 병합은 호출자가 한다.
 * 행사명 정규화는 저장 시 호출자가 하므로 여기서는 원문을 유지한다.
 */
export default function MeetingInfoBox({ value, onChange, recentEvents = [], showSendSwitch = true, memoLabel, countLabel }) {
  const uid = useId();
  const dateRef = useRef(null);
  const quick = quickDateOptions(new Date());
  const isCustomDate = !!value.met_on && !quick.some(q => q.value === value.met_on);

  const openPicker = () => {
    const el = dateRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // 일부 브라우저는 showPicker 를 막는다 -> 아래 폴백
      }
    }
    el.focus();
    el.click();
  };

  const needle = (value.event_name || '').trim().toLowerCase();
  const suggestions = recentEvents.filter(name => {
    const n = name.toLowerCase();
    if (needle && n === needle) return false;
    return !needle || n.includes(needle);
  });

  return (
    <div className="meeting-info-box">
      <div className="meeting-info-title">
        🤝 만난 정보
        {countLabel && <span className="meeting-info-count">{countLabel}</span>}
      </div>

      <div className="form-group">
        <span id={`${uid}-date`}>만난 날짜</span>
        <div className="meeting-chip-row" role="group" aria-labelledby={`${uid}-date`}>
          {quick.map(q => (
            <button
              key={q.key}
              type="button"
              className={`group-chip${value.met_on === q.value ? ' group-chip-active' : ''}`}
              aria-pressed={value.met_on === q.value}
              onClick={() => onChange({ met_on: q.value })}
            >
              {q.label}
            </button>
          ))}
          <button
            type="button"
            className={`group-chip${isCustomDate ? ' group-chip-active' : ''}`}
            aria-pressed={isCustomDate}
            onClick={openPicker}
          >
            📅 {isCustomDate ? value.met_on : '날짜 선택'}
          </button>
          <input
            ref={dateRef}
            type="date"
            className="meeting-date-hidden"
            aria-label="만난 날짜 직접 선택"
            tabIndex={-1}
            value={value.met_on || ''}
            onChange={e => e.target.value && onChange({ met_on: e.target.value })}
          />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-event`}>행사명 (선택)</label>
        <input
          id={`${uid}-event`}
          type="text"
          className="premium-input"
          placeholder="예: 2026 서울 에듀테크 박람회"
          value={value.event_name || ''}
          onChange={e => onChange({ event_name: e.target.value })}
        />
        {suggestions.length > 0 && (
          <div className="meeting-chip-row" style={{ marginTop: '8px' }}>
            {suggestions.map(name => (
              <button
                key={name}
                type="button"
                className="group-chip"
                onClick={() => onChange({ event_name: name })}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor={`${uid}-memo`}>{memoLabel}</label>
        <textarea
          id={`${uid}-memo`}
          className="premium-input"
          rows={2}
          value={value.memo || ''}
          onChange={e => onChange({ memo: e.target.value })}
        />
      </div>

      {showSendSwitch && (
        <label className="meeting-send-switch" htmlFor={`${uid}-send`}>
          <input
            id={`${uid}-send`}
            type="checkbox"
            role="switch"
            checked={!!value.send}
            onChange={e => onChange({ send: e.target.checked })}
          />
          <span>HubSpot에도 보내기</span>
        </label>
      )}
    </div>
  );
}
