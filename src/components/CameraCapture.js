'use client';

import React, { useRef } from 'react';
import { Upload } from 'lucide-react';

export default function CameraCapture({ onImageSelected }) {
  const fileInputRef = useRef(null);

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

  return (
    <div 
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '36px 24px',
        border: '2px dashed rgba(139, 92, 246, 0.3)',
        borderRadius: '24px',
        background: 'rgba(20, 18, 30, 0.45)',
        backdropFilter: 'blur(16px)',
        textAlign: 'center',
        transition: 'all 0.3s ease'
      }}
    >
      <div 
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#a78bfa',
          marginBottom: '20px'
        }}
      >
        <Upload size={32} />
      </div>

      <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>
        명함 등록하기
      </h3>
      <p style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '28px', maxWidth: '320px', lineHeight: '1.6' }}>
        버튼을 눌러 실시간으로 명함 사진을 촬영하거나, 기존 앨범/파일에서 명함 이미지를 선택할 수 있습니다.
      </p>

      {/* 스타일링된 커다란 파일 선택 버튼 */}
      <button
        onClick={() => fileInputRef.current?.click()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          width: '100%',
          maxWidth: '320px',
          padding: '18px 28px',
          background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%)',
          color: '#ffffff',
          border: 'none',
          borderRadius: '18px',
          fontSize: '16px',
          fontWeight: '700',
          cursor: 'pointer',
          boxShadow: '0 8px 25px rgba(99, 102, 241, 0.35)',
          transition: 'all 0.2s ease',
          WebkitTapHighlightColor: 'transparent'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 12px 28px rgba(99, 102, 241, 0.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 8px 25px rgba(99, 102, 241, 0.35)';
        }}
      >
        <Upload size={20} />
        사진 촬영 또는 선택
      </button>

      {/* 완전히 숨겨진 진짜 input[type=file] (capture 속성 제거하여 선택창 활성화) */}
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
