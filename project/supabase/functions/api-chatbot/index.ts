// Follow this setup guide to integrate the Deno runtime and Supabase functions in your project:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Groq from "npm:groq-sdk@0.26.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

interface ChatbotRequest {
  webUserId?: string;
  phoneNumber?: string;
  phoneNumberId?: string; // ✅ ADDED: WhatsApp Business Phone Number ID
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
}

// Request timeout configuration (must be less than client timeout)
const REQUEST_TIMEOUT = 25000; // 25 seconds

/**
 * Identify user from WhatsApp Business Phone Number ID or customer phone number
 * Returns user_id if found, null otherwise
 */
async function identifyUser(
  supabase: any,
  phoneNumberId?: string,
  customerPhoneNumber?: string,
  webUserId?: string
): Promise<string | null> {
  try {
    // ✅ PRIMARY METHOD: For WhatsApp messages, find user by WhatsApp Business Phone Number ID
    if (phoneNumberId) {
      console.log('🔍 [API-CHATBOT] Looking up user by WhatsApp Business Phone Number ID:', phoneNumberId);

      const { data: whatsappConfig, error } = await supabase
        .from('user_whatsapp_config')
        .select('user_id')
        .eq('phone_number_id', phoneNumberId) // ✅ FIXED: Match on business phone_number_id
        .eq('is_active', true)
        .maybeSingle();

      if (!error && whatsappConfig?.user_id) {
        console.log('✅ [API-CHATBOT] Found user from WhatsApp config:', whatsappConfig.user_id);
        return whatsappConfig.user_id;
      } else {
        console.warn('⚠️ [API-CHATBOT] No user found for phone_number_id:', phoneNumberId);
        if (error) {
          console.error('❌ [API-CHATBOT] Database error:', error);
        }
      }
    }

    // ✅ FALLBACK METHOD: Try to find in existing conversations using customer phone
    if (customerPhoneNumber) {
      console.log('🔍 [API-CHATBOT] Fallback: Looking up user from conversation history for customer:', customerPhoneNumber);

      const { data: conversation, error: convError } = await supabase
        .from('customer_conversations')
        .select('user_id')
        .eq('phone_number', customerPhoneNumber)
        .not('user_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!convError && conversation?.user_id) {
        console.log('✅ [API-CHATBOT] Found user from conversation history:', conversation.user_id);
        return conversation.user_id;
      }
    }

    // For web messages, could add web user lookup here if needed
    if (webUserId) {
      console.log('🔍 [API-CHATBOT] Web user ID provided:', webUserId);
      // Could map web_user_id to user_id if there's a mapping table
    }

    console.warn('⚠️ [API-CHATBOT] Could not identify user from provided identifiers', {
      phoneNumberId,
      customerPhoneNumber,
      webUserId
    });
    return null;
  } catch (error) {
    console.error('❌ [API-CHATBOT] Error identifying user:', error);
    return null;
  }
}

/**
 * Get user's WhatsApp credentials (access_token, phone_number_id)
 * Returns credentials object or null if not configured
 */
async function getUserWhatsAppCredentials(
  supabase: any,
  userId: string | null
): Promise<{ accessToken: string; phoneNumberId: string } | null> {
  try {
    if (!userId) {
      console.warn('⚠️ [API-CHATBOT] No user ID provided for WhatsApp credentials');
      return null;
    }

    console.log('🔍 [API-CHATBOT] Fetching WhatsApp credentials for user:', userId);

    const { data: whatsappConfig, error } = await supabase
      .from('user_whatsapp_config')
      .select('access_token, phone_number_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('❌ [API-CHATBOT] Error fetching WhatsApp credentials:', error);
      return null;
    }

    if (!whatsappConfig || !whatsappConfig.access_token || !whatsappConfig.phone_number_id) {
      console.warn('⚠️ [API-CHATBOT] WhatsApp credentials not configured for user:', userId);
      return null;
    }

    console.log('✅ [API-CHATBOT] Found WhatsApp credentials for user');
    return {
      accessToken: whatsappConfig.access_token,
      phoneNumberId: whatsappConfig.phone_number_id
    };
  } catch (error) {
    console.error('❌ [API-CHATBOT] Exception fetching WhatsApp credentials:', error);
    return null;
  }
}

