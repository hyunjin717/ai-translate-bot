import { useState, useEffect, useCallback } from 'react'

type SetupStep = 'idle' | 'checking' | 'installing' | 'starting' | 'pulling' | 'ready' | 'error'

const STEP_LABELS: Record<SetupStep, string> = {
  idle: '',
  checking: '환경 확인 중',
  installing: 'Ollama 설치 중',
  starting: 'Ollama 서버 시작 중',
  pulling: '번역 모델 다운로드 중',
  ready: '준비 완료',
  error: '오류 발생'
}

const STEP_ORDER: SetupStep[] = ['checking', 'installing', 'starting', 'pulling', 'ready']

function StepIndicator({ currentStep }: { currentStep: SetupStep }) {
  if (currentStep === 'idle' || currentStep === 'error') return null

  const currentIdx = STEP_ORDER.indexOf(currentStep)

  return (
    <div className="flex items-center gap-xs w-full max-w-[280px]">
      {STEP_ORDER.slice(0, -1).map((step, i) => {
        const isCompleted = currentIdx > i
        const isActive = currentIdx === i

        return (
          <div key={step} className="flex-1 flex flex-col items-center gap-xs">
            <div
              className={`h-[3px] w-full rounded-full transition-colors duration-300 ${
                isCompleted
                  ? 'bg-semantic-success'
                  : isActive
                    ? 'bg-accent animate-pulse-fade'
                    : 'bg-bg-surface'
              }`}
            />
          </div>
        )
      })}
    </div>
  )
}

export function OnboardingWindow() {
  const [step, setStep] = useState<SetupStep>('idle')
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubProgress = window.api.onboarding.onProgress((msg: string) => {
      setProgress(msg)
    })
    const unsubStep = window.api.onboarding.onStep((s: string) => {
      setStep(s as SetupStep)
    })
    return () => { unsubProgress(); unsubStep() }
  }, [])

  // 처음 열릴 때 이미 준비 완료 상태인지 확인
  useEffect(() => {
    window.api.onboarding.check().then((status) => {
      if (status.modelReady) {
        setStep('ready')
      }
    })
  }, [])

  const handleAutoSetup = useCallback(async () => {
    setStep('checking')
    setProgress('환경 확인 중...')
    setError('')

    const ok = await window.api.onboarding.autoSetup()
    if (!ok && step !== 'ready') {
      setError(progress || '설정 중 오류가 발생했습니다.')
      setStep('error')
    }
  }, [])

  const handleFinish = () => {
    window.api.onboarding.finish()
  }

  const isRunning = ['checking', 'installing', 'starting', 'pulling'].includes(step)

  return (
    <div className="h-screen bg-bg-window text-white flex flex-col">
      <div
        className="h-[38px] shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      />

      <div className="flex-1 flex flex-col items-center justify-center px-2xl text-center gap-xl">
        <h1 className="text-2xl font-semibold">AI Translate Bot</h1>

        {step === 'idle' && (
          <div className="space-y-lg">
            <p className="text-sm text-[#888]">
              로컬 AI 번역을 위한 초기 설정이 필요합니다.<br />
              Ollama 설치부터 모델 다운로드까지<br />
              버튼 하나로 자동 진행됩니다.
            </p>
            <button
              onClick={handleAutoSetup}
              className="px-xl py-md rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              원클릭 설정 시작
            </button>
            <button
              onClick={() => window.api.onboarding.openDownload()}
              className="block mx-auto text-2xs text-[#555] hover:text-[#888] transition-colors"
            >
              Ollama를 직접 설치하고 싶다면 →
            </button>
          </div>
        )}

        {isRunning && (
          <div className="space-y-lg w-full flex flex-col items-center">
            <StepIndicator currentStep={step} />
            <p className="text-sm text-[#ccc] font-medium">{STEP_LABELS[step]}</p>
            <p className="text-xs text-[#888] animate-pulse-fade min-h-[16px]">{progress}</p>
            {step === 'pulling' && (
              <p className="text-2xs text-[#555]">모델 크기: ~9.6GB · 다운로드 중 앱을 닫지 마세요</p>
            )}
          </div>
        )}

        {step === 'ready' && (
          <div className="space-y-lg">
            <p className="text-lg text-semantic-success">✓ 준비 완료</p>
            <p className="text-sm text-[#888]">
              텍스트를 복사(⌘C)한 후<br />
              ⌘ ⌥ T를 누르면 번역됩니다.
            </p>
            <button
              onClick={handleFinish}
              className="px-xl py-md rounded-md bg-accent text-white text-sm hover:bg-accent-hover transition-colors"
            >
              시작하기
            </button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-lg">
            <p className="text-sm text-semantic-error">{error}</p>
            <div className="flex gap-sm justify-center">
              <button
                onClick={handleAutoSetup}
                className="px-xl py-md rounded-md bg-accent text-white text-sm hover:bg-accent-hover transition-colors"
              >
                다시 시도
              </button>
              <button
                onClick={() => window.api.onboarding.openDownload()}
                className="px-xl py-md rounded-md bg-bg-surface text-[#888] text-sm hover:text-white transition-colors"
              >
                수동 설치
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="px-xl py-md text-2xs text-[#555] text-center">
        v0.1.0 · Powered by Gemma 4 E4B + Ollama
      </div>
    </div>
  )
}
