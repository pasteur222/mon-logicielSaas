/*
  # Add Web Client Conversations for Testing

  1. New Data
    - Add sample web client conversations to demonstrate the new conversation threading
    - Include both user and bot messages for realistic conversation flows
    - Add proper web_user_id and session_id for web clients
    - Include various conversation scenarios (support, questions, etc.)

  2. Data Structure
    - Web clients identified by web_user_id starting with 'web_'
    - Source field set to 'web' for web conversations
    - Session IDs for grouping related messages
    - Realistic timestamps for conversation flow

  3. Conversation Scenarios
    - Technical support conversations
    - Product inquiries
    - Billing questions
    - General information requests
*/

-- Insert sample web client conversations
INSERT INTO customer_conversations (
  web_user_id,
  session_id,
  source,
  content,
  sender,
  intent,
  response_time,
  created_at
) VALUES
-- Conversation 1: Technical Support
('web_client_001', 'session_tech_001', 'web', 'Bonjour, j''ai un problème avec mon compte. Je n''arrive pas à me connecter.', 'user', 'client', NULL, NOW() - INTERVAL '2 hours'),
('web_client_001', 'session_tech_001', 'web', 'Bonjour ! Je comprends votre problème de connexion. Pouvez-vous me dire quel message d''erreur vous voyez exactement ?', 'bot', 'client', 1.2, NOW() - INTERVAL '2 hours' + INTERVAL '1 minute'),
('web_client_001', 'session_tech_001', 'web', 'Il me dit "Mot de passe incorrect" mais je suis sûr que c''est le bon mot de passe.', 'user', 'client', NULL, NOW() - INTERVAL '2 hours' + INTERVAL '3 minutes'),
('web_client_001', 'session_tech_001', 'web', 'Je vais vous aider à résoudre cela. Essayez de réinitialiser votre mot de passe en cliquant sur "Mot de passe oublié" sur la page de connexion. Vous recevrez un email avec les instructions.', 'bot', 'client', 0.8, NOW() - INTERVAL '2 hours' + INTERVAL '4 minutes'),
('web_client_001', 'session_tech_001', 'web', 'Parfait, ça a marché ! Merci beaucoup pour votre aide.', 'user', 'client', NULL, NOW() - INTERVAL '2 hours' + INTERVAL '8 minutes'),
('web_client_001', 'session_tech_001', 'web', 'Excellent ! Je suis ravi d''avoir pu vous aider. N''hésitez pas à nous contacter si vous avez d''autres questions.', 'bot', 'client', 0.6, NOW() - INTERVAL '2 hours' + INTERVAL '9 minutes'),

-- Conversation 2: Product Inquiry
('web_client_002', 'session_product_001', 'web', 'Salut ! Je voudrais en savoir plus sur vos forfaits business.', 'user', 'client', NULL, NOW() - INTERVAL '4 hours'),
('web_client_002', 'session_product_001', 'web', 'Bonjour ! Je serais ravi de vous présenter nos forfaits business. Nous avons trois plans : Basique (70 000 FCFA), Pro (200 000 FCFA) et Entreprise (300 000 FCFA). Quel type d''entreprise avez-vous ?', 'bot', 'client', 1.5, NOW() - INTERVAL '4 hours' + INTERVAL '30 seconds'),
('web_client_002', 'session_product_001', 'web', 'J''ai une petite entreprise de vente en ligne. Qu''est-ce qui est inclus dans le plan Pro ?', 'user', 'client', NULL, NOW() - INTERVAL '4 hours' + INTERVAL '2 minutes'),
('web_client_002', 'session_product_001', 'web', 'Le plan Pro est parfait pour votre activité ! Il inclut : messages WhatsApp illimités, chatbot service client avec IA, base de connaissances personnalisable, analyses détaillées et support prioritaire. Voulez-vous que je vous envoie plus de détails ?', 'bot', 'client', 1.1, NOW() - INTERVAL '4 hours' + INTERVAL '3 minutes'),

-- Conversation 3: Billing Question
('web_client_003', 'session_billing_001', 'web', 'Bonjour, j''ai une question sur ma facture du mois dernier.', 'user', 'client', NULL, NOW() - INTERVAL '1 day'),
('web_client_003', 'session_billing_001', 'web', 'Bonjour ! Je vais vous aider avec votre question de facturation. Pouvez-vous me préciser quel élément de votre facture vous pose question ?', 'bot', 'client', 0.9, NOW() - INTERVAL '1 day' + INTERVAL '45 seconds'),
('web_client_003', 'session_billing_001', 'web', 'Je vois des frais supplémentaires que je ne comprends pas.', 'user', 'client', NULL, NOW() - INTERVAL '1 day' + INTERVAL '2 minutes'),
('web_client_003', 'session_billing_001', 'web', 'Je comprends votre préoccupation. Les frais supplémentaires peuvent être liés à des services additionnels ou des dépassements. Je vais transférer votre demande à notre service facturation qui vous contactera dans les 24h avec tous les détails.', 'bot', 'client', 1.3, NOW() - INTERVAL '1 day' + INTERVAL '3 minutes'),

