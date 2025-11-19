/*
  # Enhance quiz_users table with new fields

  1. New Columns
    - `country` (text, optional) - ISO 3166-1 alpha-2 country code
    - `web_user_id` (text, optional) - For web-based quiz participants
    - `last_session_at` (timestamptz) - Track last activity
    - `total_sessions` (integer) - Count of quiz sessions
    - `engagement_level` (text) - low/medium/high based on activity

  2. Indexes
    - Index on country for geographic analytics
    - Index on web_user_id for web user lookups
    - Index on engagement_level for segmentation
*/

-- Add new columns to quiz_users table if they don't exist
DO $$
BEGIN
  -- Add country column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_users' AND column_name = 'country'
  ) THEN
    ALTER TABLE quiz_users ADD COLUMN country text CHECK (length(country) = 2);
  END IF;

  -- Add web_user_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_users' AND column_name = 'web_user_id'
  ) THEN
    ALTER TABLE quiz_users ADD COLUMN web_user_id text;
  END IF;

  -- Add last_session_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_users' AND column_name = 'last_session_at'
  ) THEN
    ALTER TABLE quiz_users ADD COLUMN last_session_at timestamptz;
  END IF;

  -- Add total_sessions column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_users' AND column_name = 'total_sessions'
  ) THEN
    ALTER TABLE quiz_users ADD COLUMN total_sessions integer DEFAULT 0;
  END IF;

  -- Add engagement_level column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_users' AND column_name = 'engagement_level'
  ) THEN
    ALTER TABLE quiz_users ADD COLUMN engagement_level text DEFAULT 'low' CHECK (engagement_level IN ('low', 'medium', 'high'));
  END IF;
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_quiz_users_country ON quiz_users(country);
CREATE INDEX IF NOT EXISTS idx_quiz_users_web_user_id ON quiz_users(web_user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_users_last_session_at ON quiz_users(last_session_at);
CREATE INDEX IF NOT EXISTS idx_quiz_users_engagement_level ON quiz_users(engagement_level);

-- Add unique constraint for web_user_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'quiz_users' AND constraint_name = 'quiz_users_web_user_id_key'
  ) THEN
    ALTER TABLE quiz_users ADD CONSTRAINT quiz_users_web_user_id_key UNIQUE (web_user_id);
  END IF;
END $$;

-- Function to update engagement level based on activity
CREATE OR REPLACE FUNCTION update_user_engagement_level()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate engagement level based on score and sessions
  IF NEW.total_sessions >= 5 AND NEW.score >= 50 THEN
    NEW.engagement_level = 'high';
  ELSIF NEW.total_sessions >= 2 OR NEW.score >= 20 THEN
    NEW.engagement_level = 'medium';
  ELSE
    NEW.engagement_level = 'low';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update engagement level
DROP TRIGGER IF EXISTS update_engagement_level_trigger ON quiz_users;
CREATE TRIGGER update_engagement_level_trigger
  BEFORE UPDATE ON quiz_users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_engagement_level();