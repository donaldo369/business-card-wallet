'use client';

import React, { useId } from 'react';
import { quickDateOptions, toDateValue } from '../lib/meetingInfo.mjs';

/**
 * "만난 정보" 입력 박스 (날짜 · 행사명 · 메모 · HubSpot 전송 스위치).
 * 제어 컴포넌트: onChange 는 바뀐 필드만 담은 patch 를 넘기고, 병합은 호출자가 한다.
 * 행사명 정규화는 저장 시 호출자가 하므로 여기서는 원문을 유지한다.
 */
export default function MeetingInfoBox({ value, onChange, recentEvents = [], showSendSwitch = true, memoLabel, countLabel }) {
  const uid = useId();
  const quick = quickDateOptions(new Date());
  const isCustomDate = !!value.met_on && !quick.some(q => q.value === value.met_on);

  // 데스크톱 크롬 등은 날짜 입력칸 본문을 눌러도 달력이 안 열려서 직접 연다.
  // 모바일은 입력칸을 실제로 탭하면 기본 날짜 선택기가 열리므로 실패해도 무시한다.
  const openPicker = (e) => {
    try {
      e.currentTarget.showPicker?.();
    } catch {
      // 일부 브라우저는 showPicker 를 막는다 -> 기본 동작에 맡긴다
    }
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
          {/* 모바일 브라우저(특히 iOS Safari)는 코드로 날짜 선택기를 열 수 없어,
              투명한 실제 날짜 입력칸을 칩 위에 덮어 사용자의 탭이 입력칸에 직접 닿게 한다 */}
          <span className={`group-chip meeting-date-chip${isCustomDate ? ' group-chip-active' : ''}`}>
            📅 {isCustomDate ? value.met_on : '날짜 선택'}
            <input
              type="date"
              className="meeting-date-input"
              aria-label="만난 날짜 직접 선택"
              value={value.met_on || ''}
              max={toDateValue(new Date())}
              onClick={openPicker}
              onChange={e => e.target.value && onChange({ met_on: e.target.value })}
            />
          </span>
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
