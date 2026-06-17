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
  const [debugInfo, setDebugInfo] = useState('');

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

    let missCount = 0;
    let frameCount = 0;

    detectIntervalRef.current = setInterval(() => {
      if (video.paused || video.ended || video.readyState < 2) return;

      const vW = video.videoWidth;
      const vH = video.videoHeight;
      if (!vW || !vH) return;

      if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
        canvas.width = video.clientWidth;
        canvas.height = video.clientHeight;
      }

      // 해상도: 0.25 (기존 0.15~0.2보다 더 높은 해상도로 더 정확하게)
      const scale = 0.25;
      const pw = Math.round(vW * scale);
      const ph = Math.round(vH * scale);
      procCanvas.width = pw;
      procCanvas.height = ph;
      
      try {
        procCtx.drawImage(video, 0, 0, pw, ph);
        const imgData = procCtx.getImageData(0, 0, pw, ph);
        
        const rawBox = detectCardBox(imgData, pw, ph);

        // temporal smoothing
        let smoothedBox = null;
        if (rawBox) {
          missCount = 0;
          if (prevBoxRef.current) {
            const a = 0.5;
            smoothedBox = {
              x: prevBoxRef.current.x * (1 - a) + rawBox.x * a,
              y: prevBoxRef.current.y * (1 - a) + rawBox.y * a,
              w: prevBoxRef.current.w * (1 - a) + rawBox.w * a,
              h: prevBoxRef.current.h * (1 - a) + rawBox.h * a,
            };
          } else {
            smoothedBox = rawBox;
          }
          prevBoxRef.current = smoothedBox;
        } else {
          missCount++;
          if (missCount < 4 && prevBoxRef.current) {
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

          setDetectedBox({ x: origX, y: origY, w: origW, h: origH });

          // 굵은 주황색 실선 + 반투명 면
          ctx.fillStyle = 'rgba(255, 122, 89, 0.18)';
          ctx.strokeStyle = '#ff7a59';
          ctx.lineWidth = 4;
          
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

          // 네 모서리에 L자 코너 마크 추가 (감지 확인용)
          const cornerLen = Math.min(screenBox.w, screenBox.h) * 0.15;
          ctx.strokeStyle = '#00ff88';
          ctx.lineWidth = 3;
          ctx.setLineDash([]);
          // 좌상
          ctx.beginPath();
          ctx.moveTo(screenBox.x, screenBox.y + cornerLen);
          ctx.lineTo(screenBox.x, screenBox.y);
          ctx.lineTo(screenBox.x + cornerLen, screenBox.y);
          ctx.stroke();
          // 우상
          ctx.beginPath();
          ctx.moveTo(screenBox.x + screenBox.w - cornerLen, screenBox.y);
          ctx.lineTo(screenBox.x + screenBox.w, screenBox.y);
          ctx.lineTo(screenBox.x + screenBox.w, screenBox.y + cornerLen);
          ctx.stroke();
          // 좌하
          ctx.beginPath();
          ctx.moveTo(screenBox.x, screenBox.y + screenBox.h - cornerLen);
          ctx.lineTo(screenBox.x, screenBox.y + screenBox.h);
          ctx.lineTo(screenBox.x + cornerLen, screenBox.y + screenBox.h);
          ctx.stroke();
          // 우하
          ctx.beginPath();
          ctx.moveTo(screenBox.x + screenBox.w - cornerLen, screenBox.y + screenBox.h);
          ctx.lineTo(screenBox.x + screenBox.w, screenBox.y + screenBox.h);
          ctx.lineTo(screenBox.x + screenBox.w, screenBox.y + screenBox.h - cornerLen);
          ctx.stroke();
        } else {
          setDetectedBox(null);
          drawDefaultGuideBox(ctx, canvas.width, canvas.height);
        }

        // 디버그 정보 (10프레임마다 갱신)
        frameCount++;
        if (frameCount % 10 === 0) {
          setDebugInfo(rawBox 
            ? `감지됨 [${pw}×${ph}] box(${Math.round(rawBox.x)},${Math.round(rawBox.y)},${Math.round(rawBox.w)}×${Math.round(rawBox.h)})` 
            : `탐색중... [${pw}×${ph}] v=${vW}×${vH}`
          );
        }
      } catch (e) {
        setDebugInfo(`에러: ${e.message}`);
      }
    }, 100);
  };

  // ========== 핵심 감지 엔진 (RGB 색상 거리 기반) ==========
  const detectCardBox = (imgData, width, height) => {
    const data = imgData.data;

    // 1. 화면 테두리 픽셀들의 평균 RGB를 배경색으로 사용
    let bgR = 0, bgG = 0, bgB = 0, bgCount = 0;
    
    const sampleBorder = (x, y) => {
      const idx = (y * width + x) * 4;
      bgR += data[idx]; bgG += data[idx+1]; bgB += data[idx+2]; bgCount++;
    };
    
    // 상단 4줄, 하단 4줄, 좌측 4열, 우측 4열에서 샘플링
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < width; x++) sampleBorder(x, y);
    }
    for (let y = height - 4; y < height; y++) {
      for (let x = 0; x < width; x++) sampleBorder(x, y);
    }
    for (let y = 4; y < height - 4; y++) {
      for (let x = 0; x < 4; x++) sampleBorder(x, y);
      for (let x = width - 4; x < width; x++) sampleBorder(x, y);
    }
    
    bgR /= bgCount; bgG /= bgCount; bgB /= bgCount;

    // 2. 각 행의 배경과의 평균 RGB 색상 거리 계산
    const rowDiff = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const dr = data[idx] - bgR;
        const dg = data[idx+1] - bgG;
        const db = data[idx+2] - bgB;
        sum += Math.sqrt(dr * dr + dg * dg + db * db);
      }
      rowDiff[y] = sum / width;
    }

    // 3. 각 열의 배경과의 평균 RGB 색상 거리 계산
    const colDiff = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 4;
        const dr = data[idx] - bgR;
        const dg = data[idx+1] - bgG;
        const db = data[idx+2] - bgB;
        sum += Math.sqrt(dr * dr + dg * dg + db * db);
      }
      colDiff[x] = sum / height;
    }

    // 4. 동적 임계치: 25번째 백분위수 기준 (하위 25%보다 뚜렷이 높은 행/열만 선택)
    const sortedRow = Array.from(rowDiff).sort((a, b) => a - b);
    const sortedCol = Array.from(colDiff).sort((a, b) => a - b);
    
    const rowP25 = sortedRow[Math.floor(height * 0.25)];
    const colP25 = sortedCol[Math.floor(width * 0.25)];
    
    // 임계치: 하위 25%값 + 전체 범위의 20% (아주 작은 차이도 잡아냄)
    const rowRange = sortedRow[height - 1] - sortedRow[0];
    const colRange = sortedCol[width - 1] - sortedCol[0];
    
    const rowThreshold = rowP25 + Math.max(rowRange * 0.20, 5);
    const colThreshold = colP25 + Math.max(colRange * 0.20, 5);

    // 5. 경계 찾기
    let top = -1, bottom = -1, left = -1, right = -1;

    for (let y = 2; y < height - 2; y++) {
      if (rowDiff[y] > rowThreshold) { top = y; break; }
    }
    for (let y = height - 3; y >= 2; y--) {
      if (rowDiff[y] > rowThreshold) { bottom = y; break; }
    }
    for (let x = 2; x < width - 2; x++) {
      if (colDiff[x] > colThreshold) { left = x; break; }
    }
    for (let x = width - 3; x >= 2; x--) {
      if (colDiff[x] > colThreshold) { right = x; break; }
    }

    if (top < 0 || bottom < 0 || left < 0 || right < 0) return null;

    const w = right - left;
    const h = bottom - top;
    if (w <= 0 || h <= 0) return null;

    // 6. 최소 크기만 체크 (비율 제한 매우 관대)
    if (w > width * 0.15 && h > height * 0.10) {
      return { x: left, y: top, w, h };
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
    const box = detectCardBox(imgData, canvas.width, canvas.height);
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
            
            {/* 감지 상태 표시 */}
            <div 
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                color: detectedBox ? '#00ff88' : 'rgba(255,255,255,0.7)',
                fontSize: '11px',
                fontWeight: '600',
                background: 'rgba(0,0,0,0.7)',
                padding: '5px 14px',
                borderRadius: '99px',
                pointerEvents: 'none',
                zIndex: 108,
                fontFamily: 'monospace',
                whiteSpace: 'nowrap'
              }}
            >
              {debugInfo || '초기화 중...'}
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
