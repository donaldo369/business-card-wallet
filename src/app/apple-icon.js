import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #818cf8 0%, #6366f1 50%, #4f46e5 100%)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: 120,
            height: 76,
            background: '#ffffff',
            borderRadius: 14,
            padding: 14,
            gap: 8,
            boxShadow: '0 10px 28px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #818cf8, #4f46e5)',
              }}
            />
            <div style={{ width: 52, height: 7, background: '#1e293b', borderRadius: 3 }} />
          </div>
          <div style={{ width: 78, height: 5, background: '#94a3b8', borderRadius: 2 }} />
          <div style={{ width: 60, height: 5, background: '#cbd5e1', borderRadius: 2 }} />
        </div>
      </div>
    ),
    { ...size }
  );
}