/**
 * Check auto-reply rules for keyword matches
 * Returns matched response or null if no match found
 */
async function checkAutoReplyRules(
  supabase: any,
  userId: string | null,
  userMessage: string
): Promise<string | null> {
  try {
    if (!userId) {
      console.log('🔍 [API-CHATBOT] No user ID, skipping auto-reply check');
      return null;
    }

    console.log('🔍 [API-CHATBOT] Checking auto-reply rules for user:', userId);

    // Get all active auto-reply rules for this user, ordered by priority
    const { data: rules, error } = await supabase
      .from('whatsapp_auto_replies')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error) {
      console.error('❌ [API-CHATBOT] Error fetching auto-reply rules:', error);
      return null;
    }

    if (!rules || rules.length === 0) {
      console.log('ℹ️ [API-CHATBOT] No auto-reply rules configured for user');
      return null;
    }

    console.log(`🔍 [API-CHATBOT] Found ${rules.length} auto-reply rules, checking for matches...`);

    // Normalize user message for matching (lowercase, trim)
    const normalizedMessage = userMessage.toLowerCase().trim();

    // Check each rule in priority order
    for (const rule of rules) {
      if (!rule.trigger_words || rule.trigger_words.length === 0) {
        continue;
      }

      // Check if any trigger word matches
      const matched = rule.trigger_words.some((keyword: string) => {
        const normalizedKeyword = keyword.toLowerCase().trim();

        if (rule.use_regex) {
          // Use regex matching if enabled
          try {
            const regex = new RegExp(normalizedKeyword, rule.pattern_flags || 'i');
            return regex.test(normalizedMessage);
          } catch (regexError) {
            console.error('❌ [API-CHATBOT] Invalid regex pattern:', normalizedKeyword);
            return false;
          }
        } else {
          // Simple keyword matching (case-insensitive)
          return normalizedMessage.includes(normalizedKeyword);
        }
      });

      if (matched) {
        console.log(`✅ [API-CHATBOT] Matched auto-reply rule (priority ${rule.priority}):`, rule.trigger_words);

        // Log analytics
        try {
          await supabase
            .from('auto_reply_analytics')
            .insert({
              rule_id: rule.id,
              phone_number: normalizedMessage.substring(0, 20), // Just for logging
              triggered_at: new Date().toISOString(),
              successful: true
            });
        } catch (analyticsError) {
          console.warn('⚠️ [API-CHATBOT] Failed to log auto-reply analytics:', analyticsError);
        }

        // Replace variables if any
        let response = rule.response;
        if (rule.variables && typeof rule.variables === 'object') {
          for (const [key, value] of Object.entries(rule.variables)) {
            response = response.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
          }
        }

        return response;
      }
    }

    console.log('ℹ️ [API-CHATBOT] No auto-reply rule matched, will use AI');
    return null;
  } catch (error) {
    console.error('❌ [API-CHATBOT] Exception checking auto-reply rules:', error);
    return null;
  }
}

/**
 * Get user-specific Groq client for customer service
 * Returns null if no configuration found (instead of throwing)
 */
