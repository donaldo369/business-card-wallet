'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Image, MoreHorizontal, X, Zap, ZapOff } from 'lucide-react';

export default function CameraCapture({ onImageSelected, onClose, onManualInput }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // 실시간 오렌지 박스 드로잉용 오버레이 캔버스
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const detectIntervalRef = useRef(null);

  const [flashOn, setFlashOn] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [detectedBox, setDetectedBox] = useState(null); // 실시간 감지된 명함 좌표

  // 1. 카메라 스트림 구동
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const startCamera = async () => {
    try {
      stopCamera();
      const constraints = {
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
          setHasCameraPermission(true);
          // 실시간 명함 영역 감지 루프 시작
          startLiveDetection();
        };
      }
    } catch (err) {
      console.error('카메라 스트림 시작 실패:', err);
      setHasCameraPermission(false);
    }
  };

  const stopCamera = () => {
    if (detectIntervalRef.current) {
      clearInterval(detectIntervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  // 플래시 토글 (일부 모바일 브라우저/기기 지원)
  const toggleFlash = async () => {
    if (streamRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      const capabilities = track.getCapabilities?.();
      if (capabilities?.torch) {
        try {
          await track.applyConstraints({
            advanced: [{ torch: !flashOn }]
          });
          setFlashOn(!flashOn);
        } catch (e) {
          console.warn('플래시 제어 불가:', e);
        }
      } else {
        alert('이 기기에서는 플래시 제어를 지원하지 않습니다.');
      }
    }
  };

  // 2. 실시간 명함 영역 경계선 감지 루프
  const startLiveDetection = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    // 감지 연산용 히든 임시 캔버스
    const procCanvas = document.createElement('canvas');
    const procCtx = procCanvas.getContext('2d');

    detectIntervalRef.current = setInterval(() => {
      if (video.paused || video.ended) return;

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (!vW || !vH) return;

      // 오버레이 캔버스 크기 맞춤
      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      // 연산 속도를 위해 소형 해상도로 프레임 복사
      const scale = 0.2;
      procCanvas.width = vW * scale;
      procCanvas.height = vH * scale;
      
      try {
        procCtx.drawImage(video, 0, 0, procCanvas.width, procCanvas.height);
        const imgData = procCtx.getImageData(0, 0, procCanvas.width, procCanvas.height);
        const box = analyzeFrame(imgData, procCanvas.width, procCanvas.height);

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (box) {
          // 화면 뷰포트 크기로 비율 확대 변환
          const ratioX = canvas.width / procCanvas.width;
          const ratioY = canvas.height / procCanvas.height;

          const screenBox = {
            x: box.x * ratioX,
            y: box.y * ratioY,
            w: box.w * ratioX,
            h: box.h * ratioY
          };

          // 비디오 화면 좌표 기준 세팅
          setDetectedBox({
            x: box.x / scale,
            y: box.y / scale,
            w: box.w / scale,
            h: box.h / scale
          });

          // 주황색 반투명 오버레이 박스 드로잉 (사용자 스크린샷 가이드 매칭)
          ctx.fillStyle = 'rgba(255, 122, 89, 0.25)'; // 주황색 반투명
          ctx.strokeStyle = '#ff7a59'; // 주황 테두리
          ctx.lineWidth = 3;
          
          // 모서리가 둥근 사각형 그리기
          const r = 12;
          ctx.beginPath();
          ctx.moveTo(screenBox.x + r, screenBox.y);
          ctx.lineTo(screenBox.x + screenBox.w - r, screenBox.y);
          ctx.quadraticCurveTo(screenBox.x + screenBox.w, screenBox.y, screenBox.x + screenBox.w, screenBox.y + r);
          ctx.lineTo(screenBox.x + screenBox.w, screenBox.y + screenBox.h - r);
          ctx.quadraticCurveTo(screenBox.x + screenBox.w, screenBox.y + screenBox.h, screenBox.x + screenBox.w - r, screenBox.y + screenBox.h);
          ctx.lineTo(screenBox.x + r, screenBox.y + screenBox.h);
          ctx.quadraticCurveTo(screenBox.x, screenBox.y + screenBox.h, screenBox.x, screenBox.y + screenBox.h - r);
          ctx.lineTo(screenBox.x, screenBox.y + r);
          ctx.quadraticCurveTo(screenBox.x, screenBox.y, screenBox.x + r, screenBox.y);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          setDetectedBox(null);
        }
      } catch (e) {
        // 백그라운드 프레임 획득 에러시 무시
      }
    }, 200); // 초당 5회 연산
  };

  // 실시간 영상 분석 핵심 알고리즘 (배경 대비 외곽 경계선 검출)
  const analyzeFrame = (imgData, width, height) => {
    const data = imgData.data;
    const getPixel = (x, y) => {
      const idx = (y * width + x) * 4;
      return { r: data[idx], g: data[idx+1], b: data[idx+2] };
    };

    // 네 모퉁이 배경색 평균
    const corners = [getPixel(0, 0), getPixel(width-1, 0), getPixel(0, height-1), getPixel(width-1, height-1)];
    const avgBg = {
      r: corners.reduce((acc, c) => acc + c.r, 0) / 4,
      g: corners.reduce((acc, c) => acc + c.g, 0) / 4,
      b: corners.reduce((acc, c) => acc + c.b, 0) / 4,
    };

    const colorDist = (c1, c2) => {
      return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
    };

    const threshold = 30;
    let top = 0, bottom = height - 1, left = 0, right = width - 1;

    // Top
    for (let y = 0; y < height; y++) {
      let found = false;
      for (let x = 0; x < width; x++) {
        if (colorDist(getPixel(x, y), avgBg) > threshold) { top = y; found = true; break; }
      }
      if (found) break;
    }

    // Bottom
    for (let y = height - 1; y >= 0; y--) {
      let found = false;
      for (let x = 0; x < width; x++) {
        if (colorDist(getPixel(x, y), avgBg) > threshold) { bottom = y; found = true; break; }
      }
      if (found) break;
    }

    // Left
    for (let x = 0; x < width; x++) {
      let found = false;
      for (let y = 0; y < height; y++) {
        if (colorDist(getPixel(x, y), avgBg) > threshold) { left = x; found = true; break; }
      }
      if (found) break;
    }

    // Right
    for (let x = width - 1; x >= 0; x--) {
      let found = false;
      for (let y = 0; y < height; y++) {
        if (colorDist(getPixel(x, y), avgBg) > threshold) { right = x; found = true; break; }
      }
      if (found) break;
    }

    const w = right - left;
    const h = bottom - top;

    // 감지 영역 크기가 명함 규격(최소 25% 이상 차지)으로 유효할 때만 반환
    if (w > width * 0.25 && h > height * 0.25) {
      return { x: left, y: top, w, h };
    }
    return null;
  };

  // 3. 사진 촬영 및 자동 자르기(Crop) 수행
  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const vW = video.videoWidth;
    const vH = video.videoHeight;
    if (!vW || !vH) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 자동 검출된 오렌지 박스가 있는 경우
    if (detectedBox) {
      // 캔버스 크기를 명함 크기만큼만 생성 (촬영 단계부터 자동 자르기 구현!)
      canvas.width = detectedBox.w;
      canvas.height = detectedBox.h;

      // 비디오 프레임에서 명함 영역만 슬라이스해서 복사
      ctx.drawImage(
        video,
        detectedBox.x, detectedBox.y, detectedBox.w, detectedBox.h, // Source
        0, 0, canvas.width, canvas.height // Destination
      );
    } else {
      // 감지 실패 시, 중앙 영역을 기본 명함 비율(1.58)로 자동 자르기
      const targetW = vW * 0.8;
      const targetH = targetW / 1.586;
      const startX = (vW - targetW) / 2;
      const startY = (vH - targetH) / 2;

      canvas.width = targetW;
      canvas.height = targetH;
      
      ctx.drawImage(
        video,
        startX, startY, targetW, targetH,
        0, 0, canvas.width, canvas.height
      );
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    onImageSelected(dataUrl); // 크롭 과정 없이 바로 업로드 및 OCR 단계로 전달
    stopCamera();
  };

  // 4. 사진첩 선택 시 처리
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          // 사진첩 이미지도 불러온 직후 바로 자동 경계 감지 후 크롭 처리!
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 사진첩 이미지 전용 자동 감지 수행
            const box = analyzeFrameImage(img);
            if (box) {
              canvas.width = box.w;
              canvas.height = box.h;
              ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
            } else {
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              ctx.drawImage(img, 0, 0);
            }

            const croppedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
            onImageSelected(croppedDataUrl);
          };
          img.src = event.target.result;
        }
      };
      reader.readAsDataURL(file);
      stopCamera();
    }
  };

  // 사진첩용 프레임 분석 헬퍼
  const analyzeFrameImage = (imgElement) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 0.2;
    canvas.width = imgElement.naturalWidth * scale;
    canvas.height = imgElement.naturalHeight * scale;
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const box = analyzeFrame(imgData, canvas.width, canvas.height);
    if (box) {
      return {
        x: box.x / scale,
        y: box.y / scale,
        w: box.w / scale,
        h: box.h / scale
      };
    }
    return null;
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000000',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        color: '#ffffff',
        fontFamily: 'system-ui, sans-serif'
      }}
    >
      {/* 상단 제어 바 */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          background: 'rgba(0,0,0,0.6)',
          zIndex: 110
        }}
      >
        <button 
          onClick={toggleFlash} 
          style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '8px' }}
        >
          {flashOn ? <Zap size={22} className="color-violet" /> : <ZapOff size={22} />}
        </button>
        <button 
          onClick={() => { stopCamera(); onClose(); }} 
          style={{ background: 'none', border: 'none', color: '#ffffff', cursor: 'pointer', padding: '8px' }}
        >
          <X size={24} />
        </button>
      </div>

      {/* 실시간 비디오 영역 */}
      <div 
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {hasCameraPermission === false ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#cbd5e1' }}>
            <p style={{ marginBottom: '16px' }}>카메라에 접근할 수 없습니다.</p>
            <button 
              onClick={startCamera} 
              style={{ padding: '10px 20px', background: '#6366f1', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 'bold' }}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover'
              }}
            />
            {/* 실시간 오렌지 가이드 박스 캔버스 오버레이 */}
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 105
              }}
            />
            
            {/* 하단 텍스트 가이드 */}
            <div 
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                color: 'white',
                fontSize: '15px',
                fontWeight: '600',
                background: 'rgba(0,0,0,0.6)',
                padding: '6px 18px',
                borderRadius: '99px',
                pointerEvents: 'none',
                zIndex: 108
              }}
            >
              앞면
            </div>
          </>
        )}
      </div>

      {/* 하단 제어 바 (사진첩, 셔터, 다른수단 구조) */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '28px 20px 48px 20px', // 모바일 홈 인디케이터 고려 하단 패딩 확보
          background: 'rgba(0,0,0,0.85)',
          zIndex: 110
        }}
      >
        {/* 왼쪽: 사진첩 버튼 */}
        <button 
          onClick={() => fileInputRef.current?.click()}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            width: '60px'
          }}
        >
          <div 
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Image size={20} />
          </div>
          사진첩
        </button>

        {/* 중앙: 대형 셔터 버튼 (화이트 링 + 주황 단추) */}
        <button
          onClick={handleCapture}
          style={{
            width: '80px',
            height: '80px',
            borderRadius: '50%',
            backgroundColor: 'transparent',
            border: '5px solid #ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0
          }}
        >
          <div 
            style={{
              width: '62px',
              height: '62px',
              borderRadius: '50%',
              backgroundColor: '#ff5722', // 오렌지색 핵심 단추
              transition: 'transform 0.1s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.92)'}
            onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
          />
        </button>

        {/* 오른쪽: 다른 수단 (직접 입력) */}
        <button 
          onClick={() => { stopCamera(); onManualInput(); }}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '8px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '12px',
            fontWeight: '600',
            width: '60px'
          }}
        >
          <div 
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <MoreHorizontal size={20} />
          </div>
          다른 수단
        </button>
      </div>

      {/* 숨겨진 사진첩 선택용 File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        style={{ display: 'none' }}
      />
    </div>
  );
}
