import { supabase } from './supabase';

// Define types of chatbots (removed education)
export type ChatbotType = 'client' | 'quiz';

// Define trigger keywords for each chatbot type (removed education keywords)
const TRIGGER_KEYWORDS = {
  CLIENT: [
    'advisor', 'issue', 'complaint', 'help', 'service', 'contact',
    'conseiller', 'problème', 'plainte', 'aide', 'service', 'contact',
    'support', 'assistance', 'billing', 'facture', 'paiement', 'recharge'
  ],
  QUIZ: [
    'quiz', 'test', 'game', 'win', 'contest', 'question', 'play', 'score',
    'jeu', 'gagner', 'concours', 'question', 'jouer', 'score', 'challenge', 'défi'
  ]
};

/**
 * Determines which chatbot should handle a message based on source and session status
 * @param message The message text to analyze
 * @param source The source of the message ('whatsapp' | 'web')
 * @param phoneNumber The phone number (for WhatsApp messages)
 * @param webUserId The web user ID (for web messages)
 * @returns Promise resolving to the appropriate chatbot type
 */
export async function determineChatbotType(
  message: string, 
  source: 'whatsapp' | 'web',
  phoneNumber?: string,
  webUserId?: string
): Promise<ChatbotType> {
  // For web messages, always use customer service
  if (source === 'web') {
    console.log('🌐 [CHATBOT-ROUTER] Web message detected, routing to customer service');
    return 'client';
  }

  // For WhatsApp messages, check for active quiz session first
  if (source === 'whatsapp' && phoneNumber) {
    const hasActiveQuizSession = await checkActiveQuizSession(phoneNumber);
    
    if (hasActiveQuizSession) {
      console.log('🎯 [CHATBOT-ROUTER] Active quiz session found, routing to quiz chatbot');
      return 'quiz';
    }
  }

  // If no active quiz session, check for quiz trigger keywords
  if (message) {
    const lowerMessage = message.toLowerCase();
    
    // Check for quiz keywords
    if (TRIGGER_KEYWORDS.QUIZ.some(keyword => lowerMessage.includes(keyword))) {
      console.log('🎯 [CHATBOT-ROUTER] Quiz keywords detected, routing to quiz chatbot');
      return 'quiz';
    }
  }

  // Default to customer service for all other cases
  console.log('🎧 [CHATBOT-ROUTER] No quiz session or keywords, routing to customer service');
  return 'client';
}

/**
 * Check if a phone number has an active quiz session
 * @param phoneNumber The phone number to check
 * @returns Promise resolving to boolean indicating if there's an active session
 */
async function checkActiveQuizSession(phoneNumber: string): Promise<boolean> {
  try {
    // Check for active quiz sessions
    const { data: activeSessions, error } = await supabase
      .from('quiz_sessions')
      .select('id, completion_status, end_time')
      .eq('phone_number', phoneNumber)
      .eq('completion_status', 'active')
      .is('end_time', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking quiz sessions:', error);
      return false;
    }

    if (activeSessions && activeSessions.length > 0) {
      console.log('✅ [CHATBOT-ROUTER] Found active quiz session for:', phoneNumber);
      return true;
    }

    // Also check quiz_users table for active status
    const { data: quizUser, error: userError } = await supabase
      .from('quiz_users')
      .select('id, status, current_step')
      .eq('phone_number', phoneNumber)
      .eq('status', 'active')
      .maybeSingle();

    if (userError) {
      console.error('Error checking quiz user status:', userError);
      return false;
    }

    if (quizUser) {
      console.log('✅ [CHATBOT-ROUTER] Found active quiz user for:', phoneNumber);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in checkActiveQuizSession:', error);
    return false;
  }
}

/**
 * Analyzes an image to determine which chatbot should handle it
 * @param imageUrl URL of the image to analyze
 * @param source The source of the message
 * @param phoneNumber The phone number (for WhatsApp messages)
 * @returns Promise resolving to the appropriate chatbot type
 */
export async function determineImageChatbotType(
  imageUrl: string, 
  source: 'whatsapp' | 'web',
  phoneNumber?: string
): Promise<ChatbotType> {
  // For web messages, always use customer service
  if (source === 'web') {
    return 'client';
  }

  // For WhatsApp messages, check for active quiz session
  if (source === 'whatsapp' && phoneNumber) {
    const hasActiveQuizSession = await checkActiveQuizSession(phoneNumber);
    
    if (hasActiveQuizSession) {
      return 'quiz';
    }
  }

  // Default to customer service for images
  return 'client';
}

/**
 * Tracks the chatbot type used for a conversation
 * @param phoneNumber The user's phone number
 * @param webUserId The web user ID
 * @param chatbotType The chatbot type that was used
 */
export async function trackChatbotUsage(
  phoneNumber: string | undefined, 
  webUserId: string | undefined,
  chatbotType: ChatbotType
): Promise<void> {
  try {
    let query = supabase
      .from('customer_conversations')
      .update({ intent: chatbotType })
      .order('created_at', { ascending: false })
      .limit(1);

    if (phoneNumber) {
      query = query.eq('phone_number', phoneNumber);
    } else if (webUserId) {
      query = query.eq('web_user_id', webUserId);
    }

    await query;
  } catch (error) {
    console.error('Error tracking chatbot usage:', error);
  }
}