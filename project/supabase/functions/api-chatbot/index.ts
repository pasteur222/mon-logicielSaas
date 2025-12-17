import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Groq } from "npm:groq-sdk@0.26.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const DEFAULT_MODEL = "gemma2-9b-it";
const DEPRECATED_MODELS = ["llama3-70b-8192", "llama3-8b-8192", "gemma-7b-it", "mixtral-8x7b-32768"];
const REQUEST_TIMEOUT = 25000; // 25 seconds

interface ChatbotRequest {
  text: string;
  source: 'whatsapp' | 'web';
  chatbotType?: 'client' | 'quiz';
  phoneNumber?: string;
  phoneNumberId?: string;
  webUserId?: string;
  sessionId?: string;
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
}

/**
 * Identify the user from various identifiers
 */
async function identifyUser(
  supabase: any,
  phoneNumberId?: string,
  phoneNumber?: string,
  webUserId?: string
): Promise<string | null> {
  try {
    // Priority 1: Try to identify by WhatsApp Business Phone Number ID
    if (phoneNumberId) {
      console.log('🔍 [API-CHATBOT] Identifying user by phone_number_id:', phoneNumberId);
      const { data: whatsappConfig } = await supabase
        .from('user_whatsapp_config')
        .select('user_id')
        .eq('phone_number_id', phoneNumberId)
        .eq('is_active', true)
        .maybeSingle();

      if (whatsappConfig?.user_id) {
        console.log('✅ [API-CHATBOT] User identified by phone_number_id:', whatsappConfig.user_id);
        return whatsappConfig.user_id;
      }
    }

    // Priority 2: Try to identify by customer phone number in WhatsApp config
    if (phoneNumber) {
      console.log('🔍 [API-CHATBOT] Identifying user by customer phone_number:', phoneNumber);
      const { data: conversation } = await supabase
        .from('customer_conversations')
        .select('user_id')
        .eq('phone_number', phoneNumber)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conversation?.user_id) {
        console.log('✅ [API-CHATBOT] User identified by phone_number:', conversation.user_id);
        return conversation.user_id;
      }
    }

    // Priority 3: Try to identify by web user ID
    if (webUserId) {
      console.log('🔍 [API-CHATBOT] Identifying user by web_user_id:', webUserId);
      const { data: conversation } = await supabase
        .from('customer_conversations')
        .select('user_id')
        .eq('web_user_id', webUserId)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (conversation?.user_id) {
        console.log('✅ [API-CHATBOT] User identified by web_user_id:', conversation.user_id);
        return conversation.user_id;
      }
    }

    // Fallback: Use first available user with active configuration
    console.log('⚠️ [API-CHATBOT] Could not identify specific user, using fallback');
    const { data: fallbackUser } = await supabase
      .from('user_groq_config')
      .select('user_id')
      .limit(1)
      .maybeSingle();

    if (fallbackUser?.user_id) {
      console.log('✅ [API-CHATBOT] Using fallback user:', fallbackUser.user_id);
      return fallbackUser.user_id;
    }

    console.warn('⚠️ [API-CHATBOT] No user could be identified');
    return null;
  } catch (error) {
    console.error('❌ [API-CHATBOT] Error identifying user:', error);
    return null;
  }
}

/**
 * Check auto-reply rules for keyword matches
 */
async function checkAutoReplyRules(
  supabase: any,
  userId: string | null,
  messageText: string
): Promise<string | null> {
  try {
    if (!userId) {
      console.log('⚠️ [API-CHATBOT] No userId provided, skipping auto-reply check');
      return null;
    }

    const lowerMessage = messageText.toLowerCase().trim();

    const { data: rules, error } = await supabase
      .from('whatsapp_auto_replies')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('❌ [API-CHATBOT] Error querying auto-replies:', error);
      return null;
    }

    if (!rules || rules.length === 0) {
      console.log('📝 [API-CHATBOT] No auto-reply rules found for user');
      return null;
    }

    console.log(`📝 [API-CHATBOT] Checking ${rules.length} auto-reply rules`);

    for (const rule of rules) {
      const triggerWords = rule.trigger_words || [];

      for (const triggerWord of triggerWords) {
        if (lowerMessage.includes(triggerWord.toLowerCase())) {
          console.log(`✅ [API-CHATBOT] Auto-reply match: "${triggerWord}" -> Rule ID: ${rule.id}`);
          return rule.response;
        }
      }
    }

    console.log('📝 [API-CHATBOT] No trigger word matched in message');
    return null;
  } catch (error) {
    console.error('❌ [API-CHATBOT] Error checking auto-reply rules:', error);
    return null;
  }
}

