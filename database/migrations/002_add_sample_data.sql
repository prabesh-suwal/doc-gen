-- Migration: Add sample_data column to templates table
-- Date: 2025-12-28

ALTER TABLE templates ADD COLUMN IF NOT EXISTS sample_data TEXT;

COMMENT ON COLUMN templates.sample_data IS 'Sample JSON data used with this template (stored as stringified JSON for reference)';
