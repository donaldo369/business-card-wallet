'use client';

import React, { useEffect, useRef, useState } from 'react';
import Cropper from 'cropperjs';
import 'cropperjs/dist/cropper.css';
import { Crop, X, RefreshCw } from 'lucide-react';

export default function ImageCropper({ imageSrc, onCropComplete, onCancel }) {
  const imageRef = useRef(null);
  const cropperRef = useRef(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (imageRef.current) {
      cropperRef.current = new Cropper(imageRef.current, {
        aspectRatio: 1.586, // 신용카드 / 명함 국제 표준 비율 (85.6mm * 53.98mm)
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 0.85,
        restore: false,
        guides: true,
        center: true,
        highlight: false,
        cropBoxMovable: true,
        cropBoxResizable: true,
        toggleDragModeOnDblclick: false,
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
      // 고해상도로 캔버스 추출
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
      <div className="w-full max-w-2xl bg-[#0f0e17] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80">
          <h3 className="text-base font-semibold text-slate-200">명함 영역 조정</h3>
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
          <button
            onClick={handleRotate}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors border border-slate-700/50"
          >
            <RefreshCw size={16} />
            회전
          </button>

          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-slate-900/50 hover:bg-slate-800 text-slate-400 rounded-xl text-sm font-medium transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleCrop}
              disabled={loading}
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
