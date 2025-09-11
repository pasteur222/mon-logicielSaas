import { supabase } from './supabase';
import { createGroqClient } from './groq-config';
import { processEnhancedQuizMessage, getEnhancedQuizStatistics, getPaginatedQuizParticipants } from './quiz-enhanced';
import { 
  saveConversationMessage, 
  saveQuizAnswer, 
  getOrCreateQuizUser, 
  updateQuizUserScore,
  recalculateQuizAnalytics,
  triggerModuleUpdate 
} from './chatbot-communication';

interface QuizMessage {
  phoneNumber?: string;
  webUserId?: string;
  sessionId?: string;
  source: 'whatsapp' | 'web';
  content: string;
  sender: 'user' | 'bot';
  userAgent?: string;
}

interface QuizQuestion {
  id: string;
  text: string;
  type: 'personal' | 'preference' | 'quiz';
  options?: any;
  points?: any;
  required: boolean;
  order_index: number;
  correct_answer?: boolean;
}

/**
 * Get enhanced quiz statistics with real-time calculation
 */
export async function getEnhancedQuizStatistics(): Promise<any> {
  try {
    // Use enhanced statistics with caching
    const { getEnhancedQuizStatistics: getStats } = await import('./quiz-enhanced');
    return await getStats();
  } catch (error) {
    console.error('Error getting enhanced quiz statistics:', error);
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

/**
 * Enhanced quiz message processing with complete answer tracking
 */
export async function processQuizMessage(message: QuizMessage): Promise<QuizMessage> {
  try {
    // Use the enhanced quiz processing
    return await processEnhancedQuizMessage({
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      sessionId: message.sessionId,
      source: message.source,
      content: message.content,
      sender: message.sender,
      userAgent: message.userAgent
    });

  } catch (error) {
    console.error('❌ [QUIZ] Error in processQuizMessage:', error);
    
    return {
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      sessionId: message.sessionId,
      source: message.source,
      content: "Désolé, je rencontre des difficultés techniques. Veuillez réessayer plus tard.",
      sender: 'bot'
    };
  }
}

/**
 * Process quiz answer with complete tracking
 */
async function processQuizAnswer(
  userAnswer: string, 
  question: QuizQuestion, 
  quizUser: any
): Promise<void> {
  try {
    console.log('📝 [QUIZ] Processing answer:', {
      questionId: question.id,
      questionType: question.type,
      userAnswer,
      userId: quizUser.id
    });

    let pointsAwarded = 0;
    let isCorrect = false;

    // Process different question types
    switch (question.type) {
      case 'quiz':
        // True/False question
        const normalizedAnswer = userAnswer.toLowerCase().trim();
        const userAnswerBool = normalizedAnswer === 'vrai' || normalizedAnswer === 'true' || normalizedAnswer === 'oui';
        isCorrect = userAnswerBool === question.correct_answer;
        
        if (isCorrect && question.points?.value) {
          pointsAwarded = question.points.value;
        }
        break;

      case 'personal':
        // Personal information question - always award points for completion
        pointsAwarded = 5; // Base points for providing personal info
        isCorrect = true;
        
        // Update user profile with personal information
        await updateUserPersonalInfo(quizUser.id, question.text, userAnswer);
        break;

      case 'preference':
        // Preference question - award points and update preferences
        pointsAwarded = 3; // Base points for preferences
        isCorrect = true;
        
        // Update user preferences
        await updateUserPreferences(quizUser.id, question.text, userAnswer);
        break;
    }

    // Save the answer with complete tracking
    await saveQuizAnswer({
      user_id: quizUser.id,
      question_id: question.id,
      answer: userAnswer,
      points_awarded: pointsAwarded,
      is_correct: isCorrect
    });

    console.log('✅ [QUIZ] Answer processed:', {
      questionId: question.id,
      pointsAwarded,
      isCorrect,
      newScore: quizUser.score + pointsAwarded
    });

  } catch (error) {
    console.error('❌ [QUIZ] Error processing answer:', error);
    throw error;
  }
}

/**
 * Update user personal information from quiz answers
 */
async function updateUserPersonalInfo(userId: string, questionText: string, answer: string): Promise<void> {
  try {
    const updates: any = {};
    const lowerQuestion = questionText.toLowerCase();
    
    if (lowerQuestion.includes('nom') && !lowerQuestion.includes('prénom')) {
      updates.name = answer;
    } else if (lowerQuestion.includes('email') || lowerQuestion.includes('e-mail')) {
      updates.email = answer;
    } else if (lowerQuestion.includes('adresse')) {
      updates.address = answer;
    } else if (lowerQuestion.includes('profession') || lowerQuestion.includes('métier')) {
      updates.profession = answer;
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabase
        .from('quiz_users')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        console.error('Error updating user personal info:', error);
      } else {
        console.log('✅ [QUIZ] Updated user personal info:', updates);
      }
    }
  } catch (error) {
    console.error('Error in updateUserPersonalInfo:', error);
  }
}

/**
 * Update user preferences from quiz answers
 */
async function updateUserPreferences(userId: string, questionText: string, answer: string): Promise<void> {
  try {
    // Get current preferences
    const { data: currentUser } = await supabase
      .from('quiz_users')
      .select('preferences')
      .eq('id', userId)
      .single();

    // Ensure preferences is always an object, even if stored as string
    let currentPreferences = {};
    if (currentUser?.preferences) {
      if (typeof currentUser.preferences === 'string') {
        try {
          currentPreferences = JSON.parse(currentUser.preferences);
        } catch (parseError) {
          console.warn('Failed to parse preferences as JSON, using empty object:', parseError);
          currentPreferences = {};
        }
      } else if (typeof currentUser.preferences === 'object') {
        currentPreferences = currentUser.preferences;
      }
    }
    
    const updatedPreferences = {
      ...currentPreferences,
      [questionText]: answer,
      lastUpdated: new Date().toISOString()
    };

    const { error } = await supabase
      .from('quiz_users')
      .update({
        preferences: updatedPreferences,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      console.error('Error updating user preferences:', error);
    } else {
      console.log('✅ [QUIZ] Updated user preferences');
    }
  } catch (error) {
    console.error('Error in updateUserPreferences:', error);
  }
}

/**
 * Check if user input is an answer to the current question
 */
function isAnswerToQuestion(userInput: string, question: QuizQuestion): boolean {
  const input = userInput.toLowerCase().trim();
  
  switch (question.type) {
    case 'quiz':
      // True/False questions
      return ['vrai', 'faux', 'true', 'false', 'oui', 'non', 'yes', 'no'].includes(input);
    
    case 'personal':
    case 'preference':
      // Any non-empty response is valid for personal/preference questions
      return input.length > 0 && input !== 'skip' && input !== 'passer';
    
    default:
      return false;
  }
}

/**
 * Format quiz question for display
 */
function formatQuizQuestion(question: QuizQuestion, currentNumber: number, totalQuestions: number): string {
  let formattedQuestion = `📋 Question ${currentNumber}/${totalQuestions}\n\n${question.text}`;
  
  switch (question.type) {
    case 'quiz':
      formattedQuestion += '\n\n💡 Répondez par "Vrai" ou "Faux"';
      if (question.points?.value) {
        formattedQuestion += `\n🏆 Points possibles: ${question.points.value}`;
      }
      break;
      
    case 'personal':
      formattedQuestion += '\n\n✍️ Veuillez fournir votre réponse';
      break;
      
    case 'preference':
      if (question.options && Array.isArray(question.options)) {
        formattedQuestion += '\n\nOptions disponibles:\n';
        question.options.forEach((option: string, index: number) => {
          formattedQuestion += `${index + 1}. ${option}\n`;
        });
      }
      break;
  }
  
  return formattedQuestion;
}

/**
 * Get paginated quiz participants with enhanced filtering
 */
export async function getQuizParticipants(
  page: number = 1,
  limit: number = 20,
  filters?: {
    profile?: string;
    status?: string;
    country?: string;
    search?: string;
  }
): Promise<{
  participants: any[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}> {
  try {
    return await getPaginatedQuizParticipants(page, limit, filters);
  } catch (error) {
    console.error('Error getting quiz participants:', error);
    return {
      participants: [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1
    };
  }
}

/**
 * Reset quiz for a user (admin function)
 */
export async function resetQuizForUser(phoneNumber: string): Promise<void> {
  try {
    const { data: user, error: getUserError } = await supabase
      .from('quiz_users')
      .select('id')
      .eq('phone_number', phoneNumber)
      .single();

    if (getUserError) {
      throw new Error(`User not found: ${getUserError.message}`);
    }

    // Reset user progress
    await supabase
      .from('quiz_users')
      .update({
        score: 0,
        profile: 'discovery',
        current_step: 0,
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    // Delete previous answers
    await supabase
      .from('quiz_answers')
      .delete()
      .eq('user_id', user.id);

    // Trigger analytics update
    await recalculateQuizAnalytics();

    console.log('✅ [QUIZ] User quiz reset successfully:', phoneNumber);
  } catch (error) {
    console.error('❌ [QUIZ] Error resetting quiz for user:', error);
    throw error;
  }
}

/**
 * Check quiz chatbot health
 */
export async function checkQuizHealth(): Promise<{
  healthy: boolean;
  errors: string[];
  stats: any;
}> {
  const errors: string[] = [];
  let healthy = true;

  try {
    // Test quiz_users table
    const { error: usersError } = await supabase
      .from('quiz_users')
      .select('count')
      .limit(1);

    if (usersError) {
      errors.push(`Quiz users table: ${usersError.message}`);
      healthy = false;
    }

    // Test quiz_questions table
    const { error: questionsError } = await supabase
      .from('quiz_questions')
      .select('count')
      .limit(1);

    if (questionsError) {
      errors.push(`Quiz questions table: ${questionsError.message}`);
      healthy = false;
    }

    // Test quiz_answers table
    const { error: answersError } = await supabase
      .from('quiz_answers')
      .select('count')
      .limit(1);

    if (answersError) {
      errors.push(`Quiz answers table: ${answersError.message}`);
      healthy = false;
    }

    // Test quiz_sessions table
    const { error: sessionsError } = await supabase
      .from('quiz_sessions')
      .select('count')
      .limit(1);

    if (sessionsError) {
      errors.push(`Quiz sessions table: ${sessionsError.message}`);
      healthy = false;
    }

    // Test question_engagement table
    const { error: engagementError } = await supabase
      .from('question_engagement')
      .select('count')
      .limit(1);

    if (engagementError) {
      errors.push(`Question engagement table: ${engagementError.message}`);
      healthy = false;
    }

    // Get current statistics
    const stats = await getEnhancedQuizStatistics();

    return {
      healthy,
      errors,
      stats
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