/**
 * Scaffold Feature Database Queries
 * Scaffold Records CRUD operations
 */

import { db } from '../../../infra/db/src/client';
import { scaffoldRecords } from '../../../infra/db/src/schema';
import { eq, desc, asc, and, like, sql } from 'drizzle-orm';
import type { ScaffoldRecord, NewScaffoldRecord } from '../../../infra/db/src/schema';

// ========== Scaffold Record Queries ==========

export async function getScaffoldRecords(): Promise<ScaffoldRecord[]> {
  try {
    return await db.select().from(scaffoldRecords).orderBy(desc(scaffoldRecords.createdAt));
  } catch (error) {
    console.error('Error fetching scaffold records:', error);
    throw error;
  }
}

export async function getScaffoldRecordsByProjectId(beeProjectId: string): Promise<ScaffoldRecord[]> {
  try {
    return await db
      .select()
      .from(scaffoldRecords)
      .where(eq(scaffoldRecords.beeProjectId, beeProjectId))
      .orderBy(desc(scaffoldRecords.createdAt));
  } catch (error) {
    console.error('Error fetching scaffold records by project id:', error);
    throw error;
  }
}

export async function getScaffoldRecordById(id: string): Promise<ScaffoldRecord | undefined> {
  try {
    const result = await db.select().from(scaffoldRecords).where(eq(scaffoldRecords.id, id));
    return result[0];
  } catch (error) {
    console.error('Error fetching scaffold record by id:', error);
    throw error;
  }
}

export async function getScaffoldRecordByProjectDir(projectDir: string): Promise<ScaffoldRecord | undefined> {
  try {
    const result = await db.select().from(scaffoldRecords).where(eq(scaffoldRecords.projectDir, projectDir));
    return result[0];
  } catch (error) {
    console.error('Error fetching scaffold record by project dir:', error);
    throw error;
  }
}

export async function getScaffoldRecordsByTemplateId(templateId: string): Promise<ScaffoldRecord[]> {
  try {
    return await db
      .select()
      .from(scaffoldRecords)
      .where(eq(scaffoldRecords.templateId, templateId))
      .orderBy(desc(scaffoldRecords.createdAt));
  } catch (error) {
    console.error('Error fetching scaffold records by template id:', error);
    throw error;
  }
}

export async function getScaffoldRecordsByStatus(status: string): Promise<ScaffoldRecord[]> {
  try {
    return await db
      .select()
      .from(scaffoldRecords)
      .where(eq(scaffoldRecords.status, status))
      .orderBy(desc(scaffoldRecords.createdAt));
  } catch (error) {
    console.error('Error fetching scaffold records by status:', error);
    throw error;
  }
}

export async function getFailedScaffoldRecords(): Promise<ScaffoldRecord[]> {
  try {
    return await db
      .select()
      .from(scaffoldRecords)
      .where(eq(scaffoldRecords.status, 'failed'))
      .orderBy(desc(scaffoldRecords.createdAt));
  } catch (error) {
    console.error('Error fetching failed scaffold records:', error);
    throw error;
  }
}

export async function createScaffoldRecord(data: NewScaffoldRecord): Promise<ScaffoldRecord> {
  try {
    const [record] = await db.insert(scaffoldRecords).values(data).returning();
    return record;
  } catch (error) {
    console.error('Error creating scaffold record:', error);
    throw error;
  }
}

export async function updateScaffoldRecord(
  id: string,
  data: Partial<NewScaffoldRecord>
): Promise<ScaffoldRecord | undefined> {
  try {
    const [record] = await db
      .update(scaffoldRecords)
      .set(data)
      .where(eq(scaffoldRecords.id, id))
      .returning();
    return record;
  } catch (error) {
    console.error('Error updating scaffold record:', error);
    throw error;
  }
}

export async function updateScaffoldRecordStatus(
  id: string,
  status: string
): Promise<ScaffoldRecord | undefined> {
  try {
    const [record] = await db
      .update(scaffoldRecords)
      .set({ status })
      .where(eq(scaffoldRecords.id, id))
      .returning();
    return record;
  } catch (error) {
    console.error('Error updating scaffold record status:', error);
    throw error;
  }
}

export async function updateScaffoldConfigStatus(
  id: string,
  configGeneratedOhMyOpencode: boolean,
  configGeneratedMcp: boolean,
  configGeneratedClaudeMd: string
): Promise<ScaffoldRecord | undefined> {
  try {
    const [record] = await db
      .update(scaffoldRecords)
      .set({ configGeneratedOhMyOpencode, configGeneratedMcp, configGeneratedClaudeMd })
      .where(eq(scaffoldRecords.id, id))
      .returning();
    return record;
  } catch (error) {
    console.error('Error updating scaffold config status:', error);
    throw error;
  }
}

export async function recordScaffoldError(id: string, errorsJson: string): Promise<ScaffoldRecord | undefined> {
  try {
    const [record] = await db
      .update(scaffoldRecords)
      .set({ status: 'failed', errorsJson })
      .where(eq(scaffoldRecords.id, id))
      .returning();
    return record;
  } catch (error) {
    console.error('Error recording scaffold error:', error);
    throw error;
  }
}

export async function deleteScaffoldRecord(id: string): Promise<boolean> {
  try {
    const result = await db.delete(scaffoldRecords).where(eq(scaffoldRecords.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting scaffold record:', error);
    throw error;
  }
}

export async function searchScaffoldRecords(query: string): Promise<ScaffoldRecord[]> {
  try {
    return await db
      .select()
      .from(scaffoldRecords)
      .where(like(scaffoldRecords.projectName, `%${query}%`))
      .orderBy(desc(scaffoldRecords.createdAt));
  } catch (error) {
    console.error('Error searching scaffold records:', error);
    throw error;
  }
}

export async function getScaffoldRecordCountByStatus(): Promise<Record<string, number>> {
  try {
    const result = await db
      .select({
        status: scaffoldRecords.status,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(scaffoldRecords)
      .groupBy(scaffoldRecords.status);

    return result.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {} as Record<string, number>);
  } catch (error) {
    console.error('Error counting scaffold records by status:', error);
    throw error;
  }
}

export async function getScaffoldRecordCountByTemplate(): Promise<Array<{
  templateId: string;
  count: number;
}>> {
  try {
    const result = await db
      .select({
        templateId: scaffoldRecords.templateId,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(scaffoldRecords)
      .groupBy(scaffoldRecords.templateId);

    return result.map((row) => ({
      templateId: row.templateId,
      count: row.count,
    }));
  } catch (error) {
    console.error('Error counting scaffold records by template:', error);
    throw error;
  }
}

export async function linkScaffoldToProject(
  scaffoldId: string,
  beeProjectId: string
): Promise<ScaffoldRecord | undefined> {
  try {
    const [record] = await db
      .update(scaffoldRecords)
      .set({ beeProjectId })
      .where(eq(scaffoldRecords.id, scaffoldId))
      .returning();
    return record;
  } catch (error) {
    console.error('Error linking scaffold to project:', error);
    throw error;
  }
}
