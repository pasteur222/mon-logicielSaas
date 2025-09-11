import { supabase } from './supabase';
import { createGroqClient } from './groq-config';
import { 
  startQuizSession,
  updateQuizSession,
  endQuizSession,
  trackQuestionEngagement,
  recoverInterruptedSession
} from './quiz-session-manager';
import { 
  validateQuizUser,
  validateQuizQuestion,
  validateQuizAnswerAdvanced,
  validateConditionalLogic,
  validatePagination
} from './quiz-validation';
import { 
  getCachedQuizStatistics,
  invalidateQuizCache,
  updateMetricIncremental
} from './quiz-statistics-cache';
import { 
  saveConversationMessage, 
  saveQuizAnswer, 
  updateQuizUserScore,
  triggerModuleUpdate 
} from './chatbot-communication';

interface EnhancedQuizMessage {
  phoneNumber?: string;
  webUserId?: string;
  sessionId?: string;
  source: 'whatsapp' | 'web';
  content: string;
  sender: 'user' | 'bot';
  userAgent?: string;
  country?: string;
  timestamp?: string;
}

interface QuizQuestionWithLogic {
  id: string;
  text: string;
  type: 'personal' | 'preference' | 'quiz' | 'product_test';
  options?: any;
  points?: any;
  required: boolean;
  order_index: number;
  correct_answer?: boolean;
  category?: string;
  conditional_logic?: {
    show_if: {
      question_id: string;
      answer_value: any;
    };
  };
}

/**
 * Enhanced quiz message processing with session tracking and validation
 */
