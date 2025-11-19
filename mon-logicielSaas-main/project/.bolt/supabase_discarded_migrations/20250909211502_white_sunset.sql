/*
  # Fix JSONB preferences casting issues

  This migration fixes SQL errors where preferences and other JSONB columns
  are being inserted as text instead of proper JSONB values.

  1. Issues Fixed
    - Cast text values to JSONB using ::jsonb syntax
    - Add proper JSONB validation for preferences columns
    - Ensure all JSON-like values are properly typed

  2. Tables Affected
    - quiz_users (preferences column)
    - Any other tables with JSONB columns that might have similar issues

  3. Safety
    - Uses IF NOT EXISTS and safe casting
    - Validates JSON before casting
    - Provides fallback defaults for invalid JSON
*/

-- Fix any existing invalid preferences data in quiz_users
DO $$
BEGIN
  -- Update any text-based preferences to proper JSONB
  UPDATE quiz_users 
  SET preferences = CASE 
    WHEN preferences IS NULL THEN '{}'::jsonb
    WHEN jsonb_typeof(preferences) = 'object' THEN preferences
    ELSE '{}'::jsonb
  END
  WHERE preferences IS NULL OR jsonb_typeof(preferences) != 'object';
  
  RAISE NOTICE 'Fixed preferences column data types in quiz_users table';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error fixing preferences data: %', SQLERRM;
END $$;

-- Add a function to safely cast text to JSONB
CREATE OR REPLACE FUNCTION safe_text_to_jsonb(input_text TEXT)
RETURNS JSONB AS $$
BEGIN
  IF input_text IS NULL OR input_text = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  
  BEGIN
    RETURN input_text::jsonb;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN '{}'::jsonb;
  END;
END;
$$ LANGUAGE plpgsql;

-- Add a constraint to ensure preferences is always valid JSONB
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints 
    WHERE constraint_name = 'quiz_users_preferences_valid_json'
  ) THEN
    ALTER TABLE quiz_users 
    ADD CONSTRAINT quiz_users_preferences_valid_json 
    CHECK (jsonb_typeof(preferences) = 'object' OR preferences IS NULL);
  END IF;
END $$;

-- Ensure default value for preferences is proper JSONB
ALTER TABLE quiz_users 
ALTER COLUMN preferences SET DEFAULT '{}'::jsonb;

-- Add similar fixes for other tables with JSONB columns if they exist
DO $$
BEGIN
  -- Fix campaigns table variables column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'campaigns' AND column_name = 'variables'
  ) THEN
    UPDATE campaigns 
    SET variables = CASE 
      WHEN variables IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(variables) = 'object' THEN variables
      ELSE '{}'::jsonb
    END
    WHERE variables IS NULL OR jsonb_typeof(variables) != 'object';
    
    ALTER TABLE campaigns 
    ALTER COLUMN variables SET DEFAULT '{}'::jsonb;
    
    RAISE NOTICE 'Fixed variables column in campaigns table';
  END IF;
  
  -- Fix scheduled_messages table variables column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'scheduled_messages' AND column_name = 'variables'
  ) THEN
    UPDATE scheduled_messages 
    SET variables = CASE 
      WHEN variables IS NULL THEN '{}'::jsonb
      WHEN jsonb_typeof(variables) = 'object' THEN variables
      ELSE '{}'::jsonb
    END
    WHERE variables IS NULL OR jsonb_typeof(variables) != 'object';
    
    ALTER TABLE scheduled_messages 
    ALTER COLUMN variables SET DEFAULT '{}'::jsonb;
    
    RAISE NOTICE 'Fixed variables column in scheduled_messages table';
  END IF;
  
  -- Fix user_whatsapp_config table rate_limit column if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_whatsapp_config' AND column_name = 'rate_limit'
  ) THEN
    UPDATE user_whatsapp_config 
    SET rate_limit = CASE 
      WHEN rate_limit IS NULL THEN '{"enabled": true, "max_per_hour": 60, "cooldown_minutes": 15}'::jsonb
      WHEN jsonb_typeof(rate_limit) = 'object' THEN rate_limit
      ELSE '{"enabled": true, "max_per_hour": 60, "cooldown_minutes": 15}'::jsonb
    END
    WHERE rate_limit IS NULL OR jsonb_typeof(rate_limit) != 'object';
    
    RAISE NOTICE 'Fixed rate_limit column in user_whatsapp_config table';
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Error fixing JSONB columns: %', SQLERRM;
END $$;

-- Create a trigger to validate JSONB inserts/updates
CREATE OR REPLACE FUNCTION validate_jsonb_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate preferences column if it exists
  IF TG_TABLE_NAME = 'quiz_users' AND NEW.preferences IS NOT NULL THEN
    IF jsonb_typeof(NEW.preferences) != 'object' THEN
      NEW.preferences := '{}'::jsonb;
    END IF;
  END IF;
  
  -- Validate variables column for campaigns
  IF TG_TABLE_NAME = 'campaigns' AND NEW.variables IS NOT NULL THEN
    IF jsonb_typeof(NEW.variables) != 'object' THEN
      NEW.variables := '{}'::jsonb;
    END IF;
  END IF;
  
  -- Validate variables column for scheduled_messages
  IF TG_TABLE_NAME = 'scheduled_messages' AND NEW.variables IS NOT NULL THEN
    IF jsonb_typeof(NEW.variables) != 'object' THEN
      NEW.variables := '{}'::jsonb;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to relevant tables
DO $$
BEGIN
  -- Drop existing triggers if they exist
  DROP TRIGGER IF EXISTS validate_jsonb_quiz_users ON quiz_users;
  DROP TRIGGER IF EXISTS validate_jsonb_campaigns ON campaigns;
  DROP TRIGGER IF EXISTS validate_jsonb_scheduled_messages ON scheduled_messages;
  
  -- Create new triggers
  CREATE TRIGGER validate_jsonb_quiz_users
    BEFORE INSERT OR UPDATE ON quiz_users
    FOR EACH ROW EXECUTE FUNCTION validate_jsonb_columns();
    
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'campaigns') THEN
    CREATE TRIGGER validate_jsonb_campaigns
      BEFORE INSERT OR UPDATE ON campaigns
      FOR EACH ROW EXECUTE FUNCTION validate_jsonb_columns();
  END IF;
  
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'scheduled_messages') THEN
    CREATE TRIGGER validate_jsonb_scheduled_messages
      BEFORE INSERT OR UPDATE ON scheduled_messages
      FOR EACH ROW EXECUTE FUNCTION validate_jsonb_columns();
  END IF;
  
  RAISE NOTICE 'JSONB validation triggers created successfully';
END $$;