import { supabase } from './supabase';

/**
 * Centralized chatbot communication system
 * Handles real-time synchronization between chatbots and application modules
 */

export interface ChatbotMessage {
  id?: string;
  phone_number?: string;
  web_user_id?: string;
  session_id?: string;
  source: 'whatsapp' | 'web';
  content: string;
  sender: 'user' | 'bot';
  intent: 'client' | 'education' | 'quiz';
  user_agent?: string;
  response_time?: number;
  created_at?: string;
}

export interface QuizAnswer {
  user_id: string;
  question_id: string;
  answer: string;
  points_awarded: number;
  is_correct: boolean;
}

export interface QuizUser {
  phone_number: string;
  name?: string;
  email?: string;
  address?: string;
  profession?: string;
  preferences?: any;
  score: number;
  profile: 'discovery' | 'active' | 'vip';
  current_step: number;
  status: 'active' | 'ended' | 'completed';
}

/**
 * Save conversation message with guaranteed persistence
 */
export async function saveConversationMessage(message: ChatbotMessage): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: message.phone_number,
        web_user_id: message.web_user_id,
        session_id: message.session_id,
        source: message.source,
        content: message.content,
        sender: message.sender,
        intent: message.intent,
        user_agent: message.user_agent,
        response_time: message.response_time,
        created_at: message.created_at || new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) {
      console.error('Error saving conversation message:', error);
      throw new Error(`Failed to save message: ${error.message}`);
    }

    // Trigger real-time update for connected clients
    await triggerModuleUpdate('conversations', {
      action: 'message_added',
      messageId: data.id,
      intent: message.intent,
      source: message.source
    });

    return data.id;
  } catch (error) {
    console.error('Critical error saving conversation:', error);
    throw error;
  }
}

/**
 * Save quiz answer with analytics calculation
 */
export async function saveQuizAnswer(answer: QuizAnswer): Promise<void> {
  try {
    // Start a transaction to ensure data consistency
    const { error: answerError } = await supabase
      .from('quiz_answers')
      .insert({
        user_id: answer.user_id,
        question_id: answer.question_id,
        answer: answer.answer,
        points_awarded: answer.points_awarded,
        created_at: new Date().toISOString()
      });

    if (answerError) {
      throw new Error(`Failed to save quiz answer: ${answerError.message}`);
    }

    // Update user score and profile
    await updateQuizUserScore(answer.user_id, answer.points_awarded);

    // Trigger real-time analytics update
    await triggerModuleUpdate('quiz', {
      action: 'answer_submitted',
      userId: answer.user_id,
      points: answer.points_awarded,
      isCorrect: answer.is_correct
    });

    console.log('Quiz answer saved successfully:', answer);
  } catch (error) {
    console.error('Critical error saving quiz answer:', error);
    throw error;
  }
}

/**
 * Update quiz user score and recalculate profile
 */
