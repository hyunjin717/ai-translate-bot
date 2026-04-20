import {
  app,
  BrowserWindow,
  globalShortcut,
  clipboard,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  dialog,
  screen
} from 'electron'
import { join } from 'path'
import { initDB, closeDB, listTranslations, searchTranslations, getTranslation } from './db'
import { translateText, translateImage, unloadModel } from './ollama-client'
import { getSettings, setShortcut, setTargetLang, getTargetLang, getModel, setModel, setThinking } from './settings'
import { checkOllamaStatus, startOllama, stopOllama, pullModel, openOllamaDownload, autoSetup } from './onboarding'

// 중복 실행 방지
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}

let popupWindow: BrowserWindow | null = null
let historyWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let onboardingWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

function createPopupWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 600,
    height: 150,
    minWidth: 300,
    minHeight: 100,
    maxWidth: 1000,
    maxHeight: 600,
    show: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: true,
    backgroundColor: '#1e1e1e',
    vibrancy: 'popover',
    visualEffectState: 'active',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/popup`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/popup' })
  }

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  console.log('[main] popup window created')
  return win
}

function createHistoryWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#252525',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/history`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/history' })
  }

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  console.log('[main] history window created')
  return win
}

function createSettingsWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 400,
    height: 620,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#252525',
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/settings`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/settings' })
  }

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  return win
}

function createOnboardingWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 500,
    show: false,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#252525',
    resizable: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/onboarding`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: '/onboarding' })
  }

  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  return win
}

function showPopupAtCursor(sourceText: string): void {
  if (!popupWindow || popupWindow.isDestroyed()) {
    console.log('[main] popup was destroyed, recreating...')
    popupWindow = createPopupWindow()
  }

  // 이미 보이는 상태면 기존 위치/크기를 유지하고 새 번역만 흘려보낸다.
  const reuseExisting = popupWindow.isVisible()

  if (!reuseExisting) {
    const cursor = screen.getCursorScreenPoint()
    const display = screen.getDisplayNearestPoint(cursor)
    const { bounds } = display

    let x = cursor.x - 200
    let y = cursor.y + 8

    if (x + 400 > bounds.x + bounds.width) x = bounds.x + bounds.width - 408
    if (x < bounds.x) x = bounds.x + 8
    if (y + 150 > bounds.y + bounds.height) y = cursor.y - 158

    popupWindow.setBounds({ x, y, width: 420, height: 150 })
  }

  popupWindow.show()
  popupWindow.focus()

  const { x: finalX, y: finalY } = popupWindow.getBounds()
  console.log(
    `[main] popup ${reuseExisting ? 'reused' : 'shown'} at (${finalX}, ${finalY}), text length: ${sourceText.length}`
  )
  if (sourceText) {
    translateText(popupWindow, sourceText, getTargetLang())
  }
}

function handleShortcutTrigger(): void {
  console.log('[main] shortcut triggered!')
  const targetLang = getTargetLang()

  // 클립보드에 이미지가 있는지 먼저 확인
  const image = clipboard.readImage()
  if (!image.isEmpty()) {
    console.log('[main] clipboard has image, using multimodal translation')
    const base64 = image.toPNG().toString('base64')
    showPopupAtCursor('')
    if (popupWindow && !popupWindow.isDestroyed()) {
      translateImage(popupWindow, base64, targetLang)
    }
    return
  }

  // 텍스트 확인
  const text = clipboard.readText().trim()
  if (!text) {
    showPopupAtCursor('')
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.webContents.send('translate:error', '클립보드가 비어있습니다. 텍스트나 이미지를 복사한 후 다시 시도해주세요.')
    }
    return
  }

  console.log(`[main] clipboard text: "${text.substring(0, 50)}..."`)
  showPopupAtCursor(text)
}

function registerShortcut(shortcut?: string): boolean {
  const previousKey = getSettings().shortcut
  const key = shortcut || previousKey

  try {
    globalShortcut.unregisterAll()
    const success = globalShortcut.register(key, handleShortcutTrigger)

    if (success) {
      console.log(`[main] shortcut ${key} registered successfully`)
      return true
    }
  } catch (err) {
    console.log(`[main] ERROR: shortcut ${key} threw: ${err}`)
  }

  console.log(`[main] shortcut ${key} failed, reverting to ${previousKey}`)

  // 실패 시 이전 단축키로 복원
  if (key !== previousKey) {
    try {
      globalShortcut.register(previousKey, handleShortcutTrigger)
    } catch {
      console.log(`[main] ERROR: could not restore previous shortcut either`)
    }
  }

  return false
}

