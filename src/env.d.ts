/// <reference types="vite/client" />

interface TranslationRecord {
  id: number
  source_text: string
  translated_text: string
  source_lang: string
  target_lang: string
  model: string
  source_image: string | null
  timestamp: number
}

interface Window {
  api: {
    translate: {
      request: (req: { text: string; targetLang: string }) => Promise<void>
      onSource: (cb: (text: string) => void) => () => void
      onStreamChunk: (cb: (chunk: string) => void) => () => void
      onStreamReset: (cb: () => void) => () => void
      onThinkingSkipped: (cb: () => void) => () => void
      onComplete: (cb: (fullText: string) => void) => () => void
      onError: (cb: (error: string) => void) => () => void
      onImageStart: (cb: () => void) => () => void
      onSourceChunk: (cb: (chunk: string) => void) => () => void
      onSourceComplete: (cb: () => void) => () => void
    }
    history: {
      list: (limit?: number) => Promise<TranslationRecord[]>
      search: (query: string) => Promise<TranslationRecord[]>
      get: (id: number) => Promise<TranslationRecord | undefined>
    }
    onboarding: {
      check: () => Promise<{ installed: boolean; running: boolean; modelReady: boolean }>
      startOllama: () => Promise<boolean>
      pullModel: () => Promise<boolean>
      openDownload: () => void
      finish: () => void
      onProgress: (cb: (msg: string) => void) => () => void
    }
    settings: {
      get: () => Promise<{ shortcut: string; targetLang: string; model: string; thinking: boolean }>
      setShortcut: (shortcut: string) => Promise<{ shortcut: string; targetLang: string; model: string; thinking: boolean }>
      setTargetLang: (lang: string) => Promise<{ shortcut: string; targetLang: string; model: string; thinking: boolean }>
      setModel: (model: string) => Promise<{ shortcut: string; targetLang: string; model: string; thinking: boolean }>
      setThinking: (thinking: boolean) => Promise<{ shortcut: string; targetLang: string; model: string; thinking: boolean }>
      listModels: () => Promise<string[]>
    }
    window: {
      close: () => void
      resize: (width: number, height: number) => void
      setMode: (mode: 'popup' | 'history') => void
    }
  }
}
