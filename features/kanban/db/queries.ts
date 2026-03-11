/**
 * Kanban Feature Database Queries
 * Projects and Tasks CRUD operations
 */

import { db } from '../../../infra/db/src/client';
import { projects, tasks, workspaces, normalizedEntries, sessions, executionProcesses } from '../../../infra/db/src/schema';
import { eq, desc, asc, and, like, sql, gt, lt } from 'drizzle-orm';
import type { Project, NewProject, Task, NewTask, Workspace, NewWorkspace, NewNormalizedEntry, NormalizedEntry } from '../../../infra/db/src/schema';

// ========== Project Queries ==========

export async function getProjects(): Promise<Project[]> {
  try {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  } catch (error) {
    console.error('Error fetching projects:', error);
    throw error;
  }
}

export async function getProjectById(id: string): Promise<Project | undefined> {
  try {
    // First try to find by ID
    const result = await db.select().from(projects).where(eq(projects.id, id));
    if (result[0]) return result[0];
    
    // Fallback: try to find by name (for convenience)
    const byName = await db.select().from(projects).where(eq(projects.name, id));
    return byName[0];
  } catch (error) {
    console.error('Error fetching project by id:', error);
    throw error;
  }
}

export async function createProject(data: NewProject): Promise<Project> {
  try {
    const [project] = await db.insert(projects).values(data).returning();
    return project;
  } catch (error) {
    console.error('Error creating project:', error);
    throw error;
  }
}

export async function updateProject(id: string, data: Partial<NewProject>): Promise<Project | undefined> {
  try {
    const [project] = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return project;
  } catch (error) {
    console.error('Error updating project:', error);
    throw error;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    const result = await db.delete(projects).where(eq(projects.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting project:', error);
    throw error;
  }
}

export async function searchProjects(query: string): Promise<Project[]> {
  try {
    return await db
      .select()
      .from(projects)
      .where(like(projects.name, `%${query}%`))
      .orderBy(desc(projects.createdAt));
  } catch (error) {
    console.error('Error searching projects:', error);
    throw error;
  }
}

// ========== Task Queries ==========

export async function getTasksByProjectId(projectId: string): Promise<Task[]> {
  try {
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.position));
  } catch (error) {
    console.error('Error fetching tasks by project id:', error);
    throw error;
  }
}

export async function getTaskById(id: string): Promise<Task | undefined> {
  try {
    const result = await db.select().from(tasks).where(eq(tasks.id, id));
    return result[0];
  } catch (error) {
    console.error('Error fetching task by id:', error);
    throw error;
  }
}

export async function getTasksByStatus(projectId: string, status: string): Promise<Task[]> {
  try {
    return await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), eq(tasks.status, status)))
      .orderBy(asc(tasks.position));
  } catch (error) {
    console.error('Error fetching tasks by status:', error);
    throw error;
  }
}

export async function createTask(data: NewTask): Promise<Task> {
  try {
    const [task] = await db.insert(tasks).values(data).returning();
    return task;
  } catch (error) {
    console.error('Error creating task:', error);
    throw error;
  }
}

export async function updateTask(id: string, data: Partial<NewTask>): Promise<Task | undefined> {
  try {
    const [task] = await db
      .update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  } catch (error) {
    console.error('Error updating task:', error);
    throw error;
  }
}

export async function updateTaskStatus(id: string, status: string): Promise<Task | undefined> {
  try {
    const [task] = await db
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  } catch (error) {
    console.error('Error updating task status:', error);
    throw error;
  }
}

export async function updateTaskPosition(id: string, position: number): Promise<Task | undefined> {
  try {
    const [task] = await db
      .update(tasks)
      .set({ position, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return task;
  } catch (error) {
    console.error('Error updating task position:', error);
    throw error;
  }
}

export async function deleteTask(id: string): Promise<boolean> {
  try {
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting task:', error);
    throw error;
  }
}

export async function getTaskCountByStatus(projectId: string): Promise<Record<string, number>> {
  try {
    const result = await db
      .select({
        status: tasks.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .groupBy(tasks.status);

    return result.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {} as Record<string, number>);
  } catch (error) {
    console.error('Error counting tasks by status:', error);
    throw error;
  }
}

// ========== Workspace Queries ==========

export async function getWorkspacesByTaskId(taskId: string): Promise<Workspace[]> {
  try {
    return await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.taskId, taskId))
      .orderBy(desc(workspaces.createdAt));
  } catch (error) {
    console.error('Error fetching workspaces by task id:', error);
    throw error;
  }
}

export async function getWorkspaceById(id: string): Promise<Workspace | undefined> {
  try {
    const result = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return result[0];
  } catch (error) {
    console.error('Error fetching workspace by id:', error);
    throw error;
  }
}

export async function createWorkspace(data: NewWorkspace): Promise<Workspace> {
  try {
    const [workspace] = await db.insert(workspaces).values(data).returning();
    return workspace;
  } catch (error) {
    console.error('Error creating workspace:', error);
    throw error;
  }
}

export async function updateWorkspace(id: string, data: Partial<NewWorkspace>): Promise<Workspace | undefined> {
  try {
    const [workspace] = await db
      .update(workspaces)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    return workspace;
  } catch (error) {
    console.error('Error updating workspace:', error);
    throw error;
  }
}

export async function archiveWorkspace(id: string): Promise<Workspace | undefined> {
  try {
    const [workspace] = await db
      .update(workspaces)
      .set({ archived: true, updatedAt: new Date() })
      .where(eq(workspaces.id, id))
      .returning();
    return workspace;
  } catch (error) {
    console.error('Error archiving workspace:', error);
    throw error;
  }
}

export async function deleteWorkspace(id: string): Promise<boolean> {
  try {
    const result = await db.delete(workspaces).where(eq(workspaces.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting workspace:', error);
    throw error;
  }
}

export async function getPinnedWorkspaces(): Promise<Workspace[]> {
  try {
    return await db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.pinned, true), eq(workspaces.archived, false)))
      .orderBy(desc(workspaces.updatedAt));
  } catch (error) {
    console.error('Error fetching pinned workspaces:', error);
    throw error;
  }
}

