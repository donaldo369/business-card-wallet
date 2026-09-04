'use client';

import React from 'react';
import { LogIn, Lock, RefreshCw } from 'lucide-react';

export default function AuthPanel({ email, password, loading, onEmailChange, onPasswordChange, onSubmit }) {
  return (
    <div className="glass auth-container" style={{ margin: '40px auto', maxWidth: '400px', width: '100%', padding: '32px' }}>
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'inline-flex', padding: '12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '16px', marginBottom: '12px', color: 'var(--primary)' }}>
          <Lock size={28} />
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: 800 }}>개인 명함첩 로그인</h2>
        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          이메일 주소로 로그인하여 안전하게 명함을 관리하세요.
        </p>
      </div>

      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div className="form-group">
          <label>이메일 주소</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => onEmailChange(e.target.value)}
            placeholder="example@email.com"
            className="premium-input"
          />
        </div>
        <div className="form-group">
          <label>비밀번호</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            placeholder="••••••••"
            className="premium-input"
          />
        </div>

        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', borderRadius: '14px', marginTop: '8px' }}>
          {loading ? (
            <RefreshCw size={16} style={{ animation: 'spin 1s infinite linear' }} />
          ) : (
            <>
              <LogIn size={16} style={{ marginRight: '8px' }} />
              <span>로그인</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
