# UI 레이아웃 재구성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 데스크탑을 사이드바·목록·상세 3분할 셸로 재구성하고, 모바일에 FAB·가로 스크롤 그룹 칩·바텀시트·검색 UX를 도입한다.

**Architecture:** `page.js`(2886줄)의 상태와 데이터 로직은 그대로 두고 표현부만 컴포넌트로 추출한 뒤(1단계), 그 위에 반응형 셸을 얹는다(2단계). 상태 관리 라이브러리는 도입하지 않고 props 단방향 전달만 쓴다. 브레이크포인트는 CSS Grid + 미디어 쿼리로 처리하고, JS 분기는 상세 표시 위치(패널/모달/시트) 한 곳에만 둔다.

**Tech Stack:** Next.js 16.2.9 (App Router, Turbopack), React 19.2.4, 순수 CSS(`src/app/globals.css`, Tailwind 없음), lucide-react, Supabase JS

**Spec:** `docs/superpowers/specs/2026-09-04-ui-layout-restructure-design.md`

## Global Constraints

- **테스트 러너가 없다.** Vitest/Jest 미설치이고 이번 범위에서 도입하지 않는다. 따라서 각 태스크의 검증은 TDD 대신 **빌드 통과 + 린트 무증가 + 수동 확인**이다. "테스트를 작성하라"는 지시가 있으면 그것은 이 계획의 오류다.
- **Tailwind가 없다.** 모든 스타일은 `src/app/globals.css`의 클래스 또는 인라인 `style`로 작성한다. 유틸리티 클래스명(`flex`, `p-4` 등)은 동작하지 않는다.
- **1단계는 동작 보존이다.** 마크업·클래스명·인라인 스타일·문구를 한 글자도 바꾸지 않는다. 개선은 전부 2단계에서 한다.
- **상태는 `page.js`에만 둔다.** 추출한 컴포넌트는 `useState`를 새로 만들지 않는다. 예외: `Sheet.js`의 드래그 오프셋(Task 7), `CardList.js`의 밀도 토글(Task 11) — 순수 UI 로컬 상태.
- **경로 별칭은 `@/*` → `./src/*`** (`jsconfig.json`). 컴포넌트 간 import는 상대 경로(`./Toast`)를 쓰는 기존 관행을 따른다.
- **파일은 `.js` 확장자에 JSX**를 쓴다. TypeScript로 바꾸지 않는다.
- **알림은 `useToast()`만 쓴다.** `alert`/`confirm`은 저장소에서 제거되었다. 되살리지 않는다.
- 브레이크포인트 고정값: 바텀시트 `<768px`, 셸 `≥1024px`, 상세 패널 `≥1280px`, 사이드바 폭 `240px`, 상세 패널 폭 `380px`.

### 검증 레시피 (모든 태스크에서 동일하게 사용)

**빌드:**
```bash
npm run build
```
기대: `✓ Compiled successfully`, `Generating static pages (10/10)`.

**린트 무증가 확인:**
```bash
npx eslint src --ext .js -f json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('총 지적:', sum(len(f['messages']) for f in d))
for f in d:
    for m in f['messages']:
        print(' ', f['filePath'].split('/src/')[-1], m['line'], m['ruleId'])
"
```
**베이스라인은 7건이며 룰 구성은 다음과 같다.** 파일 귀속은 추출에 따라 이동할 수 있으나 **룰 종류와 총 건수가 늘면 실패**다.

| 룰 | 건수 |
| --- | --- |
| `react-hooks/set-state-in-effect` | 2 |
| `react/no-unescaped-entities` | 2 |
| `react-hooks/immutability` | 2 |
| `react-hooks/exhaustive-deps` | 1 |

Task 10에서 빈 상태 문구를 다시 쓰면서 `react/no-unescaped-entities` 2건이 사라져 5건이 된다. **감소는 허용, 증가는 불가.**

**수동 확인용 서버:**
```bash
npm run build && npx next start -p 4321
```
`next dev`는 사용자가 이미 3000번에서 띄워두었을 수 있어 충돌한다. 확인이 끝나면 `pkill -f "next start -p 4321"`로 정리한다.

**회귀 체크리스트** (1단계 마지막과 2단계 마지막에 전체 수행):
스캔 → 크롭 → 추출 → 저장 / 일괄 스캔 / 양면 스캔 / 중복 병합 / 그룹 생성·이름변경·색상변경·삭제 / 다중 선택 그룹 지정·해제 / HubSpot 등록·업데이트 / 텍스트 입력 인식 / 로그인·로그아웃 / 라이트박스 확대·저장

---

# 1단계 — 동작 보존 추출

화면은 픽셀 단위로 동일하게 유지한다. 이 단계가 끝나면 `page.js`는 약 500줄이 된다.

---

### Task 1: AuthPanel 추출 (추출 패턴 확립)

가장 작고 독립적인 조각으로 이후 태스크가 따를 패턴을 정한다.

**Files:**
- Create: `src/components/AuthPanel.js`
- Modify: `src/app/page.js:1327-1377` (로그인 화면 블록)

**Interfaces:**
- Consumes: 없음
- Produces:
  ```js
  export default function AuthPanel({
    email,           // string
    password,        // string
    loading,         // boolean
    onEmailChange,   // (value: string) => void
    onPasswordChange,// (value: string) => void
    onSubmit,        // (event: SubmitEvent) => void
  })
  ```

- [ ] **Step 1: `src/components/AuthPanel.js` 생성**

