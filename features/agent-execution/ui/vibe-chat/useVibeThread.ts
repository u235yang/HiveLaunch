'use client'

import { useState, useCallback, useRef } from 'react'
import type { PatchTypeWithKey } from '../../types'
import { useConversationHistory } from '../../hooks/useConversationHistory'
import { useOptionalEntriesContext } from '../../contexts/EntriesContext'

interface UseVibeThreadResult {
  entries: PatchTypeWithKey[]
  isLoading: boolean
  isRunning: boolean
}

/**
 * Hook to get conversation entries for VibeThread component
 */
export function useVibeThread(sessionId: string): UseVibeThreadResult {
  console.log('[useVibeThread] Called with sessionId:', sessionId)

  const [fallbackEntries, setFallbackEntries] = useState<PatchTypeWithKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const entriesContext = useOptionalEntriesContext()
  const lastFallbackSignatureRef = useRef('')

  const buildSignature = useCallback((items: PatchTypeWithKey[]): string => {
    return items.map((item) => item.patchKey).join('|')
  }, [])

  const handleEntriesUpdated = useCallback(
    (newEntries: PatchTypeWithKey[], _addType: string, loading: boolean) => {
      const nextSignature = buildSignature(newEntries)
      if (lastFallbackSignatureRef.current !== nextSignature) {
        lastFallbackSignatureRef.current = nextSignature
        setFallbackEntries(newEntries)
      }
      setIsLoading((prev) => (prev === loading ? prev : loading))
    },
    [buildSignature]
  )

  const { hasRunningProcess } = useConversationHistory({
    sessionId,
    onEntriesUpdated: handleEntriesUpdated,
  })

  return {
    entries:
      entriesContext && entriesContext.entries.length > 0
        ? entriesContext.entries
        : fallbackEntries,
    isLoading,
    isRunning: hasRunningProcess,
  }
}
