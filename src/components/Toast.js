'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, Check, Info, X } from 'lucide-react';

const ToastContext = createContext(null);

/**
 * 토스트 알림과 확인 다이얼로그를 띄운다.
 *   const { toast, confirm } = useToast();
 *   toast.success('저장되었습니다.');
 *   if (await confirm({ message: '삭제할까요?', danger: true })) { ... }
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast()는 <ToastProvider> 안에서만 사용할 수 있습니다.');
  }
  return ctx;
}

const TOAST_DURATION = { success: 3500, info: 3500, error: 6000 };

const TOAST_STYLE = {
  success: { icon: Check, color: '#34d399', bg: 'rgba(16, 185, 129, 0.14)', border: 'rgba(16, 185, 129, 0.3)' },
  error: { icon: AlertCircle, color: '#fb7185', bg: 'rgba(244, 63, 94, 0.14)', border: 'rgba(244, 63, 94, 0.3)' },
  info: { icon: Info, color: '#a5b4fc', bg: 'rgba(99, 102, 241, 0.14)', border: 'rgba(99, 102, 241, 0.3)' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const confirmResolverRef = useRef(null);
  const idRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback((type, message) => {
    const text = typeof message === 'string' ? message : String(message ?? '');
    if (!text.trim()) return;

    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, type, message: text }]);
    timersRef.current.set(
      id,
      setTimeout(() => dismiss(id), TOAST_DURATION[type] ?? 3500)
    );
  }, [dismiss]);

  // 언마운트 시 남은 타이머 정리
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  const toast = useMemo(() => ({
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }), [push]);

  const confirm = useCallback((options) => {
    const config = typeof options === 'string' ? { message: options } : (options || {});
    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({
        title: config.title || '확인',
        message: config.message || '',
        confirmLabel: config.confirmLabel || '확인',
        cancelLabel: config.cancelLabel || '취소',
        danger: Boolean(config.danger),
      });
    });
  }, []);

  const settleConfirm = useCallback((result) => {
    setConfirmState(null);
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    if (resolve) resolve(result);
  }, []);

  // 확인 다이얼로그가 열려 있는 동안 Esc = 취소, Enter = 확인
  useEffect(() => {
    if (!confirmState) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') settleConfirm(false);
      else if (e.key === 'Enter') settleConfirm(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmState, settleConfirm]);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => {
          const style = TOAST_STYLE[t.type] ?? TOAST_STYLE.info;
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              className="toast-item"
              style={{ background: style.bg, borderColor: style.border }}
            >
              <Icon size={16} style={{ color: style.color, flexShrink: 0 }} />
              <span className="toast-message">{t.message}</span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="toast-close"
                aria-label="알림 닫기"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {confirmState && (
        <div
          className="modal-overlay"
          style={{ zIndex: 400 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) settleConfirm(false);
          }}
        >
          <div
            className="glass confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
          >
            <div className="confirm-dialog-head">
              <div
                className="confirm-dialog-icon"
                style={confirmState.danger
                  ? { background: 'rgba(244, 63, 94, 0.12)', color: '#fb7185' }
                  : { background: 'rgba(99, 102, 241, 0.12)', color: '#a5b4fc' }}
              >
                {confirmState.danger ? <AlertTriangle size={18} /> : <AlertCircle size={18} />}
              </div>
              <h3 id="confirm-dialog-title">{confirmState.title}</h3>
            </div>

            {confirmState.message && (
              <p className="confirm-dialog-message">{confirmState.message}</p>
            )}

            <div className="confirm-dialog-actions">
              <button
                type="button"
                onClick={() => settleConfirm(false)}
                className="btn btn-secondary"
              >
                {confirmState.cancelLabel}
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => settleConfirm(true)}
                className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`}
              >
                {confirmState.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ToastContext.Provider>
  );
}
