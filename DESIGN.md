# Design System — AI Translate Bot

## Product Context
- **What this is:** Gemma 4 E4B 기반 macOS 로컬 번역 유틸리티 앱
- **Who it's for:** 영어/일본어 → 한국어 번역이 필요한 개발자, 학생
- **Space/industry:** macOS 생산성 도구, 로컬 AI 유틸리티
- **Project type:** macOS 데스크탑 유틸리티 (Electron)

## Aesthetic Direction
- **Direction:** Industrial/Utilitarian
- **Decoration level:** Minimal — 타이포그래피와 간격이 전부. 장식 요소 없음.
- **Mood:** macOS의 네이티브 기능처럼 느껴져야 함. "앱을 쓰고 있다"가 아니라 "macOS의 기능을 쓰고 있다". Spotlight, Dictionary.app, Raycast와 같은 계열.
- **Reference apps:** macOS Spotlight, Dictionary.app, Raycast, BarTranslate

## Typography
- **Display/Hero:** system-ui (SF Pro Display on macOS) — macOS 네이티브 통합. 커스텀 폰트는 이물감.
- **Body:** system-ui (SF Pro Text on macOS) — 가독성 최적화된 시스템 폰트.
- **UI/Labels:** system-ui
- **Data/Tables:** system-ui with font-variant-numeric: tabular-nums
- **Code:** ui-monospace (SF Mono on macOS)
- **Loading:** 시스템 폰트 사용으로 로딩 불필요
- **Scale:**
  - 2xs: 10px — 타임스탬프, 메타데이터
  - xs: 11px — 레이블, 캡션
  - sm: 12px — 원문 텍스트 (팝업), 보조 정보
  - base: 14px — 본문, 히스토리 목록 항목
  - lg: 16px — 번역 결과 (팝업 핵심), 섹션 제목
  - xl: 18px — 윈도우 제목
  - 2xl: 24px — 빈 상태 아이콘/헤딩

## Color
- **Approach:** Restrained — 1 액센트 + 뉴트럴. 색상은 드물고 의미 있게.
- **Dark mode (Phase 1 기본):**
  - Background (popover): #1e1e1e
  - Background (window): #252525
  - Surface (card/hover): #2d2d2d
  - Border: #3a3a3a
  - Text primary: #ffffff
  - Text secondary: #888888
  - Text muted: #555555
  - Accent: #007AFF (macOS system blue)
  - Accent hover: #0066D6
- **Semantic:**
  - Success: #30D158 (macOS green)
  - Warning: #FFD60A (macOS yellow)
  - Error: #FF453A (macOS red)
  - Info: #007AFF (same as accent)
- **Light mode (Phase 2):**
  - Background: #ffffff / #f5f5f5
  - Text primary: #1a1a1a
  - Text secondary: #666666
  - 나머지 액센트/시맨틱 색상 동일

## Spacing
- **Base unit:** 8px
- **Density:**
  - Popup: compact (padding 8-12px)
  - History window: comfortable (padding 16-24px)
- **Scale:** 2xs(2) xs(4) sm(8) md(12) lg(16) xl(24) 2xl(32) 3xl(48)

## Layout
- **Approach:** Grid-disciplined
- **Popup:** 단일 컬럼, 400px 고정 너비, 200-500px 가변 높이
- **History window:** 마스터-디테일 분할 (왼쪽 목록 240px + 오른쪽 상세)
- **Max content width:** 팝업 400px, 히스토리 800px (리사이즈 가능)
- **Border radius:**
  - sm: 4px — 버튼, 입력 필드
  - md: 8px — 카드, 패널
  - lg: 12px — 팝업 외곽
  - full: 9999px — 태그, 뱃지

## Motion
- **Approach:** Minimal-functional
- **Easing:** enter(ease-out) exit(ease-in)
- **Duration:** micro(100ms) short(150ms) medium(250ms)
- **Specific animations:**
  - Popup appear: fade-in 150ms ease-out
  - Popup dismiss: fade-out 100ms ease-in
  - Streaming cursor: blink 500ms ease-in-out infinite
  - Streaming text: 토큰 단위 append (애니메이션 아님, 즉시 렌더)
  - Loading pulse: opacity 0.4→1.0, 1s ease-in-out infinite

## Visual Effects
- **Popup vibrancy:** Electron vibrancy/backgroundMaterial로 macOS 배경 blur 효과. 지원 안 되는 환경에서는 #1e1e1e 불투명 배경 fallback.
- **Shadow:** 0 4px 20px rgba(0,0,0,0.5) — 팝업 외곽
- **Backdrop:** 팝업 뒤 배경 어둡게 하지 않음 (시스템 팝오버처럼)

## Popup Information Hierarchy
```
┌─────────────────────────────────────┐
│ 원문 (12px, #888, 최대 2줄 + ...)  │  ← 3rd: 확인용
├─────────────────────────────────────┤
│ 번역 결과                           │  ← 1st: 핵심
│ (16px, #fff, font-weight: 600)     │
├─────────────────────────────────────┤
│ EN→KO  │  📋 복사  │  ✕ 닫기      │  ← 2nd: 액션
│ (11px, #888)                       │
└─────────────────────────────────────┘
```

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-08 | Initial design system | /design-consultation. macOS 네이티브 유틸리티 스타일. |
| 2026-04-08 | 다크 모드 전용 (Phase 1) | 개발자 도구 사용자 대부분 다크 모드. 라이트는 Phase 2. |
| 2026-04-08 | system-ui 단일 폰트 | macOS 유틸리티에서 커스텀 폰트는 이물감. |
| 2026-04-08 | vibrancy blur 효과 | macOS 시스템 팝오버와의 시각적 일관성. |
| 2026-04-08 | 8px 그리드 | macOS HIG 호환, compact/comfortable 밀도 구분. |
