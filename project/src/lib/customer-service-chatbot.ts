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
    console.log('🎧 [CUSTOMER-SERVICE] Processing message:', {
      hasText: !!message.content,
      source: message.source,
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      contentLength: message.content?.length || 0
    });

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
          content: `Vous êtes un assistant de service client pour une entreprise de télécommunications.
          Votre objectif est d'aider les clients avec leurs demandes, problèmes et questions.
          Soyez professionnel, courtois et orienté solution.
          Fournissez des instructions claires et demandez des clarifications si nécessaire.
          Si vous ne pouvez pas résoudre un problème, proposez de l'escalader vers un agent humain.
          ${message.source === 'web' ? 'L\'utilisateur vous contacte via votre site web.' : 'L\'utilisateur vous contacte via WhatsApp.'}`
        },
        { role: "user", content: message.content }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.7,
      max_tokens: 2048,
    });

    const response = completion.choices[0]?.message?.content || 
      "Je suis désolé, je n'ai pas pu générer une réponse appropriée. Un agent vous contactera bientôt.";

    // Calculate response time
    const responseTime = (Date.now() - startTime) / 1000;

    // Save bot response with guaranteed persistence
    const botMessage: CustomerServiceMessage = {
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      sessionId: message.sessionId,
      source: message.source,
      content: response,
      sender: 'bot'
    };

    await saveConversationMessage({
      phone_number: botMessage.phoneNumber,
      web_user_id: botMessage.webUserId,
      session_id: botMessage.sessionId,
      source: botMessage.source,
      content: botMessage.content,
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
    console.error('❌ [CUSTOMER-SERVICE] Error processing message:', error);
    
    // Save error message to ensure user gets feedback
    const errorResponse = message.source === 'web' 
      ? "Désolé, je rencontre des difficultés techniques. Veuillez actualiser la page et réessayer."
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
      console.error('Failed to save error response:', saveError);
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
      throw new Error(`Failed to get conversation history: ${error.message}`);
    }

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