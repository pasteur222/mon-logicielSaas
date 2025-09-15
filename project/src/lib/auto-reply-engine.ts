import { supabase } from './supabase';

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

/**
 * Check auto-reply rules for a user and message
 * @param message The incoming message content
 * @param userId The user ID to check rules for
 * @returns The auto-reply response if a rule matches, null otherwise
 */
export async function checkAutoReplyRules(message: string, userId: string): Promise<string | null> {
  try {
    console.log('🔍 [AUTO-REPLY] Checking rules for user:', userId);
    
    // Get user's auto-reply rules
    const { data: rules, error } = await supabase
      .from('whatsapp_auto_replies')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('priority', { ascending: false }); // Higher priority first

    if (error) {
      console.error('Error fetching auto-reply rules:', error);
      return null;
    }

    if (!rules || rules.length === 0) {
      console.log('📝 [AUTO-REPLY] No active rules found for user');
      return null;
    }

    console.log(`📝 [AUTO-REPLY] Found ${rules.length} active rules to check`);

    // Check each rule in priority order
    for (const rule of rules) {
      if (await matchesRule(message, rule)) {
        console.log('✅ [AUTO-REPLY] Rule matched:', rule.id);
        
        // Process the response with variables
        const processedResponse = await processAutoReplyResponse(rule.response, rule.variables || {});
        
        // Track rule usage
        await trackRuleUsage(rule.id, message);
        
        return processedResponse;
      }
    }

    console.log('❌ [AUTO-REPLY] No rules matched for message');
    return null;
  } catch (error) {
    console.error('Error checking auto-reply rules:', error);
    return null;
  }
}

/**
 * Check if a message matches a specific rule
 * @param message The message content
 * @param rule The auto-reply rule to check
 * @returns Promise resolving to boolean indicating if the rule matches
 */
async function matchesRule(message: string, rule: AutoReplyRule): Promise<boolean> {
  try {
    const lowerMessage = message.toLowerCase();
    
    if (rule.use_regex) {
      // Use regex matching
      try {
        const flags = rule.pattern_flags || 'i';
        const regex = new RegExp(rule.trigger_words.join('|'), flags);
        return regex.test(message);
      } catch (regexError) {
        console.error('Invalid regex pattern in rule:', rule.id, regexError);
        return false;
      }
    } else {
      // Use simple keyword matching
      return rule.trigger_words.some(keyword => 
        lowerMessage.includes(keyword.toLowerCase())
      );
    }
  } catch (error) {
    console.error('Error matching rule:', error);
    return false;
  }
}

/**
 * Process auto-reply response with variables
 * @param response The response template
 * @param variables The variables to replace
 * @returns The processed response
 */
export async function processAutoReplyResponse(
  response: string, 
  variables: Record<string, string>
): Promise<string> {
  try {
    let processedResponse = response;
    
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
    
    // Replace custom variables
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processedResponse = processedResponse.replace(regex, value);
    });
    
    return processedResponse;
  } catch (error) {
    console.error('Error processing auto-reply response:', error);
    return response; // Return original response if processing fails
  }
}

/**
 * Track rule usage for analytics
 * @param ruleId The ID of the rule that was triggered
 * @param message The message that triggered the rule
 */
async function trackRuleUsage(ruleId: string, message: string): Promise<void> {
  try {
    await supabase
      .from('auto_reply_analytics')
      .insert({
        rule_id: ruleId,
        phone_number: 'unknown', // Will be updated by calling function if available
        triggered_at: new Date().toISOString(),
        response_time: 0.1, // Auto-reply is very fast
        successful: true
      });
  } catch (error) {
    console.error('Error tracking rule usage:', error);
    // Don't throw - this is analytics data
  }
}