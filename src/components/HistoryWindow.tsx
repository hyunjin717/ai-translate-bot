import { useState, useEffect, useCallback } from 'react'

export function HistoryWindow() {
  const [records, setRecords] = useState<TranslationRecord[]>([])
  const [selected, setSelected] = useState<TranslationRecord | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailTab, setDetailTab] = useState<'source' | 'translated'>('translated')

  const loadHistory = useCallback(async () => {
    setLoading(true)
    const data = searchQuery
      ? await window.api.history.search(searchQuery)
      : await window.api.history.list()
    setRecords(data)
    setLoading(false)
  }, [searchQuery])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  // Reload when window gains focus
  useEffect(() => {
    const handler = () => loadHistory()
    window.addEventListener('focus', handler)
    return () => window.removeEventListener('focus', handler)
  }, [loadHistory])

  const formatTime = (ts: number) => {
    const d = new Date(ts)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${hours}:${mins}`
  }

  return (
    <div className="flex h-screen bg-bg-window text-white">
      {/* Left panel: list */}
      <div className="w-[240px] flex flex-col border-r border-border bg-bg-window">
        {/* Drag region for titlebar */}
        <div className="h-[38px]" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {/* Search */}
        <div className="px-md pb-sm">
          <input
            type="text"
            placeholder="검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-sm py-xs text-sm bg-bg-surface border border-border rounded-sm text-white placeholder-[#555] outline-none focus:border-accent"
          />
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-md py-lg text-sm text-[#555] animate-pulse-fade">
              불러오는 중...
            </div>
          )}

          {!loading && records.length === 0 && (
            <div className="px-md py-xl text-center">
              <p className="text-2xl mb-sm">📝</p>
              <p className="text-sm text-[#888]">
                {searchQuery
                  ? '검색 결과가 없습니다.'
                  : '아직 번역 기록이 없습니다.'}
              </p>
              {!searchQuery && (
                <p className="text-xs text-[#555] mt-xs">
                  Cmd+C 후 Cmd+Option+T로{'\n'}첫 번역을 시작해보세요!
                </p>
              )}
            </div>
          )}

          {records.map((r) => (
            <button
              key={r.id}
              onClick={() => { setSelected(r); setDetailTab('translated') }}
              className={`w-full text-left px-md py-sm border-b border-border hover:bg-bg-surface transition-colors ${
                selected?.id === r.id ? 'bg-bg-surface' : ''
              }`}
            >
              <p className="text-sm text-white truncate">{r.source_image ? '🖼️ 이미지 번역' : r.source_text}</p>
              <p className="text-xs text-[#555] mt-2xs">
                {formatTime(r.timestamp)} · {r.target_lang}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel: detail */}
      <div className="flex-1 flex flex-col">
        <div className="h-[38px]" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-[#555]">왼쪽에서 항목을 선택하세요</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-border shrink-0 px-xl">
              <button
                onClick={() => setDetailTab('translated')}
                className={`px-md py-sm text-sm transition-colors ${
                  detailTab === 'translated'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-[#888] hover:text-white'
                }`}
              >
                번역
              </button>
              <button
                onClick={() => setDetailTab('source')}
                className={`px-md py-sm text-sm transition-colors ${
                  detailTab === 'source'
                    ? 'text-accent border-b-2 border-accent'
                    : 'text-[#888] hover:text-white'
                }`}
              >
                원문
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-xl py-lg">
              {detailTab === 'translated' ? (
                <p className="text-lg text-white font-semibold leading-relaxed whitespace-pre-wrap">
                  {selected.translated_text}
                </p>
              ) : selected.source_image ? (
                <div className="space-y-md">
                  <img
                    src={`data:image/png;base64,${selected.source_image}`}
                    alt="원본 이미지"
                    className="max-w-full rounded-sm"
                  />
                  {selected.source_text && selected.source_text !== '[이미지]' && (
                    <div className="border-t border-border pt-md">
                      <p className="text-xs text-[#555] mb-xs">추출된 텍스트</p>
                      <p className="text-base text-[#ccc] leading-relaxed whitespace-pre-wrap">
                        {selected.source_text}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-base text-[#ccc] leading-relaxed whitespace-pre-wrap">
                  {selected.source_text}
                </p>
              )}
            </div>

            {/* Meta */}
            <div className="px-xl py-sm border-t border-border text-2xs text-[#555] shrink-0">
              {formatTime(selected.timestamp)} · {selected.source_lang} → {selected.target_lang}
              {selected.model ? ` · ${selected.model}` : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
