import { supabase } from './supabase';

export interface ConversationMessage {
  id: string;
  phone_number?: string;
  web_user_id?: string;
  session_id?: string;
  source?: 'whatsapp' | 'web';
  content: string;
  sender: 'user' | 'bot';
  intent?: string;
  response_time?: number;
  created_at: string;
  user_agent?: string;
}

export interface ConversationThread {
  participantId: string;
  participantType: 'whatsapp' | 'web';
  participantInfo: {
    name?: string;
    phone_number?: string;
    web_user_id?: string;
    country?: string;
    location?: string;
    session_id?: string;
  };
  messages: ConversationMessage[];
  lastActivity: string;
  messageCount: number;
  userMessageCount: number;
  botMessageCount: number;
  status: 'active' | 'recent' | 'inactive';
  averageResponseTime: number;
  firstMessageTime: string;
}

/**
 * Process raw conversations into structured conversation threads
 */
export function processConversationsIntoThreads(conversations: ConversationMessage[]): ConversationThread[] {
  const conversationMap = new Map<string, ConversationThread>();

  // Group messages by participant
  conversations.forEach(message => {
    const participantId = message.phone_number || message.web_user_id || 'unknown';
    const participantType = message.source === 'web' || message.web_user_id ? 'web' : 'whatsapp';
    
    if (!conversationMap.has(participantId)) {
      // Extract participant info
      const participantInfo: ConversationThread['participantInfo'] = {};
      
      if (participantType === 'whatsapp') {
        participantInfo.phone_number = message.phone_number;
        participantInfo.country = extractCountryFromPhone(message.phone_number || '');
        // Try to extract name from previous messages or user data
        participantInfo.name = extractNameFromConversation(conversations, participantId);
      } else {
        participantInfo.web_user_id = message.web_user_id;
        participantInfo.session_id = message.session_id;
        participantInfo.location = extractLocationFromUserAgent(message.user_agent);
      }

      conversationMap.set(participantId, {
        participantId,
        participantType,
        participantInfo,
        messages: [],
        lastActivity: message.created_at,
        messageCount: 0,
        userMessageCount: 0,
        botMessageCount: 0,
        status: 'inactive',
        averageResponseTime: 0,
        firstMessageTime: message.created_at
      });
    }

    const conversation = conversationMap.get(participantId)!;
    conversation.messages.push(message);
    conversation.messageCount++;
    
    if (message.sender === 'user') {
      conversation.userMessageCount++;
    } else {
      conversation.botMessageCount++;
    }

    // Update last activity
    if (new Date(message.created_at) > new Date(conversation.lastActivity)) {
      conversation.lastActivity = message.created_at;
    }

    // Update first message time
    if (new Date(message.created_at) < new Date(conversation.firstMessageTime)) {
      conversation.firstMessageTime = message.created_at;
    }
  });

  // Process each conversation
  const threads = Array.from(conversationMap.values()).map(conversation => {
    // Sort messages by date (oldest first for proper conversation flow)
    conversation.messages.sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Calculate status based on last activity
    const timeSinceLastMessage = Date.now() - new Date(conversation.lastActivity).getTime();
    const hoursAgo = timeSinceLastMessage / (1000 * 60 * 60);
    
    if (hoursAgo < 1) {
      conversation.status = 'active';
    } else if (hoursAgo < 24) {
      conversation.status = 'recent';
    } else {
      conversation.status = 'inactive';
    }

    // Calculate average response time
    const botMessages = conversation.messages.filter(m => m.sender === 'bot' && m.response_time);
    conversation.averageResponseTime = botMessages.length > 0
      ? botMessages.reduce((sum, m) => sum + (m.response_time || 0), 0) / botMessages.length
      : 0;

    return conversation;
  });

  // Sort by last activity (most recent first)
  threads.sort((a, b) => 
    new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
  );

  return threads;
}

/**
 * Extract country from phone number
 */
export function extractCountryFromPhone(phoneNumber: string): string {
  const countryMap: Record<string, string> = {
    '+242': 'Congo',
    '+221': 'Sénégal',
    '+223': 'Mali',
    '+224': 'Guinée',
    '+225': 'Côte d\'Ivoire',
    '+226': 'Burkina Faso',
    '+227': 'Niger',
    '+228': 'Togo',
    '+229': 'Bénin',
    '+230': 'Maurice',
    '+231': 'Liberia',
    '+232': 'Sierra Leone',
    '+233': 'Ghana',
    '+234': 'Nigeria',
    '+235': 'Tchad',
    '+236': 'Centrafrique',
    '+237': 'Cameroun',
    '+238': 'Cap-Vert',
    '+239': 'São Tomé',
    '+240': 'Guinée Équatoriale',
    '+241': 'Gabon',
    '+243': 'RD Congo',
    '+244': 'Angola',
    '+245': 'Guinée-Bissau',
    '+248': 'Seychelles',
    '+249': 'Soudan',
    '+250': 'Rwanda',
    '+251': 'Éthiopie',
    '+252': 'Somalie',
    '+253': 'Djibouti',
    '+254': 'Kenya',
    '+255': 'Tanzanie',
    '+256': 'Ouganda',
    '+257': 'Burundi',
    '+258': 'Mozambique',
    '+260': 'Zambie',
    '+261': 'Madagascar',
    '+262': 'Réunion',
    '+263': 'Zimbabwe',
    '+264': 'Namibie',
    '+265': 'Malawi',
    '+266': 'Lesotho',
    '+267': 'Botswana',
    '+268': 'Eswatini',
    '+269': 'Comores'
  };

  for (const [code, country] of Object.entries(countryMap)) {
    if (phoneNumber.startsWith(code)) {
      return country;
    }
  }
  return 'Inconnu';
}

