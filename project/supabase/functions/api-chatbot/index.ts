// Follow this setup guide to integrate the Deno runtime and Supabase functions in your project:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createGroqClient } from "../_shared/groq-client.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

interface ChatbotRequest {
  webUserId?: string;
  phoneNumber?: string;
  sessionId?: string;
  source: 'web' | 'whatsapp';
  text: string;
  chatbotType?: 'client' | 'quiz';
  userAgent?: string;
  timestamp?: string;
}

interface ChatbotResponse {
  success: boolean;
  response?: string;
  error?: string;
  sessionId?: string;
  messageId?: string;
  source?: string;
  chatbotType?: string;
}

interface AutoReplyRule {
  id: string;
  trigger_words: string[];
  response: string;
  variables?: Record<string, string>;
  use_regex: boolean;
  pattern_flags: string;
  priority: number;
  is_active: boolean;
}

serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();
  let requestData: ChatbotRequest | undefined;

  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    console.log(`🤖 [API-CHATBOT] ${req.method} request received from ${req.headers.get('origin') || 'unknown'}`);

    // Only allow POST requests
    if (req.method !== 'POST') {
      console.error('❌ [API-CHATBOT] Method not allowed:', req.method);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Method not allowed. Use POST.'
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Parse and validate request body
    try {
      requestData = await req.json();
      console.log('🤖 [API-CHATBOT] Request data received:', {
        source: requestData.source,
        chatbotType: requestData.chatbotType,
        hasText: !!requestData.text,
        textLength: requestData.text?.length || 0,
        hasWebUserId: !!requestData.webUserId,
        hasPhoneNumber: !!requestData.phoneNumber,
        hasSessionId: !!requestData.sessionId
      });
    } catch (parseError) {
      console.error('❌ [API-CHATBOT] Failed to parse request JSON:', parseError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid JSON in request body' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Validate required fields
    if (!requestData.text || requestData.text.trim().length === 0) {
      console.error('❌ [API-CHATBOT] Missing or empty text field');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Text field is required and cannot be empty' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    if (!requestData.source || !['web', 'whatsapp'].includes(requestData.source)) {
      console.error('❌ [API-CHATBOT] Invalid source field:', requestData.source);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Source must be either "web" or "whatsapp"' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Validate text length
    if (requestData.text.length > 4000) {
      console.error('❌ [API-CHATBOT] Text too long:', requestData.text.length);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Text message too long (max 4000 characters)' 
        }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ [API-CHATBOT] Missing Supabase environment variables');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Server configuration error' 
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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Convert timestamp to ISO format if provided as Unix timestamp
    let formattedTimestamp: string;
    if (requestData.timestamp) {
      // Check if timestamp is a number (Unix timestamp) or already ISO string
      const timestampValue = requestData.timestamp;
      if (typeof timestampValue === 'number' || /^\d+$/.test(timestampValue)) {
        // Unix timestamp - convert to ISO
        formattedTimestamp = new Date(Number(timestampValue) * 1000).toISOString();
        console.log('🕒 [API-CHATBOT] Converted Unix timestamp to ISO:', formattedTimestamp);
      } else {
        // Already ISO format
        formattedTimestamp = timestampValue;
      }
    } else {
      formattedTimestamp = new Date().toISOString();
    }

    // Save incoming message to database with EXPLICIT source preservation
    console.log('💾 [API-CHATBOT] Saving incoming message with source:', requestData.source);
    const { data: savedMessage, error: saveError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: requestData.phoneNumber,
        web_user_id: requestData.webUserId,
        session_id: requestData.sessionId,
        source: requestData.source, // PRESERVE ORIGINAL SOURCE
        content: requestData.text,
        sender: 'user',
        intent: 'client', // Will be updated based on chatbot routing
        user_agent: requestData.userAgent,
        created_at: formattedTimestamp
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('❌ [API-CHATBOT] Error saving incoming message:', saveError);
      // Continue processing even if save fails
    } else {
      console.log('✅ [API-CHATBOT] Incoming message saved with source:', requestData.source);
    }

    // STEP 1: SESSION HANDLING - Check for active quiz session
    let activeQuizSession = false;
    let determinedChatbotType = 'client';

    if (requestData.source === 'whatsapp' && requestData.phoneNumber) {
      console.log('🔍 [API-CHATBOT] Checking for active quiz session for:', requestData.phoneNumber);
      
      // Check for active quiz sessions
      const { data: quizSessions, error: sessionError } = await supabase
        .from('quiz_sessions')
        .select('id, completion_status, end_time')
        .eq('phone_number', requestData.phoneNumber)
        .eq('completion_status', 'active')
        .is('end_time', null)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!sessionError && quizSessions && quizSessions.length > 0) {
        activeQuizSession = true;
        determinedChatbotType = 'quiz';
        console.log('🎯 [API-CHATBOT] Active quiz session found, routing to quiz chatbot');
      } else {
        // Also check quiz_users table for active status
        const { data: quizUser, error: userError } = await supabase
          .from('quiz_users')
          .select('id, status, current_step')
          .eq('phone_number', requestData.phoneNumber)
          .eq('status', 'active')
          .maybeSingle();

        if (!userError && quizUser) {
          activeQuizSession = true;
          determinedChatbotType = 'quiz';
          console.log('🎯 [API-CHATBOT] Active quiz user found, routing to quiz chatbot');
        }
      }
    }

    // For web messages, always use customer service
    if (requestData.source === 'web') {
      determinedChatbotType = 'client';
      console.log('🌐 [API-CHATBOT] Web message detected, routing to customer service');
    }

    // If no active quiz session, check for quiz trigger keywords
    if (!activeQuizSession && requestData.source === 'whatsapp') {
      const lowerMessage = requestData.text.toLowerCase();
      const quizKeywords = [
        'quiz', 'game', 'test', 'play', 'challenge', 'question', 'answer',
        'jeu', 'défi', 'réponse', 'questionnaire', 'commencer', 'start'
      ];
      
      if (quizKeywords.some(keyword => lowerMessage.includes(keyword))) {
        determinedChatbotType = 'quiz';
        console.log('🎯 [API-CHATBOT] Quiz keywords detected, routing to quiz chatbot');
      }
    }

    // STEP 2: ROUTE TO APPROPRIATE CHATBOT
    let response: string;
    let finalChatbotType = determinedChatbotType;

    if (determinedChatbotType === 'quiz') {
      // Route to quiz chatbot logic
      console.log('🎯 [API-CHATBOT] Processing with quiz chatbot');
      response = await processQuizMessage(requestData, supabase);
      
      // Update intent in saved message
      if (savedMessage?.id) {
        await supabase
          .from('customer_conversations')
          .update({ intent: 'quiz' })
          .eq('id', savedMessage.id);
      }
    } else {
      // STEP 3: CUSTOMER SERVICE LOGIC
      console.log('🎧 [API-CHATBOT] Processing with customer service chatbot');
      response = await processCustomerServiceMessage(requestData, supabase);
      finalChatbotType = 'client';
    }

    // Calculate response time
    const responseTime = (Date.now() - startTime) / 1000;
    console.log(`⏱️ [API-CHATBOT] Response generated in ${responseTime.toFixed(2)}s`);

    // Save bot response to database with EXPLICIT source preservation
    console.log('💾 [API-CHATBOT] Saving bot response with source:', requestData.source);
    const { data: savedResponse, error: responseError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: requestData.phoneNumber,
        web_user_id: requestData.webUserId,
        session_id: requestData.sessionId,
        source: requestData.source, // PRESERVE ORIGINAL SOURCE
        content: response,
        sender: 'bot',
        intent: finalChatbotType,
        response_time: responseTime,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (responseError) {
      console.error('❌ [API-CHATBOT] Error saving bot response:', responseError);
      // Continue even if save fails
    } else {
      console.log('✅ [API-CHATBOT] Bot response saved with source:', requestData.source);
    }

    // Return success response with source preservation
    const successResponse: ChatbotResponse = {
      success: true,
      response: response,
      sessionId: requestData.sessionId,
      messageId: savedResponse?.id,
      source: requestData.source, // PRESERVE AND RETURN SOURCE
      chatbotType: finalChatbotType
    };

    console.log('✅ [API-CHATBOT] Request processed successfully with chatbot type:', finalChatbotType);
    return new Response(
      JSON.stringify(successResponse),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;

    console.error('❌ [API-CHATBOT] Critical error:', {
      message: errorMessage,
      stack: errorStack,
      source: requestData?.source || 'unknown',
      hasRequestData: !!requestData
    });

    // Return error response with source preservation
    const errorResponse: ChatbotResponse = {
      success: false,
      error: errorMessage,
      sessionId: requestData?.sessionId,
      source: requestData?.source, // PRESERVE SOURCE EVEN IN ERROR
      chatbotType: 'client'
    };

    return new Response(
      JSON.stringify(errorResponse),
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

/**
 * Process quiz message with enhanced session handling
 */
async function processQuizMessage(
  requestData: ChatbotRequest,
  supabase: any
): Promise<string> {
  try {
    console.log('🎯 [QUIZ-PROCESSOR] Processing quiz message');
    
    // Get system-wide Groq client
    const groq = await getSystemGroqClient();

    // Generate quiz-specific response
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Vous êtes un maître de quiz interactif et engageant pour Airtel GPT.
Votre objectif est de créer une expérience de quiz amusante et éducative.
Soyez enthousiaste, encourageant et fournissez des commentaires constructifs.
Adaptez vos réponses selon le contexte: éducatif ou marketing.
Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais engageantes (maximum 300 mots).
${requestData.source === 'web' ? 'L\'utilisateur participe via le site web.' : 'L\'utilisateur participe via WhatsApp.'}`
        },
        { 
          role: "user", 
          content: requestData.text 
        }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.8,
      max_tokens: 1000,
    });

    return completion.choices[0]?.message?.content || 
      "Bienvenue au quiz ! Êtes-vous prêt à commencer cette aventure éducative ?";

  } catch (error) {
    console.error('❌ [QUIZ-PROCESSOR] Error processing quiz message:', error);
    return "Bienvenue au quiz ! Je rencontre quelques difficultés techniques, mais nous pouvons commencer. Êtes-vous prêt ?";
  }
}

/**
 * Enhanced customer service message processing with rule-based responses
 */
async function processCustomerServiceMessage(
  requestData: ChatbotRequest,
  supabase: any
): Promise<string> {
  try {
    console.log('🎧 [CUSTOMER-SERVICE] Processing customer service message');

    // STEP 1: Check for auto-reply rules
    const matchingRule = await findMatchingAutoReplyRule(requestData.text, requestData.phoneNumber, supabase);
    
    if (matchingRule) {
      console.log('🤖 [CUSTOMER-SERVICE] Found matching auto-reply rule:', matchingRule.id);
      return await generateRuleBasedResponse(requestData.text, matchingRule, supabase);
    }

    // STEP 2: Fallback to AI with enhanced business context
    console.log('🧠 [CUSTOMER-SERVICE] No matching rule found, using AI fallback');
    return await generateIntelligentFallbackResponse(requestData, supabase);

  } catch (error) {
    console.error('❌ [CUSTOMER-SERVICE] Error processing message:', error);
    return "Je suis désolé, je rencontre des difficultés techniques. Un agent vous contactera bientôt pour vous aider.";
  }
}

/**
 * Find matching auto-reply rule based on message content
 */
async function findMatchingAutoReplyRule(
  message: string,
  phoneNumber: string | undefined,
  supabase: any
): Promise<AutoReplyRule | null> {
  try {
    // Get user ID from phone number if available
    let userId = null;
    if (phoneNumber) {
      const { data: userProfile } = await supabase
        .from('profils_utilisateurs')
        .select('id')
        .eq('phone_number', phoneNumber)
        .maybeSingle();
      
      if (userProfile) {
        userId = userProfile.id;
      }
    }

    // If no specific user found, get any available auto-reply rules
    let query = supabase
      .from('whatsapp_auto_replies')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: rules, error } = await query;

    if (error) {
      console.error('❌ [AUTO-REPLY] Error fetching rules:', error);
      return null;
    }

    if (!rules || rules.length === 0) {
      console.log('📝 [AUTO-REPLY] No active rules found');
      return null;
    }

    console.log(`📝 [AUTO-REPLY] Found ${rules.length} active rules to check`);

    // Check each rule in priority order
    const normalizedMessage = message.toLowerCase().trim();
    
    for (const rule of rules) {
      if (await matchesRule(normalizedMessage, rule)) {
        console.log('✅ [AUTO-REPLY] Rule matched:', rule.id);
        return rule;
      }
    }

    console.log('❌ [AUTO-REPLY] No rules matched for message');
    return null;
  } catch (error) {
    console.error('❌ [AUTO-REPLY] Error checking rules:', error);
    return null;
  }
}

/**
 * Check if a message matches a specific rule
 */
async function matchesRule(normalizedMessage: string, rule: AutoReplyRule): Promise<boolean> {
  try {
    if (rule.use_regex) {
      // Use regex matching
      try {
        const flags = rule.pattern_flags || 'i';
        const regex = new RegExp(rule.trigger_words.join('|'), flags);
        return regex.test(normalizedMessage);
      } catch (regexError) {
        console.error('❌ [AUTO-REPLY] Invalid regex pattern in rule:', rule.id, regexError);
        return false;
      }
    } else {
      // Use simple keyword matching
      return rule.trigger_words.some(keyword => 
        normalizedMessage.includes(keyword.toLowerCase())
      );
    }
  } catch (error) {
    console.error('❌ [AUTO-REPLY] Error matching rule:', error);
    return false;
  }
}

/**
 * Generate rule-based response using AI enhancement
 */
async function generateRuleBasedResponse(
  userMessage: string,
  rule: AutoReplyRule,
  supabase: any
): Promise<string> {
  try {
    console.log('🤖 [RULE-RESPONSE] Generating enhanced rule-based response');
    
    // Process variables in the rule response
    let processedResponse = rule.response;
    
    // Replace built-in variables
    const now = new Date();
    const builtInVariables = {
      date: now.toLocaleDateString('fr-FR'),
      time: now.toLocaleTimeString('fr-FR'),
      company: 'Airtel GPT',
      support_email: 'support@airtelgpt.com'
    };
    
    // Replace built-in variables
    Object.entries(builtInVariables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedResponse = processedResponse.replace(regex, value);
    });
    
    // Replace custom variables if any
    if (rule.variables) {
      Object.entries(rule.variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{${key}}}`, 'g');
        processedResponse = processedResponse.replace(regex, value);
      });
    }

    // Enhance the rule response with AI for better context
    const groq = await getSystemGroqClient();
    
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `Vous êtes un assistant de service client professionnel pour Airtel GPT.
Une règle automatique a été déclenchée avec cette réponse de base: "${processedResponse}"

Votre tâche est d'améliorer cette réponse en:
1. La rendant plus professionnelle et personnalisée selon le message du client
2. Ajoutant des détails pertinents et utiles
3. Gardant le message principal de la règle automatique
4. Adaptant le ton selon le contexte du message utilisateur
5. Proposant des solutions concrètes si possible

Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais complètes (maximum 400 mots).
Soyez professionnel, courtois et orienté solution.`
        },
        { 
          role: "user", 
          content: `Message client: "${userMessage}"\nRéponse automatique de base: "${processedResponse}"` 
        }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.7,
      max_tokens: 1200,
    });

    const enhancedResponse = completion.choices[0]?.message?.content || processedResponse;
    
    console.log('✅ [RULE-RESPONSE] Enhanced rule-based response generated');
    return enhancedResponse;

  } catch (error) {
    console.error('❌ [RULE-RESPONSE] Error generating enhanced response:', error);
    // Return the basic rule response if AI enhancement fails
    return rule.response;
  }
}

