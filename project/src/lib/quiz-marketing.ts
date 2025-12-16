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
    // Use the robust question manager
    const { createQuizQuestion: createQuizQuestionRobust } = await import('./quiz-question-manager');
    const result = await createQuizQuestionRobust(question);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to create question');
    }
  } catch (error) {
    console.error('Error creating quiz question:', error);
    throw error;
  }
}

export async function updateQuizQuestion(id: number, updates: Partial<QuizQuestion>): Promise<void> {
  try {
    // Import validation function from the robust manager
    const { validateQuizQuestionData } = await import('./quiz-question-manager');
    
    // Validate updates if they include core question data
    if (updates.text || updates.type) {
      const validation = validateQuizQuestionData({
        text: updates.text || '',
        type: updates.type || 'personal',
        required: updates.required !== undefined ? updates.required : true,
        order_index: updates.order_index || 0,
        options: updates.options,
        points: updates.points,
        correct_answer: updates.correct_answer,
        category: updates.category
      });
      
      if (!validation.isValid) {
        throw new Error(`Invalid question updates: ${validation.errors.join(', ')}`);
      }
    }

    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('quiz_questions')
      .update(updateData)
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
    // Use the robust question manager
    const { deleteQuizQuestion: deleteQuizQuestionRobust } = await import('./quiz-question-manager');
    const result = await deleteQuizQuestionRobust(id);
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete question');
    }
  } catch (error) {
    console.error('Error deleting quiz question:', error);
    throw error;
  }
}

export async function sendQuizToNumbers(phoneNumbers: string[], userId?: string): Promise<void> {
  try {
    console.log('📤 [QUIZ-MARKETING] Starting to send quiz invitations:', {
      phoneCount: phoneNumbers.length,
      userId: userId || 'not provided'
    });

    if (!phoneNumbers || phoneNumbers.length === 0) {
      throw new Error('No phone numbers provided');
    }

    // Get user's app settings for personalized messaging
    let appName = 'notre plateforme';
    try {
      const { data: appSettings } = await supabase
        .from('app_settings')
        .select('app_name')
        .limit(1)
        .maybeSingle();

      if (appSettings?.app_name) {
        appName = appSettings.app_name;
      }
    } catch (error) {
      console.warn('⚠️ [QUIZ-MARKETING] Could not fetch app name, using default');
    }

    // Get total number of quiz questions
    const { count: questionCount } = await supabase
      .from('quiz_questions')
      .select('*', { count: 'exact', head: true });

    // Create quiz invitation message
    const quizInvitationMessage = `🎮 **Bienvenue au Quiz Interactif de ${appName}!**

Nous sommes ravis de vous inviter à participer à notre quiz exclusif !

📝 **Comment participer :**
1. Répondez simplement "Game" pour commencer
2. Répondez aux ${questionCount || 'quelques'} questions
3. Obtenez votre score et votre profil

🎯 **Pourquoi participer ?**
✅ Découvrez votre profil personnalisé
✅ Gagnez des points
✅ Recevez des recommandations adaptées
✅ Participez aux classements

⏱️ **Temps estimé :** ${Math.ceil((questionCount || 5) * 0.5)} minutes

💬 **Pour commencer, répondez simplement :**
**"Game"**

Bonne chance ! 🍀`;

    // Import sendWhatsAppMessages function
    const { sendWhatsAppMessages } = await import('./whatsapp');

    // Prepare messages for all phone numbers
    const messages = phoneNumbers.map(phoneNumber => ({
      phoneNumber: phoneNumber.trim(),
      message: quizInvitationMessage
    }));

    console.log('📨 [QUIZ-MARKETING] Sending quiz invitations to', messages.length, 'recipients');

    // Send messages via WhatsApp
    const results = await sendWhatsAppMessages(messages, userId);

    // Count successes and failures
    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'error').length;

    console.log('✅ [QUIZ-MARKETING] Quiz invitations sent:', {
      total: results.length,
      successful: successCount,
      failed: failureCount
    });

    // Track quiz sending action for each successful recipient
    if (userId) {
      for (const result of results) {
        if (result.status === 'success') {
          try {
            await trackChatbotUsage(result.phoneNumber, 'quiz');
          } catch (trackingError) {
            console.warn('⚠️ [QUIZ-MARKETING] Failed to track chatbot usage:', trackingError);
          }
        }
      }
    }

    // Log all results to message_logs for tracking
    for (const result of results) {
      try {
        await supabase.from('message_logs').insert({
          status: result.status === 'success' ? 'sent' : 'failed',
          phone_number: result.phoneNumber,
          message_preview: 'Quiz invitation: ' + quizInvitationMessage.substring(0, 80),
          message_id: result.messageId || null,
          error: result.error || null,
          created_at: new Date().toISOString(),
          metadata: {
            campaign_type: 'quiz_invitation',
            user_id: userId,
            timestamp: result.timestamp.toISOString()
          }
        });
      } catch (logError) {
        console.warn('⚠️ [QUIZ-MARKETING] Failed to log message result:', logError);
      }
    }

    // Throw error if all messages failed
    if (failureCount === results.length) {
      throw new Error(`Failed to send quiz invitations to all ${failureCount} recipients. Check your WhatsApp configuration.`);
    }

    // Partial success notification
    if (failureCount > 0) {
      console.warn(`⚠️ [QUIZ-MARKETING] Partial success: ${successCount} sent, ${failureCount} failed`);
    }

    console.log('🎉 [QUIZ-MARKETING] Quiz campaign completed successfully');
  } catch (error) {
    console.error('❌ [QUIZ-MARKETING] Error sending quiz to numbers:', error);
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