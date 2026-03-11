import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listWorktreeFiles,
  previewWorktreeFile,
} from '@/features/agent-execution/lib/git-operations'

vi.mock('@/features/agent-execution/lib/api-config', () => ({
  resolveHttpUrl: (endpoint: string) => `http://localhost:3847${endpoint}`,
}))

describe('git-operations worktree api', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('lists files via worktree endpoint', async () => {
    const fetchMock = vi.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => [{ name: 'README.md', path: 'README.md', isDir: false }],
    } as Response)

    const result = await listWorktreeFiles('/tmp/worktree', '')
    expect(result[0]?.name).toBe('README.md')
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3847/api/worktree/files',
      expect.objectContaining({
        method: 'POST',
      })
    )
  })

  it('previews file via preview endpoint', async () => {
    vi.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: true,
      json: async () => ({
        path: 'README.md',
        content: 'hello',
        truncated: false,
        isBinary: false,
        size: 5,
        language: 'md',
      }),
    } as Response)

    const result = await previewWorktreeFile('/tmp/worktree', 'README.md', 1024)
    expect(result.content).toBe('hello')
    expect(result.language).toBe('md')
  })

  it('throws when server responds with non-2xx', async () => {
    vi.spyOn(global, 'fetch' as never).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    } as Response)

    await expect(listWorktreeFiles('/tmp/worktree', '')).rejects.toThrow('bad request')
  })
})
