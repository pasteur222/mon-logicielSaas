/*
  # Fix Quiz Questions Category Column
  
  1. Changes
    - Add default value 'General' to category column in quiz_questions table
    - This prevents null value constraint violations
  
  2. Security
    - Maintain existing RLS policies
*/

-- Add default value to category column
ALTER TABLE quiz_questions 
ALTER COLUMN category SET DEFAULT 'General';

-- Update any existing NULL categories to 'General'
UPDATE quiz_questions 
SET category = 'General' 
WHERE category IS NULL;