'use client';

import React from 'react';
import { Check, Mail, Phone } from 'lucide-react';

export default function CardListItem({ card, groupBadges, selectionMode, isSelected, onActivate }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? isSelected : undefined}
      onClick={() => onActivate(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(card);
        }
      }}
      className={`glass card-item ${selectionMode ? 'card-item-selectable' : ''} ${isSelected ? 'card-item-selected' : ''}`}
    >
      {selectionMode && (
        <div className={`card-select-indicator ${isSelected ? 'card-select-indicator-on' : ''}`}>
          {isSelected && <Check size={12} />}
        </div>
      )}
      {/* 왼쪽 명함 썸네일 */}
      <div className="card-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={card.image_url} alt={card.name} loading="lazy" decoding="async" />
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
        {groupBadges.length > 0 && (
          <div className="card-group-badges">
            {groupBadges.map(badge => (
              <span
                key={badge.id}
                className="card-group-badge"
                style={{ background: badge.color.bg, color: badge.color.solid }}
              >
                {badge.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* HubSpot 상태 배지 */}
      {card.hubspot_id && (
        <div className="hubspot-badge" title="HubSpot 동기화됨">
          <Check size={14} />
        </div>
      )}
    </div>
  );
}