-- Conversation 4: General Information
('web_client_004', 'session_info_001', 'web', 'Bonjour, est-ce que vos services fonctionnent dans tous les pays d''Afrique ?', 'user', 'client', NULL, NOW() - INTERVAL '6 hours'),
('web_client_004', 'session_info_001', 'web', 'Bonjour ! Nos services couvrent actuellement 14 pays africains principalement en Afrique de l''Ouest et Centrale. Nous travaillons constamment à étendre notre couverture. Dans quel pays souhaitez-vous utiliser nos services ?', 'bot', 'client', 1.0, NOW() - INTERVAL '6 hours' + INTERVAL '1 minute'),
('web_client_004', 'session_info_001', 'web', 'Au Maroc, est-ce que c''est disponible ?', 'user', 'client', NULL, NOW() - INTERVAL '6 hours' + INTERVAL '3 minutes'),
('web_client_004', 'session_info_001', 'web', 'Le Maroc n''est pas encore dans notre zone de couverture actuelle, mais nous prévoyons d''étendre nos services en Afrique du Nord prochainement. Je peux vous inscrire sur notre liste d''attente pour être notifié dès que nous serons disponibles au Maroc.', 'bot', 'client', 1.4, NOW() - INTERVAL '6 hours' + INTERVAL '4 minutes'),

-- Conversation 5: Feature Request
('web_client_005', 'session_feature_001', 'web', 'Salut ! Est-ce que vous prévoyez d''ajouter l''intégration avec Instagram ?', 'user', 'client', NULL, NOW() - INTERVAL '30 minutes'),
('web_client_005', 'session_feature_001', 'web', 'Salut ! C''est une excellente question. L''intégration Instagram est effectivement dans notre roadmap produit. Nous nous concentrons actuellement sur l''optimisation de WhatsApp, mais Instagram est prévu pour les prochains mois. Puis-je vous demander quel usage vous en feriez ?', 'bot', 'client', 1.6, NOW() - INTERVAL '30 minutes' + INTERVAL '45 seconds'),
('web_client_005', 'session_feature_001', 'web', 'Je voudrais automatiser les réponses aux DM Instagram pour mon business.', 'user', 'client', NULL, NOW() - INTERVAL '25 minutes'),
('web_client_005', 'session_feature_001', 'web', 'Parfait ! C''est exactement le type d''usage que nous visons. Je vais noter votre demande et vous serez parmi les premiers informés quand cette fonctionnalité sera disponible. En attendant, notre module WhatsApp Business pourrait déjà vous aider énormément.', 'bot', 'client', 1.2, NOW() - INTERVAL '24 minutes'),

-- Conversation 6: Quick Question
('web_client_006', 'session_quick_001', 'web', 'Vos tarifs incluent-ils la TVA ?', 'user', 'client', NULL, NOW() - INTERVAL '15 minutes'),
('web_client_006', 'session_quick_001', 'web', 'Oui, tous nos tarifs affichés incluent déjà la TVA. Vous n''avez pas de frais supplémentaires à prévoir au moment du paiement.', 'bot', 'client', 0.7, NOW() - INTERVAL '14 minutes'),

-- Conversation 7: Complex Support Case
('web_client_007', 'session_complex_001', 'web', 'Bonjour, j''ai configuré l''API WhatsApp mais les messages ne partent pas.', 'user', 'client', NULL, NOW() - INTERVAL '3 hours'),
('web_client_007', 'session_complex_001', 'web', 'Bonjour ! Je vais vous aider à diagnostiquer ce problème. Pouvez-vous me dire si vous recevez des messages d''erreur spécifiques ? Et avez-vous vérifié que votre token d''accès est bien configuré ?', 'bot', 'client', 1.1, NOW() - INTERVAL '3 hours' + INTERVAL '1 minute'),
('web_client_007', 'session_complex_001', 'web', 'J''ai vérifié le token, il semble correct. Mais dans les logs je vois "Error 190".', 'user', 'client', NULL, NOW() - INTERVAL '3 hours' + INTERVAL '5 minutes'),
('web_client_007', 'session_complex_001', 'web', 'L''erreur 190 indique que votre token d''accès a expiré. Vous devez générer un nouveau token permanent dans votre Meta for Developers. Voulez-vous que je vous guide étape par étape ?', 'bot', 'client', 0.9, NOW() - INTERVAL '3 hours' + INTERVAL '6 minutes'),
('web_client_007', 'session_complex_001', 'web', 'Oui s''il vous plaît, un guide étape par étape serait parfait.', 'user', 'client', NULL, NOW() - INTERVAL '3 hours' + INTERVAL '8 minutes'),
('web_client_007', 'session_complex_001', 'web', 'Parfait ! Voici les étapes : 1) Connectez-vous à developers.facebook.com 2) Sélectionnez votre app WhatsApp 3) Allez dans "WhatsApp > API Setup" 4) Générez un nouveau token permanent 5) Copiez ce token dans vos paramètres. Dites-moi quand c''est fait !', 'bot', 'client', 1.8, NOW() - INTERVAL '3 hours' + INTERVAL '9 minutes'),

-- Conversation 8: Recent Active Conversation
('web_client_008', 'session_active_001', 'web', 'Bonjour ! Je teste votre chatbot, ça marche très bien !', 'user', 'client', NULL, NOW() - INTERVAL '5 minutes'),
('web_client_008', 'session_active_001', 'web', 'Bonjour ! Merci beaucoup pour ce retour positif ! Je suis ravi que notre chatbot réponde à vos attentes. Y a-t-il des fonctionnalités spécifiques que vous aimeriez tester ou des questions que vous avez ?', 'bot', 'client', 0.8, NOW() - INTERVAL '4 minutes'),
('web_client_008', 'session_active_001', 'web', 'Oui, comment puis-je intégrer ce chatbot sur mon site WordPress ?', 'user', 'client', NULL, NOW() - INTERVAL '2 minutes'),
('web_client_008', 'session_active_001', 'web', 'Excellente question ! L''intégration sur WordPress est très simple. Vous avez juste besoin de copier notre code d''intégration et le coller dans votre thème WordPress, juste avant la balise </body>. Voulez-vous que je vous donne le code personnalisé pour votre site ?', 'bot', 'client', 1.1, NOW() - INTERVAL '1 minute');