'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Settings, Search, Plus, Check, Mail, Phone, MapPin, 
  Building2, ExternalLink, Trash2, Edit3, 
  Save, X, FileText, Sparkles, AlertCircle, RefreshCw, Smartphone, History, ChevronDown,
  LogIn, LogOut, User, Lock
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getSupabaseClient } from '../lib/supabase';

const CameraCapture = dynamic(() => import('../components/CameraCapture'), { ssr: false });
const ImageCropper = dynamic(() => import('../components/ImageCropper'), { ssr: false });

export default function Home() {
  const [cards, setCards] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [croppedImage, setCroppedImage] = useState(null);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [viewingCard, setViewingCard] = useState(null);

  // 배치 스캔 상태
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState([]);

  // 중복 감지 상태
  const [duplicateInfo, setDuplicateInfo] = useState(null);
  const [showHistory, setShowHistory] = useState(false); // 상세 모달에서 이력 펼치기

  const [settings, setSettings] = useState({
    supabaseUrl: '',
    supabaseAnonKey: '',
    geminiKey: '',
    hubspotToken: '',
  });

  const [supabaseReady, setSupabaseReady] = useState(false);
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const fileInputRef = useRef(null);

  const handleAddNewCard = () => {
    const isMobile = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile) {
      setShowCapture(true);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleDesktopFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (files.length === 1) {
      // 단일 파일: 기존 플로우 (크롭 → OCR)
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSelectedImage(event.target.result);
        }
      };
      reader.readAsDataURL(files[0]);
    } else {
      // 복수 파일: 배치 처리
      const readPromises = files.map(file => new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target?.result);
        reader.readAsDataURL(file);
      }));

      Promise.all(readPromises).then((dataUrls) => {
        const validUrls = dataUrls.filter(Boolean);
        if (validUrls.length > 0) {
          handleBatchProcess(validUrls);
        }
      });
    }
    e.target.value = '';
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      let savedConfig = { supabaseUrl: '', supabaseAnonKey: '', geminiKey: '', hubspotToken: '' };
      try {
        savedConfig = {
          supabaseUrl: localStorage.getItem('supabase_url') || '',
          supabaseAnonKey: localStorage.getItem('supabase_anon_key') || '',
          geminiKey: localStorage.getItem('gemini_api_key') || '',
          hubspotToken: localStorage.getItem('hubspot_access_token') || '',
        };
      } catch (err) {
        console.warn('LocalStorage가 비활성화되어 있거나 접근할 수 없습니다 (Safari 개인정보 보호 브라우징 등):', err);
      }
      setSettings(savedConfig);

      const client = getSupabaseClient(
        savedConfig.supabaseUrl && savedConfig.supabaseAnonKey 
          ? { url: savedConfig.supabaseUrl, anonKey: savedConfig.supabaseAnonKey }
          : null
      );
      setSupabaseReady(!!client);

      if (client) {
        // 같은 사용자라면 새 객체로 갱신하지 않아 불필요한 재렌더/재로드를 막음
        const applyUser = (nextUser) => {
          setUser((prev) => {
            const prevId = prev?.id || null;
            const nextId = nextUser?.id || null;
            if (prevId === nextId) return prev;
            return nextUser;
          });
        };

        // 현재 세션 가져오기 및 상태 감지
        client.auth.getSession().then(({ data: { session } }) => {
          applyUser(session?.user || null);
        });

        const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
          applyUser(session?.user || null);
        });

        return () => subscription.unsubscribe();
      }
    }
  }, []);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('supabase_url', settings.supabaseUrl);
      localStorage.setItem('supabase_anon_key', settings.supabaseAnonKey);
      localStorage.setItem('gemini_api_key', settings.geminiKey);
      localStorage.setItem('hubspot_access_token', settings.hubspotToken);
    } catch (err) {
      console.error(err);
      alert('쿠키 및 로컬 저장소가 차단되어 설정을 저장할 수 없습니다.');
    }
    
    const client = getSupabaseClient({ url: settings.supabaseUrl, anonKey: settings.supabaseAnonKey });
    setSupabaseReady(!!client);
    setShowSettings(false);
    
    alert('설정이 안전하게 저장되었습니다.');
    if (client) {
      loadCards(client);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) {
      alert('Supabase 연결 설정이 필요합니다.');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await sb.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });
      if (error) throw error;
      setUser(data.user);
      setAuthPassword('');
    } catch (err) {
      alert(`인증 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const sb = getSupabaseClient();
    if (!sb) return;
    try {
      await sb.auth.signOut();
      setUser(null);
      setCards([]);
    } catch (err) {
      console.error(err);
    }
  };

  const loadCards = useCallback(async (client) => {
    const sb = client || getSupabaseClient();
    if (!sb) {
      setInitialLoading(false);
      return;
    }
    
    // 비로그인 상태면 카드를 불러오지 않음
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) {
      setCards([]);
      setInitialLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // user_id가 테이블에 있다면 user_id 필터링 적용 (동일 사용자의 정보만 보장)
      const { data, error } = await sb
        .from('business_cards')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) {
        // user_id 컬럼이 없을 경우를 위한 폴백
        const { data: fallbackData, error: fallbackError } = await sb
          .from('business_cards')
          .select('*')
          .order('created_at', { ascending: false });
        if (fallbackError) throw fallbackError;
        setCards(fallbackData || []);
      } else {
        setCards(data || []);
      }
    } catch (err) {
      console.error('명함 로드 에러:', err);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  // user.id가 바뀔 때만 카드 재로드 (객체 참조만 바뀌는 토큰 갱신 등에서는 트리거되지 않음)
  const userId = user?.id || null;
  useEffect(() => {
    if (supabaseReady) {
      loadCards();
    } else {
      setInitialLoading(false);
    }
  }, [supabaseReady, userId, loadCards]);

  const uploadImageToSupabase = async (base64Data) => {
    const sb = getSupabaseClient();
    if (!sb) throw new Error('Supabase가 연결되어 있지 않습니다.');

    const res = await fetch(base64Data);
    const blob = await res.blob();
    
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.jpg`;
    const filePath = `cards/${fileName}`;

    const { data, error } = await sb.storage
      .from('card-images')
      .upload(filePath, blob, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    const { data: { publicUrl } } = sb.storage
      .from('card-images')
      .getPublicUrl(filePath);

    return publicUrl;
  };

  // 업로드 전 이미지 축소: Gemini 처리 속도 + 업로드 시간 단축 (OCR 품질 유지 위해 1280px 유지)
  const compressForOCR = (dataUrl, maxDim = 1280, quality = 0.85) =>
    new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        const longest = Math.max(img.naturalWidth, img.naturalHeight);
        if (longest <= maxDim) {
          resolve(dataUrl);
          return;
        }
        const ratio = maxDim / longest;
        const w = Math.round(img.naturalWidth * ratio);
        const h = Math.round(img.naturalHeight * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = dataUrl;
    });

  const extractCardInfo = async (base64Image) => {
    setIsExtracting(true);
    try {
      const compact = await compressForOCR(base64Image);
      const res = await fetch(compact);
      const blob = await res.blob();
      const file = new File([blob], 'card.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('image', file);

      const headers = {};
      if (settings.geminiKey) {
        headers['x-gemini-key'] = settings.geminiKey;
      }

      const ocrRes = await fetch('/api/extract', {
        method: 'POST',
        headers,
        body: formData,
      });

      const result = await ocrRes.json();
      if (!ocrRes.ok) throw new Error(result.error || 'OCR 추출에 실패했습니다.');

      setEditingCard({
        ...result.data,
        id: null,
        image_url: base64Image
      });
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // 배치 스캔: 여러 장의 이미지를 동시 N장씩 병렬 OCR 처리 (Gemini RPM 한도 고려해 3 고정)
  const handleBatchProcess = async (images) => {
    setShowCapture(false);
    setBatchProcessing(true);
    setBatchProgress({ current: 0, total: images.length });
    setBatchResults([]);

    const CONCURRENCY = 3;
    const results = new Array(images.length);
    let completed = 0;
    let nextIndex = 0;

    const processOne = async (i) => {
      try {
        const compact = await compressForOCR(images[i]);
        const res = await fetch(compact);
        const blob = await res.blob();
        const file = new File([blob], `card_${i}.jpg`, { type: 'image/jpeg' });

        const formData = new FormData();
        formData.append('image', file);

        const headers = {};
        if (settings.geminiKey) {
          headers['x-gemini-key'] = settings.geminiKey;
        }

        const ocrRes = await fetch('/api/extract', {
          method: 'POST',
          headers,
          body: formData,
        });

        const result = await ocrRes.json();
        if (!ocrRes.ok) throw new Error(result.error || 'OCR 실패');

        results[i] = {
          ...result.data,
          id: null,
          image_url: images[i],
          _status: 'success'
        };
      } catch (err) {
        console.error(`이미지 ${i + 1} 처리 실패:`, err);
        results[i] = {
          name: `인식 실패 (${i + 1}번째)`,
          first_name: '', last_name: '', company: '', email: '',
          department: '', title: '', office_phone: '', mobile_phone: '', address: '',
          id: null,
          image_url: images[i],
          _status: 'error',
          _error: err.message
        };
      } finally {
        completed += 1;
        setBatchProgress({ current: completed, total: images.length });
      }
    };

    const worker = async () => {
      while (true) {
        const i = nextIndex++;
        if (i >= images.length) return;
        await processOne(i);
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, images.length) }, () => worker())
    );

    setBatchResults(results);
    setBatchProcessing(false);
  };

  // 배치 결과에서 개별 카드 편집 선택
  const handleSelectBatchResult = (index) => {
    const card = { ...batchResults[index] };
    delete card._status;
    delete card._error;
    setEditingCard(card);
  };

  // 배치 결과 전체 자동 저장
  const handleSaveBatchAll = async () => {
    const sb = getSupabaseClient();
    if (!sb) {
      alert('Supabase 연결 설정이 필요합니다.');
      return;
    }

    const successCards = batchResults.filter(c => c._status === 'success');
    if (successCards.length === 0) {
      alert('저장할 수 있는 명함이 없습니다.');
      return;
    }

    setLoading(true);
    let savedCount = 0;
    let updatedCount = 0;
    for (const card of successCards) {
      try {
        let finalImageUrl = card.image_url;
        if (card.image_url.startsWith('data:')) {
          finalImageUrl = await uploadImageToSupabase(card.image_url);
        }

        const { data: { session } } = await sb.auth.getSession();
        const cardData = {
          name: card.name,
          first_name: card.first_name,
          last_name: card.last_name,
          company: card.company,
          email: card.email,
          department: card.department,
          title: card.title,
          office_phone: card.office_phone,
          mobile_phone: card.mobile_phone,
          address: card.address,
          image_url: finalImageUrl,
          user_id: session?.user?.id || null,
        };

        // 중복 검사: 동일 이름+전화번호가 있으면 자동 업데이트
        const existing = await findDuplicate(card.name, card.mobile_phone);
        if (existing) {
          const { error } = await sb
            .from('business_cards')
            .update(cardData)
            .eq('id', existing.id);
          if (!error) updatedCount++;
        } else {
          const { error } = await sb.from('business_cards').insert([cardData]);
          if (!error) savedCount++;
        }
      } catch (err) {
        console.error('배치 저장 실패:', err);
      }
    }

    const parts = [];
    if (savedCount > 0) parts.push(`${savedCount}장 새로 추가`);
    if (updatedCount > 0) parts.push(`${updatedCount}장 업데이트`);
    alert(`처리 완료: ${parts.join(', ')}`);
    setBatchResults([]);
    loadCards();
    setLoading(false);
  };

  const handleCropComplete = async (croppedImg) => {
    setCroppedImage(croppedImg);
    setSelectedImage(null);
    setShowCapture(false);
    await extractCardInfo(croppedImg);
  };

  // 중복 명함 검사: 이름 + 핸드폰 번호로 DB 조회
  const findDuplicate = async (name, mobilePhone, excludeId = null) => {
    const sb = getSupabaseClient();
    if (!sb || !name || !mobilePhone) return null;

    // 전화번호에서 공백/하이픈 제거하여 비교
    const normalizedPhone = mobilePhone.replace(/[\s\-]/g, '');
    
    try {
      let query = sb.from('business_cards').select('*').eq('name', name);
      if (excludeId) {
        query = query.neq('id', excludeId);
      }
      const { data } = await query;
      
      if (data && data.length > 0) {
        // 정규화된 전화번호로 비교
        return data.find(card => 
          card.mobile_phone && card.mobile_phone.replace(/[\s\-]/g, '') === normalizedPhone
        ) || null;
      }
    } catch (err) {
      console.error('중복 검사 오류:', err);
    }
    return null;
  };

  // 중복 확인 후 기존 카드 업데이트 실행
  const handleDuplicateUpdate = async () => {
    if (!duplicateInfo) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    setLoading(true);
    try {
      const { error } = await sb
        .from('business_cards')
        .update(duplicateInfo.newCardData)
        .eq('id', duplicateInfo.existingCard.id);
      
      if (error) throw error;

      // HubSpot 연동된 카드면 자동 업데이트
      if (duplicateInfo.existingCard.hubspot_id) {
        try {
          await syncToHubSpot({
            ...duplicateInfo.newCardData,
            id: duplicateInfo.existingCard.id,
            hubspot_id: duplicateInfo.existingCard.hubspot_id
          });
        } catch (e) { console.warn('HubSpot 업데이트 실패:', e); }
      }

      alert('기존 명함이 업데이트되었습니다.');
      setEditingCard(null);
      setCroppedImage(null);
      setDuplicateInfo(null);
      loadCards();
    } catch (err) {
      alert(`업데이트 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 중복 무시하고 새로 추가
  const handleDuplicateAddNew = async () => {
    if (!duplicateInfo) return;
    const sb = getSupabaseClient();
    if (!sb) return;

    setLoading(true);
    try {
      const { error } = await sb.from('business_cards').insert([duplicateInfo.newCardData]);
      if (error) throw error;

      alert('새 명함이 추가되었습니다.');
      setEditingCard(null);
      setCroppedImage(null);
      setDuplicateInfo(null);
      loadCards();
    } catch (err) {
      alert(`저장 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCard = async (e) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) {
      alert('Supabase 연결 설정이 필요합니다.');
      return;
    }

    setLoading(true);
    try {
      let finalImageUrl = editingCard.image_url;

      if (editingCard.image_url.startsWith('data:')) {
        finalImageUrl = await uploadImageToSupabase(editingCard.image_url);
      }

      const { data: { session } } = await sb.auth.getSession();
      const cardData = {
        name: editingCard.name,
        first_name: editingCard.first_name,
        last_name: editingCard.last_name,
        company: editingCard.company,
        email: editingCard.email,
        department: editingCard.department,
        title: editingCard.title,
        office_phone: editingCard.office_phone,
        mobile_phone: editingCard.mobile_phone,
        address: editingCard.address,
        image_url: finalImageUrl,
        user_id: session?.user?.id || null,
      };

      if (editingCard.id) {
        // 기존 카드 수정 모드
        const { error } = await sb
          .from('business_cards')
          .update(cardData)
          .eq('id', editingCard.id);
        if (error) throw error;

        if (editingCard.hubspot_id) {
          try {
            await syncToHubSpot({ ...cardData, id: editingCard.id, hubspot_id: editingCard.hubspot_id });
          } catch (e) { console.warn('HubSpot 자동 업데이트 실패:', e); }
        }

        alert('명함이 성공적으로 저장되었습니다.');
      } else {
        // 새 카드 → 항상 새 레코드로 삽입 (이력 보존)
        const { error } = await sb.from('business_cards').insert([cardData]);
        if (error) throw error;

        // 중복 존재 여부 알림
        const existing = await findDuplicate(cardData.name, cardData.mobile_phone);
        if (existing) {
          alert(`명함이 저장되었습니다.\n${cardData.name} 님의 이전 명함 이력이 함께 보관됩니다.`);
        } else {
          alert('명함이 성공적으로 저장되었습니다.');
        }
      }

      setEditingCard(null);
      setCroppedImage(null);
      loadCards();
    } catch (err) {
      console.error(err);
      alert(`저장 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (id) => {
    if (!confirm('정말로 이 명함을 삭제하시겠습니까?')) return;
    
    const sb = getSupabaseClient();
    if (!sb) return;

    setLoading(true);
    try {
      const { error } = await sb
        .from('business_cards')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setViewingCard(null);
      loadCards();
      alert('명함이 삭제되었습니다.');
    } catch (err) {
      console.error(err);
      alert(`삭제 에러: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const syncToHubSpot = async (card) => {
    setLoading(true);
    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (settings.hubspotToken) {
        headers['x-hubspot-token'] = settings.hubspotToken;
      }

      const res = await fetch('/api/hubspot', {
        method: 'POST',
        headers,
        body: JSON.stringify(card),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'HubSpot 연동 실패');

      const sb = getSupabaseClient();
      if (sb) {
        await sb
          .from('business_cards')
          .update({ hubspot_id: result.id })
          .eq('id', card.id);
        
        if (viewingCard && viewingCard.id === card.id) {
          setViewingCard(prev => ({ ...prev, hubspot_id: result.id }));
        }
        loadCards();
      }

      alert('HubSpot 연락처에 정상적으로 등록되었습니다!');
    } catch (err) {
      console.error(err);
      alert(`HubSpot 연동 오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredCards = cards.filter(card => {
    const searchLower = searchQuery.toLowerCase();
    return (
      (card.name && card.name.toLowerCase().includes(searchLower)) ||
      (card.company && card.company.toLowerCase().includes(searchLower)) ||
      (card.email && card.email.toLowerCase().includes(searchLower)) ||
      (card.mobile_phone && card.mobile_phone.includes(searchLower))
    );
  });

  // 날짜별 그룹핑
  const groupedByDate = React.useMemo(() => {
    const groups = {};
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);

    filteredCards.forEach(card => {
      const d = new Date(card.created_at);
      const cardDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      
      let label;
      if (cardDate.getTime() === today.getTime()) {
        label = '오늘';
      } else if (cardDate.getTime() === yesterday.getTime()) {
        label = '어제';
      } else {
        label = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
      }

      if (!groups[label]) groups[label] = [];
      groups[label].push(card);
    });

    return Object.entries(groups);
  }, [filteredCards]);

  // 특정 카드의 변경 이력 조회 (name + mobile_phone 동일)
  const getCardHistory = (card) => {
    if (!card || !card.name || !card.mobile_phone) return [];
    const normalized = card.mobile_phone.replace(/[\s\-]/g, '');
    return cards
      .filter(c => 
        c.id !== card.id && 
        c.name === card.name && 
        c.mobile_phone && 
        c.mobile_phone.replace(/[\s\-]/g, '') === normalized
      )
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  return (
    <div className="app-container">
      {/* 헤더 섹션 */}
      <header className="header-container">
        <div className="logo-section">
          <div className="logo-icon-box">
            <Smartphone size={22} className="text-white" />
          </div>
          <div className="logo-title-group">
            <h1>Smart Card Wallet</h1>
            <p>명함 AI 관리 & CRM 연동</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {user && (
            <>
              <div className="user-profile-header">
                <User size={14} className="color-violet" />
                <span className="user-email-text">{user.email}</span>
                <button onClick={handleSignOut} className="signout-btn" title="로그아웃">
                  <LogOut size={16} />
                </button>
              </div>
              <button onClick={() => setShowSettings(true)} className="settings-btn" title="설정">
                <Settings size={20} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Supabase 미연결 경고 */}
      {!supabaseReady && !initialLoading && (
        <div className="alert-banner">
          <div className="alert-icon-box">
            <AlertCircle size={18} />
          </div>
          <div className="alert-content">
            <h4>Supabase 데이터베이스 연동이 필요합니다</h4>
            <p>명함을 저장하고 클라우드 동기화를 진행하기 위해 Supabase 프로젝트 키가 필요합니다.</p>
            <button onClick={() => setShowSettings(true)} className="alert-link-btn">
              연동 키 설정하러 가기
            </button>
          </div>
        </div>
      )}

      {/* 로그인 화면 */}
      {supabaseReady && !user && !initialLoading && (
        <div className="glass auth-container" style={{ margin: '40px auto', maxWidth: '400px', width: '100%', padding: '32px' }}>
          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{ display: 'inline-flex', padding: '12px', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '16px', marginBottom: '12px', color: 'var(--primary)' }}>
              <Lock size={28} />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: 800 }}>개인 명함첩 로그인</h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              이메일 주소로 로그인하여 안전하게 명함을 관리하세요.
            </p>
          </div>

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group">
              <label>이메일 주소</label>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="example@email.com"
                className="premium-input"
              />
            </div>
            <div className="form-group">
              <label>비밀번호</label>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="••••••••"
                className="premium-input"
              />
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '14px', borderRadius: '14px', marginTop: '8px' }}>
              {loading ? (
                <RefreshCw size={16} style={{ animation: 'spin 1s infinite linear' }} />
              ) : (
                <>
                  <LogIn size={16} style={{ marginRight: '8px' }} />
                  <span>로그인</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* 메인 콘텐츠 영역 (로그인 완료 시 노출) */}
      {user && (
        <main style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* 검색 및 명함 추가 바 */}
          <div className="actions-bar">
            <div className="search-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="이름, 회사명, 이메일, 전화번호 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="premium-input search-input"
              />
            </div>
            <button onClick={handleAddNewCard} className="btn btn-primary btn-add">
              <Plus size={18} />
              <span>새 명함 추가</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleDesktopFileChange}
              accept="image/*"
              multiple
              style={{ display: 'none' }}
            />
          </div>

          {/* 촬영 및 스캔 가이드 */}
          {showCapture && (
            <CameraCapture 
              onImageSelected={async (src) => {
                setShowCapture(false);
                await extractCardInfo(src);
              }}
              onBatchSelected={handleBatchProcess}
              onClose={() => setShowCapture(false)}
              onManualInput={() => {
                setShowCapture(false);
                setEditingCard({
                  id: null,
                  name: '',
                  first_name: '',
                  last_name: '',
                  company: '',
                  email: '',
                  department: '',
                  title: '',
                  office_phone: '',
                  mobile_phone: '',
                  address: '',
                  image_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="12">수동 입력</text></svg>'
                });
              }}
            />
          )}

          {/* OCR 데이터 파싱 중 로딩 상태 (단일) */}
          {isExtracting && (
            <div className="loading-overlay">
              <div className="spinner-relative">
                <div className="spinner"></div>
                <Sparkles size={24} className="spinner-icon" />
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>인공지능 정보 분석 중</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>명함 이미지로부터 이름, 연락처 등을 식별하고 있습니다...</p>
            </div>
          )}

        {/* 배치 처리 진행 중 오버레이 */}
        {batchProcessing && (
          <div className="loading-overlay">
            <div className="spinner-relative">
              <div className="spinner"></div>
              <Sparkles size={24} className="spinner-icon" />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '4px' }}>
              일괄 분석 중 ({batchProgress.current}/{batchProgress.total})
            </h3>
            <div style={{ width: '200px', height: '6px', background: 'rgba(255,255,255,0.15)', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
              <div style={{
                width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #6366f1, #a855f7)',
                borderRadius: '3px',
                transition: 'width 0.3s ease'
              }} />
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
              여러 장을 동시에 분석 중입니다... 잠시만 기다려 주세요.
            </p>
          </div>
        )}

        {/* 배치 처리 결과 목록 */}
        {batchResults.length > 0 && !editingCard && (
          <div className="glass" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 className="section-title">
                <Sparkles size={18} className="color-violet" />
                일괄 스캔 결과 ({batchResults.filter(c => c._status === 'success').length}/{batchResults.length}장 인식)
              </h3>
              <button
                onClick={() => setBatchResults([])}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {batchResults.map((card, idx) => (
                <div
                  key={idx}
                  onClick={() => card._status === 'success' && handleSelectBatchResult(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: card._status === 'success' ? 'rgba(99,102,241,0.1)' : 'rgba(239,68,68,0.1)',
                    borderRadius: '12px',
                    cursor: card._status === 'success' ? 'pointer' : 'default',
                    border: `1px solid ${card._status === 'success' ? 'rgba(99,102,241,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    transition: 'transform 0.15s, box-shadow 0.15s'
                  }}
                  onMouseEnter={(e) => card._status === 'success' && (e.currentTarget.style.transform = 'translateY(-1px)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={card.image_url}
                    alt={card.name || '명함'}
                    style={{
                      width: '64px',
                      height: '40px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      border: '1px solid rgba(255,255,255,0.1)'
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {card.name || `카드 ${idx + 1}`}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      {card._status === 'success'
                        ? `${card.company || ''}${card.title ? ' · ' + card.title : ''}`
                        : `❌ ${card._error || '인식 실패'}`
                      }
                    </div>
                  </div>
                  {card._status === 'success' && (
                    <div style={{ fontSize: '11px', color: '#6366f1', fontWeight: 600, flexShrink: 0 }}>편집 →</div>
                  )}
                </div>
              ))}
            </div>

            {batchResults.filter(c => c._status === 'success').length > 0 && (
              <button
                onClick={handleSaveBatchAll}
                disabled={loading}
                className="btn btn-primary"
                style={{ 
                  width: '100%', 
                  justifyContent: 'center', 
                  gap: '10px',
                  padding: '18px 24px',
                  fontSize: '17px',
                  fontWeight: 700,
                  borderRadius: '16px',
                  marginTop: '4px'
                }}
              >
                <Save size={22} />
                {loading ? '저장 중...' : `${batchResults.filter(c => c._status === 'success').length}장 전체 저장`}
              </button>
            )}
          </div>
        )}

        {/* 중복 명함 확인 모달 */}
        {duplicateInfo && (
          <div className="loading-overlay" style={{ zIndex: 200, padding: '20px' }}>
            <div className="glass" style={{ 
              padding: '28px', 
              maxWidth: '440px', 
              width: '100%',
              animation: 'fadeIn 0.2s ease'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <AlertCircle size={22} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  동일인 명함 발견
                </h3>
              </div>

              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: '1.5' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{duplicateInfo.existingCard.name}</strong> 님의 명함이 이미 등록되어 있습니다.
                기존 정보를 새 명함으로 업데이트하시겠습니까?
              </p>

              {/* 기존 vs 새 정보 비교 */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '1fr 1fr', 
                gap: '12px', 
                marginBottom: '20px',
                fontSize: '12px'
              }}>
                <div style={{ 
                  padding: '12px', 
                  background: 'rgba(239,68,68,0.08)', 
                  borderRadius: '10px',
                  border: '1px solid rgba(239,68,68,0.2)'
                }}>
                  <div style={{ fontWeight: 700, color: '#ef4444', marginBottom: '8px', fontSize: '11px' }}>📋 기존 정보</div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <div>{duplicateInfo.existingCard.company || '(회사 없음)'}</div>
                    <div>{duplicateInfo.existingCard.title || '(직함 없음)'}</div>
                    <div>{duplicateInfo.existingCard.email || '(이메일 없음)'}</div>
                  </div>
                </div>
                <div style={{ 
                  padding: '12px', 
                  background: 'rgba(34,197,94,0.08)', 
                  borderRadius: '10px',
                  border: '1px solid rgba(34,197,94,0.2)'
                }}>
                  <div style={{ fontWeight: 700, color: '#22c55e', marginBottom: '8px', fontSize: '11px' }}>✨ 새 정보</div>
                  <div style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <div>{duplicateInfo.newCardData.company || '(회사 없음)'}</div>
                    <div>{duplicateInfo.newCardData.title || '(직함 없음)'}</div>
                    <div>{duplicateInfo.newCardData.email || '(이메일 없음)'}</div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={handleDuplicateUpdate}
                  disabled={loading}
                  className="btn btn-primary"
                  style={{ 
                    width: '100%', justifyContent: 'center', gap: '8px',
                    padding: '14px', fontSize: '15px', fontWeight: 700, borderRadius: '12px'
                  }}
                >
                  <RefreshCw size={18} />
                  기존 명함 업데이트
                </button>
                <button
                  onClick={handleDuplicateAddNew}
                  disabled={loading}
                  style={{ 
                    width: '100%', padding: '14px', fontSize: '15px', fontWeight: 700, 
                    borderRadius: '12px', border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', 
                    justifyContent: 'center', gap: '8px'
                  }}
                >
                  <Plus size={18} />
                  새 명함으로 추가
                </button>
                <button
                  onClick={() => setDuplicateInfo(null)}
                  style={{ 
                    width: '100%', padding: '10px', fontSize: '13px',
                    background: 'none', border: 'none', color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 명함 정보 상세 입력 및 교정 (OCR 완료 후) */}
        {editingCard && !isExtracting && (
          <div className="glass" style={{ padding: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 className="section-title">
                <Sparkles size={18} className="color-violet" />
                추출 데이터 검토 및 교정
              </h3>
              <button
                onClick={() => {
                  setEditingCard(null);
                  setCroppedImage(null);
                }}
                className="modal-close-btn"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveCard} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="form-card-row">
                {/* 왼쪽 크롭된 이미지 썸네일 */}
                <div className="form-image-container">
                  <div className="biz-card-sim" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px', background: '#000' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                      src={editingCard.image_url} 
                      alt="Cropped card" 
                      style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: '8px' }}
                    />
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: '12px', letterSpacing: '0.05em' }}>
                    트림 완료된 명함 이미지
                  </span>
                </div>

                {/* 오른쪽 폼 입력 영역 */}
                <div className="form-grid" style={{ flex: 1 }}>
                  <div className="form-group">
                    <label>성 (Last Name)</label>
                    <input
                      type="text"
                      value={editingCard.last_name || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\s+/g, '');
                        setEditingCard({
                          ...editingCard,
                          last_name: val,
                          name: `${val}${editingCard.first_name || ''}`
                        });
                      }}
                      className="premium-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>이름 (First Name)</label>
                    <input
                      type="text"
                      required
                      value={editingCard.first_name || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\s+/g, '');
                        setEditingCard({
                          ...editingCard,
                          first_name: val,
                          name: `${editingCard.last_name || ''}${val}`
                        });
                      }}
                      className="premium-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>회사명</label>
                    <input
                      type="text"
                      value={editingCard.company || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, company: e.target.value })}
                      className="premium-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>부서</label>
                    <input
                      type="text"
                      value={editingCard.department || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, department: e.target.value })}
                      className="premium-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>직급/직책</label>
                    <input
                      type="text"
                      value={editingCard.title || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, title: e.target.value })}
                      className="premium-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>핸드폰 번호</label>
                    <input
                      type="text"
                      value={editingCard.mobile_phone || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, mobile_phone: e.target.value })}
                      className="premium-input"
                    />
                  </div>
                  <div className="form-group">
                    <label>사무실 전화번호</label>
                    <input
                      type="text"
                      value={editingCard.office_phone || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, office_phone: e.target.value })}
                      className="premium-input"
                    />
                  </div>
                  <div className="form-group form-group-full">
                    <label>이메일 주소</label>
                    <input
                      type="email"
                      value={editingCard.email || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, email: e.target.value })}
                      className="premium-input"
                    />
                  </div>
                  <div className="form-group form-group-full">
                    <label>주소</label>
                    <input
                      type="text"
                      value={editingCard.address || ''}
                      onChange={(e) => setEditingCard({ ...editingCard, address: e.target.value })}
                      className="premium-input"
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', paddingTop: '20px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCard(null);
                    setCroppedImage(null);
                  }}
                  className="btn btn-secondary"
                >
                  취소
                </button>
                <button type="submit" disabled={loading} className="btn btn-primary">
                  <Save size={14} />
                  명함 지갑에 보관
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 저장된 명함 목록 */}
        <section>
          <div className="section-header">
            <h2 className="section-title">
              <FileText size={18} className="color-violet" />
              내 명함 지갑
              <span className="count-badge">{filteredCards.length}개</span>
            </h2>
          </div>

          {initialLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
              <RefreshCw size={28} className="color-violet" style={{ animation: 'spin 1s infinite linear' }} />
            </div>
          ) : filteredCards.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon-box">
                <FileText size={24} />
              </div>
              <h3>저장된 명함이 없습니다</h3>
              <p>"새 명함 추가" 버튼을 눌러 첫 번째 명함을 카메라로 스캔하거나 이미지를 올려보세요.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {groupedByDate.map(([dateLabel, groupCards]) => (
                <div key={dateLabel} className="date-group-section">
                  <div className="date-group-header">
                    <span className="date-group-title">{dateLabel}</span>
                    <span className="date-group-count">{groupCards.length}개</span>
                  </div>
                  <div className="cards-grid">
                    {groupCards.map((card) => (
                      <div key={card.id} onClick={() => setViewingCard(card)} className="glass card-item">
                        {/* 왼쪽 명함 썸네일 */}
                        <div className="card-thumb">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={card.image_url} alt={card.name} />
                        </div>

                        {/* 오른쪽 정보 */}
                        <div className="card-info">
                          <div>
                            <div className="card-name-group">
                              <h4 className="card-name">{card.name}</h4>
                              <span className="card-title">{card.title}</span>
                            </div>
                            <p className="card-company">{card.company}</p>
                          </div>

                          <div className="card-meta-list">
                            {card.mobile_phone && (
                              <p className="card-meta-item">
                                <Phone size={11} />
                                {card.mobile_phone}
                              </p>
                            )}
                            {card.email && (
                              <p className="card-meta-item">
                                <Mail size={11} />
                                {card.email}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* HubSpot 상태 배지 */}
                        {card.hubspot_id && (
                          <div className="hubspot-badge" title="HubSpot 동기화됨">
                            <Check size={14} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      )}

      {/* 이미지 조절 크로퍼 */}
      {selectedImage && (
        <ImageCropper
          imageSrc={selectedImage}
          onCropComplete={handleCropComplete}
          onCancel={() => setSelectedImage(null)}
        />
      )}

      {/* 상세 보기 모달 */}
      {viewingCard && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>명함 상세 카드</h3>
              <button onClick={() => setViewingCard(null)} className="modal-close-btn">
                <X size={16} />
              </button>
            </div>

            <div className="modal-body">
              {/* 이미지 풀 뷰 */}
              <div className="detail-card-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={viewingCard.image_url} alt={viewingCard.name} />
              </div>

              {/* 디테일 텍스트 */}
              <div className="detail-info-block">
                <div className="detail-title-section">
                  <div className="detail-title-icon">
                    <Building2 size={18} />
                  </div>
                  <div className="detail-title-group">
                    <h2>{viewingCard.name}</h2>
                    <p>
                      {viewingCard.company} {viewingCard.department && ` • ${viewingCard.department}`} {viewingCard.title && ` • ${viewingCard.title}`}
                    </p>
                  </div>
                </div>

                <div className="detail-grid">
                  {viewingCard.mobile_phone && (
                    <div className="detail-item">
                      <Phone size={14} className="color-violet" />
                      <span>휴대폰: {viewingCard.mobile_phone}</span>
                    </div>
                  )}
                  {viewingCard.office_phone && (
                    <div className="detail-item">
                      <Phone size={14} className="color-slate" />
                      <span>사무실: {viewingCard.office_phone}</span>
                    </div>
                  )}
                  {viewingCard.email && (
                    <div className="detail-item detail-grid-full">
                      <Mail size={14} className="color-cyan" />
                      <span>이메일: {viewingCard.email}</span>
                    </div>
                  )}
                  {viewingCard.address && (
                    <div className="detail-item detail-grid-full">
                      <MapPin size={14} className="color-rose" />
                      <span>주소: {viewingCard.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                onClick={() => {
                  setEditingCard(viewingCard);
                  setViewingCard(null);
                }}
                className="btn btn-secondary"
              >
                <Edit3 size={14} />
                수정
              </button>

              <div className="modal-footer-right">
                <button onClick={() => handleDeleteCard(viewingCard.id)} className="btn btn-danger">
                  <Trash2 size={14} />
                  삭제
                </button>

                {viewingCard.hubspot_id ? (
                  <button 
                    onClick={() => syncToHubSpot(viewingCard)} 
                    disabled={loading} 
                    className="btn" 
                    style={{ background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.25)', color: '#34d399' }}
                  >
                    <Check size={14} />
                    HubSpot 업데이트
                  </button>
                ) : (
                  <button onClick={() => syncToHubSpot(viewingCard)} disabled={loading} className="btn btn-hubspot">
                    <ExternalLink size={14} />
                    HubSpot에 등록
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 설정 모달 */}
      {showSettings && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>시스템 연동 설정</h3>
              <button onClick={() => setShowSettings(false)} className="modal-close-btn">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Supabase URL</label>
                  <input
                    type="text"
                    placeholder="https://your-project.supabase.co"
                    value={settings.supabaseUrl}
                    onChange={(e) => setSettings({ ...settings, supabaseUrl: e.target.value })}
                    className="premium-input"
                  />
                </div>

                <div className="form-group">
                  <label>Supabase Anon Key</label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOi..."
                    value={settings.supabaseAnonKey}
                    onChange={(e) => setSettings({ ...settings, supabaseAnonKey: e.target.value })}
                    className="premium-input"
                  />
                </div>

                <div className="form-group">
                  <label>Gemini API Key</label>
                  <input
                    type="password"
                    placeholder="AIzaSy..."
                    value={settings.geminiKey}
                    onChange={(e) => setSettings({ ...settings, geminiKey: e.target.value })}
                    className="premium-input"
                  />
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    명함 OCR 및 구조화 분석에 사용됩니다. (서버 환경변수 우선 적용)
                  </p>
                </div>

                <div className="form-group">
                  <label>HubSpot Private App Token</label>
                  <input
                    type="password"
                    placeholder="pat-na1-..."
                    value={settings.hubspotToken}
                    onChange={(e) => setSettings({ ...settings, hubspotToken: e.target.value })}
                    className="premium-input"
                  />
                  <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    HubSpot CRM에 연락처를 생성하기 위한 토큰입니다. (서버 환경변수 우선 적용)
                  </p>
                </div>
              </div>

              <div className="modal-footer" style={{ justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowSettings(false)} className="btn btn-secondary">
                  취소
                </button>
                <button type="submit" className="btn btn-primary">
                  저장 및 활성화
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
