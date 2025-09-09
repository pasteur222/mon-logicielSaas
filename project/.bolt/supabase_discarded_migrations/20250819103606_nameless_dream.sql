/*
  # Fix Quiz Foreign Key Constraints
  
  1. Changes
    - Update quiz_answers table to use uuid for question_id
    - Update quiz_users table to use proper foreign key types
    - Ensure all foreign key relationships are properly aligned
  
  2. Security
    - Maintain existing RLS policies
*/

-- First, check if quiz_questions table exists and get its id column type
DO $$
BEGIN
  -- Check if quiz_questions table exists
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'quiz_questions'
  ) THEN
    -- Check the current type of the id column in quiz_questions
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'quiz_questions' 
      AND column_name = 'id' 
      AND data_type = 'integer'
    ) THEN
      -- Change quiz_questions.id from integer to uuid
      ALTER TABLE quiz_questions ALTER COLUMN id SET DATA TYPE uuid USING gen_random_uuid();
      ALTER TABLE quiz_questions ALTER COLUMN id SET DEFAULT gen_random_uuid();
    END IF;
  ELSE
    -- Create quiz_questions table with uuid id
    CREATE TABLE quiz_questions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      text text NOT NULL,
      type text NOT NULL DEFAULT 'personal',
      options jsonb,
      points jsonb,
      required boolean DEFAULT true,
      order_index integer DEFAULT 0,
      created_at timestamptz DEFAULT now()
    );
    
    -- Enable RLS
    ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
    CREATE POLICY "Allow read access to quiz questions"
      ON quiz_questions
      FOR SELECT
      TO authenticated
      USING (true);

    CREATE POLICY "Allow insert to quiz questions"
      ON quiz_questions
      FOR INSERT
      TO authenticated
      WITH CHECK (true);

    CREATE POLICY "Allow update to quiz questions"
      ON quiz_questions
      FOR UPDATE
      TO authenticated
      USING (true);

    CREATE POLICY "Allow delete to quiz questions"
      ON quiz_questions
      FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Create or update quiz_users table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'quiz_users'
  ) THEN
    CREATE TABLE quiz_users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_number text NOT NULL UNIQUE,
      name text,
      email text,
      address text,
      profession text,
      preferences jsonb,
      score integer DEFAULT 0,
      profile text DEFAULT 'discovery',
      current_step integer DEFAULT 0,
      status text DEFAULT 'active' CHECK (status IN ('active', 'ended', 'completed')),
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
    
    -- Enable RLS
    ALTER TABLE quiz_users ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
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
  END IF;
END $$;

-- Create or update quiz_answers table with proper foreign key types
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'quiz_answers'
  ) THEN
    -- Drop existing foreign key constraints
    ALTER TABLE quiz_answers DROP CONSTRAINT IF EXISTS quiz_answers_question_id_fkey;
    ALTER TABLE quiz_answers DROP CONSTRAINT IF EXISTS quiz_answers_user_id_fkey;
    
    -- Update column types to match referenced tables
    ALTER TABLE quiz_answers ALTER COLUMN question_id SET DATA TYPE uuid USING gen_random_uuid();
    ALTER TABLE quiz_answers ALTER COLUMN user_id SET DATA TYPE uuid USING gen_random_uuid();
  ELSE
    -- Create quiz_answers table with correct types
    CREATE TABLE quiz_answers (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL,
      question_id uuid NOT NULL,
      answer text NOT NULL,
      points_awarded integer DEFAULT 0,
      created_at timestamptz DEFAULT now()
    );
    
    -- Enable RLS
    ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;
    
    -- Create policies
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
  END IF;
  
  -- Add foreign key constraints with correct types
  ALTER TABLE quiz_answers 
    ADD CONSTRAINT quiz_answers_question_id_fkey 
    FOREIGN KEY (question_id) REFERENCES quiz_questions(id);
    
  ALTER TABLE quiz_answers 
    ADD CONSTRAINT quiz_answers_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES quiz_users(id);
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_quiz_answers_user_id ON quiz_answers(user_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_question_id ON quiz_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_users_phone_number ON quiz_users(phone_number);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_order_index ON quiz_questions(order_index);