/*
  # Fix chatbot_widget_config table schema

  1. Schema Updates
    - Add missing `updated_at` column to `chatbot_widget_config` table
    - Ensure proper timestamp handling with default values
    - Add trigger for automatic timestamp updates

  2. Security
    - Maintain existing RLS policies
    - Ensure data integrity with proper constraints
*/

-- Check if updated_at column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chatbot_widget_config' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE chatbot_widget_config ADD COLUMN updated_at timestamptz DEFAULT now();
    
    -- Update existing rows to have the updated_at timestamp
    UPDATE chatbot_widget_config 
    SET updated_at = created_at 
    WHERE updated_at IS NULL;
  END IF;
END $$;

-- Create or replace the trigger function for updating updated_at
CREATE OR REPLACE FUNCTION update_chatbot_widget_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS update_chatbot_widget_config_updated_at_trigger ON chatbot_widget_config;

CREATE TRIGGER update_chatbot_widget_config_updated_at_trigger
  BEFORE UPDATE ON chatbot_widget_config
  FOR EACH ROW
  EXECUTE FUNCTION update_chatbot_widget_config_updated_at();