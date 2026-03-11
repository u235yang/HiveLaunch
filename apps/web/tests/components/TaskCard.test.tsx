import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import zhCNMessages from '@/messages/zh-CN.json';
import { TaskCard, type Task } from '@/components/kanban/TaskCard';

describe('TaskCard Component', () => {
  const mockTask: Task = {
    id: 'task-1',
    projectId: 'project-1',
    title: 'Task Card',
    description: 'Task description',
    status: 'todo',
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  };

  const renderWithIntl = (ui: ReactElement) =>
    render(
      <NextIntlClientProvider locale="zh-CN" messages={zhCNMessages}>
        {ui}
      </NextIntlClientProvider>
    );

  it('renders task card', () => {
    renderWithIntl(<TaskCard task={mockTask} />);
    
    expect(screen.getByText('Task Card')).toBeInTheDocument();
  });

  it('renders without crashing', () => {
    expect(() => renderWithIntl(<TaskCard task={mockTask} />)).not.toThrow();
  });

  it('renders consistent output', () => {
    const { container } = renderWithIntl(<TaskCard task={mockTask} />);
    expect(container.textContent).toContain('Task Card');
  });
});
