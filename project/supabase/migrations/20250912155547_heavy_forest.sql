/*
  # Web Client Conversations Migration

  1. Schema Updates
    - Make phone_number nullable for web clients
    - Ensure proper indexing for web_user_id

  2. Fictitious Data
    - Insert realistic web client conversations
    - Include proper web_user_id and location data
    - Create conversation threads between bot and web clients

  3. Data Structure
    - WhatsApp clients: use phone_number, web_user_id is NULL
    - Web clients: use web_user_id, phone_number is NULL
    - All conversations have proper sender/receiver flow
*/

-- First, make phone_number nullable to support web clients
ALTER TABLE customer_conversations 
ALTER COLUMN phone_number DROP NOT NULL;

-- Add index for web_user_id if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'customer_conversations' 
    AND indexname = 'idx_customer_web_user_id'
  ) THEN
    CREATE INDEX idx_customer_web_user_id ON customer_conversations(web_user_id);
  END IF;
END $$;

-- Insert fictitious web client conversations
INSERT INTO customer_conversations (
  web_user_id,
  session_id,
  source,
  content,
  sender,
  intent,
  created_at
) VALUES 
-- Conversation 1: French client from Paris
('web_client_paris_001', 'session_paris_001', 'web', 'Bonjour, j''ai un problème avec mon compte', 'user', 'client', NOW() - INTERVAL '2 hours'),
('web_client_paris_001', 'session_paris_001', 'web', 'Bonjour ! Je suis là pour vous aider. Pouvez-vous me décrire le problème que vous rencontrez avec votre compte ?', 'bot', 'client', NOW() - INTERVAL '2 hours' + INTERVAL '30 seconds'),
('web_client_paris_001', 'session_paris_001', 'web', 'Je n''arrive pas à me connecter depuis ce matin', 'user', 'client', NOW() - INTERVAL '2 hours' + INTERVAL '1 minute'),
('web_client_paris_001', 'session_paris_001', 'web', 'Je comprends votre frustration. Avez-vous essayé de réinitialiser votre mot de passe ? Je peux vous guider dans cette démarche.', 'bot', 'client', NOW() - INTERVAL '2 hours' + INTERVAL '1 minute 30 seconds'),
('web_client_paris_001', 'session_paris_001', 'web', 'Oui, j''ai essayé mais je ne reçois pas l''email de réinitialisation', 'user', 'client', NOW() - INTERVAL '2 hours' + INTERVAL '2 minutes'),
('web_client_paris_001', 'session_paris_001', 'web', 'Vérifiez votre dossier spam. Si l''email n''y est pas, je peux déclencher un nouvel envoi. Quelle est l''adresse email associée à votre compte ?', 'bot', 'client', NOW() - INTERVAL '2 hours' + INTERVAL '2 minutes 30 seconds'),

-- Conversation 2: English client from London
('web_client_london_002', 'session_london_002', 'web', 'Hello, I need help with billing', 'user', 'client', NOW() - INTERVAL '1 hour 30 minutes'),
('web_client_london_002', 'session_london_002', 'web', 'Hello! I''d be happy to help you with your billing inquiry. What specific issue are you experiencing?', 'bot', 'client', NOW() - INTERVAL '1 hour 30 minutes' + INTERVAL '25 seconds'),
('web_client_london_002', 'session_london_002', 'web', 'I was charged twice for my subscription this month', 'user', 'client', NOW() - INTERVAL '1 hour 30 minutes' + INTERVAL '1 minute'),
('web_client_london_002', 'session_london_002', 'web', 'I apologize for this billing error. Let me check your account. Can you provide your account email or customer ID?', 'bot', 'client', NOW() - INTERVAL '1 hour 30 minutes' + INTERVAL '1 minute 25 seconds'),
('web_client_london_002', 'session_london_002', 'web', 'My email is john.smith@email.com', 'user', 'client', NOW() - INTERVAL '1 hour 30 minutes' + INTERVAL '2 minutes'),
('web_client_london_002', 'session_london_002', 'web', 'Thank you. I''ve located your account and can see the duplicate charge. I''ll process a refund for the extra charge within 3-5 business days. You''ll receive a confirmation email shortly.', 'bot', 'client', NOW() - INTERVAL '1 hour 30 minutes' + INTERVAL '2 minutes 30 seconds'),