/**
 * Get user's Groq configuration and create client
 */
async function getUserGroqClient(supabase: any, userId: string | null): Promise<{ client: Groq; model: string } | null> {
  try {
    if (!userId) {
      console.warn('⚠️ [API-CHATBOT] No userId provided, cannot get Groq config');
      return null;
    }

    const { data: groqConfig, error } = await supabase
      .from('user_groq_config')
      .select('api_key, model')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !groqConfig || !groqConfig.api_key) {
      console.warn('⚠️ [API-CHATBOT] No Groq config found for user, trying fallback');

      // Fallback: Try to get any available Groq configuration
      const { data: anyConfig } = await supabase
        .from('user_groq_config')
        .select('api_key, model')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!anyConfig || !anyConfig.api_key) {
        return null;
      }

      let modelToUse = anyConfig.model || DEFAULT_MODEL;
      if (DEPRECATED_MODELS.includes(modelToUse)) {
        modelToUse = DEFAULT_MODEL;
      }

      console.log('✅ [API-CHATBOT] Using fallback Groq config with model:', modelToUse);
      return {
        client: new Groq({ apiKey: anyConfig.api_key }),
        model: modelToUse
      };
    }

    let modelToUse = groqConfig.model || DEFAULT_MODEL;
    if (DEPRECATED_MODELS.includes(modelToUse)) {
      console.warn(`[SECURITY] Detected deprecated model ${modelToUse}, replacing with ${DEFAULT_MODEL}`);
      modelToUse = DEFAULT_MODEL;
    }

    console.log('✅ [API-CHATBOT] Using user Groq config with model:', modelToUse);
    return {
      client: new Groq({ apiKey: groqConfig.api_key }),
      model: modelToUse
    };
  } catch (error) {
    console.error('❌ [API-CHATBOT] Error getting Groq config:', error);
    return null;
  }
}

/**
 * Get user's WhatsApp credentials
 */
async function getUserWhatsAppCredentials(supabase: any, userId: string | null): Promise<{
  access_token: string;
  phone_number_id: string;
} | null> {
  try {
    if (!userId) {
      return null;
    }

    const { data: config, error } = await supabase
      .from('user_whatsapp_config')
      .select('access_token, phone_number_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !config) {
      console.error('❌ [API-CHATBOT] No WhatsApp config found for user:', userId);
      return null;
    }

    return config;
  } catch (error) {
    console.error('❌ [API-CHATBOT] Error getting WhatsApp credentials:', error);
    return null;
  }
}

/**
 * Send WhatsApp message
 */
