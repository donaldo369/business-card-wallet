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

  // 대비 영역 감지 알고리즘 (기울임/각도에 무관하게 주황 박스를 기민하게 띄워줌)
  const detectContrastBoundingBox = (imgData, width, height) => {
    const data = imgData.data;
    
    const getPixel = (x, y) => {
      const idx = (y * width + x) * 4;
      return { r: data[idx], g: data[idx+1], b: data[idx+2] };
    };

    // 네 모퉁이 배경 샘플링
    const cornerSamples = [
      getPixel(2, 2), getPixel(width - 3, 2),
      getPixel(2, height - 3), getPixel(width - 3, height - 3),
      getPixel(Math.floor(width / 2), 2), getPixel(Math.floor(width / 2), height - 3)
    ];

    const avgBg = {
      r: cornerSamples.reduce((acc, c) => acc + c.r, 0) / cornerSamples.length,
      g: cornerSamples.reduce((acc, c) => acc + c.g, 0) / cornerSamples.length,
      b: cornerSamples.reduce((acc, c) => acc + c.b, 0) / cornerSamples.length,
    };

    const colorDist = (c1, c2) => {
      return Math.sqrt(Math.pow(c1.r - c2.r, 2) + Math.pow(c1.g - c2.g, 2) + Math.pow(c1.b - c2.b, 2));
    };

    // 가장자리 5% 노이즈 배제 영역
    const marginX = Math.floor(width * 0.05);
    const marginY = Math.floor(height * 0.05);
    
    const xs = [];
    const ys = [];
    const threshold = 28; // 유연한 감지를 위해 감도 완화

    const isBgBright = (avgBg.r + avgBg.g + avgBg.b) / 3 > 160;

    for (let y = marginY; y < height - marginY; y++) {
      for (let x = marginX; x < width - marginX; x++) {
        const pixel = getPixel(x, y);
        
        // 배경과 다른 색상이거나, 아주 밝은색(일반 흰색 명함 특성 반영)인 경우 명함 영역으로 판단
        const isContrast = colorDist(pixel, avgBg) > threshold;
        // 배경이 이미 밝은 경우(예: 흰 테이블/장판) 단순 밝기 필터링은 비활성화하여 오작동 방지
        const isBright = !isBgBright && ((pixel.r + pixel.g + pixel.b) / 3 > 165);

        if (isContrast || isBright) {
          xs.push(x);
          ys.push(y);
        }
      }
    }

    if (xs.length < 80) return null; // 최소 필터링 통과 조건

    // 오름차순 정렬하여 외곽의 노이즈/그림자/손가락 제거 (상하위 3% 절삭)
    xs.sort((a, b) => a - b);
    ys.sort((a, b) => a - b);

    const discard = Math.floor(xs.length * 0.03);
    const minX = xs[discard];
    const maxX = xs[xs.length - 1 - discard];
    const minY = ys[discard];
    const maxY = ys[ys.length - 1 - discard];

    const w = maxX - minX;
    const h = maxY - minY;
    
    if (w <= 0 || h <= 0) return null;

    const totalArea = (width - 2 * marginX) * (height - 2 * marginY);
    const density = xs.length / totalArea;

    // 감지 영역 크기 제약 완화 (더 멀리서 찍거나 작게 찍어도 감지됨)
    if (w > width * 0.20 && w < width * 0.98 && h > height * 0.18 && h < height * 0.98) {
      // 밀도 기준 완화
      if (density > 0.04 && density < 0.90) {
        const ratio = w / h;
        // 세로형 명함 및 기울어짐에 모두 기민하게 대응할 수 있도록 비율 범위 대폭 확장 (0.4 ~ 2.5)
        if (ratio > 0.4 && ratio < 2.5) {
          return { x: minX, y: minY, w, h };
        }
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
