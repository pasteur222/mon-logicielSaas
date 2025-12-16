import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

console.log("Edge function 'whatsapp-chatbot' is running...");

// Define CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

/**
 * Process quiz messages - handles quiz flow including starting, answering, and completing
 */
interface ProcessQuizMessageParams {
  phoneNumber: string;
  content: string;
  userId: string;
}

async function processQuizMessage(params: ProcessQuizMessageParams): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const lowerContent = params.content.toLowerCase().trim();
  const quizStartKeywords = ['quiz', 'game', 'jeu', 'jouer', 'play', 'start', 'démarrer', 'commencer'];

  const isQuizStart = quizStartKeywords.some(keyword => lowerContent.includes(keyword));

  if (isQuizStart) {
    const { data: activeQuiz } = await supabase
      .from('quiz_sessions')
      .select('id, completion_status')
      .eq('phone_number', params.phoneNumber)
      .eq('completion_status', 'active')
      .is('end_time', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeQuiz) {
      const { data: questions } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('quiz_id', activeQuiz.id)
        .order('order_index', { ascending: true })
        .limit(1);

      if (questions && questions.length > 0) {
        const question = questions[0];
        return `✨ Bienvenue au quiz ! Vous avez déjà une session active.\n\nQuestion ${question.order_index + 1}: ${question.text}\n\nVeuillez répondre pour continuer.`;
      }
    }

    const { data: availableQuiz } = await supabase
      .from('quizzes')
      .select('id, title, description, is_active')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!availableQuiz) {
      return "Désolé, aucun quiz n'est disponible pour le moment. Veuillez réessayer plus tard.";
    }

    const { data: newSession, error: sessionError } = await supabase
      .from('quiz_sessions')
      .insert({
        phone_number: params.phoneNumber,
        quiz_id: availableQuiz.id,
        completion_status: 'active',
        current_question_index: 0,
        score: 0,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (sessionError || !newSession) {
      console.error('Error creating quiz session:', sessionError);
      return "Désolé, impossible de démarrer le quiz. Veuillez réessayer.";
    }

    const { data: firstQuestion } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('quiz_id', availableQuiz.id)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstQuestion) {
      return "Désolé, ce quiz ne contient pas encore de questions.";
    }

    let questionText = `🎯 ${availableQuiz.title}\n\n${availableQuiz.description}\n\n`;
    questionText += `Question 1: ${firstQuestion.text}\n\n`;

    if (firstQuestion.options && Array.isArray(firstQuestion.options)) {
      firstQuestion.options.forEach((option: any, index: number) => {
        questionText += `${index + 1}. ${option}\n`;
      });
      questionText += `\nRépondez avec le numéro de votre choix (1-${firstQuestion.options.length})`;
    }

    return questionText;
  }

  const { data: activeSession } = await supabase
    .from('quiz_sessions')
    .select('id, quiz_id, current_question_index, score')
    .eq('phone_number', params.phoneNumber)
    .eq('completion_status', 'active')
    .is('end_time', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!activeSession) {
    return "Vous n'avez pas de quiz actif. Envoyez 'quiz' ou 'game' pour commencer un nouveau quiz!";
  }

  const { data: currentQuestion } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', activeSession.quiz_id)
    .eq('order_index', activeSession.current_question_index)
    .maybeSingle();

  if (!currentQuestion) {
    return "Erreur: Question introuvable. Envoyez 'quiz' pour recommencer.";
  }

  const userAnswer = params.content.trim();
  let isCorrect = false;
  let pointsEarned = 0;

  if (currentQuestion.type === 'multiple_choice' && currentQuestion.options) {
    const answerIndex = parseInt(userAnswer) - 1;
    if (answerIndex >= 0 && answerIndex < currentQuestion.options.length) {
      const selectedAnswer = currentQuestion.options[answerIndex];
      isCorrect = selectedAnswer === currentQuestion.correct_answer;
      pointsEarned = isCorrect ? (currentQuestion.points || 10) : 0;
    }
  }

  await supabase
    .from('quiz_answers')
    .insert({
      session_id: activeSession.id,
      question_id: currentQuestion.id,
      answer: userAnswer,
      is_correct: isCorrect,
      points_earned: pointsEarned,
      created_at: new Date().toISOString()
    });

  const newScore = activeSession.score + pointsEarned;
  const nextQuestionIndex = activeSession.current_question_index + 1;

  const { data: nextQuestion } = await supabase
    .from('quiz_questions')
    .select('*')
    .eq('quiz_id', activeSession.quiz_id)
    .eq('order_index', nextQuestionIndex)
    .maybeSingle();

  if (!nextQuestion) {
    await supabase
      .from('quiz_sessions')
      .update({
        completion_status: 'completed',
        score: newScore,
        end_time: new Date().toISOString()
      })
      .eq('id', activeSession.id);

    return `${isCorrect ? '✅ Correct!' : '❌ Incorrect!'}\n\n🎉 Quiz terminé!\n\nVotre score final: ${newScore} points\n\nMerci d'avoir participé! Envoyez 'quiz' pour recommencer.`;
  }

  await supabase
    .from('quiz_sessions')
    .update({
      current_question_index: nextQuestionIndex,
      score: newScore
    })
    .eq('id', activeSession.id);

  let responseText = `${isCorrect ? '✅ Correct! +' + pointsEarned + ' points' : '❌ Incorrect!'}\n\n`;
  responseText += `Score actuel: ${newScore} points\n\n`;
  responseText += `Question ${nextQuestionIndex + 1}: ${nextQuestion.text}\n\n`;

  if (nextQuestion.options && Array.isArray(nextQuestion.options)) {
    nextQuestion.options.forEach((option: any, index: number) => {
      responseText += `${index + 1}. ${option}\n`;
    });
    responseText += `\nRépondez avec le numéro (1-${nextQuestion.options.length})`;
  }

  return responseText;
}

