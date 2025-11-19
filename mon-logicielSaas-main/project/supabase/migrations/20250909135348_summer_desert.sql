/*
  # Fix Customer Conversations RLS Policies for Deletion

  1. Security
     - Update RLS policies for customer_conversations table
     - Add policy for authenticated users to delete conversations
     - Ensure proper permissions for conversation management
*/

-- Add delete policy for customer_conversations if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'customer_conversations' 
    AND policyname = 'Allow delete to conversations'
  ) THEN
    CREATE POLICY "Allow delete to conversations"
      ON customer_conversations
      FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END $$;

-- Add update policy for customer_conversations if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'customer_conversations' 
    AND policyname = 'Allow update to conversations'
  ) THEN
    CREATE POLICY "Allow update to conversations"
      ON customer_conversations
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Ensure service role has full access to customer_conversations
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'customer_conversations' 
    AND policyname = 'Service role has full access to conversations'
  ) THEN
    CREATE POLICY "Service role has full access to conversations"
      ON customer_conversations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Grant necessary permissions to authenticated users
GRANT DELETE ON customer_conversations TO authenticated;
GRANT UPDATE ON customer_conversations TO authenticated;

-- Create index for faster deletion operations
CREATE INDEX IF NOT EXISTS idx_customer_conversations_intent_created_at 
ON customer_conversations(intent, created_at);

-- Create index for faster ID-based operations
CREATE INDEX IF NOT EXISTS idx_customer_conversations_id 
ON customer_conversations(id);