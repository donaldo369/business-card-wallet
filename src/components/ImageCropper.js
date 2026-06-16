'use client';

import React, { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { Crop, X, RefreshCw, Sparkles } from 'lucide-react';

export default function ImageCropper({ imageSrc, onCropComplete, onCancel }) {
  const imageRef = useRef(null);
  const cropperRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [autoDetecting, setAutoDetecting] = useState(false);

  // 캔버스 기반 간단한 명함 경계 자동 감지 함수
  const detectCardBoundaries = (imgElement) => {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // 빠른 연산을 위해 해상도 축소
      const scale = 0.2;
      canvas.width = imgElement.naturalWidth * scale;
      canvas.height = imgElement.naturalHeight * scale;
      ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const width = canvas.width;
      const height = canvas.height;

      // 1. 네 귀퉁이(모서리)의 평균 배경색 구하기
      const getPixel = (x, y) => {
        const idx = (y * width + x) * 4;
        return { r: data[idx], g: data[idx+1], b: data[idx+2] };
      };
      
      const corners = [getPixel(0, 0), getPixel(width-1, 0), getPixel(0, height-1), getPixel(width-1, height-1)];
      const avgBg = {
        r: corners.reduce((acc, c) => acc + c.r, 0) / 4,
        g: corners.reduce((acc, c) => acc + c.g, 0) / 4,
        b: corners.reduce((acc, c) => acc + c.b, 0) / 4,
      };

      // 색상 차이 계산 함수
      const colorDist = (c1, c2) => {
        return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
      };

      // 2. 바깥쪽에서 안쪽으로 탐색하며 경계(Edge) 감지
      const threshold = 35; // 배경과의 최소 색상 차이 임계값
      let top = 0, bottom = height - 1, left = 0, right = width - 1;

      // Top 탐색
      for (let y = 0; y < height; y++) {
        let edgeFound = false;
        for (let x = 0; x < width; x++) {
          if (colorDist(getPixel(x, y), avgBg) > threshold) {
            top = y;
            edgeFound = true;
            break;
          }
        }
        if (edgeFound) break;
      }

      // Bottom 탐색
      for (let y = height - 1; y >= 0; y--) {
        let edgeFound = false;
        for (let x = 0; x < width; x++) {
          if (colorDist(getPixel(x, y), avgBg) > threshold) {
            bottom = y;
            edgeFound = true;
            break;
          }
        }
        if (edgeFound) break;
      }

      // Left 탐색
      for (let x = 0; x < width; x++) {
        let edgeFound = false;
        for (let y = 0; y < height; y++) {
          if (colorDist(getPixel(x, y), avgBg) > threshold) {
            left = x;
            edgeFound = true;
            break;
          }
        }
        if (edgeFound) break;
      }

      // Right 탐색
      for (let x = width - 1; x >= 0; x--) {
        let edgeFound = false;
        for (let y = 0; y < height; y++) {
          if (colorDist(getPixel(x, y), avgBg) > threshold) {
            right = x;
            edgeFound = true;
            break;
          }
        }
        if (edgeFound) break;
      }

      // 감지 범위가 너무 작거나 유효하지 않은 경우 안전장치
      if (right - left < width * 0.2 || bottom - top < height * 0.2) {
        return null;
      }

      // 3. 원본 이미지 해상도로 변환하여 반환
      return {
        left: (left / scale),
        top: (top / scale),
        width: ((right - left) / scale),
        height: ((bottom - top) / scale)
      };
    } catch (e) {
      console.error('Auto detection error:', e);
      return null;
    }
  };

  useEffect(() => {
    if (imageRef.current) {
      cropperRef.current = new Cropper(imageRef.current, {
        aspectRatio: 1.586, // 신용카드 / 명함 표준 비율
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.9,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
        ready() {
          // 크로퍼 준비 완료 시 자동 명함 영역 감지 실행
          setAutoDetecting(true);
          const detected = detectCardBoundaries(imageRef.current);
          if (detected) {
            // 감지된 영역으로 크롭 상자 위치 변경 및 스냅
            cropperRef.current.setCropBoxData({
              left: detected.left,
              top: detected.top,
              width: detected.width,
              height: detected.height
            });
          }
          setAutoDetecting(false);
        }
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
        cropperRef.current.setCropBoxData({
          left: detected.left,
          top: detected.top,
          width: detected.width,
          height: detected.height
        });
      } else {
        alert('명함 테두리를 감지할 수 없습니다. 수동으로 조절해 주세요.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-2xl bg-[#0f0e17] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80">
          <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
            <Sparkles size={16} className="text-violet-400" />
            명함 영역 자동 맞춤
          </h3>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1 hover:bg-slate-800/50 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* 크로퍼 에리어 */}
        <div className="flex-1 overflow-hidden p-6 flex items-center justify-center bg-black/40">
          <div className="max-w-full max-h-[50vh] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Source card"
              className="block max-w-full"
            />
          </div>
        </div>

        {/* 컨트롤 버튼 */}
        <div className="px-6 py-4 bg-[#14121e] border-t border-slate-800/80 flex justify-between items-center gap-3">
          <div className="flex gap-2">
            <button
              onClick={handleRotate}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors border border-slate-700/50"
            >
              <RefreshCw size={16} />
              회전
            </button>
            <button
              onClick={handleAutoFit}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-900/40 hover:bg-violet-900/60 text-violet-300 rounded-xl text-sm font-medium transition-colors border border-violet-800/40"
            >
              <Sparkles size={16} />
              자동 맞춤
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-slate-900/50 hover:bg-slate-800 text-slate-400 rounded-xl text-sm font-medium transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleCrop}
              disabled={loading || autoDetecting}
              className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:bg-violet-800 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-violet-600/10"
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
