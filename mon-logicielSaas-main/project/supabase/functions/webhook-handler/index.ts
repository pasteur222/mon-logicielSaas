// Follow this setup guide to integrate the Deno runtime and Supabase functions in your project:
// https://deno.land/manual/getting_started/setup_your_environment

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getSystemGroqClient } from "../_shared/groq-client.ts";

// Define CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// Standard error response for webhook failures
const STANDARD_ERROR_RESPONSE = "Thank you for your message regarding customer service, your request has been received and will be processed by our team, we will get back to you shortly.";

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { 
          status: 405,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Parse request body
    const messageData = await req.json();
    
    // Check if this is a status update (not a user message)
    if (messageData.statuses) {
      console.log('📊 [WEBHOOK-HANDLER] Received status update, processing...');
      
      // Get Supabase client with service role for status updates
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase environment variables');
      }
      
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
      
      // Process status updates
      for (const status of messageData.statuses) {
        if (status.id && status.status) {
          // Update message status in database
          await supabaseAdmin
            .from('message_logs')
            .update({
              status: status.status,
              updated_at: new Date().toISOString()
            })
            .eq('message_id', status.id);
          
          console.log(`✅ [WEBHOOK-HANDLER] Updated message ${status.id} status to ${status.status}`);
        }
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
    
    // Validate request data for user messages
    if (!messageData.from) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: from' }),
        { 
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }
    
    // Check if this is a user message with text content
    if (!messageData.text || messageData.text.trim() === '') {
      console.log('⚠️ [WEBHOOK-HANDLER] Received message without text content, skipping processing');
      return new Response(
        JSON.stringify({ success: true, message: 'Non-text message received, no response needed' }),
        { 
          status: 200,
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        }
      );
    }

    // Get Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey || !serviceRoleKey) {
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    console.log('📨 [WEBHOOK-HANDLER] Processing WhatsApp message from:', messageData.from);

    // Save incoming message with explicit WhatsApp source
    const { data: savedMessage, error: saveError } = await supabaseAdmin
      .from('customer_conversations')
      .insert({
        phone_number: messageData.from,
        content: messageData.text,
        sender: 'user',
        source: 'whatsapp', // EXPLICITLY SET WHATSAPP SOURCE
        intent: 'client',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (saveError) {
      console.error('❌ [WEBHOOK-HANDLER] Error saving message:', saveError);
      // Continue processing even if save fails, but log the error
    } else {
      console.log('✅ [WEBHOOK-HANDLER] Incoming message saved with WhatsApp source');
    }

    // Process message through chatbot with error handling
    let botResponse: string;
    
    try {
      // Get system-wide Groq client for customer service
      const groq = await getSystemGroqClient();

      // Get the model from the Groq configuration
      const { data: groqConfig } = await supabase
        .from('user_groq_config')
        .select('id, user_id, api_key, model')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      // Ensure we're not using the deprecated model
      const DEPRECATED_MODELS = ["mixtral-8x7b-32768"];
      let groqModel = groqConfig?.model || "llama3-70b-8192";
      if (DEPRECATED_MODELS.includes(groqModel)) {
        console.warn(`[WEBHOOK-HANDLER] [SECURITY] Detected deprecated model ${groqModel}, switching to llama3-70b-8192`);
        groqModel = "llama3-70b-8192";
        
        // Update the database to prevent future issues
        if (groqConfig?.user_id) {
          try {
            await supabaseAdmin
              .from('user_groq_config')
              .update({ model: "llama3-70b-8192" })
              .eq('user_id', groqConfig.user_id);
            console.log(`[WEBHOOK-HANDLER] Updated user ${groqConfig.user_id}'s model to llama3-70b-8192`);
          } catch (updateError) {
            console.error('Failed to update deprecated model in database:', updateError);
          }
        }
      }
      
      console.log(`[WEBHOOK-HANDLER] Using Groq model: ${groqModel} for WhatsApp message processing`);

      // Generate response using Groq with WhatsApp-specific system prompt
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `Vous êtes un assistant de service client professionnel pour Airtel GPT.
Votre objectif est d'aider les clients avec leurs demandes, problèmes et questions.
Soyez professionnel, courtois et orienté solution.
Fournissez des instructions claires et demandez des clarifications si nécessaire.
Si vous ne pouvez pas résoudre un problème, proposez de l'escalader vers un agent humain.
Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais complètes (maximum 500 mots).
Le client vous contacte via WhatsApp.`
          },
          { role: "user", content: messageData.text }
        ],
        model: groqModel,
        temperature: 0.7,
        max_tokens: 2048,
      }).catch(error => {
        console.error('❌ [WEBHOOK-HANDLER] Groq API error:', error);
        
        // If the error is about a decommissioned model, try again with the default model
        if (error.message && (error.message.includes('decommissioned') || error.message.includes('deprecated'))) {
          console.warn(`[WEBHOOK-HANDLER] [RECOVERY] Model error detected: ${error.message}`);
          console.log('[WEBHOOK-HANDLER] Retrying with llama3-70b-8192');
          return groq.chat.completions.create({
            messages: [
              {
                role: "system",
                content: `Vous êtes un assistant de service client professionnel pour Airtel GPT.
Votre objectif est d'aider les clients avec leurs demandes, problèmes et questions.
Soyez professionnel, courtois et orienté solution.
Fournissez des instructions claires et demandez des clarifications si nécessaire.
Si vous ne pouvez pas résoudre un problème, proposez de l'escalader vers un agent humain.
Répondez toujours en français sauf si le client écrit dans une autre langue.
Gardez vos réponses concises mais complètes (maximum 500 mots).
Le client vous contacte via WhatsApp.`
              },
              { role: "user", content: messageData.text }
            ],
            model: "llama3-70b-8192",
            temperature: 0.7,
            max_tokens: 2048,
          });
        }
        
        throw error;
      });

      botResponse = completion.choices[0]?.message?.content || STANDARD_ERROR_RESPONSE;
      
      console.log('✅ [WEBHOOK-HANDLER] Generated AI response successfully');

    } catch (chatbotError) {
      console.error('❌ [WEBHOOK-HANDLER] Chatbot processing failed:', chatbotError);
      
      // Use standard error response when chatbot fails
      botResponse = STANDARD_ERROR_RESPONSE;
      
      console.log('🔄 [WEBHOOK-HANDLER] Using standard error response due to chatbot failure');
    }

    // Save bot response with explicit WhatsApp source
    const { data: savedResponse, error: responseError } = await supabaseAdmin
      .from('customer_conversations')
      .insert({
        phone_number: messageData.from,
        content: botResponse,
        sender: 'bot',
        source: 'whatsapp', // EXPLICITLY SET WHATSAPP SOURCE
        intent: 'client',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (responseError) {
      console.error('❌ [WEBHOOK-HANDLER] Error saving response:', responseError);
      // Continue even if save fails
    } else {
      console.log('✅ [WEBHOOK-HANDLER] Bot response saved with WhatsApp source');
    }

    // Return success response
    return new Response(
      JSON.stringify({ 
        success: true, 
        response: botResponse,
        chatbotType: 'client',
        source: 'whatsapp' // EXPLICITLY RETURN WHATSAPP SOURCE
      }),
      { 
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      }
    );

  } catch (error) {
    console.error('❌ [WEBHOOK-HANDLER] Critical error in webhook processing:', error);
    
    // Even in case of critical error, try to save the standard error response
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (supabaseUrl && serviceRoleKey) {
        const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
        
        // Save standard error response with WhatsApp source
        await supabaseAdmin
          .from('customer_conversations')
          .insert({
            phone_number: messageData?.from || 'unknown',
            content: STANDARD_ERROR_RESPONSE,
            sender: 'bot',
            source: 'whatsapp', // EXPLICITLY SET WHATSAPP SOURCE
            intent: 'client',
            created_at: new Date().toISOString()
          });
        
        console.log('✅ [WEBHOOK-HANDLER] Standard error response saved with WhatsApp source');
      }
    } catch (fallbackError) {
      console.error('❌ [WEBHOOK-HANDLER] Failed to save fallback response:', fallbackError);
    }
    
    // Return error response with standard message
    return new Response(
      JSON.stringify({ 
        success: true, // Return success to prevent webhook retries
        response: STANDARD_ERROR_RESPONSE,
        chatbotType: 'client',
        source: 'whatsapp', // EXPLICITLY RETURN WHATSAPP SOURCE
        error: 'Processed with standard response due to error'
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
});