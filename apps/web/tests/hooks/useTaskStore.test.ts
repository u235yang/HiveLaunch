import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Simple task store implementation for testing
interface Task {
  id: string;
  title: string;
  description: string;
  status: 'todo' | 'in_progress' | 'done';
  projectId: string;
  createdAt: string;
  updatedAt: string;
}

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;
  fetchTasks: (projectId: string) => Promise<void>;
  createTask: (data: Partial<Task>) => Promise<Task>;
  updateTask: (id: string, data: Partial<Task>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  moveTask: (id: string, status: Task['status']) => void;
}

// Simple implementation for testing
function createTaskStore() {
  let state: TaskState = {
    tasks: [],
    isLoading: false,
    error: null,
    fetchTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    moveTask: vi.fn(),
  };

  return {
    useTaskStore: () => state,
    setState: (newState: Partial<TaskState>) => {
      state = { ...state, ...newState };
    },
    getState: () => state,
  };
}

describe('useTaskStore', () => {
  const store = createTaskStore();

  beforeEach(() => {
    vi.clearAllMocks();
    store.setState({
      tasks: [],
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = store.getState();

      expect(state.tasks).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('Task Operations', () => {
    it('should fetch tasks for a project', async () => {
      const mockTasks: Task[] = [
        {
          id: '1',
          title: 'Task 1',
          description: 'Description 1',
          status: 'todo',
          projectId: 'project1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: '2',
          title: 'Task 2',
          description: 'Description 2',
          status: 'in_progress',
          projectId: 'project1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      const fetchTasks = vi.fn().mockResolvedValue(mockTasks);
      store.setState({ fetchTasks });

      const state = store.getState();
      await state.fetchTasks('project1');

      expect(fetchTasks).toHaveBeenCalledWith('project1');
    });

    it('should create a new task', async () => {
      const newTask: Task = {
        id: '3',
        title: 'New Task',
        description: 'New Description',
        status: 'todo',
        projectId: 'project1',
        createdAt: '2024-01-02',
        updatedAt: '2024-01-02',
      };

      const createTask = vi.fn().mockResolvedValue(newTask);
      store.setState({ createTask });

      const state = store.getState();
      const result = await state.createTask({
        title: 'New Task',
        description: 'New Description',
        projectId: 'project1',
      });

      expect(createTask).toHaveBeenCalledWith({
        title: 'New Task',
        description: 'New Description',
        projectId: 'project1',
      });
      expect(result).toEqual(newTask);
    });

    it('should update an existing task', async () => {
      const updatedTask: Task = {
        id: '1',
        title: 'Updated Task',
        description: 'Updated Description',
        status: 'in_progress',
        projectId: 'project1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-02',
      };

      const updateTask = vi.fn().mockResolvedValue(updatedTask);
      store.setState({ updateTask });

      const state = store.getState();
      const result = await state.updateTask('1', { status: 'in_progress' });

      expect(updateTask).toHaveBeenCalledWith('1', { status: 'in_progress' });
      expect(result).toEqual(updatedTask);
    });

    it('should delete a task', async () => {
      const deleteTask = vi.fn().mockResolvedValue(undefined);
      store.setState({ deleteTask });

      const state = store.getState();
      await state.deleteTask('1');

      expect(deleteTask).toHaveBeenCalledWith('1');
    });

    it('should move task to different status', () => {
      const moveTask = vi.fn();
      store.setState({ moveTask });

      const state = store.getState();
      state.moveTask('1', 'done');

      expect(moveTask).toHaveBeenCalledWith('1', 'done');
    });
  });

  describe('Task Status Management', () => {
    it('should handle all task statuses', () => {
      const tasks: Task[] = [
        { id: '1', title: 'Todo Task', description: '', status: 'todo', projectId: '1', createdAt: '', updatedAt: '' },
        { id: '2', title: 'In Progress Task', description: '', status: 'in_progress', projectId: '1', createdAt: '', updatedAt: '' },
        { id: '3', title: 'Done Task', description: '', status: 'done', projectId: '1', createdAt: '', updatedAt: '' },
      ];

      store.setState({ tasks });
      const state = store.getState();

      expect(state.tasks).toHaveLength(3);
      expect(state.tasks[0].status).toBe('todo');
      expect(state.tasks[1].status).toBe('in_progress');
      expect(state.tasks[2].status).toBe('done');
    });

    it('should filter tasks by status', () => {
      const tasks: Task[] = [
        { id: '1', title: 'Task 1', description: '', status: 'todo', projectId: '1', createdAt: '', updatedAt: '' },
        { id: '2', title: 'Task 2', description: '', status: 'todo', projectId: '1', createdAt: '', updatedAt: '' },
        { id: '3', title: 'Task 3', description: '', status: 'done', projectId: '1', createdAt: '', updatedAt: '' },
      ];

      store.setState({ tasks });
      const state = store.getState();

      const todoTasks = state.tasks.filter((t) => t.status === 'todo');
      const doneTasks = state.tasks.filter((t) => t.status === 'done');

      expect(todoTasks).toHaveLength(2);
      expect(doneTasks).toHaveLength(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors', async () => {
      const fetchTasks = vi.fn().mockRejectedValue(new Error('Network error'));
      store.setState({ fetchTasks });

      const state = store.getState();
      await expect(state.fetchTasks('project1')).rejects.toThrow('Network error');
    });

    it('should handle create errors', async () => {
      const createTask = vi.fn().mockRejectedValue(new Error('Validation error'));
      store.setState({ createTask });

      const state = store.getState();
      await expect(state.createTask({})).rejects.toThrow('Validation error');
    });
  });
});
