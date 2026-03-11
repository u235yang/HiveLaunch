'use client'

import {
  useMemo,
  forwardRef,
  useImperativeHandle,
  useRef,
  useEffect,
} from 'react'
import { LexicalComposer } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { TRANSFORMERS, CODE, type Transformer } from '@lexical/markdown'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { LinkNode } from '@lexical/link'
import { TableNode, TableRowNode, TableCellNode } from '@lexical/table'
import { TablePlugin } from '@lexical/react/LexicalTablePlugin'
import { type LexicalEditor } from 'lexical'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'

import { TypeaheadOpenProvider } from './context/typeahead-open-context'
import { SlashCommandTypeaheadPlugin } from './plugins/slash-command-typeahead-plugin'
import { KeyboardCommandsPlugin } from './plugins/keyboard-commands-plugin'
import { ReadOnlyLinkPlugin } from './plugins/read-only-link-plugin'
import { ToolbarPlugin } from './plugins/toolbar-plugin'
import { CodeBlockShortcutPlugin } from './plugins/code-block-shortcut-plugin'
import { PasteMarkdownPlugin } from './plugins/paste-markdown-plugin'
import { MarkdownSyncPlugin } from './plugins/markdown-sync-plugin'
import { CodeHighlightPlugin } from './plugins/code-highlight-plugin'
import { TABLE_TRANSFORMER } from './transformers/table-transformer'
import { CODE_HIGHLIGHT_CLASSES } from './lib/code-highlight-theme'
import type { WysiwygProps, WysiwygEditorRef } from './types'

/** Plugin to capture the Lexical editor instance into a ref */
function EditorRefPlugin({
  editorRef,
}: {
  editorRef: React.MutableRefObject<LexicalEditor | null>
}) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editorRef.current = editor
  }, [editor, editorRef])
  return null
}

const WysiwygEditor = forwardRef<WysiwygEditorRef, WysiwygProps>(
  function WysiwygEditor(
    {
      placeholder = '',
      value,
      onChange,
      onEditorStateChange,
      disabled = false,
      className,
      agent,
      workspaceId,
      onSend,
      sendShortcut = 'ModifierEnter',
      autoFocus = false,
    }: WysiwygProps,
    ref: React.ForwardedRef<WysiwygEditorRef>
  ) {
    // Ref to capture the Lexical editor instance for imperative methods
    const editorInstanceRef = useRef<LexicalEditor | null>(null)

    // Expose focus method via ref
    useImperativeHandle(ref, () => ({
      focus: () => {
        editorInstanceRef.current?.focus()
      },
    }))

    const initialConfig = useMemo(
      () => ({
        namespace: 'md-wysiwyg',
        onError: console.error,
        theme: {
          paragraph: 'mb-2 last:mb-0',
          heading: {
            h1: 'mt-4 mb-2 text-2xl font-semibold',
            h2: 'mt-3 mb-2 text-xl font-semibold',
            h3: 'mt-3 mb-2 text-lg font-semibold',
            h4: 'mt-2 mb-1 text-base font-medium',
            h5: 'mt-2 mb-1 text-sm font-medium',
            h6: 'mt-2 mb-1 text-xs font-medium uppercase tracking-wide',
          },
          quote:
            'my-3 border-l-4 border-gray-300 dark:border-gray-600 pl-4 text-gray-600 dark:text-gray-400',
          list: {
            ul: 'my-1 list-disc list-inside',
            ol: 'my-1 list-decimal list-inside',
            listitem: '',
            nested: {
              listitem: 'list-none pl-4',
            },
          },
          link: 'text-blue-600 dark:text-blue-400 underline underline-offset-2 cursor-pointer hover:text-blue-800 dark:hover:text-blue-300',
          text: {
            bold: 'font-semibold',
            italic: 'italic',
            underline: 'underline underline-offset-2',
            strikethrough: 'line-through',
            code: 'font-mono bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm',
          },
          code: 'block font-mono bg-gray-100 dark:bg-gray-800 rounded-md px-3 py-2 my-2 whitespace-pre overflow-x-auto text-sm',
          codeHighlight: CODE_HIGHLIGHT_CLASSES,
          table: 'border-collapse my-2 w-full text-sm',
          tableRow: '',
          tableCell: 'border border-gray-200 dark:border-gray-700 px-3 py-2 text-left align-top',
          tableCellHeader:
            'bg-gray-50 dark:bg-gray-900 font-semibold border border-gray-200 dark:border-gray-700 px-3 py-2 text-left align-top',
        },
        nodes: [
          HeadingNode,
          QuoteNode,
          ListNode,
          ListItemNode,
          CodeNode,
          CodeHighlightNode,
          LinkNode,
          TableNode,
          TableRowNode,
          TableCellNode,
        ],
      }),
      []
    )

    // Extended transformers with table and code block support
    const extendedTransformers: Transformer[] = useMemo(
      () => [
        TABLE_TRANSFORMER,
        CODE,
        ...TRANSFORMERS,
      ],
      []
    )

    // Memoized placeholder element
    const placeholderElement = useMemo(
      () => (
        <div
          className={`absolute top-0 left-0 text-base text-gray-400 dark:text-gray-500 pointer-events-none truncate ${className || ''}`}
        >
          {placeholder}
        </div>
      ),
      [placeholder, className]
    )

    return (
      <div className="wysiwyg text-base">
        <LexicalComposer initialConfig={initialConfig}>
          <EditorRefPlugin editorRef={editorInstanceRef} />
          <MarkdownSyncPlugin
            value={value}
            onChange={onChange}
            onEditorStateChange={onEditorStateChange}
            editable={!disabled}
            transformers={extendedTransformers}
          />
          {!disabled && <ToolbarPlugin />}
          <div className="relative">
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className={`outline-none min-h-[60px] ${className || ''}`}
                  aria-label={
                    disabled ? 'Markdown content' : 'Markdown editor'
                  }
                />
              }
              placeholder={placeholderElement}
              ErrorBoundary={LexicalErrorBoundary}
            />
          </div>

          <ListPlugin />
          <TablePlugin />
          <CodeHighlightPlugin />
          {/* Only include editing plugins when not in read-only mode */}
          {!disabled && (
            <>
              {autoFocus && <AutoFocusPlugin />}
              <HistoryPlugin />
              <MarkdownShortcutPlugin
                transformers={extendedTransformers}
              />
              <PasteMarkdownPlugin transformers={extendedTransformers} />
              <TypeaheadOpenProvider>
                {agent && (
                  <SlashCommandTypeaheadPlugin
                    agent={agent}
                    workspaceId={workspaceId}
                  />
                )}
                <KeyboardCommandsPlugin
                  onCmdEnter={onSend}
                  onChange={onChange}
                  transformers={extendedTransformers}
                  sendShortcut={sendShortcut}
                />
              </TypeaheadOpenProvider>
              <CodeBlockShortcutPlugin />
            </>
          )}
          {/* Link sanitization for read-only mode */}
          {disabled && <ReadOnlyLinkPlugin />}
        </LexicalComposer>
      </div>
    )
  }
)

export default WysiwygEditor
