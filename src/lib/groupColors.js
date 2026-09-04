// 그룹 태그 색상 팔레트. page.js 와 그룹 관련 컴포넌트들이 공유한다.
export const GROUP_COLORS = [
  { key: 'violet', solid: '#a5b4fc', bg: 'rgba(99, 102, 241, 0.18)', border: 'rgba(99, 102, 241, 0.45)' },
  { key: 'blue',   solid: '#93c5fd', bg: 'rgba(59, 130, 246, 0.18)', border: 'rgba(59, 130, 246, 0.45)' },
  { key: 'teal',   solid: '#5eead4', bg: 'rgba(20, 184, 166, 0.18)', border: 'rgba(20, 184, 166, 0.45)' },
  { key: 'green',  solid: '#86efac', bg: 'rgba(34, 197, 94, 0.18)',  border: 'rgba(34, 197, 94, 0.45)' },
  { key: 'amber',  solid: '#fcd34d', bg: 'rgba(245, 158, 11, 0.18)', border: 'rgba(245, 158, 11, 0.45)' },
  { key: 'rose',   solid: '#fda4af', bg: 'rgba(244, 63, 94, 0.18)',  border: 'rgba(244, 63, 94, 0.45)' },
  { key: 'pink',   solid: '#f9a8d4', bg: 'rgba(236, 72, 153, 0.18)', border: 'rgba(236, 72, 153, 0.45)' },
  { key: 'slate',  solid: '#cbd5e1', bg: 'rgba(148, 163, 184, 0.18)', border: 'rgba(148, 163, 184, 0.45)' },
];
export const DEFAULT_GROUP_COLOR = GROUP_COLORS[0];
export const getGroupColor = (key) => GROUP_COLORS.find(c => c.key === key) || DEFAULT_GROUP_COLOR;
