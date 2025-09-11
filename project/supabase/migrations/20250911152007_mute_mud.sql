/*
  # Create quiz statistics cache table for performance optimization

  1. New Tables
    - `quiz_statistics_cache`
      - `id` (uuid, primary key)
      - `metric_name` (text, unique)
      - `metric_value` (numeric)
      - `metadata` (jsonb, optional)
      - `expires_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `quiz_statistics_cache` table
    - Add policies for authenticated users to access cached statistics

  3. Indexes
    - Unique index on metric_name
    - Index on expires_at for cleanup operations
*/

-- Create quiz_statistics_cache table
CREATE TABLE IF NOT EXISTS quiz_statistics_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text UNIQUE NOT NULL,
  metric_value numeric NOT NULL DEFAULT 0,
  metadata jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_statistics_cache_metric_name ON quiz_statistics_cache(metric_name);
CREATE INDEX IF NOT EXISTS idx_quiz_statistics_cache_expires_at ON quiz_statistics_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_quiz_statistics_cache_updated_at ON quiz_statistics_cache(updated_at);

-- Enable Row Level Security
ALTER TABLE quiz_statistics_cache ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view cached quiz statistics"
  ON quiz_statistics_cache
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert cached quiz statistics"
  ON quiz_statistics_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update cached quiz statistics"
  ON quiz_statistics_cache
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete expired cached quiz statistics"
  ON quiz_statistics_cache
  FOR DELETE
  TO authenticated
  USING (expires_at < now());