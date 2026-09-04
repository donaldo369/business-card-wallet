'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

/**
 * 오버레이 컨테이너. 768px 이상에서는 중앙 모달, 그 미만에서는 바텀시트로
 * 보인다. 시트일 때만 그래버가 나타나고 아래로 끌어 닫을 수 있다.
 */
export default function Sheet({ title, onClose, maxWidth = '520px', footer, footerAlign = 'end', children }) {
  const titleId = useId();
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleTouchStart = (e) => { startYRef.current = e.touches[0].clientY; };

  const handleTouchMove = (e) => {
    if (startYRef.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - startYRef.current));
  };

  const handleTouchEnd = () => {
    if (dragY > 100) onClose();
    setDragY(0);
    startYRef.current = null;
  };

  return (
    <div
      className="sheet-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="sheet-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth, transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        <div
          className="sheet-grabber"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button onClick={onClose} className="modal-close-btn" aria-label="닫기">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && (
          <div
            className="modal-footer"
            style={footerAlign === 'end' ? { justifyContent: 'flex-end' } : undefined}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
