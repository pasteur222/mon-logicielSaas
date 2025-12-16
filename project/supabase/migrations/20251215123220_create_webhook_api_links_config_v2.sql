/*
  # Webhook and API Links Configuration
  
  1. New Table
    - `webhook_api_links` table for storing webhook and Groq API links
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `webhook_url` (text)
      - `groq_api_url` (text)
      - `webhook_enabled` (boolean, default true)
      - `groq_enabled` (boolean, default true)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
  
  2. Security
    - Enable RLS
    - Authenticated users can manage their own configurations
    - Simple user-based access control
  
  3. Indexes
    - Index on user_id for fast lookups
*/

-- Create webhook_api_links table
CREATE TABLE IF NOT EXISTS webhook_api_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  webhook_url text,
  groq_api_url text,
  webhook_enabled boolean DEFAULT true NOT NULL,
  groq_enabled boolean DEFAULT true NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE webhook_api_links ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_webhook_api_links_user_id ON webhook_api_links(user_id);
CREATE INDEX IF NOT EXISTS idx_webhook_api_links_enabled ON webhook_api_links(webhook_enabled, groq_enabled) WHERE webhook_enabled = true OR groq_enabled = true;

-- RLS Policies
DO $$
BEGIN
  -- Policy for users to read their own configurations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can view own webhook API links'
    AND tablename = 'webhook_api_links'
    AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Users can view own webhook API links"
    ON webhook_api_links FOR SELECT TO authenticated
    USING (user_id = auth.uid());
  END IF;

  -- Policy for users to insert their own configurations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can insert own webhook API links'
    AND tablename = 'webhook_api_links'
    AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Users can insert own webhook API links"
    ON webhook_api_links FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
  END IF;

  -- Policy for users to update their own configurations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can update own webhook API links'
    AND tablename = 'webhook_api_links'
    AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Users can update own webhook API links"
    ON webhook_api_links FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
  END IF;

  -- Policy for users to delete their own configurations
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Users can delete own webhook API links'
    AND tablename = 'webhook_api_links'
    AND schemaname = 'public'
  ) THEN
    CREATE POLICY "Users can delete own webhook API links"
    ON webhook_api_links FOR DELETE TO authenticated
    USING (user_id = auth.uid());
  END IF;
END $$;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_api_links_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to call the function
DROP TRIGGER IF EXISTS trigger_update_webhook_api_links_updated_at ON webhook_api_links;
CREATE TRIGGER trigger_update_webhook_api_links_updated_at
BEFORE UPDATE ON webhook_api_links
FOR EACH ROW
EXECUTE FUNCTION update_webhook_api_links_updated_at();