/**
 * Extract name from conversation history (basic implementation)
 */
function extractNameFromConversation(conversations: ConversationMessage[], participantId: string): string | undefined {
  // Look for messages where the user might have mentioned their name
  const userMessages = conversations.filter(
    msg => (msg.phone_number === participantId || msg.web_user_id === participantId) && msg.sender === 'user'
  );

  for (const message of userMessages) {
    const content = message.content.toLowerCase();
    // Simple pattern matching for name introduction
    const namePatterns = [
      /je m'appelle ([a-zA-ZÀ-ÿ\s]+)/i,
      /mon nom est ([a-zA-ZÀ-ÿ\s]+)/i,
      /je suis ([a-zA-ZÀ-ÿ\s]+)/i,
      /my name is ([a-zA-ZÀ-ÿ\s]+)/i,
      /i am ([a-zA-ZÀ-ÿ\s]+)/i
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Basic validation: name should be 2-50 characters and not contain numbers
        if (name.length >= 2 && name.length <= 50 && !/\d/.test(name)) {
          return name.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
        }
      }
    }
  }

  return undefined;
}

/**
 * Extract location from user agent (basic implementation)
 */
function extractLocationFromUserAgent(userAgent?: string): string {
  if (!userAgent) return 'Web';
  
  // Basic location extraction from user agent
  // In a real implementation, you might use IP geolocation
  const locationHints = [
    { pattern: /fr-fr|france/i, location: 'France' },
    { pattern: /en-us|united states/i, location: 'États-Unis' },
    { pattern: /en-gb|united kingdom/i, location: 'Royaume-Uni' },
    { pattern: /es-es|spain/i, location: 'Espagne' },
    { pattern: /de-de|germany/i, location: 'Allemagne' },
    { pattern: /it-it|italy/i, location: 'Italie' },
    { pattern: /pt-br|brazil/i, location: 'Brésil' },
    { pattern: /ar-sa|saudi/i, location: 'Arabie Saoudite' }
  ];

  for (const hint of locationHints) {
    if (hint.pattern.test(userAgent)) {
      return hint.location;
    }
  }

  return 'Web';
}

/**
 * Get conversation statistics
 */
export function getConversationStatistics(threads: ConversationThread[]) {
  const stats = {
    total: threads.length,
    whatsapp: threads.filter(t => t.participantType === 'whatsapp').length,
    web: threads.filter(t => t.participantType === 'web').length,
    active: threads.filter(t => t.status === 'active').length,
    recent: threads.filter(t => t.status === 'recent').length,
    inactive: threads.filter(t => t.status === 'inactive').length,
    averageResponseTime: 0,
    totalMessages: threads.reduce((sum, t) => sum + t.messageCount, 0),
    averageMessagesPerConversation: 0
  };

  if (threads.length > 0) {
    const allResponseTimes = threads
      .map(t => t.averageResponseTime)
      .filter(time => time > 0);
    
    stats.averageResponseTime = allResponseTimes.length > 0
      ? allResponseTimes.reduce((sum, time) => sum + time, 0) / allResponseTimes.length
      : 0;

    stats.averageMessagesPerConversation = stats.totalMessages / threads.length;
  }

  return stats;
}

/**
 * Search conversations by content, participant info, or metadata
 */
export function searchConversations(
  threads: ConversationThread[], 
  searchTerm: string
): ConversationThread[] {
  if (!searchTerm.trim()) return threads;

  const term = searchTerm.toLowerCase();
  
  return threads.filter(thread => {
    // Search in participant info
    const participantMatch = 
      thread.participantInfo.phone_number?.toLowerCase().includes(term) ||
      thread.participantInfo.web_user_id?.toLowerCase().includes(term) ||
      thread.participantInfo.name?.toLowerCase().includes(term) ||
      thread.participantInfo.country?.toLowerCase().includes(term) ||
      thread.participantInfo.location?.toLowerCase().includes(term);

    if (participantMatch) return true;

    // Search in message content
    const messageMatch = thread.messages.some(message => 
      message.content.toLowerCase().includes(term)
    );

    return messageMatch;
  });
}

/**
 * Filter conversations by various criteria
 */
