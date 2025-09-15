/**
 * Conversation Memory System
 * Implements conversation context preservation with sliding window
 */

import { supabase } from './supabase';

export interface ConversationMessage {
  id: string;
  phone_number: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: string;
  message_type: 'text' | 'image' | 'document' | 'audio';
  metadata?: {
    intent?: string;
    confidence?: number;
    entities?: Record<string, any>;
    sentiment?: 'positive' | 'negative' | 'neutral';
    context_used?: string[];
  };
}

export interface ConversationContext {
  phoneNumber: string;
  messages: ConversationMessage[];
  summary: string;
  entities: Record<string, any>;
  intent_history: string[];
  sentiment_trend: ('positive' | 'negative' | 'neutral')[];
  last_updated: string;
  context_window_size: number;
}

export interface ContextWindow {
  recent_messages: ConversationMessage[];
  summary: string;
  key_entities: Record<string, any>;
  conversation_flow: string[];
  user_preferences: Record<string, any>;
}

const DEFAULT_CONTEXT_WINDOW_SIZE = 10;
const MAX_CONTEXT_WINDOW_SIZE = 50;
const CONTEXT_SUMMARY_THRESHOLD = 20;

/**
 * Get conversation context for a phone number
 */
export async function getConversationContext(
  phoneNumber: string,
  windowSize: number = DEFAULT_CONTEXT_WINDOW_SIZE
): Promise<ConversationContext | null> {
  try {
    // Get recent messages within the context window
    const { data: messages, error: messagesError } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('phone_number', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(Math.min(windowSize, MAX_CONTEXT_WINDOW_SIZE));

    if (messagesError) {
      console.error('Error fetching conversation messages:', messagesError);
      return null;
    }

    if (!messages || messages.length === 0) {
      return null;
    }

    // Reverse to get chronological order
    messages.reverse();

    // Get or create conversation summary
    const { data: contextData, error: contextError } = await supabase
      .from('conversation_contexts')
      .select('*')
      .eq('phone_number', phoneNumber)
      .single();

    let summary = '';
    let entities: Record<string, any> = {};
    let intentHistory: string[] = [];
    let sentimentTrend: ('positive' | 'negative' | 'neutral')[] = [];

    if (!contextError && contextData) {
      summary = contextData.summary || '';
      entities = contextData.entities || {};
      intentHistory = contextData.intent_history || [];
      sentimentTrend = contextData.sentiment_trend || [];
    }

    // Update context with new messages
    const updatedContext = await updateContextWithMessages(
      phoneNumber,
      messages,
      summary,
      entities,
      intentHistory,
      sentimentTrend
    );

    return {
      phoneNumber,
      messages: messages.map(msg => ({
        id: msg.id,
        phone_number: msg.phone_number,
        content: msg.content,
        sender: msg.sender,
        timestamp: msg.created_at,
        message_type: msg.message_type || 'text',
        metadata: msg.metadata
      })),
      summary: updatedContext.summary,
      entities: updatedContext.entities,
      intent_history: updatedContext.intent_history,
      sentiment_trend: updatedContext.sentiment_trend,
      last_updated: new Date().toISOString(),
      context_window_size: windowSize
    };
  } catch (error) {
    console.error('Error getting conversation context:', error);
    return null;
  }
}

/**
 * Update conversation context with new messages
 */
async function updateContextWithMessages(
  phoneNumber: string,
  messages: any[],
  existingSummary: string,
  existingEntities: Record<string, any>,
  existingIntentHistory: string[],
  existingSentimentTrend: ('positive' | 'negative' | 'neutral')[]
): Promise<{
  summary: string;
  entities: Record<string, any>;
  intent_history: string[];
  sentiment_trend: ('positive' | 'negative' | 'neutral')[];
}> {
  // Extract entities and intents from messages
  const newEntities = { ...existingEntities };
  const newIntentHistory = [...existingIntentHistory];
  const newSentimentTrend = [...existingSentimentTrend];

  for (const message of messages) {
    if (message.metadata) {
      // Update entities
      if (message.metadata.entities) {
        Object.assign(newEntities, message.metadata.entities);
      }

      // Update intent history
      if (message.metadata.intent && !newIntentHistory.includes(message.metadata.intent)) {
        newIntentHistory.push(message.metadata.intent);
        // Keep only last 10 intents
        if (newIntentHistory.length > 10) {
          newIntentHistory.shift();
        }
      }

      // Update sentiment trend
      if (message.metadata.sentiment) {
        newSentimentTrend.push(message.metadata.sentiment);
        // Keep only last 20 sentiment readings
        if (newSentimentTrend.length > 20) {
          newSentimentTrend.shift();
        }
      }
    }
  }

  // Generate or update conversation summary
  let newSummary = existingSummary;
  if (messages.length >= CONTEXT_SUMMARY_THRESHOLD || !existingSummary) {
    newSummary = await generateConversationSummary(messages, existingSummary);
  }

  // Save updated context
  await saveConversationContext(phoneNumber, {
    summary: newSummary,
    entities: newEntities,
    intent_history: newIntentHistory,
    sentiment_trend: newSentimentTrend
  });

  return {
    summary: newSummary,
    entities: newEntities,
    intent_history: newIntentHistory,
    sentiment_trend: newSentimentTrend
  };
}

/**
 * Generate conversation summary using AI
 */
async function generateConversationSummary(
  messages: any[],
  existingSummary: string = ''
): Promise<string> {
  try {
    const { generateAIResponse } = await import('./groq');
    
    const conversationText = messages
      .map(msg => `${msg.sender}: ${msg.content}`)
      .join('\n');

    const prompt = existingSummary
      ? `Mise à jour du résumé de conversation existant avec les nouveaux messages.

Résumé existant:
${existingSummary}

Nouveaux messages:
${conversationText}

Génère un résumé mis à jour qui capture:
- Les points clés de la conversation
- Les besoins/problèmes du client
- Les solutions proposées
- Le statut actuel
- Les prochaines étapes

Résumé mis à jour:`
      : `Génère un résumé concis de cette conversation client:

${conversationText}

Le résumé doit inclure:
- Le problème/besoin principal du client
- Les solutions discutées
- Le statut actuel
- Les informations importantes à retenir

Résumé:`;

    const summary = await generateAIResponse(prompt, 'conversation-summary');
    return summary.trim();
  } catch (error) {
    console.error('Error generating conversation summary:', error);
    return existingSummary; // Return existing summary on error
  }
}

/**
 * Save conversation context to database
 */
async function saveConversationContext(
  phoneNumber: string,
  context: {
    summary: string;
    entities: Record<string, any>;
    intent_history: string[];
    sentiment_trend: ('positive' | 'negative' | 'neutral')[];
  }
): Promise<void> {
  try {
    await supabase
      .from('conversation_contexts')
      .upsert({
        phone_number: phoneNumber,
        summary: context.summary,
        entities: context.entities,
        intent_history: context.intent_history,
        sentiment_trend: context.sentiment_trend,
        updated_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error saving conversation context:', error);
  }
}

/**
 * Build context window for AI processing
 */
export function buildContextWindow(context: ConversationContext): ContextWindow {
  const recentMessages = context.messages.slice(-context.context_window_size);
  
  // Extract conversation flow (sequence of intents)
  const conversationFlow = recentMessages
    .filter(msg => msg.metadata?.intent)
    .map(msg => msg.metadata!.intent!);

  // Extract user preferences from entities
  const userPreferences: Record<string, any> = {};
  Object.entries(context.entities).forEach(([key, value]) => {
    if (key.startsWith('preference_') || key.startsWith('setting_')) {
      userPreferences[key] = value;
    }
  });

  return {
    recent_messages: recentMessages,
    summary: context.summary,
    key_entities: context.entities,
    conversation_flow: conversationFlow,
    user_preferences: userPreferences
  };
}

/**
 * Format context for AI prompt
 */
export function formatContextForAI(contextWindow: ContextWindow): string {
  let contextPrompt = '';

  if (contextWindow.summary) {
    contextPrompt += `Résumé de la conversation: ${contextWindow.summary}\n\n`;
  }

  if (Object.keys(contextWindow.key_entities).length > 0) {
    contextPrompt += `Informations client:\n`;
    Object.entries(contextWindow.key_entities).forEach(([key, value]) => {
      contextPrompt += `- ${key}: ${JSON.stringify(value)}\n`;
    });
    contextPrompt += '\n';
  }

  if (contextWindow.conversation_flow.length > 0) {
    contextPrompt += `Flux de conversation: ${contextWindow.conversation_flow.join(' → ')}\n\n`;
  }

  if (contextWindow.recent_messages.length > 0) {
    contextPrompt += `Messages récents:\n`;
    contextWindow.recent_messages.forEach(msg => {
      contextPrompt += `${msg.sender}: ${msg.content}\n`;
    });
    contextPrompt += '\n';
  }

  return contextPrompt;
}

/**
 * Clean up old conversation contexts
 */
export async function cleanupOldContexts(daysToKeep: number = 30): Promise<void> {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    await supabase
      .from('conversation_contexts')
      .delete()
      .lt('updated_at', cutoffDate.toISOString());

    console.log(`✅ Cleaned up conversation contexts older than ${daysToKeep} days`);
  } catch (error) {
    console.error('Error cleaning up old contexts:', error);
  }
}

/**
 * Get conversation analytics
 */
export async function getConversationAnalytics(
  phoneNumber: string,
  days: number = 7
): Promise<{
  message_count: number;
  avg_response_time: number;
  sentiment_distribution: Record<string, number>;
  top_intents: Array<{ intent: string; count: number }>;
  engagement_score: number;
}> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: messages, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('phone_number', phoneNumber)
      .gte('created_at', startDate.toISOString());

    if (error || !messages) {
      return {
        message_count: 0,
        avg_response_time: 0,
        sentiment_distribution: {},
        top_intents: [],
        engagement_score: 0
      };
    }

    // Calculate metrics
    const messageCount = messages.length;
    const sentimentDistribution: Record<string, number> = {};
    const intentCounts: Record<string, number> = {};
    let totalResponseTime = 0;
    let responseTimeCount = 0;

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      // Count sentiments
      if (message.metadata?.sentiment) {
        sentimentDistribution[message.metadata.sentiment] = 
          (sentimentDistribution[message.metadata.sentiment] || 0) + 1;
      }

      // Count intents
      if (message.metadata?.intent) {
        intentCounts[message.metadata.intent] = 
          (intentCounts[message.metadata.intent] || 0) + 1;
      }

      // Calculate response times (bot responses to user messages)
      if (message.sender === 'bot' && i > 0 && messages[i-1].sender === 'user') {
        const responseTime = new Date(message.created_at).getTime() - 
                           new Date(messages[i-1].created_at).getTime();
        totalResponseTime += responseTime;
        responseTimeCount++;
      }
    }

    const avgResponseTime = responseTimeCount > 0 ? totalResponseTime / responseTimeCount : 0;
    
    const topIntents = Object.entries(intentCounts)
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Calculate engagement score (0-100)
    const engagementScore = Math.min(100, Math.round(
      (messageCount / days) * 10 + // Messages per day
      (Object.keys(intentCounts).length * 5) + // Intent diversity
      ((sentimentDistribution.positive || 0) / messageCount * 50) // Positive sentiment ratio
    ));

    return {
      message_count: messageCount,
      avg_response_time: Math.round(avgResponseTime / 1000), // Convert to seconds
      sentiment_distribution: sentimentDistribution,
      top_intents: topIntents,
      engagement_score: engagementScore
    };
  } catch (error) {
    console.error('Error calculating conversation analytics:', error);
    return {
      message_count: 0,
      avg_response_time: 0,
      sentiment_distribution: {},
      top_intents: [],
      engagement_score: 0
    };
  }
}