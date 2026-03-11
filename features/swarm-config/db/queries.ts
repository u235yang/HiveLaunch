/**
 * Swarm Config Feature Database Queries
 * Project Swarms CRUD operations
 */

import { db } from '../../../infra/db/src/client';
import { projectSwarms } from '../../../infra/db/src/schema';
import { eq, desc, and, like, ne } from 'drizzle-orm';
import type { ProjectSwarm, NewProjectSwarm } from '../../../infra/db/src/schema';

// ========== Project Swarm Queries ==========

export async function getProjectSwarmsByProjectId(projectId: string): Promise<ProjectSwarm[]> {
  try {
    return await db
      .select()
      .from(projectSwarms)
      .where(eq(projectSwarms.projectId, projectId))
      .orderBy(desc(projectSwarms.installedAt));
  } catch (error) {
    console.error('Error fetching project swarms by project id:', error);
    throw error;
  }
}

export async function getSwarmById(id: string): Promise<ProjectSwarm | undefined> {
  try {
    const result = await db.select().from(projectSwarms).where(eq(projectSwarms.id, id));
    return result[0];
  } catch (error) {
    console.error('Error fetching swarm by id:', error);
    throw error;
  }
}

export async function getSwarmByProjectAndTemplate(
  projectId: string,
  templateId: string
): Promise<ProjectSwarm | undefined> {
  try {
    const result = await db
      .select()
      .from(projectSwarms)
      .where(and(eq(projectSwarms.projectId, projectId), eq(projectSwarms.templateId, templateId)));
    return result[0];
  } catch (error) {
    console.error('Error fetching swarm by project and template:', error);
    throw error;
  }
}

export async function getEnabledSwarms(projectId: string): Promise<ProjectSwarm[]> {
  try {
    return await db
      .select()
      .from(projectSwarms)
      .where(and(eq(projectSwarms.projectId, projectId), eq(projectSwarms.enabled, true)))
      .orderBy(desc(projectSwarms.installedAt));
  } catch (error) {
    console.error('Error fetching enabled swarms:', error);
    throw error;
  }
}

export async function createProjectSwarm(data: NewProjectSwarm): Promise<ProjectSwarm> {
  try {
    const [swarm] = await db.insert(projectSwarms).values(data).returning();
    return swarm;
  } catch (error) {
    console.error('Error creating project swarm:', error);
    throw error;
  }
}

export async function updateSwarm(id: string, data: Partial<NewProjectSwarm>): Promise<ProjectSwarm | undefined> {
  try {
    const [swarm] = await db
      .update(projectSwarms)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projectSwarms.id, id))
      .returning();
    return swarm;
  } catch (error) {
    console.error('Error updating swarm:', error);
    throw error;
  }
}

export async function updateSwarmOverrides(id: string, overridesJson: string): Promise<ProjectSwarm | undefined> {
  try {
    const [swarm] = await db
      .update(projectSwarms)
      .set({ overridesJson, updatedAt: new Date() })
      .where(eq(projectSwarms.id, id))
      .returning();
    return swarm;
  } catch (error) {
    console.error('Error updating swarm overrides:', error);
    throw error;
  }
}

export async function updateSwarmMergeStrategy(
  id: string,
  mergeStrategy: string
): Promise<ProjectSwarm | undefined> {
  try {
    const [swarm] = await db
      .update(projectSwarms)
      .set({ mergeStrategy, updatedAt: new Date() })
      .where(eq(projectSwarms.id, id))
      .returning();
    return swarm;
  } catch (error) {
    console.error('Error updating swarm merge strategy:', error);
    throw error;
  }
}

export async function enableSwarm(id: string): Promise<ProjectSwarm | undefined> {
  try {
    const [swarm] = await db
      .update(projectSwarms)
      .set({ enabled: true, updatedAt: new Date() })
      .where(eq(projectSwarms.id, id))
      .returning();
    return swarm;
  } catch (error) {
    console.error('Error enabling swarm:', error);
    throw error;
  }
}

export async function disableSwarm(id: string): Promise<ProjectSwarm | undefined> {
  try {
    const [swarm] = await db
      .update(projectSwarms)
      .set({ enabled: false, updatedAt: new Date() })
      .where(eq(projectSwarms.id, id))
      .returning();
    return swarm;
  } catch (error) {
    console.error('Error disabling swarm:', error);
    throw error;
  }
}

export async function disableOtherSwarms(projectId: string, enabledSwarmId: string): Promise<void> {
  try {
    await db
      .update(projectSwarms)
      .set({ enabled: false, updatedAt: new Date() })
      .where(and(eq(projectSwarms.projectId, projectId), ne(projectSwarms.id, enabledSwarmId)));
  } catch (error) {
    console.error('Error disabling other swarms:', error);
    throw error;
  }
}

export async function deleteProjectSwarm(id: string): Promise<boolean> {
  try {
    const result = await db.delete(projectSwarms).where(eq(projectSwarms.id, id));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting project swarm:', error);
    throw error;
  }
}

export async function deleteSwarmsByProjectId(projectId: string): Promise<boolean> {
  try {
    const result = await db.delete(projectSwarms).where(eq(projectSwarms.projectId, projectId));
    return (result.changes ?? 0) > 0;
  } catch (error) {
    console.error('Error deleting swarms by project id:', error);
    throw error;
  }
}

export async function searchSwarms(query: string): Promise<ProjectSwarm[]> {
  try {
    return await db
      .select()
      .from(projectSwarms)
      .where(like(projectSwarms.name, `%${query}%`))
      .orderBy(desc(projectSwarms.installedAt));
  } catch (error) {
    console.error('Error searching swarms:', error);
    throw error;
  }
}

export async function getSwarmCountByProject(projectId: string): Promise<number> {
  try {
    const result = await db
      .select({ count: projectSwarms.id })
      .from(projectSwarms)
      .where(eq(projectSwarms.projectId, projectId));
    return result.length;
  } catch (error) {
    console.error('Error counting swarms by project:', error);
    throw error;
  }
}
