import { useState, useEffect, useCallback } from 'react'

// macOS 시스템 단축키 블랙리스트
const SYSTEM_SHORTCUTS = new Set([
  // 기본 편집
  'CommandOrControl+C', 'CommandOrControl+V', 'CommandOrControl+X',
  'CommandOrControl+Z', 'CommandOrControl+A', 'CommandOrControl+S',
  'CommandOrControl+Shift+Z',
  // 앱 관리
  'CommandOrControl+Q', 'CommandOrControl+W', 'CommandOrControl+M',
  'CommandOrControl+H', 'CommandOrControl+N', 'CommandOrControl+O',
  'CommandOrControl+P', 'CommandOrControl+F',
  // 탭/윈도우
  'CommandOrControl+T', 'CommandOrControl+Shift+T',
  'CommandOrControl+TAB', 'CommandOrControl+Shift+TAB',
  // 시스템
  'CommandOrControl+SPACE', 'CommandOrControl+Option+SPACE',
  'CommandOrControl+Shift+3', 'CommandOrControl+Shift+4', 'CommandOrControl+Shift+5',
  'CommandOrControl+Option+ESC',
  // Finder/Spotlight
  'CommandOrControl+Shift+N', 'CommandOrControl+Shift+G',
  'CommandOrControl+Option+D',
])

function checkSystemConflict(shortcut: string): string | null {
  if (SYSTEM_SHORTCUTS.has(shortcut)) {
    const display = shortcut
      .replace('CommandOrControl', '⌘')
      .replace('Option', '⌥')
      .replace('Shift', '⇧')
      .replace(/\+/g, ' ')
    return `${display}은(는) macOS 시스템 단축키입니다.`
  }
  return null
}

const LANGUAGES = [
  { value: '한국어', label: '한국어' },
  { value: 'English', label: 'English' },
  { value: '日本語', label: '日本語' },
  { value: '中文', label: '中文' },
  { value: 'Español', label: 'Español' },
  { value: 'Français', label: 'Français' },
  { value: 'Deutsch', label: 'Deutsch' }
]