/**
 * CENTRALIZED ROUTER - Determines which chatbot should handle the message
 *
 * PRIORITY ORDER (CRITICAL - DO NOT CHANGE):
 * 1. QUIZ PRIORITY: Active quiz session -> Route to quiz (user is mid-quiz)
 * 2. QUIZ PRIORITY: Quiz trigger keywords -> Route to quiz (user wants to start)
 * 3. CUSTOMER SERVICE: No quiz match -> Route to customer service
 *
 * Quiz chatbot takes FULL CONTROL when:
 * - User has an active quiz session, OR
 * - Message contains quiz trigger keywords
 *
 * Customer service chatbot responds when:
 * - No active quiz session AND no quiz keywords
 * - Checks auto-response rules first
 * - Uses generic message if no auto-response match
 *
 * AI NEVER controls the quiz - only used for customer service fallback
 */
async function checkIfQuizMessage(
  message: string,
  phoneNumber: string,
  supabaseClient: any
): Promise<boolean> {
  try {
    console.log('🔍 [WHATSAPP-CHATBOT ROUTER] Starting message routing analysis...');
    console.log(`📝 [WHATSAPP-CHATBOT ROUTER] Message: "${message.substring(0, 50)}..."`);
    console.log(`📍 [WHATSAPP-CHATBOT ROUTER] Phone: ${phoneNumber}`);

    // 1. Check for active quiz session (PRIORITY 1)
    const { data: activeSessions, error: sessionError } = await supabaseClient
      .from('quiz_sessions')
      .select('id, completion_status')
      .eq('phone_number', phoneNumber)
      .eq('completion_status', 'active')
      .is('end_time', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (sessionError) {
      console.error('[WHATSAPP-CHATBOT ROUTER] Error checking quiz sessions:', sessionError);
    }

    const hasActiveSession = activeSessions && activeSessions.length > 0;

    if (hasActiveSession) {
      console.log('🎯 [WHATSAPP-CHATBOT ROUTER] ✅ ACTIVE QUIZ SESSION FOUND -> QUIZ (Priority 1)');
      return true;
    }

    // 2. Check for active quiz user
    const { data: activeUser, error: userError } = await supabaseClient
      .from('quiz_users')
      .select('id, status')
      .eq('phone_number', phoneNumber)
      .eq('status', 'active')
      .maybeSingle();

    if (userError) {
      console.error('[WHATSAPP-CHATBOT ROUTER] Error checking quiz user:', userError);
    }

    const hasActiveUser = !!activeUser;

    if (hasActiveUser) {
      console.log('🎯 [WHATSAPP-CHATBOT ROUTER] ✅ ACTIVE QUIZ USER FOUND -> QUIZ (Priority 1)');
      return true;
    }

    // 3. Check for quiz keywords (PRIORITY 2)
    const lowerMessage = message.toLowerCase().trim();
    const quizKeywords = [
      'quiz', 'game', 'test', 'play', 'challenge', 'question', 'answer',
      'jeu', 'défi', 'réponse', 'questionnaire', 'jouer', 'start', 'commencer',
      'démarrer', 'begin', 'restart', 'recommencer'
    ];

    for (const keyword of quizKeywords) {
      if (lowerMessage.includes(keyword)) {
        console.log(`🎯 [WHATSAPP-CHATBOT ROUTER] ✅ QUIZ KEYWORD DETECTED: "${keyword}" -> QUIZ (Priority 2)`);
        return true;
      }
    }

    console.log('🎧 [WHATSAPP-CHATBOT ROUTER] ✅ No quiz match -> CUSTOMER SERVICE (Priority 3)');
    return false;
  } catch (error) {
    console.error('[WHATSAPP-CHATBOT ROUTER] Error in checkIfQuizMessage:', error);
    return false;
  }
}

/**
 * Check for auto-response rules in database
 */
async function checkAutoResponse(messageContent: string, userId: string, supabaseClient: any): Promise<string | null> {
  try {
    const lowerMessage = messageContent.toLowerCase().trim();

    const { data: rules, error } = await supabaseClient
      .from('auto_reply_rules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error || !rules || rules.length === 0) {
      console.log('📝 [WHATSAPP-CHATBOT] No auto-reply rules found');
      return null;
    }

    for (const rule of rules) {
      const keywords = rule.keywords || [];

      for (const keyword of keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          console.log(`✅ [WHATSAPP-CHATBOT] Auto-reply match found: ${keyword} -> ${rule.response_message}`);
          return rule.response_message;
        }
      }
    }

    console.log('📝 [WHATSAPP-CHATBOT] No auto-reply match found');
    return null;
  } catch (error) {
    console.error('❌ [WHATSAPP-CHATBOT] Error checking auto-response:', error);
    return null;
  }
}

