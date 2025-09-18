// Follow this setup guide to integrate the Deno runtime and Supabase functions in your project:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createGroqClient } from "../_shared/groq-client.ts";
import { determineChatbotTypeFromMessage } from "../_shared/chatbot-utils.ts";

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
}

serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();
  
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
    let requestData: ChatbotRequest;
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
        intent: 'client', // Always use client for this endpoint
        user_agent: requestData.userAgent,
        created_at: requestData.timestamp || new Date().toISOString()
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('❌ [API-CHATBOT] Error saving incoming message:', saveError);
      // Continue processing even if save fails
    } else {
      console.log('✅ [API-CHATBOT] Incoming message saved with source:', requestData.source);
    }

    // Get system-wide Groq client for customer service
    console.log('🧠 [API-CHATBOT] Creating Groq client for customer service');
    const groq = await getSystemGroqClient();

    // Generate system prompt based on source
    const systemPrompt = `Vous êtes un assistant de service client professionnel pour Airtel GPT.
Votre objectif est d'aider les clients avec leurs demandes, problèmes et questions.
Soyez professionnel, courtois et orienté solution.
Fournissez des instructions claires et demandez des clarifications si nécessaire.
Si vous ne pouvez pas résoudre un problème, proposez de l'escalader vers un agent humain.
Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais complètes (maximum 500 mots).
${requestData.source === 'web' ? 'Le client vous contacte via le site web.' : 'Le client vous contacte via WhatsApp.'}`;

    // Generate response using Groq
    console.log('🧠 [API-CHATBOT] Generating AI response');
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

    const response = completion.choices[0]?.message?.content || 
      "Je suis désolé, je n'ai pas pu générer une réponse appropriée. Un agent vous contactera bientôt.";

    // Validate and sanitize response
    let sanitizedResponse = response;
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
        content: sanitizedResponse,
        sender: 'bot',
        intent: 'client',
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
      response: sanitizedResponse,
      sessionId: requestData.sessionId,
      messageId: savedResponse?.id,
      source: requestData.source // PRESERVE AND RETURN SOURCE
    };

    console.log('✅ [API-CHATBOT] Request processed successfully with source:', requestData.source);
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
      source: requestData?.source // PRESERVE SOURCE EVEN IN ERROR
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