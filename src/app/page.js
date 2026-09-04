'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Settings, Search, Plus, Check, Mail, Phone, MapPin,
  Building2, ExternalLink, Trash2, Edit3,
  Save, X, FileText, Sparkles, AlertCircle, RefreshCw, Smartphone, History,
  LogOut, User, Download
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { getSupabaseClient } from '../lib/supabase';
import { useToast } from '../components/Toast';
import AuthPanel from '../components/AuthPanel';
import CardList from '../components/CardList';
import CardDetail from '../components/CardDetail';
import CardEditForm from '../components/CardEditForm';
import BatchResults from '../components/BatchResults';
import DuplicateDialog from '../components/DuplicateDialog';
import SettingsModal from '../components/SettingsModal';
import GroupManageModal from '../components/GroupManageModal';
import CreateGroupModal from '../components/CreateGroupModal';
import BulkAssignModal from '../components/BulkAssignModal';
import Sheet from '../components/Sheet';
import AppShell from '../components/AppShell';
import GroupSidebar from '../components/GroupSidebar';
import { DEFAULT_GROUP_COLOR, getGroupColor } from '../lib/groupColors';
import { classifyPhone } from '../lib/phone';

const CameraCapture = dynamic(() => import('../components/CameraCapture'), { ssr: false });
const ImageCropper = dynamic(() => import('../components/ImageCropper'), { ssr: false });
const ZoomableImage = dynamic(() => import('../components/ZoomableImage'), { ssr: false });