-- Conversation 3: Spanish client from Madrid
('web_client_madrid_003', 'session_madrid_003', 'web', 'Hola, necesito ayuda con la configuración', 'user', 'client', NOW() - INTERVAL '45 minutes'),
('web_client_madrid_003', 'session_madrid_003', 'web', '¡Hola! Estaré encantado de ayudarte con la configuración. ¿Qué aspecto específico necesitas configurar?', 'bot', 'client', NOW() - INTERVAL '45 minutes' + INTERVAL '20 seconds'),
('web_client_madrid_003', 'session_madrid_003', 'web', 'Quiero cambiar el idioma de la interfaz', 'user', 'client', NOW() - INTERVAL '45 minutes' + INTERVAL '1 minute'),
('web_client_madrid_003', 'session_madrid_003', 'web', 'Perfecto. Para cambiar el idioma, ve a Configuración > Idioma en el menú principal. Allí podrás seleccionar español como idioma predeterminado.', 'bot', 'client', NOW() - INTERVAL '45 minutes' + INTERVAL '1 minute 20 seconds'),

-- Conversation 4: German client from Berlin
('web_client_berlin_004', 'session_berlin_004', 'web', 'Guten Tag, ich habe Fragen zur Premium-Version', 'user', 'client', NOW() - INTERVAL '30 minutes'),
('web_client_berlin_004', 'session_berlin_004', 'web', 'Guten Tag! Gerne helfe ich Ihnen bei Fragen zur Premium-Version. Was möchten Sie wissen?', 'bot', 'client', NOW() - INTERVAL '30 minutes' + INTERVAL '15 seconds'),
('web_client_berlin_004', 'session_berlin_004', 'web', 'Was sind die Hauptunterschiede zur kostenlosen Version?', 'user', 'client', NOW() - INTERVAL '30 minutes' + INTERVAL '45 seconds'),
('web_client_berlin_004', 'session_berlin_004', 'web', 'Die Premium-Version bietet: unbegrenzte Nachrichten, erweiterte Analytics, Priority-Support und Zugang zu allen KI-Features. Möchten Sie mehr Details zu einem bestimmten Feature?', 'bot', 'client', NOW() - INTERVAL '30 minutes' + INTERVAL '1 minute 10 seconds'),

-- Conversation 5: Italian client from Rome
('web_client_rome_005', 'session_rome_005', 'web', 'Ciao, ho problemi con l''integrazione WhatsApp', 'user', 'client', NOW() - INTERVAL '15 minutes'),
('web_client_rome_005', 'session_rome_005', 'web', 'Ciao! Mi dispiace sentire dei problemi con l''integrazione WhatsApp. Posso aiutarti a risolverli. Che tipo di errore stai riscontrando?', 'bot', 'client', NOW() - INTERVAL '15 minutes' + INTERVAL '18 seconds'),
('web_client_rome_005', 'session_rome_005', 'web', 'Non riesco a connettere il mio numero business', 'user', 'client', NOW() - INTERVAL '15 minutes' + INTERVAL '1 minute'),
('web_client_rome_005', 'session_rome_005', 'web', 'Per connettere il numero WhatsApp Business, assicurati di avere: 1) Access Token valido, 2) Phone Number ID corretto, 3) Webhook configurato. Hai verificato questi elementi?', 'bot', 'client', NOW() - INTERVAL '15 minutes' + INTERVAL '1 minute 25 seconds'),

-- Conversation 6: Portuguese client from Lisbon
('web_client_lisbon_006', 'session_lisbon_006', 'web', 'Olá, preciso de ajuda com relatórios', 'user', 'client', NOW() - INTERVAL '10 minutes'),
('web_client_lisbon_006', 'session_lisbon_006', 'web', 'Olá! Ficarei feliz em ajudar com os relatórios. Que tipo de relatório você precisa gerar?', 'bot', 'client', NOW() - INTERVAL '10 minutes' + INTERVAL '22 seconds'),
('web_client_lisbon_006', 'session_lisbon_006', 'web', 'Quero exportar dados de conversas dos últimos 30 dias', 'user', 'client', NOW() - INTERVAL '10 minutes' + INTERVAL '50 seconds'),
('web_client_lisbon_006', 'session_lisbon_006', 'web', 'Para exportar dados de conversas: vá para Analytics > Conversas > Exportar. Selecione o período de 30 dias e escolha o formato CSV ou Excel. O download iniciará automaticamente.', 'bot', 'client', NOW() - INTERVAL '10 minutes' + INTERVAL '1 minute 15 seconds'),

