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
  latestParticipants: QuizUser[];
}

export function getQuestionTypeLabel(type: string): string {
  switch (type) {
    case 'personal':
      return 'Personnel';
    case 'preference':
      return 'Préférence';
    case 'quiz':
      return 'Quiz';
    default:
      return 'Inconnu';
  }
}

export async function getQuizStats(): Promise<QuizStats> {
  try {
    const { data: users, error } = await supabase
      .from('quiz_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const totalParticipants = users?.length || 0;
    const profileBreakdown = {
      discovery: users?.filter(u => u.profile === 'discovery').length || 0,
      active: users?.filter(u => u.profile === 'active').length || 0,
      vip: users?.filter(u => u.profile === 'vip').length || 0
    };

    const averageScore = totalParticipants > 0
      ? users!.reduce((sum, user) => sum + user.score, 0) / totalParticipants
      : 0;

    const completedUsers = users?.filter(u => u.status === 'completed').length || 0;
    const completionRate = totalParticipants > 0 ? (completedUsers / totalParticipants) * 100 : 0;

    return {
      totalParticipants,
      profileBreakdown,
      averageScore,
      completionRate,
      latestParticipants: users?.slice(0, 10) || []
    };
  } catch (error) {
    console.error('Error getting quiz stats:', error);
    return {
      totalParticipants: 0,
      profileBreakdown: { discovery: 0, active: 0, vip: 0 },
      averageScore: 0,
      completionRate: 0,
      latestParticipants: []
    };
  }
}

export async function createQuizQuestion(question: Omit<QuizQuestion, 'id' | 'created_at'>): Promise<void> {
  try {
    const { error } = await supabase
      .from('quiz_questions')
      .insert([question]);

    if (error) throw error;
  } catch (error) {
    console.error('Error creating quiz question:', error);
    throw error;
  }
}

export async function updateQuizQuestion(id: number, updates: Partial<QuizQuestion>): Promise<void> {
  try {
    const { error } = await supabase
      .from('quiz_questions')
      .update(updates)
      .eq('id', id);

    if (error) throw error;
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
    const { data: users, error } = await supabase
      .from('quiz_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Create CSV content
    const headers = ['Phone Number', 'Name', 'Email', 'Address', 'Profession', 'Score', 'Profile', 'Status', 'Created At'];
    const csvRows = [headers.join(',')];

    users?.forEach(user => {
      const row = [
        user.phone_number,
        user.name || '',
        user.email || '',
        user.address || '',
        user.profession || '',
        user.score.toString(),
        user.profile,
        user.status,
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