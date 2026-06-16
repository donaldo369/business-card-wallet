'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Image, MoreHorizontal, X, Zap, ZapOff } from 'lucide-react';

export default function CameraCapture({ onImageSelected, onClose, onManualInput }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // 실시간 오버레이 캔버스
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);
  const detectIntervalRef = useRef(null);

  const [flashOn, setFlashOn] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const [detectedBox, setDetectedBox] = useState(null); // 실시간 감지 좌표

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

  // 실시간 명함 영역 경계선 감지 루프
  const startLiveDetection = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const procCanvas = document.createElement('canvas');
    const procCtx = procCanvas.getContext('2d');

    detectIntervalRef.current = setInterval(() => {
      if (video.paused || video.ended) return;

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (!vW || !vH) return;

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
        
        // 고성능 로컬 그래디언트(엣지) 감지 알고리즘 적용
        const box = detectEdgesSobel(imgData, procCanvas.width, procCanvas.height);

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (box) {
          const ratioX = canvas.width / procCanvas.width;
          const ratioY = canvas.height / procCanvas.height;

          const screenBox = {
            x: box.x * ratioX,
            y: box.y * ratioY,
            w: box.w * ratioX,
            h: box.h * ratioY
          };

          setDetectedBox({
            x: box.x / scale,
            y: box.y / scale,
            w: box.w / scale,
            h: box.h / scale
          });

          // 주황색 반투명 오버레이 박스 렌더링
          ctx.fillStyle = 'rgba(255, 122, 89, 0.22)';
          ctx.strokeStyle = '#ff7a59';
          ctx.lineWidth = 3;
          
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
    }, 150); // 약 0.15초마다 감지 루프
  };

  // 로컬 미분 필터(Sobel/Gradient) 기반 명함 사각형 윤곽 검출 알고리즘
  const detectEdgesSobel = (imgData, width, height) => {
    const data = imgData.data;
    
    // 1. 그레이스케일(Grayscale) 변환 및 노이즈 제거용 엣지 맵 생성
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b; // 표준 그레이 밝기 변환
    }

    // 2. 인접 픽셀간 밝기 변화량(경사도) 계산
    const edge = new Uint8Array(width * height);
    const gradThreshold = 18; // 엣지로 분류할 최소 임계치
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        
        // 단순 차분 필터 (수평 & 수직 변화량 합산)
        const dx = gray[idx + 1] - gray[idx - 1];
        const dy = gray[(y + 1) * width + x] - gray[(y - 1) * width + x];
        const magnitude = Math.sqrt(dx * dx + dy * dy);
        
        edge[idx] = magnitude > gradThreshold ? 255 : 0;
      }
    }

    // 3. 외곽에서 안쪽으로 탐색하며 엣지 누적 밀도가 상승하는 선(Line) 검출
    let top = 0, bottom = height - 1, left = 0, right = width - 1;
    const lineRatioThreshold = 0.08; // 해당 라인의 엣지 비율 조건 (최소 8% 이상 엣지 존재)

    // Top 탐색
    for (let y = 4; y < height * 0.5; y++) {
      let edgeCount = 0;
      for (let x = 0; x < width; x++) {
        if (edge[y * width + x] > 0) edgeCount++;
      }
      if (edgeCount > width * lineRatioThreshold) {
        top = y;
        break;
      }
    }

    // Bottom 탐색
    for (let y = height - 5; y > height * 0.5; y--) {
      let edgeCount = 0;
      for (let x = 0; x < width; x++) {
        if (edge[y * width + x] > 0) edgeCount++;
      }
      if (edgeCount > width * lineRatioThreshold) {
        bottom = y;
        break;
      }
    }

    // Left 탐색
    for (let x = 4; x < width * 0.5; x++) {
      let edgeCount = 0;
      for (let y = 0; y < height; y++) {
        if (edge[y * width + x] > 0) edgeCount++;
      }
      if (edgeCount > height * lineRatioThreshold) {
        left = x;
        break;
      }
    }

    // Right 탐색
    for (let x = width - 5; x > width * 0.5; x--) {
      let edgeCount = 0;
      for (let y = 0; y < height; y++) {
        if (edge[y * width + x] > 0) edgeCount++;
      }
      if (edgeCount > height * lineRatioThreshold) {
        right = x;
        break;
      }
    }

    const w = right - left;
    const h = bottom - top;

    // 감지 영역이 너무 크거나(전체 화면 오검출) 너무 작은 경우 제외하는 안전 검사 추가
    if (w > width * 0.25 && w < width * 0.94 && h > height * 0.25 && h < height * 0.94) {
      // 명함의 표준 가로세로 비율(약 1.4 ~ 1.8 사이) 체크하여 오검출 방지
      const ratio = w / h;
      if (ratio > 1.2 && ratio < 2.0) {
        return { x: left, y: top, w, h };
      }
    }
    return null;
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;

    const vW = video.videoWidth;
    const vH = video.videoHeight;
    if (!vW || !vH) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (detectedBox) {
      canvas.width = detectedBox.w;
      canvas.height = detectedBox.h;
      ctx.drawImage(
        video,
        detectedBox.x, detectedBox.y, detectedBox.w, detectedBox.h,
        0, 0, canvas.width, canvas.height
      );
    } else {
      // 감지 실패 시, 중앙 영역 자동 자르기
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
    onImageSelected(dataUrl);
    stopCamera();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 사진첩 이미지도 동일한 에지 검출 헬퍼 적용
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

  const analyzeFrameImage = (imgElement) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = 0.2;
    canvas.width = imgElement.naturalWidth * scale;
    canvas.height = imgElement.naturalHeight * scale;
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const box = detectEdgesSobel(imgData, canvas.width, canvas.height);
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
          padding: '28px 20px 48px 20px',
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
              backgroundColor: '#ff5722',
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