```jsx
'use client';

import React from 'react';
import { LogIn, Lock, RefreshCw } from 'lucide-react';

export default function AuthPanel({ email, password, loading, onEmailChange, onPasswordChange, onSubmit }) {
  return (
    // page.js:1328-1376 의 <div className="glass auth-container"> ... </div> 를
    // 그대로 옮긴다. 치환은 아래 6개뿐이며 그 외 마크업·스타일·문구는 손대지 않는다.
    //   authEmail                        -> email
    //   authPassword                     -> password
    //   setAuthEmail(e.target.value)     -> onEmailChange(e.target.value)
    //   setAuthPassword(e.target.value)  -> onPasswordChange(e.target.value)
    //   handleAuthSubmit                 -> onSubmit
    //   loading                          -> loading (그대로)
  );
}
```

- [ ] **Step 2: `page.js`에서 치환**

`page.js:1327-1377`의 블록을 다음으로 바꾼다.

```jsx
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
```

`page.js` 상단에 `import AuthPanel from '../components/AuthPanel';`를 추가한다. 이 import로 더 이상 `page.js`에서 쓰이지 않게 된 lucide 아이콘(`Lock`, `LogIn`)은 남은 사용처를 `grep -n "Lock\|LogIn" src/app/page.js`로 확인한 뒤 없을 때만 import에서 제거한다.

- [ ] **Step 3: 빌드 + 린트 확인**

검증 레시피의 빌드와 린트를 실행한다. 기대: 빌드 통과, 린트 7건 유지.

- [ ] **Step 4: 로그인 화면 육안 확인**

`npm run build && npx next start -p 4321` 후 브라우저에서 로그아웃 상태의 로그인 카드가 이전과 동일한지 확인한다. 확인 후 서버를 정리한다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/AuthPanel.js src/app/page.js
git commit -m "Refactor: Extract AuthPanel from page.js"
```

---

### Task 2: CardListItem / CardList 추출

**Files:**
- Create: `src/components/CardListItem.js`, `src/components/CardList.js`
- Modify: `src/app/page.js:1943-2123` (저장된 명함 목록 섹션)

**Interfaces:**
- Consumes: Task 1의 추출 패턴
- Produces:
  ```js
  // CardListItem.js
  export default function CardListItem({
    card,            // 명함 레코드
    groupBadges,     // Array<{ id, name, color }>  이미 해석된 배지 목록
    selectionMode,   // boolean
    isSelected,      // boolean
    onActivate,      // (card) => void   클릭/Enter/Space 시
  })

  // CardList.js
  export default function CardList({
    groupedByDate,   // Array<[dateLabel: string, cards: Array<card>]>
    totalCount,      // number   filteredCards.length
    initialLoading,  // boolean
    selectionMode,   // boolean
    selectedCardIds, // Set<string>
    resolveGroupBadges, // (cardId) => Array<{ id, name, color }>
    onActivateCard,  // (card) => void
  })
  ```

`resolveGroupBadges`는 `page.js`가 `cardGroupMap`과 `groups`를 조합해 넘긴다. `CardList`는 그룹 원본 배열을 알 필요가 없다.

- [ ] **Step 1: `CardListItem.js` 생성**

`page.js:2050-2117`의 카드 `<div>` 한 장을 그대로 옮긴다. 배지 계산(`groups.find(...)`, `getGroupColor(...)`)은 컴포넌트에서 제거하고 `groupBadges` prop을 그대로 렌더한다. 1단계이므로 `<div onClick>` 시맨틱은 유지한다(버튼화는 Task 9).

- [ ] **Step 2: `CardList.js` 생성**

`page.js:1944-2122`의 `<section>` 내용을 옮긴다. 단 **그룹 칩 줄(`page.js:1958-2002`)은 옮기지 않는다** — Task 8에서 사이드바로 이동할 조각이므로 `page.js`에 남긴다. `CardList`는 섹션 헤더, 로딩 스피너, 빈 상태, 날짜 그룹 루프, `CardListItem` 렌더만 담당한다.

- [ ] **Step 3: `page.js`에서 치환**

```jsx
        {/* 저장된 명함 목록 */}
        <section>
          {/* 그룹 칩 줄은 이 자리에 그대로 유지 (Task 8에서 이동) */}
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
```

`page.js`에 헬퍼 두 개를 추가한다.

```jsx
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
```

- [ ] **Step 4: 빌드 + 린트 확인**

검증 레시피 실행. `react/no-unescaped-entities` 2건이 `page.js`에서 `CardList.js`로 옮겨간다 — 총 7건은 유지되어야 한다.

- [ ] **Step 5: 목록 육안 확인**

명함 목록, 날짜 그룹 헤더, 선택 모드 진입/해제, 그룹 배지, HubSpot 배지가 이전과 동일한지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add src/components/CardList.js src/components/CardListItem.js src/app/page.js
git commit -m "Refactor: Extract CardList and CardListItem from page.js"
```

---

### Task 3: CardDetail 추출

상세 보기 모달의 **본문만** 분리한다. 모달 껍데기(`.modal-overlay`/`.modal-content`/헤더/푸터)는 `page.js`에 남긴다 — Task 9에서 패널·시트로도 감쌀 대상이기 때문이다.

**Files:**
- Create: `src/components/CardDetail.js`
- Modify: `src/app/page.js:2147-2377` (상세 보기 모달)

**Interfaces:**
- Produces:
  ```js
  export default function CardDetail({
    card,            // 명함 레코드
    groups,          // Array<{ id, name, color }>  원본 그룹 목록
    activeGroupIds,  // Array<string>  이 명함이 속한 그룹 id
    onToggleGroup,   // (cardId, groupId) => void
    onOpenImage,     // (imageUrl: string) => void  라이트박스
  })
  ```
  액션 버튼(수정/삭제/HubSpot)은 **포함하지 않는다.** 모달 푸터에 남아 있고 Task 9에서 컨테이너별로 배치한다.

