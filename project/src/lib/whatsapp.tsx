import { supabase } from './supabase';
import { determineChatbotType, trackChatbotUsage } from './chatbot-router';
import { processCustomerServiceMessage } from './customer-service-chatbot';
import { processQuizMessage } from './quiz-chatbot';

// Define the webhook endpoint for processing messages
const WEBHOOK_ENDPOINT = 'https://webhook-telecombusiness.onrender.com/webhook';

// Define the WhatsApp API URL
const WHATSAPP_API_URL = "https://graph.facebook.com/v18.0";

// Create a function to get WhatsApp configuration
export async function getWhatsAppConfig(userId?: string) {
  try {
    console.log('Getting WhatsApp configuration for user:', userId);
    
    // If userId is provided, try to get user-specific config
    if (userId) {
      const { data: userConfig, error: userConfigError } = await supabase
        .from('user_whatsapp_config')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      
      if (!userConfigError && userConfig && userConfig.access_token && userConfig.phone_number_id) {
        console.log('Found active WhatsApp configuration for user:', userId);
        return {
          accessToken: userConfig.access_token,
          phoneNumberId: userConfig.phone_number_id,
          whatsappBusinessAccountId: userConfig.whatsapp_business_account_id || null,
          source: 'user_config'
        };
      } else {
        console.log('No active WhatsApp configuration found for user:', userId);
      }
    }
    
    // If no user config or userId not provided, try to find any active user config
    const { data: anyUserConfig, error: anyUserConfigError } = await supabase
      .from('user_whatsapp_config')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (!anyUserConfigError && anyUserConfig && anyUserConfig.access_token && anyUserConfig.phone_number_id) {
      console.log('Using another user\'s WhatsApp configuration as fallback');
      return {
        accessToken: anyUserConfig.access_token,
        phoneNumberId: anyUserConfig.phone_number_id,
        whatsappBusinessAccountId: anyUserConfig.whatsapp_business_account_id || null,
        source: 'fallback_user_config'
      };
    }
    
    // If all attempts fail, throw an error
    throw new Error('No active WhatsApp configuration found. Please configure your WhatsApp API credentials in the settings.');
  } catch (error) {
    console.error('Error getting WhatsApp configuration:', error);
    throw error;
  }
}

interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: {
    body: string;
  };
  image?: {
    id: string;
    mime_type: string;
    sha256: string;
    url: string;
  };
  video?: {
    id: string;
    mime_type: string;
    sha256: string;
    url: string;
  };
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

interface RateLimit {
  enabled: boolean;
  max_per_hour: number;
  cooldown_minutes: number;
}

// Module trigger messages
const TRIGGER_MESSAGES = {
  EDUCATION: "I want to learn",
  CUSTOMER_SERVICE: "Customer Service",
  QUIZ: "Game"
};

export async function initializeWhatsAppWebhook() {
  try {
    // Get WhatsApp configuration
    const config = await getWhatsAppConfig();
    const { accessToken, phoneNumberId } = config;

    // Validate access token format
    if (!accessToken.startsWith('EAA')) {
      console.error('Invalid WhatsApp access token format');
      return { error: 'Invalid token format' };
    }

    try {
      // Test connection to the WhatsApp API
      const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('WhatsApp API error:', errorData);
        
        if (errorData.error?.code === 190) {
          // Update the database to reflect the expired token
          if (config.source === 'user_config' || config.source === 'fallback_user_config') {
            await supabase
              .from('user_whatsapp_config')
              .update({
                is_active: false,
                updated_at: new Date().toISOString()
              })
              .eq('phone_number_id', phoneNumberId);
          }
            
          return { error: 'Token expired' };
        }
        
        return { error: 'API error: ' + (errorData.error?.message || response.statusText) };
      }

      // If config came from user_whatsapp_config, update it to reflect successful connection
      if (config.source === 'user_config' || config.source === 'fallback_user_config') {
        await supabase
          .from('user_whatsapp_config')
          .update({
            is_active: true,
            updated_at: new Date().toISOString()
          })
          .eq('phone_number_id', phoneNumberId);
      }
      
      return { success: true };
    } catch (apiError) {
      console.error('WhatsApp API error:', apiError);
      return { error: 'API connection failed: ' + (apiError instanceof Error ? apiError.message : String(apiError)) };
    }
  } catch (error) {
    console.error('Error initializing WhatsApp webhook:', error);
    return { error: 'Initialization failed: ' + (error instanceof Error ? error.message : String(error)) };
  }
}

