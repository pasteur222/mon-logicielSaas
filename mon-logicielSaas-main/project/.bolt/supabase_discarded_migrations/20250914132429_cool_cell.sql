/*
  # Error Management and System Monitoring Tables

  1. New Tables
    - `error_logs` - Store detailed error information for monitoring and analysis
    - `escalation_queue` - Track issues that need human intervention
    - `session_locks` - Implement atomic session management with locks
    - `score_events` - Track all scoring events for audit and recalculation
    - `score_calculation_rules` - Define flexible scoring rules
    - `conversation_contexts` - Store conversation memory and context
    - `message_queue` - Queue system for batch processing messages
    - `auto_reply_rules` - Enhanced auto-reply system with conflict resolution

  2. Security
    - Enable RLS on all tables
    - Add appropriate policies for authenticated users

  3. Indexes
    - Add performance indexes for frequently queried columns
    - Add composite indexes for complex queries

  4. Functions
    - Add utility functions for atomic operations
    - Add functions for lock management
*/

-- Error logging table
CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type text NOT NULL,
  error_message text NOT NULL,
  error_stack text,
  operation text NOT NULL,
  module text NOT NULL CHECK (module IN ('customer_service', 'quiz', 'whatsapp', 'system')),
  user_id uuid REFERENCES auth.users(id),
  phone_number text,
  session_id uuid,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own error logs"
  ON error_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Escalation queue table
CREATE TABLE IF NOT EXISTS escalation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL CHECK (module IN ('customer_service', 'quiz', 'whatsapp', 'system')),
  phone_number text NOT NULL,
  session_id uuid,
  error_message text NOT NULL,
  context_data jsonb DEFAULT '{}',
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'resolved', 'closed')),
  assigned_to uuid REFERENCES auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE escalation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read escalations"
  ON escalation_queue
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update assigned escalations"
  ON escalation_queue
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = assigned_to);

-- Session locks table for atomic operations
CREATE TABLE IF NOT EXISTS session_locks (
  session_id uuid NOT NULL,
  lock_id uuid NOT NULL,
  locked_by text NOT NULL,
  locked_at timestamptz DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (session_id, lock_id)
);

ALTER TABLE session_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage session locks"
  ON session_locks
  FOR ALL
  TO authenticated
  USING (true);

-- Score events table for detailed scoring audit
CREATE TABLE IF NOT EXISTS score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('question_answered', 'bonus_awarded', 'penalty_applied', 'time_bonus', 'streak_bonus')),
  points integer NOT NULL,
  multiplier decimal(3,2) DEFAULT 1.0,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false
);

ALTER TABLE score_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own score events"
  ON score_events
  FOR SELECT
  TO authenticated
  USING (
    session_id IN (
      SELECT id FROM quiz_sessions WHERE user_id = auth.uid()
    )
  );

-- Score calculation rules table
CREATE TABLE IF NOT EXISTS score_calculation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_type text NOT NULL CHECK (rule_type IN ('base_points', 'time_bonus', 'streak_bonus', 'difficulty_multiplier', 'penalty')),
  condition text NOT NULL, -- JSON condition for rule application
  points integer NOT NULL DEFAULT 0,
  multiplier decimal(3,2) DEFAULT 1.0,
  max_applications integer, -- Optional limit on rule applications
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE score_calculation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read scoring rules"
  ON score_calculation_rules
  FOR SELECT
  TO authenticated
  USING (true);

-- Conversation contexts table for memory management
CREATE TABLE IF NOT EXISTS conversation_contexts (
  phone_number text PRIMARY KEY,
  summary text DEFAULT '',
  entities jsonb DEFAULT '{}',
  intent_history text[] DEFAULT '{}',
  sentiment_trend text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE conversation_contexts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage conversation contexts"
  ON conversation_contexts
  FOR ALL
  TO authenticated
  USING (true);

-- Message queue table for batch processing
CREATE TABLE IF NOT EXISTS message_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  content text NOT NULL,
  sender text NOT NULL CHECK (sender IN ('user', 'bot')),
  message_type text DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'document', 'audio')),
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  retry_count integer DEFAULT 0,
  max_retries integer DEFAULT 3,
  scheduled_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  metadata jsonb DEFAULT '{}',
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage message queue"
  ON message_queue
  FOR ALL
  TO authenticated
  USING (true);

