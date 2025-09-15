/*
  # Fix metadata column migration

  1. Changes
     - Add metadata column to message_logs table (safe operation)
     - Use IF NOT EXISTS to prevent errors if column already exists
     - Set default value to empty JSON object

  2. Security
     - No RLS changes needed as message_logs already has proper policies
     - Safe column addition with proper default value

  This migration fixes the error where whatsapp_messages table was referenced
  but doesn't exist. We use message_logs table instead which is the correct
  table for storing message metadata.
*/

-- Add metadata column to message_logs table safely
ALTER TABLE message_logs ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';