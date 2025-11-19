import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Check if a phone number has an active quiz session
 * @param phoneNumber The phone number to check
 * @returns Promise resolving to boolean indicating if there's an active session
 */
export async function checkActiveQuizSession(phoneNumber: string): Promise<boolean> {
  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase environment variables');
      return false;
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

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
      console.log('✅ [CHATBOT-UTILS] Found active quiz session for:', phoneNumber);
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
      console.log('✅ [CHATBOT-UTILS] Found active quiz user for:', phoneNumber);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in checkActiveQuizSession:', error);
    return false;
  }
}

/**
 * Determine which chatbot should handle a message based on source and session status
 * @param message The message text to analyze
 * @param source The source of the message ('whatsapp' | 'web')
 * @param phoneNumber The phone number (for WhatsApp messages)
 * @returns Promise resolving to the appropriate chatbot type
 */
export async function determineChatbotTypeFromMessage(
  message: string,
  source: 'whatsapp' | 'web',
  phoneNumber?: string
): Promise<'client' | 'quiz'> {
  // For web messages, always use customer service
  if (source === 'web') {
    console.log('🌐 [CHATBOT-UTILS] Web message detected, routing to customer service');
    return 'client';
  }

  // For WhatsApp messages, check for active quiz session first
  if (source === 'whatsapp' && phoneNumber) {
    const hasActiveQuizSession = await checkActiveQuizSession(phoneNumber);
    
    if (hasActiveQuizSession) {
      console.log('🎯 [CHATBOT-UTILS] Active quiz session found, routing to quiz chatbot');
      return 'quiz';
    }
  }

  // If no active quiz session, check for quiz trigger keywords
  if (message) {
    const lowerMessage = message.toLowerCase();
    
    const quizKeywords = [
      'quiz', 'game', 'test', 'play', 'challenge', 'question', 'answer',
      'jeu', 'défi', 'réponse', 'questionnaire'
    ];
    
    if (quizKeywords.some(keyword => lowerMessage.includes(keyword))) {
      console.log('🎯 [CHATBOT-UTILS] Quiz keywords detected, routing to quiz chatbot');
      return 'quiz';
    }
  }

  // Default to customer service for all other cases
  console.log('🎧 [CHATBOT-UTILS] No quiz session or keywords, routing to customer service');
  return 'client';
}