- [ ] **Step 1: `CardDetail.js` 생성**

`page.js:2163-2367`의 `<div className="modal-body">` **내용물**(이미지 풀 뷰, 디테일 텍스트, 그룹 지정, 히스토리)을 옮긴다. `viewingCard` → `card`, `setLightboxImage` → `onOpenImage`, `toggleCardGroup` → `onToggleGroup`, `cardGroupMap[viewingCard.id] || []` → `activeGroupIds`로 치환한다. `PhoneTypeBadge`와 `getGroupColor`도 이 파일로 함께 옮긴다(`page.js`에 다른 사용처가 없으면 제거, 있으면 공용 모듈로 빼지 말고 복제하지 말고 남긴다 — `grep -n "PhoneTypeBadge\|getGroupColor" src/app/page.js`로 확인).

- [ ] **Step 2: `page.js`에서 치환**

```jsx
            <div className="modal-body">
              <CardDetail
                card={viewingCard}
                groups={groups}
                activeGroupIds={cardGroupMap[viewingCard.id] || []}
                onToggleGroup={toggleCardGroup}
                onOpenImage={setLightboxImage}
              />
            </div>
```

- [ ] **Step 3: 빌드 + 린트 확인**
- [ ] **Step 4: 상세 모달 육안 확인**

명함 클릭 → 이미지·앞뒷면·연락처·그룹 토글·히스토리·푸터 버튼이 이전과 동일한지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/CardDetail.js src/app/page.js
git commit -m "Refactor: Extract CardDetail from page.js"
```

---

### Task 4: CardEditForm 추출

**Files:**
- Create: `src/components/CardEditForm.js`
- Modify: `src/app/page.js:1733-1942` (추출 데이터 검토 및 교정)

**Interfaces:**
- Produces:
  ```js
  export default function CardEditForm({
    card,          // editingCard
    loading,       // boolean
    formRef,       // React ref  스크롤 대상
    onChange,      // (patch: object) => void   setEditingCard 부분 갱신
    onRemoveBack,  // () => void
    onCancel,      // () => void
    onSubmit,      // (event: SubmitEvent) => void
  })
  ```

`onChange`는 병합 책임을 `page.js`에 둔다: `page.js`에서 `onChange={(patch) => setEditingCard(prev => ({ ...prev, ...patch }))}`. 성/이름 입력의 `name` 합성 로직(`page.js:1826-1852`)은 폼 안에 그대로 두고 `onChange({ last_name: val, name: ... })` 형태로 patch를 만든다.

- [ ] **Step 1: `CardEditForm.js` 생성** — `page.js:1734-1941`을 위 prop 이름으로 치환해 옮긴다.
- [ ] **Step 2: `page.js`에서 치환**

```jsx
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
```

- [ ] **Step 3: 빌드 + 린트 확인**
- [ ] **Step 4: 육안 확인** — 명함 1장 스캔 후 교정 폼의 모든 필드 입력, 성/이름 입력 시 `name` 합성, 뒷면 제거 버튼, 저장/취소 동작 확인.
- [ ] **Step 5: 커밋**

```bash
git add src/components/CardEditForm.js src/app/page.js
git commit -m "Refactor: Extract CardEditForm from page.js"
```

---

### Task 5: BatchResults / DuplicateDialog 추출

**Files:**
- Create: `src/components/BatchResults.js`, `src/components/DuplicateDialog.js`
- Modify: `src/app/page.js:1544-1633` (배치 결과), `src/app/page.js:1634-1732` (중복 확인)

**Interfaces:**
- Produces:
  ```js
  // BatchResults.js
  export default function BatchResults({
    results,     // Array<card & { _status, _error }>
    loading,     // boolean
    onSelect,    // (index: number) => void
    onSaveAll,   // () => void
    onClose,     // () => void
  })

  // DuplicateDialog.js
  export default function DuplicateDialog({
    existingCard,  // 명함 레코드
    newCardData,   // 명함 레코드
    loading,       // boolean
    onUpdate,      // () => void
    onAddNew,      // () => void
    onCancel,      // () => void
  })
  ```

- [ ] **Step 1: 두 파일 생성** — 각각 해당 구간을 그대로 옮기고 위 prop 이름으로 치환한다. `DuplicateDialog`의 바깥 껍데기는 선행 수리에서 `.modal-overlay`(`z-index:210`)로 고친 상태이니 **그대로 유지**한다.
- [ ] **Step 2: `page.js`에서 치환**

```jsx
        {batchResults.length > 0 && !editingCard && (
          <BatchResults
            results={batchResults}
            loading={loading}
            onSelect={handleSelectBatchResult}
            onSaveAll={handleSaveBatchAll}
            onClose={() => setBatchResults([])}
          />
        )}

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
```

- [ ] **Step 3: 빌드 + 린트 확인**
- [ ] **Step 4: 육안 확인** — 이미지 2장 이상 선택해 일괄 스캔 결과 목록과 전체 저장, 이미 있는 사람의 명함을 다시 스캔해 중복 다이얼로그가 **화면 중앙 모달로** 뜨는지 확인한다.
- [ ] **Step 5: 커밋**

```bash
git add src/components/BatchResults.js src/components/DuplicateDialog.js src/app/page.js
git commit -m "Refactor: Extract BatchResults and DuplicateDialog from page.js"
```

---

### Task 6: 모달 4종 추출

**Files:**
- Create: `src/components/SettingsModal.js`, `src/components/GroupManageModal.js`, `src/components/CreateGroupModal.js`, `src/components/BulkAssignModal.js`
- Modify: `src/app/page.js:2378-2473`, `2505-2571`, `2572-2710`, `2711-2779`

**Interfaces:**
- Produces:
  ```js
  export default function SettingsModal({ settings, onChange, onSubmit, onClose })
  // onChange: (patch: object) => void

  export default function GroupManageModal({
    groups, groupCounts,        // groupCounts: Record<groupId, number>
    editingGroupId, editingGroupName,
    onStartRename, onChangeRenameValue, onCommitRename, onCancelRename,
    onSetColor,                 // (groupId, colorKey) => void
    onDelete,                   // (groupId) => void
    onCreateNew, onClose,
  })

  export default function CreateGroupModal({
    name, color, onNameChange, onColorChange, onCreate, onClose,
  })

  export default function BulkAssignModal({
    groups, selectedIds,        // selectedIds: Array<string>
    memberCountOf,              // (groupId) => number
    onAssign, onRemove, onClose,
  })
  ```

`GROUP_COLORS`와 `getGroupColor`는 `page.js` 상단에 있고 여러 컴포넌트가 쓴다. `src/lib/groupColors.js`로 옮기고 `page.js`·`CardDetail.js`·`GroupManageModal.js`·`CreateGroupModal.js`가 거기서 import한다.

```js
// src/lib/groupColors.js
export const GROUP_COLORS = [ /* page.js:14-23 을 그대로 옮긴다 */ ];
export const DEFAULT_GROUP_COLOR = GROUP_COLORS[0];
export const getGroupColor = (key) => GROUP_COLORS.find(c => c.key === key) || DEFAULT_GROUP_COLOR;
```

- [ ] **Step 1: `src/lib/groupColors.js` 생성 후 `page.js`에서 해당 정의 제거하고 import로 교체**
- [ ] **Step 2: 모달 4개 파일 생성** — 각 구간을 그대로 옮기고 prop 이름으로 치환한다.
- [ ] **Step 3: `page.js`에서 4곳 치환**
- [ ] **Step 4: 빌드 + 린트 확인**
- [ ] **Step 5: 육안 확인** — 설정 저장, 그룹 생성, 그룹 이름변경·색상변경·삭제, 다중 선택 후 그룹 지정·제거를 모두 눌러본다.
- [ ] **Step 6: 커밋**

```bash
git add src/lib/groupColors.js src/components/SettingsModal.js src/components/GroupManageModal.js src/components/CreateGroupModal.js src/components/BulkAssignModal.js src/app/page.js
git commit -m "Refactor: Extract settings and group modals from page.js"
```

---

### Task 7: 1단계 회귀 확인

**Files:** 없음 (검증만)

- [x] **Step 1: `page.js` JSX 줄 수 확인**

```bash
python3 -c "
lines=open('src/app/page.js',encoding='utf-8').read().split('\n')
r=lines.index('  return (')
print(f'로직부 {r}줄 / JSX부 {len(lines)-r}줄')
"
```

**정정:** 계획 작성 시 "약 500줄"이라고 쓴 것은 파일 전체가 아니라 **JSX 부분**을
가리킨 것이었다. 상태·Supabase/HubSpot/OCR 핸들러 등 로직부 약 1260줄은 스펙에
따라 `page.js`에 남는다. 따라서 판정 기준은 **JSX부 650줄 이하**이며, 스펙의
컴포넌트 표에 있는 블록이 전부 빠졌는지를 함께 확인한다.

실측: 로직부 1261줄 / JSX부 622줄 — 통과. 남은 JSX는 조합부와 추출 대상이
아니었던 블록(텍스트 입력 모달, 로딩 오버레이, 카메라·크로퍼·라이트박스 마운트,
액션바, 그룹 칩, 선택 액션바)뿐이다. 텍스트 입력 모달은 Task 8에서 `Sheet`로
감싸며 줄어든다.

- [ ] **Step 2: 빌드 + 린트 확인** (검증 레시피)

- [ ] **Step 3: 회귀 체크리스트 전체 수행**

Global Constraints의 회귀 체크리스트 13항목을 실제로 눌러 확인한다. 실패 항목이 있으면 해당 태스크로 돌아가 고친 뒤 다시 이 태스크를 수행한다.

- [ ] **Step 4: 커밋** (변경이 있었다면)

```bash
git add -A && git commit -m "Fix: Regressions found in component extraction"
```

---

# 2단계 — 레이아웃 적용

여기서부터 화면이 바뀐다.

---

### Task 8: Sheet — 반응형 모달/바텀시트

**Files:**
- Create: `src/components/Sheet.js`
- Modify: `src/app/globals.css` (append), `src/app/page.js` (모달 5종을 Sheet로 감싸기)

**Interfaces:**
- Produces:
  ```js
  export default function Sheet({
    title,        // string   헤더 제목 겸 aria-labelledby 대상
    onClose,      // () => void
    maxWidth,     // string   기본 '520px' — 데스크탑 모달 폭
    footer,       // ReactNode | undefined
    children,     // ReactNode
  })
  ```

- [ ] **Step 1: `Sheet.js` 생성**

```jsx
'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';

