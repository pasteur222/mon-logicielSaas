import { supabase } from './supabase';
import { createGroqClient } from './groq-config';
import { saveConversationMessage, ensureConversationSync, triggerModuleUpdate } from './chatbot-communication';

interface CustomerServiceMessage {
  phoneNumber?: string;
  webUserId?: string;
  sessionId?: string;
  source: 'whatsapp' | 'web';
  content: string;
  sender: 'user' | 'bot';
  userAgent?: string;
  web_user_id?: string;
}

/**
 * Enhanced customer service message processing with guaranteed persistence
 */
export async function processCustomerServiceMessage(message: CustomerServiceMessage): Promise<CustomerServiceMessage> {
  const startTime = Date.now();
  
  try {
    console.log('🎧 [CUSTOMER-SERVICE] Processing message from', message.source, ':', {
      hasText: !!message.content,
      source: message.source,
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      contentLength: message.content?.length || 0
    });

    // Validate input message
    if (!message.content || message.content.trim().length === 0) {
      throw new Error('Empty message content');
    }

    if (message.content.length > 4000) {
      throw new Error('Message too long (max 4000 characters)');
    }

    // Ensure conversation synchronization first
    if (message.phoneNumber) {
      await ensureConversationSync(message.phoneNumber, 'client');
    }

    // Save incoming user message immediately
    if (message.sender === 'user') {
      await saveConversationMessage({
        phone_number: message.phoneNumber,
        web_user_id: message.webUserId || message.web_user_id,
        session_id: message.sessionId,
        source: message.source,
        content: message.content,
        sender: message.sender,
        intent: 'client',
        user_agent: message.userAgent
      });
    }

    // Get user profile for Groq configuration
    let userId = null;
    
    if (message.phoneNumber) {
      // Try to get from profils_utilisateurs
      const { data: userProfile } = await supabase
        .from('profils_utilisateurs')
        .select('id')
        .eq('phone_number', message.phoneNumber)
        .maybeSingle();
      
      if (userProfile) {
        userId = userProfile.id;
      }
    }

    if (!userId) {
      // Get any available Groq configuration as fallback
      const { data: anyGroqConfig } = await supabase
        .from('user_groq_config')
        .select('user_id')
        .limit(1)
        .maybeSingle();
        
      if (anyGroqConfig) {
        userId = anyGroqConfig.user_id;
      } else {
        throw new Error('No Groq configuration found for customer service');
      }
    }

    // Create Groq client
    const groq = await createGroqClient(userId);

    // Generate response using Groq
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Vous êtes un assistant de service client professionnel pour Airtel GPT.
          Votre objectif est d'aider les clients avec leurs demandes, problèmes et questions.
          Soyez professionnel, courtois et orienté solution.
          Fournissez des instructions claires et demandez des clarifications si nécessaire.
          Si vous ne pouvez pas résoudre un problème, proposez de l'escalader vers un agent humain.
          Répondez toujours en français sauf si le client écrit dans une autre langue.
          Gardez vos réponses concises mais complètes (maximum 500 mots).
          ${message.source === 'web' ? 'L\'utilisateur vous contacte via votre site web.' : 'L\'utilisateur vous contacte via WhatsApp.'}`
        },
        { role: "user", content: message.content }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.7,
      max_tokens: 1500,
    });

    const response = completion.choices[0]?.message?.content || 
      "Je suis désolé, je n'ai pas pu générer une réponse appropriée. Un agent vous contactera bientôt.";

    // Validate and potentially truncate response
    let finalResponse = response;
    if (response.length > 4000) {
      console.warn('🎧 [CUSTOMER-SERVICE] Response too long, truncating');
      finalResponse = response.substring(0, 3997) + '...';
    }

    // Calculate response time
    const responseTime = (Date.now() - startTime) / 1000;

    // Save bot response with guaranteed persistence
    const botMessage: CustomerServiceMessage = {
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      sessionId: message.sessionId,
      source: message.source,
      content: finalResponse,
      sender: 'bot'
    };

    await saveConversationMessage({
      phone_number: botMessage.phoneNumber,
      web_user_id: botMessage.webUserId || botMessage.web_user_id,
      session_id: botMessage.sessionId,
      source: botMessage.source,
      content: finalResponse,
      sender: botMessage.sender,
      intent: 'client',
      response_time: responseTime
    });

    // Trigger customer service module update
    await triggerModuleUpdate('customer_service', {
      action: 'response_generated',
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      responseTime,
      messageLength: response.length
    });

    console.log('✅ [CUSTOMER-SERVICE] Message processed successfully');
    return botMessage;

  } catch (error) {
    console.error('❌ [CUSTOMER-SERVICE] Error processing message:', {
      error: error.message,
      source: message.source,
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      contentLength: message.content?.length || 0
    });
    
    // Save error message to ensure user gets feedback
    const errorResponse = message.source === 'web' 
      ? "Désolé, je rencontre des difficultés techniques. Veuillez actualiser la page et réessayer. Si le problème persiste, contactez notre support."
      : "Désolé, je rencontre des difficultés techniques. Un agent vous contactera bientôt.";

    try {
      await saveConversationMessage({
        phone_number: message.phoneNumber,
        web_user_id: message.webUserId,
        session_id: message.sessionId,
        source: message.source,
        content: errorResponse,
        sender: 'bot',
        intent: 'client'
      });
    } catch (saveError) {
      console.error('❌ [CUSTOMER-SERVICE] Failed to save error response:', saveError);
    }

    return {
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      sessionId: message.sessionId,
      source: message.source,
      content: errorResponse,
      sender: 'bot'
    };
  }
}

/**
 * Get customer service conversation history with retry logic
 */
export async function getCustomerServiceHistory(
  phoneNumber?: string, 
  webUserId?: string,
  limit: number = 50
): Promise<CustomerServiceMessage[]> {
  try {
    console.log('🔍 [CUSTOMER-SERVICE] Getting conversation history:', {
      phoneNumber,
      webUserId,
      limit
    });
    
    let query = supabase
      .from('customer_conversations')
      .select('*')
      .eq('intent', 'client')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (phoneNumber) {
      query = query.eq('phone_number', phoneNumber);
    } else if (webUserId) {
      query = query.eq('web_user_id', webUserId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('❌ [CUSTOMER-SERVICE] Database error getting history:', error);
      throw new Error(`Failed to get conversation history: ${error.message}`);
    }

    console.log(`✅ [CUSTOMER-SERVICE] Retrieved ${data?.length || 0} conversation records`);
    return (data || []).map(conv => ({
      phoneNumber: conv.phone_number,
      webUserId: conv.web_user_id || conv.webUserId,
      web_user_id: conv.web_user_id,
      sessionId: conv.session_id,
      source: conv.source || 'whatsapp',
      content: conv.content,
      sender: conv.sender,
      userAgent: conv.user_agent
    }));

  } catch (error) {
    console.error('Error getting customer service history:', error);
    return [];
  }
}

/**
 * Delete customer service conversations by IDs
 */
export async function deleteCustomerServiceConversations(conversationIds: string[]): Promise<{
  success: boolean;
  deletedCount: number;
  error?: string;
}> {
  try {
    console.log('🗑️ [CUSTOMER-SERVICE] Starting deletion for IDs:', conversationIds);
    
    if (!conversationIds || conversationIds.length === 0) {
      throw new Error('No conversation IDs provided for deletion');
    }

    // Validate and categorize IDs before sending to RPC
    const validIds = conversationIds.filter(id => id && id.trim() !== '');
    
    if (validIds.length === 0) {
      throw new Error('No valid conversation IDs provided');
    }

    console.log('🗑️ [CUSTOMER-SERVICE] Validated IDs for deletion:', validIds);

    // Use the improved database function for safe deletion
    const { data: deletionResult, error: deleteError } = await supabase
      .rpc('delete_conversations_by_mixed_ids', {
        conversation_ids: validIds,
        target_intent: 'client'
      });

    if (deleteError) {
      console.error('❌ [CUSTOMER-SERVICE] Error deleting conversations:', deleteError);
      throw new Error(`Failed to delete conversations: ${deleteError.message}`);
    }

    // The RPC function now returns a single row with deletion counts
    const result = Array.isArray(deletionResult) ? deletionResult[0] : deletionResult;
    const deletedCount = result?.deleted_count || 0;
    
    console.log(`✅ [CUSTOMER-SERVICE] Successfully deleted ${deletedCount} conversations`);
    console.log('📊 [CUSTOMER-SERVICE] Deletion breakdown:', {
      total: deletedCount,
      byUuid: result?.deleted_by_uuid || 0,
      byWebId: result?.deleted_by_web_id || 0,
      byPhone: result?.deleted_by_phone || 0
    });

    return {
      success: true,
      deletedCount,
    };

  } catch (error) {
    console.error('❌ [CUSTOMER-SERVICE] Critical error in deleteCustomerServiceConversations:', error);
    return {
      success: false,
      deletedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Delete customer service conversations by timeframe
 */
export async function deleteCustomerServiceConversationsByTimeframe(
  timeframe: '1h' | '24h' | '7d' | 'all'
): Promise<{
  success: boolean;
  deletedCount: number;
  error?: string;
}> {
  try {
    console.log('🗑️ [CUSTOMER-SERVICE] Deleting conversations by timeframe:', timeframe);
    
    let timeframeHours: number;
    
    switch (timeframe) {
      case '1h':
        timeframeHours = 1;
        break;
      case '24h':
        timeframeHours = 24;
        break;
      case '7d':
        timeframeHours = 7 * 24;
        break;
      case 'all':
        timeframeHours = 0; // Special case for all conversations
        break;
      default:
        timeframeHours = 24;
    }

    console.log(`📅 [CUSTOMER-SERVICE] Deleting conversations from last ${timeframeHours} hours (0 = all)`);

    // Use the improved database function for timeframe deletion
    const { data: deletionResult, error } = await supabase
      .rpc('delete_conversations_by_timeframe', {
        timeframe_hours: timeframeHours,
        target_intent: 'client'
      });

    if (error) {
      console.error('❌ [CUSTOMER-SERVICE] Error deleting conversations by timeframe:', error);
      throw new Error(`Failed to delete conversations: ${error.message}`);
    }

    const result = Array.isArray(deletionResult) ? deletionResult[0] : deletionResult;
    const deletedCount = result?.deleted_count || 0;
    
    console.log(`✅ [CUSTOMER-SERVICE] Successfully deleted ${deletedCount} conversations for timeframe ${timeframe}`);

    return {
      success: true,
      deletedCount,
    };

  } catch (error) {
    console.error('❌ [CUSTOMER-SERVICE] Critical error in deleteCustomerServiceConversationsByTimeframe:', error);
    return {
      success: false,
      deletedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Check customer service chatbot health
 */
export async function checkCustomerServiceHealth(): Promise<{
  healthy: boolean;
  errors: string[];
  stats: any;
}> {
  const errors: string[] = [];
  let healthy = true;

  try {
    // Test database connectivity
    const { data: testData, error: testError } = await supabase
      .from('customer_conversations')
      .select('count')
      .eq('intent', 'client')
      .limit(1);

    if (testError) {
      errors.push(`Database connectivity: ${testError.message}`);
      healthy = false;
    }

    // Get basic stats
    const { data: stats } = await supabase
      .from('customer_conversations')
      .select('*')
      .eq('intent', 'client')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const totalMessages = stats?.length || 0;
    const userMessages = stats?.filter(m => m.sender === 'user').length || 0;
    const botMessages = stats?.filter(m => m.sender === 'bot').length || 0;
    const avgResponseTime = stats?.filter(m => m.response_time)
      .reduce((sum, m) => sum + m.response_time, 0) / Math.max(1, botMessages);

    return {
      healthy,
      errors,
      stats: {
        totalMessages,
        userMessages,
        botMessages,
        avgResponseTime: avgResponseTime || 0,
        lastActivity: stats?.[0]?.created_at || null
      }
    };

  } catch (error) {
    errors.push(`Health check failed: ${error.message}`);
    return {
      healthy: false,
      errors,
      stats: {}
    };
  }
}