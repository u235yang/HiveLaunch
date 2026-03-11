'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
} from '@lexical/react/LexicalTypeaheadMenuPlugin'
import { $createTextNode } from 'lexical'
import { Command as CommandIcon } from 'lucide-react'
import type { BaseCodingAgent, SlashCommandDescription } from '@shared/types'
import { useExecutorDiscovery } from '@/features/agent-execution/hooks/useExecutorDiscovery'
import { useUIStore } from '@/features/shared/store'
import { useTypeaheadOpen } from '../context/typeahead-open-context'
import { TypeaheadMenu } from './typeahead-menu-components'

class SlashCommandOption extends MenuOption {
  command: SlashCommandDescription

  constructor(command: SlashCommandDescription) {
    super(`slash-command-${command.name}`)
    this.command = command
  }
}

function filterSlashCommands(
  all: SlashCommandDescription[],
  query: string
): SlashCommandDescription[] {
  const q = query.trim().toLowerCase()
  if (!q) return all

  const startsWith = all.filter((c) => c.name.toLowerCase().startsWith(q))
  const includes = all.filter(
    (c) => !startsWith.includes(c) && c.name.toLowerCase().includes(q)
  )
  return [...startsWith, ...includes]
}

export function SlashCommandTypeaheadPlugin({
  agent,
  workspaceId,
}: {
  agent: string | null  // 🔹 修改：支持任意字符串类型
  workspaceId?: string
}) {
  const locale = useUIStore((state) => state.locale)
  const txt = (zh: string, en: string) => (locale === 'en-US' ? en : zh)
  const [editor] = useLexicalComposerContext()
  const { setIsOpen } = useTypeaheadOpen()
  const [options, setOptions] = useState<SlashCommandOption[]>([])
  const [activeQuery, setActiveQuery] = useState<string | null>(null)

  const slashCommandsQuery = useExecutorDiscovery(agent, {
    workspaceId,
  })
  const allCommands = useMemo(
    () => slashCommandsQuery.commands ?? [],
    [slashCommandsQuery.commands]
  )
  const isLoading = !slashCommandsQuery.isInitialized && !!agent
  const isDiscovering = slashCommandsQuery.loadingSlashCommands

  const buildOptions = useCallback(
    (query: string | null): SlashCommandOption[] => {
      if (!agent || query === null) return []
      return filterSlashCommands(allCommands, query)
        .slice(0, 20)
        .map((c) => new SlashCommandOption(c))
    },
    [agent, allCommands]
  )

  const areSameOptions = (
    a: SlashCommandOption[],
    b: SlashCommandOption[]
  ): boolean => {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i += 1) {
      if (a[i]?.command.name !== b[i]?.command.name) return false
    }
    return true
  }

  const updateOptions = useCallback(
    (query: string | null) => {
      console.info('[slash-debug][typeahead] onQueryChange', {
        query,
        agent,
        workspaceId,
        commandsCount: allCommands.length,
      })
      setActiveQuery((prev) => (prev === query ? prev : query))
      const nextOptions = buildOptions(query)
      setOptions((prev) => (areSameOptions(prev, nextOptions) ? prev : nextOptions))
    },
    [agent, workspaceId, allCommands.length, buildOptions]
  )

  const hasVisibleResults = useMemo(() => {
    if (!agent || activeQuery === null) return false
    if (isLoading || isDiscovering) return true
    if (!activeQuery.trim()) return true
    return options.length > 0
  }, [agent, activeQuery, isDiscovering, isLoading, options.length])

  // If command list loads while menu is open, refresh options.
  useEffect(() => {
    if (activeQuery === null) return
    const nextOptions = buildOptions(activeQuery)
    setOptions((prev) => (areSameOptions(prev, nextOptions) ? prev : nextOptions))
  }, [activeQuery, buildOptions])

  useEffect(() => {
    console.info('[slash-debug][typeahead] state', {
      agent,
      workspaceId,
      activeQuery,
      hasVisibleResults,
      isLoading,
      isDiscovering,
      allCommandsCount: allCommands.length,
      optionsCount: options.length,
      isConnected: slashCommandsQuery.isConnected,
      isInitialized: slashCommandsQuery.isInitialized,
      error: slashCommandsQuery.error,
    })
  }, [
    agent,
    workspaceId,
    activeQuery,
    hasVisibleResults,
    isLoading,
    isDiscovering,
    allCommands.length,
    options.length,
    slashCommandsQuery.isConnected,
    slashCommandsQuery.isInitialized,
    slashCommandsQuery.error,
  ])

  return (
    <LexicalTypeaheadMenuPlugin<SlashCommandOption>
      triggerFn={(text) => {
        const match = /^(\s*)\/([^\s/]*)$/.exec(text)
        if (!match) return null

        const slashOffset = match[1].length
        console.info('[slash-debug][typeahead] trigger matched', {
          text,
          matchingString: match[2],
          slashOffset,
        })
        return {
          leadOffset: slashOffset,
          matchingString: match[2],
          replaceableString: match[0].slice(slashOffset),
        }
      }}
      options={options}
      onQueryChange={updateOptions}
      onOpen={() => {
        console.info('[slash-debug][typeahead] menu open')
        setIsOpen(true)
      }}
      onClose={() => {
        console.info('[slash-debug][typeahead] menu close')
        setIsOpen(false)
      }}
      onSelectOption={(option, nodeToReplace, closeMenu) => {
        editor.update(() => {
          if (!nodeToReplace) return

          const textToInsert = `/${option.command.name}`
          const commandNode = $createTextNode(textToInsert)
          nodeToReplace.replace(commandNode)

          const spaceNode = $createTextNode(' ')
          commandNode.insertAfter(spaceNode)
          spaceNode.select(1, 1)
        })

        closeMenu()
      }}
      menuRenderFn={(
        anchorRef,
        { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }
      ) => {
        if (!anchorRef.current) return null
        if (!agent) return null
        if (!hasVisibleResults) return null

        const isEmpty =
          !isLoading && !isDiscovering && allCommands.length === 0
        const showLoadingRow = isLoading || isDiscovering
        const loadingText = isLoading
          ? txt('加载命令中...', 'Loading commands...')
          : txt('发现命令中...', 'Discovering commands...')

        return createPortal(
          <TypeaheadMenu anchorEl={anchorRef.current}>
            <TypeaheadMenu.Header>
              <CommandIcon className="h-3.5 w-3.5" />
              {txt('命令', 'Commands')}
            </TypeaheadMenu.Header>

            {isEmpty ? (
              <TypeaheadMenu.Empty>
                {txt('无可用命令', 'No commands available')}
              </TypeaheadMenu.Empty>
            ) : options.length === 0 && !showLoadingRow ? null : (
              <TypeaheadMenu.ScrollArea>
                {showLoadingRow && (
                  <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 select-none">
                    {loadingText}
                  </div>
                )}
                {options.map((option, index) => {
                  const details = option.command.description ?? null

                  return (
                    <TypeaheadMenu.Item
                      key={option.key}
                      isSelected={index === selectedIndex}
                      index={index}
                      setHighlightedIndex={setHighlightedIndex}
                      onClick={() => selectOptionAndCleanUp(option)}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <span className="font-mono">
                          /{option.command.name}
                        </span>
                      </div>
                      {details && (
                        <div className="text-xs mt-0.5 truncate text-gray-500 dark:text-gray-400">
                          {details}
                        </div>
                      )}
                    </TypeaheadMenu.Item>
                  )
                })}
              </TypeaheadMenu.ScrollArea>
            )}
          </TypeaheadMenu>,
          document.body
        )
      }}
    />
  )
}
