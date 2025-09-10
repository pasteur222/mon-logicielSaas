/*
  # Add Quiz Dummy Data for Professional Display

  1. New Data
    - `quiz_users` - Sample participants with realistic profiles
    - `quiz_questions` - Sample questions for the quiz system
    - `quiz_answers` - Sample answers to show engagement

  2. Features
    - Diverse participant profiles (discovery, active, vip)
    - Realistic scores and completion status
    - Professional-looking data for demonstrations
    - Proper timestamps for recent activity
*/

-- Insert sample quiz questions if none exist
INSERT INTO quiz_questions (text, type, correct_answer, explanation, category, difficulty_level, order_index, required)
SELECT * FROM (VALUES
  ('Quel est votre nom complet ?', 'personal', false, 'Information personnelle pour personnalisation', 'Personnel', 1, 0, true),
  ('Quelle est votre profession ?', 'personal', false, 'Information professionnelle pour segmentation', 'Personnel', 1, 1, true),
  ('Dans quel secteur travaillez-vous ?', 'preference', false, 'Segmentation par secteur d''activité', 'Professionnel', 1, 2, false),
  ('Quel est votre budget mensuel pour nos services ?', 'preference', false, 'Qualification budgétaire', 'Commercial', 2, 3, false),
  ('Nos services répondent-ils à vos attentes ?', 'quiz', true, 'Question de satisfaction client', 'Satisfaction', 1, 4, false),
  ('Recommanderiez-vous nos services à un ami ?', 'quiz', true, 'Question de recommandation NPS', 'Marketing', 1, 5, false),
  ('Avez-vous déjà utilisé des services similaires ?', 'quiz', false, 'Analyse de la concurrence', 'Marché', 2, 6, false),
  ('Quelle fonctionnalité vous intéresse le plus ?', 'preference', false, 'Préférences produit', 'Produit', 1, 7, false)
) AS v(text, type, correct_answer, explanation, category, difficulty_level, order_index, required)
WHERE NOT EXISTS (SELECT 1 FROM quiz_questions LIMIT 1);

