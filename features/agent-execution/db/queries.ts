/**
 * Agent Execution Feature Database Queries
 * Sessions, Execution Processes, and Normalized Entries CRUD operations
 */

import { db } from '../../../infra/db/src/client';
import { sessions, executionProcesses, normalizedEntries, workspaces } from '../../../infra/db/src/schema';
import { eq, desc, asc, and, like, sql, gt } from 'drizzle-orm';
import type {
  Session,
  NewSession,
  ExecutionProcess,
  NewExecutionProcess,
  NormalizedEntry,
  NewNormalizedEntry,
} from '../../../infra/db/src/schema';

// ========== Session Queries ==========

export async function getSessionsByWorkspaceId(workspaceId: string): Promise<Session[]> {
  try {
    return await db
      .select()
      .from(sessions)
      .where(eq(sessions.workspaceId, workspaceId))
      .orderBy(desc(sessions.createdAt));
  } catch (error) {
    console.error('Error fetching sessions by workspace id:', error);
    throw error;
  }
}

export async function getSessionById(id: string): Promise<Session | undefined> {
  try {
    const result = await db.select().from(sessions).where(eq(sessions.id, id));
    return result[0];
  } catch (error) {
    console.error('Error fetching session by id:', error);
    throw error;
  }
}

export async function getLatestSessionByWorkspaceId(workspaceId: string): Promise<Session | undefined> {
  try {
    const result = await db
      .select()
      .from(sessions)
      .where(eq(sessions.workspaceId, workspaceId))
      .orderBy(desc(sessions.createdAt))
      .limit(1);
    return result[0];
  } catch (error) {
    console.error('Error fetching latest session by workspace id:', error);
    throw error;
  }
}

export async function createSession(data: NewSession): Promise<Session> {
  try {
    const [session] = await db.insert(sessions).values(data).returning();
    return session;
  } catch (error) {
    console.error('Error creating session:', error);
    throw error;
  }
}

export async function updateSession(id: string, data: Partial<NewSession>): Promise<Session | undefined> {
  try {
    const [session] = await db
      .update(sessions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(sessions.id, id))
      .returning();
    return session;
  } catch (error) {
    console.error('Error updating session:', error);
    throw error;
  }
}

export async function deleteSession(id: string): Promise<boolean> {
  try {
    const result = await db.delete(sessions).where(eq(sessions.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting session:', error);
    throw error;
  }
}

export async function getSessionCountByWorkspace(workspaceId: string): Promise<number> {
  try {
    const result = await db
      .select({ count: sessions.id })
      .from(sessions)
      .where(eq(sessions.workspaceId, workspaceId));
    return result.length;
  } catch (error) {
    console.error('Error counting sessions by workspace:', error);
    throw error;
  }
}

// ========== Execution Process Queries ==========

export async function getExecutionProcessesBySessionId(
  sessionId: string,
  showSoftDeleted: boolean = false
): Promise<ExecutionProcess[]> {
  try {
    const query = db
      .select()
      .from(executionProcesses)
      .where(
        showSoftDeleted
          ? eq(executionProcesses.sessionId, sessionId)
          : and(
              eq(executionProcesses.sessionId, sessionId),
              eq(executionProcesses.dropped, false)
            )
      )
      .orderBy(asc(executionProcesses.startedAt));

    return await query;
  } catch (error) {
    console.error('Error fetching execution processes by session id:', error);
    throw error;
  }
}

function toSqliteDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '').slice(0, 23)
}

function parseSqliteDateTime(value: string): Date {
  // sqlite datetime('now') -> "YYYY-MM-DD HH:MM:SS.SSS"
  return new Date(value.replace(' ', 'T') + 'Z')
}

/**
 * Best-effort recovery for legacy/orphan logs:
 * When a session has no execution_process rows, infer processes from orphan
 * execution_process_logs in the session's time window.
 *
 * Note: execution_process_logs table only exists in Rust HTTP Server's database.
 * In Next.js API mode, this table doesn't exist, so we return 0 gracefully.
 */
