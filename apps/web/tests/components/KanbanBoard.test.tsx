import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import zhCNMessages from '@/messages/zh-CN.json';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';

const projectState = {
  projects: [],
  currentProject: null,
  fetchProjects: vi.fn(),
  fetchProjectById: vi.fn().mockResolvedValue(null),
  setCurrentProject: vi.fn(),
};

const taskState = {
  tasks: [],
  fetchTasks: vi.fn(),
  createTask: vi.fn().mockResolvedValue(undefined),
};

const uiState = {
  locale: 'zh-CN',
  themeMode: 'system',
  setLocale: vi.fn(),
  setThemeMode: vi.fn(),
};

vi.mock('@/features/shared/store', () => ({
  useProjectStore: (selector: (state: typeof projectState) => any) => selector(projectState),
  useTaskStore: (selector: (state: typeof taskState) => any) => selector(taskState),
  useUIStore: (selector: (state: typeof uiState) => any) => selector(uiState),
}));

describe('KanbanBoard Component', () => {
  const renderWithIntl = (ui: ReactElement) =>
    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhCNMessages}>
        {ui}
      </NextIntlClientProvider>
    );

  it('renders kanban board container', () => {
    renderWithIntl(<KanbanBoard />);
    
    expect(screen.getByText('新建任务')).toBeInTheDocument();
  });

  it('applies correct padding styles', () => {
    const { container } = renderWithIntl(<KanbanBoard />);
    
    expect(container.querySelector('.p-4')).toBeTruthy();
  });

  it('renders without crashing', () => {
    expect(() => renderWithIntl(<KanbanBoard />)).not.toThrow();
  });

  it('renders consistent output', () => {
    const { container } = renderWithIntl(<KanbanBoard />);
    expect(container.firstChild).toBeInTheDocument();
  });
});