/**
 * Process customer service message with auto-responses
 */
async function processCustomerServiceMessage(
  messageContent: string,
  userId: string,
  supabaseClient: any
): Promise<string> {
  console.log('🎧 [WHATSAPP-CHATBOT] Processing customer service message');

  const autoResponse = await checkAutoResponse(messageContent, userId, supabaseClient);

  if (autoResponse) {
    console.log('✅ [WHATSAPP-CHATBOT] Using auto-response');
    return autoResponse;
  }

  console.log('📨 [WHATSAPP-CHATBOT] No auto-response match, using generic message');
  return "Merci pour votre message. Notre équipe de gestion des produits vous contactera sous peu concernant votre demande.";
}

Deno.serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    const { record: message } = await req.json();
    const webhookId = message.webhook_id;

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Get the webhook config
    const { data: webhookConfig, error: webhookError } = await supabaseAdmin
      .from("webhook_config")
      .select("*")
      .eq("webhook_id", webhookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!webhookConfig) {
      console.error("Webhook config not found:", webhookError?.message);
      return new Response("Webhook config not found", { status: 404 });
    }

    // 2. Get the chatbot type from config
    const chatbotType = webhookConfig.chatbot_type || "education";

    // 3. Get the message and phone number
    const userMessage = message.message;
    const phoneNumber = message.phone_number;
    const userId = webhookConfig.user_id;

    if (!userMessage || !phoneNumber) {
      return new Response("Missing user message or phone number", {
        status: 400,
      });
    }

    console.log(`[WHATSAPP-CHATBOT] Processing message for user: ${userId}`);

    // 4. Determine if message should route to quiz processor
    const shouldRouteToQuiz = await checkIfQuizMessage(userMessage, phoneNumber, supabaseAdmin);

    console.log(`🎯 [WHATSAPP-CHATBOT] *** ROUTER DECISION: ${shouldRouteToQuiz ? 'QUIZ' : 'CUSTOMER SERVICE'} ***`);

    let aiResponse: string;

    if (shouldRouteToQuiz) {
      console.log('🎯 [WHATSAPP-CHATBOT] ===== EXECUTING QUIZ PROCESSOR =====');
      console.log('🎯 [WHATSAPP-CHATBOT] Quiz chatbot has FULL CONTROL');
      console.log('🎯 [WHATSAPP-CHATBOT] AI will NOT interfere with quiz flow');

      try {
        aiResponse = await processQuizMessage({
          phoneNumber: phoneNumber,
          content: userMessage,
          userId: userId
        });

        console.log('🎯 [WHATSAPP-CHATBOT] Quiz processor completed successfully');
      } catch (quizError) {
        console.error('❌ [WHATSAPP-CHATBOT] Quiz processing error:', quizError);
        aiResponse = "Désolé, je rencontre des difficultés techniques avec le quiz. Veuillez réessayer plus tard.";
      }
    } else {
      console.log('🎧 [WHATSAPP-CHATBOT] ===== EXECUTING CUSTOMER SERVICE =====');
      console.log('🎧 [WHATSAPP-CHATBOT] Checking auto-responses first...');

      try {
        aiResponse = await processCustomerServiceMessage(
          userMessage,
          userId,
          supabaseAdmin
        );

        console.log('🎧 [WHATSAPP-CHATBOT] Customer service completed successfully');
      } catch (csError) {
        console.error('❌ [WHATSAPP-CHATBOT] Customer service error:', csError);
        aiResponse = "Merci pour votre message. Notre équipe de gestion des produits vous contactera sous peu concernant votre demande.";
      }
    }

    // 7. Save the response to Supabase
    const { error: saveError } = await supabaseAdmin.from("chatbot_logs").insert({
      phone_number: phoneNumber,
      message: userMessage,
      response: aiResponse,
      chatbot_type: chatbotType,
      webhook_id: webhookId,
      user_id: userId,
    });

    if (saveError) {
      console.error("Failed to save chatbot log:", saveError.message);
    }

    return new Response(JSON.stringify({ reply: aiResponse }), {
      headers: { 
        "Content-Type": "application/json",
        ...corsHeaders
      },
    });
  } catch (error) {
    console.error("[WHATSAPP-CHATBOT] Function error:", error);
    
    // Return error response
    return new Response(
      JSON.stringify({ 
        error: error.message || 'An error occurred',
        details: error.stack
      }),
      { 
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );
  }
});