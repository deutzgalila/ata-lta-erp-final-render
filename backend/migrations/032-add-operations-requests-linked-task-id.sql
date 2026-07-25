ALTER TABLE operations_requests ADD COLUMN IF NOT EXISTS linked_task_id UUID;
ALTER TABLE operations_requests DROP CONSTRAINT IF EXISTS operations_requests_linked_task_id_fkey;
ALTER TABLE operations_requests ADD CONSTRAINT operations_requests_linked_task_id_fkey FOREIGN KEY (linked_task_id) REFERENCES tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_operations_requests_linked_task_id ON operations_requests(linked_task_id);
