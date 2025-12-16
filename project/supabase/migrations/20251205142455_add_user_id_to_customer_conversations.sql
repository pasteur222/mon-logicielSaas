/*
  # Add User ID Tracking to Customer Conversations

  ## Purpose
  This migration adds user_id tracking to customer_conversations table to support
  autonomous webhook operation where each conversation is associated with a specific
  user account.

  ## Changes
  1. Add user_id column to customer_conversations
    - Links conversations to the user account that owns the WhatsApp configuration
    - Nullable to support backward compatibility with existing data
    - Foreign key reference to auth.users

  2. Add index for performance
    - Index on user_id for fast lookups
    - Composite index on (user_id, created_at) for user-specific queries

  ## Security
  - No RLS policy changes needed as existing policies remain valid
  - user_id helps with data segregation and multi-tenant support

  ## Impact
  - Enables webhook to properly attribute conversations to user accounts
  - Supports autonomous operation without environment variables
  - Allows per-user analytics and conversation history
*/

-- Add user_id column to customer_conversations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'customer_conversations' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE customer_conversations 
    ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
    
    COMMENT ON COLUMN customer_conversations.user_id IS 'References the user account that owns the WhatsApp configuration receiving this conversation';
  END IF;
END $$;

-- Create index for efficient user-specific queries
CREATE INDEX IF NOT EXISTS idx_customer_conversations_user_id 
  ON customer_conversations(user_id);

-- Create composite index for user timeline queries
CREATE INDEX IF NOT EXISTS idx_customer_conversations_user_created 
  ON customer_conversations(user_id, created_at DESC);

-- Add comment
COMMENT ON TABLE customer_conversations IS 'Stores all customer conversations from WhatsApp and web sources, now with user_id for multi-tenant autonomous operation';
