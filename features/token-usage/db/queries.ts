/**
 * Token Usage Feature Database Queries
 * Token Usage Records and Aggregation Queries
 */

import { db } from '../../../infra/db/src/client';
import { tokenUsageRecords } from '../../../infra/db/src/schema';
import { eq, desc, asc, and, gte, lte, sql, sum } from 'drizzle-orm';
import type { TokenUsageRecord, NewTokenUsageRecord } from '../../../infra/db/src/schema';

// ========== Token Usage Record Queries ==========

export async function getTokenUsageRecordsByProjectId(projectId: string): Promise<TokenUsageRecord[]> {
  try {
    return await db
      .select()
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.projectId, projectId))
      .orderBy(desc(tokenUsageRecords.timestamp));
  } catch (error) {
    console.error('Error fetching token usage records by project id:', error);
    throw error;
  }
}

export async function getTokenUsageRecordsByTaskId(taskId: string): Promise<TokenUsageRecord[]> {
  try {
    return await db
      .select()
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.taskId, taskId))
      .orderBy(desc(tokenUsageRecords.timestamp));
  } catch (error) {
    console.error('Error fetching token usage records by task id:', error);
    throw error;
  }
}

export async function getTokenUsageRecordsByWorkspaceId(workspaceId: string): Promise<TokenUsageRecord[]> {
  try {
    return await db
      .select()
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.workspaceId, workspaceId))
      .orderBy(desc(tokenUsageRecords.timestamp));
  } catch (error) {
    console.error('Error fetching token usage records by workspace id:', error);
    throw error;
  }
}

export async function getTokenUsageRecordsByProcessId(processId: string): Promise<TokenUsageRecord[]> {
  try {
    return await db
      .select()
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.processId, processId))
      .orderBy(desc(tokenUsageRecords.timestamp));
  } catch (error) {
    console.error('Error fetching token usage records by process id:', error);
    throw error;
  }
}

export async function getTokenUsageRecordById(id: string): Promise<TokenUsageRecord | undefined> {
  try {
    const result = await db.select().from(tokenUsageRecords).where(eq(tokenUsageRecords.id, id));
    return result[0];
  } catch (error) {
    console.error('Error fetching token usage record by id:', error);
    throw error;
  }
}

export async function createTokenUsageRecord(data: NewTokenUsageRecord): Promise<TokenUsageRecord> {
  try {
    const [record] = await db.insert(tokenUsageRecords).values(data).returning();
    return record;
  } catch (error) {
    console.error('Error creating token usage record:', error);
    throw error;
  }
}

export async function createTokenUsageRecordsBulk(data: NewTokenUsageRecord[]): Promise<TokenUsageRecord[]> {
  try {
    const records = await db.insert(tokenUsageRecords).values(data).returning();
    return records;
  } catch (error) {
    console.error('Error creating token usage records bulk:', error);
    throw error;
  }
}

export async function deleteTokenUsageRecord(id: string): Promise<boolean> {
  try {
    const result = await db.delete(tokenUsageRecords).where(eq(tokenUsageRecords.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting token usage record:', error);
    throw error;
  }
}

// ========== Aggregation Queries ==========

export async function getTotalTokenUsageByProject(projectId: string): Promise<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiCallCount: number;
}> {
  try {
    const result = await db
      .select({
        inputTokens: sum(tokenUsageRecords.inputTokens),
        outputTokens: sum(tokenUsageRecords.outputTokens),
        totalTokens: sum(tokenUsageRecords.totalTokens),
        apiCallCount: sum(tokenUsageRecords.apiCallCount),
      })
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.projectId, projectId));

    return {
      inputTokens: Number(result[0]?.inputTokens ?? 0),
      outputTokens: Number(result[0]?.outputTokens ?? 0),
      totalTokens: Number(result[0]?.totalTokens ?? 0),
      apiCallCount: Number(result[0]?.apiCallCount ?? 0),
    };
  } catch (error) {
    console.error('Error calculating total token usage by project:', error);
    throw error;
  }
}

export async function getTotalTokenUsageByTask(taskId: string): Promise<{
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiCallCount: number;
}> {
  try {
    const result = await db
      .select({
        inputTokens: sum(tokenUsageRecords.inputTokens),
        outputTokens: sum(tokenUsageRecords.outputTokens),
        totalTokens: sum(tokenUsageRecords.totalTokens),
        apiCallCount: sum(tokenUsageRecords.apiCallCount),
      })
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.taskId, taskId));

    return {
      inputTokens: Number(result[0]?.inputTokens ?? 0),
      outputTokens: Number(result[0]?.outputTokens ?? 0),
      totalTokens: Number(result[0]?.totalTokens ?? 0),
      apiCallCount: Number(result[0]?.apiCallCount ?? 0),
    };
  } catch (error) {
    console.error('Error calculating total token usage by task:', error);
    throw error;
  }
}

