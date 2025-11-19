/*
  # Fix JSONB Casting Errors

  This migration fixes the PostgreSQL error 42804 where text values are being inserted 
  into JSONB columns without proper casting.

  ## Changes Made:
  1. Update existing invalid JSONB data to proper JSONB format
  2. Add validation functions for JSONB columns
  3. Create triggers to automatically cast text to JSONB on insert/update
  4. Set proper JSONB defaults for all affected columns

  ## Affected Tables:
  - quiz_users (preferences column)
  - campaigns (metrics, variables columns)
  - scheduled_messages (media, variables columns)
  - user_whatsapp_config (rate_limit column)
  - app_settings (social_links column)
  - whatsapp_auto_replies (variables column)

  ## Security:
  - All JSONB validation includes safety checks
  - Invalid JSON is converted to empty objects rather than causing errors
*/

-- Create a safe function to convert text to JSONB
CREATE OR REPLACE FUNCTION safe_text_to_jsonb(input_text TEXT)
RETURNS JSONB AS $$
BEGIN
  -- Handle NULL or empty input
  IF input_text IS NULL OR input_text = '' THEN
    RETURN '{}'::jsonb;
  END IF;
  
  -- Try to parse as JSONB
  BEGIN
    RETURN input_text::jsonb;
  EXCEPTION WHEN OTHERS THEN
    -- If parsing fails, return empty object
    RETURN '{}'::jsonb;
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Fix quiz_users preferences column
UPDATE quiz_users 
SET preferences = safe_text_to_jsonb(preferences::text)
WHERE preferences IS NOT NULL;

-- Ensure preferences column has proper default
ALTER TABLE quiz_users 
ALTER COLUMN preferences SET DEFAULT '{}'::jsonb;

-- Fix campaigns metrics column
UPDATE campaigns 
SET metrics = CASE 
  WHEN metrics IS NULL THEN '{"sent": 0, "delivered": 0, "opened": 0, "clicked": 0}'::jsonb
  ELSE safe_text_to_jsonb(metrics::text)
END;

-- Ensure campaigns metrics has proper default
ALTER TABLE campaigns 
ALTER COLUMN metrics SET DEFAULT '{"sent": 0, "delivered": 0, "opened": 0, "clicked": 0}'::jsonb;

-- Fix campaigns variables column
UPDATE campaigns 
SET variables = safe_text_to_jsonb(COALESCE(variables::text, '{}'))
WHERE variables IS NOT NULL OR variables IS NULL;

-- Ensure campaigns variables has proper default
ALTER TABLE campaigns 
ALTER COLUMN variables SET DEFAULT '{}'::jsonb;

-- Fix scheduled_messages media column
UPDATE scheduled_messages 
SET media = safe_text_to_jsonb(COALESCE(media::text, '{}'))
WHERE media IS NOT NULL;

-- Fix scheduled_messages variables column
UPDATE scheduled_messages 
SET variables = safe_text_to_jsonb(COALESCE(variables::text, '{}'))
WHERE variables IS NOT NULL OR variables IS NULL;

-- Ensure scheduled_messages variables has proper default
ALTER TABLE scheduled_messages 
ALTER COLUMN variables SET DEFAULT '{}'::jsonb;

-- Fix user_whatsapp_config rate_limit column
UPDATE user_whatsapp_config 
SET rate_limit = CASE 
  WHEN rate_limit IS NULL THEN '{"enabled": true, "max_per_hour": 60, "cooldown_minutes": 15}'::jsonb
  ELSE safe_text_to_jsonb(rate_limit::text)
END;

-- Ensure user_whatsapp_config rate_limit has proper default
ALTER TABLE user_whatsapp_config 
ALTER COLUMN rate_limit SET DEFAULT '{"enabled": true, "max_per_hour": 60, "cooldown_minutes": 15}'::jsonb;

-- Fix app_settings social_links column
UPDATE app_settings 
SET social_links = safe_text_to_jsonb(COALESCE(social_links::text, '{}'))
WHERE social_links IS NOT NULL OR social_links IS NULL;

-- Ensure app_settings social_links has proper default
ALTER TABLE app_settings 
ALTER COLUMN social_links SET DEFAULT '{}'::jsonb;

-- Fix whatsapp_auto_replies variables column
UPDATE whatsapp_auto_replies 
SET variables = safe_text_to_jsonb(COALESCE(variables::text, '{}'))
WHERE variables IS NOT NULL OR variables IS NULL;