export async function handleIncomingMessage(message: WhatsAppMessage) {
  try {
    if (!message.text?.body) {
      console.warn('Received message without text body');
      return;
    }

    console.log('📨 [WHATSAPP] Processing incoming message from:', message.from);

    // Save incoming message with explicit WhatsApp source
    await supabase.from('customer_conversations').insert({
      phone_number: message.from,
      content: message.text.body,
      sender: 'user',
      source: 'whatsapp',
      intent: 'client',
      created_at: new Date(message.timestamp).toISOString()
    });

    // Determine which chatbot should handle this message
    const chatbotType = await determineChatbotType(
      message.text.body,
      'whatsapp',
      message.from
    );

    console.log(`🤖 [WHATSAPP] Routing to ${chatbotType} chatbot`);

    // Track chatbot usage
    await trackChatbotUsage(message.from, undefined, chatbotType);

    // Process message with appropriate chatbot
    let botResponse;
    
    if (chatbotType === 'quiz') {
      botResponse = await processQuizMessage({
        phoneNumber: message.from,
        source: 'whatsapp',
        content: message.text.body,
        sender: 'user'
      });
    } else {
      botResponse = await processCustomerServiceMessage({
        phoneNumber: message.from,
        source: 'whatsapp',
        content: message.text.body,
        sender: 'user'
      });
    }

    // Send the response via WhatsApp
    if (botResponse && botResponse.content) {
      await sendWhatsAppResponse(message.from, botResponse.content);
    }

    return;

    // Forward message to webhook for processing
    try {
      const response = await fetch(WEBHOOK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: message.from,
          text: message.text.body,
          timestamp: message.timestamp,
          messageId: message.id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Error forwarding message to webhook:', errorData);
        // Continue with fallback processing if webhook fails
      } else {
        // Message successfully processed by webhook, no need for fallback
        return;
      }
    } catch (error) {
      console.error('Error sending message to webhook:', error);
    }

  } catch (error) {
    console.error('Error handling incoming message:', error);
    throw error;
  }
}

import { uploadTemplateMedia } from './whatsapp-template';