const saveImageToDevice = async (src) => {
  if (!src) return;
  try {
    const res = await fetch(src);
    const blob = await res.blob();
    const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
    const fileName = `business-card-${Date.now()}.${ext === 'jpeg' ? 'jpg' : ext}`;
    const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '명함 이미지' });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (err) {
    console.error('이미지 저장 실패:', err);
    throw new Error('이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
};

export default function Home() {
  const { toast, confirm } = useToast();
  const [cards, setCards] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showCapture, setShowCapture] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textInputValue, setTextInputValue] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [dualPending, setDualPending] = useState(null); // { front, back, croppedFront } | null
  const [croppedImage, setCroppedImage] = useState(null);
  
  const [isExtracting, setIsExtracting] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  const [viewingCard, setViewingCard] = useState(null);
  const [lightboxImage, setLightboxImage] = useState(null);

  // 배치 스캔 상태
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });
  const [batchResults, setBatchResults] = useState([]);

  // 중복 감지 상태
  const [duplicateInfo, setDuplicateInfo] = useState(null);

  // 그룹(태그) 상태
  const [groups, setGroups] = useState([]);
  const [cardGroupMap, setCardGroupMap] = useState({}); // {card_id: [group_id, ...]}
  const [activeGroupId, setActiveGroupId] = useState(null); // null = 전체, 'ungrouped' = 그룹 없음
  const [showGroupManage, setShowGroupManage] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState('');

  // 다중 선택 모드
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());
  const [showBulkAssign, setShowBulkAssign] = useState(false);

  // 그룹 생성 모달
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(DEFAULT_GROUP_COLOR.key);

  const [settings, setSettings] = useState({
    supabaseUrl: '',
    supabaseAnonKey: '',
    geminiKey: '',
    anthropicKey: '',
    hubspotToken: '',
  });

  const [supabaseReady, setSupabaseReady] = useState(false);
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const fileInputRef = useRef(null);
  const editFormRef = useRef(null);
  const hasScrolledToFormRef = useRef(false);

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
      let savedConfig = { supabaseUrl: '', supabaseAnonKey: '', geminiKey: '', anthropicKey: '', hubspotToken: '' };
      try {
        savedConfig = {
          supabaseUrl: localStorage.getItem('supabase_url') || '',
          supabaseAnonKey: localStorage.getItem('supabase_anon_key') || '',
          geminiKey: localStorage.getItem('gemini_api_key') || '',
          anthropicKey: localStorage.getItem('anthropic_api_key') || '',
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

  // 카메라/파일/텍스트 입력으로 편집 폼이 열리면 자동으로 폼 위치로 스크롤 (모바일에서 페이지 하단에 렌더되기 때문에 필요)
  // 폼이 열리는 순간 한 번만 스크롤한다. editingCard는 입력할 때마다 바뀌므로
  // 그대로 두면 타이핑 중에 화면이 폼 상단으로 되돌아간다.
  useEffect(() => {
    const formOpen = !!editingCard && !isExtracting;
    if (!formOpen) {
      hasScrolledToFormRef.current = false;
      return;
    }
    if (hasScrolledToFormRef.current || !editFormRef.current) return;
    hasScrolledToFormRef.current = true;
    editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [editingCard, isExtracting]);

  const handleSaveSettings = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('supabase_url', settings.supabaseUrl);
      localStorage.setItem('supabase_anon_key', settings.supabaseAnonKey);
      localStorage.setItem('gemini_api_key', settings.geminiKey);
      localStorage.setItem('anthropic_api_key', settings.anthropicKey);
      localStorage.setItem('hubspot_access_token', settings.hubspotToken);
    } catch (err) {
      console.error(err);
      toast.error('쿠키 및 로컬 저장소가 차단되어 설정을 저장할 수 없습니다.');
    }
    
    const client = getSupabaseClient({ url: settings.supabaseUrl, anonKey: settings.supabaseAnonKey });
    setSupabaseReady(!!client);
    setShowSettings(false);
    
    toast.success('설정이 안전하게 저장되었습니다.');
    if (client) {
      loadCards(client);
    }
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) {
      toast.error('Supabase 연결 설정이 필요합니다.');
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
      toast.error(`인증 실패: ${err.message}`);
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

  const loadGroups = useCallback(async (client) => {
    const sb = client || getSupabaseClient();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) {
      setGroups([]);
      setCardGroupMap({});
      return;
    }
    try {
      const [{ data: groupsData, error: gErr }, { data: membersData, error: mErr }] = await Promise.all([
        sb.from('card_groups').select('*').eq('user_id', session.user.id).order('created_at', { ascending: true }),
        sb.from('card_group_members').select('card_id, group_id').eq('user_id', session.user.id),
      ]);
      if (gErr) throw gErr;
      if (mErr) throw mErr;
      setGroups(groupsData || []);
      const map = {};
      (membersData || []).forEach(({ card_id, group_id }) => {
        if (!map[card_id]) map[card_id] = [];
        map[card_id].push(group_id);
      });
      setCardGroupMap(map);
    } catch (err) {
      // 그룹 테이블이 아직 없을 수 있음 (마이그레이션 전). 조용히 무시.
      console.warn('그룹 로드 실패 (테이블 미생성 가능):', err.message);
      setGroups([]);
      setCardGroupMap({});
    }
  }, []);

  const createGroup = async (name, color) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const sb = getSupabaseClient();
    if (!sb) { toast.error('Supabase가 연결되어 있지 않습니다.'); return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) { toast.error('로그인이 필요합니다.'); return; }
    const { data, error } = await sb
      .from('card_groups')
      .insert({ user_id: session.user.id, name: trimmed, color: color || DEFAULT_GROUP_COLOR.key })
      .select()
      .single();
    if (error) {
      toast.error(`그룹 생성 실패: ${error.message}`);
      return;
    }
    setGroups(prev => [...prev, data]);
  };

  const setGroupColor = async (id, color) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const { error } = await sb.from('card_groups').update({ color }).eq('id', id);
    if (error) {
      toast.error(`색상 변경 실패: ${error.message}`);
      return;
    }
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, color } : g)));
  };

  const renameGroup = async (id, name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const { error } = await sb.from('card_groups').update({ name: trimmed }).eq('id', id);
    if (error) {
      toast.error(`이름 변경 실패: ${error.message}`);
      return;
    }
    setGroups(prev => prev.map(g => (g.id === id ? { ...g, name: trimmed } : g)));
  };

  const deleteGroup = async (id) => {
    const ok = await confirm({
      title: '그룹 삭제',
      message: '이 그룹을 삭제하시겠습니까? 명함 자체는 삭제되지 않습니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const { error } = await sb.from('card_groups').delete().eq('id', id);
    if (error) {
      toast.error(`삭제 실패: ${error.message}`);
      return;
    }
    setGroups(prev => prev.filter(g => g.id !== id));
    setCardGroupMap(prev => {
      const next = {};
      Object.entries(prev).forEach(([cardId, gids]) => {
        const filtered = gids.filter(gid => gid !== id);
        if (filtered.length) next[cardId] = filtered;
      });
      return next;
    });
    if (activeGroupId === id) setActiveGroupId(null);
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedCardIds(new Set());
  };

  const toggleCardSelection = (cardId) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const bulkAssignGroup = async (groupId) => {
    const ids = Array.from(selectedCardIds);
    if (!ids.length) return;
    const sb = getSupabaseClient();
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.user) { toast.error('로그인이 필요합니다.'); return; }

    // 이미 멤버인 카드는 제외하고 추가
    const toAdd = ids.filter(id => !(cardGroupMap[id] || []).includes(groupId));
    if (!toAdd.length) {
      toast.info('선택한 명함은 이미 이 그룹에 모두 포함되어 있습니다.');
      return;
    }
    const rows = toAdd.map(card_id => ({
      card_id, group_id: groupId, user_id: session.user.id,
    }));
    const { error } = await sb.from('card_group_members').insert(rows);
    if (error) { toast.error(`일괄 지정 실패: ${error.message}`); return; }

    setCardGroupMap(prev => {
      const next = { ...prev };
      toAdd.forEach(cardId => {
        next[cardId] = [...(next[cardId] || []), groupId];
      });
      return next;
    });
    setShowBulkAssign(false);
    exitSelectionMode();
  };

  const bulkRemoveFromGroup = async (groupId) => {
    const ids = Array.from(selectedCardIds);
    const toRemove = ids.filter(id => (cardGroupMap[id] || []).includes(groupId));
    if (!toRemove.length) {
      toast.info('선택한 명함 중 이 그룹에 포함된 명함이 없습니다.');
      return;
    }
    const sb = getSupabaseClient();
    if (!sb) return;
    const { error } = await sb
      .from('card_group_members')
      .delete()
      .in('card_id', toRemove)
      .eq('group_id', groupId);
    if (error) { toast.error(`해제 실패: ${error.message}`); return; }

    setCardGroupMap(prev => {
      const next = { ...prev };
      toRemove.forEach(cardId => {
        next[cardId] = (next[cardId] || []).filter(g => g !== groupId);
        if (!next[cardId].length) delete next[cardId];
      });
      return next;
    });
    setShowBulkAssign(false);
    exitSelectionMode();
  };

  const toggleCardGroup = async (cardId, groupId) => {
    const sb = getSupabaseClient();
    if (!sb) return;
    const current = cardGroupMap[cardId] || [];
    const isMember = current.includes(groupId);
    if (isMember) {
      const { error } = await sb
        .from('card_group_members')
        .delete()
        .eq('card_id', cardId)
        .eq('group_id', groupId);
      if (error) { toast.error(`해제 실패: ${error.message}`); return; }
      setCardGroupMap(prev => ({
        ...prev,
        [cardId]: (prev[cardId] || []).filter(g => g !== groupId),
      }));
    } else {
      const { data: { session } } = await sb.auth.getSession();
      const { error } = await sb
        .from('card_group_members')
        .insert({ card_id: cardId, group_id: groupId, user_id: session?.user?.id });
      if (error) { toast.error(`추가 실패: ${error.message}`); return; }
      setCardGroupMap(prev => ({
        ...prev,
        [cardId]: [...(prev[cardId] || []), groupId],
      }));
    }
  };

  // user.id가 바뀔 때만 카드 재로드 (객체 참조만 바뀌는 토큰 갱신 등에서는 트리거되지 않음)
  const userId = user?.id || null;
  useEffect(() => {
    if (supabaseReady) {
      loadCards();
      loadGroups();
    } else {
      setInitialLoading(false);
    }
  }, [supabaseReady, userId, loadCards, loadGroups]);

  useEffect(() => {
    if (!viewingCard) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setViewingCard(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewingCard]);

  useEffect(() => {
    if (!showSettings) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowSettings(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSettings]);

  useEffect(() => {
    if (!lightboxImage) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setLightboxImage(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxImage]);

  useEffect(() => {
    if (!showGroupManage) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowGroupManage(false);
        setEditingGroupId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showGroupManage]);

  useEffect(() => {
    if (!showBulkAssign) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowBulkAssign(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showBulkAssign]);

  useEffect(() => {
    if (!showCreateGroup) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowCreateGroup(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showCreateGroup]);

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

  const extractCardInfo = async (base64Image, backBase64 = null) => {
    setIsExtracting(true);
    try {
      const compact = await compressForOCR(base64Image);
      const res = await fetch(compact);
      const blob = await res.blob();
      const file = new File([blob], 'card.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('image', file);

      if (backBase64) {
        const backCompact = await compressForOCR(backBase64);
        const backRes = await fetch(backCompact);
        const backBlob = await backRes.blob();
        const backFile = new File([backBlob], 'card_back.jpg', { type: 'image/jpeg' });
        formData.append('image_back', backFile);
      }

      const headers = {};
      if (settings.geminiKey) {
        headers['x-gemini-key'] = settings.geminiKey;
      }
      if (settings.anthropicKey) {
        headers['x-anthropic-key'] = settings.anthropicKey;
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
        image_url: base64Image,
        back_image_url: backBase64,
      });
    } catch (err) {
      console.error(err);
      toast.error(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // 텍스트에서 명함 정보 추출: 사용자가 붙여넣은 텍스트 → /api/extract-text → 편집 폼
  const extractCardFromText = async (rawText) => {
    const text = (rawText || '').trim();
    if (!text) {
      toast.error('텍스트를 입력해 주세요.');
      return;
    }
    setIsExtracting(true);
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (settings.geminiKey) headers['x-gemini-key'] = settings.geminiKey;
      if (settings.anthropicKey) headers['x-anthropic-key'] = settings.anthropicKey;

      const res = await fetch('/api/extract-text', {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '텍스트 추출에 실패했습니다.');

      setShowTextInput(false);
      setTextInputValue('');
      setEditingCard({
        ...result.data,
        id: null,
        image_url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-family="sans-serif" font-size="12">텍스트 입력</text></svg>',
        back_image_url: null,
      });
    } catch (err) {
      console.error(err);
      toast.error(err.message);
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
        if (settings.anthropicKey) {
          headers['x-anthropic-key'] = settings.anthropicKey;
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
    // 저장 성공 시 일괄 결과 목록에서 어떤 항목을 제거할지 표시
    card._batchIndex = index;
    setEditingCard(card);
  };

  // 배치 결과 전체 자동 저장
  const handleSaveBatchAll = async () => {
    const sb = getSupabaseClient();
    if (!sb) {
      toast.error('Supabase 연결 설정이 필요합니다.');
      return;
    }

    const successCards = batchResults.filter(c => c._status === 'success');
    if (successCards.length === 0) {
      toast.info('저장할 수 있는 명함이 없습니다.');
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
          back_image_url: null,
          user_id: session?.user?.id || null,
        };

        // 중복 검사: 동일 이름+전화번호가 있으면 이전 값을 history에 누적 후 최신 정보로 덮어쓰기
        const existing = await findDuplicate(card.name, card.mobile_phone);
        if (existing) {
          const newHistory = [...(existing.history || []), makeHistoryEntry(existing)];
          const updatePayload = { ...cardData, history: newHistory, updated_at: new Date().toISOString() };
          delete updatePayload.user_id;
          delete updatePayload.back_image_url; // 배치는 단면만이므로 기존 뒷면 이미지 유지
          const { error } = await sb
            .from('business_cards')
            .update(updatePayload)
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
    toast.success(`처리 완료: ${parts.join(', ')}`);
    setBatchResults([]);
    loadCards();
    setLoading(false);
  };

  const handleDualSideSelected = (frontImg, backImg) => {
    setShowCapture(false);
    setDualPending({ front: frontImg, back: backImg, croppedFront: null });
    setSelectedImage(frontImg); // 앞면 크로퍼 오픈
  };

  const handleCropComplete = async (croppedImg) => {
    if (dualPending) {
      if (!dualPending.croppedFront) {
        // 앞면 트림 완료 → 뒷면 크로퍼로 이어짐
        setDualPending({ ...dualPending, croppedFront: croppedImg });
        setSelectedImage(dualPending.back);
        return;
      }
      // 뒷면 트림 완료 → 통합 OCR
      const finalFront = dualPending.croppedFront;
      const finalBack = croppedImg;
      setCroppedImage(finalFront);
      setSelectedImage(null);
      setDualPending(null);
      await extractCardInfo(finalFront, finalBack);
      return;
    }

    // 단면 흐름 (기존 동작)
    setCroppedImage(croppedImg);
    setSelectedImage(null);
    setShowCapture(false);
    await extractCardInfo(croppedImg);
  };

  // 기존 카드 값을 히스토리 엔트리로 변환 (현재 값이 새 스캔에 의해 덮히기 직전 상태)
  const makeHistoryEntry = (existingCard) => ({
    image_url: existingCard.image_url,
    back_image_url: existingCard.back_image_url || null,
    company: existingCard.company,
    title: existingCard.title,
    department: existingCard.department,
    email: existingCard.email,
    office_phone: existingCard.office_phone,
    mobile_phone: existingCard.mobile_phone,
    address: existingCard.address,
    recorded_at: existingCard.updated_at || existingCard.created_at || new Date().toISOString(),
  });

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

      toast.success('기존 명함이 업데이트되었습니다.');
      setEditingCard(null);
      setCroppedImage(null);
      setDuplicateInfo(null);
      loadCards();
    } catch (err) {
      toast.error(`업데이트 실패: ${err.message}`);
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

      toast.success('새 명함이 추가되었습니다.');
      setEditingCard(null);
      setCroppedImage(null);
      setDuplicateInfo(null);
      loadCards();
    } catch (err) {
      toast.error(`저장 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCard = async (e) => {
    e.preventDefault();
    const sb = getSupabaseClient();
    if (!sb) {
      toast.error('Supabase 연결 설정이 필요합니다.');
      return;
    }

    setLoading(true);
    try {
      let finalImageUrl = editingCard.image_url;
      if (editingCard.image_url.startsWith('data:')) {
        finalImageUrl = await uploadImageToSupabase(editingCard.image_url);
      }

      let finalBackImageUrl = editingCard.back_image_url || null;
      if (finalBackImageUrl && finalBackImageUrl.startsWith('data:')) {
        finalBackImageUrl = await uploadImageToSupabase(finalBackImageUrl);
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
        back_image_url: finalBackImageUrl,
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

        toast.success('명함이 성공적으로 저장되었습니다.');
      } else {
        // 새 스캔 → 동일인(이름 + 핸드폰)이 이미 있으면 history에 이전 값 누적 후 최신 정보로 덮어쓰기
        const existing = await findDuplicate(cardData.name, cardData.mobile_phone);
        if (existing) {
          const newHistory = [...(existing.history || []), makeHistoryEntry(existing)];
          const updatePayload = { ...cardData, history: newHistory, updated_at: new Date().toISOString() };
          delete updatePayload.user_id; // 소유자는 유지
          const { error } = await sb
            .from('business_cards')
            .update(updatePayload)
            .eq('id', existing.id);
          if (error) throw error;
          toast.success(`${cardData.name} 님의 명함이 최신 정보로 업데이트되었고 이전 버전은 히스토리에 저장되었습니다.`);
        } else {
          const { error } = await sb.from('business_cards').insert([cardData]);
          if (error) throw error;
          toast.success('명함이 성공적으로 저장되었습니다.');
        }
      }

      // 일괄 스캔에서 들어온 카드라면 결과 목록에서 해당 항목 제거
      if (typeof editingCard._batchIndex === 'number') {
        const removedIndex = editingCard._batchIndex;
        setBatchResults((prev) => prev.filter((_, i) => i !== removedIndex));
      }

      setEditingCard(null);
      setCroppedImage(null);
      loadCards();
    } catch (err) {
      console.error(err);
      toast.error(`저장 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (id) => {
    const ok = await confirm({
      title: '명함 삭제',
      message: '정말로 이 명함을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      confirmLabel: '삭제',
      danger: true,
    });
    if (!ok) return;
    
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
      toast.success('명함이 삭제되었습니다.');
    } catch (err) {
      console.error(err);
      toast.error(`삭제 에러: ${err.message}`);
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

      if (result.merged) {
        toast.success('이미 HubSpot에 등록된 연락처를 찾았습니다. 최신 정보로 업데이트하고 연결했습니다.');
      } else if (card.hubspot_id) {
        toast.success('HubSpot 연락처가 최신 정보로 업데이트되었습니다.');
      } else {
        toast.success('HubSpot 연락처에 정상적으로 등록되었습니다!');
      }
    } catch (err) {
      console.error(err);
      toast.error(`HubSpot 연동 오류: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const filteredCards = cards.filter(card => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = (
      (card.name && card.name.toLowerCase().includes(searchLower)) ||
      (card.company && card.company.toLowerCase().includes(searchLower)) ||
      (card.email && card.email.toLowerCase().includes(searchLower)) ||
      (card.mobile_phone && card.mobile_phone.includes(searchLower))
    );
    if (!matchesSearch) return false;
    if (activeGroupId === null) return true;
    const memberOf = cardGroupMap[card.id] || [];
    if (activeGroupId === 'ungrouped') return memberOf.length === 0;
    return memberOf.includes(activeGroupId);
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

  const sidebarCounts = React.useMemo(() => {
    const byGroup = {};
    groups.forEach(g => { byGroup[g.id] = 0; });
    let ungrouped = 0;
    cards.forEach(card => {
      const ids = cardGroupMap[card.id] || [];
      if (ids.length === 0) ungrouped += 1;
      ids.forEach(id => { if (byGroup[id] !== undefined) byGroup[id] += 1; });
    });
    return { all: cards.length, ungrouped, byGroup };
  }, [cards, cardGroupMap, groups]);

  const groupCounts = React.useMemo(() => {
    const counts = {};
    groups.forEach(g => { counts[g.id] = 0; });
    Object.values(cardGroupMap).forEach(ids => {
      ids.forEach(id => { if (counts[id] !== undefined) counts[id] += 1; });
    });
    return counts;
  }, [groups, cardGroupMap]);

  const resolveGroupBadges = useCallback((cardId) => (
    (cardGroupMap[cardId] || [])
      .map(gid => groups.find(g => g.id === gid))
      .filter(Boolean)
      .map(g => ({ id: g.id, name: g.name, color: getGroupColor(g.color) }))
  ), [cardGroupMap, groups]);

  const handleActivateCard = useCallback((card) => {
    if (selectionMode) toggleCardSelection(card.id);
    else setViewingCard(card);
  }, [selectionMode]);


  return (
    <AppShell
      sidebar={user ? (
        <GroupSidebar
          groups={groups}
          counts={sidebarCounts}
          activeGroupId={activeGroupId}
          userEmail={user.email}
          onSelectGroup={setActiveGroupId}
          onCreateGroup={() => { setNewGroupName(''); setNewGroupColor(DEFAULT_GROUP_COLOR.key); setShowCreateGroup(true); }}
          onManageGroups={() => setShowGroupManage(true)}
          onOpenSettings={() => setShowSettings(true)}
          onSignOut={handleSignOut}
        />
      ) : null}
      main={(
        <div className="app-container">
          {/* 헤더 섹션 */}
          <header className="header-container">
            <div className="logo-section">
              <div className="logo-icon-box">
                <Smartphone size={22} style={{ color: '#fff' }} />
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
            <AuthPanel
              email={authEmail}
              password={authPassword}
              loading={loading}
              onEmailChange={setAuthEmail}
              onPasswordChange={setAuthPassword}
              onSubmit={handleAuthSubmit}
            />
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
                <button
                  onClick={() => { setTextInputValue(''); setShowTextInput(true); }}
                  className="btn btn-secondary btn-add"
                  title="텍스트에서 AI로 인식"
                >
                  <FileText size={18} />
                  <span>텍스트 입력</span>
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
                  onDualSideSelected={handleDualSideSelected}
                  onManualInput={() => {
                    setShowCapture(false);
                    setTextInputValue('');
                    setShowTextInput(true);
                  }}
                />
              )}

              {/* 텍스트 입력 모달: 붙여넣은 텍스트에서 AI가 필드를 추출 */}
              {showTextInput && (
                <Sheet
                  title={(
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={18} className="color-violet" />
                      텍스트로 명함 입력
                    </span>
                  )}
                  onClose={() => { if (!isExtracting) setShowTextInput(false); }}
                  maxWidth="520px"
                  footer={(
                    <>
                      <button
                        type="button"
                        onClick={() => setShowTextInput(false)}
                        className="btn btn-secondary"
                        disabled={isExtracting}
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        disabled={!textInputValue.trim() || isExtracting}
                        onClick={() => extractCardFromText(textInputValue)}
                        className="btn btn-primary"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Sparkles size={14} />
                        {isExtracting ? '분석 중...' : 'AI로 인식'}
                      </button>
                    </>
                  )}
                >
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
                    이메일 서명, 채팅 메시지 등에서 복사한 명함 정보를 붙여넣으세요. AI가 이름·회사·연락처 등을 자동으로 인식해 채워 넣습니다.
                  </p>
                  <div className="form-group">
                    <textarea
                      autoFocus
                      value={textInputValue}
                      onChange={(e) => setTextInputValue(e.target.value)}
                      placeholder={'예)\n홍길동 부장\n어쿠스틱 이엔지\n02-1234-5678\n010-9876-5432\nhong@acoustic.co.kr\n서울시 강남구 테헤란로 123'}
                      className="premium-input"
                      rows={10}
                      style={{
                        width: '100%',
                        resize: 'vertical',
                        minHeight: '180px',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        lineHeight: 1.5,
                      }}
                      disabled={isExtracting}
                    />
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px', textAlign: 'right' }}>
                      {textInputValue.length} / 8000
                    </div>
                  </div>
                </Sheet>
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
              <BatchResults
                results={batchResults}
                loading={loading}
                onSelect={handleSelectBatchResult}
                onSaveAll={handleSaveBatchAll}
                onClose={() => setBatchResults([])}
              />
            )}

            {/* 중복 명함 확인 모달 */}
            {duplicateInfo && (
              <DuplicateDialog
                existingCard={duplicateInfo.existingCard}
                newCardData={duplicateInfo.newCardData}
                loading={loading}
                onUpdate={handleDuplicateUpdate}
                onAddNew={handleDuplicateAddNew}
                onCancel={() => setDuplicateInfo(null)}
              />
            )}

            {/* 명함 정보 상세 입력 및 교정 (OCR 완료 후) */}
            {editingCard && !isExtracting && (
              <CardEditForm
                card={editingCard}
                loading={loading}
                formRef={editFormRef}
                onChange={(patch) => setEditingCard(prev => ({ ...prev, ...patch }))}
                onRemoveBack={() => setEditingCard(prev => ({ ...prev, back_image_url: null }))}
                onCancel={() => { setEditingCard(null); setCroppedImage(null); }}
                onSubmit={handleSaveCard}
              />
            )}

            {/* 저장된 명함 목록 */}
            <section>
              <div className="group-chip-row group-chip-filters">
                <button
                  type="button"
                  className={`group-chip ${activeGroupId === null ? 'group-chip-active' : ''}`}
                  onClick={() => setActiveGroupId(null)}
                >
                  전체
                </button>
                {groups.map(g => {
                  const c = getGroupColor(g.color);
                  const active = activeGroupId === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      className={`group-chip ${active ? 'group-chip-active' : ''}`}
                      onClick={() => setActiveGroupId(g.id)}
                      style={active ? { background: c.bg, borderColor: c.border, color: c.solid } : undefined}
                    >
                      <span className="group-color-dot" style={{ background: c.solid }} />
                      {g.name}
                    </button>
                  );
                })}
                <button
                  type="button"
                  className={`group-chip ${activeGroupId === 'ungrouped' ? 'group-chip-active' : ''}`}
                  onClick={() => setActiveGroupId('ungrouped')}
                  title="그룹 없는 명함"
                >
                  그룹 없음
                </button>
                <button
                  type="button"
                  className="group-chip group-chip-action"
                  onClick={() => {
                    setNewGroupName('');
                    setNewGroupColor(DEFAULT_GROUP_COLOR.key);
                    setShowCreateGroup(true);
                  }}
                  title="새 그룹 만들기"
                >
                  <Plus size={12} /> 새 그룹
                </button>
                {groups.length > 0 && (
                  <button
                    type="button"
                    className="group-chip group-chip-action"
                    onClick={() => setShowGroupManage(true)}
                    title="그룹 관리"
                  >
                    <Settings size={12} /> 관리
                  </button>
                )}
              </div>

              <div className="group-chip-row">
                <button
                  type="button"
                  className={`group-chip group-chip-action ${selectionMode ? 'group-chip-active' : ''}`}
                  onClick={() => {
                    if (selectionMode) exitSelectionMode();
                    else setSelectionMode(true);
                  }}
                  title={selectionMode ? '선택 모드 종료' : '명함 다중 선택'}
                >
                  <Check size={12} /> {selectionMode ? '선택 종료' : '선택'}
                </button>
              </div>

              <CardList
                groupedByDate={groupedByDate}
                totalCount={filteredCards.length}
                initialLoading={initialLoading}
                selectionMode={selectionMode}
                selectedCardIds={selectedCardIds}
                resolveGroupBadges={resolveGroupBadges}
                onActivateCard={handleActivateCard}
              />
            </section>
          </main>
          )}

          {/* 이미지 조절 크로퍼 */}
          {selectedImage && (
            <ImageCropper
              imageSrc={selectedImage}
              onCropComplete={handleCropComplete}
              onCancel={() => {
                if (dualPending) {
                  // 양면 흐름 중단: 모든 상태를 초기화하고 카메라 재진입 유도
                  setDualPending(null);
                  setSelectedImage(null);
                } else {
                  setSelectedImage(null);
                }
              }}
              stageLabel={
                dualPending
                  ? (dualPending.croppedFront ? '뒷면 트림' : '앞면 트림')
                  : undefined
              }
            />
          )}

          {/* 상세 보기 모달 */}
          {viewingCard && (
            <div
              className="modal-overlay"
              onClick={(e) => {
                if (e.target === e.currentTarget) setViewingCard(null);
              }}
            >
              <div className="modal-content">
                <div className="modal-header">
                  <h3>명함 상세 카드</h3>
                  <button onClick={() => setViewingCard(null)} className="modal-close-btn">
                    <X size={16} />
                  </button>
                </div>

                <div className="modal-body">
                  <CardDetail
                    card={viewingCard}
                    groups={groups}
                    activeGroupIds={cardGroupMap[viewingCard.id] || []}
                    onToggleGroup={toggleCardGroup}
                    onOpenImage={setLightboxImage}
                  />
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
            <SettingsModal
              settings={settings}
              onChange={(patch) => setSettings(prev => ({ ...prev, ...patch }))}
              onSubmit={handleSaveSettings}
              onClose={() => setShowSettings(false)}
            />
          )}

          {/* 다중 선택 액션바 */}
          {selectionMode && (
            <div className="selection-action-bar">
              <div className="selection-action-bar-inner">
                <span className="selection-count">{selectedCardIds.size}개 선택됨</span>
                <div className="selection-action-buttons">
                  <button
                    type="button"
                    onClick={() => {
                      if (groups.length === 0) {
                        toast.info('먼저 그룹을 만들어 주세요.');
                        return;
                      }
                      if (selectedCardIds.size === 0) {
                        toast.info('명함을 한 개 이상 선택해 주세요.');
                        return;
                      }
                      setShowBulkAssign(true);
                    }}
                    className="btn btn-primary"
                  >
                    그룹 지정
                  </button>
                  <button type="button" onClick={exitSelectionMode} className="btn btn-secondary">
                    취소
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 일괄 그룹 지정 모달 */}
          {showBulkAssign && (
            <BulkAssignModal
              groups={groups}
              selectedIds={Array.from(selectedCardIds)}
              memberCountOf={(groupId) => Array.from(selectedCardIds).filter(id => (cardGroupMap[id] || []).includes(groupId)).length}
              onAssign={bulkAssignGroup}
              onRemove={bulkRemoveFromGroup}
              onClose={() => setShowBulkAssign(false)}
            />
          )}

          {/* 그룹 관리 모달 */}
          {showGroupManage && (
            <GroupManageModal
              groups={groups}
              groupCounts={groupCounts}
              editingGroupId={editingGroupId}
              editingGroupName={editingGroupName}
              onStartRename={(g) => { setEditingGroupId(g.id); setEditingGroupName(g.name); }}
              onChangeRenameValue={setEditingGroupName}
              onCommitRename={async (id) => { await renameGroup(id, editingGroupName); setEditingGroupId(null); }}
              onCancelRename={() => setEditingGroupId(null)}
              onSetColor={setGroupColor}
              onDelete={deleteGroup}
              onCreateNew={() => { setNewGroupName(''); setNewGroupColor(DEFAULT_GROUP_COLOR.key); setShowCreateGroup(true); }}
              onClose={() => { setShowGroupManage(false); setEditingGroupId(null); }}
            />
          )}

          {/* 그룹 생성 모달 */}
          {showCreateGroup && (
            <CreateGroupModal
              name={newGroupName}
              color={newGroupColor}
              onNameChange={setNewGroupName}
              onColorChange={setNewGroupColor}
              onCreate={async () => { await createGroup(newGroupName, newGroupColor); setShowCreateGroup(false); }}
              onClose={() => setShowCreateGroup(false)}
            />
          )}

          {/* 이미지 라이트박스 (배경 클릭하거나 X 누르면 닫힘) */}
          {lightboxImage && (
            <div
              onClick={() => setLightboxImage(null)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 300,
                background: 'rgba(0, 0, 0, 0.92)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                cursor: 'zoom-out',
                animation: 'fadeIn 0.18s ease-out',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(env(safe-area-inset-top, 0px) + 16px)',
                  right: '20px',
                  display: 'flex',
                  gap: '10px',
                  zIndex: 2,
                }}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    saveImageToDevice(lightboxImage).catch((err) => toast.error(err.message));
                  }}
                  aria-label="이미지 저장"
                  title="앨범에 저장"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxImage(null);
                  }}
                  aria-label="닫기"
                  style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    border: 'none',
                    background: 'rgba(255, 255, 255, 0.12)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={20} />
                </button>
              </div>
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ZoomableImage src={lightboxImage} alt="확대 이미지" />
              </div>
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  fontSize: '11px',
                  color: 'rgba(255, 255, 255, 0.55)',
                  background: 'rgba(0, 0, 0, 0.35)',
                  padding: '6px 12px',
                  borderRadius: '999px',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                }}
              >
                두 손가락으로 확대 · 더블탭으로 줌
              </div>
            </div>
          )}
        </div>
      )}
      detail={null}
    />
  );
}
