/*
  # Add Professional Quiz Participants Dummy Data

  1. New Data
    - Insert 15 professional quiz participants with realistic profiles
    - Varied scores, profiles (discovery, active, vip), and completion statuses
    - Professional phone numbers, names, emails, addresses, and professions
    - Realistic preferences stored as proper JSONB objects
    - Distributed creation dates over the last 30 days

  2. Data Distribution
    - 5 Discovery profile participants (scores 0-39)
    - 6 Active profile participants (scores 40-79) 
    - 4 VIP profile participants (scores 80+)
    - Mix of completed, active, and ended statuses
    - Various professional backgrounds and preferences

  3. Security
    - All data is fictional and professional
    - Proper JSONB formatting for preferences column
    - Realistic but non-sensitive information
*/

-- Insert professional quiz participants with proper JSONB preferences
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
-- VIP Profile Participants (High Scores)
(
  '+242066123456', 
  'Marie Dubois', 
  'marie.dubois@entreprise.cg', 
  'Avenue de l''Indépendance, Brazzaville', 
  'Directrice Marketing', 
  '{"product_interest": "premium_services", "budget_range": "high", "company_size": "large", "decision_maker": true, "preferred_contact": "email"}'::jsonb,
  95, 
  'vip', 
  10, 
  'completed', 
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days'
),
(
  '+242066234567', 
  'Jean-Claude Moukala', 
  'jc.moukala@consulting.cg', 
  'Quartier Poto-Poto, Brazzaville', 
  'Consultant en Stratégie', 
  '{"product_interest": "business_solutions", "budget_range": "high", "company_size": "medium", "decision_maker": true, "preferred_contact": "phone"}'::jsonb,
  88, 
  'vip', 
  10, 
  'completed', 
  NOW() - INTERVAL '5 days',
  NOW() - INTERVAL '5 days'
),
(
  '+242066345678', 
  'Fatou Ndiaye', 
  'fatou.ndiaye@tech.cg', 
  'Plateau des 15 ans, Brazzaville', 
  'Directrice Technique', 
  '{"product_interest": "tech_solutions", "budget_range": "high", "company_size": "startup", "decision_maker": true, "preferred_contact": "whatsapp"}'::jsonb,
  92, 
  'vip', 
  10, 
  'completed', 
  NOW() - INTERVAL '1 week',
  NOW() - INTERVAL '1 week'
),
(
  '+242066456789', 
  'Paul Mbemba', 
  'paul.mbemba@finance.cg', 
  'Centre-ville, Brazzaville', 
  'Directeur Financier', 
  '{"product_interest": "financial_tools", "budget_range": "high", "company_size": "large", "decision_maker": true, "preferred_contact": "email"}'::jsonb,
  85, 
  'vip', 
  10, 
  'completed', 
  NOW() - INTERVAL '10 days',
  NOW() - INTERVAL '10 days'
),

-- Active Profile Participants (Medium Scores)
(
  '+242066567890', 
  'Sylvie Kouka', 
  'sylvie.kouka@commerce.cg', 
  'Marché Total, Brazzaville', 
  'Responsable Commercial', 
  '{"product_interest": "sales_tools", "budget_range": "medium", "company_size": "medium", "decision_maker": false, "preferred_contact": "whatsapp"}'::jsonb,
  72, 
  'active', 
  8, 
  'active', 
  NOW() - INTERVAL '3 days',
  NOW() - INTERVAL '1 day'
),
(
  '+242066678901', 
  'Michel Ondongo', 
  'michel.ondongo@education.cg', 
  'Quartier Moungali, Brazzaville', 
  'Responsable Formation', 
  '{"product_interest": "education_tools", "budget_range": "medium", "company_size": "public", "decision_maker": false, "preferred_contact": "email"}'::jsonb,
  68, 
  'active', 
  9, 
  'active', 
  NOW() - INTERVAL '6 days',
  NOW() - INTERVAL '2 hours'
),
(
  '+242066789012', 
  'Ange Makaya', 
  'ange.makaya@startup.cg', 
  'Bacongo, Brazzaville', 
  'Chef de Projet', 
  '{"product_interest": "project_management", "budget_range": "medium", "company_size": "startup", "decision_maker": false, "preferred_contact": "whatsapp"}'::jsonb,
  65, 
  'active', 
  7, 
  'completed', 
  NOW() - INTERVAL '8 days',
  NOW() - INTERVAL '8 days'
),
(
  '+242066890123', 
  'Grace Ngouabi', 
  'grace.ngouabi@retail.cg', 
  'Marché de Bacongo, Brazzaville', 
  'Gérante de Boutique', 
  '{"product_interest": "retail_solutions", "budget_range": "low", "company_size": "small", "decision_maker": true, "preferred_contact": "whatsapp"}'::jsonb,
  58, 
  'active', 
  6, 
  'active', 
  NOW() - INTERVAL '4 days',
  NOW() - INTERVAL '3 hours'
),
(
  '+242066901234', 
  'Robert Sassou', 
  'robert.sassou@transport.cg', 
  'Gare Centrale, Brazzaville', 
  'Responsable Logistique', 
  '{"product_interest": "logistics_tools", "budget_range": "medium", "company_size": "medium", "decision_maker": false, "preferred_contact": "phone"}'::jsonb,
  61, 
  'active', 
  8, 
  'active', 
  NOW() - INTERVAL '12 days',
  NOW() - INTERVAL '5 hours'
),
(
  '+242067012345', 
  'Claudine Bongo', 
  'claudine.bongo@health.cg', 
  'Hôpital Général, Brazzaville', 
  'Administratrice Santé', 
  '{"product_interest": "health_management", "budget_range": "medium", "company_size": "public", "decision_maker": false, "preferred_contact": "email"}'::jsonb,
  55, 
  'active', 
  5, 
  'ended', 
  NOW() - INTERVAL '15 days',
  NOW() - INTERVAL '15 days'
),