async function getUserGroqClient(
  supabase: any,
  userId: string | null
): Promise<{ client: any; model: string } | null> {
  try {
    if (!userId) {
      console.warn('⚠️ [API-CHATBOT] No user ID provided for Groq client');
      return null;
    }

    console.log('🔍 [API-CHATBOT] Fetching Groq config for user:', userId);

    // Get user's Groq configuration from user_groq_config
    const { data: groqConfig, error: groqError } = await supabase
      .from('user_groq_config')
      .select('api_key, model')
      .eq('user_id', userId)
      .maybeSingle();

    if (groqError) {
      console.error('❌ [API-CHATBOT] Error fetching Groq config:', groqError);
      return null;
    }

    if (!groqConfig || !groqConfig.api_key) {
      console.error('❌ [API-CHATBOT] No Groq configuration found for user:', userId);
      return null;
    }

    // Use configured model or fallback to default
    const DEFAULT_MODEL = 'gemma2-9b-it';
    const DEPRECATED_MODELS = ["llama3-70b-8192", "llama3-8b-8192", "gemma-7b-it", "mixtral-8x7b-32768"];

    let model = groqConfig.model || DEFAULT_MODEL;

    // Check if model is deprecated and replace it
    if (DEPRECATED_MODELS.includes(model)) {
      console.warn(`⚠️ [API-CHATBOT] Detected deprecated model ${model}, switching to ${DEFAULT_MODEL}`);
      model = DEFAULT_MODEL;

      // Update the database to prevent future issues
      try {
        await supabase
          .from('user_groq_config')
          .update({ model: DEFAULT_MODEL })
          .eq('user_id', userId);
        console.log(`✅ [API-CHATBOT] Updated user ${userId}'s model from deprecated to ${DEFAULT_MODEL}`);
      } catch (updateError) {
        console.error('❌ [API-CHATBOT] Failed to update deprecated model in database:', updateError);
      }
    }

    console.log('✅ [API-CHATBOT] Found Groq config, model:', model);

    return {
      client: new Groq({ apiKey: groqConfig.api_key }),
      model: model
    };
  } catch (error) {
    console.error('❌ [API-CHATBOT] Error creating Groq client:', error);
    return null;
  }
}

/**
 * Send WhatsApp message using user's credentials
 */
async function sendWhatsAppMessage(
  credentials: { accessToken: string; phoneNumberId: string },
  recipientPhone: string,
  messageText: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    console.log('📤 [API-CHATBOT] Sending WhatsApp message to:', recipientPhone);

    const whatsappApiUrl = `https://graph.facebook.com/v17.0/${credentials.phoneNumberId}/messages`;

    const response = await fetch(whatsappApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientPhone,
        type: 'text',
        text: {
          preview_url: false,
          body: messageText
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('❌ [API-CHATBOT] WhatsApp API error:', response.status, errorData);
      return {
        success: false,
        error: `WhatsApp API returned ${response.status}: ${errorData}`
      };
    }

    const responseData = await response.json();
    console.log('✅ [API-CHATBOT] WhatsApp message sent successfully:', responseData.messages?.[0]?.id);

    return {
      success: true,
      messageId: responseData.messages?.[0]?.id
    };
  } catch (error) {
    console.error('❌ [API-CHATBOT] Exception sending WhatsApp message:', error);
    return {
      success: false,
      error: error.message || 'Failed to send WhatsApp message'
    };
  }
}

/**
 * Validate source from request context
 */
function validateAndGetSource(req: Request, claimedSource: string): 'web' | 'whatsapp' {
  const referer = req.headers.get('referer');
  const origin = req.headers.get('origin');
  const userAgent = req.headers.get('user-agent') || '';

  // If request has referer or origin, it's definitely from web
  if (referer || origin) {
    if (claimedSource !== 'web') {
      console.warn(`⚠️ [API-CHATBOT] Source mismatch: claimed ${claimedSource}, but has referer/origin`);
    }
    return 'web';
  }

  // If claimed as WhatsApp, trust it (no easy way to verify)
  // But log for monitoring
  if (claimedSource === 'whatsapp') {
    console.log('📱 [API-CHATBOT] WhatsApp source claimed (no referer)');
    return 'whatsapp';
  }

  // Default to claimed source
  return claimedSource as 'web' | 'whatsapp';
}

/**
 * Safely convert timestamp to ISO string format
 * Handles UNIX timestamps (seconds), milliseconds, and ISO strings
 */