function createTray(): void {
  // dev: __dirname = out/main, prod: __dirname = app.asar/out/main
  const base = app.isPackaged
    ? join(process.resourcesPath, 'resources')
    : join(__dirname, '../../resources')
  const icon = nativeImage.createFromPath(join(base, 'trayTemplate.png'))
  icon.setTemplateImage(true)
  tray = new Tray(icon)

  const menu = Menu.buildFromTemplate([
    { label: '번역 히스토리', click: () => historyWindow?.show() },
    { label: '설정', click: () => { settingsWindow?.show(); settingsWindow?.focus() } },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('AI Translate Bot')
  tray.setContextMenu(menu)
  console.log('[main] tray created')
}

function setupIPC(): void {
  ipcMain.handle('translate:request', async (event, { text, targetLang }) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) await translateText(win, text, targetLang)
  })

  ipcMain.handle('history:list', (_, limit) => listTranslations(limit))
  ipcMain.handle('history:search', (_, query) => searchTranslations(query))
  ipcMain.handle('history:get', (_, id) => getTranslation(id))

  ipcMain.handle('onboarding:check', () => checkOllamaStatus())
  ipcMain.handle('onboarding:start-ollama', () => startOllama())
  ipcMain.handle('onboarding:pull-model', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? pullModel(win) : false
  })
  ipcMain.handle('onboarding:auto-setup', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win ? autoSetup(win) : false
  })
  ipcMain.on('onboarding:open-download', () => openOllamaDownload())
  ipcMain.on('onboarding:finish', () => {
    // 온보딩에서 pull한 모델(gemma4:e4b)로 설정 확정
    setModel('gemma4:e4b')
    onboardingWindow?.hide()
  })

  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('settings:set-shortcut', (_, shortcut: string) => {
    const success = registerShortcut(shortcut)
    if (success) {
      setShortcut(shortcut)
    }
    // 성공 시 새 설정, 실패 시 이전 설정이 반환됨
    return getSettings()
  })
  ipcMain.handle('settings:set-target-lang', (_, lang: string) => {
    setTargetLang(lang)
    return getSettings()
  })
  ipcMain.handle('settings:set-model', async (_, model: string) => {
    const previousModel = getModel()
    setModel(model)
    if (previousModel !== model) {
      await unloadModel(previousModel)
    }
    return getSettings()
  })
  ipcMain.handle('settings:set-thinking', (_, thinking: boolean) => {
    setThinking(thinking)
    return getSettings()
  })
  ipcMain.handle('settings:list-models', async () => {
    try {
      const res = await fetch('http://localhost:11434/api/tags')
      if (!res.ok) return []
      const data = await res.json() as { models?: { name: string }[] }
      return (data.models || []).map((m) => m.name)
    } catch {
      return []
    }
  })

  ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.hide()
  })

  ipcMain.on('window:resize', (event, width: number, height: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const [currentW] = win.getSize()
    const clampedH = Math.min(Math.max(height, 100), 600)
    win.setSize(currentW, clampedH, true)
  })
}

app.whenReady().then(() => {
  console.log('[main] app ready')

  // 개발 모드에서도 커스텀 Dock 아이콘 표시
  if (process.platform === 'darwin') {
    const iconBase = app.isPackaged
      ? join(process.resourcesPath, 'resources')
      : join(__dirname, '../../resources')
    const dockIcon = nativeImage.createFromPath(join(iconBase, 'icon.png'))
    if (!dockIcon.isEmpty()) {
      app.dock.setIcon(dockIcon)
    }
  }

  initDB()
  console.log('[main] db initialized')

  setupIPC()

  popupWindow = createPopupWindow()
  historyWindow = createHistoryWindow()
  settingsWindow = createSettingsWindow()
  onboardingWindow = createOnboardingWindow()

  registerShortcut()
  createTray()

  // 앱 시작 시 Ollama 자동 시작 + 온보딩 체크
  async function bootstrap() {
    let status = await checkOllamaStatus()

    // Ollama가 설치되어 있지만 실행 안 됨 → 자동 시작
    if (status.installed && !status.running) {
      console.log('[main] starting ollama automatically...')
      await startOllama()
      status = await checkOllamaStatus()
    }

    if (!status.modelReady) {
      console.log('[main] onboarding needed:', status)
      onboardingWindow?.show()
    } else {
      console.log('[main] all systems go. Press Cmd+Option+T to translate.')
    }
  }
  bootstrap()
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  closeDB()
  stopOllama()
})

app.on('window-all-closed', () => {
  // Do nothing - keep app running in tray
})