export async function processEnhancedQuizMessage(message: EnhancedQuizMessage): Promise<EnhancedQuizMessage> {
  const startTime = Date.now();
  let currentSession: any = null;
  
  try {
    console.log('🎯 [QUIZ-ENHANCED] Processing message:', {
      hasText: !!message.content,
      source: message.source,
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      country: message.country,
      contentLength: message.content?.length || 0
    });

    // Validate user input
    const userValidation = validateQuizUser({
      phone_number: message.phoneNumber,
      web_user_id: message.webUserId,
      country: message.country
    });

    if (!userValidation.isValid) {
      throw new Error(`Invalid user data: ${userValidation.errors.join(', ')}`);
    }

    // Get or create quiz user with enhanced validation
    const userIdentifier = message.phoneNumber || message.webUserId || 'unknown';
    const quizUser = await getOrCreateEnhancedQuizUser(userIdentifier, userValidation.sanitizedData);
    
    console.log('👤 [QUIZ-ENHANCED] Quiz user:', {
      id: quizUser.id,
      score: quizUser.score,
      profile: quizUser.profile,
      currentStep: quizUser.current_step
    });

    // Try to recover interrupted session or start new one
    currentSession = await recoverInterruptedSession(
      quizUser.id,
      message.phoneNumber,
      message.webUserId
    );

    if (!currentSession) {
      currentSession = await startQuizSession(
        quizUser.id,
        message.phoneNumber,
        message.webUserId,
        message.sessionId,
        message.source,
        message.country,
        message.userAgent
      );
    }

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

    // Get questions with conditional logic support
    const questions = await getQuestionsWithConditionalLogic(quizUser);
    
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
    let userId = await getUserIdForGroq(message.phoneNumber);

    // Create Groq client
    const groq = await createGroqClient(userId);

    // Process user answer if they're answering a question
    let response = '';
    const questionStartTime = Date.now();
    
    if (quizUser.current_step < questions.length) {
      const currentQuestion = questions[quizUser.current_step];
      
      // Check if this is an answer to the current question
      if (message.sender === 'user' && isAnswerToQuestion(message.content, currentQuestion)) {
        // Validate the answer
        const answerValidation = validateQuizAnswerAdvanced(
          message.content,
          currentQuestion.type,
          currentQuestion
        );

        if (!answerValidation.isValid) {
          response = `Réponse invalide: ${answerValidation.errors.join(', ')}. Veuillez réessayer.`;
        } else {
          // Track question engagement
          const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
          await trackQuestionEngagement(
            currentSession.id,
            currentQuestion.id,
            quizUser.current_step,
            timeSpent,
            1,
            false
          );

          // Process the validated answer
          await processEnhancedQuizAnswer(
            answerValidation.sanitizedData as string,
            currentQuestion,
            quizUser,
            currentSession.id
          );
          
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

            await endQuizSession(currentSession.id, 'completed');

            response = `🎉 Félicitations ! Vous avez terminé le quiz avec un score de ${quizUser.score} points.\n\nVotre profil marketing: ${quizUser.profile.toUpperCase()}\n\nMerci pour votre participation !`;
            
            // Update metrics incrementally
            await updateMetricIncremental('completed_quizzes', 1);
            
            // Trigger completion event
            await triggerModuleUpdate('quiz', {
              action: 'quiz_completed',
              userId: quizUser.id,
              finalScore: quizUser.score,
              profile: quizUser.profile,
              sessionId: currentSession.id
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

            await updateQuizSession(currentSession.id, {
              current_question_index: nextStep,
              questions_answered: (currentSession.questions_answered || 0) + 1
            });

            const nextQuestion = questions[nextStep];
            response = formatEnhancedQuizQuestion(nextQuestion, nextStep + 1, questions.length);
          }
        }
      } else {
        // Not an answer, provide current question
        response = formatEnhancedQuizQuestion(currentQuestion, quizUser.current_step + 1, questions.length);
      }
    } else {
      // Quiz already completed
      response = `Vous avez déjà terminé le quiz avec un score de ${quizUser.score} points. Votre profil: ${quizUser.profile.toUpperCase()}`;
    }

    // If no specific response generated, use AI for general interaction
    if (!response) {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `Vous êtes un maître de quiz qui crée des quiz éducatifs et marketing engageants.
            Votre objectif est de rendre l'expérience amusante et informative.
            Soyez enthousiaste, encourageant et fournissez des commentaires constructifs.
            Adaptez vos réponses selon le contexte: éducatif ou marketing.
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

    // Save bot response
    const botMessage: EnhancedQuizMessage = {
      phoneNumber: message.phoneNumber,
      webUserId: message.webUserId,
      sessionId: message.sessionId,
      source: message.source,
      content: response,
      sender: 'bot',
      country: message.country
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

    console.log('✅ [QUIZ-ENHANCED] Message processed successfully');
    return botMessage;

  } catch (error) {
    console.error('❌ [QUIZ-ENHANCED] Error processing message:', error);
    
    // End session as interrupted if we have one
    if (currentSession) {
      try {
        await endQuizSession(currentSession.id, 'interrupted');
      } catch (sessionError) {
        console.error('Error ending interrupted session:', sessionError);
      }
    }
    
    // Save error response
    const errorResponse = message.source === 'web'
      ? "Désolé, je rencontre des difficultés techniques. Veuillez actualiser la page et réessayer."
      : "Désolé, je rencontre des difficultés techniques. Votre session sera récupérée lors de votre prochaine interaction.";

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
      sender: 'bot',
      country: message.country
    };
  }
}

/**
 * Get or create enhanced quiz user with validation
 */
async function getOrCreateEnhancedQuizUser(identifier: string, validatedData: any): Promise<any> {
  try {
    // Check if user exists
    let query = supabase.from('quiz_users').select('*');
    
    if (validatedData.phone_number) {
      query = query.eq('phone_number', validatedData.phone_number);
    } else if (validatedData.web_user_id) {
      query = query.eq('web_user_id', validatedData.web_user_id);
    }

    const { data: existingUser, error: getUserError } = await query.maybeSingle();

    if (getUserError) {
      throw new Error(`Failed to check existing quiz user: ${getUserError.message}`);
    }

    if (existingUser) {
      // Update last activity and any new data
      const updates: any = { updated_at: new Date().toISOString() };
      
      if (validatedData.country && !existingUser.country) {
        updates.country = validatedData.country;
      }

      await supabase
        .from('quiz_users')
        .update(updates)
        .eq('id', existingUser.id);

      return { ...existingUser, ...updates };
    }

    // Create new user with validated data
    const newUserData = {
      phone_number: validatedData.phone_number,
      web_user_id: validatedData.web_user_id,
      name: validatedData.name,
      email: validatedData.email,
      address: validatedData.address,
      profession: validatedData.profession,
      country: validatedData.country,
      score: 0,
      profile: 'discovery',
      current_step: 0,
      status: 'active',
      preferences: validatedData.preferences || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: newUser, error: createError } = await supabase
      .from('quiz_users')
      .insert(newUserData)
      .select()
      .single();

    if (createError) {
      throw new Error(`Failed to create quiz user: ${createError.message}`);
    }

    // Update metrics incrementally
    await updateMetricIncremental('total_participants', 1);

    return newUser;
  } catch (error) {
    console.error('Error getting or creating enhanced quiz user:', error);
    throw error;
  }
}

/**
 * Get questions with conditional logic support
 */
async function getQuestionsWithConditionalLogic(quizUser: any): Promise<QuizQuestionWithLogic[]> {
  try {
    const { data: allQuestions, error } = await supabase
      .from('quiz_questions')
      .select('*')
      .order('order_index', { ascending: true });

    if (error) {
      throw new Error(`Failed to get quiz questions: ${error.message}`);
    }

    if (!allQuestions) {
      return [];
    }

    // Get user's previous answers for conditional logic
    const { data: userAnswers } = await supabase
      .from('quiz_answers')
      .select('question_id, answer')
      .eq('user_id', quizUser.id);

    const answersMap = new Map(
      userAnswers?.map(a => [a.question_id, a.answer]) || []
    );

    // Filter questions based on conditional logic
    const visibleQuestions = allQuestions.filter(question => {
      if (!question.conditional_logic) {
        return true; // Show questions without conditional logic
      }

      const { show_if } = question.conditional_logic;
      if (!show_if) {
        return true;
      }

      const referencedAnswer = answersMap.get(show_if.question_id);
      return referencedAnswer === show_if.answer_value;
    });

    return visibleQuestions;
  } catch (error) {
    console.error('Error getting questions with conditional logic:', error);
    throw error;
  }
}

/**
 * Process enhanced quiz answer with validation and engagement tracking
 */
async function processEnhancedQuizAnswer(
  userAnswer: string,
  question: QuizQuestionWithLogic,
  quizUser: any,
  sessionId: string
): Promise<void> {
  try {
    console.log('📝 [QUIZ-ENHANCED] Processing answer:', {
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
      case 'product_test':
        // True/False or Yes/No question
        const userAnswerBool = userAnswer.toLowerCase() === 'true';
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

    // Save the answer with enhanced tracking
    await saveQuizAnswer({
      user_id: quizUser.id,
      question_id: question.id,
      answer: userAnswer,
      points_awarded: pointsAwarded,
      is_correct: isCorrect
    });

    // Update session progress
    await updateQuizSession(sessionId, {
      questions_answered: (quizUser.current_step || 0) + 1
    });

    // Update metrics incrementally
    if (question.type === 'quiz' || question.type === 'product_test') {
      await updateMetricIncremental('quiz_answers_total', 1);
      if (isCorrect) {
        await updateMetricIncremental('quiz_answers_correct', 1);
      }
    }

    console.log('✅ [QUIZ-ENHANCED] Answer processed:', {
      questionId: question.id,
      pointsAwarded,
      isCorrect,
      newScore: quizUser.score + pointsAwarded
    });

  } catch (error) {
    console.error('❌ [QUIZ-ENHANCED] Error processing answer:', error);
    throw error;
  }
}

/**
 * Format enhanced quiz question with better UX
 */
function formatEnhancedQuizQuestion(
  question: QuizQuestionWithLogic,
  currentNumber: number,
  totalQuestions: number
): string {
  let formattedQuestion = `📋 Question ${currentNumber}/${totalQuestions}\n\n${question.text}`;
  
  switch (question.type) {
    case 'quiz':
      formattedQuestion += '\n\n💡 Répondez par "Vrai" ou "Faux"';
      if (question.points?.value) {
        formattedQuestion += `\n🏆 Points possibles: ${question.points.value}`;
      }
      break;
      
    case 'product_test':
      formattedQuestion += '\n\n🛍️ Répondez par "Oui" ou "Non"';
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
  
  // Add category if available
  if (question.category) {
    formattedQuestion += `\n\n📂 Catégorie: ${question.category}`;
  }
  
  return formattedQuestion;
}

/**
 * Check if user input is an answer to the current question
 */
function isAnswerToQuestion(userInput: string, question: QuizQuestionWithLogic): boolean {
  const input = userInput.toLowerCase().trim();
  
  switch (question.type) {
    case 'quiz':
      // True/False questions
      return ['vrai', 'faux', 'true', 'false'].includes(input);
    
    case 'product_test':
      // Yes/No questions
      return ['oui', 'non', 'yes', 'no'].includes(input);
    
    case 'personal':
    case 'preference':
      // Any non-empty response is valid for personal/preference questions
      return input.length > 0 && input !== 'skip' && input !== 'passer';
    
    default:
      return false;
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
    } else if (lowerQuestion.includes('pays') || lowerQuestion.includes('country')) {
      const countryValidation = validateAndGetCountry(answer);
      if (countryValidation.isValid) {
        updates.country = countryValidation.code;
      }
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
        console.log('✅ [QUIZ-ENHANCED] Updated user personal info:', updates);
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
      console.log('✅ [QUIZ-ENHANCED] Updated user preferences');
    }
  } catch (error) {
    console.error('Error in updateUserPreferences:', error);
  }
}

/**
 * Get user ID for Groq configuration
 */
async function getUserIdForGroq(phoneNumber?: string): Promise<string> {
  if (phoneNumber) {
    const { data: userProfile } = await supabase
      .from('profils_utilisateurs')
      .select('id')
      .eq('phone_number', phoneNumber)
      .maybeSingle();
    
    if (userProfile) {
      return userProfile.id;
    }
  }

  // Get any available Groq configuration as fallback
  const { data: anyGroqConfig } = await supabase
    .from('user_groq_config')
    .select('user_id')
    .limit(1)
    .maybeSingle();
    
  if (anyGroqConfig) {
    return anyGroqConfig.user_id;
  }

  throw new Error('No Groq configuration found for quiz');
}

/**
 * Get enhanced quiz statistics with caching
 */
export async function getEnhancedQuizStatistics(): Promise<QuizMetrics> {
  try {
    return await getCachedQuizStatistics();
  } catch (error) {
    console.error('Error getting enhanced quiz statistics:', error);
    // Return default metrics if calculation fails
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
 * Get paginated quiz participants
 */
export async function getPaginatedQuizParticipants(
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
    const { page: validPage, limit: validLimit, offset } = validatePagination(page, limit);
    
    let query = supabase.from('quiz_users').select('*', { count: 'exact' });
    
    // Apply filters
    if (filters?.profile) {
      query = query.eq('profile', filters.profile);
    }
    
    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    
    if (filters?.country) {
      query = query.eq('country', filters.country);
    }
    
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(`name.ilike.${searchTerm},email.ilike.${searchTerm},phone_number.ilike.${searchTerm}`);
    }
    
    // Apply pagination
    query = query.range(offset, offset + validLimit - 1).order('created_at', { ascending: false });
    
    const { data: participants, error: queryError, count } = await query;
    
    if (queryError) {
      throw new Error(`Failed to get paginated participants: ${queryError.message}`);
    }
    
    const totalCount = count || 0;
    const totalPages = Math.ceil(totalCount / validLimit);
    
    return {
      participants: participants || [],
      totalCount,
      totalPages,
      currentPage: validPage
    };
  } catch (error) {
    console.error('Error getting paginated quiz participants:', error);
    throw error;
  }
}

/**
 * Create enhanced quiz question with validation
 */
export async function createEnhancedQuizQuestion(questionData: QuizQuestionInput): Promise<void> {
  try {
    // Validate question data
    const validation = validateQuizQuestion(questionData);
    
    if (!validation.isValid) {
      throw new Error(`Invalid question data: ${validation.errors.join(', ')}`);
    }

    // Get existing questions for conditional logic validation
    const { data: existingQuestions } = await supabase
      .from('quiz_questions')
      .select('id, type');

    if (questionData.conditional_logic) {
      const logicValidation = validateConditionalLogic(
        questionData.conditional_logic,
        existingQuestions || []
      );
      
      if (!logicValidation.isValid) {
        throw new Error(`Invalid conditional logic: ${logicValidation.errors.join(', ')}`);
      }
    }

    const { error } = await supabase
      .from('quiz_questions')
      .insert([validation.sanitizedData]);

    if (error) {
      throw new Error(`Failed to create question: ${error.message}`);
    }

    // Invalidate cache to force recalculation
    await invalidateQuizCache();

    console.log('✅ [QUIZ-ENHANCED] Question created successfully');
  } catch (error) {
    console.error('❌ [QUIZ-ENHANCED] Error creating question:', error);
    throw error;
  }
}

/**
 * Reset quiz for a user with session cleanup
 */
export async function resetEnhancedQuizForUser(identifier: string): Promise<void> {
  try {
    let query = supabase.from('quiz_users').select('id');
    
    if (identifier.includes('@')) {
      query = query.eq('email', identifier);
    } else if (identifier.startsWith('web_')) {
      query = query.eq('web_user_id', identifier);
    } else {
      query = query.eq('phone_number', identifier);
    }

    const { data: user, error: getUserError } = await query.single();

    if (getUserError) {
      throw new Error(`User not found: ${getUserError.message}`);
    }

    // End any active sessions
    const { data: activeSessions } = await supabase
      .from('quiz_sessions')
      .select('id')
      .eq('user_id', user.id)
      .eq('completion_status', 'active');

    if (activeSessions) {
      for (const session of activeSessions) {
        await endQuizSession(session.id, 'interrupted');
      }
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

    // Invalidate cache
    await invalidateQuizCache();

    console.log('✅ [QUIZ-ENHANCED] User quiz reset successfully:', identifier);
  } catch (error) {
    console.error('❌ [QUIZ-ENHANCED] Error resetting quiz for user:', error);
    throw error;
  }
}