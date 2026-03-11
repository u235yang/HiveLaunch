'use client'

import { ExecutionProcessesProvider } from '@/features/agent-execution/contexts/ExecutionProcessesContext'
import { EntriesProvider } from '@/features/agent-execution/contexts/EntriesContext'
import { VibeThread } from '@/features/agent-execution/ui/vibe-chat/VibeThread'
import { useVibeThread } from '@/features/agent-execution/ui/vibe-chat/useVibeThread'
import { useUIStore } from '@/features/shared/store'

/**
 * Inner component that uses conversation history inside provider.
 */
function ConversationEntries({ sessionId }: { sessionId: string }) {
    const { entries, isLoading, isRunning } = useVibeThread(sessionId)
    const locale = useUIStore((state) => state.locale)
    const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)

    return (
        <VibeThread
            entries={entries}
            isLoading={isLoading}
            isRunning={isRunning}
            emptyMessage={txt('发送消息开始执行', 'Send a message to start execution')}
        />
    )
}

/**
 * ConversationHistoryEntries - Wraps ExecutionProcessesProvider + EntriesProvider + VibeThread.
 */
export function ConversationHistoryEntries({ sessionId }: { sessionId: string | null }) {
    const locale = useUIStore((state) => state.locale)
    const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)

    if (!sessionId) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                    <p className="text-sm">{txt('发送消息开始执行', 'Send a message to start execution')}</p>
                    <p className="text-xs mt-1">{txt('将自动创建 Worktree 并启动 Agent', 'A worktree will be created automatically and the Agent will start')}</p>
                </div>
            </div>
        )
    }

    return (
        <EntriesProvider key={sessionId}>
            <ExecutionProcessesProvider key={sessionId} sessionId={sessionId}>
                <ConversationEntries sessionId={sessionId} />
            </ExecutionProcessesProvider>
        </EntriesProvider>
    )
}
