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
    console.log('🎯 [QUIZ-MARKETING] Starting quiz campaign to numbers:', {
      phoneCount: phoneNumbers.length,
      userId: userId || 'system',
      numbers: phoneNumbers.slice(0, 3).map(n => n.substring(0, 8) + '***') // Log first 3 numbers (masked)
    });

    // Validate phone numbers format
    const invalidNumbers = phoneNumbers.filter(phone => 
      !phone.match(/^\+[1-9]\d{1,14}$/)
    );
    
    if (invalidNumbers.length > 0) {
      throw new Error(`Invalid phone numbers detected: ${invalidNumbers.join(', ')}`);
    }

    // Prepare quiz invitation message
    const quizInvitationMessage = `🎯 Participez à notre Quiz Marketing Interactif!

Découvrez nos produits et services tout en gagnant des points!

✨ Comment ça marche:
• Répondez à nos questions simples
• Gagnez des points selon vos réponses
• Obtenez votre profil marketing personnalisé

🏆 Profils disponibles:
• DISCOVERY (0-39 pts): Nouveau prospect
• ACTIVE (40-79 pts): Client engagé  
• VIP (80+ pts): Client premium

Tapez "quiz" ou "commencer" pour démarrer!`;

    // Import WhatsApp sending function
    const { sendWhatsAppMessages } = await import('./whatsapp');
    
    // Prepare messages for sending
    const messagesToSend = phoneNumbers.map(phoneNumber => ({
      phoneNumber: phoneNumber.trim(),
      message: quizInvitationMessage
    }));

    console.log('📤 [QUIZ-MARKETING] Sending quiz invitations via WhatsApp:', {
      messageCount: messagesToSend.length,
      messageLength: quizInvitationMessage.length
    });

    // Send messages via WhatsApp
    const results = await sendWhatsAppMessages(messagesToSend, userId);
    
    // Analyze results
    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'error').length;
    const errors = results
      .filter(r => r.status === 'error')
      .map(r => r.error)
      .filter(Boolean);

    console.log('📊 [QUIZ-MARKETING] Quiz campaign results:', {
      total: results.length,
      successful: successCount,
      failed: failureCount,
      errors: errors.slice(0, 3) // Log first 3 errors
    });

    // Log individual results for debugging
    results.forEach((result, index) => {
      if (result.status === 'success') {
        console.log(`✅ [QUIZ-MARKETING] Message ${index + 1} sent successfully:`, {
          phoneNumber: result.phoneNumber.substring(0, 8) + '***',
          messageId: result.messageId
        });
      } else {
        console.error(`❌ [QUIZ-MARKETING] Message ${index + 1} failed:`, {
          phoneNumber: result.phoneNumber.substring(0, 8) + '***',
          error: result.error
        });
      }
    });

    // Throw error if all messages failed
    if (failureCount === results.length) {
      throw new Error(`All quiz invitations failed to send. Errors: ${errors.slice(0, 3).join(', ')}`);
    }

    // Throw error if more than 50% failed
    if (failureCount > successCount) {
      throw new Error(`Quiz campaign partially failed: ${successCount} sent, ${failureCount} failed. First errors: ${errors.slice(0, 2).join(', ')}`);
    }
    
    console.log('✅ [QUIZ-MARKETING] Quiz campaign completed successfully:', {
      successfulSends: successCount,
      failedSends: failureCount,
      successRate: `${((successCount / results.length) * 100).toFixed(1)}%`
    });
    
    // Track the quiz campaign action
    if (userId) {
      await trackChatbotUsage(phoneNumbers[0], undefined, 'quiz');
    }

  } catch (error) {
    console.error('❌ [QUIZ-MARKETING] Critical error in sendQuizToNumbers:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      phoneCount: phoneNumbers.length,
      userId
    });
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