export async function recoverExecutionProcessesForSession(
  sessionId: string
): Promise<number> {
  const session = await getSessionById(sessionId)
  if (!session) return 0

  const nextSession = await db
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .where(
      and(
        eq(sessions.workspaceId, session.workspaceId),
        gt(sessions.createdAt, session.createdAt)
      )
    )
    .orderBy(asc(sessions.createdAt))
    .limit(1)

  const start = session.createdAt
  const end = nextSession[0]?.createdAt ?? new Date(start.getTime() + 60 * 60 * 1000)

  // Next.js API doesn't have execution_process_logs table (only Rust HTTP Server does)
  // Check if table exists before querying
  try {
    const tableCheck = db.$client
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='execution_process_logs'`
      )
      .get() as { name: string } | undefined

    if (!tableCheck) {
      // Table doesn't exist in Next.js API mode
      return 0
    }
  } catch {
    // Error checking table existence
    return 0
  }

  const rows = db.$client
    .prepare(
      `SELECT
        l.execution_id AS execution_id,
        MIN(l.inserted_at) AS started_at,
        MAX(l.inserted_at) AS completed_at
      FROM execution_process_logs l
      LEFT JOIN execution_processes p ON p.id = l.execution_id
      WHERE
        p.id IS NULL
        AND l.inserted_at >= ?
        AND l.inserted_at < ?
      GROUP BY l.execution_id
      ORDER BY started_at ASC`
    )
    .all(toSqliteDateTime(start), toSqliteDateTime(end)) as Array<{
    execution_id: string
    started_at: string
    completed_at: string
  }>

  let recovered = 0
  for (const row of rows) {
    const existing = await getExecutionProcessById(row.execution_id)
    if (existing) continue

    await createExecutionProcess({
      id: row.execution_id,
      sessionId,
      workspaceId: session.workspaceId,
      runReason: 'codingagent',
      executorAction: null,
      status: 'completed',
      exitCode: 0,
      dropped: false,
      startedAt: parseSqliteDateTime(row.started_at),
      completedAt: parseSqliteDateTime(row.completed_at),
      createdAt: parseSqliteDateTime(row.started_at),
      updatedAt: parseSqliteDateTime(row.completed_at),
    })
    recovered += 1
  }

  return recovered
}

export async function getExecutionProcessesByWorkspaceId(workspaceId: string): Promise<ExecutionProcess[]> {
  try {
    return await db
      .select()
      .from(executionProcesses)
      .where(eq(executionProcesses.workspaceId, workspaceId))
      .orderBy(desc(executionProcesses.startedAt));
  } catch (error) {
    console.error('Error fetching execution processes by workspace id:', error);
    throw error;
  }
}

export async function getExecutionProcessById(id: string): Promise<ExecutionProcess | undefined> {
  try {
    const result = await db.select().from(executionProcesses).where(eq(executionProcesses.id, id));
    return result[0];
  } catch (error) {
    console.error('Error fetching execution process by id:', error);
    throw error;
  }
}

export async function getRunningProcessesByWorkspaceId(workspaceId: string): Promise<ExecutionProcess[]> {
  try {
    return await db
      .select()
      .from(executionProcesses)
      .where(and(eq(executionProcesses.workspaceId, workspaceId), eq(executionProcesses.status, 'running')));
  } catch (error) {
    console.error('Error fetching running processes by workspace id:', error);
    throw error;
  }
}

export async function createExecutionProcess(data: NewExecutionProcess): Promise<ExecutionProcess> {
  try {
    // Ensure dropped defaults to false if not provided
    const processData = {
      ...data,
      dropped: data.dropped ?? false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const [process] = await db.insert(executionProcesses).values(processData).returning();
    return process;
  } catch (error) {
    console.error('Error creating execution process:', error);
    throw error;
  }
}

export async function updateExecutionProcess(
  id: string,
  data: Partial<NewExecutionProcess>
): Promise<ExecutionProcess | undefined> {
  try {
    const [process] = await db
      .update(executionProcesses)
      .set(data)
      .where(eq(executionProcesses.id, id))
      .returning();
    return process;
  } catch (error) {
    console.error('Error updating execution process:', error);
    throw error;
  }
}

export async function completeExecutionProcess(
  id: string,
  status: string,
  exitCode: number | null
): Promise<ExecutionProcess | undefined> {
  try {
    const [process] = await db
      .update(executionProcesses)
      .set({ status, exitCode, completedAt: new Date() })
      .where(eq(executionProcesses.id, id))
      .returning();
    return process;
  } catch (error) {
    console.error('Error completing execution process:', error);
    throw error;
  }
}

export async function killExecutionProcess(id: string): Promise<ExecutionProcess | undefined> {
  try {
    const [process] = await db
      .update(executionProcesses)
      .set({ status: 'killed', completedAt: new Date() })
      .where(eq(executionProcesses.id, id))
      .returning();
    return process;
  } catch (error) {
    console.error('Error killing execution process:', error);
    throw error;
  }
}

export async function deleteExecutionProcess(id: string): Promise<boolean> {
  try {
    const result = await db.delete(executionProcesses).where(eq(executionProcesses.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting execution process:', error);
    throw error;
  }
}

export async function getProcessCountByStatus(workspaceId: string): Promise<Record<string, number>> {
  try {
    const result = await db
      .select({
        status: executionProcesses.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(executionProcesses)
      .where(eq(executionProcesses.workspaceId, workspaceId))
      .groupBy(executionProcesses.status);

    return result.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {} as Record<string, number>);
  } catch (error) {
    console.error('Error counting processes by status:', error);
    throw error;
  }
}

// ========== Normalized Entry Queries ==========

export async function getEntriesByProcessId(processId: string): Promise<NormalizedEntry[]> {
  try {
    return await db
      .select()
      .from(normalizedEntries)
      .where(eq(normalizedEntries.processId, processId))
      .orderBy(asc(normalizedEntries.timestamp));
  } catch (error) {
    console.error('Error fetching entries by process id:', error);
    throw error;
  }
}

export async function getEntriesBySessionId(sessionId: string): Promise<NormalizedEntry[]> {
  try {
    const processes = await db
      .select({ id: executionProcesses.id })
      .from(executionProcesses)
      .where(eq(executionProcesses.sessionId, sessionId));

    const processIds = processes.map((p) => p.id);

    if (processIds.length === 0) return [];

    return await db
      .select()
      .from(normalizedEntries)
      .where(sql`${normalizedEntries.processId} IN ${processIds}`)
      .orderBy(asc(normalizedEntries.timestamp));
  } catch (error) {
    console.error('Error fetching entries by session id:', error);
    throw error;
  }
}

export async function getEntryById(id: string): Promise<NormalizedEntry | undefined> {
  try {
    const result = await db.select().from(normalizedEntries).where(eq(normalizedEntries.id, id));
    return result[0];
  } catch (error) {
    console.error('Error fetching entry by id:', error);
    throw error;
  }
}

export async function getTokenUsageEntriesByProcessId(processId: string): Promise<NormalizedEntry[]> {
  try {
    return await db
      .select()
      .from(normalizedEntries)
      .where(
        and(eq(normalizedEntries.processId, processId), eq(normalizedEntries.entryType, 'token_usage_info'))
      )
      .orderBy(asc(normalizedEntries.timestamp));
  } catch (error) {
    console.error('Error fetching token usage entries by process id:', error);
    throw error;
  }
}

export async function getToolUsageEntriesByProcessId(processId: string): Promise<NormalizedEntry[]> {
  try {
    return await db
      .select()
      .from(normalizedEntries)
      .where(and(eq(normalizedEntries.processId, processId), eq(normalizedEntries.entryType, 'tool_use')))
      .orderBy(asc(normalizedEntries.timestamp));
  } catch (error) {
    console.error('Error fetching tool usage entries by process id:', error);
    throw error;
  }
}

export async function createNormalizedEntry(data: NewNormalizedEntry): Promise<NormalizedEntry> {
  try {
    const [entry] = await db.insert(normalizedEntries).values(data).returning();
    return entry;
  } catch (error) {
    console.error('Error creating normalized entry:', error);
    throw error;
  }
}

export async function createNormalizedEntriesBulk(data: NewNormalizedEntry[]): Promise<NormalizedEntry[]> {
  try {
    const entries = await db.insert(normalizedEntries).values(data).returning();
    return entries;
  } catch (error) {
    console.error('Error creating normalized entries bulk:', error);
    throw error;
  }
}

export async function deleteNormalizedEntry(id: string): Promise<boolean> {
  try {
    const result = await db.delete(normalizedEntries).where(eq(normalizedEntries.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting normalized entry:', error);
    throw error;
  }
}

export async function getEntryCountByProcess(processId: string): Promise<number> {
  try {
    const result = await db
      .select({ count: normalizedEntries.id })
      .from(normalizedEntries)
      .where(eq(normalizedEntries.processId, processId));
    return result.length;
  } catch (error) {
    console.error('Error counting entries by process:', error);
    throw error;
  }
}