export async function sendWhatsAppResponse(to: string, message: string, media?: { type: 'image' | 'video' | 'document'; url: string }, userId?: string) {
  try {
    console.log('📤 [WHATSAPP-RESPONSE] Sending response:', {
      to,
      messageLength: message.length,
      hasMedia: !!media,
      userId: userId || 'not provided'
    });

    // Sanitize message content with enhanced logging
    const originalMessage = message;
    const sanitizedMessage = sanitizeWhatsAppMessage(message);
    
    // Log sanitization if changes were made
    if (originalMessage !== sanitizedMessage) {
      console.log('🧹 [WHATSAPP-RESPONSE] Message sanitized:', {
        original: originalMessage.substring(0, 100),
        sanitized: sanitizedMessage.substring(0, 100),
        lengthChange: originalMessage.length - sanitizedMessage.length
      });
    }
    
    console.log('🧹 [WHATSAPP-RESPONSE] Message sanitized');

    // Get WhatsApp configuration, prioritizing user-specific config if userId is provided
    const { accessToken, phoneNumberId } = await getWhatsAppConfig(userId);

    // Prepare message payload
    const messagePayload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: media ? media.type : 'text'
    };

    // Handle media messages
    if (media && media.url) {
      console.log('🖼️ [WHATSAPP-RESPONSE] Preparing media message:', {
        type: media.type,
        url: media.url.substring(0, 50) + '...'
      });
      
      // Validate media URL
      try {
        new URL(media.url);
        
        // Test URL accessibility
        const urlTest = await fetch(media.url, { method: 'HEAD' });
        if (!urlTest.ok) {
          throw new Error(`Media URL not accessible: ${urlTest.status}`);
        }
        
        messagePayload[media.type] = { link: media.url };
        
        // Add caption if there's text
        if (sanitizedMessage && sanitizedMessage.trim()) {
          messagePayload[media.type].caption = sanitizedMessage;
        }
      } catch (urlError) {
        console.error('❌ [WHATSAPP-RESPONSE] Media URL validation failed:', urlError);
        throw new Error(`Invalid media URL: ${urlError.message}`);
      }
    } else {
      messagePayload.text = { body: sanitizedMessage };
    }

    const response = await fetch(`${WHATSAPP_API_URL}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messagePayload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ [WHATSAPP-RESPONSE] API error:', errorData);
      throw new Error('Failed to send WhatsApp response: ' + (errorData.error?.message || response.statusText));
    }

    const result = await response.json();
    const messageId = result.messages?.[0]?.id;
    
    console.log('✅ [WHATSAPP-RESPONSE] Response sent successfully:', {
      messageId,
      to
    });
    
    // Log the message
    await supabase.from('message_logs').insert({
      status: 'sent',
      phone_number: to,
      message_preview: media ? `[${media.type.toUpperCase()}] ${sanitizedMessage.substring(0, 80)}` : sanitizedMessage.substring(0, 100),
      message_id: messageId,
      created_at: new Date().toISOString()
    });
    
    return result;
  } catch (error) {
    console.error('❌ [WHATSAPP-RESPONSE] Critical error:', {
      to,
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

export interface MessageResult {
  status: 'success' | 'error';
  phoneNumber: string;
  message: string;
  timestamp: Date;
  messageId?: string;
  error?: string;
}

export interface MessageVariable {
  name: string;
  value: string;
}

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  variables: string[];
}

export function parseMessageVariables(message: string): string[] {
  const variableRegex = /\{\{([^}]+)\}\}/g;
  const matches = [...message.matchAll(variableRegex)];
  return matches.map(match => match[1]);
}

export function replaceMessageVariables(message: string, variables: MessageVariable[]): string {
  let result = message;
  variables.forEach(variable => {
    const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, 'g');
    result = result.replace(regex, variable.value);
  });
  return result;
}

/**
 * Sanitizes message content by removing HTML tags and normalizing text
 * @param message Raw message content
 * @returns Clean plain text message
 */
export function sanitizeMessageContent(message: string): string {
  if (!message || typeof message !== 'string') {
    return '';
  }

  // Step 1: Remove HTML/JSX tags more aggressively
  let cleanMessage = message.replace(/<[^>]*>/g, '');
  
  // Step 2: Remove any remaining angle brackets that might be malformed
  cleanMessage = cleanMessage.replace(/[<>]/g, '');
  
  // Step 3: Decode HTML entities safely
  try {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = cleanMessage;
    cleanMessage = textarea.value;
  } catch (error) {
    console.warn('HTML entity decoding failed, using original text:', error);
    // If decoding fails, continue with the cleaned message
  }
  
  // Step 4: Remove any remaining HTML-like patterns
  cleanMessage = cleanMessage.replace(/&[a-zA-Z0-9#]+;/g, '');
  
  // Step 5: Remove extra whitespace and normalize
  cleanMessage = cleanMessage.replace(/\s+/g, ' ').trim();
  
  // Step 6: Ensure message is not empty after sanitization
  if (cleanMessage.length === 0) {
    throw new Error('Message is empty after sanitization');
  }
  
  // Step 7: Limit message length (WhatsApp limit is 4096 characters)
  if (cleanMessage.length > 4096) {
    cleanMessage = cleanMessage.substring(0, 4093) + '...';
  }
  
  return cleanMessage;
}

/**
 * Normalizes phone number to international format
 * @param phoneNumber Raw phone number
 * @returns Normalized phone number with + prefix
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return '';
  }

  // Remove all non-digit characters except the plus sign
  let cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // If it already starts with +, return as is (assuming it's already formatted)
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // Common country codes for automatic detection
  const countryCodeMap: Record<string, string> = {
    '242': '+242', // Congo
    '221': '+221', // Senegal
    '223': '+223', // Mali
    '224': '+224', // Guinea
    '225': '+225', // Ivory Coast
    '226': '+226', // Burkina Faso
    '227': '+227', // Niger
    '228': '+228', // Togo
    '229': '+229', // Benin
    '230': '+230', // Mauritius
    '231': '+231', // Liberia
    '232': '+232', // Sierra Leone
    '233': '+233', // Ghana
    '234': '+234', // Nigeria
    '235': '+235', // Chad
    '236': '+236', // Central African Republic
    '237': '+237', // Cameroon
    '238': '+238', // Cape Verde
    '239': '+239', // São Tomé and Príncipe
    '240': '+240', // Equatorial Guinea
    '241': '+241', // Gabon
    '243': '+243', // Democratic Republic of Congo
    '244': '+244', // Angola
    '245': '+245', // Guinea-Bissau
    '246': '+246', // British Indian Ocean Territory
    '247': '+247', // Ascension Island
    '248': '+248', // Seychelles
    '249': '+249', // Sudan
    '250': '+250', // Rwanda
    '251': '+251', // Ethiopia
    '252': '+252', // Somalia
    '253': '+253', // Djibouti
    '254': '+254', // Kenya
    '255': '+255', // Tanzania
    '256': '+256', // Uganda
    '257': '+257', // Burundi
    '258': '+258', // Mozambique
    '260': '+260', // Zambia
    '261': '+261', // Madagascar
    '262': '+262', // Réunion/Mayotte
    '263': '+263', // Zimbabwe
    '264': '+264', // Namibia
    '265': '+265', // Malawi
    '266': '+266', // Lesotho
    '267': '+267', // Botswana
    '268': '+268', // Eswatini
    '269': '+269', // Comoros
    '290': '+290', // Saint Helena
    '291': '+291', // Eritrea
    '297': '+297', // Aruba
    '298': '+298', // Faroe Islands
    '299': '+299'  // Greenland
  };
  
  // Check if the number starts with a known country code
  for (const [code, prefix] of Object.entries(countryCodeMap)) {
    if (cleaned.startsWith(code)) {
      return prefix + cleaned.substring(code.length);
    }
  }
  
  // If it starts with 0, remove it and add default country code (+242 for Congo)
  if (cleaned.startsWith('0')) {
    return '+242' + cleaned.substring(1);
  }
  
  // If no country code detected, add default (+242 for Congo)
  return '+242' + cleaned;
}
/**
 * Enhanced message sanitization specifically for WhatsApp
 * Removes all HTML content and ensures clean plain text
 * @param message Raw message content
 * @returns Clean plain text message suitable for WhatsApp
 */
export function sanitizeWhatsAppMessage(message: string): string {
  if (!message || typeof message !== 'string') {
    return '';
  }

  let cleanMessage = message;
  
  // Step 1: Remove all HTML tags (including malformed ones)
  cleanMessage = cleanMessage.replace(/<[^>]*>/g, '');
  
  // Step 2: Remove any remaining angle brackets
  cleanMessage = cleanMessage.replace(/[<>]/g, '');
  
  // Step 3: Decode common HTML entities
  const htmlEntities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&nbsp;': ' ',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  };
  
  Object.entries(htmlEntities).forEach(([entity, char]) => {
    cleanMessage = cleanMessage.replace(new RegExp(entity, 'g'), char);
  });
  
  // Step 4: Remove any remaining HTML entities
  cleanMessage = cleanMessage.replace(/&[a-zA-Z0-9#]+;/g, '');
  
  // Step 5: Normalize whitespace
  cleanMessage = cleanMessage.replace(/\s+/g, ' ').trim();
  
  // Step 6: Ensure message is not empty
  if (cleanMessage.length === 0) {
    throw new Error('Message is empty after sanitization');
  }
  
  // Step 7: Limit message length for WhatsApp
  if (cleanMessage.length > 4096) {
    cleanMessage = cleanMessage.substring(0, 4093) + '...';
  }
  
  return cleanMessage;
}

export async function sendWhatsAppMessages(
  messages: Array<{ 
    phoneNumber: string; 
    message: string;
    variables?: MessageVariable[];
    media?: {
      type: 'image' | 'video' | 'document';
      url?: string;
    };
  }>,
  userId?: string
): Promise<MessageResult[]> {
  try {
    console.log('📤 [WHATSAPP-SEND] Starting to send messages:', {
      messageCount: messages.length,
      userId: userId || 'not provided'
    });

    // Add timeout protection for WhatsApp configuration retrieval
    const getConfigWithTimeout = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      try {
        const config = await getWhatsAppConfig(userId);
        clearTimeout(timeoutId);
        return config;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Timeout getting WhatsApp configuration');
        }
        throw error;
      }
    };

    // Get WhatsApp configuration, prioritizing user-specific config if userId is provided
    const { accessToken, phoneNumberId } = await getConfigWithTimeout();

    console.log('✅ [WHATSAPP-SEND] WhatsApp config retrieved:', {
      hasAccessToken: !!accessToken,
      phoneNumberId: phoneNumberId || 'not found'
    });
    
    // Normalize and validate phone numbers
    const validMessages = messages.map(msg => ({
      ...msg,
      phoneNumber: normalizePhoneNumber(msg.phoneNumber)
    })).filter(msg => {
      const phoneRegex = /^\+[1-9]\d{1,14}$/;
      const isValid = phoneRegex.test(msg.phoneNumber);
      
      if (!isValid) {
        console.warn('❌ [WHATSAPP-SEND] Invalid phone number after normalization:', {
          original: messages.find(m => m === msg)?.phoneNumber,
          normalized: msg.phoneNumber
        });
      }
      
      return isValid;
    });

    if (validMessages.length === 0) {
      const originalNumbers = messages.map(m => m.phoneNumber);
      console.error('❌ [WHATSAPP-SEND] No valid phone numbers after normalization:', {
        originalNumbers,
        normalizedNumbers: messages.map(m => normalizePhoneNumber(m.phoneNumber))
      });
      throw new Error(`No valid phone numbers found. Original numbers: ${originalNumbers.join(', ')}`);
    }

    console.log('📋 [WHATSAPP-SEND] Validated messages:', {
      originalCount: messages.length,
      validCount: validMessages.length
    });
    // Process messages with variables
    const processedMessages = validMessages.map(msg => ({
      ...msg,
      message: (() => {
        // First replace variables, then sanitize
        let processedMessage = msg.variables ? replaceMessageVariables(msg.message, msg.variables) : msg.message;
        
        // Apply WhatsApp-specific sanitization
        processedMessage = sanitizeWhatsAppMessage(processedMessage);
        
        return processedMessage;
      })()
    }));

    console.log('🧹 [WHATSAPP-SEND] Messages sanitized and processed');
    // Send messages with rate limiting
    const results = await Promise.allSettled(
      processedMessages.map(async (msg, index) => {
        // Add timeout protection for each message
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout per message
        
        try {
          console.log(`📨 [WHATSAPP-SEND] Sending message ${index + 1}/${processedMessages.length}:`, {
            to: msg.phoneNumber,
            messageLength: msg.message.length,
            hasMedia: !!msg.media
          });

          // Add delay between messages to respect rate limits
          await new Promise(resolve => setTimeout(resolve, index * 1000));

          // Prepare the WhatsApp message payload
          const messagePayload: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: msg.phoneNumber,
            type: msg.media ? msg.media.type : 'text'
          };

          // Add the appropriate content based on message type
          if (msg.media && msg.media.url) {
            console.log(`🖼️ [WHATSAPP-SEND] Adding media to message:`, {
              type: msg.media.type,
              url: msg.media.url.substring(0, 50) + '...'
            });
            
            // Validate URL before sending with timeout (NON-BLOCKING)
            try {
              new URL(msg.media.url);

              console.log(`🔍 [WHATSAPP-SEND] Validating media URL (non-blocking):`, {
                url: msg.media.url.substring(0, 70) + '...'
              });

              // Test URL accessibility with timeout (NON-BLOCKING)
              const urlTestController = new AbortController();
              const urlTestTimeoutId = setTimeout(() => urlTestController.abort(), 5000);

              try {
                const urlTest = await fetch(msg.media.url, {
                  method: 'HEAD',
                  headers: {
                    'User-Agent': 'WhatsApp-Media-Validator/1.0'
                  },
                  signal: urlTestController.signal
                });

                clearTimeout(urlTestTimeoutId);

                if (!urlTest.ok) {
                  console.warn(`⚠️ [WHATSAPP-SEND] Media URL validation returned non-200 status:`, {
                    url: msg.media.url.substring(0, 70) + '...',
                    status: urlTest.status,
                    statusText: urlTest.statusText
                  });
                  console.warn(`⚠️ [WHATSAPP-SEND] Proceeding with send anyway - WhatsApp will validate`);
                } else {
                  const contentType = urlTest.headers.get('content-type');
                  console.log(`✅ [WHATSAPP-SEND] Media URL validated:`, {
                    url: msg.media.url.substring(0, 70) + '...',
                    contentType,
                    status: urlTest.status
                  });
                }
              } catch (urlTestError) {
                clearTimeout(urlTestTimeoutId);
                console.warn(`⚠️ [WHATSAPP-SEND] Media URL validation failed:`, {
                  url: msg.media.url.substring(0, 70) + '...',
                  error: urlTestError.message
                });
                console.warn(`⚠️ [WHATSAPP-SEND] Proceeding with send anyway - WhatsApp will validate`);
              }

              // Always set the media payload regardless of validation result
              messagePayload[msg.media.type] = { link: msg.media.url };

              // Add caption if there's text content
              if (msg.message && msg.message.trim()) {
                messagePayload[msg.media.type].caption = msg.message;
                console.log(`📝 [WHATSAPP-SEND] Added caption to ${msg.media.type} message`);
              }

              console.log(`📤 [WHATSAPP-SEND] Media payload prepared:`, {
                type: msg.media.type,
                hasCaption: !!(msg.message && msg.message.trim())
              });

            } catch (urlError) {
              // Only throw for truly invalid URLs (malformed)
              if (urlError.name === 'TypeError' && urlError.message.includes('Invalid URL')) {
                console.error(`❌ [WHATSAPP-SEND] Malformed media URL:`, {
                  url: msg.media.url,
                  error: urlError.message
                });
                throw new Error(`Malformed media URL: ${urlError.message}`);
              }

              // For other errors, log warning but continue
              console.warn(`⚠️ [WHATSAPP-SEND] Media URL processing warning:`, {
                url: msg.media.url.substring(0, 70) + '...',
                error: urlError.message
              });
              console.warn(`⚠️ [WHATSAPP-SEND] Proceeding with send anyway`);

              // Still set the payload
              messagePayload[msg.media.type] = { link: msg.media.url };
              if (msg.message && msg.message.trim()) {
                messagePayload[msg.media.type].caption = msg.message;
              }
            }
          } else {
            messagePayload.text = { body: msg.message };
          }

          console.log(`🚀 [WHATSAPP-SEND] Calling WhatsApp API for message ${index + 1}`);
          const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(messagePayload),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorData = await response.json();
            console.error(`❌ [WHATSAPP-SEND] API error for message ${index + 1}:`, {
              status: response.status,
              statusText: response.statusText,
              errorData
            });
            throw new Error(errorData.error?.message || 'WhatsApp API error');
          }

          const data = await response.json();
          const messageId = data.messages?.[0]?.id;
          
          console.log(`✅ [WHATSAPP-SEND] Message ${index + 1} sent successfully:`, {
            messageId,
            to: msg.phoneNumber
          });
          
          // Log message to database for tracking with timeout protection
          try {
            const logController = new AbortController();
            const logTimeoutId = setTimeout(() => logController.abort(), 5000); // 5 second timeout for logging

            // Enhanced logging with media tracking
            const messagePreview = msg.media
              ? `[${msg.media.type.toUpperCase()}] ${msg.message.substring(0, 80)}`
              : msg.message.substring(0, 100);

            await supabase.from('message_logs').insert({
              status: 'sent',
              phone_number: msg.phoneNumber,
              message_preview: messagePreview,
              message_id: messageId,
              metadata: {
                has_media: !!msg.media,
                media_type: msg.media?.type,
                media_url: msg.media?.url,
                timestamp: new Date().toISOString()
              },
              created_at: new Date().toISOString()
            });

            clearTimeout(logTimeoutId);

            console.log('✅ [WHATSAPP-SEND] Message logged to database:', {
              messageId,
              hasMedia: !!msg.media,
              mediaType: msg.media?.type
            });
          } catch (logError) {
            console.warn('⚠️ [WHATSAPP-SEND] Failed to log message (non-critical):', logError);
            // Don't throw - message was sent successfully
          }
          
          return {
            status: 'success' as const,
            phoneNumber: msg.phoneNumber,
            message: msg.message,
            timestamp: new Date(),
            messageId: messageId
          };
        } catch (error) {
          clearTimeout(timeoutId);
          
          if (error.name === 'AbortError') {
            console.error(`❌ [WHATSAPP-SEND] Timeout sending to ${msg.phoneNumber}`);
            error.message = 'Request timeout - message sending took too long';
          }
          
          console.error(`❌ [WHATSAPP-SEND] Error sending to ${msg.phoneNumber}:`, {
            error: error.message,
            stack: error.stack,
            messageIndex: index + 1
          });
          
          // Log the error with timeout protection and media info
          try {
            const logController = new AbortController();
            const logTimeoutId = setTimeout(() => logController.abort(), 3000); // 3 second timeout for error logging

            const messagePreview = msg.media
              ? `[${msg.media.type.toUpperCase()}] ${msg.message.substring(0, 80)}`
              : msg.message.substring(0, 100);

            await supabase.from('message_logs').insert({
              status: 'error',
              phone_number: msg.phoneNumber,
              message_preview: messagePreview,
              error: error.message,
              metadata: {
                has_media: !!msg.media,
                media_type: msg.media?.type,
                media_url: msg.media?.url,
                error_timestamp: new Date().toISOString()
              },
              created_at: new Date().toISOString()
            });
            
            clearTimeout(logTimeoutId);
          } catch (logError) {
            console.warn('Failed to log error (non-critical):', logError);
          }
          
          return {
            status: 'error' as const,
            phoneNumber: msg.phoneNumber,
            message: msg.message,
            timestamp: new Date(),
            error: error.message
          };
        }
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
    console.log(`📊 [WHATSAPP-SEND] Batch complete:`, {
      total: results.length,
      successful: successCount,
      failed: results.length - successCount
    });
    return results.map(result => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      return {
        status: 'error' as const,
        phoneNumber: 'unknown',
        message: '',
        timestamp: new Date(),
        error: result.reason?.message || 'Unknown error'
      };
    });
  } catch (error) {
    console.error('❌ [WHATSAPP-SEND] Critical error in sendWhatsAppMessages:', {
      error: error.message,
      stack: error.stack,
      messageCount: messages.length
    });
    return messages.map(msg => ({
      status: 'error' as const,
      phoneNumber: msg.phoneNumber,
      message: msg.message,
      timestamp: new Date(),
      error: error.message
    }));
  }
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  language: string = 'fr',
  components?: any[],
  userId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // Get WhatsApp configuration
    const { accessToken, phoneNumberId } = await getWhatsAppConfig(userId);
    
    // Prepare template message payload
    const templatePayload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: to,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: language
        }
      }
    };
    
    // Add components if provided
    if (components && components.length > 0) {
      templatePayload.template.components = components;
    }
    
    // Send template message
    const response = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(templatePayload)
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'WhatsApp API error');
    }
    
    const data = await response.json();
    
    // Log message to database
    await supabase.from('message_logs').insert({
      status: 'sent',
      phone_number: to,
      message_preview: `Template: ${templateName}`,
      message_id: data.messages?.[0]?.id,
      created_at: new Date().toISOString()
    });
    
    return {
      success: true,
      messageId: data.messages?.[0]?.id
    };
  } catch (error) {
    console.error('Error sending WhatsApp template:', error);
    
    // Log error to database
    await supabase.from('message_logs').insert({
      status: 'error',
      phone_number: to,
      message_preview: `Template: ${templateName}`,
      error: error.message,
      created_at: new Date().toISOString()
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

export async function checkMessageStatus(messageId: string): Promise<{
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  details?: any;
}> {
  try {
    // Validate messageId parameter
    if (!messageId || typeof messageId !== 'string' || messageId.trim() === '') {
      console.error('❌ [MESSAGE-STATUS] Invalid messageId provided:', messageId);
      throw new Error('Invalid message ID provided for status check');
    }

    console.log('🔍 [MESSAGE-STATUS] Checking status for messageId:', messageId);

    // First check our local database for status
    const { data: messageLog, error } = await supabase
      .from('message_logs')
      .select('*')
      .eq('message_id', messageId)
      .maybeSingle();
    
    if (error) {
      console.error('❌ [MESSAGE-STATUS] Database error:', error);
      throw error;
    }
    
    if (messageLog) {
      console.log('✅ [MESSAGE-STATUS] Found status in database:', {
        messageId,
        status: messageLog.status,
        createdAt: messageLog.created_at
      });
      return {
        status: messageLog.status as 'pending' | 'sent' | 'delivered' | 'failed',
        details: messageLog
      };
    }
    
    console.log('⚠️ [MESSAGE-STATUS] Message not found in database, checking via Edge Function');

    // If not found in database, check via Edge Function
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-message-status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ messageId })
      });

      console.log('📡 [MESSAGE-STATUS] Edge Function response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [MESSAGE-STATUS] Edge Function error:', {
          status: response.status,
          statusText: response.statusText,
          errorText
        });
        throw new Error(`Edge Function error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ [MESSAGE-STATUS] Edge Function response:', data);
      
      return {
        status: data.status || 'pending',
        details: data
      };
    } catch (edgeFunctionError) {
      console.error('❌ [MESSAGE-STATUS] Edge Function call failed:', edgeFunctionError);
      // Don't throw here, fall through to default
    }
    
    // If all methods fail, return pending status
    console.log('⚠️ [MESSAGE-STATUS] All status check methods failed, returning pending');
    return { status: 'pending' };
  } catch (error) {
    console.error('❌ [MESSAGE-STATUS] Critical error in checkMessageStatus:', {
      messageId,
      error: error.message,
      stack: error.stack
    });
    return { status: 'failed' };
  }
}

