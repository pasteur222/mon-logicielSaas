/*
  # Create Quiz Marketing Tables

  1. New Tables
    - `quiz_users`
      - `id` (uuid, primary key)
      - `phone_number` (text, unique)
      - `name` (text, optional)
      - `email` (text, optional)
      - `address` (text, optional)
      - `profession` (text, optional)
      - `preferences` (jsonb, optional)
      - `score` (integer, default 0)
      - `profile` (text, default 'discovery')
      - `current_step` (integer, default 0)
      - `status` (text, default 'active')
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

    - `quiz_answers`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to quiz_users)
      - `question_id` (uuid, foreign key to quiz_questions)
      - `answer` (text)
      - `points_awarded` (integer, default 0)
      - `created_at` (timestamp)

  2. Table Updates
    - Add `order_index` column to `quiz_questions`
    - Add `correct_answer` column to `quiz_questions` if missing

  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create quiz_users table
CREATE TABLE IF NOT EXISTS quiz_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text UNIQUE NOT NULL,
  name text,
  email text,
  address text,
  profession text,
  preferences jsonb DEFAULT '{}',
  score integer DEFAULT 0,
  profile text DEFAULT 'discovery',
  current_step integer DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create quiz_answers table
CREATE TABLE IF NOT EXISTS quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  question_id uuid NOT NULL,
  answer text NOT NULL,
  points_awarded integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Add missing columns to quiz_questions if they don't exist
DO $$
BEGIN
  -- Add order_index column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_questions' AND column_name = 'order_index'
  ) THEN
    ALTER TABLE quiz_questions ADD COLUMN order_index integer DEFAULT 0;
  END IF;

  -- Add correct_answer column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_questions' AND column_name = 'correct_answer'
  ) THEN
    ALTER TABLE quiz_questions ADD COLUMN correct_answer boolean DEFAULT true;
  END IF;
END $$;

-- Add foreign key constraints
ALTER TABLE quiz_answers 
ADD CONSTRAINT quiz_answers_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES quiz_users(id) ON DELETE CASCADE;

ALTER TABLE quiz_answers 
ADD CONSTRAINT quiz_answers_question_id_fkey 
FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE;

-- Enable RLS
ALTER TABLE quiz_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;

-- Create policies for quiz_users
CREATE POLICY "Allow read access to quiz users"
  ON quiz_users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow insert to quiz users"
  ON quiz_users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update to quiz users"
  ON quiz_users
  FOR UPDATE
  TO authenticated
  USING (true);

-- Create policies for quiz_answers
CREATE POLICY "Allow read access to quiz answers"
  ON quiz_answers
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow insert to quiz answers"
  ON quiz_answers
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quiz_users_phone ON quiz_users(phone_number);
CREATE INDEX IF NOT EXISTS idx_quiz_users_status ON quiz_users(status);
CREATE INDEX IF NOT EXISTS idx_quiz_users_profile ON quiz_users(profile);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_user ON quiz_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_question ON quiz_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_order ON quiz_questions(order_index);

-- Update existing quiz_questions to have proper order_index values
UPDATE quiz_questions 
SET order_index = (
  SELECT ROW_NUMBER() OVER (ORDER BY created_at) - 1
  FROM quiz_questions q2 
  WHERE q2.id = quiz_questions.id
)
WHERE order_index IS NULL OR order_index = 0;