-- Discovery Profile Participants (Lower Scores)
(
  '+242067123456', 
  'David Loubaki', 
  'david.loubaki@artisan.cg', 
  'Marché Artisanal, Brazzaville', 
  'Artisan', 
  '{"product_interest": "basic_tools", "budget_range": "low", "company_size": "individual", "decision_maker": true, "preferred_contact": "whatsapp"}'::jsonb,
  32, 
  'discovery', 
  4, 
  'active', 
  NOW() - INTERVAL '7 days',
  NOW() - INTERVAL '1 day'
),
(
  '+242067234567', 
  'Esperance Mvoula', 
  'esperance.mvoula@agriculture.cg', 
  'Zone Rurale, Brazzaville', 
  'Agricultrice', 
  '{"product_interest": "agriculture_tools", "budget_range": "low", "company_size": "individual", "decision_maker": true, "preferred_contact": "whatsapp"}'::jsonb,
  28, 
  'discovery', 
  3, 
  'active', 
  NOW() - INTERVAL '9 days',
  NOW() - INTERVAL '6 hours'
),
(
  '+242067345678', 
  'Thierry Mabiala', 
  'thierry.mabiala@moto.cg', 
  'Rond-point Kassaï, Brazzaville', 
  'Chauffeur de Taxi-Moto', 
  '{"product_interest": "transport_apps", "budget_range": "low", "company_size": "individual", "decision_maker": true, "preferred_contact": "whatsapp"}'::jsonb,
  25, 
  'discovery', 
  2, 
  'ended', 
  NOW() - INTERVAL '20 days',
  NOW() - INTERVAL '20 days'
),
(
  '+242067456789', 
  'Antoinette Kimbembe', 
  'antoinette.k@couture.cg', 
  'Marché de Ouenzé, Brazzaville', 
  'Couturière', 
  '{"product_interest": "small_business", "budget_range": "low", "company_size": "individual", "decision_maker": true, "preferred_contact": "whatsapp"}'::jsonb,
  18, 
  'discovery', 
  2, 
  'active', 
  NOW() - INTERVAL '14 days',
  NOW() - INTERVAL '2 days'
),
(
  '+242067567890', 
  'Emmanuel Okemba', 
  'emmanuel.okemba@student.cg', 
  'Université Marien Ngouabi, Brazzaville', 
  'Étudiant en Commerce', 
  '{"product_interest": "student_tools", "budget_range": "very_low", "company_size": "individual", "decision_maker": true, "preferred_contact": "whatsapp"}'::jsonb,
  35, 
  'discovery', 
  4, 
  'active', 
  NOW() - INTERVAL '11 days',
  NOW() - INTERVAL '8 hours'
);

-- Insert corresponding quiz answers for completed participants to make the data more realistic
INSERT INTO quiz_answers (user_id, question_id, answer, points_awarded, created_at)
SELECT 
  qu.id as user_id,
  qq.id as question_id,
  CASE 
    WHEN qq.type = 'personal' THEN 
      CASE qq.text
        WHEN 'Quel est votre nom complet ?' THEN qu.name
        WHEN 'Quelle est votre profession ?' THEN qu.profession
        WHEN 'Quelle est votre adresse ?' THEN qu.address
        ELSE 'Réponse professionnelle'
      END
    WHEN qq.type = 'preference' THEN 'Option professionnelle'
    WHEN qq.type = 'quiz' THEN 
      CASE WHEN RANDOM() > 0.3 THEN 'vrai' ELSE 'faux' END
    ELSE 'Réponse par défaut'
  END as answer,
  CASE 
    WHEN qq.type = 'personal' THEN 5
    WHEN qq.type = 'preference' THEN 3
    WHEN qq.type = 'quiz' AND RANDOM() > 0.3 THEN (qq.points->>'value')::int
    ELSE 0
  END as points_awarded,
  qu.created_at + (RANDOM() * INTERVAL '1 hour') as created_at
FROM quiz_users qu
CROSS JOIN quiz_questions qq
WHERE qu.status = 'completed'
  AND qu.score > 50  -- Only for participants with decent scores
  AND qq.order_index <= qu.current_step
ORDER BY qu.created_at, qq.order_index;