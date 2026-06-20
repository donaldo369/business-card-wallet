import "./globals.css";

export const metadata = {
  title: "명함 인식 및 관리 시스템 (Smart Card Wallet)",
  description: "스마트폰으로 명함을 촬영해 자동으로 텍스트 정보를 추출하고 HubSpot과 동기화해 관리하세요.",
  manifest: "/manifest.webmanifest",
  applicationName: "Smart Card Wallet",
  appleWebApp: {
    capable: true,
    title: "Card Wallet",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0a0815",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>
        {/* 모바일 디버깅용 에러 출력 배너 */}
        <div 
          id="mobile-debug-log" 
          style={{
            position: 'fixed', 
            bottom: 0, 
            left: 0, 
            right: 0, 
            background: 'rgba(220, 38, 38, 0.95)', 
            color: 'white', 
            fontFamily: 'monospace', 
            fontSize: '11px', 
            padding: '12px', 
            zIndex: 999999, 
            maxHeight: '180px', 
            overflowY: 'auto', 
            display: 'none',
            borderTop: '2px solid white'
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>⚠️ 브라우저 스크립트 에러 감지:</div>
        </div>
        
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.onerror = function(msg, url, line, col, error) {
                var debugLog = document.getElementById('mobile-debug-log');
                if (debugLog) {
                  debugLog.style.display = 'block';
                  debugLog.innerHTML += '<div>• ' + msg + ' (Line: ' + line + ', Col: ' + col + ')</div>';
                }
                return false;
              };
              window.addEventListener('unhandledrejection', function(event) {
                var debugLog = document.getElementById('mobile-debug-log');
                if (debugLog) {
                  debugLog.style.display = 'block';
                  debugLog.innerHTML += '<div>• Unhandled Promise Rejection: ' + (event.reason ? event.reason.message || event.reason : 'unknown') + '</div>';
                }
              });
            `
          }}
        />
        {children}
      </body>
    </html>
  );
}
