/*
  # Fix Quiz Table References and Add Default Marketing Data

  1. Table Reference Fixes
    - Replace any quiz_questions_2 references with quiz_questions
    - Verify foreign key constraints
    - Add default marketing data for testing

  2. Default Marketing Data
    - Insert realistic quiz users for testing
    - Create diverse marketing profiles
    - Ensure data appears in Recent Participants section

  3. Security
    - Maintain existing RLS policies
*/

-- Fix any potential quiz_questions_2 references in foreign keys
DO $$
BEGIN
  -- Check if there are any foreign key constraints referencing quiz_questions_2
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
    AND kcu.referenced_table_name = 'quiz_questions_2'
  ) THEN
    -- Drop and recreate foreign key constraints to point to quiz_questions
    ALTER TABLE quiz_answers DROP CONSTRAINT IF EXISTS quiz_answers_question_id_fkey;
    ALTER TABLE quiz_answers 
    ADD CONSTRAINT quiz_answers_question_id_fkey 
    FOREIGN KEY (question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Insert default marketing quiz users for testing
INSERT INTO quiz_users (
  phone_number,
  name,
  email,
  address,
  profession,
  preferences,
  score,
  profile,
  current_step,
  status,
  created_at,
  updated_at
) VALUES
  (
    '+221123456789',
    'Aminata Diallo',
    'aminata.diallo@email.com',
    'Dakar, Sénégal',
    'Étudiante',
    '{"interests": ["technology", "education"], "budget": "low", "communication_preference": "whatsapp"}',
    45,
    'discovery',
    3,
    'active',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 hour'
  ),
  (
    '+221987654321',
    'Moussa Ndiaye',
    'moussa.ndiaye@email.com',
    'Thiès, Sénégal',
    'Entrepreneur',
    '{"interests": ["business", "marketing"], "budget": "medium", "communication_preference": "email"}',
    78,
    'active',
    5,
    'completed',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '30 minutes'
  ),
  (
    '+221555666777',
    'Fatou Sow',
    'fatou.sow@email.com',
    'Saint-Louis, Sénégal',
    'Commerçante',
    '{"interests": ["retail", "customer_service"], "budget": "high", "communication_preference": "phone"}',
    92,
    'vip',
    6,
    'completed',
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '15 minutes'
  ),
  (
    '+221444555666',
    'Ibrahima Fall',
    'ibrahima.fall@email.com',
    'Kaolack, Sénégal',
    'Enseignant',
    '{"interests": ["education", "technology"], "budget": "medium", "communication_preference": "whatsapp"}',
    63,
    'active',
    4,
    'active',
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '45 minutes'
  ),
  (
    '+221333444555',
    'Aïssatou Ba',
    'aissatou.ba@email.com',
    'Ziguinchor, Sénégal',
    'Infirmière',
    '{"interests": ["health", "family"], "budget": "low", "communication_preference": "whatsapp"}',
    34,
    'discovery',
    2,
    'active',
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '2 hours'
  ),
  (
    '+221777888999',
    'Ousmane Diop',
    'ousmane.diop@email.com',
    'Tambacounda, Sénégal',
    'Agriculteur',
    '{"interests": ["agriculture", "technology"], "budget": "medium", "communication_preference": "phone"}',
    56,
    'active',
    4,
    'completed',
    NOW() - INTERVAL '8 hours',
    NOW() - INTERVAL '3 hours'
  ),
  (
    '+221666777888',
    'Marième Sarr',
    'marieme.sarr@email.com',
    'Louga, Sénégal',
    'Artisane',
    '{"interests": ["crafts", "business"], "budget": "low", "communication_preference": "whatsapp"}',
    41,
    'discovery',
    3,
    'active',
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '4 hours'
  ),
  (
    '+221888999000',
    'Cheikh Sy',
    'cheikh.sy@email.com',
    'Kolda, Sénégal',
    'Mécanicien',
    '{"interests": ["automotive", "technology"], "budget": "medium", "communication_preference": "phone"}',
    87,
    'vip',
    6,
    'completed',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '5 hours'
  )
ON CONFLICT (phone_number) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  address = EXCLUDED.address,
  profession = EXCLUDED.profession,
  preferences = EXCLUDED.preferences,
  score = EXCLUDED.score,
  profile = EXCLUDED.profile,
  current_step = EXCLUDED.current_step,
  status = EXCLUDED.status,
  updated_at = EXCLUDED.updated_at;

-- Insert corresponding quiz answers for the users
INSERT INTO quiz_answers (
  user_id,
  question_id,
  answer,
  points_awarded,
  created_at
)
SELECT 
  qu.id,
  qq.id,
  CASE 
    WHEN qq.correct_answer = true THEN 'Vrai'
    ELSE 'Faux'
  END,
  CASE 
    WHEN qu.profile = 'vip' THEN 15
    WHEN qu.profile = 'active' THEN 10
    ELSE 5
  END,
  qu.created_at + INTERVAL '5 minutes'
FROM quiz_users qu
CROSS JOIN quiz_questions qq
WHERE qu.phone_number IN ('+221123456789', '+221987654321', '+221555666777')
AND qq.id IS NOT NULL
ON CONFLICT DO NOTHING;