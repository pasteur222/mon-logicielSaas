import { createClient } from "npm:@supabase/supabase-js@2";
import { Groq } from "npm:groq-sdk@0.26.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STANDARD_ERROR_RESPONSE = "Désolé, je rencontre des difficultés techniques. Veuillez réessayer plus tard ou contacter notre support.";
// Using Gemma 2 9B as it's fast, reliable, and cost-effective
const DEFAULT_MODEL = "gemma2-9b-it";
const DEPRECATED_MODELS = ["llama3-70b-8192", "llama3-8b-8192", "gemma-7b-it", "mixtral-8x7b-32768"];

interface UserConfiguration {
  userId: string;
  whatsappConfig: {
    access_token: string;
    phone_number_id: string;
    app_id: string;
    app_secret: string;
  };
  groqConfig: {
    api_key: string;
    model: string;
  };
}

async function getUserConfigFromPhoneNumberId(phoneNumberId: string): Promise<UserConfiguration | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: whatsappConfig, error: whatsappError } = await supabase
      .from('user_whatsapp_config')
      .select('user_id, access_token, phone_number_id, app_id, app_secret')
      .eq('phone_number_id', phoneNumberId)
      .eq('is_active', true)
      .maybeSingle();

    if (whatsappError || !whatsappConfig) {
      console.error('❌ [WEBHOOK-HANDLER] No WhatsApp config found for phone_number_id:', phoneNumberId);
      return null;
    }

    console.log('✅ [WEBHOOK-HANDLER] Found WhatsApp config for user:', whatsappConfig.user_id);

    const { data: groqConfig, error: groqError } = await supabase
      .from('user_groq_config')
      .select('api_key, model')
      .eq('user_id', whatsappConfig.user_id)
      .maybeSingle();

    if (groqError || !groqConfig || !groqConfig.api_key) {
      console.warn('⚠️ [WEBHOOK-HANDLER] No Groq config found for user, will use system default');
    }

    return {
      userId: whatsappConfig.user_id,
      whatsappConfig: {
        access_token: whatsappConfig.access_token,
        phone_number_id: whatsappConfig.phone_number_id,
        app_id: whatsappConfig.app_id,
        app_secret: whatsappConfig.app_secret,
      },
      groqConfig: groqConfig ? {
        api_key: groqConfig.api_key,
        model: groqConfig.model || DEFAULT_MODEL,
      } : await getSystemGroqConfig(supabase)
    };
  } catch (error) {
    console.error('❌ [WEBHOOK-HANDLER] Error fetching user configuration:', error);
    return null;
  }
}

async function getSystemGroqConfig(supabase: any): Promise<{ api_key: string; model: string }> {
  const { data: anyConfig } = await supabase
    .from('user_groq_config')
    .select('api_key, model')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (anyConfig && anyConfig.api_key) {
    let modelToUse = anyConfig.model || DEFAULT_MODEL;
    if (DEPRECATED_MODELS.includes(modelToUse)) {
      modelToUse = DEFAULT_MODEL;
    }
    return {
      api_key: anyConfig.api_key,
      model: modelToUse,
    };
  }

  const fallbackApiKey = Deno.env.get('GROQ_API_KEY');
  if (fallbackApiKey) {
    console.log('⚠️ [WEBHOOK-HANDLER] Using fallback GROQ_API_KEY from environment');
    return {
      api_key: fallbackApiKey,
      model: DEFAULT_MODEL,
    };
  }

  throw new Error('No Groq configuration available');
}