-- Conversation 7: Dutch client from Amsterdam
('web_client_amsterdam_007', 'session_amsterdam_007', 'web', 'Hallo, ik wil mijn abonnement upgraden', 'user', 'client', NOW() - INTERVAL '5 minutes'),
('web_client_amsterdam_007', 'session_amsterdam_007', 'web', 'Hallo! Ik help je graag met het upgraden van je abonnement. Naar welk plan wil je upgraden?', 'bot', 'client', NOW() - INTERVAL '5 minutes' + INTERVAL '12 seconds'),
('web_client_amsterdam_007', 'session_amsterdam_007', 'web', 'Naar het Enterprise plan', 'user', 'client', NOW() - INTERVAL '5 minutes' + INTERVAL '35 seconds'),
('web_client_amsterdam_007', 'session_amsterdam_007', 'web', 'Uitstekende keuze! Het Enterprise plan biedt onbeperkte berichten, geavanceerde analytics en 24/7 support. Ik stuur je de upgrade-link via email.', 'bot', 'client', NOW() - INTERVAL '5 minutes' + INTERVAL '58 seconds'),

-- Conversation 8: Recent active conversation from New York
('web_client_newyork_008', 'session_newyork_008', 'web', 'Hi, I''m having trouble with the quiz module', 'user', 'client', NOW() - INTERVAL '2 minutes'),
('web_client_newyork_008', 'session_newyork_008', 'web', 'Hi there! I''m here to help with the quiz module. What specific issue are you encountering?', 'bot', 'client', NOW() - INTERVAL '2 minutes' + INTERVAL '8 seconds'),
('web_client_newyork_008', 'session_newyork_008', 'web', 'The questions aren''t loading properly', 'user', 'client', NOW() - INTERVAL '1 minute 30 seconds'),
('web_client_newyork_008', 'session_newyork_008', 'web', 'I see the issue. This usually happens when there are no questions configured yet. Let me check your quiz setup and guide you through creating your first questions.', 'bot', 'client', NOW() - INTERVAL '1 minute 15 seconds'),

-- Conversation 9: Recent conversation from Tokyo
('web_client_tokyo_009', 'session_tokyo_009', 'web', 'こんにちは、アカウント設定について質問があります', 'user', 'client', NOW() - INTERVAL '1 minute'),
('web_client_tokyo_009', 'session_tokyo_009', 'web', 'こんにちは！アカウント設定についてお手伝いします。どのような設定についてご質問がありますか？', 'bot', 'client', NOW() - INTERVAL '45 seconds'),

-- Conversation 10: Very recent conversation from Sydney
('web_client_sydney_010', 'session_sydney_010', 'web', 'G''day! Need help with campaign setup', 'user', 'client', NOW() - INTERVAL '30 seconds'),
('web_client_sydney_010', 'session_sydney_010', 'web', 'G''day! I''d be happy to help you set up your campaign. What type of campaign are you looking to create?', 'bot', 'client', NOW() - INTERVAL '15 seconds'),

-- Additional conversations for better data variety
-- Conversation 11: Technical support from Canada
('web_client_toronto_011', 'session_toronto_011', 'web', 'Hello, I''m getting API errors', 'user', 'client', NOW() - INTERVAL '3 hours'),
('web_client_toronto_011', 'session_toronto_011', 'web', 'Hello! I''m sorry to hear about the API errors. Can you share the specific error message you''re seeing?', 'bot', 'client', NOW() - INTERVAL '3 hours' + INTERVAL '20 seconds'),
('web_client_toronto_011', 'session_toronto_011', 'web', 'Error 401: Unauthorized when trying to send messages', 'user', 'client', NOW() - INTERVAL '3 hours' + INTERVAL '1 minute'),
('web_client_toronto_011', 'session_toronto_011', 'web', 'This error indicates an authentication issue. Please check: 1) Your API key is correct, 2) Your WhatsApp access token hasn''t expired, 3) Your phone number ID is properly configured.', 'bot', 'client', NOW() - INTERVAL '3 hours' + INTERVAL '1 minute 35 seconds'),