export default function Sheet({ title, onClose, maxWidth = '520px', footer, children }) {
  const titleId = useId();
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef(null);

  // Esc 로 닫기
  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // 아래로 스와이프해 닫기 (바텀시트 구간에서만 핸들이 보이므로 사실상 모바일 전용)
  const handleTouchStart = (e) => { startYRef.current = e.touches[0].clientY; };
  const handleTouchMove = (e) => {
    if (startYRef.current === null) return;
    setDragY(Math.max(0, e.touches[0].clientY - startYRef.current));
  };
  const handleTouchEnd = () => {
    if (dragY > 100) onClose();
    setDragY(0);
    startYRef.current = null;
  };

  return (
    <div
      className="sheet-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="sheet-content"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ maxWidth, transform: dragY ? `translateY(${dragY}px)` : undefined }}
      >
        <div
          className="sheet-grabber"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        />
        <div className="modal-header">
          <h3 id={titleId}>{title}</h3>
          <button onClick={onClose} className="modal-close-btn" aria-label="닫기">
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `globals.css`에 스타일 추가**

```css
/* Sheet — 데스크탑 중앙 모달 / 모바일 바텀시트 */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  animation: fadeIn 0.3s ease-out;
}

.sheet-content {
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #0c0b11;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 28px;
  box-shadow: var(--shadow-lg);
  transition: transform 0.18s ease-out;
}

.sheet-grabber { display: none; }

@media (max-width: 767px) {
  .sheet-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .sheet-content {
    max-width: none !important;
    max-height: 88dvh;
    border-radius: 24px 24px 0 0;
    border-bottom: none;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    animation: sheet-up 0.24s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .sheet-grabber {
    display: block;
    width: 40px;
    height: 4px;
    margin: 10px auto 2px;
    border-radius: 99px;
    background: rgba(255, 255, 255, 0.22);
    flex-shrink: 0;
    touch-action: none;
  }
}

@keyframes sheet-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

- [ ] **Step 3: 모달 5종을 `Sheet`로 교체**

`SettingsModal`, `GroupManageModal`, `CreateGroupModal`, `BulkAssignModal`, 그리고 텍스트 입력 모달(`page.js:1433-1506`)의 바깥 껍데기 — `.modal-overlay` + `.modal-content` + `.modal-header` + `.modal-body` + `.modal-footer` — 를 `<Sheet title=... onClose=... maxWidth=... footer={...}>`로 바꾼다. 각 모달이 쓰던 `maxWidth`를 그대로 넘긴다: 설정 `520px`, 그룹 관리 `480px`, 그룹 생성 `380px`, 일괄 지정 `420px`, 텍스트 입력 `520px`.

상세 보기 모달은 **여기서 건드리지 않는다** — Task 10에서 처리한다.

- [ ] **Step 4: 빌드 + 린트 확인**

- [ ] **Step 5: 육안 확인**

데스크탑 폭에서 5개 모달이 이전과 같은 중앙 모달로 뜨는지, 767px 이하로 줄이면 하단에서 올라오는 시트가 되는지, 그래버를 아래로 끌면 닫히는지, Esc로 닫히는지 확인한다.

- [ ] **Step 6: 커밋**

```bash
git add src/components/Sheet.js src/app/globals.css src/app/page.js src/components/SettingsModal.js src/components/GroupManageModal.js src/components/CreateGroupModal.js src/components/BulkAssignModal.js
git commit -m "Feature: Responsive Sheet — centered modal on desktop, bottom sheet on mobile"
```

---

### Task 9: AppShell + GroupSidebar — 데스크탑 2/3분할

**Files:**
- Create: `src/components/AppShell.js`, `src/components/GroupSidebar.js`
- Modify: `src/app/globals.css`, `src/app/page.js`

**Interfaces:**
- Produces:
  ```js
  // AppShell.js — 슬롯만 배치. 상태를 모른다.
  export default function AppShell({ sidebar, main, detail })

  // GroupSidebar.js
  export default function GroupSidebar({
    groups,           // Array<{ id, name, color }>
    counts,           // { all: number, ungrouped: number, byGroup: Record<id, number> }
    activeGroupId,    // string | null | 'ungrouped'
    userEmail,        // string
    onSelectGroup,    // (groupId: string | null | 'ungrouped') => void
    onCreateGroup,    // () => void
    onManageGroups,   // () => void
    onOpenSettings,   // () => void
    onSignOut,        // () => void
  })
  ```

- [ ] **Step 1: `AppShell.js` 생성**

```jsx
'use client';

import React from 'react';

export default function AppShell({ sidebar, main, detail }) {
  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar">{sidebar}</aside>
      <div className="app-shell-main">{main}</div>
      <aside className="app-shell-detail">{detail}</aside>
    </div>
  );
}
```

- [ ] **Step 2: `globals.css`에 셸 스타일 추가**

```css
/* App shell — 모바일 단일 컬럼, 1024px 사이드바, 1280px 상세 패널 */
.app-shell {
  width: 100%;
  display: block;
}

.app-shell-sidebar,
.app-shell-detail {
  display: none;
}

@media (min-width: 1024px) {
  html, body { height: 100%; overflow: hidden; }

  .app-shell {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    height: 100dvh;
  }
  .app-shell-sidebar {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    border-right: 1px solid var(--glass-border);
    padding: 20px 14px calc(20px + env(safe-area-inset-bottom, 0px));
  }
  .app-shell-main {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
  }
}

@media (min-width: 1280px) {
  .app-shell {
    grid-template-columns: 240px minmax(0, 1fr) 380px;
  }
  .app-shell-detail {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    border-left: 1px solid var(--glass-border);
    padding: 20px;
  }
}

/* 셸 안에서 기존 중앙 컬럼 제약을 푼다 */
@media (min-width: 1024px) {
  .app-shell-main .app-container {
    max-width: none;
    padding-top: 20px;
  }
  /* 사이드바로 옮겨간 요소는 셸 구간에서 숨긴다 */
  .app-shell-main .header-container,
  .app-shell-main .group-chip-filters {
    display: none;
  }
}

/* Sidebar nav */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 18px;
}