async function checkActiveQuizSession(phoneNumber: string, userId: string): Promise<boolean> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return false;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: activeSessions, error } = await supabase
      .from('quiz_sessions')
      .select('id, completion_status, end_time')
      .eq('phone_number', phoneNumber)
      .eq('completion_status', 'active')
      .is('end_time', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking quiz sessions:', error);
      return false;
    }

    if (activeSessions && activeSessions.length > 0) {
      console.log('✅ [WEBHOOK-HANDLER] Found active quiz session for:', phoneNumber);
      return true;
    }

    const { data: quizUser, error: userError } = await supabase
      .from('quiz_users')
      .select('id, status, current_step')
      .eq('phone_number', phoneNumber)
      .eq('status', 'active')
      .maybeSingle();

    if (userError) {
      console.error('Error checking quiz user status:', userError);
      return false;
    }

    if (quizUser) {
      console.log('✅ [WEBHOOK-HANDLER] Found active quiz user for:', phoneNumber);
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in checkActiveQuizSession:', error);
    return false;
  }
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
async function determineChatbotTypeFromMessage(
  message: string,
  source: 'whatsapp' | 'web',
  phoneNumber: string,
  userId: string
): Promise<'client' | 'quiz'> {
  console.log('🔍 [ROUTER] Starting message routing analysis...');
  console.log(`📝 [ROUTER] Message: "${message.substring(0, 50)}..."`);
  console.log(`📍 [ROUTER] Source: ${source}, Phone: ${phoneNumber}`);

  if (source === 'web') {
    console.log('🌐 [ROUTER] ✅ Web message detected -> CUSTOMER SERVICE');
    return 'client';
  }

  if (source === 'whatsapp' && phoneNumber) {
    const hasActiveQuizSession = await checkActiveQuizSession(phoneNumber, userId);

    if (hasActiveQuizSession) {
      console.log('🎯 [ROUTER] ✅ ACTIVE QUIZ SESSION FOUND -> QUIZ (Priority 1)');
      return 'quiz';
    }
  }

  if (message) {
    const lowerMessage = message.toLowerCase().trim();

    const quizKeywords = [
      'quiz', 'game', 'test', 'play', 'challenge', 'question', 'answer',
      'jeu', 'défi', 'réponse', 'questionnaire', 'jouer', 'start',
      'commencer', 'démarrer', 'begin', 'restart', 'recommencer'
    ];

    for (const keyword of quizKeywords) {
      if (lowerMessage.includes(keyword)) {
        console.log(`🎯 [ROUTER] ✅ QUIZ KEYWORD DETECTED: "${keyword}" -> QUIZ (Priority 2)`);
        return 'quiz';
      }
    }
  }

  console.log('🎧 [ROUTER] ✅ No quiz match -> CUSTOMER SERVICE (Priority 3)');
  return 'client';
}

interface ProcessQuizMessageParams {
  phoneNumber: string;
  content: string;
  source: 'whatsapp' | 'web';
  sender: 'user' | 'bot';
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

  // Check for existing quiz user
  let { data: quizUser } = await supabase
    .from('quiz_users')
    .select('id')
    .eq('phone_number', params.phoneNumber)
    .maybeSingle();

