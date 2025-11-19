/*
  # Fix Quiz Users Preferences Column Type Issue

  1. Problem Analysis
    - The `preferences` column in `quiz_users` table is defined as `jsonb`
    - Some code is trying to insert text values instead of JSON objects
    - This causes a type mismatch error: "column preferences is of type jsonb but expression is of type text"

  2. Solution
    - Add a function to safely handle preferences data conversion
    - Update any existing text preferences to proper JSON format
    - Add constraints to ensure data integrity

  3. Security
    - Maintain existing RLS policies
    - Ensure data consistency
*/

-- Create a function to safely convert text preferences to jsonb
CREATE OR REPLACE FUNCTION safe_preferences_to_jsonb(input_text text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
BEGIN
  -- If input is null or empty, return empty object
  IF input_text IS NULL OR input_text = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  
  -- Try to parse as JSON
  BEGIN
    RETURN input_text::jsonb;
  EXCEPTION WHEN OTHERS THEN
    -- If parsing fails, wrap the text in a JSON object
    RETURN jsonb_build_object('raw_text', input_text);
  END;
END;
$$;

-- Update any existing preferences that might be stored as text
UPDATE quiz_users 
SET preferences = safe_preferences_to_jsonb(preferences::text)
WHERE preferences IS NOT NULL;

-- Add a constraint to ensure preferences is always valid JSON
DO $$
BEGIN
  -- Add check constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'quiz_users_preferences_valid_json'
    AND conrelid = 'quiz_users'::regclass
  ) THEN
    ALTER TABLE quiz_users 
    ADD CONSTRAINT quiz_users_preferences_valid_json 
    CHECK (preferences IS NULL OR jsonb_typeof(preferences) = 'object');
  END IF;
END $$;

-- Create a trigger function to automatically handle preferences conversion
CREATE OR REPLACE FUNCTION ensure_preferences_jsonb()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure preferences is always a valid JSON object
  IF NEW.preferences IS NOT NULL THEN
    -- If it's already jsonb, keep it as is
    IF jsonb_typeof(NEW.preferences) != 'object' THEN
      NEW.preferences = '{}'::jsonb;
    END IF;
  ELSE
    -- Set default empty object if null
    NEW.preferences = '{}'::jsonb;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'ensure_preferences_jsonb_trigger'
    AND tgrelid = 'quiz_users'::regclass
  ) THEN
    CREATE TRIGGER ensure_preferences_jsonb_trigger
      BEFORE INSERT OR UPDATE ON quiz_users
      FOR EACH ROW
      EXECUTE FUNCTION ensure_preferences_jsonb();
  END IF;
END $$;

-- Update the default value for preferences column to ensure it's always jsonb
ALTER TABLE quiz_users 
ALTER COLUMN preferences SET DEFAULT '{}'::jsonb;

-- Clean up the helper function as it's no longer needed after migration
DROP FUNCTION IF EXISTS safe_preferences_to_jsonb(text);

-- Add comment to document the fix
COMMENT ON COLUMN quiz_users.preferences IS 'User preferences stored as JSON object. Always defaults to empty object if null.';