.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.sidebar-nav-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: #fff;
}

.sidebar-nav-item-active {
  background: rgba(99, 102, 241, 0.16);
  color: #c7d2fe;
}

.sidebar-nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-nav-count {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.sidebar-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary);
  padding: 0 10px;
  margin: 20px 0 6px;
}

.sidebar-footer {
  margin-top: auto;
  padding-top: 14px;
  border-top: 1px solid var(--glass-border);
}

.sidebar-user-email {
  font-size: 11px;
  color: var(--text-secondary);
  padding: 0 10px 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

`--text-muted`(#475569)는 대비가 2.8:1이라 사이드바 텍스트에 쓰지 않는다. 위 CSS는 전부 `--text-secondary`(#94a3b8)를 쓴다.

- [ ] **Step 3: `GroupSidebar.js` 생성**

로고(`page.js:1282-1290`의 `.logo-section`), 그룹 내비, 하단 계정 영역으로 구성한다. 그룹 내비 항목은 `전체`, 각 그룹, `그룹 없음` 순이고 각각 `counts`에서 개수를 읽는다. 그 아래 `새 그룹`·`그룹 관리`, 하단에 이메일·설정·로그아웃.

- [ ] **Step 4: `page.js`를 `AppShell`로 감싸기**

기존 최상위 `<div className="app-container">`를 `AppShell`의 `main` 슬롯에 넣는다.

```jsx
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
      main={<div className="app-container">{/* 기존 내용 전부 */}</div>}
      detail={null /* Task 10에서 채운다 */}
    />
  );
```

`page.js`에 개수 계산을 추가한다.

```jsx
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
```

기존 그룹 칩 줄(Task 2에서 `page.js`에 남겨둔 것)을 `<div className="group-chip-row group-chip-filters">`로 감싸 `≥1024px`에서 숨긴다. 선택 모드 토글 칩은 이 래퍼 **바깥**에 두어 모든 폭에서 보이게 한다.

- [ ] **Step 5: 빌드 + 린트 확인**

- [ ] **Step 6: 폭별 육안 확인**

1440px: 사이드바 + 목록 2분할이 뜨고 목록이 전체 폭을 쓰는지. 1024px: 동일. 1023px: 사이드바가 사라지고 기존 단일 컬럼 + 그룹 칩 줄이 돌아오는지. **iOS Safari에서 세로 스크롤이 잠기지 않는지** 반드시 확인한다(`overflow:hidden`이 `≥1024px`에만 걸려야 한다).

- [ ] **Step 7: 커밋**

```bash
git add src/components/AppShell.js src/components/GroupSidebar.js src/app/globals.css src/app/page.js
git commit -m "Feature: Desktop shell with group sidebar"
```

---

### Task 10: 상세 패널 배치 + 접근성 보정

**Files:**
- Modify: `src/app/page.js`, `src/app/globals.css`, `src/components/CardListItem.js`

**Interfaces:**
- Consumes: Task 3의 `CardDetail`, Task 8의 `Sheet`, Task 9의 `AppShell`
- Produces:
  ```js
  // page.js 내부 헬퍼
  // useIsDetailPane(): boolean — matchMedia('(min-width: 1280px)') 구독
  ```

- [ ] **Step 1: 브레이크포인트 훅 추가 (`page.js`)**

```jsx
  const [isDetailPane, setIsDetailPane] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    const apply = () => setIsDetailPane(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
```

SSR에서는 `false`로 시작하므로 하이드레이션 불일치가 없다.

- [ ] **Step 2: 상세를 패널/시트로 분기**

`AppShell`의 `detail` 슬롯에는 `≥1280px`일 때의 내용을 넣고, 그 미만에서는 `Sheet`로 띄운다. 액션 버튼(수정/삭제/HubSpot)은 두 경우 모두 필요하므로 `renderDetailActions()` 헬퍼 하나로 만들어 패널 하단과 시트 `footer`에 각각 넘긴다.

```jsx
  const detailActions = viewingCard ? (
    <>
      <button onClick={() => { setEditingCard(viewingCard); setViewingCard(null); }} className="btn btn-secondary">
        <Edit3 size={14} />수정
      </button>
      <div className="modal-footer-right">
        <button onClick={() => handleDeleteCard(viewingCard.id)} className="btn btn-danger">
          <Trash2 size={14} />삭제
        </button>
        {viewingCard.hubspot_id ? (
          <button onClick={() => syncToHubSpot(viewingCard)} disabled={loading} className="btn btn-success-badge">
            <Check size={14} />HubSpot 업데이트
          </button>
        ) : (
          <button onClick={() => syncToHubSpot(viewingCard)} disabled={loading} className="btn btn-hubspot">
            <ExternalLink size={14} />HubSpot에 등록
          </button>
        )}
      </div>
    </>
  ) : null;
```

`detail` 슬롯:

```jsx
      detail={user ? (viewingCard ? (
        <>
          <CardDetail
            card={viewingCard}
            groups={groups}
            activeGroupIds={cardGroupMap[viewingCard.id] || []}
            onToggleGroup={toggleCardGroup}
            onOpenImage={setLightboxImage}
          />
          <div className="detail-pane-actions">{detailActions}</div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon-box"><FileText size={24} /></div>
          <h3>명함을 선택하세요</h3>
          <p>왼쪽 목록에서 명함을 고르면 여기에 상세 정보가 표시됩니다.</p>
        </div>
      )) : null}
```

`<1280px`에서만 `Sheet`를 렌더한다.

```jsx
      {viewingCard && !isDetailPane && (
        <Sheet title="명함 상세 카드" onClose={() => setViewingCard(null)} footer={detailActions}>
          <CardDetail
            card={viewingCard}
            groups={groups}
            activeGroupIds={cardGroupMap[viewingCard.id] || []}
            onToggleGroup={toggleCardGroup}
            onOpenImage={setLightboxImage}
          />
        </Sheet>
      )}
```

기존 상세 모달 블록(`page.js:2147-2377`의 껍데기)은 제거한다.

- [ ] **Step 3: `globals.css`에 패널 액션 스타일 추가**

```css
.detail-pane-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--glass-border);
}
```

- [ ] **Step 4: 카드 항목 키보드 접근성 (`CardListItem.js`)**

바깥 `<div onClick>`에 다음을 추가한다. 카드 안에 중첩 버튼이 없으므로 `role="button"`으로 충분하다.

```jsx
      role="button"
      tabIndex={0}
      aria-pressed={selectionMode ? isSelected : undefined}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(card);
        }
      }}
```

포커스 링을 `globals.css`에 추가한다.

```css
.card-item:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

- [ ] **Step 5: 폼 label 연결**

`CardEditForm.js`와 `SettingsModal.js`의 각 `<label>`에 `htmlFor`를, 대응 `<input>`에 같은 `id`를 준다. `useId()`를 컴포넌트 최상단에서 한 번 호출해 접두사로 쓴다: `const uid = useId();` → `htmlFor={`${uid}-company`}` / `id={`${uid}-company`}`.

- [ ] **Step 6: 빌드 + 린트 확인**

- [ ] **Step 7: 육안 확인**

1440px: 명함을 클릭하면 우측 패널이 채워지고, 다른 명함을 클릭하면 패널만 바뀌는지(모달이 뜨지 않는지). 미선택 시 빈 상태가 보이는지. 1279px로 줄이면 클릭 시 중앙 모달로 뜨는지. 767px에서 바텀시트로 뜨는지. Tab 키로 카드에 포커스가 가고 Enter로 열리는지.

- [ ] **Step 8: 커밋**

```bash
git add src/app/page.js src/app/globals.css src/components/CardListItem.js src/components/CardEditForm.js src/components/SettingsModal.js
git commit -m "Feature: Detail pane on wide screens, sheet below; keyboard and label a11y"
```

---

### Task 11: 모바일 FAB · 그룹 칩 가로 스크롤 · 검색 UX

**Files:**
- Modify: `src/app/globals.css`, `src/app/page.js`, `src/components/CardList.js`

- [ ] **Step 1: 그룹 칩 가로 스크롤 (`globals.css`)**

```css
@media (max-width: 1023px) {
  .group-chip-row {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
    -webkit-overflow-scrolling: touch;
    mask-image: linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%);
  }
  .group-chip-row::-webkit-scrollbar { display: none; }
  .group-chip { flex-shrink: 0; }
}
```

- [ ] **Step 2: FAB (`globals.css`)**

```css
.fab {
  position: fixed;
  right: calc(env(safe-area-inset-right, 0px) + 18px);
  bottom: calc(env(safe-area-inset-bottom, 0px) + 18px);
  z-index: 120;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  border: none;
  background: var(--primary-gradient);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 26px rgba(99, 102, 241, 0.45);
  cursor: pointer;
  transition: transform 0.15s;
}

.fab:active { transform: scale(0.94); }

@media (min-width: 1024px) {
  .fab { display: none; }
}

/* 셸 구간에서만 보이는 데스크탑 액션바 / 그 미만에서만 보이는 FAB */
@media (max-width: 1023px) {
  .actions-bar .btn-add-desktop { display: none; }
}
```

- [ ] **Step 3: `page.js`에 FAB 렌더**

`AppShell`의 형제로(즉 `AppShell` 바깥, 반환 fragment 안에) 둔다. 선택 모드일 때는 선택 액션바와 겹치므로 숨긴다.

```jsx
      {user && !selectionMode && (
        <button type="button" onClick={handleAddNewCard} className="fab" aria-label="새 명함 추가">
          <Plus size={26} />
        </button>
      )}
```

`actions-bar`의 기존 `새 명함 추가` 버튼에 `btn-add-desktop` 클래스를 추가해 `<1024px`에서 숨긴다. `텍스트 입력` 버튼은 검색바 오른쪽 아이콘 버튼으로 남겨 모든 폭에서 보이게 한다(레이블은 `≥1024px`에서만 표시).

- [ ] **Step 4: 검색 지우기 버튼 (`page.js`의 actions-bar)**

```jsx
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="search-clear-btn"
                  aria-label="검색어 지우기"
                >
                  <X size={16} />
                </button>
              )}
