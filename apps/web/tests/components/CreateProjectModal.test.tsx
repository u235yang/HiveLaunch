import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateProjectModal from '@/features/kanban/ui/CreateProjectModalSimple';

describe('CreateProjectModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnCreate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    render(
      <CreateProjectModal
        isOpen={false}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );
    
    expect(screen.queryByText('创建新项目')).not.toBeInTheDocument();
  });

  it('renders when isOpen is true', () => {
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );
    
    expect(screen.getByText('创建新项目')).toBeInTheDocument();
  });

  it('renders all form fields', () => {
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );
    
    expect(screen.getByPlaceholderText('请输入项目名称')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('关于该项目的简要说明...')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://github.com/user/repo.git')).toBeInTheDocument();
    expect(screen.getByText('选择一个蜂群')).toBeInTheDocument();
  });

  it('calls onClose when cancel button is clicked', () => {
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );
    
    const cancelButton = screen.getByText('取消');
    fireEvent.click(cancelButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onCreate with form data when create button is clicked', async () => {
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );
    
    // Fill in required fields
    const nameInput = screen.getByPlaceholderText('请输入项目名称');
    fireEvent.change(nameInput, { target: { value: 'Test Project' } });
    
    const repoInput = screen.getByPlaceholderText('https://github.com/user/repo.git');
    fireEvent.change(repoInput, { target: { value: 'https://github.com/test/repo.git' } });
    
    // Select swarm
    const agentSelect = screen.getByRole('combobox');
    fireEvent.change(agentSelect, { target: { value: 'react-dev' } });
    
    // Submit form
    const createButton = screen.getByText('创建项目');
    fireEvent.click(createButton);
    
    await waitFor(() => {
      expect(mockOnCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Project',
          repoPath: 'https://github.com/test/repo.git',
          defaultAgent: 'react-dev',
        })
      );
    });
  });

  it('closes modal when clicking close button in header', () => {
    render(
      <CreateProjectModal
        isOpen={true}
        onClose={mockOnClose}
        onCreate={mockOnCreate}
      />
    );
    
    const closeButton = screen.getByLabelText('关闭');
    fireEvent.click(closeButton);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
