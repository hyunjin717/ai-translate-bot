# TODOS

## Phase 2: 프롬프트 튜닝 및 출력 검증
- **What:** Gemma 4 E4B 실제 번역 품질 테스트 + 프롬프트 개선 + 모델이 설명을 추가하는 경우 필터링 로직
- **Why:** 로컬 모델은 "Output ONLY the translation" 지시를 무시할 가능성 있음. /plan-eng-review outside voice가 지적한 핵심 리스크.
- **Context:** Phase 1 기본 구현 후 실제 영어/일본어 → 한국어 번역 품질을 수동 테스트하고, 프롬프트를 조정. 필요 시 출력에서 설명 부분을 자동 제거하는 후처리 로직 추가.
- **Depends on:** Phase 1 기본 구현 완료

## Phase 2: 입력 제한을 토큰 기반으로 조정
- **What:** 현재 8000자 제한을 Gemma 4 E4B 토크나이저 기반 토큰 수 제한으로 변경
- **Why:** 한국어/일본어는 영어보다 char-to-token 비율이 높음. 동일 문자수라도 토큰이 2-3배 차이날 수 있어서, 문자 기반 제한은 부정확.
- **Context:** E4B context window는 128K 토큰. 시스템 프롬프트 오버헤드를 고려해 실제 입력 한도를 토큰 기준으로 설정. `ollama` 패키지의 토크나이저 API 또는 tiktoken 대안 조사 필요.
- **Depends on:** Phase 1 기본 구현 완료

## Phase 2: 라이트 모드 지원
- **What:** macOS 라이트 모드 사용자를 위한 라이트 테마 추가
- **Why:** Phase 1은 다크 전용. 배포 시 라이트 모드 사용자도 있음.
- **Context:** Tailwind의 dark: 클래스 사용. `nativeTheme.shouldUseDarkColors`로 macOS 설정 자동 감지. 라이트 팔레트: 배경 #ffffff/#f5f5f5, 텍스트 #1a1a1a/#666666, 액센트 #007AFF 유지.
- **Depends on:** Phase 1 기본 구현 완료