```

```css
.search-clear-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  cursor: pointer;
}

.search-clear-btn:hover { background: rgba(255, 255, 255, 0.12); color: #fff; }
```

- [ ] **Step 5: 검색 결과 없음 상태 (`CardList.js`)**

`CardList`에 `searchQuery`(string)와 `onClearSearch`(`() => void`) prop을 추가하고, 빈 상태를 두 갈래로 나눈다.

```jsx
          ) : totalCount === 0 ? (
            searchQuery ? (
              <div className="empty-state">
                <div className="empty-icon-box"><Search size={24} /></div>
                <h3>&quot;{searchQuery}&quot; 검색 결과가 없습니다</h3>
                <p>이름, 회사명, 이메일, 전화번호로 다시 검색해 보세요.</p>
                <button type="button" onClick={onClearSearch} className="btn btn-secondary" style={{ marginTop: '16px' }}>
                  검색 초기화
                </button>
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-icon-box"><FileText size={24} /></div>
                <h3>저장된 명함이 없습니다</h3>
                <p>오른쪽 아래 &#43; 버튼을 눌러 첫 번째 명함을 카메라로 스캔하거나 이미지를 올려보세요.</p>
              </div>
            )
          ) : (
```

`&quot;`를 쓰므로 `react/no-unescaped-entities` 2건이 사라진다 — 린트 총계가 7 → 5로 줄어드는 것은 정상이다.

- [ ] **Step 6: 빌드 + 린트 확인** (총계 5건 기대)

- [ ] **Step 7: 육안 확인**

375px: FAB이 우하단에 있고 선택 모드에서 사라지는지, 그룹 칩이 한 줄 가로 스크롤인지, 검색어 입력 시 X가 뜨고 눌러 초기화되는지, 없는 이름을 검색하면 "검색 결과가 없습니다"가 뜨는지. 1440px: FAB이 없고 액션바에 `새 명함 추가`가 있는지.

- [ ] **Step 8: 커밋**

```bash
git add src/app/globals.css src/app/page.js src/components/CardList.js
git commit -m "Feature: Mobile FAB, horizontal group chips, search clear and empty state"
```

---

### Task 12: 밀도 토글

**Files:**
- Modify: `src/components/CardList.js`, `src/app/globals.css`

- [ ] **Step 1: `CardList.js`에 로컬 상태 추가**

```jsx
  const [density, setDensity] = useState('comfortable');

  useEffect(() => {
    const saved = window.localStorage.getItem('cardListDensity');
    if (saved === 'compact' || saved === 'comfortable') setDensity(saved);
  }, []);

  const changeDensity = (next) => {
    setDensity(next);
    window.localStorage.setItem('cardListDensity', next);
  };
```

토글 버튼을 섹션 헤더 오른쪽에 둔다.

```jsx
            <div className="density-toggle" role="group" aria-label="목록 밀도">
              {[['comfortable', '넓게'], ['compact', '좁게']].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => changeDensity(key)}
                  className={`density-toggle-btn ${density === key ? 'density-toggle-btn-active' : ''}`}
                  aria-pressed={density === key}
                >
                  {label}
                </button>
              ))}
            </div>
