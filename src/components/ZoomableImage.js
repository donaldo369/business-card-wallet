'use client';

import React, { useRef, useState, useCallback } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

export default function ZoomableImage({ src, alt, style }) {
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const [isInteracting, setIsInteracting] = useState(false);

  const stateRef = useRef({
    mode: null,
    initialDistance: 0,
    initialScale: 1,
    initialMidX: 0,
    initialMidY: 0,
    initialX: 0,
    initialY: 0,
    panStartX: 0,
    panStartY: 0,
    lastTapAt: 0,
  });

  const getDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getMidpoint = (touches) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  });

  const handleTouchStart = useCallback((e) => {
    e.stopPropagation();
    const s = stateRef.current;

    if (e.touches.length === 2) {
      e.preventDefault();
      s.mode = 'pinch';
      s.initialDistance = getDistance(e.touches);
      s.initialScale = transform.scale;
      s.initialX = transform.x;
      s.initialY = transform.y;
      const mid = getMidpoint(e.touches);
      s.initialMidX = mid.x;
      s.initialMidY = mid.y;
      setIsInteracting(true);
    } else if (e.touches.length === 1) {
      if (transform.scale > 1.01) {
        s.mode = 'pan';
        s.panStartX = e.touches[0].clientX - transform.x;
        s.panStartY = e.touches[0].clientY - transform.y;
        setIsInteracting(true);
      } else {
        const now = e.timeStamp || performance.now();
        if (now - s.lastTapAt < 300) {
          setTransform(
            transform.scale > 1.01
              ? { scale: 1, x: 0, y: 0 }
              : { scale: DOUBLE_TAP_SCALE, x: 0, y: 0 }
          );
          s.lastTapAt = 0;
        } else {
          s.lastTapAt = now;
        }
      }
    }
  }, [transform]);

  const handleTouchMove = useCallback((e) => {
    const s = stateRef.current;
    if (s.mode === 'pinch' && e.touches.length === 2) {
      e.preventDefault();
      e.stopPropagation();
      const newDist = getDistance(e.touches);
      const factor = newDist / (s.initialDistance || 1);
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s.initialScale * factor));
      const mid = getMidpoint(e.touches);
      const dx = mid.x - s.initialMidX;
      const dy = mid.y - s.initialMidY;
      setTransform({
        scale: newScale,
        x: s.initialX + dx,
        y: s.initialY + dy,
      });
    } else if (s.mode === 'pan' && e.touches.length === 1) {
      e.preventDefault();
      e.stopPropagation();
      setTransform((prev) => ({
        ...prev,
        x: e.touches[0].clientX - s.panStartX,
        y: e.touches[0].clientY - s.panStartY,
      }));
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    e.stopPropagation();
    if (e.touches.length === 0) {
      stateRef.current.mode = null;
      setIsInteracting(false);
      setTransform((prev) => {
        if (prev.scale <= 1.01) return { scale: 1, x: 0, y: 0 };
        return prev;
      });
    }
  }, []);

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          borderRadius: '12px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          transformOrigin: 'center center',
          transition: isInteracting ? 'none' : 'transform 0.22s ease',
          willChange: 'transform',
          WebkitUserDrag: 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
