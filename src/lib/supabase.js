import { createClient } from '@supabase/supabase-js';

// 클라이언트 사이드에서 안전하게 Supabase 클라이언트 획득
export function getSupabaseClient(customConfig = null) {
  // 1. 직접 전달된 커스텀 설정이 있는 경우 우선
  if (customConfig?.url && customConfig?.anonKey) {
    return createClient(customConfig.url, customConfig.anonKey);
  }

  // 2. 환경 변수가 있는 경우
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (envUrl && envAnonKey) {
    return createClient(envUrl, envAnonKey);
  }

  // 3. 브라우저 localStorage에 저장된 설정이 있는 경우
  if (typeof window !== 'undefined') {
    try {
      const localUrl = localStorage.getItem('supabase_url');
      const localKey = localStorage.getItem('supabase_anon_key');
      if (localUrl && localKey) {
        return createClient(localUrl, localKey);
      }
    } catch (e) {
      console.warn('LocalStorage access blocked:', e);
    }
  }

  return null;
}
