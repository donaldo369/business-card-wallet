'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Settings, Search, Plus, Check, Mail, Phone, MapPin, 
  Building2, ExternalLink, Trash2, Edit3, 
  Save, X, FileText, Sparkles, AlertCircle, RefreshCw, Smartphone
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

  const [settings, setSettings] = useState({
    supabaseUrl: '',
    supabaseAnonKey: '',
    geminiKey: '',
    hubspotToken: '',
  });

  const [supabaseReady, setSupabaseReady] = useState(false);

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

  const loadCards = useCallback(async (client) => {
    const sb = client || getSupabaseClient();
    if (!sb) {
      setInitialLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const { data, error } = await sb
        .from('business_cards')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCards(data || []);
    } catch (err) {
      console.error('명함 로드 에러:', err);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    if (supabaseReady) {
      loadCards();
    } else {
      setInitialLoading(false);
    }
  }, [supabaseReady, loadCards]);

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

  const extractCardInfo = async (base64Image) => {
    setIsExtracting(true);
    try {
      const res = await fetch(base64Image);
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

  const handleCropComplete = async (croppedImg) => {
    setCroppedImage(croppedImg);
    setSelectedImage(null);
    setShowCapture(false);
    await extractCardInfo(croppedImg);
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
      };

      let error;
      if (editingCard.id) {
        const { error: err } = await sb
          .from('business_cards')
          .update(cardData)
          .eq('id', editingCard.id);
        error = err;
      } else {
        const { error: err } = await sb
          .from('business_cards')
          .insert([cardData]);
        error = err;
      }

      if (error) throw error;

      alert('명함이 성공적으로 저장되었습니다.');
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

        <button onClick={() => setShowSettings(true)} className="settings-btn">
          <Settings size={20} />
        </button>
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

      {/* 메인 콘텐츠 영역 */}
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
          <button onClick={() => setShowCapture(true)} className="btn btn-primary btn-add">
            <Plus size={18} />
            <span>새 명함 추가</span>
          </button>
        </div>

        {/* 촬영 및 스캔 가이드 */}
        {showCapture && (
          <div className="scanner-container">
            <div className="scanner-header">
              <h2>
                <Smartphone size={16} className="color-violet" />
                실시간 카메라 스캔
              </h2>
              <button onClick={() => setShowCapture(false)} className="scanner-close-btn">
                닫기
              </button>
            </div>
            <CameraCapture onImageSelected={(src) => setSelectedImage(src)} />
          </div>
        )}

        {/* OCR 데이터 파싱 중 로딩 상태 */}
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
              <div className="form-card-row" style={{ display: 'flex', gap: '28px', flexDirection: 'row' }}>
                {/* 왼쪽 크롭된 이미지 썸네일 */}
                <div style={{ width: '220px', display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
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
            <div className="cards-grid">
              {filteredCards.map((card) => (
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
          )}
        </section>
      </main>

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
                  <div className="btn btn-success-badge">
                    <Check size={14} />
                    HubSpot 연동됨
                  </div>
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
