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

  // 이전 프레임의 감지 결과를 저장하여 떨림 방지 (temporal smoothing)
  const prevBoxRef = useRef(null);

  // 실시간 명함 영역 경계선 감지 루프
  const startLiveDetection = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const procCanvas = document.createElement('canvas');
    const procCtx = procCanvas.getContext('2d');

    const drawDefaultGuideBox = (ctx, cW, cH) => {
      const targetW = cW * 0.82;
      const targetH = targetW / 1.586;
      const x = (cW - targetW) / 2;
      const y = (cH - targetH) / 2;

      ctx.strokeStyle = 'rgba(255, 122, 89, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);

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
      ctx.setLineDash([]);
    };

    // 감지 안 된 연속 프레임 카운터 (떨림 방지)
    let missCount = 0;

    detectIntervalRef.current = setInterval(() => {
      if (video.paused || video.ended || video.readyState < 2) return;

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (!vW || !vH) return;

      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      // 해상도 축소 (0.2 = 기존 0.15보다 더 세밀하게 분석)
      const scale = 0.2;
      procCanvas.width = Math.round(vW * scale);
      procCanvas.height = Math.round(vH * scale);
      
      try {
        procCtx.drawImage(video, 0, 0, procCanvas.width, procCanvas.height);
        const imgData = procCtx.getImageData(0, 0, procCanvas.width, procCanvas.height);
        
        let rawBox = detectCardBox(imgData, procCanvas.width, procCanvas.height);

        // temporal smoothing: 현재 결과를 이전 결과와 부드럽게 보간
        let smoothedBox = null;
        if (rawBox) {
          missCount = 0;
          if (prevBoxRef.current) {
            const alpha = 0.45; // 0=이전 프레임만, 1=현재 프레임만
            smoothedBox = {
              x: prevBoxRef.current.x * (1 - alpha) + rawBox.x * alpha,
              y: prevBoxRef.current.y * (1 - alpha) + rawBox.y * alpha,
              w: prevBoxRef.current.w * (1 - alpha) + rawBox.w * alpha,
              h: prevBoxRef.current.h * (1 - alpha) + rawBox.h * alpha,
            };
          } else {
            smoothedBox = rawBox;
          }
          prevBoxRef.current = smoothedBox;
        } else {
          missCount++;
          // 3프레임 연속 미감지 시에만 박스를 숨김 (깜빡임 방지)
          if (missCount < 3 && prevBoxRef.current) {
            smoothedBox = prevBoxRef.current;
          } else {
            prevBoxRef.current = null;
          }
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (smoothedBox) {
          const cW = canvas.width;
          const cH = canvas.height;

          const s = Math.max(cW / vW, cH / vH);
          const offsetX = (cW - vW * s) / 2;
          const offsetY = (cH - vH * s) / 2;

          const origX = smoothedBox.x / scale;
          const origY = smoothedBox.y / scale;
          const origW = smoothedBox.w / scale;
          const origH = smoothedBox.h / scale;

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

          ctx.fillStyle = 'rgba(255, 122, 89, 0.20)';
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
          drawDefaultGuideBox(ctx, canvas.width, canvas.height);
        }
      } catch (e) {
        // 에러 무시
      }
    }, 100); // 초당 10회
  };

  // ========== 핵심 감지 엔진 ==========
  // 전략 A: 행/열 밝기 투영 (배경과 명함의 밝기 차이를 행/열 단위로 분석)
  // 전략 B: Sobel 에지 감지 (에지 픽셀 분포로 바운딩 박스 추정)
  // 두 전략 중 하나라도 성공하면 결과 반환 (A 우선)
  const detectCardBox = (imgData, width, height) => {
    const data = imgData.data;
    const total = width * height;
    
    // 1. 그레이스케일 변환
    const grays = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      const idx = i * 4;
      grays[i] = Math.round(data[idx] * 0.299 + data[idx+1] * 0.587 + data[idx+2] * 0.114);
    }

    // ===== 전략 A: 행/열 밝기 투영 =====
    const resultA = detectByProjection(grays, width, height);
    if (resultA) return resultA;

    // ===== 전략 B: 에지 감지 (Fallback) =====
    const resultB = detectByEdge(grays, width, height);
    return resultB;
  };

  // 전략 A: 행/열 밝기 투영 분석
  const detectByProjection = (grays, width, height) => {
    // 화면 테두리 3px 줄의 평균 밝기를 배경 기준값으로 사용
    let borderSum = 0, borderCount = 0;
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < width; x++) { borderSum += grays[y * width + x]; borderCount++; }
    }
    for (let y = height - 3; y < height; y++) {
      for (let x = 0; x < width; x++) { borderSum += grays[y * width + x]; borderCount++; }
    }
    for (let y = 3; y < height - 3; y++) {
      for (let x = 0; x < 3; x++) { borderSum += grays[y * width + x]; borderCount++; }
      for (let x = width - 3; x < width; x++) { borderSum += grays[y * width + x]; borderCount++; }
    }
    const bgAvg = borderSum / borderCount;

    // 각 행의 평균 밝기가 배경과 얼마나 다른지 계산
    const rowDiff = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = 0; x < width; x++) {
        sum += Math.abs(grays[y * width + x] - bgAvg);
      }
      rowDiff[y] = sum / width;
    }

    // 각 열의 평균 밝기가 배경과 얼마나 다른지 계산
    const colDiff = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = 0; y < height; y++) {
        sum += Math.abs(grays[y * width + x] - bgAvg);
      }
      colDiff[x] = sum / height;
    }

    // 차이값의 중앙값을 계산하여 동적 임계치 결정
    const sortedRowDiff = Array.from(rowDiff).sort((a, b) => a - b);
    const sortedColDiff = Array.from(colDiff).sort((a, b) => a - b);
    const rowMedian = sortedRowDiff[Math.floor(height * 0.5)];
    const colMedian = sortedColDiff[Math.floor(width * 0.5)];

    // 임계치 = 중앙값의 1.3배 (배경과 뚜렷이 다른 행/열만 선택)
    const rowThreshold = Math.max(rowMedian * 1.3, 8);
    const colThreshold = Math.max(colMedian * 1.3, 8);

    // 위에서부터 첫 번째 유의미한 행 찾기
    let top = -1;
    for (let y = 2; y < height - 2; y++) {
      if (rowDiff[y] > rowThreshold) { top = y; break; }
    }
    let bottom = -1;
    for (let y = height - 3; y >= 2; y--) {
      if (rowDiff[y] > rowThreshold) { bottom = y; break; }
    }
    let left = -1;
    for (let x = 2; x < width - 2; x++) {
      if (colDiff[x] > colThreshold) { left = x; break; }
    }
    let right = -1;
    for (let x = width - 3; x >= 2; x--) {
      if (colDiff[x] > colThreshold) { right = x; break; }
    }

    if (top < 0 || bottom < 0 || left < 0 || right < 0) return null;

    const w = right - left;
    const h = bottom - top;
    if (w <= 0 || h <= 0) return null;

    if (w > width * 0.22 && w < width * 0.96 && h > height * 0.18 && h < height * 0.96) {
      const ratio = w / h;
      if (ratio > 0.35 && ratio < 2.8) {
        return { x: left, y: top, w, h };
      }
    }
    return null;
  };

  // 전략 B: Sobel 에지 감지 (Fallback)
  const detectByEdge = (grays, width, height) => {
    const marginX = Math.floor(width * 0.05);
    const marginY = Math.floor(height * 0.05);
    
    const xs = [];
    const ys = [];

    for (let y = marginY; y < height - marginY; y++) {
      for (let x = marginX; x < width - marginX; x++) {
        const idx = y * width + x;
        const gx = grays[idx + 1] - grays[idx - 1];
        const gy = grays[idx + width] - grays[idx - width];
        const g = Math.abs(gx) + Math.abs(gy);

        if (g > 18) {
          xs.push(x);
          ys.push(y);
        }
      }
    }

    if (xs.length < 50) return null;

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

    if (w > width * 0.25 && w < width * 0.96 && h > height * 0.18 && h < height * 0.96) {
      const ratio = w / h;
      if (ratio > 0.35 && ratio < 2.8) {
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