function convertToISOTimestamp(timestamp?: string | number): string {
  try {
    if (!timestamp) {
      return new Date().toISOString();
    }

    // If already an ISO string, validate and return
    if (typeof timestamp === 'string' && timestamp.includes('T')) {
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    // Convert to number if string
    const numericTimestamp = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;

    // Check if it's a valid number
    if (isNaN(numericTimestamp)) {
      console.warn('⚠️ [API-CHATBOT] Invalid timestamp, using current time:', timestamp);
      return new Date().toISOString();
    }

    // If timestamp is in seconds (< year 3000 in seconds: 32503680000)
    // Convert to milliseconds by multiplying by 1000
    const timestampMs = numericTimestamp < 32503680000 ? numericTimestamp * 1000 : numericTimestamp;

    const date = new Date(timestampMs);

    // Validate the date
    if (isNaN(date.getTime())) {
      console.warn('⚠️ [API-CHATBOT] Invalid date from timestamp, using current time:', timestamp);
      return new Date().toISOString();
    }

    console.log('✅ [API-CHATBOT] Timestamp converted:', {
      input: timestamp,
      output: date.toISOString()
    });

    return date.toISOString();
  } catch (error) {
    console.error('❌ [API-CHATBOT] Error converting timestamp:', error);
    return new Date().toISOString();
  }
}

/**
 * Check for duplicate messages to prevent double-processing
 */
async function checkDuplicateMessage(
  supabase: any,
  content: string,
  phoneNumber?: string,
  webUserId?: string,
  sender: string = 'user'
): Promise<boolean> {
  try {
    let query = supabase
      .from('customer_conversations')
      .select('id')
      .eq('content', content)
      .eq('sender', sender)
      .gte('created_at', new Date(Date.now() - 10000).toISOString()); // Within last 10 seconds

    if (phoneNumber) {
      query = query.eq('phone_number', phoneNumber);
    } else if (webUserId) {
      query = query.eq('web_user_id', webUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      console.error('❌ [API-CHATBOT] Error checking duplicate:', error);
      return false; // On error, assume no duplicate
    }

    return !!data;
  } catch (error) {
    console.error('❌ [API-CHATBOT] Exception checking duplicate:', error);
    return false;
  }
}

serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();
  let requestData: ChatbotRequest | null = null;

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
        hasPhoneNumberId: !!requestData.phoneNumberId, // ✅ Log for debugging
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

    // Validate and get trusted source
    const verifiedSource = validateAndGetSource(req, requestData.source);

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

    // Check for duplicate message
    const isDuplicate = await checkDuplicateMessage(
      supabase,
      requestData.text,
      requestData.phoneNumber,
      requestData.webUserId,
      'user'
    );

    if (isDuplicate) {
      console.log('⚠️ [API-CHATBOT] Duplicate message detected, skipping processing');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Duplicate message detected. Please wait before sending again.',
          duplicate: true
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Save incoming message to database with verified source
    console.log('💾 [API-CHATBOT] Saving incoming message with verified source:', verifiedSource);

    // Convert timestamp safely
    const safeTimestamp = convertToISOTimestamp(requestData.timestamp);
    console.log('🕐 [API-CHATBOT] Using timestamp:', safeTimestamp);

    const { data: savedMessage, error: saveError } = await supabase
      .from('customer_conversations')
      .insert({
        phone_number: requestData.phoneNumber,
        web_user_id: requestData.webUserId,
        session_id: requestData.sessionId,
        source: verifiedSource, // Use verified source
        content: requestData.text,
        sender: 'user',
        intent: 'client',
        user_agent: requestData.userAgent,
        created_at: safeTimestamp
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
      stack: error.stack,
      source: requestData?.source || 'unknown'
    });

    // Return error response with source preservation
    const errorResponse: ChatbotResponse = {
      success: false,
      error: error.message || 'An unexpected error occurred',
      sessionId: requestData?.sessionId,
      source: requestData?.source
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
