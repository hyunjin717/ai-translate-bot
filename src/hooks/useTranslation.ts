import { useState, useEffect, useCallback } from 'react'

type TranslationState = {
  status: 'idle' | 'loading' | 'streaming' | 'complete' | 'error'
  sourceText: string
  translatedText: string
  error: string
  thinkingSkipped: boolean
}

export function useTranslation() {
  const [state, setState] = useState<TranslationState>({
    status: 'idle',
    sourceText: '',
    translatedText: '',
    error: '',
    thinkingSkipped: false
  })

  useEffect(() => {
    const unsubChunk = window.api.translate.onStreamChunk((chunk) => {
      setState((prev) => ({
        ...prev,
        status: 'streaming',
        translatedText: prev.translatedText + chunk
      }))
    })

    const unsubReset = window.api.translate.onStreamReset(() => {
      setState((prev) => ({ ...prev, status: 'streaming', translatedText: '' }))
    })

    const unsubComplete = window.api.translate.onComplete((fullText) => {
      setState((prev) => ({ ...prev, status: 'complete', translatedText: fullText }))
    })

    const unsubError = window.api.translate.onError((error) => {
      setState((prev) => ({ ...prev, status: 'error', error }))
    })

    const unsubThinkingSkipped = window.api.translate.onThinkingSkipped(() => {
      setState((prev) => ({ ...prev, thinkingSkipped: true }))
    })

    return () => {
      unsubChunk()
      unsubReset()
      unsubComplete()
      unsubError()
      unsubThinkingSkipped()
    }
  }, [])

  // Listen for new translation requests from main process
  useEffect(() => {
    const handler = (_: unknown, text: string) => {
      setState({ status: 'loading', sourceText: text, translatedText: '', error: '' })
    }

    // Main process sends source text before starting translation
    const unsubSource = window.api.translate.onStreamChunk(() => {})
    // We actually detect new translation by the loading→streaming transition
    return () => { unsubSource() }
  }, [])

  const reset = useCallback(() => {
    setState({ status: 'idle', sourceText: '', translatedText: '', error: '', thinkingSkipped: false })
  }, [])

  const setSourceText = useCallback((text: string) => {
    setState({ status: 'loading', sourceText: text, translatedText: '', error: '', thinkingSkipped: false })
  }, [])

  return { ...state, reset, setSourceText }
}