-- Conversation 12: Billing inquiry from Brazil
('web_client_saopaulo_012', 'session_saopaulo_012', 'web', 'Olá, tenho dúvidas sobre a cobrança', 'user', 'client', NOW() - INTERVAL '4 hours'),
('web_client_saopaulo_012', 'session_saopaulo_012', 'web', 'Olá! Estou aqui para esclarecer suas dúvidas sobre cobrança. Em que posso ajudá-lo?', 'bot', 'client', NOW() - INTERVAL '4 hours' + INTERVAL '15 seconds'),
('web_client_saopaulo_012', 'session_saopaulo_012', 'web', 'Por que fui cobrado duas vezes este mês?', 'user', 'client', NOW() - INTERVAL '4 hours' + INTERVAL '45 seconds'),
('web_client_saopaulo_012', 'session_saopaulo_012', 'web', 'Peço desculpas por essa cobrança duplicada. Vou verificar sua conta e processar o estorno. Você receberá um email de confirmação em breve.', 'bot', 'client', NOW() - INTERVAL '4 hours' + INTERVAL '1 minute 10 seconds'),

-- Conversation 13: Feature request from India
('web_client_mumbai_013', 'session_mumbai_013', 'web', 'Hi, can you add support for Hindi language?', 'user', 'client', NOW() - INTERVAL '6 hours'),
('web_client_mumbai_013', 'session_mumbai_013', 'web', 'Hello! Thank you for your suggestion about Hindi language support. This is a great feature request that I''ll forward to our development team for consideration.', 'bot', 'client', NOW() - INTERVAL '6 hours' + INTERVAL '28 seconds'),
('web_client_mumbai_013', 'session_mumbai_013', 'web', 'When can we expect this feature?', 'user', 'client', NOW() - INTERVAL '6 hours' + INTERVAL '1 minute 15 seconds'),
('web_client_mumbai_013', 'session_mumbai_013', 'web', 'While I can''t provide a specific timeline, feature requests are typically reviewed quarterly. You''ll be notified via email when new language support is added.', 'bot', 'client', NOW() - INTERVAL '6 hours' + INTERVAL '1 minute 45 seconds'),

-- Conversation 14: Integration help from South Africa
('web_client_capetown_014', 'session_capetown_014', 'web', 'Hello, need help integrating the chatbot on my website', 'user', 'client', NOW() - INTERVAL '8 hours'),
('web_client_capetown_014', 'session_capetown_014', 'web', 'Hello! I''d be happy to help you integrate the chatbot on your website. Are you looking to add the web widget or API integration?', 'bot', 'client', NOW() - INTERVAL '8 hours' + INTERVAL '22 seconds'),
('web_client_capetown_014', 'session_capetown_014', 'web', 'I want to add the web widget to my WordPress site', 'user', 'client', NOW() - INTERVAL '8 hours' + INTERVAL '1 minute'),
('web_client_capetown_014', 'session_capetown_014', 'web', 'Perfect! For WordPress: 1) Go to Customer Service > Web Integration, 2) Copy the embed code, 3) Add it to your theme''s footer.php before </body>, or use a plugin like "Insert Headers and Footers".', 'bot', 'client', NOW() - INTERVAL '8 hours' + INTERVAL '1 minute 30 seconds'),

-- Conversation 15: Performance question from Singapore
('web_client_singapore_015', 'session_singapore_015', 'web', 'Hi, the dashboard is loading slowly', 'user', 'client', NOW() - INTERVAL '12 hours'),
('web_client_singapore_015', 'session_singapore_015', 'web', 'Hi! I understand the dashboard performance concern. Let me help optimize this. How many contacts/conversations do you typically have?', 'bot', 'client', NOW() - INTERVAL '12 hours' + INTERVAL '18 seconds'),
('web_client_singapore_015', 'session_singapore_015', 'web', 'Around 10,000 contacts and 500 daily conversations', 'user', 'client', NOW() - INTERVAL '12 hours' + INTERVAL '50 seconds'),
('web_client_singapore_015', 'session_singapore_015', 'web', 'With that volume, I recommend: 1) Enable pagination in settings, 2) Use date filters to limit data loads, 3) Consider archiving old conversations. These steps should significantly improve performance.', 'bot', 'client', NOW() - INTERVAL '12 hours' + INTERVAL '1 minute 20 seconds');

-- Update statistics to reflect the new web conversations
-- This helps the dashboard show accurate counts
UPDATE customer_conversations 
SET response_time = EXTRACT(EPOCH FROM (
  SELECT MIN(c2.created_at) - c1.created_at 
  FROM customer_conversations c2 
  WHERE c2.web_user_id = customer_conversations.web_user_id 
  AND c2.sender = 'bot' 
  AND c2.created_at > customer_conversations.created_at 
  AND customer_conversations.sender = 'user'
))
WHERE sender = 'bot' 
AND web_user_id IS NOT NULL 
AND response_time IS NULL;