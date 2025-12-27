-- Restore dual storage system: files + database
-- This migration restores the foreign key constraint and prepares for dual storage

-- Step 1: Change template_id back to UUID type
ALTER TABLE render_history ALTER COLUMN template_id TYPE UUID USING template_id::uuid;

-- Step 2: Add the foreign key constraint back
ALTER TABLE render_history 
ADD CONSTRAINT render_history_template_id_fkey 
FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL;

-- Step 3: Update the comment
COMMENT ON COLUMN render_history.template_id IS 'Foreign key to templates table (NULL for one-time renders)';

-- Success message
SELECT 'Foreign key constraint restored successfully!' as status;
