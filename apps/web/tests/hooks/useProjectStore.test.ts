import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useProjectStore, projectSelectors, type Project, type CreateProjectInput } from '@/features/shared/store/projectStore';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

const baseProject: Project = {
  id: '1',
  name: 'Test Project',
  description: 'Test',
  repoPath: 'https://github.com/example/repo.git',
  targetBranch: 'main',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
};

const buildProject = (overrides: Partial<Project> = {}): Project => ({
  ...baseProject,
  ...overrides,
});

describe('useProjectStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store state
    const { result } = renderHook(() => useProjectStore());
    act(() => {
      result.current.projects = [];
      result.current.currentProject = null;
      result.current.isLoading = false;
      result.current.error = null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const { result } = renderHook(() => useProjectStore());

      expect(result.current.projects).toEqual([]);
      expect(result.current.currentProject).toBeNull();
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('Selectors', () => {
    it('should select all projects', () => {
      const { result } = renderHook(() => useProjectStore());
      const mockProjects: Project[] = [
        buildProject(),
      ];

      act(() => {
        result.current.projects = mockProjects;
      });

      expect(projectSelectors.selectProjects(result.current)).toEqual(mockProjects);
    });

    it('should select current project', () => {
      const { result } = renderHook(() => useProjectStore());
      const mockProject: Project = buildProject();

      act(() => {
        result.current.currentProject = mockProject;
      });

      expect(projectSelectors.selectCurrentProject(result.current)).toEqual(mockProject);
    });

    it('should select project by id', () => {
      const { result } = renderHook(() => useProjectStore());
      const mockProjects: Project[] = [
        buildProject({ id: '1', name: 'Project 1' }),
        buildProject({ id: '2', name: 'Project 2' }),
      ];

      act(() => {
        result.current.projects = mockProjects;
      });

      const project = projectSelectors.selectProjectById('2')(result.current);
      expect(project?.name).toBe('Project 2');
    });
  });

  describe('fetchProjects', () => {
    it('should fetch projects successfully', async () => {
      const mockProjects: Project[] = [
        buildProject(),
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockProjects,
      });

      const { result } = renderHook(() => useProjectStore());

      await act(async () => {
        await result.current.fetchProjects();
      });

      expect(result.current.projects).toEqual(mockProjects);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      const { result } = renderHook(() => useProjectStore());

      await act(async () => {
        await result.current.fetchProjects();
      });

      expect(result.current.projects).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe('Failed to fetch projects');
    });

    it('should set loading state during fetch', async () => {
      mockFetch.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.fetchProjects();
      });

      expect(result.current.isLoading).toBe(true);
    });
  });

  describe('createProject', () => {
    it('should create project successfully', async () => {
      const newProject: Project = buildProject({
        id: '2',
        name: 'New Project',
        description: 'New Description',
        createdAt: '2024-01-02',
        updatedAt: '2024-01-02',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => newProject,
      });

      const { result } = renderHook(() => useProjectStore());

      const input: CreateProjectInput = {
        name: 'New Project',
        description: 'New Description',
        repoPath: 'https://github.com/example/repo.git',
        targetBranch: 'main',
      };

      let createdProject: Project | undefined;
      await act(async () => {
        createdProject = await result.current.createProject(input);
      });

      expect(createdProject).toEqual(newProject);
      expect(result.current.projects).toContainEqual(newProject);
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle create error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
      });

      const { result } = renderHook(() => useProjectStore());

      const input: CreateProjectInput = {
        name: 'New Project',
        description: 'New Description',
        repoPath: 'https://github.com/example/repo.git',
        targetBranch: 'main',
      };

      await expect(result.current.createProject(input)).rejects.toThrow();
      expect(result.current.error).toBe('Failed to create project');
    });
  });

  describe('updateProject', () => {
    it('should update project successfully', async () => {
      const existingProject: Project = buildProject({
        id: '1',
        name: 'Old Name',
        description: 'Old Description',
      });

      const updatedProject: Project = buildProject({
        ...existingProject,
        name: 'Updated Name',
        updatedAt: '2024-01-02',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => updatedProject,
      });

      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.projects = [existingProject];
      });

      let returnedProject: Project | undefined;
      await act(async () => {
        returnedProject = await result.current.updateProject('1', { name: 'Updated Name' });
      });

      expect(returnedProject).toEqual(updatedProject);
      expect(result.current.projects[0].name).toBe('Updated Name');
    });
  });

  describe('deleteProject', () => {
    it('should delete project successfully', async () => {
      const projects: Project[] = [
        buildProject({ id: '1', name: 'Project 1' }),
        buildProject({ id: '2', name: 'Project 2' }),
      ];

      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.projects = projects;
      });

      await act(async () => {
        await result.current.deleteProject('1');
      });

      expect(result.current.projects).toHaveLength(1);
      expect(result.current.projects[0].id).toBe('2');
    });

    it('should clear currentProject if deleted project is current', async () => {
      const project: Project = buildProject({ id: '1', name: 'Project 1' });

      mockFetch.mockResolvedValueOnce({ ok: true });

      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.projects = [project];
        result.current.currentProject = project;
      });

      await act(async () => {
        await result.current.deleteProject('1');
      });

      expect(result.current.currentProject).toBeNull();
    });
  });

  describe('setCurrentProject', () => {
    it('should set current project', () => {
      const { result } = renderHook(() => useProjectStore());
      const project: Project = buildProject();

      act(() => {
        result.current.setCurrentProject(project);
      });

      expect(result.current.currentProject).toEqual(project);
    });

    it('should clear current project', () => {
      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.setCurrentProject(null);
      });

      expect(result.current.currentProject).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error state', () => {
      const { result } = renderHook(() => useProjectStore());

      act(() => {
        result.current.error = 'Some error';
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });
});