-- Enhanced auto reply rules table
CREATE TABLE IF NOT EXISTS auto_reply_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  trigger_words text[] NOT NULL,
  response text NOT NULL,
  priority integer DEFAULT 1,
  is_active boolean DEFAULT true,
  use_regex boolean DEFAULT false,
  pattern_flags text DEFAULT 'i',
  variables jsonb DEFAULT '{}',
  conditions jsonb DEFAULT '{}',
  usage_count integer DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE auto_reply_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own auto reply rules"
  ON auto_reply_rules
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- Add missing columns to existing tables
DO $$
BEGIN
  -- Add lock_version to quiz_sessions for optimistic locking
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_sessions' AND column_name = 'lock_version'
  ) THEN
    ALTER TABLE quiz_sessions ADD COLUMN lock_version integer DEFAULT 1;
  END IF;

  -- Add current_streak and max_streak to quiz_sessions
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_sessions' AND column_name = 'current_streak'
  ) THEN
    ALTER TABLE quiz_sessions ADD COLUMN current_streak integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'quiz_sessions' AND column_name = 'max_streak'
  ) THEN
    ALTER TABLE quiz_sessions ADD COLUMN max_streak integer DEFAULT 0;
  END IF;

  -- Add metadata to whatsapp_messages for enhanced processing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'whatsapp_messages' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE whatsapp_messages ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_module_type ON error_logs(module, error_type);
CREATE INDEX IF NOT EXISTS idx_error_logs_phone_number ON error_logs(phone_number) WHERE phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_escalation_queue_status ON escalation_queue(status);
CREATE INDEX IF NOT EXISTS idx_escalation_queue_priority ON escalation_queue(priority);
CREATE INDEX IF NOT EXISTS idx_escalation_queue_created_at ON escalation_queue(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_session_locks_expires_at ON session_locks(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_locks_session_id ON session_locks(session_id);

CREATE INDEX IF NOT EXISTS idx_score_events_session_id ON score_events(session_id);
CREATE INDEX IF NOT EXISTS idx_score_events_processed ON score_events(processed);
CREATE INDEX IF NOT EXISTS idx_score_events_created_at ON score_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_queue_status ON message_queue(status);
CREATE INDEX IF NOT EXISTS idx_message_queue_scheduled_at ON message_queue(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_message_queue_priority ON message_queue(priority);

CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_user_id ON auto_reply_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_active ON auto_reply_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_auto_reply_rules_priority ON auto_reply_rules(priority DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_contexts_updated_at ON conversation_contexts(updated_at DESC);

-- Utility functions for atomic operations

-- Function to acquire session lock
CREATE OR REPLACE FUNCTION acquire_session_lock(
  p_session_id uuid,
  p_lock_id uuid,
  p_locked_by text,
  p_expires_at timestamptz
) RETURNS boolean AS $$
BEGIN
  -- Clean up expired locks first
  DELETE FROM session_locks 
  WHERE session_id = p_session_id AND expires_at < now();
  
  -- Try to acquire lock
  INSERT INTO session_locks (session_id, lock_id, locked_by, expires_at)
  VALUES (p_session_id, p_lock_id, p_locked_by, p_expires_at)
  ON CONFLICT (session_id, lock_id) DO NOTHING;
  
  -- Check if we got the lock
  RETURN EXISTS (
    SELECT 1 FROM session_locks 
    WHERE session_id = p_session_id 
    AND lock_id = p_lock_id 
    AND locked_by = p_locked_by
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release session lock
CREATE OR REPLACE FUNCTION release_session_lock(
  p_session_id uuid,
  p_lock_id uuid
) RETURNS boolean AS $$
BEGIN
  DELETE FROM session_locks 
  WHERE session_id = p_session_id AND lock_id = p_lock_id;
  
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update session score atomically
CREATE OR REPLACE FUNCTION update_session_score(
  p_session_id uuid,
  p_points_delta integer
) RETURNS void AS $$
BEGIN
  UPDATE quiz_sessions 
  SET score = GREATEST(0, score + p_points_delta),
      updated_at = now()
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment lock version
CREATE OR REPLACE FUNCTION increment_lock_version(session_id uuid) RETURNS integer AS $$
BEGIN
  UPDATE quiz_sessions 
  SET lock_version = lock_version + 1 
  WHERE id = session_id;
  
  RETURN (SELECT lock_version FROM quiz_sessions WHERE id = session_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Insert default scoring rules
INSERT INTO score_calculation_rules (rule_type, condition, points, multiplier) VALUES
  ('base_points', '{"difficulty": "easy"}', 5, 1.0),
  ('base_points', '{"difficulty": "medium"}', 10, 1.0),
  ('base_points', '{"difficulty": "hard"}', 15, 1.0),
  ('time_bonus', '{"optimal_time": true}', 5, 1.0),
  ('streak_bonus', '{"min_streak": 3}', 2, 1.0),
  ('difficulty_multiplier', '{"difficulty": "easy"}', 0, 0.8),
  ('difficulty_multiplier', '{"difficulty": "medium"}', 0, 1.0),
  ('difficulty_multiplier', '{"difficulty": "hard"}', 0, 1.5),
  ('penalty', '{"wrong_answer": true}', 2, 1.0)
ON CONFLICT DO NOTHING;