import { supabase } from './supabase';
import { createGroqClient } from './groq-config';
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
 * Enhanced quiz message processing with complete answer tracking
 */
export async function processQuizMessage(message: QuizMessage): Promise<QuizMessage> {
  const startTime = Date.now();
  
  try {
    console.log('🎯 [QUIZ] Processing message:', {
      hasText: !!message.content,
      source: message.source,
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      contentLength: message.content?.length || 0
    });

    // Get or create quiz user
    const userIdentifier = message.phoneNumber || message.webUserId || 'unknown';
    const quizUser = await getOrCreateQuizUser(userIdentifier);
    
    console.log('👤 [QUIZ] Quiz user:', {
      id: quizUser.id,
      score: quizUser.score,
      profile: quizUser.profile,
      currentStep: quizUser.current_step
    });

    // Save incoming user message
    if (message.sender === 'user') {
      await saveConversationMessage({
        phone_number: message.phoneNumber,
        web_user_id: message.webUserId,
        session_id: message.sessionId,
        source: message.source,
        content: message.content,
        sender: message.sender,
        intent: 'quiz',
        user_agent: message.userAgent
      });
    }

    // Get current question based on user's step
    const { data: questions, error: questionsError } = await supabase
      .from('quiz_questions')
      .select('*')
      .order('order_index', { ascending: true });

    if (questionsError) {
      throw new Error(`Failed to get quiz questions: ${questionsError.message}`);
    }

    if (!questions || questions.length === 0) {
      const noQuestionsResponse = "Désolé, aucune question n'est disponible pour le moment. Veuillez contacter l'administrateur.";
      
      await saveConversationMessage({
        phone_number: message.phoneNumber,
        web_user_id: message.webUserId,
        session_id: message.sessionId,
        source: message.source,
        content: noQuestionsResponse,
        sender: 'bot',
        intent: 'quiz'
      });

      return {
        ...message,
        content: noQuestionsResponse,
        sender: 'bot'
      };
    }

    // Get user profile for Groq configuration
    let userId = null;
    
    if (message.phoneNumber) {
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
        throw new Error('No Groq configuration found for quiz');
      }
    }

    // Create Groq client
    const groq = await createGroqClient(userId);

    // Process user answer if they're answering a question
    let response = '';
    
    if (quizUser.current_step < questions.length) {
      const currentQuestion = questions[quizUser.current_step];
      
      // Check if this is an answer to the current question
      if (message.sender === 'user' && isAnswerToQuestion(message.content, currentQuestion)) {
        await processQuizAnswer(message.content, currentQuestion, quizUser);
        
        // Move to next question or complete quiz
        const nextStep = quizUser.current_step + 1;
        
        if (nextStep >= questions.length) {
          // Quiz completed
          await supabase
            .from('quiz_users')
            .update({
              status: 'completed',
              updated_at: new Date().toISOString()
            })
            .eq('id', quizUser.id);

          response = `🎉 Félicitations ! Vous avez terminé le quiz avec un score de ${quizUser.score} points.\n\nVotre profil marketing: ${quizUser.profile.toUpperCase()}\n\nMerci pour votre participation !`;
          
          // Trigger completion event
          await triggerModuleUpdate('quiz', {
            action: 'quiz_completed',
            userId: quizUser.id,
            finalScore: quizUser.score,
            profile: quizUser.profile
          });
        } else {
          // Move to next question
          await supabase
            .from('quiz_users')
            .update({
              current_step: nextStep,
              updated_at: new Date().toISOString()
            })
            .eq('id', quizUser.id);

          const nextQuestion = questions[nextStep];
          response = formatQuizQuestion(nextQuestion, nextStep + 1, questions.length);
        }
      } else {
        // Not an answer, provide current question
        response = formatQuizQuestion(currentQuestion, quizUser.current_step + 1, questions.length);
      }
    } else {
      // Quiz already completed or no more questions
      response = `Vous avez déjà terminé le quiz avec un score de ${quizUser.score} points. Votre profil: ${quizUser.profile.toUpperCase()}`;
    }

    // If no specific response generated, use AI for general interaction
    if (!response) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `Vous êtes un maître de quiz qui crée des quiz éducatifs engageants.
            Votre objectif est de rendre l'apprentissage amusant grâce à des questions et défis interactifs.
            Soyez enthousiaste, encourageant et fournissez des commentaires informatifs.
            ${message.source === 'web' ? 'L\'utilisateur participe via votre site web.' : 'L\'utilisateur participe via WhatsApp.'}`
          },
          { role: "user", content: message.content }
        ],
        model: 'llama3-70b-8192',
        temperature: 0.7,
        max_tokens: 1500,
      });

      response = completion.choices[0]?.message?.content || 
        "Bienvenue au quiz ! Êtes-vous prêt à commencer ?";
    }

    // Calculate response time
    const responseTime = (Date.now() - startTime) / 1000;

    // Save bot response with guaranteed persistence
    const botMessage: QuizMessage = {
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
      intent: 'quiz',
      response_time: responseTime
    });

    console.log('✅ [QUIZ] Message processed successfully');
    return botMessage;

  } catch (error) {
    console.error('❌ [QUIZ] Error processing message:', error);
    
    // Save error response to ensure user gets feedback
    const errorResponse = message.source === 'web'
      ? "Désolé, je rencontre des difficultés techniques. Veuillez actualiser la page et réessayer."
      : "Désolé, je rencontre des difficultés techniques. Veuillez réessayer plus tard.";

    try {
      await saveConversationMessage({
        phone_number: message.phoneNumber,
        web_user_id: message.webUserId,
        session_id: message.sessionId,
        source: message.source,
        content: errorResponse,
        sender: 'bot',
        intent: 'quiz'
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
 * Get quiz statistics with real-time calculation
 */
export async function getQuizStatistics(): Promise<any> {
  try {
    const { data: users, error } = await supabase
      .from('quiz_users')
      .select('*');

    if (error) {
      throw new Error(`Failed to get quiz users: ${error.message}`);
    }

    const { data: answers, error: answersError } = await supabase
      .from('quiz_answers')
      .select('*');

    if (answersError) {
      throw new Error(`Failed to get quiz answers: ${answersError.message}`);
    }

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

    const totalAnswers = answers?.length || 0;
    const correctAnswers = answers?.filter(a => a.points_awarded > 0).length || 0;
    const accuracyRate = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;

    return {
      totalParticipants,
      profileBreakdown,
      averageScore,
      completionRate,
      totalAnswers,
      correctAnswers,
      accuracyRate,
      latestParticipants: users?.slice(0, 10) || []
    };

  } catch (error) {
    console.error('Error getting quiz statistics:', error);
    return {
      totalParticipants: 0,
      profileBreakdown: { discovery: 0, active: 0, vip: 0 },
      averageScore: 0,
      completionRate: 0,
      totalAnswers: 0,
      correctAnswers: 0,
      accuracyRate: 0,
      latestParticipants: []
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

    // Get current statistics
    const stats = await getQuizStatistics();

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