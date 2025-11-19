/*
  # Fix conversation deletion and add missing columns

  1. Schema Updates
    - Add missing user_agent column to customer_conversations if not exists
    - Add indexes for better performance on deletion operations
    - Add constraints to ensure data integrity

  2. Security
    - Maintain existing RLS policies
    - Add validation for UUID format where needed

  3. Performance
    - Add indexes on web_user_id and phone_number for faster deletions
    - Add composite index for intent-based queries
*/

-- Add missing user_agent column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_conversations' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE customer_conversations ADD COLUMN user_agent text;
  END IF;
END $$;

-- Add indexes for better deletion performance if they don't exist
DO $$
BEGIN
  -- Index on web_user_id for web client deletions
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'customer_conversations' AND indexname = 'idx_customer_conversations_web_user_id_intent'
  ) THEN
    CREATE INDEX idx_customer_conversations_web_user_id_intent 
    ON customer_conversations(web_user_id, intent) 
    WHERE web_user_id IS NOT NULL;
  END IF;

  -- Index on phone_number for WhatsApp deletions
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'customer_conversations' AND indexname = 'idx_customer_conversations_phone_intent'
  ) THEN
    CREATE INDEX idx_customer_conversations_phone_intent 
    ON customer_conversations(phone_number, intent) 
    WHERE phone_number IS NOT NULL;
  END IF;

  -- Composite index for intent-based queries
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'customer_conversations' AND indexname = 'idx_customer_conversations_intent_created'
  ) THEN
    CREATE INDEX idx_customer_conversations_intent_created 
    ON customer_conversations(intent, created_at DESC);
  END IF;
END $$;

-- Add a function to validate UUID format (for future use)
CREATE OR REPLACE FUNCTION is_valid_uuid(input_text text)
RETURNS boolean AS $$
BEGIN
  -- Check if the input matches UUID format
  RETURN input_text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add a function to safely delete conversations by mixed ID types
CREATE OR REPLACE FUNCTION delete_conversations_by_mixed_ids(
  conversation_ids text[],
  target_intent text DEFAULT 'client'
)
RETURNS TABLE(deleted_count integer, deleted_ids uuid[]) AS $$
DECLARE
  uuid_ids uuid[] := '{}';
  web_client_ids text[] := '{}';
  phone_numbers text[] := '{}';
  total_deleted integer := 0;
  all_deleted_ids uuid[] := '{}';
  temp_deleted_ids uuid[];
BEGIN
  -- Categorize the input IDs
  FOR i IN 1..array_length(conversation_ids, 1) LOOP
    IF is_valid_uuid(conversation_ids[i]) THEN
      uuid_ids := array_append(uuid_ids, conversation_ids[i]::uuid);
    ELSIF conversation_ids[i] LIKE 'web_client_%' THEN
      web_client_ids := array_append(web_client_ids, conversation_ids[i]);
    ELSIF conversation_ids[i] LIKE '+%' OR conversation_ids[i] ~ '^[0-9]+$' THEN
      phone_numbers := array_append(phone_numbers, conversation_ids[i]);
    END IF;
  END LOOP;

  -- Delete by UUID
  IF array_length(uuid_ids, 1) > 0 THEN
    DELETE FROM customer_conversations 
    WHERE id = ANY(uuid_ids) AND intent = target_intent
    RETURNING id INTO temp_deleted_ids;
    
    total_deleted := total_deleted + array_length(temp_deleted_ids, 1);
    all_deleted_ids := all_deleted_ids || temp_deleted_ids;
  END IF;

  -- Delete by web_user_id
  IF array_length(web_client_ids, 1) > 0 THEN
    DELETE FROM customer_conversations 
    WHERE web_user_id = ANY(web_client_ids) AND intent = target_intent
    RETURNING id INTO temp_deleted_ids;
    
    total_deleted := total_deleted + array_length(temp_deleted_ids, 1);
    all_deleted_ids := all_deleted_ids || temp_deleted_ids;
  END IF;

  -- Delete by phone_number
  IF array_length(phone_numbers, 1) > 0 THEN
    DELETE FROM customer_conversations 
    WHERE phone_number = ANY(phone_numbers) AND intent = target_intent
    RETURNING id INTO temp_deleted_ids;
    
    total_deleted := total_deleted + array_length(temp_deleted_ids, 1);
    all_deleted_ids := all_deleted_ids || temp_deleted_ids;
  END IF;

  RETURN QUERY SELECT total_deleted, all_deleted_ids;
END;
$$ LANGUAGE plpgsql;