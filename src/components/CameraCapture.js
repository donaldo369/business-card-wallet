'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Image as ImageIcon, MoreHorizontal, X, Zap, ZapOff } from 'lucide-react';

export default function CameraCapture({ onImageSelected, onBatchSelected, onClose, onManualInput }) {
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

  // ========== 핵심 감지 엔진 (휘도 그래디언트 + 위치 사전확률) ==========
  // 배경/명함 색이 비슷해도 작은 명도 차만 있으면 에지를 잡아냅니다.
  // 가이드 박스를 사전확률(Gaussian)로 사용해 텍스트 노이즈에 휘둘리지 않고
  // 가장 명함 경계다운 에지를 선택합니다.
  const detectCardBox = (imgData, width, height) => {
    const data = imgData.data;
    const N = width * height;

    // 1. 그레이스케일(휘도) 변환
    const gray = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const idx = i * 4;
      gray[i] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }

    // 2. 행/열별 그래디언트 합산
    //    rowEdge[y] = 가로방향 에지(상/하 경계) 강도 평균
    //    colEdge[x] = 세로방향 에지(좌/우 경계) 강도 평균
    const xMargin = Math.max(2, Math.floor(width * 0.04));
    const yMargin = Math.max(2, Math.floor(height * 0.04));
    const rowEdge = new Float32Array(height);
    const colEdge = new Float32Array(width);

    for (let y = 2; y < height - 2; y++) {
      let sum = 0;
      const yp = (y + 2) * width;
      const ym = (y - 2) * width;
      for (let x = xMargin; x < width - xMargin; x++) {
        sum += Math.abs(gray[yp + x] - gray[ym + x]);
      }
      rowEdge[y] = sum / (width - 2 * xMargin);
    }

    for (let x = 2; x < width - 2; x++) {
      let sum = 0;
      for (let y = yMargin; y < height - yMargin; y++) {
        sum += Math.abs(gray[y * width + (x + 2)] - gray[y * width + (x - 2)]);
      }
      colEdge[x] = sum / (height - 2 * yMargin);
    }

    // 3. 에지 프로파일 스무딩 (작은 텍스트/노이즈 억제)
    const smooth = (arr) => {
      const n = arr.length;
      const out = new Float32Array(n);
      for (let i = 2; i < n - 2; i++) {
        out[i] = (arr[i - 2] + arr[i - 1] * 2 + arr[i] * 3 + arr[i + 1] * 2 + arr[i + 2]) / 9;
      }
      out[0] = arr[0]; out[1] = arr[1];
      out[n - 1] = arr[n - 1]; out[n - 2] = arr[n - 2];
      return out;
    };
    const rowSm = smooth(rowEdge);
    const colSm = smooth(colEdge);

    // 4. 가이드 박스 사전확률 (Gaussian)
    //    명함은 사용자가 가이드 박스 안에 맞추려고 하므로, 가이드 경계 근처를 더 신뢰
    const guideW = width * 0.82;
    const guideH = guideW / 1.586;
    const expectedTop = (height - guideH) / 2;
    const expectedBottom = (height + guideH) / 2;
    const expectedLeft = (width - guideW) / 2;
    const expectedRight = (width + guideW) / 2;
    const sigmaY = height * 0.22;
    const sigmaX = width * 0.22;

    const findBest = (arr, start, end, expected, sigma) => {
      let bestIdx = -1, bestScore = -1, bestVal = 0;
      const invTwoSigmaSq = 1 / (2 * sigma * sigma);
      for (let i = start; i < end; i++) {
        const d = i - expected;
        const prior = Math.exp(-(d * d) * invTwoSigmaSq);
        const score = arr[i] * prior;
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
          bestVal = arr[i];
        }
      }
      return { idx: bestIdx, val: bestVal };
    };

    // 5. 상/하/좌/우 경계 후보 탐색 (서로 다른 영역에서 분리해 찾음)
    const top = findBest(rowSm, 3, Math.floor(height * 0.5), expectedTop, sigmaY);
    const bottom = findBest(rowSm, Math.ceil(height * 0.5), height - 3, expectedBottom, sigmaY);
    const left = findBest(colSm, 3, Math.floor(width * 0.5), expectedLeft, sigmaX);
    const right = findBest(colSm, Math.ceil(width * 0.5), width - 3, expectedRight, sigmaX);

    if (top.idx < 0 || bottom.idx < 0 || left.idx < 0 || right.idx < 0) return null;

    const w = right.idx - left.idx;
    const h = bottom.idx - top.idx;
    if (w <= 0 || h <= 0) return null;

    // 6. 크기 검증
    if (w < width * 0.30 || h < height * 0.18) return null;

    // 7. 종횡비 검증 (가로형 명함 1.586 기준 ±, 세로형까지 허용)
    const aspect = w / h;
    if (aspect < 0.55 || aspect > 2.4) return null;

    // 8. 에지 강도가 주변보다 의미 있게 높은지 확인 (텍스트 라인 잡지 않게)
    //    선택된 위치의 강도가 행/열 평균의 일정 배수 이상이어야 함
    let rowMean = 0;
    for (let y = 0; y < height; y++) rowMean += rowSm[y];
    rowMean /= height;
    let colMean = 0;
    for (let x = 0; x < width; x++) colMean += colSm[x];
    colMean /= width;

    const rowMin = Math.max(rowMean * 1.15, 1.5);
    const colMin = Math.max(colMean * 1.15, 1.5);
    if (top.val < rowMin || bottom.val < rowMin) return null;
    if (left.val < colMin || right.val < colMin) return null;

    return { x: left.idx, y: top.idx, w, h };
  };

  const [capturedImages, setCapturedImages] = useState([]); // 배치 촬영 모드

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
    setCapturedImages(prev => [...prev, dataUrl]);
  };

  const handleBatchDone = () => {
    if (capturedImages.length === 0) return;
    stopCamera();
    if (capturedImages.length === 1) {
      onImageSelected(capturedImages[0]);
    } else {
      onBatchSelected(capturedImages);
    }
  };

  const handleRemoveCaptured = (index) => {
    setCapturedImages(prev => prev.filter((_, i) => i !== index));
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
    const scale = 0.25;
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

      {/* 촬영된 이미지 썸네일 스트립 (배치 모드) */}
      {capturedImages.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'rgba(0,0,0,0.9)',
            overflowX: 'auto',
            zIndex: 110
          }}
        >
          {capturedImages.map((img, idx) => (
            <div key={idx} style={{ position: 'relative', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img}
                alt={`촬영 ${idx + 1}`}
                style={{
                  width: '56px',
                  height: '36px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  border: '2px solid rgba(255,255,255,0.3)'
                }}
              />
              <button
                onClick={() => handleRemoveCaptured(idx)}
                style={{
                  position: 'absolute',
                  top: '-6px',
                  right: '-6px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: 'none',
                  color: 'white',
                  fontSize: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={handleBatchDone}
            style={{
              flexShrink: 0,
              padding: '8px 18px',
              background: '#6366f1',
              border: 'none',
              borderRadius: '20px',
              color: 'white',
              fontSize: '13px',
              fontWeight: '700',
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
          >
            완료 ({capturedImages.length}장)
          </button>
        </div>
      )}

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
