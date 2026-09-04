'use client';

import React, { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { Crop, X, RefreshCw, Sparkles } from 'lucide-react';

export default function ImageCropper({ imageSrc, onCropComplete, onCancel, stageLabel }) {
  const imageRef = useRef(null);
  const cropperRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  // 캔버스 기반 명함 경계 자동 감지
  // 카드 주변에 균일한 배경이 있을 때만 신뢰. 명함이 프레임을 꽉 채우면 null 반환.
  const detectCardBoundaries = (imgElement) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const scale = 0.2;
      canvas.width = Math.max(1, Math.floor(imgElement.naturalWidth * scale));
      canvas.height = Math.max(1, Math.floor(imgElement.naturalHeight * scale));
      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const width = canvas.width;
      const height = canvas.height;

      const getPixel = (x, y) => {
        const idx = (y * width + x) * 4;
        return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
      };
      const colorDist = (c1, c2) =>
        Math.sqrt((c1.r - c2.r) ** 2 + (c1.g - c2.g) ** 2 + (c1.b - c2.b) ** 2);

      // 1. 이미지 테두리 전체에서 여러 점을 샘플링하여 배경색 추정
      const perimeter = [];
      const samplesPerSide = 12;
      for (let i = 0; i < samplesPerSide; i++) {
        const t = (i + 0.5) / samplesPerSide;
        const px = Math.min(width - 1, Math.floor(t * width));
        const py = Math.min(height - 1, Math.floor(t * height));
        perimeter.push(getPixel(px, 0));
        perimeter.push(getPixel(px, height - 1));
        perimeter.push(getPixel(0, py));
        perimeter.push(getPixel(width - 1, py));
      }

      const avgBg = {
        r: perimeter.reduce((s, p) => s + p.r, 0) / perimeter.length,
        g: perimeter.reduce((s, p) => s + p.g, 0) / perimeter.length,
        b: perimeter.reduce((s, p) => s + p.b, 0) / perimeter.length,
      };

      // 2. 신뢰도 검사 — 테두리 색이 일관되지 않으면 카드가 프레임을 꽉 채운 것으로 간주하고 감지 포기
      const avgDeviation =
        perimeter.reduce((s, p) => s + colorDist(p, avgBg), 0) / perimeter.length;
      if (avgDeviation > 25) return null;

      // 3. 바깥쪽에서 안쪽으로 스캔하여 첫 배경 이탈 지점 찾기
      const threshold = 40;
      let top = 0, bottom = height - 1, left = 0, right = width - 1;

      for (let y = 0; y < height; y++) {
        let found = false;
        for (let x = 0; x < width; x++) {
          if (colorDist(getPixel(x, y), avgBg) > threshold) { top = y; found = true; break; }
        }
        if (found) break;
      }
      for (let y = height - 1; y >= 0; y--) {
        let found = false;
        for (let x = 0; x < width; x++) {
          if (colorDist(getPixel(x, y), avgBg) > threshold) { bottom = y; found = true; break; }
        }
        if (found) break;
      }
      for (let x = 0; x < width; x++) {
        let found = false;
        for (let y = 0; y < height; y++) {
          if (colorDist(getPixel(x, y), avgBg) > threshold) { left = x; found = true; break; }
        }
        if (found) break;
      }
      for (let x = width - 1; x >= 0; x--) {
        let found = false;
        for (let y = 0; y < height; y++) {
          if (colorDist(getPixel(x, y), avgBg) > threshold) { right = x; found = true; break; }
        }
        if (found) break;
      }

      const detectedW = right - left;
      const detectedH = bottom - top;

      // 4. 감지된 영역이 이미지의 40% 미만이면 카드가 아니라 내부 텍스트를 감싼 것 → 포기
      const areaRatio = (detectedW * detectedH) / (width * height);
      if (areaRatio < 0.4) return null;
      if (detectedW < width * 0.5 || detectedH < height * 0.5) return null;

      // 5. 안전 여백 3%를 추가하여 가장자리 잘림 방지
      const padX = width * 0.03;
      const padY = height * 0.03;
      const finalLeft = Math.max(0, left - padX);
      const finalTop = Math.max(0, top - padY);
      const finalRight = Math.min(width - 1, right + padX);
      const finalBottom = Math.min(height - 1, bottom + padY);

      // 원본 해상도 좌표로 환산
      return {
        left: finalLeft / scale,
        top: finalTop / scale,
        width: (finalRight - finalLeft) / scale,
        height: (finalBottom - finalTop) / scale,
      };
    } catch (e) {
      console.error('Auto detection error:', e);
      return null;
    }
  };

  useEffect(() => {
    if (imageRef.current) {
      cropperRef.current = new Cropper(imageRef.current, {
        // 자유 비율 — 사진 각도나 카드 형태가 표준과 달라도 잘림 없이 조절 가능
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 1,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        ready() {
          setAutoDetecting(true);
          const detected = detectCardBoundaries(imageRef.current);
          if (detected) {
            // setData는 원본 이미지 좌표계를 사용 (setCropBoxData는 컨테이너 좌표계)
            cropperRef.current.setData({
              x: detected.left,
              y: detected.top,
              width: detected.width,
              height: detected.height,
            });
          }
          // 감지 실패 시에는 autoCropArea: 1 로 이미 전체 이미지가 선택되어 있음
          setAutoDetecting(false);
        },
      });
    }

    return () => {
      if (cropperRef.current) {
        cropperRef.current.destroy();
      }
    };
  }, [imageSrc]);

  const handleCrop = () => {
    if (!cropperRef.current) return;
    setLoading(true);

    try {
      const canvas = cropperRef.current.getCroppedCanvas({
        maxWidth: 1200,
        maxHeight: 1200,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: 'high',
      });

      const croppedImage = canvas.toDataURL('image/jpeg', 0.9);
      onCropComplete(croppedImage);
    } catch (err) {
      console.error('이미지 트림 오류:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRotate = () => {
    if (cropperRef.current) {
      cropperRef.current.rotate(90);
    }
  };

  const handleAutoFit = () => {
    if (cropperRef.current && imageRef.current) {
      const detected = detectCardBoundaries(imageRef.current);
      if (detected) {
        cropperRef.current.setData({
          x: detected.left,
          y: detected.top,
          width: detected.width,
          height: detected.height,
        });
      } else {
        alert('명함 테두리를 감지할 수 없습니다. 수동으로 조절해 주세요.');
      }
    }
  };

  return (
    // 프로젝트에 Tailwind가 없으므로 globals.css의 모달 클래스 + 인라인 스타일 사용
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '680px' }}>
        {/* 헤더 */}
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} className="color-violet" />
            {stageLabel || '명함 영역 자동 맞춤'}
          </h3>
          <button onClick={onCancel} className="modal-close-btn" title="닫기">
            <X size={16} />
          </button>
        </div>

        {/* 크로퍼 에리어 */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={imageSrc}
            alt="Source card"
            style={{ display: 'block', maxWidth: '100%', maxHeight: '52vh' }}
          />
        </div>

        {/* 컨트롤 버튼 */}
        <div className="modal-footer">
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleRotate} className="btn btn-secondary" style={{ fontSize: '13px' }}>
              <RefreshCw size={16} />
              회전
            </button>
            <button onClick={handleAutoFit} className="btn btn-secondary" style={{ fontSize: '13px' }}>
              <Sparkles size={16} />
              자동 맞춤
            </button>
          </div>

          <div className="modal-footer-right">
            <button onClick={onCancel} className="btn btn-secondary" style={{ fontSize: '13px' }}>
              취소
            </button>
            <button
              onClick={handleCrop}
              disabled={loading || autoDetecting}
              className="btn btn-primary"
              style={{ fontSize: '13px', padding: '10px 20px', opacity: loading || autoDetecting ? 0.6 : 1 }}
            >
              <Crop size={16} />
              {loading ? '자르는 중...' : '트림 완료 (저장)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
