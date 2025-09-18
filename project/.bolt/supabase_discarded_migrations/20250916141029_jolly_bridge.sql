/*
  # Fix chatbot_widget_config table structure

  1. Table Updates
    - Add missing `is_active` column to `chatbot_widget_config` table
    - Ensure proper column types and defaults

  2. Security
    - Maintain existing RLS policies
    - No changes to security model
*/

-- Add the missing is_active column to chatbot_widget_config table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chatbot_widget_config' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE chatbot_widget_config ADD COLUMN is_active boolean DEFAULT true;
  END IF;
END $$;

-- Ensure the config column has proper structure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chatbot_widget_config' AND column_name = 'config'
  ) THEN
    ALTER TABLE chatbot_widget_config ADD COLUMN config jsonb DEFAULT '{}';
  END IF;
END $$;