// ========== 获取单个 Workspace 详情（含 Session）==========
export async function getWorkspaceWithSession(id: string): Promise<{ workspace: Workspace | undefined; sessions: { id: string; createdAt: unknown }[] } | null> {
  try {
    const workspaceResult = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id));
    
    if (!workspaceResult[0]) {
      return null;
    }
    
    const sessionsResult = await db
      .select()
      .from(sessions)
      .where(eq(sessions.workspaceId, id))
      .orderBy(desc(sessions.createdAt));
    
    return {
      workspace: workspaceResult[0],
      sessions: sessionsResult.map(s => ({
        id: s.id,
        createdAt: s.createdAt,
      })),
    };
  } catch (error) {
    console.error('Error fetching workspace with session:', error);
    throw error;
  }
}

// ========== NormalizedEntry Queries ==========

export async function createNormalizedEntry(data: NewNormalizedEntry): Promise<NormalizedEntry> {
  try {
    const [entry] = await db.insert(normalizedEntries).values(data).returning();
    return entry;
  } catch (error) {
    console.error('Error creating normalized entry:', error);
    throw error;
  }
}

// 根据 workspaceId 获取最新的 execution_process_id
export async function getLatestProcessIdByWorkspaceId(workspaceId: string): Promise<string | null> {
  try {
    // 先找到最新的 session
    const latestSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.workspaceId, workspaceId))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    
    if (!latestSessions[0]) {
      return null;
    }
    
    // 再找到该 session 的最新 process
    const latestProcesses = await db
      .select()
      .from(executionProcesses)
      .where(eq(executionProcesses.sessionId, latestSessions[0].id))
      .orderBy(desc(executionProcesses.startedAt))
      .limit(1);
    
    return latestProcesses[0]?.id || null;
  } catch (error) {
    console.error('Error getting latest process id:', error);
    return null;
  }
}

export async function getEntriesByProcessId(
  processId: string, 
  options?: { limit?: number; timestamp?: number }
): Promise<NormalizedEntry[]> {
  try {
    const limit = options?.limit || 50;
    const timestamp = options?.timestamp;
    
    if (timestamp) {
      // Keyset pagination: get entries older than timestamp
      return await db
        .select()
        .from(normalizedEntries)
        .where(and(
          eq(normalizedEntries.processId, processId),
          lt(normalizedEntries.timestamp, new Date(timestamp))
        ))
        .orderBy(desc(normalizedEntries.timestamp))
        .limit(limit);
    }
    
    return await db
      .select()
      .from(normalizedEntries)
      .where(eq(normalizedEntries.processId, processId))
      .orderBy(desc(normalizedEntries.timestamp))
      .limit(limit);
  } catch (error) {
    console.error('Error fetching entries by process id:', error);
    throw error;
  }
}

export async function getEntriesByWorkspaceId(
  workspaceId: string,
  options?: { limit?: number; timestamp?: number }
): Promise<NormalizedEntry[]> {
  try {
    const limit = options?.limit || 50;
    const timestamp = options?.timestamp;
    
    // First get all execution processes for this workspace
    const workspaceSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.workspaceId, workspaceId));
    
    const sessionIds = workspaceSessions.map(s => s.id);
    
    if (sessionIds.length === 0) {
      return [];
    }
    
    // Get all execution processes for these sessions
    const processIds: string[] = [];
    for (const sessionId of sessionIds) {
      const processes = await db
        .select()
        .from(executionProcesses)
        .where(eq(executionProcesses.sessionId, sessionId));
      processIds.push(...processes.map(p => p.id));
    }
    
    if (processIds.length === 0) {
      return [];
    }
    
    // Get entries for all these processes
    let entries: NormalizedEntry[] = [];
    for (const pid of processIds) {
      const processEntries = await db
        .select()
        .from(normalizedEntries)
        .where(eq(normalizedEntries.processId, pid));
      entries.push(...processEntries);
    }
    
    // Sort by timestamp and apply limit
    entries.sort((a, b) => {
      const timeA = a.timestamp?.getTime() || 0;
      const timeB = b.timestamp?.getTime() || 0;
      return timeB - timeA;
    });
    
    // Apply timestamp filter if provided (Keyset pagination)
    if (timestamp) {
      entries = entries.filter(e => (e.timestamp?.getTime() || 0) < timestamp);
    }
    
    return entries.slice(0, limit);
  } catch (error) {
    console.error('Error fetching entries by workspace id:', error);
    throw error;
  }
}
