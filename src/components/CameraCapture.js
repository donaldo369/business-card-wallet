'use client';

import React, { useRef, useState } from 'react';
import { Camera, Upload, AlertCircle } from 'lucide-react';

export default function CameraCapture({ onImageSelected }) {
  const [useLiveCamera, setUseLiveCamera] = useState(false);
  const [error, setError] = useState(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const [stream, setStream] = useState(null);

  // 파일 선택/사진 촬영 완료 이벤트 처리
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          onImageSelected(event.target.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // 라이브 카메라 시작
  const startCamera = async () => {
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setUseLiveCamera(true);
    } catch (err) {
      console.error('카메라 시작 실패:', err);
      setError('카메라를 활성화할 수 없습니다. 대신 파일 업로드를 이용해주세요.');
    }
  };

  // 라이브 카메라 종료
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setStream(null);
    setUseLiveCamera(false);
  };

  // 라이브 카메라 촬영
  const captureSnapshot = () => {
    if (videoRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        onImageSelected(dataUrl);
        stopCamera();
      }
    }
  };

  return (
    <div className="w-full flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-700/60 rounded-3xl glass backdrop-blur-xl relative overflow-hidden group transition-all duration-300 hover:border-violet-500/50">
      {!useLiveCamera ? (
        <div className="flex flex-col items-center py-8 text-center w-full">
          <div className="w-16 h-16 rounded-full bg-violet-500/10 flex items-center justify-center text-violet-400 mb-4 group-hover:scale-110 transition-transform duration-300">
            <Camera size={32} />
          </div>
          <h3 className="text-lg font-semibold text-slate-200 mb-1">명함 촬영 또는 업로드</h3>
          <p className="text-sm text-slate-400 mb-6 max-w-xs">
            명함을 네모난 박스 안에 맞추어 촬영하면 더욱 깨끗한 이미지를 보관할 수 있습니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md justify-center">
            {/* 파일 업로드 버튼 */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-violet-600/20 w-full sm:w-auto"
            >
              <Upload size={18} />
              사진 올리기 / 촬영
            </button>

            {/* 라이브 카메라 시작 버튼 (PC/일부 지원 브라우저용) */}
            <button
              onClick={startCamera}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium border border-slate-700 transition-all duration-200 w-full sm:w-auto"
            >
              <Camera size={18} />
              웹 카메라 열기
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
            capture="environment"
          />

          {error && (
            <div className="mt-4 flex items-center gap-2 text-rose-400 bg-rose-500/10 px-4 py-2 rounded-xl text-xs">
              <AlertCircle size={14} />
              <span>{error}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="relative w-full aspect-[4/3] max-w-xl bg-black rounded-2xl overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* 명함 가이드라인 오버레이 */}
          <div className="absolute inset-0 border-[24px] border-black/60 pointer-events-none flex items-center justify-center">
            <div className="w-[85%] aspect-[1.58] border-2 border-dashed border-violet-400 rounded-lg shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] relative">
              <div className="scanner-laser"></div>
              <span className="absolute -top-7 left-1/2 transform -translate-x-1/2 text-[10px] font-medium tracking-wide text-violet-300 bg-black/80 px-2 py-0.5 rounded-full">
                이곳에 명함을 맞춰주세요
              </span>
            </div>
          </div>

          {/* 하단 제어 영역 */}
          <div className="absolute bottom-4 left-0 right-0 flex justify-center items-center gap-4 px-4">
            <button
              onClick={stopCamera}
              className="px-4 py-2 bg-slate-900/90 text-slate-300 hover:bg-slate-800 rounded-xl text-xs font-semibold border border-slate-700/50 backdrop-blur"
            >
              취소
            </button>
            <button
              onClick={captureSnapshot}
              className="w-12 h-12 bg-white hover:bg-slate-100 rounded-full flex items-center justify-center text-slate-900 shadow-xl transition-transform active:scale-95"
            >
              <Camera size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
