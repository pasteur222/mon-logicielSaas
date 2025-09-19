import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { createGroqClient, getSystemGroqClient } from "../_shared/groq-client.ts";

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

// Enhanced logging function with anonymization
function logInfo(message: string, data?: any) {
  const anonymizedData = data ? anonymizeLogData(data) : undefined;
  console.log(`[API-CHATBOT] ${message}`, anonymizedData ? JSON.stringify(anonymizedData, null, 2) : '');
}

function logError(message: string, error?: any, requestData?: any) {
  const anonymizedRequest = requestData ? anonymizeLogData(requestData) : undefined;
  console.error(`[API-CHATBOT] ERROR: ${message}`, {
    error: error?.message || error,
    stack: error?.stack,
    request: anonymizedRequest
  });
}

// Anonymize sensitive data for logging
function anonymizeLogData(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const anonymized = { ...data };
  
  // Anonymize phone numbers (keep first 3 and last 2 digits)
  if (anonymized.phoneNumber && typeof anonymized.phoneNumber === 'string') {
    const phone = anonymized.phoneNumber;
    if (phone.length > 5) {
      anonymized.phoneNumber = phone.substring(0, 3) + '***' + phone.substring(phone.length - 2);
    }
  }
  
  // Truncate long text content
  if (anonymized.text && typeof anonymized.text === 'string' && anonymized.text.length > 100) {
    anonymized.text = anonymized.text.substring(0, 100) + '... [truncated]';
  }
  
  return anonymized;
}

