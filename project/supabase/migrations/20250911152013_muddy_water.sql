/*
  # Enhance quiz_questions table with new features

  1. New Columns
    - `conditional_logic` (jsonb, optional) - For conditional question display
    - `engagement_metrics` (jsonb, optional) - Track question-specific metrics

  2. New Question Types
    - Add 'product_test' to existing type check constraint

  3. Indexes
    - Index on conditional_logic for conditional question queries
    - Index on type for question type filtering
*/

-- Add new columns to quiz_questions table if they don't exist
DO $$
BEGIN
  -- Add conditional_logic column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_questions' AND column_name = 'conditional_logic'
  ) THEN
    ALTER TABLE quiz_questions ADD COLUMN conditional_logic jsonb;
  END IF;

  -- Add engagement_metrics column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_questions' AND column_name = 'engagement_metrics'
  ) THEN
    ALTER TABLE quiz_questions ADD COLUMN engagement_metrics jsonb DEFAULT '{}';
  END IF;
END $$;

-- Update the type constraint to include product_test
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_name = 'quiz_questions' AND constraint_name = 'quiz_questions_type_check'
  ) THEN
    ALTER TABLE quiz_questions DROP CONSTRAINT quiz_questions_type_check;
  END IF;

  -- Add new constraint with product_test type
  ALTER TABLE quiz_questions ADD CONSTRAINT quiz_questions_type_check 
  CHECK (type IN ('personal', 'preference', 'quiz', 'product_test'));
END $$;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_quiz_questions_conditional_logic ON quiz_questions USING GIN (conditional_logic);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_type ON quiz_questions(type);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_category ON quiz_questions(category);

-- Add validation function for conditional logic
CREATE OR REPLACE FUNCTION validate_conditional_logic()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate conditional logic structure if present
  IF NEW.conditional_logic IS NOT NULL THEN
    -- Check if show_if exists and has required fields
    IF NEW.conditional_logic ? 'show_if' THEN
      IF NOT (NEW.conditional_logic->'show_if' ? 'question_id') THEN
        RAISE EXCEPTION 'Conditional logic show_if must include question_id';
      END IF;
      
      IF NOT (NEW.conditional_logic->'show_if' ? 'answer_value') THEN
        RAISE EXCEPTION 'Conditional logic show_if must include answer_value';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for conditional logic validation
DROP TRIGGER IF EXISTS validate_conditional_logic_trigger ON quiz_questions;
CREATE TRIGGER validate_conditional_logic_trigger
  BEFORE INSERT OR UPDATE ON quiz_questions
  FOR EACH ROW
  EXECUTE FUNCTION validate_conditional_logic();