-- Insert sample quiz participants with realistic data
INSERT INTO quiz_users (phone_number, name, email, address, profession, score, profile, current_step, status, preferences, created_at, updated_at)
SELECT * FROM (VALUES
  ('+242064123456', 'Marie Dubois', 'marie.dubois@email.com', 'Brazzaville, Congo', 'Enseignante', 85, 'vip', 8, 'completed', '{"budget": "50000-100000", "sector": "education", "interest": "formation"}', NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day'),
  ('+242065789012', 'Jean Nkounkou', 'jean.nkounkou@gmail.com', 'Pointe-Noire, Congo', 'Entrepreneur', 72, 'active', 7, 'completed', '{"budget": "100000+", "sector": "commerce", "interest": "marketing"}', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 hours'),
  ('+242066345678', 'Fatou Samba', 'fatou.samba@yahoo.fr', 'Dolisie, Congo', 'Commerçante', 58, 'active', 6, 'active', '{"budget": "25000-50000", "sector": "retail", "interest": "vente"}', NOW() - INTERVAL '1 day', NOW() - INTERVAL '30 minutes'),
  ('+242067901234', 'Paul Makaya', 'paul.makaya@outlook.com', 'Brazzaville, Congo', 'Développeur', 91, 'vip', 8, 'completed', '{"budget": "75000+", "sector": "tech", "interest": "automation"}', NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 hours'),
  ('+242068567890', 'Aisha Kone', 'aisha.kone@email.com', 'Brazzaville, Congo', 'Consultante', 67, 'active', 5, 'active', '{"budget": "50000-75000", "sector": "consulting", "interest": "client_service"}', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '15 minutes'),
  ('+242069234567', 'Michel Obami', 'michel.obami@gmail.com', 'Pointe-Noire, Congo', 'Artisan', 34, 'discovery', 3, 'active', '{"budget": "10000-25000", "sector": "artisanat", "interest": "promotion"}', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '5 minutes'),
  ('+242060890123', 'Grace Mboungou', 'grace.mboungou@yahoo.fr', 'Brazzaville, Congo', 'Infirmière', 78, 'active', 7, 'completed', '{"budget": "30000-50000", "sector": "sante", "interest": "communication"}', NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day'),
  ('+242061456789', 'David Loubaki', 'david.loubaki@email.com', 'Dolisie, Congo', 'Agriculteur', 42, 'discovery', 4, 'active', '{"budget": "15000-30000", "sector": "agriculture", "interest": "information"}', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '20 minutes'),
  ('+242062012345', 'Sylvie Ngouabi', 'sylvie.ngouabi@gmail.com', 'Brazzaville, Congo', 'Avocate', 89, 'vip', 8, 'completed', '{"budget": "100000+", "sector": "juridique", "interest": "client_management"}', NOW() - INTERVAL '1 day', NOW() - INTERVAL '4 hours'),
  ('+242063678901', 'Robert Sassou', 'robert.sassou@outlook.com', 'Pointe-Noire, Congo', 'Mécanicien', 51, 'discovery', 5, 'active', '{"budget": "20000-40000", "sector": "automobile", "interest": "promotion"}', NOW() - INTERVAL '8 hours', NOW() - INTERVAL '45 minutes'),
  ('+242064234567', 'Chantal Mabiala', 'chantal.mabiala@email.com', 'Brazzaville, Congo', 'Pharmacienne', 76, 'active', 6, 'completed', '{"budget": "60000-80000", "sector": "pharmacie", "interest": "information_medicale"}', NOW() - INTERVAL '2 days', NOW() - INTERVAL '6 hours'),
  ('+242065890123', 'Emmanuel Kouka', 'emmanuel.kouka@gmail.com', 'Dolisie, Congo', 'Professeur', 63, 'active', 6, 'active', '{"budget": "35000-55000", "sector": "education", "interest": "outils_pedagogiques"}', NOW() - INTERVAL '4 hours', NOW() - INTERVAL '10 minutes'),
  ('+242066456789', 'Bernadette Okemba', 'bernadette.okemba@yahoo.fr', 'Brazzaville, Congo', 'Couturière', 38, 'discovery', 3, 'active', '{"budget": "12000-25000", "sector": "mode", "interest": "clientele"}', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '8 minutes'),
  ('+242067012345', 'Christian Bongo', 'christian.bongo@email.com', 'Pointe-Noire, Congo', 'Ingénieur', 94, 'vip', 8, 'completed', '{"budget": "120000+", "sector": "ingenierie", "interest": "innovation"}', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days'),
  ('+242068678901', 'Antoinette Milandou', 'antoinette.milandou@gmail.com', 'Brazzaville, Congo', 'Restauratrice', 55, 'discovery', 5, 'active', '{"budget": "25000-45000", "sector": "restauration", "interest": "marketing_local"}', NOW() - INTERVAL '5 hours', NOW() - INTERVAL '25 minutes')
) AS v(phone_number, name, email, address, profession, score, profile, current_step, status, preferences, created_at, updated_at)
WHERE NOT EXISTS (
  SELECT 1 FROM quiz_users 
  WHERE phone_number = v.phone_number
);

-- Insert sample quiz answers to show engagement
INSERT INTO quiz_answers (user_id, question_id, answer, points_awarded, created_at)
SELECT 
  qu.id as user_id,
  qq.id as question_id,
  CASE 
    WHEN qq.type = 'personal' THEN 
      CASE qq.order_index
        WHEN 0 THEN qu.name
        WHEN 1 THEN qu.profession
        ELSE 'Réponse personnelle'
      END
    WHEN qq.type = 'preference' THEN 
      CASE qq.order_index
        WHEN 2 THEN (qu.preferences->>'sector')
        WHEN 3 THEN (qu.preferences->>'budget')
        WHEN 7 THEN (qu.preferences->>'interest')
        ELSE 'Préférence utilisateur'
      END
    WHEN qq.type = 'quiz' THEN 
      CASE WHEN random() > 0.3 THEN 'Oui' ELSE 'Non' END
    ELSE 'Réponse générique'
  END as answer,
  CASE 
    WHEN qq.type = 'personal' THEN 5
    WHEN qq.type = 'preference' THEN 3
    WHEN qq.type = 'quiz' AND random() > 0.3 THEN 10
    ELSE 0
  END as points_awarded,
  qu.created_at + (qq.order_index || 0) * INTERVAL '5 minutes' as created_at
FROM quiz_users qu
CROSS JOIN quiz_questions qq
WHERE qu.current_step > qq.order_index
  AND NOT EXISTS (
    SELECT 1 FROM quiz_answers qa 
    WHERE qa.user_id = qu.id AND qa.question_id = qq.id
  )
ORDER BY qu.created_at, qq.order_index;