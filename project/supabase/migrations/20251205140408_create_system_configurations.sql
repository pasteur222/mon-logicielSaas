/*
  # Create System Configurations Table

  ## Purpose
  This migration creates a system configurations table to store admin-managed
  webhook URLs and Groq API endpoints that can be shared with subscribed users.

  ## Tables Created
  1. `system_configurations` - Stores shareable system-wide configurations
    - `id` (uuid, primary key) - Unique identifier
    - `config_key` (text, unique) - Configuration key (e.g., 'webhook_url', 'groq_api_endpoint')
    - `config_value` (text) - Configuration value
    - `config_type` (text) - Type of configuration (webhook, api, general)
    - `description` (text) - Human-readable description
    - `is_active` (boolean) - Whether this configuration is active
    - `visible_to_subscribers` (boolean) - Whether subscribed users can view this
    - `created_by` (uuid) - Admin user who created this config
    - `created_at` (timestamptz) - Creation timestamp
    - `updated_at` (timestamptz) - Update timestamp

  ## Security
  - Enable RLS on system_configurations table
  - Admins can manage all configurations
  - Authenticated users with active subscriptions can view configurations marked as visible_to_subscribers
  - Public users cannot access configurations

  ## Sample Configurations
  - Webhook URL for WhatsApp integration
  - Groq API endpoint URL
*/

-- Create system_configurations table
CREATE TABLE IF NOT EXISTS system_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text UNIQUE NOT NULL,
  config_value text NOT NULL,
  config_type text NOT NULL DEFAULT 'general' CHECK (config_type IN ('webhook', 'api', 'general')),
  description text,
  is_active boolean DEFAULT true,
  visible_to_subscribers boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_configurations_config_key ON system_configurations(config_key);
CREATE INDEX IF NOT EXISTS idx_system_configurations_visible_to_subscribers ON system_configurations(visible_to_subscribers);

-- Enable Row Level Security
ALTER TABLE system_configurations ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can manage all configurations
CREATE POLICY "Admins can manage system configurations"
  ON system_configurations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profils_utilisateurs
      WHERE profils_utilisateurs.id = auth.uid()
      AND profils_utilisateurs.is_admin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profils_utilisateurs
      WHERE profils_utilisateurs.id = auth.uid()
      AND profils_utilisateurs.is_admin = true
    )
  );

-- Policy: Subscribed users can view configurations marked as visible
CREATE POLICY "Subscribed users can view shareable configurations"
  ON system_configurations
  FOR SELECT
  TO authenticated
  USING (
    is_active = true 
    AND visible_to_subscribers = true
    AND EXISTS (
      SELECT 1 FROM business_subscriptions
      WHERE business_subscriptions.user_id = auth.uid()
      AND business_subscriptions.status = 'active'
      AND business_subscriptions.end_date > now()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_system_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_system_configurations_updated_at_trigger ON system_configurations;
CREATE TRIGGER update_system_configurations_updated_at_trigger
  BEFORE UPDATE ON system_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_system_configurations_updated_at();

-- Insert default configurations (admin will need to update these values)
INSERT INTO system_configurations (config_key, config_value, config_type, description, visible_to_subscribers)
VALUES
  ('webhook_url', 'https://your-domain.com/webhook', 'webhook', 'WhatsApp Webhook URL for message handling', true),
  ('groq_api_endpoint', 'https://api.groq.com/v1', 'api', 'Groq API endpoint for AI processing', true)
ON CONFLICT (config_key) DO NOTHING;

-- Add comment
COMMENT ON TABLE system_configurations IS 'Stores system-wide configurations that can be shared with subscribed users. Admins manage these values.';