async function sendWhatsAppMessage(
  credentials: { access_token: string; phone_number_id: string },
  phoneNumber: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const url = `https://graph.facebook.com/v17.0/${credentials.phone_number_id}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.access_token}`,
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
      console.error('❌ [API-CHATBOT] WhatsApp API error:', errorData);
      return {
        success: false,
        error: `WhatsApp API error: ${response.status}`
      };
    }

    const data = await response.json();
    console.log('✅ [API-CHATBOT] WhatsApp message sent successfully');

    return {
      success: true,
      messageId: data.messages?.[0]?.id
    };
  } catch (error) {
    console.error('❌ [API-CHATBOT] Failed to send WhatsApp message:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

Deno.serve(async (req: Request) => {
  const startTime = Date.now();

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing Supabase environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const requestData: ChatbotRequest = await req.json();

    console.log('🤖 [API-CHATBOT] Request data received:', {
      source: requestData.source,
      chatbotType: requestData.chatbotType,
      hasText: !!requestData.text,
      textLength: requestData.text?.length || 0,
      hasWebUserId: !!requestData.webUserId,
      hasPhoneNumber: !!requestData.phoneNumber,
      hasPhoneNumberId: !!requestData.phoneNumberId,
      hasSessionId: !!requestData.sessionId
    });

    // Validate request data
    if (!requestData.text || !requestData.source) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Missing required fields: text and source are required'
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

    // Verify and normalize source
    const verifiedSource = requestData.source === 'web' ? 'web' : 'whatsapp';
    console.log('🔍 [API-CHATBOT] Verified source:', verifiedSource);

    // Save incoming message to database
    console.log('💾 [API-CHATBOT] Saving incoming message to database');
    const { data: savedMessage, error: saveError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: requestData.phoneNumber,
        web_user_id: requestData.webUserId,
        session_id: requestData.sessionId,
        source: verifiedSource,
        content: requestData.text,
        sender: 'user',
        intent: requestData.chatbotType || 'client',
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('❌ [API-CHATBOT] CRITICAL: Failed to save incoming message:', JSON.stringify(saveError, null, 2));
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to process message. Please try again.',
          retryable: true
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

    console.log('✅ [API-CHATBOT] Incoming message saved with ID:', savedMessage.id);

    // Identify user from WhatsApp Business Phone Number ID or customer phone
    console.log('👤 [API-CHATBOT] Identifying user...');
    const userId = await identifyUser(
      supabase,
      requestData.phoneNumberId,  // ✅ PRIMARY: WhatsApp Business Phone Number ID
      requestData.phoneNumber,    // ✅ FALLBACK: Customer phone number
      requestData.webUserId
    );

    if (userId) {
      console.log('✅ [API-CHATBOT] User identified:', userId);
      // Update the saved message with user_id
      await supabase
        .from('customer_conversations')
        .update({ user_id: userId })
        .eq('id', savedMessage.id);
    } else {
      console.warn('⚠️ [API-CHATBOT] Could not identify user, proceeding without user_id');
    }

    // ✅ STEP 1: Check auto-reply rules first (keyword-based responses)
    console.log('🔍 [API-CHATBOT] Checking auto-reply rules for keyword matches');
    const autoReplyResponse = await checkAutoReplyRules(supabase, userId, requestData.text);

    let sanitizedResponse: string;
    let responseTime: number;

    if (autoReplyResponse) {
      // ✅ AUTO-REPLY MATCHED: Use the configured response
      console.log('✅ [API-CHATBOT] Using auto-reply response (keyword matched)');
      sanitizedResponse = autoReplyResponse;
      responseTime = (Date.now() - startTime) / 1000;

      // Remove any potential HTML/script content for security
      sanitizedResponse = sanitizedResponse
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();

      // Truncate if too long
      if (sanitizedResponse.length > 4000) {
        console.warn('🎧 [API-CHATBOT] Auto-reply response too long, truncating');
        sanitizedResponse = sanitizedResponse.substring(0, 3997) + '...';
      }
    } else {
      // ✅ NO AUTO-REPLY MATCH: Generate AI response
      console.log('🤖 [API-CHATBOT] No auto-reply match, using AI generation');

      // Get user-specific Groq client for customer service
      console.log('🧠 [API-CHATBOT] Creating user-specific Groq client');
      const groqConfig = await getUserGroqClient(supabase, userId);

      if (!groqConfig) {
        console.error('❌ [API-CHATBOT] No Groq configuration available');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Service de messagerie non configuré. Veuillez contacter l\'administrateur.',
            retryable: false,
            configRequired: true
          }),
          {
            status: 503,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          }
        );
      }

      const groq = groqConfig.client;
      const model = groqConfig.model;
      console.log('🎯 [API-CHATBOT] Using configured model:', model);

      // Generate system prompt based on source
      const systemPrompt = `Vous êtes un assistant de service client professionnel pour Airtel GPT.
Votre objectif est d'aider les clients avec leurs demandes, problèmes et questions.
Soyez professionnel, courtois et orienté solution.
Fournissez des instructions claires et demandez des clarifications si nécessaire.
Si vous ne pouvez pas résoudre un problème, proposez de l'escalader vers un agent humain.
Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais complètes (maximum 500 mots).
${verifiedSource === 'web' ? 'Le client vous contacte via le site web.' : 'Le client vous contacte via WhatsApp.'}`;

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), REQUEST_TIMEOUT);
      });

      // Generate response using Groq with timeout
      console.log('🧠 [API-CHATBOT] Generating AI response with timeout:', REQUEST_TIMEOUT, 'ms');
      let completion;

      try {
        completion = await Promise.race([
          groq.chat.completions.create({
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
            model: model, // ✅ Use user's configured model
            temperature: 0.7,
            max_tokens: 1500,
          }),
          timeoutPromise
        ]);
      } catch (timeoutError) {
        if (timeoutError.message === 'Request timeout') {
          console.error('❌ [API-CHATBOT] Request timeout after', REQUEST_TIMEOUT, 'ms');
          return new Response(
            JSON.stringify({
              success: false,
              error: 'La requête a pris trop de temps. Veuillez réessayer avec un message plus court.',
              timeout: true
            }),
            {
              status: 408,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            }
          );
        }
        throw timeoutError;
      }

      const response = completion.choices[0]?.message?.content ||
        "Je suis désolé, je n'ai pas pu générer une réponse appropriée. Un agent vous contactera bientôt.";

      // Validate and sanitize response
      sanitizedResponse = response;
      if (sanitizedResponse.length > 4000) {
        console.warn('🎧 [API-CHATBOT] Response too long, truncating');
        sanitizedResponse = sanitizedResponse.substring(0, 3997) + '...';
      }

      // Remove any potential HTML/script content for security
      sanitizedResponse = sanitizedResponse
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<[^>]*>/g, '')
        .trim();

      // Calculate response time
      responseTime = (Date.now() - startTime) / 1000;
      console.log(`⏱️ [API-CHATBOT] Response generated in ${responseTime.toFixed(2)}s`);
    }

    // Save bot response to database with verified source and user_id
    console.log('💾 [API-CHATBOT] Saving bot response with verified source:', verifiedSource);
    const { data: savedResponse, error: responseError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: requestData.phoneNumber,
        web_user_id: requestData.webUserId,
        session_id: requestData.sessionId,
        source: verifiedSource, // Use verified source
        content: sanitizedResponse,
        sender: 'bot',
        intent: 'client',
        response_time: responseTime,
        user_id: userId, // Include identified user_id
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (responseError) {
      console.error('❌ [API-CHATBOT] Error saving bot response:', responseError);
      // Don't fail the request if response save fails - user still gets response
    } else {
      console.log('✅ [API-CHATBOT] Bot response saved with ID:', savedResponse.id);
    }

    // ✅ AUTONOMOUS: For WhatsApp messages, send response directly using user's credentials
    if (verifiedSource === 'whatsapp' && requestData.phoneNumber) {
      console.log('📱 [API-CHATBOT] WhatsApp message detected, sending response autonomously');

      // Get user's WhatsApp credentials
      const whatsappCredentials = await getUserWhatsAppCredentials(supabase, userId);

      if (whatsappCredentials) {
        // Send WhatsApp message using user's credentials
        const sendResult = await sendWhatsAppMessage(
          whatsappCredentials,
          requestData.phoneNumber,
          sanitizedResponse
        );

        if (sendResult.success) {
          console.log('✅ [API-CHATBOT] WhatsApp message sent successfully, message ID:', sendResult.messageId);
        } else {
          console.error('❌ [API-CHATBOT] Failed to send WhatsApp message:', sendResult.error);
          // Don't fail the entire request - response was saved to database
        }
      } else {
        console.error('❌ [API-CHATBOT] Cannot send WhatsApp message - credentials not found for user:', userId);
        // Don't fail - webhook can handle fallback if needed
      }
    }

    // Return success response with verified source
    const successResponse: ChatbotResponse = {
      success: true,
      response: sanitizedResponse,
      sessionId: requestData.sessionId,
      messageId: savedResponse?.id,
      source: verifiedSource // Return verified source
    };

    console.log('✅ [API-CHATBOT] Request processed successfully with source:', verifiedSource);
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
    console.error('❌ [API-CHATBOT] Critical error:', {
      message: error.message,
      stack: error.stack
    });

    // Return error response
    const errorResponse: ChatbotResponse = {
      success: false,
      error: error.message || 'An unexpected error occurred'
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