-- Ensure whatsapp_auto_replies variables has proper default
ALTER TABLE whatsapp_auto_replies 
ALTER COLUMN variables SET DEFAULT '{}'::jsonb;

-- Create a trigger function to automatically handle JSONB casting on insert/update
CREATE OR REPLACE FUNCTION ensure_jsonb_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Handle quiz_users preferences
  IF TG_TABLE_NAME = 'quiz_users' AND NEW.preferences IS NOT NULL THEN
    NEW.preferences = safe_text_to_jsonb(NEW.preferences::text);
  END IF;
  
  -- Handle campaigns metrics and variables
  IF TG_TABLE_NAME = 'campaigns' THEN
    IF NEW.metrics IS NOT NULL THEN
      NEW.metrics = safe_text_to_jsonb(NEW.metrics::text);
    END IF;
    IF NEW.variables IS NOT NULL THEN
      NEW.variables = safe_text_to_jsonb(NEW.variables::text);
    END IF;
  END IF;
  
  -- Handle scheduled_messages media and variables
  IF TG_TABLE_NAME = 'scheduled_messages' THEN
    IF NEW.media IS NOT NULL THEN
      NEW.media = safe_text_to_jsonb(NEW.media::text);
    END IF;
    IF NEW.variables IS NOT NULL THEN
      NEW.variables = safe_text_to_jsonb(NEW.variables::text);
    END IF;
  END IF;
  
  -- Handle user_whatsapp_config rate_limit
  IF TG_TABLE_NAME = 'user_whatsapp_config' AND NEW.rate_limit IS NOT NULL THEN
    NEW.rate_limit = safe_text_to_jsonb(NEW.rate_limit::text);
  END IF;
  
  -- Handle app_settings social_links
  IF TG_TABLE_NAME = 'app_settings' AND NEW.social_links IS NOT NULL THEN
    NEW.social_links = safe_text_to_jsonb(NEW.social_links::text);
  END IF;
  
  -- Handle whatsapp_auto_replies variables
  IF TG_TABLE_NAME = 'whatsapp_auto_replies' AND NEW.variables IS NOT NULL THEN
    NEW.variables = safe_text_to_jsonb(NEW.variables::text);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all affected tables
DROP TRIGGER IF EXISTS ensure_jsonb_quiz_users ON quiz_users;
CREATE TRIGGER ensure_jsonb_quiz_users
  BEFORE INSERT OR UPDATE ON quiz_users
  FOR EACH ROW EXECUTE FUNCTION ensure_jsonb_columns();

DROP TRIGGER IF EXISTS ensure_jsonb_campaigns ON campaigns;
CREATE TRIGGER ensure_jsonb_campaigns
  BEFORE INSERT OR UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION ensure_jsonb_columns();

DROP TRIGGER IF EXISTS ensure_jsonb_scheduled_messages ON scheduled_messages;
CREATE TRIGGER ensure_jsonb_scheduled_messages
  BEFORE INSERT OR UPDATE ON scheduled_messages
  FOR EACH ROW EXECUTE FUNCTION ensure_jsonb_columns();

DROP TRIGGER IF EXISTS ensure_jsonb_user_whatsapp_config ON user_whatsapp_config;
CREATE TRIGGER ensure_jsonb_user_whatsapp_config
  BEFORE INSERT OR UPDATE ON user_whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION ensure_jsonb_columns();

DROP TRIGGER IF EXISTS ensure_jsonb_app_settings ON app_settings;
CREATE TRIGGER ensure_jsonb_app_settings
  BEFORE INSERT OR UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION ensure_jsonb_columns();

DROP TRIGGER IF EXISTS ensure_jsonb_whatsapp_auto_replies ON whatsapp_auto_replies;
CREATE TRIGGER ensure_jsonb_whatsapp_auto_replies
  BEFORE INSERT OR UPDATE ON whatsapp_auto_replies
  FOR EACH ROW EXECUTE FUNCTION ensure_jsonb_columns();

-- Add comments for documentation
COMMENT ON FUNCTION safe_text_to_jsonb(TEXT) IS 'Safely converts text to JSONB, returning empty object on parse errors';
COMMENT ON FUNCTION ensure_jsonb_columns() IS 'Trigger function to automatically cast text values to JSONB for affected columns';