export function SettingsWindow() {
  const [shortcut, setShortcut] = useState('')
  const [targetLang, setTargetLang] = useState('')
  const [model, setModel] = useState('')
  const [thinking, setThinking] = useState(false)
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [recording, setRecording] = useState(false)
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null)
  const [shortcutError, setShortcutError] = useState('')
  const [saved, setSaved] = useState(false)

  const refreshSettings = useCallback(() => {
    window.api.settings.get().then((s) => {
      setShortcut(s.shortcut)
      setTargetLang(s.targetLang)
      setModel(s.model)
      setThinking(s.thinking)
    })
    window.api.settings.listModels().then(setAvailableModels)
  }, [])

  // 마운트 시 + 창이 다시 보일 때마다 새로고침
  useEffect(() => {
    refreshSettings()
    const onFocus = () => refreshSettings()
    globalThis.addEventListener('focus', onFocus)
    return () => globalThis.removeEventListener('focus', onFocus)
  }, [refreshSettings])

  const handleLangChange = useCallback(async (lang: string) => {
    setTargetLang(lang)
    await window.api.settings.setTargetLang(lang)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [])

  const handleModelChange = useCallback(async (m: string) => {
    setModel(m)
    await window.api.settings.setModel(m)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [])

  const handleThinkingChange = useCallback(async (v: boolean) => {
    setThinking(v)
    await window.api.settings.setThinking(v)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [])

  const handleRecordShortcut = useCallback(() => {
    setRecording(true)
    setPendingShortcut(null)
    setShortcutError('')

    const handler = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // ESC → 녹화 취소
      if (e.key === 'Escape') {
        setRecording(false)
        setPendingShortcut(null)
        window.removeEventListener('keydown', handler)
        return
      }

      // 수식키만 누른 경우 무시
      if (['Meta', 'Control', 'Alt', 'Shift'].includes(e.key)) return

      // 수식키 없이 단독 키 → 거부
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        setShortcutError('수식키(⌘, ⌥, ⇧)와 함께 눌러주세요.')
        return
      }

      // e.key → Electron accelerator 형식 변환
      const KEY_MAP: Record<string, string> = {
        ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down',
        ' ': 'Space', Enter: 'Return', Backspace: 'Backspace', Delete: 'Delete',
        Tab: 'Tab',
      }
      const keyName = KEY_MAP[e.key] || e.key.toUpperCase()

      const parts: string[] = []
      if (e.metaKey || e.ctrlKey) parts.push('CommandOrControl')
      if (e.altKey) parts.push('Option')
      if (e.shiftKey) parts.push('Shift')
      parts.push(keyName)

      const candidate = parts.join('+')

      // 시스템 단축키 충돌 체크
      const conflict = checkSystemConflict(candidate)
      if (conflict) {
        setShortcutError(conflict)
        setRecording(false)
        setPendingShortcut(null)
        window.removeEventListener('keydown', handler)
        return
      }

      setPendingShortcut(candidate)
      setRecording(false)
      setShortcutError('')

      window.removeEventListener('keydown', handler)
    }

    window.addEventListener('keydown', handler)
  }, [])

  const handleConfirmShortcut = useCallback(async () => {
    if (!pendingShortcut) return

    const result = await window.api.settings.setShortcut(pendingShortcut)
    if (result.shortcut === pendingShortcut) {
      setShortcut(pendingShortcut)
      setPendingShortcut(null)
      setShortcutError('')
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } else {
      setShortcutError('단축키 등록에 실패했습니다. 다른 앱이 사용 중일 수 있습니다.')
    }
  }, [pendingShortcut])

  const handleCancelShortcut = useCallback(() => {
    setPendingShortcut(null)
    setShortcutError('')
  }, [])

  const displayShortcut = (s: string) =>
    s
      .replace('CommandOrControl', '⌘')
      .replace('Option', '⌥')
      .replace('Shift', '⇧')
      .replace('Left', '←')
      .replace('Right', '→')
      .replace('Up', '↑')
      .replace('Down', '↓')
      .replace('Space', '⎵')
      .replace('Return', '↩')
      .replace('Backspace', '⌫')
      .replace('Delete', '⌦')
      .replace(/\+/g, ' ')

  return (
    <div className="h-screen bg-bg-window text-white flex flex-col">
      <div
        className="h-[38px] flex items-center justify-center text-sm text-[#888] shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        설정
      </div>

      <div className="flex-1 px-xl py-lg space-y-xl overflow-y-auto">
        {/* Shortcut */}
        <div>
          <label className="text-xs text-[#888] font-medium uppercase tracking-wide block mb-sm">
            번역 단축키
          </label>

          {/* 현재 단축키 표시 */}
          <div className="flex items-center gap-sm mb-sm">
            <span className="text-base text-white">{displayShortcut(shortcut)}</span>
            {!recording && !pendingShortcut && (
              <button
                onClick={handleRecordShortcut}
                className="px-sm py-xs text-xs rounded-sm border border-border hover:border-[#555] text-[#888] transition-colors"
              >
                변경
              </button>
            )}
          </div>

          {/* 녹화 중 */}
          {recording && (
            <div className="px-lg py-md rounded-md border border-accent bg-accent/10 text-accent text-sm">
              키 조합을 입력하세요... (ESC로 취소)
            </div>
          )}

          {/* 후보 확인 */}
          {pendingShortcut && (
            <div className="px-lg py-md rounded-md border border-border bg-bg-surface space-y-sm">
              <p className="text-sm text-white">
                새 단축키: <span className="font-semibold">{displayShortcut(pendingShortcut)}</span>
              </p>
              <div className="flex gap-sm">
                <button
                  onClick={handleConfirmShortcut}
                  className="px-md py-xs text-xs rounded-sm bg-accent text-white hover:bg-accent-hover transition-colors"
                >
                  적용
                </button>
                <button
                  onClick={handleCancelShortcut}
                  className="px-md py-xs text-xs rounded-sm border border-border text-[#888] hover:border-[#555] transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          )}

          {/* 에러 */}
          {shortcutError && (
            <p className="text-xs text-semantic-error mt-xs">{shortcutError}</p>
          )}
        </div>

        {/* Target Language */}
        <div>
          <label className="text-xs text-[#888] font-medium uppercase tracking-wide block mb-sm">
            기본 번역 언어
          </label>
          <div className="grid grid-cols-2 gap-sm">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.value}
                onClick={() => handleLangChange(lang.value)}
                className={`px-md py-sm rounded-md border text-sm transition-colors ${
                  targetLang === lang.value
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-bg-surface text-white hover:border-[#555]'
                }`}
              >
                {lang.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model */}
        <div>
          <label className="text-xs text-[#888] font-medium uppercase tracking-wide block mb-sm">
            번역 모델
          </label>
          {availableModels.length > 0 ? (
            <select
              value={model}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-md py-sm rounded-md border border-border bg-bg-surface text-white text-sm outline-none focus:border-accent transition-colors"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-[#888]">Ollama에 설치된 모델이 없습니다.</p>
          )}
          <p className="text-2xs text-[#555] mt-xs">현재: {model}</p>
        </div>

        {/* Thinking */}
        <div>
          <label className="text-xs text-[#888] font-medium uppercase tracking-wide block mb-sm">
            Thinking 모드
          </label>
          <button
            onClick={() => handleThinkingChange(!thinking)}
            className={`flex items-center gap-sm px-md py-sm rounded-md border text-sm transition-colors ${
              thinking
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-surface text-[#888]'
            }`}
          >
            <span className={`w-[36px] h-[20px] rounded-full relative transition-colors ${thinking ? 'bg-accent' : 'bg-[#555]'}`}>
              <span className={`absolute top-[2px] w-[16px] h-[16px] rounded-full bg-white transition-transform ${thinking ? 'left-[18px]' : 'left-[2px]'}`} />
            </span>
            {thinking ? 'ON' : 'OFF'}
          </button>
          <p className="text-2xs text-[#555] mt-xs">OFF 시 더 빠른 응답, ON 시 더 정확한 번역</p>
          <p className="text-2xs text-[#555] mt-xs">※ 이미지 번역은 항상 Thinking이 적용됩니다</p>
        </div>

        {saved && (
          <p className="text-xs text-semantic-success text-center">✓ 저장됨</p>
        )}
      </div>

      <div className="px-xl py-md border-t border-border text-2xs text-[#555] text-center">
        AI Translate Bot v0.1.0
      </div>
    </div>
  )
}
