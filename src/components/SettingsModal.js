'use client';

import React from 'react';
import { X } from 'lucide-react';

/** Supabase / Gemini / Claude / HubSpot 연동 키 설정. */
export default function SettingsModal({ settings, onChange, onSubmit, onClose }) {
  return (
      <div
        className="modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h3>시스템 연동 설정</h3>
            <button onClick={onClose} className="modal-close-btn">
              <X size={16} />
            </button>
          </div>

          <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="modal-body">
              <div className="form-group">
                <label>Supabase URL</label>
                <input
                  type="text"
                  placeholder="https://your-project.supabase.co"
                  value={settings.supabaseUrl}
                  onChange={(e) => onChange({ supabaseUrl: e.target.value })}
                  className="premium-input"
                />
              </div>

              <div className="form-group">
                <label>Supabase Anon Key</label>
                <input
                  type="password"
                  placeholder="eyJhbGciOi..."
                  value={settings.supabaseAnonKey}
                  onChange={(e) => onChange({ supabaseAnonKey: e.target.value })}
                  className="premium-input"
                />
              </div>

              <div className="form-group">
                <label>Gemini API Key</label>
                <input
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
                <label>Anthropic (Claude) API Key</label>
                <input
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
                <label>HubSpot Private App Token</label>
                <input
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
            </div>

            <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} className="btn btn-secondary">
                취소
              </button>
              <button type="submit" className="btn btn-primary">
                저장 및 활성화
              </button>
            </div>
          </form>
        </div>
      </div>
  );
}