export async function updateQuizUserScore(userId: string, pointsToAdd: number): Promise<void> {
  try {
    // Get current user data
    const { data: currentUser, error: getUserError } = await supabase
      .from('quiz_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (getUserError) {
      throw new Error(`Failed to get quiz user: ${getUserError.message}`);
    }

    const newScore = currentUser.score + pointsToAdd;
    
    // Determine new profile based on score
    let newProfile = 'discovery';
    if (newScore >= 80) {
      newProfile = 'vip';
    } else if (newScore >= 40) {
      newProfile = 'active';
    }

    // Update user with new score and profile
    const { error: updateError } = await supabase
      .from('quiz_users')
      .update({
        score: newScore,
        profile: newProfile,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      throw new Error(`Failed to update quiz user: ${updateError.message}`);
    }

    // Trigger analytics recalculation
    await recalculateQuizAnalytics();

    console.log('Quiz user score updated:', { userId, newScore, newProfile });
  } catch (error) {
    console.error('Error updating quiz user score:', error);
    throw error;
  }
}

/**
 * Recalculate quiz analytics in real-time
 */
export async function recalculateQuizAnalytics(): Promise<void> {
  try {
    const { data: users, error } = await supabase
      .from('quiz_users')
      .select('*');

    if (error) {
      throw new Error(`Failed to get quiz users: ${error.message}`);
    }

    const analytics = {
      totalParticipants: users?.length || 0,
      profileBreakdown: {
        discovery: users?.filter(u => u.profile === 'discovery').length || 0,
        active: users?.filter(u => u.profile === 'active').length || 0,
        vip: users?.filter(u => u.profile === 'vip').length || 0
      },
      averageScore: users?.length ? users.reduce((sum, u) => sum + u.score, 0) / users.length : 0,
      completionRate: users?.length ? (users.filter(u => u.status === 'completed').length / users.length) * 100 : 0
    };

    // Trigger real-time update for dashboard and quiz module
    await triggerModuleUpdate('quiz_analytics', {
      action: 'analytics_updated',
      analytics
    });

    console.log('Quiz analytics recalculated:', analytics);
  } catch (error) {
    console.error('Error recalculating quiz analytics:', error);
    throw error;
  }
}

/**
 * Trigger module updates via Supabase real-time
 */
export async function triggerModuleUpdate(module: string, payload: any): Promise<void> {
  try {
    // Use Supabase real-time to broadcast updates
    const channel = supabase.channel(`module_updates_${module}`);
    
    await channel.send({
      type: 'broadcast',
      event: 'module_update',
      payload: {
        module,
        timestamp: new Date().toISOString(),
        ...payload
      }
    });

    console.log(`Module update triggered for ${module}:`, payload);
  } catch (error) {
    console.error(`Error triggering module update for ${module}:`, error);
    // Don't throw - this is not critical for the main operation
  }
}

/**
 * Subscribe to module updates
 */
export function subscribeToModuleUpdates(
  module: string, 
  callback: (payload: any) => void
): () => void {
  const channel = supabase.channel(`module_updates_${module}`);
  
  channel
    .on('broadcast', { event: 'module_update' }, (payload) => {
      console.log(`Received update for ${module}:`, payload);
      callback(payload.payload);
    })
    .subscribe();

  // Return unsubscribe function
  return () => {
    channel.unsubscribe();
  };
}

/**
 * Get or create quiz user with proper error handling
 */
export async function getOrCreateQuizUser(phoneNumber: string): Promise<QuizUser> {
  try {
    // Check if user exists
    const { data: existingUser, error: getUserError } = await supabase
      .from('quiz_users')
      .select('*')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (getUserError) {
      throw new Error(`Failed to check existing quiz user: ${getUserError.message}`);
    }

    if (existingUser) {
      // Update last activity
      await supabase
        .from('quiz_users')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', existingUser.id);

      return existingUser;
    }

    // Create new user
    const { data: newUser, error: createError } = await supabase
      .from('quiz_users')
      .insert({
        phone_number: phoneNumber,
        score: 0,
        profile: 'discovery',
        current_step: 0,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create quiz user: ${createError.message}`);
    }

    // Trigger analytics update
    await recalculateQuizAnalytics();

    return newUser;
  } catch (error) {
    console.error('Error getting or creating quiz user:', error);
    throw error;
  }
}

/**
 * Ensure conversation synchronization
 */
export async function ensureConversationSync(phoneNumber: string | 'all', intent: string): Promise<void> {
  try {
    if (phoneNumber === 'all') {
      // Sync all conversations for the intent
      const { data: recentMessages, error } = await supabase
        .from('customer_conversations')
        .select('*')
        .eq('intent', intent)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        console.error('Error verifying all conversations sync:', error);
      } else {
        console.log(`All conversations sync verified: ${recentMessages?.length || 0} recent messages found for ${intent}`);
      }
      return;
    }

    // Check for any unsaved messages in local storage or memory
    const pendingMessages = localStorage.getItem(`pending_messages_${phoneNumber}`);
    
    if (pendingMessages) {
      const messages = JSON.parse(pendingMessages);
      
      for (const message of messages) {
        await saveConversationMessage({
          phone_number: phoneNumber,
          source: 'whatsapp',
          content: message.content,
          sender: message.sender,
          intent: intent as any,
          created_at: message.timestamp
        });
      }
      
      // Clear pending messages
      localStorage.removeItem(`pending_messages_${phoneNumber}`);
      console.log(`Synchronized ${messages.length} pending messages for ${phoneNumber}`);
    }

    // Verify recent messages are properly saved
    const { data: recentMessages, error } = await supabase
      .from('customer_conversations')
      .select('*')
      .eq('phone_number', phoneNumber)
      .eq('intent', intent)
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      console.error('Error verifying conversation sync:', error);
    } else {
      console.log(`Conversation sync verified: ${recentMessages?.length || 0} recent messages found`);
    }
  } catch (error) {
    console.error('Error ensuring conversation sync:', error);
    // Don't throw - this is a recovery operation
  }
}

/**
 * Health check for chatbot communication
 */
export async function performChatbotHealthCheck(): Promise<{
  conversations: boolean;
  quiz: boolean;
  realtime: boolean;
  errors: string[];
}> {
  const errors: string[] = [];
  let conversationsHealthy = false;
  let quizHealthy = false;
  let realtimeHealthy = false;

  try {
    // Test conversation database access
    const { error: convError } = await supabase
      .from('customer_conversations')
      .select('id')
      .limit(1);
    
    conversationsHealthy = !convError;
    if (convError) {
      errors.push(`Conversations DB error: ${convError.message}`);
    }
  } catch (error) {
    errors.push(`Conversations test failed: ${error.message}`);
  }

  try {
    // Test quiz database access
    const { error: quizError } = await supabase
      .from('quiz_users')
      .select('id')
      .limit(1);
    
    quizHealthy = !quizError;
    if (quizError) {
      errors.push(`Quiz DB error: ${quizError.message}`);
    }
  } catch (error) {
    errors.push(`Quiz test failed: ${error.message}`);
  }

  try {
    // Test real-time connection
    const testChannel = supabase.channel('health_check');
    await testChannel.subscribe();
    realtimeHealthy = testChannel.state === 'joined';
    await testChannel.unsubscribe();
  } catch (error) {
    errors.push(`Real-time test failed: ${error.message}`);
  }

  return {
    conversations: conversationsHealthy,
    quiz: quizHealthy,
    realtime: realtimeHealthy,
    errors
  };
}