export function filterConversations(
  threads: ConversationThread[],
  filters: {
    source?: 'all' | 'whatsapp' | 'web';
    status?: 'all' | 'active' | 'recent' | 'inactive';
    timeRange?: 'all' | '1h' | '24h' | '7d' | '30d';
  }
): ConversationThread[] {
  let filtered = [...threads];

  // Filter by source
  if (filters.source && filters.source !== 'all') {
    filtered = filtered.filter(thread => thread.participantType === filters.source);
  }

  // Filter by status
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter(thread => thread.status === filters.status);
  }

  // Filter by time range
  if (filters.timeRange && filters.timeRange !== 'all') {
    const now = new Date();
    let cutoffTime: Date;

    switch (filters.timeRange) {
      case '1h':
        cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
        break;
      case '24h':
        cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        cutoffTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        return filtered;
    }

    filtered = filtered.filter(thread => 
      new Date(thread.lastActivity) >= cutoffTime
    );
  }

  return filtered;
}

/**
 * Get conversation analytics
 */
export async function getConversationAnalytics(intent: string = 'client') {
  try {
    const { data: conversations, error } = await supabase
      .from('customer_conversations')
      .select('*')
      .eq('intent', intent)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

    if (error) throw error;

    const threads = processConversationsIntoThreads(conversations || []);
    const stats = getConversationStatistics(threads);

    // Additional analytics
    const analytics = {
      ...stats,
      totalMessages: conversations?.length || 0,
      conversationsByDay: getConversationsByDay(conversations || []),
      responseTimeDistribution: getResponseTimeDistribution(conversations || []),
      popularTopics: getPopularTopics(conversations || []),
      peakHours: getPeakHours(conversations || []),
      averageConversationDuration: getAverageConversationDuration(threads),
      resolutionRate: getResolutionRate(threads)
    };

    return analytics;
  } catch (error) {
    console.error('Error getting conversation analytics:', error);
    // Return default analytics instead of throwing to prevent dashboard crashes
    return {
      totalMessages: 0,
      total: 0,
      whatsapp: 0,
      web: 0,
      active: 0,
      recent: 0,
      inactive: 0,
      averageResponseTime: 0,
      averageMessagesPerConversation: 0,
      conversationsByDay: {},
      responseTimeDistribution: { fast: 0, medium: 0, slow: 0 },
      popularTopics: [],
      peakHours: {},
      averageConversationDuration: 0,
      resolutionRate: 0
    };
  }
}

function getConversationsByDay(conversations: ConversationMessage[]) {
  const dayMap = new Map<string, number>();
  
  conversations.forEach(conv => {
    const day = new Date(conv.created_at).toISOString().split('T')[0];
    dayMap.set(day, (dayMap.get(day) || 0) + 1);
  });

  return Object.fromEntries(dayMap);
}

function getResponseTimeDistribution(conversations: ConversationMessage[]) {
  const botMessages = conversations.filter(m => m.sender === 'bot' && m.response_time);
  
  const distribution = {
    fast: 0,    // < 2s
    medium: 0,  // 2-5s
    slow: 0     // > 5s
  };

  botMessages.forEach(msg => {
    const time = msg.response_time || 0;
    if (time < 2) {
      distribution.fast++;
    } else if (time <= 5) {
      distribution.medium++;
    } else {
      distribution.slow++;
    }
  });

  return distribution;
}

function getPopularTopics(conversations: ConversationMessage[]) {
  const topicMap = new Map<string, number>();
  
  conversations.forEach(conv => {
    if (conv.intent) {
      topicMap.set(conv.intent, (topicMap.get(conv.intent) || 0) + 1);
    }
  });

  return Array.from(topicMap.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));
}

function getPeakHours(conversations: ConversationMessage[]) {
  const hourMap = new Map<number, number>();
  
  conversations.forEach(conv => {
    const hour = new Date(conv.created_at).getHours();
    hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
  });

  return Object.fromEntries(hourMap);
}

function getAverageConversationDuration(threads: ConversationThread[]): number {
  const durations = threads.map(thread => {
    if (thread.messages.length < 2) return 0;
    
    const firstMessage = new Date(thread.firstMessageTime);
    const lastMessage = new Date(thread.lastActivity);
    return (lastMessage.getTime() - firstMessage.getTime()) / (1000 * 60); // Duration in minutes
  }).filter(duration => duration > 0);

  return durations.length > 0 
    ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length
    : 0;
}

function getResolutionRate(threads: ConversationThread[]): number {
  // A conversation is considered "resolved" if the last message is from the bot
  // and there's been no user response for more than 1 hour
  const now = new Date();
  const resolvedConversations = threads.filter(thread => {
    if (thread.messages.length === 0) return false;
    
    const lastMessage = thread.messages[thread.messages.length - 1];
    const timeSinceLastMessage = now.getTime() - new Date(lastMessage.created_at).getTime();
    const hoursAgo = timeSinceLastMessage / (1000 * 60 * 60);
    
    return lastMessage.sender === 'bot' && hoursAgo > 1;
  });

  return threads.length > 0 ? (resolvedConversations.length / threads.length) * 100 : 0;
}