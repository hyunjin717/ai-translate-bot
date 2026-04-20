import { useEffect, useCallback, useState, useRef } from 'react'

type PopupState = {
  status: 'idle' | 'loading' | 'streaming' | 'complete' | 'error'
  sourceText: string
  translatedText: string
  error: string
  isImage: boolean
  sourcePhase: 'idle' | 'extracting' | 'done'
}

export function TranslatePopup() {
  const [state, setState] = useState<PopupState>({
    status: 'idle',
    sourceText: '',
    translatedText: '',
    error: '',
    isImage: false,
    sourcePhase: 'idle'
  })
  const [copied, setCopied] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-resize window based on content
  useEffect(() => {
    if (!containerRef.current) return
    const observer = new ResizeObserver(() => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight
      // Add some padding for the window chrome
      const targetHeight = Math.min(Math.max(height + 2, 100), 600)
      window.api.window.resize(600, targetHeight)
    })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  // Also resize on content change
  useEffect(() => {
    if (!containerRef.current) return
    const height = containerRef.current.scrollHeight
    const targetHeight = Math.min(Math.max(height + 2, 100), 600)
    window.api.window.resize(600, targetHeight)
  }, [state.translatedText, state.sourceText, state.status, state.error, state.sourcePhase])

  // Auto-scroll only when user is already at the bottom
  const userScrolledUp = useRef(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 20
      userScrolledUp.current = !atBottom
    }
    el.addEventListener('scroll', handleScroll)
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (state.status === 'streaming' && contentRef.current && !userScrolledUp.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight
    }
  }, [state.translatedText, state.status])

  useEffect(() => {
    const unsubChunk = window.api.translate.onStreamChunk((chunk) => {
      setState((prev) => ({
        ...prev,
        status: 'streaming',
        translatedText: prev.translatedText + chunk
      }))
    })

    const unsubComplete = window.api.translate.onComplete((fullText) => {
      setState((prev) => ({ ...prev, status: 'complete', translatedText: fullText }))
    })

    const unsubError = window.api.translate.onError((error) => {
      setState((prev) => ({ ...prev, status: 'error', error }))
    })

    return () => {
      unsubChunk()
      unsubComplete()
      unsubError()
    }
  }, [])

  useEffect(() => {
    const unsubSource = window.api.translate.onSource((text) => {
      setState({ status: 'loading', sourceText: text, translatedText: '', error: '', isImage: false, sourcePhase: 'idle' })
      setCopied(false)
    })
    const unsubImageStart = window.api.translate.onImageStart(() => {
      setState({ status: 'loading', sourceText: '', translatedText: '', error: '', isImage: true, sourcePhase: 'extracting' })
      setCopied(false)
    })
    const unsubRetry = window.api.translate.onRetry((attempt) => {
      setState({ status: 'loading', sourceText: '', translatedText: '', error: '', isImage: true, sourcePhase: 'extracting' })
      setState((prev) => ({ ...prev, error: `재시도 중... (${attempt}/${2})` }))
    })
    const unsubSourceChunk = window.api.translate.onSourceChunk((chunk) => {
      setState((prev) => ({
        ...prev,
        status: 'streaming',
        sourceText: prev.sourcePhase === 'extracting' ? prev.sourceText + chunk : prev.sourceText
      }))
    })
    const unsubSourceComplete = window.api.translate.onSourceComplete(() => {
      setState((prev) => ({ ...prev, sourcePhase: 'done' }))
    })
    return () => {
      unsubSource()
      unsubImageStart()
      unsubRetry()
      unsubSourceChunk()
      unsubSourceComplete()
    }
  }, [])

  const handleClose = useCallback(() => {
    window.api.window.close()
    setState({ status: 'idle', sourceText: '', translatedText: '', error: '', isImage: false, sourcePhase: 'idle' })
  }, [])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(state.translatedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [state.translatedText])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleClose])

  return (
    <div
      ref={containerRef}
      className="flex flex-col bg-bg-popover rounded-lg shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden"
    >
      {/* Drag handle — 창 이동 가능 영역 */}
      <div
        className="h-[24px] flex items-center justify-center cursor-grab active:cursor-grabbing shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="w-[36px] h-[4px] rounded-full bg-[#555]" />
      </div>

      {/* Source text */}
      {state.sourceText && (
        <div className="px-lg pb-sm border-b border-border shrink-0">
          {state.isImage && (
            <p className="text-2xs text-[#555] mb-xs">추출된 원문</p>
          )}
          <p className="text-sm text-[#888] line-clamp-6 whitespace-pre-wrap">
            {state.sourceText}
            {state.isImage && state.sourcePhase === 'extracting' && (
              <span className="animate-blink text-accent"> ▍</span>
            )}
          </p>
        </div>
      )}

      {/* Image translation: separator between extraction and translation */}
      {state.isImage && state.sourcePhase === 'done' && state.translatedText && (
        <div className="px-lg pt-xs shrink-0">
          <p className="text-2xs text-[#555]">번역</p>
        </div>
      )}

      {/* Translation result — scrollable */}
      <div
        ref={contentRef}
        className="flex-1 px-lg py-md overflow-y-auto min-h-[40px] max-h-[400px]"
      >
        {state.status === 'loading' && (
          <div className="flex flex-col gap-xs">
            <div className="flex items-center gap-sm">
              <span className="inline-flex gap-[3px]">
                <span className="w-[5px] h-[5px] rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
                <span className="w-[5px] h-[5px] rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
                <span className="w-[5px] h-[5px] rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
              </span>
              <span className="text-sm text-[#888]">
                {state.error || (state.isImage ? 'thinking 중...' : '모델 응답 대기 중...')}
              </span>
            </div>
          </div>
        )}

        {state.status === 'error' && (
          <p className="text-sm text-semantic-error">{state.error}</p>
        )}

        {(state.status === 'streaming' || state.status === 'complete') &&
          !(state.isImage && state.sourcePhase === 'extracting') && (
          <p className="text-lg text-white font-semibold leading-relaxed whitespace-pre-wrap break-words">
            {state.translatedText || (
              <span className="text-sm text-[#888] font-normal flex items-center gap-sm">
                <span className="inline-flex gap-[3px]">
                  <span className="w-[5px] h-[5px] rounded-full bg-accent animate-bounce [animation-delay:0ms]" />
                  <span className="w-[5px] h-[5px] rounded-full bg-accent animate-bounce [animation-delay:150ms]" />
                  <span className="w-[5px] h-[5px] rounded-full bg-accent animate-bounce [animation-delay:300ms]" />
                </span>
                {state.isImage ? '번역 중...' : 'thinking 중...'}
              </span>
            )}
            {state.status === 'streaming' && state.translatedText && (
              <span className="animate-blink text-accent">▍</span>
            )}
          </p>
        )}

        {state.status === 'idle' && (
          <p className="text-sm text-[#555]">번역할 텍스트가 없습니다.</p>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between px-lg py-sm border-t border-border text-xs text-[#888] shrink-0">
        <span>→ 한국어</span>
        <div className="flex items-center gap-sm">
          {(state.status === 'complete' || state.status === 'streaming') && (
            <button
              onClick={handleCopy}
              className="px-sm py-xs rounded-sm hover:bg-bg-surface transition-colors"
            >
              {copied ? '✓ 복사됨' : '📋 복사'}
            </button>
          )}
          <button
            onClick={handleClose}
            className="px-sm py-xs rounded-sm hover:bg-bg-surface transition-colors"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
