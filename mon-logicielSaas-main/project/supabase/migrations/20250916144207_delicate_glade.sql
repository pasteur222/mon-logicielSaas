/*
  # Fix chatbot_widget_config table - Add is_active column

  1. Table Updates
    - Add `is_active` column to `chatbot_widget_config` table with proper default value
    - Use conditional logic to avoid errors if column already exists
    - Optimize for performance to prevent timeouts

  2. Security
    - Maintain existing RLS policies without changes
    - No modifications to existing security model

  3. Performance Optimizations
    - Use IF NOT EXISTS pattern to prevent conflicts
    - Single atomic operation to minimize lock time
    - Proper indexing considerations
*/

-- Add is_active column to chatbot_widget_config table if it doesn't exist
DO $$
BEGIN
  -- Check if the column already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'chatbot_widget_config' 
    AND column_name = 'is_active'
  ) THEN
    -- Add the column with default value
    ALTER TABLE public.chatbot_widget_config 
    ADD COLUMN is_active boolean DEFAULT true NOT NULL;
    
    -- Add a comment for documentation
    COMMENT ON COLUMN public.chatbot_widget_config.is_active IS 'Indicates if the chatbot widget is active and should be displayed';
    
    -- Create an index for better query performance
    CREATE INDEX IF NOT EXISTS idx_chatbot_widget_config_is_active 
    ON public.chatbot_widget_config (is_active);
    
    RAISE NOTICE 'Successfully added is_active column to chatbot_widget_config table';
  ELSE
    RAISE NOTICE 'Column is_active already exists in chatbot_widget_config table';
  END IF;
END $$;