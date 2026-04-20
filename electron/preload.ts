import { contextBridge, ipcRenderer } from 'electron'

export type TranslationRequest = {
  text: string
  targetLang: string
}

export type TranslationRecord = {
  id: number
  sourceText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  timestamp: number
}

const api = {
  translate: {
    request: (req: TranslationRequest) => ipcRenderer.invoke('translate:request', req),
    onSource: (cb: (text: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, text: string) => cb(text)
      ipcRenderer.on('translate:source', listener)
      return () => ipcRenderer.removeListener('translate:source', listener)
    },
    onStreamChunk: (cb: (chunk: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
      ipcRenderer.on('translate:stream-chunk', listener)
      return () => ipcRenderer.removeListener('translate:stream-chunk', listener)
    },
    onComplete: (cb: (fullText: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, text: string) => cb(text)
      ipcRenderer.on('translate:complete', listener)
      return () => ipcRenderer.removeListener('translate:complete', listener)
    },
    onError: (cb: (error: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, error: string) => cb(error)
      ipcRenderer.on('translate:error', listener)
      return () => ipcRenderer.removeListener('translate:error', listener)
    },
    onImageStart: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('translate:image-start', listener)
      return () => ipcRenderer.removeListener('translate:image-start', listener)
    },
    onRetry: (cb: (attempt: number) => void) => {
      const listener = (_: Electron.IpcRendererEvent, attempt: number) => cb(attempt)
      ipcRenderer.on('translate:retry', listener)
      return () => ipcRenderer.removeListener('translate:retry', listener)
    },
    onSourceChunk: (cb: (chunk: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, chunk: string) => cb(chunk)
      ipcRenderer.on('translate:source-chunk', listener)
      return () => ipcRenderer.removeListener('translate:source-chunk', listener)
    },
    onSourceComplete: (cb: () => void) => {
      const listener = () => cb()
      ipcRenderer.on('translate:source-complete', listener)
      return () => ipcRenderer.removeListener('translate:source-complete', listener)
    }
  },
  history: {
    list: (limit?: number) => ipcRenderer.invoke('history:list', limit),
    search: (query: string) => ipcRenderer.invoke('history:search', query),
    get: (id: number) => ipcRenderer.invoke('history:get', id)
  },
  onboarding: {
    check: () => ipcRenderer.invoke('onboarding:check'),
    startOllama: () => ipcRenderer.invoke('onboarding:start-ollama'),
    pullModel: () => ipcRenderer.invoke('onboarding:pull-model'),
    autoSetup: () => ipcRenderer.invoke('onboarding:auto-setup'),
    openDownload: () => ipcRenderer.send('onboarding:open-download'),
    finish: () => ipcRenderer.send('onboarding:finish'),
    onProgress: (cb: (msg: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, msg: string) => cb(msg)
      ipcRenderer.on('onboarding:progress', listener)
      return () => ipcRenderer.removeListener('onboarding:progress', listener)
    },
    onStep: (cb: (step: string) => void) => {
      const listener = (_: Electron.IpcRendererEvent, step: string) => cb(step)
      ipcRenderer.on('onboarding:step', listener)
      return () => ipcRenderer.removeListener('onboarding:step', listener)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    setShortcut: (shortcut: string) => ipcRenderer.invoke('settings:set-shortcut', shortcut),
    setTargetLang: (lang: string) => ipcRenderer.invoke('settings:set-target-lang', lang),
    setModel: (model: string) => ipcRenderer.invoke('settings:set-model', model),
    setThinking: (thinking: boolean) => ipcRenderer.invoke('settings:set-thinking', thinking),
    listModels: () => ipcRenderer.invoke('settings:list-models') as Promise<string[]>
  },
  window: {
    close: () => ipcRenderer.send('window:close'),
    resize: (width: number, height: number) => ipcRenderer.send('window:resize', width, height),
    setMode: (mode: 'popup' | 'history') => ipcRenderer.send('window:set-mode', mode)
  }
}

contextBridge.exposeInMainWorld('api', api)

export type ElectronAPI = typeof api
