-- Add s3_key column to s3_updates table
-- This column stores the actual S3 object key, separate from the display name (file_name)

USE flonics_dashboard;

-- Add s3_key column if it doesn't exist
ALTER TABLE s3_updates 
ADD COLUMN IF NOT EXISTS s3_key VARCHAR(500) DEFAULT NULL COMMENT 'Actual S3 object key for download';

-- For existing records, copy file_name to s3_key as initial value
UPDATE s3_updates 
SET s3_key = file_name 
WHERE s3_key IS NULL;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_s3_key ON s3_updates(s3_key);
