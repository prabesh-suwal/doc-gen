-- Migration: Add Groups System
-- This migration creates the groups table and template_groups junction table
-- for many-to-many relationships between templates and groups

-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for groups
CREATE INDEX IF NOT EXISTS idx_groups_name ON groups(name);
CREATE INDEX IF NOT EXISTS idx_groups_active ON groups(is_active);

-- Create junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS template_groups (
    template_id UUID REFERENCES templates(id) ON DELETE CASCADE,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    PRIMARY KEY (template_id, group_id)
);

-- Create indexes for junction table
CREATE INDEX IF NOT EXISTS idx_template_groups_template ON template_groups(template_id);
CREATE INDEX IF NOT EXISTS idx_template_groups_group ON template_groups(group_id);

-- Migrate existing group_name data to new structure
-- First, create groups from distinct group names
INSERT INTO groups (name, is_active, created_at)
SELECT DISTINCT group_name, true, NOW()
FROM templates
WHERE group_name IS NOT NULL AND group_name != ''
ON CONFLICT (name) DO NOTHING;

-- Then, create template-group relationships
INSERT INTO template_groups (template_id, group_id, assigned_at)
SELECT t.id, g.id, t.created_at
FROM templates t
JOIN groups g ON t.group_name = g.name
WHERE t.group_name IS NOT NULL AND t.group_name != ''
ON CONFLICT DO NOTHING;

-- Drop the old group_name column
ALTER TABLE templates DROP COLUMN IF EXISTS group_name;
