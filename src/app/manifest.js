export default function manifest() {
  return {
    name: 'Smart Card Wallet',
    short_name: 'Card Wallet',
    description: '명함을 촬영해 자동으로 텍스트를 추출하고 HubSpot과 동기화하는 개인용 명함첩.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0815',
    theme_color: '#0a0815',
    lang: 'ko',
    icons: [
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        src: '/apple-icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };
}
