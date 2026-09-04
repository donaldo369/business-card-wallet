'use client';

import React, { useId } from 'react';
import Sheet from './Sheet';

/** Supabase / Gemini / Claude / HubSpot 연동 키 설정. */
export default function SettingsModal({ settings, onChange, onSubmit, onClose }) {
  const uid = useId();
  const formId = useId();

  return (
    <Sheet
      title="시스템 연동 설정"
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            취소
          </button>
          <button type="submit" form={formId} className="btn btn-primary">
            저장 및 활성화
          </button>
        </>
      )}
    >
      <form id={formId} onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="form-group">
          <label htmlFor={`${uid}-f0`}>Supabase URL</label>
          <input
                  id={`${uid}-f0`}
            type="text"
            placeholder="https://your-project.supabase.co"
            value={settings.supabaseUrl}
            onChange={(e) => onChange({ supabaseUrl: e.target.value })}
            className="premium-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-f1`}>Supabase Anon Key</label>
          <input
                  id={`${uid}-f1`}
            type="password"
            placeholder="eyJhbGciOi..."
            value={settings.supabaseAnonKey}
            onChange={(e) => onChange({ supabaseAnonKey: e.target.value })}
            className="premium-input"
          />
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-f2`}>Gemini API Key</label>
          <input
                  id={`${uid}-f2`}
            type="password"
            placeholder="AIzaSy..."
            value={settings.geminiKey}
            onChange={(e) => onChange({ geminiKey: e.target.value })}
            className="premium-input"
          />
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            명함 OCR 1순위 엔진. 무료 일일 한도 소진 시 Claude로 자동 폴백됩니다. (서버 환경변수 우선)
          </p>
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-f3`}>Anthropic (Claude) API Key</label>
          <input
                  id={`${uid}-f3`}
            type="password"
            placeholder="sk-ant-..."
            value={settings.anthropicKey}
            onChange={(e) => onChange({ anthropicKey: e.target.value })}
            className="premium-input"
          />
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            Gemini 한도 초과 시 자동 폴백용. Claude Haiku 4.5 사용 (명함 1장 약 4원). 비워두면 폴백 비활성화. (서버 환경변수 우선)
          </p>
        </div>

        <div className="form-group">
          <label htmlFor={`${uid}-f4`}>HubSpot Private App Token</label>
          <input
                  id={`${uid}-f4`}
            type="password"
            placeholder="pat-na1-..."
            value={settings.hubspotToken}
            onChange={(e) => onChange({ hubspotToken: e.target.value })}
            className="premium-input"
          />
          <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
            HubSpot CRM에 연락처를 생성하기 위한 토큰입니다. (서버 환경변수 우선 적용)
          </p>
        </div>
      </form>
    </Sheet>
  );
}
