'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Image as ImageIcon, MoreHorizontal, X, Zap, ZapOff } from 'lucide-react';

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

    const drawDefaultGuideBox = (ctx, cW, cH) => {
      const targetW = cW * 0.82;
      const targetH = targetW / 1.586; // 명함 가로세로 비율
      const x = (cW - targetW) / 2;
      const y = (cH - targetH) / 2;

      ctx.strokeStyle = 'rgba(255, 122, 89, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]); // 점선 가이드라인

      const r = 14;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + targetW - r, y);
      ctx.quadraticCurveTo(x + targetW, y, x + targetW, y + r);
      ctx.lineTo(x + targetW, y + targetH - r);
      ctx.quadraticCurveTo(x + targetW, y + targetH, x + targetW - r, y + targetH);
      ctx.lineTo(x + r, y + targetH);
      ctx.quadraticCurveTo(x, y + targetH, x, y + targetH - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]); // 점선 원복
    };

    detectIntervalRef.current = setInterval(() => {
      if (video.paused || video.ended || video.readyState < 2) return;

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (!vW || !vH) return;

      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      // 빠른 연산을 위해 해상도 대폭 축소
      const scale = 0.15;
      procCanvas.width = vW * scale;
      procCanvas.height = vH * scale;
      
      try {
        procCtx.drawImage(video, 0, 0, procCanvas.width, procCanvas.height);
        const imgData = procCtx.getImageData(0, 0, procCanvas.width, procCanvas.height);
        
        // 고성능 대비 영역 바운딩 박스 감지 적용 (회전/기울임 대응)
        const box = detectContrastBoundingBox(imgData, procCanvas.width, procCanvas.height);

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (box) {
          const cW = canvas.width;
          const cH = canvas.height;

          // object-fit: cover 배율 및 오프셋 계산
          const s = Math.max(cW / vW, cH / vH);
          const offsetX = (cW - vW * s) / 2;
          const offsetY = (cH - vH * s) / 2;

          // 원본 비디오 해상도로 복원
          const origX = box.x / scale;
          const origY = box.y / scale;
          const origW = box.w / scale;
          const origH = box.h / scale;

          const screenBox = {
            x: origX * s + offsetX,
            y: origY * s + offsetY,
            w: origW * s,
            h: origH * s
          };

          setDetectedBox({
            x: origX,
            y: origY,
            w: origW,
            h: origH
          });

          // 주황색 반투명 오버레이 박스 렌더링 (실시간 스냅)
          ctx.fillStyle = 'rgba(255, 122, 89, 0.24)';
          ctx.strokeStyle = '#ff7a59';
          ctx.lineWidth = 4;
          
          const r = 14;
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
          // 명함 감지 전에는 화면 중앙에 점선 가이드 박스 표시
          drawDefaultGuideBox(ctx, canvas.width, canvas.height);
        }
      } catch (e) {
        console.error('실시간 감지 루프 에러:', e);
      }
    }, 120); // 프레임 속도 개선 (초당 8회 감지)
  };

  // 실시간 에지(경계선) 감지 알고리즘 (로컬 그래디언트 기반으로 조명/배경 무관하게 명함 테두리 추적)
  const detectContrastBoundingBox = (imgData, width, height) => {
    const data = imgData.data;
    
    // 1. 빠른 연산을 위해 그레이스케일(밝기) 버퍼 생성
    const grays = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        // 인간 눈의 밝기 인지 비율 적용 (Luminance)
        grays[y * width + x] = data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114;
      }
    }

    // 화면 가장자리 8% 영역은 노이즈(손가락, 배경잡음) 방지를 위해 제외
    const marginX = Math.floor(width * 0.08);
    const marginY = Math.floor(height * 0.08);
    
    const xs = [];
    const ys = [];
    const gradThreshold = 22; // 에지 감지 감도 (낮을수록 민감, 높을수록 뚜렷한 선만 감지)

    // 2. 가로/세로 방향 로컬 그래디언트(경계 엣지) 계산
    for (let y = marginY; y < height - marginY; y++) {
      for (let x = marginX; x < width - marginX; x++) {
        const idx = y * width + x;
        
        // 1차 미분 근사 (인접 픽셀 차이)
        const gx = grays[idx + 1] - grays[idx - 1];
        const gy = grays[idx + width] - grays[idx - width];
        const g = Math.abs(gx) + Math.abs(gy); // 연산 속도를 위한 절대값의 합

        if (g > gradThreshold) {
          xs.push(x);
          ys.push(y);
        }
      }
    }

    // 감지된 에지 픽셀 수가 너무 적으면 카드 없음으로 판단
    if (xs.length < 60) return null;

    // 3. 외곽 오차(먼지, 미세 반사광) 제거를 위해 오름차순 정렬 후 상하위 5% 절삭 (Percentile Outlier Rejection)
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);

    const discard = Math.floor(xs.length * 0.05);
    const minX = xs[discard];
    const maxX = xs[xs.length - 1 - discard];
    const minY = ys[discard];
    const maxY = ys[ys.length - 1 - discard];

    const w = maxX - minX;
    const h = maxY - minY;
    
    if (w <= 0 || h <= 0) return null;

    // 4. 명함 크기 및 비율 검증 (너무 작거나 크지 않고 가로/세로 비율이 적절한지 체크)
    if (w > width * 0.30 && w < width * 0.95 && h > height * 0.22 && h < height * 0.95) {
      const ratio = w / h;
      // 세로형 명함(약 0.6) 및 가로형 명함(약 1.6)을 모두 포함하는 여유로운 오차범위 (0.45 ~ 2.2)
      if (ratio > 0.45 && ratio < 2.2) {
        return { x: minX, y: minY, w, h };
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
          const img = document.createElement('img');
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
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
    const scale = 0.15;
    canvas.width = imgElement.naturalWidth * scale;
    canvas.height = imgElement.naturalHeight * scale;
    ctx.drawImage(imgElement, 0, 0, canvas.width, canvas.height);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const box = detectContrastBoundingBox(imgData, canvas.width, canvas.height);
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
            <ImageIcon size={20} />
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