export async function checkWhatsAppConnection(userId?: string): Promise<boolean> {
  try {
    // Get WhatsApp configuration, prioritizing user-specific config if userId is provided
    const config = await getWhatsAppConfig(userId).catch(() => null);
    
    if (!config) {
      console.warn('No active WhatsApp configuration found');
      return false;
    }
    
    const { accessToken, phoneNumberId } = config;

    const response = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Error checking WhatsApp connection:', error);
    return false;
  }
}

export async function getWhatsAppTemplates(userId?: string): Promise<any[]> {
  try {
    console.log('Fetching WhatsApp templates from Meta API...');
    
    // First try to fetch from Meta API via Edge Function or webhook
    try {
      // Get the user's configuration to check for whatsapp_business_account_id
      const userConfig = userId ? await getWhatsAppConfig(userId).catch(() => null) : null;
      
      if (!userConfig || !userConfig.whatsappBusinessAccountId) {
        console.warn('No WhatsApp Business Account ID found, falling back to database');
        throw new Error('No WhatsApp Business Account ID found');
      }
      
      // Get webhook URL from user_whatsapp_config table
      const { data: webhookConfig } = await supabase
        .from('user_whatsapp_config')
        .select('webhook_url')
        .eq('is_active', true)
        .maybeSingle();
      
      // Use webhook URL if available, otherwise use default
      const webhookBaseUrl = webhookConfig?.webhook_url 
        ? new URL(webhookConfig.webhook_url).origin 
        : 'https://webhook-telecombusiness.onrender.com';
      
      // Try to fetch templates from webhook
      const response = await fetch(
        `${webhookBaseUrl}/templates/${userConfig.whatsappBusinessAccountId}`,
        {
          headers: {
            'Authorization': `Bearer ${userConfig.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      if (!response.ok) {
        console.warn(`Webhook response not OK: ${response.status} ${response.statusText}`);
        
        // Fall back to edge function
        const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-templates?userId=${userId}`;
        const edgeFunctionResponse = await fetch(edgeFunctionUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (!edgeFunctionResponse.ok) {
          console.warn(`Edge function response not OK: ${edgeFunctionResponse.status}`);
          throw new Error(`Failed to fetch WhatsApp templates: ${edgeFunctionResponse.status}`);
        }
        
        const edgeFunctionData = await edgeFunctionResponse.json();
        console.log(`Received ${edgeFunctionData.templates?.length || 0} templates from edge function`);
        
        if (edgeFunctionData.templates && edgeFunctionData.templates.length > 0) {
          return edgeFunctionData.templates;
        } else {
          throw new Error('No templates returned from edge function');
        }
      }

      const data = await response.json();
      console.log(`Received ${data.data?.length || 0} templates from webhook`);
      
      // If we got templates from the webhook, return them
      if (data.data && data.data.length > 0) {
        return data.data;
      } else {
        console.warn('Webhook returned empty templates array, falling back to database');
        throw new Error('No templates returned from webhook');
      }
    } catch (apiError) {
      console.warn('Error fetching from Meta API, falling back to database:', apiError);
      
      // Fallback to database if API fails
      console.log('Fetching templates from Supabase database...');
      const { data, error: dbError } = await supabase
        .from('whatsapp_templates')
        .select('*');
        
      if (dbError) {
        console.warn('Database fetch failed, falling back to mock templates:', dbError);
        throw dbError;
      }
      
      if (data && data.length > 0) {
        console.log(`Found ${data.length} templates in database`);
        return data;
      } else {
        console.warn('No templates found in database, falling back to mock templates');
        throw new Error('No templates found in database');
      }
    }
  } catch (error) {
    console.warn('All template sources failed, using mock templates');
    
    // Final fallback: return mock templates
    return getMockTemplates();
  }
}

// Mock templates for testing
function getMockTemplates() {
  console.log('Returning mock templates');
  return [
    {
      id: "1234567890",
      template_name: "welcome_message",
      status: "APPROVED",
      category: "MARKETING",
      language: "fr",
      parameters: {
        components: [
          {
            type: "header",
            format: "text",
            text: "Bienvenue {{1}}!"
          },
          {
            type: "body",
            text: "Merci de vous être inscrit à notre service. Nous sommes ravis de vous avoir parmi nous.\n\nVotre compte est maintenant actif et vous pouvez commencer à utiliser nos services.",
            parameters: [
              {
                type: "text"
              }
            ]
          },
          {
            type: "footer",
            text: "Envoyé par MTN GPT"
          }
        ]
      }
    },
    {
      id: "0987654321",
      template_name: "appointment_reminder",
      status: "APPROVED",
      category: "UTILITY",
      language: "fr",
      parameters: {
        components: [
          {
            type: "header",
            format: "image",
            example: {
              header_handle: "https://images.pexels.com/photos/3845456/pexels-photo-3845456.jpeg"
            }
          },
          {
            type: "body",
            text: "Bonjour {{1}},\n\nCeci est un rappel pour votre rendez-vous {{2}} le {{3}} à {{4}}.\n\nVeuillez confirmer votre présence en répondant à ce message.",
            parameters: [
              {
                type: "text"
              },
              {
                type: "text"
              },
              {
                type: "text"
              },
              {
                type: "text"
              }
            ]
          },
          {
            type: "footer",
            text: "Merci de votre confiance. N'hésitez pas à nous contacter pour toute question."
          }
        ]
      }
    },
    {
      id: "1122334455",
      template_name: "order_confirmation",
      status: "APPROVED",
      category: "UTILITY",
      language: "fr",
      parameters: {
        components: [
          {
            type: "header",
            format: "text",
            text: "Confirmation de commande #{{1}}"
          },
          {
            type: "body",
            text: "Bonjour {{1}},\n\nVotre commande #{{2}} a été confirmée et est en cours de traitement.\n\nMontant total: {{3}}\nDate de livraison estimée: {{4}}",
            parameters: [
              {
                type: "text"
              },
              {
                type: "text"
              },
              {
                type: "text"
              },
              {
                type: "text"
              }
            ]
          },
          {
            type: "footer",
            text: "Merci pour votre achat!"
          }
        ]
      }
    },
    {
      id: "2233445566",
      template_name: "payment_receipt",
      status: "APPROVED",
      category: "UTILITY",
      language: "fr",
      parameters: {
        components: [
          {
            type: "header",
            format: "document",
            example: {
              header_handle: "https://example.com/receipt.pdf"
            }
          },
          {
            type: "body",
            text: "Bonjour {{1}},\n\nVoici votre reçu pour le paiement de {{2}} effectué le {{3}}.\n\nMerci pour votre confiance!",
            parameters: [
              {
                type: "text"
              },
              {
                type: "text"
              },
              {
                type: "text"
              }
            ]
          },
          {
            type: "footer",
            text: "Merci pour votre confiance! Votre satisfaction est notre priorité."
          }
        ]
      }
    },
    {
      id: "3344556677",
      template_name: "promotional_offer",
      status: "APPROVED",
      category: "MARKETING",
      language: "fr",
      parameters: {
        components: [
          {
            type: "header",
            format: "video",
            example: {
              header_handle: "https://example.com/promo.mp4"
            }
          },
          {
            type: "body",
            text: "Bonjour {{1}},\n\nNous avons une offre spéciale pour vous! Profitez de {{2}}% de réduction sur tous nos produits jusqu'au {{3}}.\n\nUtilisez le code promo: {{4}}",
            parameters: [
              {
                type: "text"
              },
              {
                type: "text"
              },
              {
                type: "text"
              },
              {
                type: "text"
              }
            ]
          },
          {
            type: "footer",
            text: "Offre soumise à conditions"
          },
          {
            type: "buttons",
            buttons: [
              {
                type: "quick_reply",
                text: "En savoir plus"
              },
              {
                type: "url",
                text: "Voir l'offre",
                url: "https://example.com/offer"
              }
            ]
          }
        ]
      }
    }
  ];
}

/**
 * Upload media file to Supabase Storage and get public URL for WhatsApp
 * CRITICAL: Uses Supabase instead of Firebase for truly public URLs that WhatsApp can access
 * @param file The media file to upload
 * @param userId Optional user ID for organizing files
 * @returns Promise resolving to the public URL
 */
export async function uploadWhatsAppMedia(file: File, userId?: string): Promise<string> {
  try {
    console.log('📤 [WHATSAPP-MEDIA] Starting Supabase upload:', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      userId: userId || 'anonymous'
    });

    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/quicktime',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}. Allowed types: images, videos, PDF, Word, Excel`);
    }

    // Validate file size (WhatsApp limit is 16MB for videos, 5MB for images, 100MB for documents)
    const maxSizes: Record<string, number> = {
      'image': 5 * 1024 * 1024,      // 5MB for images
      'video': 16 * 1024 * 1024,     // 16MB for videos
      'application': 100 * 1024 * 1024  // 100MB for documents
    };

    const fileCategory = file.type.split('/')[0];
    const maxSize = maxSizes[fileCategory] || 16 * 1024 * 1024;

    if (file.size > maxSize) {
      throw new Error(`File size exceeds limit. Maximum ${Math.round(maxSize / 1024 / 1024)}MB for ${fileCategory} files`);
    }

    // Generate secure filename
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 10);
    const extension = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const sanitizedName = file.name.split('.')[0].replace(/[^a-zA-Z0-9-_]/g, '_').substring(0, 50);
    const fileName = `${timestamp}-${randomString}-${sanitizedName}.${extension}`;

    // Organize by user folder
    const folder = userId || 'public';
    const filePath = `${folder}/${fileName}`;

    console.log('📁 [WHATSAPP-MEDIA] Uploading to Supabase:', {
      bucket: 'whatsapp-media',
      path: filePath,
      size: `${(file.size / 1024 / 1024).toFixed(2)}MB`
    });

    // Determine correct MIME type (explicit mapping)
    const getMimeType = (file: File): string => {
      // First try file.type
      if (file.type && file.type !== 'application/octet-stream') {
        console.log('📋 [WHATSAPP-MEDIA] Using file.type:', file.type);
        return file.type;
      }

      // Fallback: determine from extension
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      const mimeTypes: Record<string, string> = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'mp4': 'video/mp4',
        'mov': 'video/quicktime',
        'avi': 'video/x-msvideo',
        'webm': 'video/webm',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      };

      const mimeType = mimeTypes[extension] || 'application/octet-stream';
      console.log('📋 [WHATSAPP-MEDIA] Determined MIME type from extension:', {
        extension,
        mimeType
      });
      return mimeType;
    };

    const determinedMimeType = getMimeType(file);

    console.log('📋 [WHATSAPP-MEDIA] Final MIME type for upload:', {
      fileName: file.name,
      fileType: file.type,
      determinedMimeType
    });

    // Upload to Supabase Storage with explicit MIME type
    const { data, error } = await supabase.storage
      .from('whatsapp-media')
      .upload(filePath, file, {
        cacheControl: 'max-age=31536000',
        upsert: false,
        contentType: determinedMimeType
      });

    if (error) {
      console.error('❌ [WHATSAPP-MEDIA] Supabase upload error:', error);
      throw new Error(`Failed to upload to Supabase: ${error.message}`);
    }

    if (!data || !data.path) {
      throw new Error('Upload succeeded but no path returned from Supabase');
    }

    // Generate public URL
    const { data: { publicUrl } } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(data.path);

    console.log('✅ [WHATSAPP-MEDIA] Supabase upload successful:', {
      fileName: file.name,
      path: data.path,
      publicUrl: publicUrl.substring(0, 70) + '...',
      size: `${(file.size / 1024 / 1024).toFixed(2)}MB`
    });

    // Verify URL is accessible
    try {
      const urlTest = await fetch(publicUrl, { method: 'HEAD' });
      if (!urlTest.ok) {
        console.warn('⚠️ [WHATSAPP-MEDIA] Public URL returned non-200 status:', urlTest.status);
      } else {
        console.log('✅ [WHATSAPP-MEDIA] Public URL verified accessible:', {
          status: urlTest.status,
          contentType: urlTest.headers.get('content-type')
        });
      }
    } catch (urlError) {
      console.warn('⚠️ [WHATSAPP-MEDIA] Could not verify URL accessibility:', urlError.message);
    }

    return publicUrl;
  } catch (error) {
    console.error('❌ [WHATSAPP-MEDIA] Upload failed:', error);
    throw new Error(`Failed to upload media: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}