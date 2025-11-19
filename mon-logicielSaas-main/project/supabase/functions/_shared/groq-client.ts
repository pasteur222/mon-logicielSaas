import { Groq } from "npm:groq-sdk@0.26.0";
import { createClient } from "npm:@supabase/supabase-js@2";

// Default model to use if none is specified
const DEFAULT_MODEL = "llama3-70b-8192"; 
// List of deprecated models that should never be used
const DEPRECATED_MODELS = ["mixtral-8x7b-32768"];

// Enhanced logging for Groq client operations
function logGroqInfo(message: string, data?: any) {
  console.log(`[GROQ-CLIENT] ${message}`, data ? JSON.stringify(data, null, 2) : '');
}

function logGroqError(message: string, error?: any) {
  console.error(`[GROQ-CLIENT] ERROR: ${message}`, {
    error: error?.message || error,
    stack: error?.stack
  });
}

/**
 * Get Groq configuration for a user
 * @param userId The user ID to get configuration for
 * @returns The Groq configuration
 */
export async function getGroqConfig(userId: string) {
  try {
    logGroqInfo('Getting Groq configuration for user', { userId });
    
    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      logGroqError('Missing Supabase environment variables');
      throw new Error('Missing Supabase environment variables');
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's Groq configuration
    const { data, error } = await supabase
      .from('user_groq_config')
      .select('api_key, model')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logGroqError('Error fetching Groq configuration', error);
      throw new Error(`Failed to fetch Groq configuration: ${error.message}`);
    }

    if (!data || !data.api_key) {
      logGroqError('No Groq API key found for user', null);
      throw new Error('No Groq API key found for this user');
    }

    // Check if the model is deprecated and replace it if needed
    let modelToUse = data.model || DEFAULT_MODEL;
    if (DEPRECATED_MODELS.includes(modelToUse)) {
      logGroqInfo(`[SECURITY] Detected deprecated model ${modelToUse}, replacing with ${DEFAULT_MODEL}`, { userId });
      modelToUse = DEFAULT_MODEL;
      
      // Try to update the database to prevent future issues
      try {
        await supabase
          .from('user_groq_config')
          .update({ model: DEFAULT_MODEL })
          .eq('user_id', userId);
        logGroqInfo('Successfully updated user model', { userId, oldModel: data.model, newModel: DEFAULT_MODEL });
      } catch (updateError) {
        logGroqError('Failed to update deprecated model in database', updateError);
      }
    }

    logGroqInfo('Groq configuration retrieved successfully', { userId, model: modelToUse });
    return {
      apiKey: data.api_key,
      model: modelToUse
    };
  } catch (error) {
    logGroqError('Error getting Groq configuration', error);
    throw error;
  }
}

/**
 * Create a Groq client for a specific user
 * @param userId The user ID to create a client for
 * @returns A configured Groq client
 */
export async function createGroqClient(userId: string): Promise<Groq> {
  try {
    logGroqInfo('Creating Groq client for user', { userId });
    
    // Get the Groq configuration for this user
    const config = await getGroqConfig(userId).catch(async (error) => {
      logGroqInfo(`No user config found, trying fallback`, { userId, error: error.message });
      
      // Fallback: Get any available Groq configuration
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase environment variables');
      }
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const { data: anyConfig, error: configError } = await supabase
        .from('user_groq_config')
        .select('api_key, model')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (configError || !anyConfig || !anyConfig.api_key) {
        throw new Error('No Groq configuration found in the system');
      }
      
      logGroqInfo('Using fallback Groq configuration');
      return {
        apiKey: anyConfig.api_key,
        model: anyConfig.model || DEFAULT_MODEL
      };
    });

    logGroqInfo('Creating Groq client instance');
    // Create and return Groq client with the configuration
    return new Groq({
      apiKey: config.apiKey,
      dangerouslyAllowBrowser: true
    });
  } catch (error) {
    logGroqError('Error creating Groq client', error);
    throw error;
  }
}

/**
 * Get a Groq client with fallback options
 * This function will try multiple approaches to get a working Groq client
 * @returns A configured Groq client
 */
export async function getSystemGroqClient(): Promise<Groq> {
  try {
    logGroqInfo('Getting system-wide Groq client');
    
    // Try to get any available Groq configuration
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      logGroqError('Missing Supabase environment variables for system client');
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
      logGroqError('No Groq configuration found in system', configError);
      throw new Error('No Groq configuration found in the system');
    }
    
    logGroqInfo('Using Groq configuration from user', { userId: anyConfig.user_id });
    
    // Ensure we're not using the deprecated model
    let modelToUse = anyConfig.model || DEFAULT_MODEL;
    if (DEPRECATED_MODELS.includes(modelToUse)) {
      logGroqInfo(`[SECURITY] Detected deprecated model, switching`, { oldModel: modelToUse, newModel: DEFAULT_MODEL });
      modelToUse = DEFAULT_MODEL;
      
      // Update the database to prevent future issues
      try {
        await supabase
          .from('user_groq_config')
          .update({ model: DEFAULT_MODEL })
          .eq('user_id', anyConfig.user_id);
        logGroqInfo('Successfully updated deprecated model', { userId: anyConfig.user_id });
      } catch (updateError) {
        logGroqError('Failed to update deprecated model in database', updateError);
      }
    }

    // Log the model being used
    logGroqInfo('Using Groq model for system-wide client', { model: modelToUse });

    // Create and return Groq client
    return new Groq({
      apiKey: anyConfig.api_key,
      dangerouslyAllowBrowser: true
    });
  } catch (error) {
    logGroqError('Error creating system Groq client', error);
    
    // Last resort fallback - create a client with environment variable if available
    const fallbackApiKey = Deno.env.get('GROQ_API_KEY');
    if (fallbackApiKey) {
      logGroqInfo('Using fallback GROQ_API_KEY from environment variables');
      return new Groq({
        apiKey: fallbackApiKey,
        dangerouslyAllowBrowser: true
      });
    } else {
      logGroqError('No fallback API key available');
      throw error;
    }
  }
}