serve(async (req: Request): Promise<Response> => {
  const startTime = Date.now();
  let requestData: ChatbotRequest | undefined;
  
  try {
    logInfo(`${req.method} request received from ${req.headers.get('origin') || 'unknown'}`);

    // Handle CORS preflight request
    if (req.method === 'OPTIONS') {
      logInfo('CORS preflight request handled');
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      logError('Method not allowed', null, { method: req.method });
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

    // Parse and validate request body with proper error handling
    try {
      const rawBody = await req.text();
      if (!rawBody || rawBody.trim() === '') {
        throw new Error('Request body is empty');
      }
      
      requestData = JSON.parse(rawBody) as ChatbotRequest;
      logInfo('Request data parsed successfully', {
        source: requestData.source,
        chatbotType: requestData.chatbotType,
        hasText: !!requestData.text,
        textLength: requestData.text?.length || 0,
        hasWebUserId: !!requestData.webUserId,
        hasPhoneNumber: !!requestData.phoneNumber,
        hasSessionId: !!requestData.sessionId
      });
    } catch (parseError) {
      logError('Failed to parse request JSON', parseError);
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
      logError('Missing or empty text field', null, requestData);
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
      logError('Invalid source field', null, requestData);
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
      logError('Text too long', null, { textLength: requestData.text.length });
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
      logError('Missing Supabase environment variables');
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
    logInfo('Saving incoming message with source', { source: requestData.source });
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
      logError('Error saving incoming message', saveError, requestData);
      // Continue processing even if save fails
    } else {
      logInfo('Incoming message saved successfully', { source: requestData.source });
    }

    // Get system-wide Groq client for customer service
    logInfo('Creating Groq client for customer service');
    let groq;
    try {
      groq = await getSystemGroqClient();
      logInfo('Groq client created successfully');
    } catch (groqError) {
      logError('Failed to create Groq client', groqError, requestData);
      
      // Return a fallback response instead of failing completely
      const fallbackResponse = requestData.source === 'web'
        ? "Désolé, notre service est temporairement indisponible. Veuillez réessayer dans quelques minutes."
        : "Merci pour votre message. Notre équipe vous répondra dans les plus brefs délais.";
      
      // Try to save fallback response
      try {
        await supabase
          .from('customer_conversations')
          .insert({
            phone_number: requestData.phoneNumber,
            web_user_id: requestData.webUserId,
            session_id: requestData.sessionId,
            source: requestData.source,
            content: fallbackResponse,
            sender: 'bot',
            intent: 'client',
            created_at: new Date().toISOString()
          });
      } catch (fallbackSaveError) {
        logError('Failed to save fallback response', fallbackSaveError);
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, // Return success to prevent webhook retries
          response: fallbackResponse,
          sessionId: requestData.sessionId,
          source: requestData.source,
          error: 'Processed with fallback response due to AI service unavailability'
        }),
        { 
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Generate system prompt based on source
    const systemPrompt = `Vous êtes un assistant de service client professionnel pour Airtel GPT.
Votre objectif est d'aider les clients avec leurs demandes, problèmes et questions.
Soyez professionnel, courtois et orienté solution.
Fournissez des instructions claires et demandez des clarifications si nécessaire.
Si vous ne pouvez pas résoudre un problème, proposez de l'escalader vers un agent humain.
Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais complètes (maximum 500 mots).
${requestData.source === 'web' ? 'Le client vous contacte via le site web.' : 'Le client vous contacte via WhatsApp.'}`;

    // Generate response using Groq with error handling
    logInfo('Generating AI response');
    let response: string;
    try {
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

      response = completion.choices[0]?.message?.content || 
        "Je suis désolé, je n'ai pas pu générer une réponse appropriée. Un agent vous contactera bientôt.";
      
      logInfo('AI response generated successfully');
    } catch (aiError) {
      logError('AI response generation failed', aiError, requestData);
      
      // Use fallback response
      response = requestData.source === 'web'
        ? "Désolé, notre service est temporairement indisponible. Veuillez réessayer dans quelques minutes."
        : "Merci pour votre message. Notre équipe vous répondra dans les plus brefs délais.";
    }

    // Validate and sanitize response
    let sanitizedResponse = response;
    if (sanitizedResponse.length > 4000) {
      logInfo('Response too long, truncating', { originalLength: sanitizedResponse.length });
      sanitizedResponse = sanitizedResponse.substring(0, 3997) + '...';
    }

    // Remove any potential HTML/script content for security
    sanitizedResponse = sanitizedResponse
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]*>/g, '')
      .trim();

    // Calculate response time
    const responseTime = (Date.now() - startTime) / 1000;
    logInfo(`Response generated in ${responseTime.toFixed(2)}s`);

    // Save bot response to database with EXPLICIT source preservation
    logInfo('Saving bot response with source', { source: requestData.source });
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
      logError('Error saving bot response', responseError, requestData);
      // Continue even if save fails
    } else {
      logInfo('Bot response saved successfully', { source: requestData.source });
    }

    // Return success response with source preservation
    const successResponse: ChatbotResponse = {
      success: true,
      response: sanitizedResponse,
      sessionId: requestData.sessionId,
      messageId: savedResponse?.id,
      source: requestData.source // PRESERVE AND RETURN SOURCE
    };

    logInfo('Request processed successfully', { source: requestData.source });
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
    logError('Critical error in api-chatbot', error, requestData);
    
    // Ensure we have a fallback response even in critical errors
    const fallbackResponse = requestData?.source === 'web'
      ? "Désolé, notre service est temporairement indisponible. Veuillez réessayer dans quelques minutes."
      : "Merci pour votre message. Notre équipe vous répondra dans les plus brefs délais.";
    
    // Try to save fallback response if we have request data
    if (requestData) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        
        if (supabaseUrl && supabaseServiceKey) {
          const supabase = createClient(supabaseUrl, supabaseServiceKey);
          
          await supabase
            .from('customer_conversations')
            .insert({
              phone_number: requestData.phoneNumber,
              web_user_id: requestData.webUserId,
              session_id: requestData.sessionId,
              source: requestData.source,
              content: fallbackResponse,
              sender: 'bot',
              intent: 'client',
              created_at: new Date().toISOString()
            });
          
          logInfo('Fallback response saved successfully', { source: requestData.source });
        }
      } catch (fallbackError) {
        logError('Failed to save fallback response', fallbackError);
      }
    }
    
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