export async function getTokenUsageByModel(projectId: string): Promise<Array<{
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiCallCount: number;
}>> {
  try {
    const result = await db
      .select({
        model: tokenUsageRecords.model,
        inputTokens: sum(tokenUsageRecords.inputTokens),
        outputTokens: sum(tokenUsageRecords.outputTokens),
        totalTokens: sum(tokenUsageRecords.totalTokens),
        apiCallCount: sum(tokenUsageRecords.apiCallCount),
      })
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.projectId, projectId))
      .groupBy(tokenUsageRecords.model);

    return result.map((row) => ({
      model: row.model ?? 'unknown',
      inputTokens: Number(row.inputTokens ?? 0),
      outputTokens: Number(row.outputTokens ?? 0),
      totalTokens: Number(row.totalTokens ?? 0),
      apiCallCount: Number(row.apiCallCount ?? 0),
    }));
  } catch (error) {
    console.error('Error calculating token usage by model:', error);
    throw error;
  }
}

export async function getTokenUsageByAgent(projectId: string): Promise<Array<{
  agentName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiCallCount: number;
}>> {
  try {
    const result = await db
      .select({
        agentName: tokenUsageRecords.agentName,
        inputTokens: sum(tokenUsageRecords.inputTokens),
        outputTokens: sum(tokenUsageRecords.outputTokens),
        totalTokens: sum(tokenUsageRecords.totalTokens),
        apiCallCount: sum(tokenUsageRecords.apiCallCount),
      })
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.projectId, projectId))
      .groupBy(tokenUsageRecords.agentName);

    return result.map((row) => ({
      agentName: row.agentName ?? 'unknown',
      inputTokens: Number(row.inputTokens ?? 0),
      outputTokens: Number(row.outputTokens ?? 0),
      totalTokens: Number(row.totalTokens ?? 0),
      apiCallCount: Number(row.apiCallCount ?? 0),
    }));
  } catch (error) {
    console.error('Error calculating token usage by agent:', error);
    throw error;
  }
}

export async function getTokenUsageByDateRange(
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<TokenUsageRecord[]> {
  try {
    return await db
      .select()
      .from(tokenUsageRecords)
      .where(
        and(
          eq(tokenUsageRecords.projectId, projectId),
          gte(tokenUsageRecords.timestamp, startDate),
          lte(tokenUsageRecords.timestamp, endDate)
        )
      )
      .orderBy(desc(tokenUsageRecords.timestamp));
  } catch (error) {
    console.error('Error fetching token usage by date range:', error);
    throw error;
  }
}

export async function getDailyTokenUsage(projectId: string): Promise<Array<{
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}>> {
  try {
    // SQLite doesn't have date_trunc, so we'll use a simple date extraction
    const result = await db
      .select({
        date: sql<string>`date(${tokenUsageRecords.timestamp} / 1000, 'unixepoch', 'localtime')`,
        inputTokens: sum(tokenUsageRecords.inputTokens),
        outputTokens: sum(tokenUsageRecords.outputTokens),
        totalTokens: sum(tokenUsageRecords.totalTokens),
      })
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.projectId, projectId))
      .groupBy(sql`date(${tokenUsageRecords.timestamp} / 1000, 'unixepoch', 'localtime')`)
      .orderBy(desc(sql`date(${tokenUsageRecords.timestamp} / 1000, 'unixepoch', 'localtime')`));

    return result.map((row) => ({
      date: row.date ?? '',
      inputTokens: Number(row.inputTokens ?? 0),
      outputTokens: Number(row.outputTokens ?? 0),
      totalTokens: Number(row.totalTokens ?? 0),
    }));
  } catch (error) {
    console.error('Error calculating daily token usage:', error);
    throw error;
  }
}

export async function getTokenUsageByTaskForProject(projectId: string): Promise<Array<{
  taskId: string;
  taskTitle: string | null;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  apiCallCount: number;
}>> {
  try {
    // This is a simplified version - in a real app you'd join with tasks table
    const result = await db
      .select({
        taskId: tokenUsageRecords.taskId,
        inputTokens: sum(tokenUsageRecords.inputTokens),
        outputTokens: sum(tokenUsageRecords.outputTokens),
        totalTokens: sum(tokenUsageRecords.totalTokens),
        apiCallCount: sum(tokenUsageRecords.apiCallCount),
      })
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.projectId, projectId))
      .groupBy(tokenUsageRecords.taskId)
      .orderBy(desc(sum(tokenUsageRecords.totalTokens)));

    return result.map((row) => ({
      taskId: row.taskId,
      taskTitle: null, // Would need to join with tasks table
      inputTokens: Number(row.inputTokens ?? 0),
      outputTokens: Number(row.outputTokens ?? 0),
      totalTokens: Number(row.totalTokens ?? 0),
      apiCallCount: Number(row.apiCallCount ?? 0),
    }));
  } catch (error) {
    console.error('Error calculating token usage by task:', error);
    throw error;
  }
}

export async function getTopTokenConsumers(
  projectId: string,
  limit: number = 10
): Promise<Array<{
  taskId: string;
  totalTokens: number;
}>> {
  try {
    const result = await db
      .select({
        taskId: tokenUsageRecords.taskId,
        totalTokens: sum(tokenUsageRecords.totalTokens),
      })
      .from(tokenUsageRecords)
      .where(eq(tokenUsageRecords.projectId, projectId))
      .groupBy(tokenUsageRecords.taskId)
      .orderBy(desc(sum(tokenUsageRecords.totalTokens)))
      .limit(limit);

    return result.map((row) => ({
      taskId: row.taskId,
      totalTokens: Number(row.totalTokens ?? 0),
    }));
  } catch (error) {
    console.error('Error fetching top token consumers:', error);
    throw error;
  }
}
