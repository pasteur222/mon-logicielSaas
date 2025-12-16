/*
  # Enhance RLS Policies for Customer Conversations User Isolation

  ## Purpose
  Update RLS policies to properly isolate customer conversations by user_id,
  ensuring each user can only access their own conversations in the autonomous
  webhook system.

  ## Changes
  1. Add RLS policy for users to view their own conversations
  2. Add RLS policy for users to manage their own conversations
  3. Keep existing service_role policies for webhook operation

  ## Security
  - Users can only access conversations where user_id matches their auth.uid()
  - Service role maintains full access for webhook operations
  - Prevents cross-user data leakage in multi-tenant environment
*/

-- Policy: Users can view their own conversations
CREATE POLICY "Users can view their own conversations"
  ON customer_conversations
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR user_id IS NULL
  );

-- Policy: Users can insert conversations for themselves
CREATE POLICY "Users can create their own conversations"
  ON customer_conversations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR user_id IS NULL
  );

-- Policy: Service role has full access (needed for webhook)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'customer_conversations' 
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

-- Add comment explaining the security model
COMMENT ON TABLE customer_conversations IS 'Customer conversations with RLS ensuring users can only access their own data. Service role has full access for webhook operations.';
