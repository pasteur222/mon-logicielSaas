import { supabase } from './supabase';
import { checkSubscriptionStatus } from './subscription'; 
import { createGroqClient } from './groq-config'; 
import { trackChatbotUsage } from './chatbot-router';

// Rate limit error response
export const RATE_LIMIT_ERROR = {
  "code": "rate-limited",
  "message": "You have hit the rate limit. Please upgrade to keep chatting.",
  "providerLimitHit": false,
  "isRetryable": true
};

export interface QuizQuestion {
  id: number;
  text: string;
  type: 'personal' | 'preference' | 'quiz';
  options?: any;
  points?: any;
  required: boolean;
  order_index: number;
  correct_answer?: boolean;
  category?: string;
  created_at: string;
}

export interface QuizUser {
  id: number;
  phone_number: string;
  name?: string;
  email?: string;
  address?: string;
  profession?: string;
  preferences?: any;
  score: number;
  profile: string;
  current_step: number;
  status: 'active' | 'ended' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface QuizStats {
  totalParticipants: number;
  profileBreakdown: { discovery: number; active: number; vip: number };
  averageScore: number;
  completionRate: number;
  accuracyRate: number;
  averageTimePerQuestion: number;
  dropOffRate: number;
  countryDistribution: Record<string, number>;
  engagementMetrics: {
    averageSessionDuration: number;
    questionsPerSession: number;
    returnRate: number;
  };
}

export function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'personal':
      return 'Personnel';
    case 'preference':
      return 'Préférence';
    case 'quiz':
      return 'Quiz';
    case 'product_test':
      return 'Test Produit';
    default:
      return 'Inconnu';
  }
}

export async function getQuizStats(): Promise<QuizStats> {
  try {
    // Import the enhanced statistics function
    const { getEnhancedQuizStatistics } = await import('./quiz-enhanced');
    return await getEnhancedQuizStatistics();
  } catch (error) {
    console.error('Error getting quiz stats:', error);
    return {
      totalParticipants: 0,
      profileBreakdown: { discovery: 0, active: 0, vip: 0 },
      averageScore: 0,
      completionRate: 0,
      accuracyRate: 0,
      averageTimePerQuestion: 0,
      dropOffRate: 0,
      countryDistribution: {},
      engagementMetrics: {
        averageSessionDuration: 0,
        questionsPerSession: 0,
        returnRate: 0
      }
    };
  }
}

export async function createQuizQuestion(question: Omit<QuizQuestion, 'id' | 'created_at'>): Promise<void> {
  try {
    // Import and use the enhanced question creation function
    const { createEnhancedQuizQuestion } = await import('./quiz-enhanced');
    await createEnhancedQuizQuestion(question);
  } catch (error) {
    console.error('Error creating quiz question:', error);
    throw error;
  }
}

export async function updateQuizQuestion(id: number, updates: Partial<QuizQuestion>): Promise<void> {
  try {
    // Import validation function
    const { validateQuizQuestion } = await import('./quiz-validation');
    
    // Validate updates if they include core question data
    if (updates.text || updates.type) {
      const validation = validateQuizQuestion({
        text: updates.text || '',
        type: updates.type || 'personal',
        required: updates.required !== undefined ? updates.required : true,
        order_index: updates.order_index || 0
      });
      
      if (!validation.isValid) {
        throw new Error(`Invalid question updates: ${validation.errors.join(', ')}`);
      }
    }

    const { error } = await supabase
      .from('quiz_questions')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
    
    // Invalidate cache after update
    const { invalidateQuizCache } = await import('./quiz-statistics-cache');
    await invalidateQuizCache();
  } catch (error) {
    console.error('Error updating quiz question:', error);
    throw error;
  }
}

export async function deleteQuizQuestion(id: number): Promise<void> {
  try {
    const { error } = await supabase
      .from('quiz_questions')
      .delete()
      .eq('id', id);

    if (error) throw error;
    
    // Invalidate cache after deletion
    const { invalidateQuizCache } = await import('./quiz-statistics-cache');
    await invalidateQuizCache();
  } catch (error) {
    console.error('Error deleting quiz question:', error);
    throw error;
  }
}

export async function sendQuizToNumbers(phoneNumbers: string[], userId?: string): Promise<void> {
  try {
    // Implementation for sending quiz to phone numbers
    console.log('Sending quiz to numbers:', phoneNumbers);
    
    // This would integrate with the WhatsApp API to send quiz invitations
    // For now, we'll just log the action
    
    // Track the quiz sending action
    if (userId) {
      await trackChatbotUsage(phoneNumbers[0], 'quiz');
    }
  } catch (error) {
    console.error('Error sending quiz to numbers:', error);
    throw error;
  }
}

export async function exportQuizResults(): Promise<string> {
  try {
    // Get all participants with pagination
    const { getQuizParticipants } = await import('./quiz-chatbot');
    const result = await getQuizParticipants(1, 1000); // Get up to 1000 for export
    const users = result.participants;

    // Create CSV content
    const headers = [
      'Phone Number', 'Web User ID', 'Name', 'Email', 'Address', 'Profession', 
      'Country', 'Score', 'Profile', 'Status', 'Engagement Level', 
      'Total Sessions', 'Last Session', 'Created At'
    ];
    const csvRows = [headers.join(',')];

    users.forEach(user => {
      const row = [
        user.phone_number || '',
        user.web_user_id || '',
        user.name || '',
        user.email || '',
        user.address || '',
        user.profession || '',
        user.country || '',
        user.score.toString(),
        user.profile,
        user.status,
        user.engagement_level || 'low',
        (user.total_sessions || 0).toString(),
        user.last_session_at ? new Date(user.last_session_at).toLocaleString() : '',
        new Date(user.created_at).toLocaleString()
      ].map(value => `"${value.replace(/"/g, '""')}"`);
      
      csvRows.push(row.join(','));
    });

    return csvRows.join('\n');
  } catch (error) {
    console.error('Error exporting quiz results:', error);
    throw error;
  }
}