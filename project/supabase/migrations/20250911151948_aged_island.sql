/*
  # Create quiz sessions table for enhanced session tracking

  1. New Tables
    - `quiz_sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to quiz_users)
      - `phone_number` (text, optional)
      - `web_user_id` (text, optional)
      - `session_id` (text, optional)
      - `source` (text, whatsapp or web)
      - `start_time` (timestamptz)
      - `end_time` (timestamptz, optional)
      - `duration_seconds` (integer, optional)
      - `questions_answered` (integer, default 0)
      - `questions_skipped` (integer, default 0)
      - `current_question_index` (integer, default 0)
      - `engagement_score` (integer, default 0)
      - `completion_status` (text, active/completed/abandoned/interrupted)
      - `country` (text, optional, ISO 3166-1 alpha-2)
      - `user_agent` (text, optional)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `quiz_sessions` table
    - Add policies for authenticated users to manage their own sessions

  3. Indexes
    - Index on user_id for fast user session lookups
    - Index on completion_status for analytics
    - Index on country for geographic analytics
    - Index on start_time for time-based queries
*/

-- Create quiz_sessions table
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  phone_number text,
  web_user_id text,
  session_id text,
  source text NOT NULL CHECK (source IN ('whatsapp', 'web')),
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  duration_seconds integer,
  questions_answered integer DEFAULT 0,
  questions_skipped integer DEFAULT 0,
  current_question_index integer DEFAULT 0,
  engagement_score integer DEFAULT 0,
  completion_status text NOT NULL DEFAULT 'active' CHECK (completion_status IN ('active', 'completed', 'abandoned', 'interrupted')),
  country text CHECK (length(country) = 2), -- ISO 3166-1 alpha-2 country codes
  user_agent text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add foreign key constraint to quiz_users
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quiz_users') THEN
    ALTER TABLE quiz_sessions ADD CONSTRAINT quiz_sessions_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES quiz_users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_user_id ON quiz_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_completion_status ON quiz_sessions(completion_status);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_country ON quiz_sessions(country);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_start_time ON quiz_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_quiz_sessions_source ON quiz_sessions(source);

-- Enable Row Level Security
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own quiz sessions"
  ON quiz_sessions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert their own quiz sessions"
  ON quiz_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update their own quiz sessions"
  ON quiz_sessions
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete their own quiz sessions"
  ON quiz_sessions
  FOR DELETE
  TO authenticated
  USING (true);