```

카드 그리드 래퍼에 `className={`cards-grid cards-grid-${density}`}`를 적용한다.

- [ ] **Step 2: `globals.css`에 밀도 스타일 추가**

```css
.density-toggle {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
}

.density-toggle-btn {
  padding: 5px 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--text-secondary);
  font-family: var(--font-sans);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.density-toggle-btn-active {
  background: rgba(99, 102, 241, 0.22);
  color: #c7d2fe;
}

/* 좁게: 썸네일과 여백을 줄이고 메타 목록을 감춘다 */
.cards-grid-compact .card-item {
  padding: 10px 14px;
  gap: 12px;
  align-items: center;
}
.cards-grid-compact .card-thumb {
  width: 64px;
  height: 40px;
}
.cards-grid-compact .card-meta-list {
  display: none;
}
.cards-grid-compact .card-company {
  margin-bottom: 0;
}
.cards-grid-compact .card-item:hover {
  transform: none;
}
```

- [ ] **Step 3: 빌드 + 린트 확인**

- [ ] **Step 4: 육안 확인** — 토글을 눌러 카드 높이가 줄어드는지, 새로고침 후에도 선택이 유지되는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/CardList.js src/app/globals.css
git commit -m "Feature: Card list density toggle"
```

---

### Task 13: 최종 회귀 확인

