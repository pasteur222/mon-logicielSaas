/*
  # Create question engagement tracking table

  1. New Tables
    - `question_engagement`
      - `id` (uuid, primary key)
      - `session_id` (uuid, foreign key to quiz_sessions)
      - `question_id` (uuid, foreign key to quiz_questions)
      - `question_index` (integer)
      - `time_spent_seconds` (integer)
      - `attempts` (integer, default 1)
      - `skipped` (boolean, default false)
      - `answered_at` (timestamptz, optional)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `question_engagement` table
    - Add policies for authenticated users to view engagement data

  3. Indexes
    - Index on session_id for session analytics
    - Index on question_id for question analytics
    - Index on question_index for drop-off analysis
*/

-- Create question_engagement table
CREATE TABLE IF NOT EXISTS question_engagement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  question_id uuid NOT NULL,
  question_index integer NOT NULL,
  time_spent_seconds integer NOT NULL DEFAULT 0,
  attempts integer DEFAULT 1,
  skipped boolean DEFAULT false,
  answered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Add foreign key constraints
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quiz_sessions') THEN
    ALTER TABLE question_engagement ADD CONSTRAINT question_engagement_session_id_fkey 
    FOREIGN KEY (session_id) REFERENCES quiz_sessions(id) ON DELETE CASCADE;
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'quiz_questions') THEN
    ALTER TABLE question_engagement ADD CONSTRAINT question_engagement_question_id_fkey 
    FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_question_engagement_session_id ON question_engagement(session_id);
CREATE INDEX IF NOT EXISTS idx_question_engagement_question_id ON question_engagement(question_id);
CREATE INDEX IF NOT EXISTS idx_question_engagement_question_index ON question_engagement(question_index);
CREATE INDEX IF NOT EXISTS idx_question_engagement_time_spent ON question_engagement(time_spent_seconds);

-- Enable Row Level Security
ALTER TABLE question_engagement ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view question engagement data"
  ON question_engagement
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert question engagement data"
  ON question_engagement
  FOR INSERT
  TO authenticated
  WITH CHECK (true);