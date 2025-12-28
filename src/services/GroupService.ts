import database from '../database/connection.js';
import logger from '../utils/Logger.js';

export interface Group {
    id: string;
    name: string;
    description?: string;
    isActive: boolean;
    createdBy?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * GroupService - Manages template groups
 */
class GroupService {
    /**
     * Create a new group
     */
    async create(name: string, description: string | undefined, createdBy: string): Promise<Group> {
        try {
            const result = await database.query(
                `INSERT INTO groups (name, description, created_by)
                 VALUES ($1, $2, $3)
                 RETURNING id, name, description, is_active as "isActive", 
                           created_by as "createdBy", created_at as "createdAt", 
                           updated_at as "updatedAt"`,
                [name, description, createdBy]
            );

            logger.info(`Group created: ${name} by user ${createdBy}`);
            return result.rows[0];
        } catch (error) {
            logger.error('Error creating group:', error);
            throw error;
        }
    }

    /**
     * List all groups
     */
    async list(includeInactive: boolean = false): Promise<Group[]> {
        try {
            const query = `
            SELECT id, name, description, is_active as "isActive", 
                   created_by as "createdBy", created_at as "createdAt", 
                   updated_at as "updatedAt"
            FROM groups 
            WHERE ($1 = true OR is_active = true)
            ORDER BY name`;

            // Using parameterized queries to safely pass the boolean
            const result = await database.query(query, [includeInactive]);
            return result.rows;
        } catch (error) {
            logger.error('Error listing groups:', error);
            throw error;
        }
    }

    /**
     * Get a group by ID
     */
    async get(id: string): Promise<Group> {
        try {
            const result = await database.query(
                `SELECT id, name, description, is_active as "isActive", 
                        created_by as "createdBy", created_at as "createdAt", 
                        updated_at as "updatedAt"
                 FROM groups 
                 WHERE id = $1`,
                [id]
            );

            if (result.rows.length === 0) {
                throw new Error('Group not found');
            }

            return result.rows[0];
        } catch (error) {
            logger.error(`Error getting group ${id}:`, error);
            throw error;
        }
    }

    /**
     * Update a group
     */
    async update(id: string, updates: { name?: string; description?: string }): Promise<Group> {
        try {
            const setClauses: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (updates.name !== undefined) {
                setClauses.push(`name = $${paramIndex++}`);
                values.push(updates.name);
            }

            if (updates.description !== undefined) {
                setClauses.push(`description = $${paramIndex++}`);
                values.push(updates.description);
            }

            setClauses.push(`updated_at = NOW()`);
            values.push(id);

            const result = await database.query(
                `UPDATE groups 
                 SET ${setClauses.join(', ')} 
                 WHERE id = $${paramIndex}
                 RETURNING id, name, description, is_active as "isActive", 
                           created_by as "createdBy", created_at as "createdAt", 
                           updated_at as "updatedAt"`,
                values
            );

            if (result.rows.length === 0) {
                throw new Error('Group not found');
            }

            logger.info(`Group updated: ${id}`);
            return result.rows[0];
        } catch (error) {
            logger.error(`Error updating group ${id}:`, error);
            throw error;
        }
    }

    /**
     * Toggle group active status
     */
    async toggleActive(id: string): Promise<Group> {
        try {
            const result = await database.query(
                `UPDATE groups 
                 SET is_active = NOT is_active, updated_at = NOW()
                 WHERE id = $1
                 RETURNING id, name, description, is_active as "isActive", 
                           created_by as "createdBy", created_at as "createdAt", 
                           updated_at as "updatedAt"`,
                [id]
            );

            if (result.rows.length === 0) {
                throw new Error('Group not found');
            }

            logger.info(`Group ${id} toggled to ${result.rows[0].isActive ? 'active' : 'inactive'}`);
            return result.rows[0];
        } catch (error) {
            logger.error(`Error toggling group ${id}:`, error);
            throw error;
        }
    }

    /**
     * Delete a group
     */
    async delete(id: string): Promise<void> {
        try {
            const result = await database.query(
                `DELETE FROM groups WHERE id = $1 RETURNING id`,
                [id]
            );

            if (result.rows.length === 0) {
                throw new Error('Group not found');
            }

            logger.info(`Group deleted: ${id}`);
        } catch (error) {
            logger.error(`Error deleting group ${id}:`, error);
            throw error;
        }
    }

    /**
     * Get groups assigned to a template
     */
    async getTemplateGroups(templateId: string): Promise<Group[]> {
        try {
            const result = await database.query(
                `SELECT g.id, g.name, g.description, g.is_active as "isActive", 
                        g.created_by as "createdBy", g.created_at as "createdAt", 
                        g.updated_at as "updatedAt"
                 FROM groups g
                 JOIN template_groups tg ON g.id = tg.group_id
                 WHERE tg.template_id = $1
                 ORDER BY g.name`,
                [templateId]
            );

            return result.rows;
        } catch (error) {
            logger.error(`Error getting groups for template ${templateId}:`, error);
            throw error;
        }
    }

    /**
     * Assign groups to a template
     */
    async assignToTemplate(templateId: string, groupIds: string[], assignedBy: string): Promise<void> {
        try {
            // First, remove all existing assignments
            await database.query(
                `DELETE FROM template_groups WHERE template_id = $1`,
                [templateId]
            );

            // Then, add new assignments
            if (groupIds.length > 0) {
                const values = groupIds.map((groupId, index) =>
                    `($1, $${index + 2}, $${groupIds.length + 2})`
                ).join(', ');

                await database.query(
                    `INSERT INTO template_groups (template_id, group_id, assigned_by)
                     VALUES ${values}`,
                    [templateId, ...groupIds, assignedBy]
                );
            }

            logger.info(`Assigned ${groupIds.length} groups to template ${templateId}`);
        } catch (error) {
            logger.error(`Error assigning groups to template ${templateId}:`, error);
            throw error;
        }
    }

    /**
     * Get template count for a group
     */
    async getTemplateCount(groupId: string): Promise<number> {
        try {
            const result = await database.query(
                `SELECT COUNT(*) as count FROM template_groups WHERE group_id = $1`,
                [groupId]
            );

            return parseInt(result.rows[0].count);
        } catch (error) {
            logger.error(`Error getting template count for group ${groupId}:`, error);
            return 0;
        }
    }
}

export default new GroupService();