**Files:** 없음 (검증만)

- [ ] **Step 1: 빌드 + 린트 확인** (총계 5건 기대)

- [ ] **Step 2: 폭별 확인** — 320 / 375 / 768 / 1024 / 1280 / 1440px에서 레이아웃이 스펙의 반응형 전환점 표와 일치하는지 확인한다.

- [ ] **Step 3: 회귀 체크리스트 전체 수행** — Global Constraints의 13항목.

- [ ] **Step 4: iOS Safari 확인** — 실제 기기 또는 반응형 모드에서 세로 스크롤, safe-area(노치/홈 인디케이터), 바텀시트 스와이프 닫기를 확인한다. `≥1024px`에만 걸린 `overflow:hidden`이 모바일에 새지 않았는지가 핵심이다.

- [ ] **Step 5: 커밋** (수정이 있었다면)

```bash
git add -A && git commit -m "Fix: Regressions found in final layout verification"
```

---

## 자체 점검 결과

**스펙 커버리지:** 반응형 전환점 → Task 8·9·10. 컴포넌트 분리 14개 → Task 1~6 및 8·9(`Sheet`, `AppShell`, `GroupSidebar`). 데스크탑 3분할(사이드바·목록·상세) → Task 9·10. 밀도 토글 → Task 12. 스크롤 구조 변경 → Task 9 Step 2. 모바일 4항목 → Task 8(바텀시트)·11(FAB·칩·검색). 접근성 3항목 → Task 10 Step 4·5, Task 8(`role="dialog"`). 오류 처리(`useToast`) → 기존 유지, 신규 상태 없음. 실행 순서 2단계 → Task 1~7 / 8~13. 검증 → 각 태스크 및 Task 7·13.

**미커버 항목 없음.** 비목표(드래그앤드롭, 정렬·필터, 표 뷰, `user-scalable`, `--text-muted` 대비, 테스트 러너)는 의도적으로 태스크가 없다.

**타입 일관성:** `resolveGroupBadges(cardId)`(Task 2)와 `CardListItem`의 `groupBadges`가 짝을 이룬다. `getGroupColor`는 Task 6에서 `src/lib/groupColors.js`로 이동하며 Task 3의 `CardDetail`도 거기서 import한다. `detailActions`(Task 10)는 패널과 `Sheet` `footer` 양쪽에 같은 노드로 쓰인다. `counts` 형태 `{ all, ungrouped, byGroup }`는 Task 9의 `sidebarCounts`가 생산하고 `GroupSidebar`가 소비한다.