  // Create quiz user if doesn't exist
  if (!quizUser) {
    const { data: newUser, error: userError } = await supabase
      .from('quiz_users')
      .insert({
        phone_number: params.phoneNumber,
        status: 'active',
        current_step: 0,
        score: 0,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (userError || !newUser) {
      console.error('Error creating quiz user:', userError);
      return "Désolé, impossible de créer votre profil. Veuillez réessayer.";
    }

    quizUser = newUser;
  }

  if (isQuizStart) {
    // Check for existing active session
    const { data: activeSession } = await supabase
      .from('quiz_sessions')
      .select('id, current_question_index')
      .eq('phone_number', params.phoneNumber)
      .eq('completion_status', 'active')
      .is('end_time', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeSession) {
      // Resume existing session
      const { data: currentQuestion } = await supabase
        .from('quiz_questions')
        .select('*')
        .eq('order_index', activeSession.current_question_index)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (currentQuestion) {
        let questionText = `✨ Bienvenue ! Vous avez une session active.\n\nQuestion ${activeSession.current_question_index + 1}: ${currentQuestion.text}\n\n`;

        if (currentQuestion.options && Array.isArray(currentQuestion.options)) {
          currentQuestion.options.forEach((option: any, index: number) => {
            questionText += `${index + 1}. ${option}\n`;
          });
          questionText += `\nRépondez avec le numéro de votre choix (1-${currentQuestion.options.length})`;
        }

        return questionText;
      }
    }

    // Check if any questions exist
    const { data: questions, error: questionsError } = await supabase
      .from('quiz_questions')
      .select('id')
      .limit(1);

    if (questionsError) {
      console.error('❌ [QUIZ-PROCESSOR] Error checking quiz questions:', questionsError);
      return "Désolé, une erreur s'est produite lors de la vérification du quiz. Veuillez réessayer.";
    }

    if (!questions || questions.length === 0) {
      console.log('⚠️ [QUIZ-PROCESSOR] No quiz questions found in database');
      return "Désolé, aucun quiz n'est disponible pour le moment. Veuillez réessayer plus tard.";
    }

    console.log('✅ [QUIZ-PROCESSOR] Quiz questions exist, proceeding with session creation');

    // Create new session
    const { data: newSession, error: sessionError } = await supabase
      .from('quiz_sessions')
      .insert({
        user_id: quizUser.id,
        phone_number: params.phoneNumber,
        source: params.source,
        completion_status: 'active',
        current_question_index: 0,
        engagement_score: 0,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (sessionError || !newSession) {
      console.error('Error creating quiz session:', sessionError);
      return "Désolé, impossible de démarrer le quiz. Veuillez réessayer.";
    }

    // Get first question
    const { data: firstQuestion } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('order_index', 0)
      .order('order_index', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstQuestion) {
      return "Désolé, aucune question n'est disponible. Veuillez réessayer plus tard.";
    }

    let questionText = `🎯 Bienvenue au Quiz!\n\nQuestion 1: ${firstQuestion.text}\n\n`;

    if (firstQuestion.options && Array.isArray(firstQuestion.options)) {
      firstQuestion.options.forEach((option: any, index: number) => {
        questionText += `${index + 1}. ${option}\n`;
      });
      questionText += `\nRépondez avec le numéro de votre choix (1-${firstQuestion.options.length})`;
    }

    return questionText;
  }

  // Process answer to current question
  const { data: activeSession } = await supabase
    .from('quiz_sessions')
    .select('id, current_question_index')
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
    .eq('order_index', activeSession.current_question_index)
    .maybeSingle();

  if (!currentQuestion) {
    return "Erreur: Question introuvable. Envoyez 'quiz' pour recommencer.";
  }

  // Process answer
  const userAnswer = params.content.trim();
  let pointsAwarded = 0;

  if (currentQuestion.options && Array.isArray(currentQuestion.options)) {
    const answerIndex = parseInt(userAnswer) - 1;
    if (answerIndex >= 0 && answerIndex < currentQuestion.options.length) {
      pointsAwarded = currentQuestion.points || 5;
    }
  }

  // Save answer
  await supabase
    .from('quiz_answers')
    .insert({
      user_id: quizUser.id,
      question_id: currentQuestion.id,
      answer: userAnswer,
      points_awarded: pointsAwarded,
      created_at: new Date().toISOString()
    });

  // Check if there are more questions (use gt for robustness with non-sequential indexes)
  const { data: nextQuestion } = await supabase
    .from('quiz_questions')
    .select('*')
    .gt('order_index', activeSession.current_question_index)
    .order('order_index', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextQuestion) {
    // Quiz complete - calculate total score
    const { data: allAnswers } = await supabase
      .from('quiz_answers')
      .select('points_awarded')
      .eq('user_id', quizUser.id);

    const totalScore = allAnswers?.reduce((sum, a) => sum + (a.points_awarded || 0), 0) || 0;

    // Mark session as completed
    await supabase
      .from('quiz_sessions')
      .update({
        completion_status: 'completed',
        engagement_score: totalScore,
        end_time: new Date().toISOString()
      })
      .eq('id', activeSession.id);

    // Update user score
    await supabase
      .from('quiz_users')
      .update({
        score: totalScore,
        status: 'completed'
      })
      .eq('id', quizUser.id);

    return `✅ Réponse enregistrée!\n\n🎉 Quiz terminé!\n\nVotre score final: ${totalScore} points\n\nMerci d'avoir participé! Envoyez 'quiz' pour recommencer.`;
  }

  // Move to next question (use actual order_index from nextQuestion)
  const nextQuestionIndex = nextQuestion.order_index;

  await supabase
    .from('quiz_sessions')
    .update({
      current_question_index: nextQuestionIndex,
      questions_answered: activeSession.current_question_index + 1
    })
    .eq('id', activeSession.id);

  let responseText = `✅ Réponse enregistrée!\n\nQuestion ${nextQuestionIndex + 1}: ${nextQuestion.text}\n\n`;

  if (nextQuestion.options && Array.isArray(nextQuestion.options)) {
    nextQuestion.options.forEach((option: any, index: number) => {
      responseText += `${index + 1}. ${option}\n`;
    });
    responseText += `\nRépondez avec le numéro (1-${nextQuestion.options.length})`;
  }

  return responseText;
}

async function checkAutoResponse(messageContent: string, userId: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return null;
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const lowerMessage = messageContent.toLowerCase().trim();

    const { data: rules, error } = await supabase
      .from('whatsapp_auto_replies')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('❌ [WEBHOOK-HANDLER] Error querying auto-replies:', error);
      return null;
    }

    if (!rules || rules.length === 0) {
      console.log('📝 [WEBHOOK-HANDLER] No auto-reply rules found for user');
      return null;
    }

    console.log(`📝 [WEBHOOK-HANDLER] Checking ${rules.length} auto-reply rules`);

    for (const rule of rules) {
      const triggerWords = rule.trigger_words || [];

      for (const triggerWord of triggerWords) {
        if (lowerMessage.includes(triggerWord.toLowerCase())) {
          console.log(`✅ [WEBHOOK-HANDLER] Auto-reply match: "${triggerWord}" -> Rule ID: ${rule.id}`);
          return rule.response;
        }
      }
    }

    console.log('📝 [WEBHOOK-HANDLER] No trigger word matched in message');
    return null;
  } catch (error) {
    console.error('❌ [WEBHOOK-HANDLER] Error checking auto-response:', error);
    return null;
  }
}

async function processCustomerServiceMessage(
  messageContent: string,
  phoneNumber: string,
  userId: string
): Promise<string> {
  console.log('🎧 [WEBHOOK-HANDLER] Processing customer service message');

  const autoResponse = await checkAutoResponse(messageContent, userId);

  if (autoResponse) {
    console.log('✅ [WEBHOOK-HANDLER] Using auto-response');
    return autoResponse;
  }

  console.log('📨 [WEBHOOK-HANDLER] No auto-response match, using generic message');
  return "Merci pour votre message. Notre équipe de gestion des produits vous contactera sous peu concernant votre demande.";
}

async function sendWhatsAppMessage(
  phoneNumber: string,
  message: string,
  accessToken: string,
  phoneNumberId: string
): Promise<void> {
  try {
    const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phoneNumber,
        type: 'text',
        text: {
          body: message
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ [WEBHOOK-HANDLER] WhatsApp API error:', errorData);
      throw new Error(`WhatsApp API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ [WEBHOOK-HANDLER] Message sent successfully:', data);
  } catch (error) {
    console.error('❌ [WEBHOOK-HANDLER] Failed to send WhatsApp message:', error);
    throw error;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();
    console.log('📨 [WEBHOOK-HANDLER] Received webhook:', JSON.stringify(body, null, 2));

    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        if (entry.changes && Array.isArray(entry.changes)) {
          for (const change of entry.changes) {
            if (change.value) {
              const value = change.value;

              if (value.statuses && Array.isArray(value.statuses)) {
                console.log('📊 [WEBHOOK-HANDLER] Processing status updates');
                const supabaseUrl = Deno.env.get('SUPABASE_URL');
                const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

                if (supabaseUrl && serviceRoleKey) {
                  const supabase = createClient(supabaseUrl, serviceRoleKey);

                  for (const status of value.statuses) {
                    await supabase
                      .from('message_logs')
                      .update({
                        status: status.status,
                        updated_at: new Date().toISOString()
                      })
                      .eq('message_id', status.id);

                    console.log(`✅ [WEBHOOK-HANDLER] Updated message ${status.id} status to ${status.status}`);
                  }
                }

                continue;
              }

              if (value.messages && Array.isArray(value.messages)) {
                const metadata = value.metadata;
                const phoneNumberId = metadata?.phone_number_id;

                if (!phoneNumberId) {
                  console.error('❌ [WEBHOOK-HANDLER] No phone_number_id in webhook metadata');
                  continue;
                }

                console.log('📞 [WEBHOOK-HANDLER] Phone Number ID:', phoneNumberId);

                const userConfig = await getUserConfigFromPhoneNumberId(phoneNumberId);

                if (!userConfig) {
                  console.error('❌ [WEBHOOK-HANDLER] Could not find user configuration for phone_number_id:', phoneNumberId);
                  continue;
                }

                console.log('✅ [WEBHOOK-HANDLER] User configuration loaded for user:', userConfig.userId);

                for (const message of value.messages) {
                  const from = message.from;
                  const messageText = message.text?.body;

                  if (!messageText) {
                    console.log('⚠️ [WEBHOOK-HANDLER] Message without text content, skipping');
                    continue;
                  }

                  console.log('📨 [WEBHOOK-HANDLER] Processing message from:', from);

                  const supabaseUrl = Deno.env.get('SUPABASE_URL');
                  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

                  if (!supabaseUrl || !serviceRoleKey) {
                    throw new Error('Missing Supabase environment variables');
                  }

                  const supabase = createClient(supabaseUrl, serviceRoleKey);

                  const chatbotType = await determineChatbotTypeFromMessage(
                    messageText,
                    'whatsapp',
                    from,
                    userConfig.userId
                  );

                  console.log(`🎯 [WEBHOOK-HANDLER] *** ROUTER DECISION: ${chatbotType.toUpperCase()} ***`);

                  await supabase
                    .from('customer_conversations')
                    .insert({
                      phone_number: from,
                      content: messageText,
                      sender: 'user',
                      source: 'whatsapp',
                      intent: chatbotType,
                      user_id: userConfig.userId,
                      created_at: new Date().toISOString()
                    });

                  console.log(`✅ [WEBHOOK-HANDLER] Incoming message saved for user: ${userConfig.userId}`);

                  let botResponse: string;

                  try {
                    if (chatbotType === 'quiz') {
                      console.log('🎯 [WEBHOOK-HANDLER] ===== EXECUTING QUIZ PROCESSOR =====');
                      console.log('🎯 [WEBHOOK-HANDLER] Quiz chatbot has FULL CONTROL');
                      console.log('🎯 [WEBHOOK-HANDLER] AI will NOT interfere with quiz flow');

                      botResponse = await processQuizMessage({
                        phoneNumber: from,
                        content: messageText,
                        source: 'whatsapp',
                        sender: 'user',
                        userId: userConfig.userId
                      });

                      console.log('🎯 [WEBHOOK-HANDLER] Quiz processor completed successfully');
                    } else {
                      console.log('🎧 [WEBHOOK-HANDLER] ===== EXECUTING CUSTOMER SERVICE =====');
                      console.log('🎧 [WEBHOOK-HANDLER] Checking auto-responses first...');

                      botResponse = await processCustomerServiceMessage(
                        messageText,
                        from,
                        userConfig.userId
                      );

                      console.log('🎧 [WEBHOOK-HANDLER] Customer service completed successfully');
                    }

                    console.log('✅ [WEBHOOK-HANDLER] Generated chatbot response successfully');

                  } catch (chatbotError) {
                    console.error('❌ [WEBHOOK-HANDLER] Chatbot processing failed:', chatbotError);
                    botResponse = STANDARD_ERROR_RESPONSE;
                  }

                  await supabase
                    .from('customer_conversations')
                    .insert({
                      phone_number: from,
                      content: botResponse,
                      sender: 'bot',
                      source: 'whatsapp',
                      intent: chatbotType,
                      user_id: userConfig.userId,
                      created_at: new Date().toISOString()
                    });

                  console.log(`✅ [WEBHOOK-HANDLER] Bot response saved for user: ${userConfig.userId}`);

                  await sendWhatsAppMessage(
                    from,
                    botResponse,
                    userConfig.whatsappConfig.access_token,
                    userConfig.whatsappConfig.phone_number_id
                  );

                  console.log('✅ [WEBHOOK-HANDLER] Response sent to WhatsApp successfully');
                }
              }
            }
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    const messageData = body;

    if (messageData.statuses) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase environment variables');
      }

      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

      for (const status of messageData.statuses) {
        await supabaseAdmin
          .from('message_logs')
          .update({
            status: status.status,
            updated_at: new Date().toISOString()
          })
          .eq('message_id', status.id);

        console.log(`✅ [WEBHOOK-HANDLER] Updated message ${status.id} status to ${status.status}`);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Status updates processed' }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Handle simplified webhook format from external webhook server
    if (messageData.from && messageData.text && messageData.phoneNumberId) {
      console.log('📨 [WEBHOOK-HANDLER] Processing simplified webhook format');
      console.log('📞 [WEBHOOK-HANDLER] From:', messageData.from);
      console.log('📞 [WEBHOOK-HANDLER] Phone Number ID:', messageData.phoneNumberId);

      const userConfig = await getUserConfigFromPhoneNumberId(messageData.phoneNumberId);

      if (!userConfig) {
        console.error('❌ [WEBHOOK-HANDLER] Could not find user configuration for phone_number_id:', messageData.phoneNumberId);
        return new Response(
          JSON.stringify({ error: 'User configuration not found' }),
          {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        );
      }

      console.log('✅ [WEBHOOK-HANDLER] User configuration loaded for user:', userConfig.userId);

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase environment variables');
      }

      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const chatbotType = await determineChatbotTypeFromMessage(
        messageData.text,
        'whatsapp',
        messageData.from,
        userConfig.userId
      );

      console.log(`🎯 [WEBHOOK-HANDLER] *** ROUTER DECISION: ${chatbotType.toUpperCase()} ***`);

      await supabase
        .from('customer_conversations')
        .insert({
          phone_number: messageData.from,
          content: messageData.text,
          sender: 'user',
          source: 'whatsapp',
          intent: chatbotType,
          user_id: userConfig.userId,
          created_at: new Date().toISOString()
        });

      console.log(`✅ [WEBHOOK-HANDLER] Incoming message saved for user: ${userConfig.userId}`);

      let botResponse: string;

      try {
        if (chatbotType === 'quiz') {
          console.log('🎯 [WEBHOOK-HANDLER] ===== EXECUTING QUIZ PROCESSOR =====');
          console.log('🎯 [WEBHOOK-HANDLER] Quiz chatbot has FULL CONTROL');
          console.log('🎯 [WEBHOOK-HANDLER] AI will NOT interfere with quiz flow');

          botResponse = await processQuizMessage({
            phoneNumber: messageData.from,
            content: messageData.text,
            source: 'whatsapp',
            sender: 'user',
            userId: userConfig.userId
          });

          console.log('🎯 [WEBHOOK-HANDLER] Quiz processor completed successfully');
        } else {
          console.log('🎧 [WEBHOOK-HANDLER] ===== EXECUTING CUSTOMER SERVICE =====');
          console.log('🎧 [WEBHOOK-HANDLER] Checking auto-responses first...');

          botResponse = await processCustomerServiceMessage(
            messageData.text,
            messageData.from,
            userConfig.userId
          );

          console.log('🎧 [WEBHOOK-HANDLER] Customer service completed successfully');
        }

        console.log('✅ [WEBHOOK-HANDLER] Generated chatbot response successfully');

      } catch (chatbotError) {
        console.error('❌ [WEBHOOK-HANDLER] Chatbot processing failed:', chatbotError);
        botResponse = STANDARD_ERROR_RESPONSE;
      }

      await supabase
        .from('customer_conversations')
        .insert({
          phone_number: messageData.from,
          content: botResponse,
          sender: 'bot',
          source: 'whatsapp',
          intent: chatbotType,
          user_id: userConfig.userId,
          created_at: new Date().toISOString()
        });

      console.log(`✅ [WEBHOOK-HANDLER] Bot response saved for user: ${userConfig.userId}`);

      await sendWhatsAppMessage(
        messageData.from,
        botResponse,
        userConfig.whatsappConfig.access_token,
        userConfig.whatsappConfig.phone_number_id
      );

      console.log('✅ [WEBHOOK-HANDLER] Response sent to WhatsApp successfully');

      return new Response(
        JSON.stringify({ success: true }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // If we reach here, the format is invalid
    return new Response(
      JSON.stringify({ error: 'Invalid webhook format - missing required fields (from, text, phoneNumberId)' }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('❌ [WEBHOOK-HANDLER] Critical error in webhook processing:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        message: error.message
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
