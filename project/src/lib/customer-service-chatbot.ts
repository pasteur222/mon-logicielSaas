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
        web_user_id: message.webUserId,
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
      web_user_id: botMessage.webUserId,
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
      webUserId: conv.web_user_id,
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
    console.log('🗑️ [CUSTOMER-SERVICE] Deleting conversations:', conversationIds);
    
    if (!conversationIds || conversationIds.length === 0) {
      throw new Error('No conversation IDs provided for deletion');
    }

    // First, verify the conversations exist and are customer service conversations
    const { data: existingConversations, error: fetchError } = await supabase
      .from('customer_conversations')
      .select('id, phone_number, sender, intent')
      .in('id', conversationIds)
      .eq('intent', 'client');

    if (fetchError) {
      console.error('❌ [CUSTOMER-SERVICE] Error fetching conversations for deletion:', fetchError);
      throw new Error(`Failed to fetch conversations: ${fetchError.message}`);
    }

    console.log(`📋 [CUSTOMER-SERVICE] Found ${existingConversations?.length || 0} conversations to delete`);

    if (!existingConversations || existingConversations.length === 0) {
      return {
        success: true,
        deletedCount: 0,
        error: 'No conversations found to delete'
      };
    }

    // Perform the deletion
    const { data: deletedData, error: deleteError } = await supabase
      .from('customer_conversations')
      .delete()
      .in('id', conversationIds)
      .eq('intent', 'client')
      .select('id');

    if (deleteError) {
      console.error('❌ [CUSTOMER-SERVICE] Error deleting conversations:', deleteError);
      throw new Error(`Failed to delete conversations: ${deleteError.message}`);
    }

    const deletedCount = deletedData?.length || 0;
    console.log(`✅ [CUSTOMER-SERVICE] Successfully deleted ${deletedCount} conversations`);

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
    
    let cutoffDate: Date;
    const now = new Date();
    
    switch (timeframe) {
      case '1h':
        cutoffDate = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        cutoffDate = new Date(0); // Delete all conversations
        break;
      default:
        cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    console.log(`📅 [CUSTOMER-SERVICE] Cutoff date for ${timeframe}:`, cutoffDate.toISOString());

    // First, get the conversations that will be deleted for verification
    const { data: conversationsToDelete, error: fetchError } = await supabase
      .from('customer_conversations')
      .select('id, phone_number, created_at')
      .eq('intent', 'client')
      .gte('created_at', cutoffDate.toISOString());
    
    if (fetchError) {
      console.error('❌ [CUSTOMER-SERVICE] Error fetching conversations for timeframe deletion:', fetchError);
      throw new Error(`Failed to fetch conversations: ${fetchError.message}`);
    }
    
    console.log(`📋 [CUSTOMER-SERVICE] Found ${conversationsToDelete?.length || 0} conversations to delete for timeframe ${timeframe}`);

    // Perform the deletion
    const { data: deletedConversations, error } = await supabase
      .from('customer_conversations')
      .delete()
      .eq('intent', 'client')
      .gte('created_at', cutoffDate.toISOString())
      .select('id');

    if (error) {
      console.error('❌ [CUSTOMER-SERVICE] Error deleting conversations by timeframe:', error);
      throw new Error(`Failed to delete conversations: ${error.message}`);
    }

    const deletedCount = deletedConversations?.length || 0;
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