/**
 * Generate intelligent fallback response with business context
 */
async function generateIntelligentFallbackResponse(
  requestData: ChatbotRequest,
  supabase: any
): Promise<string> {
  try {
    console.log('🧠 [AI-FALLBACK] Generating intelligent fallback response');
    
    // Get business context from app settings
    const { data: appSettings } = await supabase
      .from('app_settings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Get conversation history for context
    let conversationHistory = '';
    if (requestData.phoneNumber) {
      const { data: recentMessages } = await supabase
        .from('customer_conversations')
        .select('content, sender, created_at')
        .eq('phone_number', requestData.phoneNumber)
        .eq('intent', 'client')
        .order('created_at', { ascending: false })
        .limit(5);

      if (recentMessages && recentMessages.length > 1) {
        conversationHistory = '\n\nHistorique récent de la conversation:\n' +
          recentMessages.reverse().map(msg => 
            `${msg.sender === 'user' ? 'Client' : 'Assistant'}: ${msg.content}`
          ).join('\n');
      }
    }

    // Create enhanced system prompt with business context
    const systemPrompt = `Vous êtes un assistant de service client expert pour ${appSettings?.app_name || 'Airtel GPT'}.

INFORMATIONS ENTREPRISE:
- Nom: ${appSettings?.app_name || 'Airtel GPT'}
- Société: ${appSettings?.company_name || 'Ecopa\'n'}
- Email: ${appSettings?.contact_email || 'contact@airtelgpt.com'}
- Téléphone: ${appSettings?.contact_phone || '+221 XX XXX XX XX'}
- Adresse: ${appSettings?.contact_address || 'Brazzaville, République du Congo'}

VOTRE MISSION:
1. Analyser la demande du client avec précision
2. Fournir des réponses utiles et actionables
3. Être professionnel, courtois et orienté solution
4. Proposer des étapes concrètes quand c'est possible
5. Escalader vers un agent humain si nécessaire

DIRECTIVES SPÉCIALES:
- Pour les questions de prix/tarifs: Mentionnez que nous avons plusieurs forfaits adaptés aux besoins
- Pour les problèmes techniques: Proposez des étapes de dépannage de base
- Pour les réclamations: Montrez de l'empathie et proposez une résolution
- Pour les demandes d'information: Soyez précis et informatif

Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais complètes (maximum 500 mots).
${requestData.source === 'web' ? 'Le client vous contacte via le site web.' : 'Le client vous contacte via WhatsApp.'}${conversationHistory}`;

    const groq = await getSystemGroqClient();
    
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        { 
          role: "user", 
          content: requestData.text 
        }
      ],
      model: 'llama3-70b-8192',
      temperature: 0.7,
      max_tokens: 1500,
    });

    const aiResponse = completion.choices[0]?.message?.content || 
      "Je suis désolé, je n'ai pas pu générer une réponse appropriée. Un agent vous contactera bientôt.";

    console.log('✅ [AI-FALLBACK] Intelligent fallback response generated');
    return aiResponse;

  } catch (error) {
    console.error('❌ [AI-FALLBACK] Error generating fallback response:', error);
    return "Je suis désolé, je rencontre des difficultés techniques. Un agent vous contactera bientôt pour vous aider.";
  }
}

/**
 * Get a Groq client with fallback options
 */
async function getSystemGroqClient(): Promise<any> {
  try {
    // Try to get any available Groq configuration
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { data: anyConfig, error: configError } = await supabase
      .from('user_groq_config')
      .select('user_id, api_key, model')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (configError || !anyConfig || !anyConfig.api_key) {
      throw new Error('No Groq configuration found in the system');
    }
    
    console.log('🔑 [GROQ] Using system Groq configuration');
    return createGroqClient(anyConfig.api_key);
    
  } catch (error) {
    console.error('❌ [GROQ] Error getting Groq client:', error);
    throw new Error('Unable to initialize AI service');
  }
}