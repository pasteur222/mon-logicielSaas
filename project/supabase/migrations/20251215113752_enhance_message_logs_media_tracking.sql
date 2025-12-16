/*
  # Enhance Message Logs for Media Tracking

  1. Changes
    - Ensure metadata column exists for tracking media information
    - Add indexes for efficient querying of media messages
    - Add index on created_at for time-based queries
    - Add index on status for filtering by message status
    - Add GIN index on metadata for JSONB queries

  2. Purpose
    - Enable efficient tracking of media messages
    - Support analytics on media vs text messages
    - Improve query performance for message logs
    - Enable debugging of media delivery issues

  3. Media Tracking Structure
    metadata JSON will contain:
    - has_media: boolean
    - media_type: 'image' | 'video' | 'document'
    - media_url: string
    - timestamp: ISO timestamp
*/

-- Ensure metadata column exists (already added in previous migration, but safe to check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_logs'
    AND column_name = 'metadata'
  ) THEN
    ALTER TABLE message_logs ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;

-- Add index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_message_logs_created_at
  ON message_logs(created_at DESC);

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_message_logs_status
  ON message_logs(status);

-- Add index on phone_number for user queries
CREATE INDEX IF NOT EXISTS idx_message_logs_phone_number
  ON message_logs(phone_number);

-- Add GIN index on metadata for JSONB queries (e.g., filtering by media type)
CREATE INDEX IF NOT EXISTS idx_message_logs_metadata
  ON message_logs USING GIN (metadata);

-- Add composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_message_logs_status_created_at
  ON message_logs(status, created_at DESC);

-- Add comment explaining the metadata structure
COMMENT ON COLUMN message_logs.metadata IS 'JSONB field storing additional message information including: has_media (boolean), media_type (string), media_url (string), timestamp (ISO string)';

-- Create a view for easy media message analysis
CREATE OR REPLACE VIEW message_logs_with_media AS
SELECT
  id,
  status,
  phone_number,
  message_preview,
  message_id,
  error,
  created_at,
  updated_at,
  (metadata->>'has_media')::boolean as has_media,
  metadata->>'media_type' as media_type,
  metadata->>'media_url' as media_url
FROM message_logs;

-- Grant access to the view
GRANT SELECT ON message_logs_with_media TO authenticated;

-- Create a function to get media statistics
CREATE OR REPLACE FUNCTION get_media_message_stats(
  start_date timestamptz DEFAULT NOW() - INTERVAL '30 days',
  end_date timestamptz DEFAULT NOW()
)
RETURNS TABLE (
  total_messages bigint,
  messages_with_media bigint,
  images_sent bigint,
  videos_sent bigint,
  documents_sent bigint,
  success_rate numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_messages,
    COUNT(*) FILTER (WHERE (metadata->>'has_media')::boolean = true) as messages_with_media,
    COUNT(*) FILTER (WHERE metadata->>'media_type' = 'image') as images_sent,
    COUNT(*) FILTER (WHERE metadata->>'media_type' = 'video') as videos_sent,
    COUNT(*) FILTER (WHERE metadata->>'media_type' = 'document') as documents_sent,
    ROUND(
      (COUNT(*) FILTER (WHERE status = 'sent')::numeric / NULLIF(COUNT(*), 0)) * 100,
      2
    ) as success_rate
  FROM message_logs
  WHERE created_at >= start_date
    AND created_at <= end_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission on the function
GRANT EXECUTE ON FUNCTION get_media_message_stats TO authenticated;