import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { GitPanel } from '@/features/agent-execution/ui/GitPanel'

vi.mock('@/features/shared/store', () => ({
  useUIStore: (selector: (state: { locale: string }) => unknown) => selector({ locale: 'zh-CN' }),
}))

vi.mock('@/features/agent-execution/ui/GitBranchStatusPanel', () => ({
  GitBranchStatusPanel: () => <div>branch-status</div>,
}))

vi.mock('@/features/agent-execution/ui/DiffsPanel', () => ({
  DiffsPanel: () => <div>changes-panel</div>,
}))

vi.mock('@/features/agent-execution/ui/WorktreeFilesPanel', () => ({
  WorktreeFilesPanel: ({
    selectedFile,
    onSelectedFileChange,
    onOpenFile,
    mode,
  }: {
    selectedFile?: string | null
    onSelectedFileChange?: (path: string | null) => void
    onOpenFile?: (path: string) => void
    mode?: 'split' | 'navigation'
  }) => (
    <div>
      <div>files-panel</div>
      <div data-testid="files-mode">{mode ?? 'split'}</div>
      <div data-testid="selected-file">{selectedFile ?? 'none'}</div>
      <button
        type="button"
        onClick={() => {
          onSelectedFileChange?.('src/index.ts')
          onOpenFile?.('src/index.ts')
        }}
      >
        select-file
      </button>
      <LocalFilesState />
    </div>
  ),
}))

function LocalFilesState() {
  const [localSearch, setLocalSearch] = useState('')
  return (
    <button type="button" onClick={() => setLocalSearch('abc')} data-testid="local-search">
      {localSearch || 'empty'}
    </button>
  )
}

vi.mock('@/features/agent-execution/ui/GitActionsPanel', () => ({
  GitActionsPanel: () => <div>actions-panel</div>,
}))

describe('GitPanel', () => {
  it('renders files tab and switches content', async () => {
    const onOpenFilePreview = vi.fn()
    render(
      <GitPanel
        worktreePath="/tmp/worktree"
        targetBranch="main"
        branchName="feature/test"
        onOpenFilePreview={onOpenFilePreview}
      />
    )

    expect(screen.getByText('changes-panel')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '文件' }))
    expect(screen.getByText('files-panel')).toBeInTheDocument()
    expect(screen.getByTestId('files-mode')).toHaveTextContent('navigation')
    await userEvent.click(screen.getByRole('button', { name: 'select-file' }))
    await userEvent.click(screen.getByTestId('local-search'))
    expect(onOpenFilePreview).toHaveBeenCalledWith('src/index.ts')
    expect(screen.getByTestId('selected-file')).toHaveTextContent('src/index.ts')
    expect(screen.getByTestId('local-search')).toHaveTextContent('abc')
    await userEvent.click(screen.getByRole('button', { name: '操作' }))
    expect(screen.getByText('actions-panel')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '文件' }))
    expect(screen.getByTestId('selected-file')).toHaveTextContent('src/index.ts')
    expect(screen.getByTestId('local-search')).toHaveTextContent('abc')
  })

  it('shows empty state when worktree path is missing', () => {
    render(
      <GitPanel
        worktreePath=""
        targetBranch="main"
        branchName="feature/test"
      />
    )

    expect(screen.getByText('暂无工作区')).toBeInTheDocument()
  })
})
