/*
  # Create Campaign and Message Execution Tracking Tables

  1. New Tables
    - `campaign_execution_logs`: Tracks campaign execution history
      - `id` (uuid, primary key)
      - `campaign_id` (uuid): Reference to campaigns table
      - `messages_sent` (integer): Number of messages sent
      - `messages_failed` (integer): Number of messages failed
      - `executed_at` (timestamptz): When the campaign was executed
      - `execution_duration` (text): How long the execution took
      - `error_details` (text): Error details if execution failed

    - `message_execution_logs`: Tracks scheduled message execution history
      - `id` (uuid, primary key)
      - `message_id` (uuid): Reference to scheduled_messages table
      - `messages_sent` (integer): Number of messages sent
      - `messages_failed` (integer): Number of messages failed
      - `executed_at` (timestamptz): When the message was executed
      - `execution_duration` (text): How long the execution took
      - `error_details` (text): Error details if execution failed

  2. Table Updates
    - Add missing columns to campaigns table
    - Add missing columns to scheduled_messages table

  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Create campaign_execution_logs table
CREATE TABLE IF NOT EXISTS campaign_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  messages_sent integer DEFAULT 0,
  messages_failed integer DEFAULT 0,
  executed_at timestamptz DEFAULT now(),
  execution_duration text,
  error_details text,
  created_at timestamptz DEFAULT now()
);

-- Create message_execution_logs table
CREATE TABLE IF NOT EXISTS message_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES scheduled_messages(id) ON DELETE CASCADE,
  messages_sent integer DEFAULT 0,
  messages_failed integer DEFAULT 0,
  executed_at timestamptz DEFAULT now(),
  execution_duration text,
  error_details text,
  created_at timestamptz DEFAULT now()
);

-- Add missing columns to campaigns table
DO $$
BEGIN
  -- Add user_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;

  -- Add media column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'media'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN media jsonb;
  END IF;

  -- Add variables column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'variables'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN variables jsonb DEFAULT '{}';
  END IF;
END $$;

-- Add missing columns to scheduled_messages table
DO $$
BEGIN
  -- Add user_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_messages' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE scheduled_messages ADD COLUMN user_id uuid REFERENCES auth.users(id);
  END IF;

  -- Add media column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_messages' AND column_name = 'media'
  ) THEN
    ALTER TABLE scheduled_messages ADD COLUMN media jsonb;
  END IF;

  -- Add variables column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'scheduled_messages' AND column_name = 'variables'
  ) THEN
    ALTER TABLE scheduled_messages ADD COLUMN variables jsonb DEFAULT '{}';
  END IF;
END $$;

-- Enable RLS
ALTER TABLE campaign_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_execution_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for campaign_execution_logs
CREATE POLICY "Allow read access to campaign execution logs"
  ON campaign_execution_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow insert to campaign execution logs"
  ON campaign_execution_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create policies for message_execution_logs
CREATE POLICY "Allow read access to message execution logs"
  ON message_execution_logs
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow insert to message execution logs"
  ON message_execution_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_campaign_execution_logs_campaign_id ON campaign_execution_logs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_execution_logs_executed_at ON campaign_execution_logs(executed_at);
CREATE INDEX IF NOT EXISTS idx_message_execution_logs_message_id ON message_execution_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_message_execution_logs_executed_at ON message_execution_logs(executed_at);

-- Create indexes for campaigns and scheduled_messages
CREATE INDEX IF NOT EXISTS idx_campaigns_status_dates ON campaigns(status, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_send_at ON scheduled_messages(status, send_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id ON scheduled_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_repeat_type ON scheduled_messages(repeat_type);