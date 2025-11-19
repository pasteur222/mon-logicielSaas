/**
 * Complete Error Management System
 * Implements exponential backoff, fallback responses, and graceful degradation
 */

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
}

export interface ErrorContext {
  operation: string;
  module: 'customer_service' | 'quiz' | 'whatsapp' | 'system';
  userId?: string;
  phoneNumber?: string;
  sessionId?: string;
  metadata?: Record<string, any>;
}

export interface FallbackResponse {
  content: string;
  type: 'error' | 'maintenance' | 'retry' | 'escalation';
  shouldRetry: boolean;
  escalateToHuman: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true
};

const FALLBACK_RESPONSES: Record<string, FallbackResponse> = {
  groq_api_error: {
    content: "Je rencontre des difficultés techniques temporaires. Un agent vous contactera bientôt pour vous aider.",
    type: 'error',
    shouldRetry: true,
    escalateToHuman: true
  },
  database_error: {
    content: "Nos systèmes sont temporairement indisponibles. Votre message a été enregistré et nous vous répondrons dès que possible.",
    type: 'maintenance',
    shouldRetry: true,
    escalateToHuman: false
  },
  rate_limit_exceeded: {
    content: "Nous recevons beaucoup de demandes en ce moment. Veuillez patienter quelques minutes avant de réessayer.",
    type: 'retry',
    shouldRetry: false,
    escalateToHuman: false
  },
  validation_error: {
    content: "Votre message n'a pas pu être traité. Veuillez reformuler votre demande ou contacter notre support.",
    type: 'error',
    shouldRetry: false,
    escalateToHuman: true
  },
  timeout_error: {
    content: "Le traitement de votre demande prend plus de temps que prévu. Un agent va examiner votre cas personnellement.",
    type: 'escalation',
    shouldRetry: false,
    escalateToHuman: true
  }
};

/**
 * Execute operation with exponential backoff retry logic
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error;
  
  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Log successful retry if this wasn't the first attempt
      if (attempt > 0) {
        console.log(`✅ [ERROR-MGMT] Operation succeeded on attempt ${attempt + 1}:`, {
          operation: context.operation,
          module: context.module,
          attempts: attempt + 1
        });
      }
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      console.warn(`⚠️ [ERROR-MGMT] Attempt ${attempt + 1} failed:`, {
        operation: context.operation,
        module: context.module,
        error: lastError.message,
        attempt: attempt + 1,
        maxRetries: retryConfig.maxRetries
      });
      
      // Don't retry on the last attempt
      if (attempt === retryConfig.maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff and optional jitter
      let delay = Math.min(
        retryConfig.baseDelay * Math.pow(retryConfig.backoffMultiplier, attempt),
        retryConfig.maxDelay
      );
      
      if (retryConfig.jitter) {
        delay = delay * (0.5 + Math.random() * 0.5); // Add 0-50% jitter
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // All retries failed, handle the error
  return handleOperationFailure(lastError!, context);
}

/**
 * Handle operation failure with appropriate fallback
 */
async function handleOperationFailure<T>(
  error: Error,
  context: ErrorContext
): Promise<T> {
  console.error(`❌ [ERROR-MGMT] Operation failed after all retries:`, {
    operation: context.operation,
    module: context.module,
    error: error.message,
    context
  });
  
  // Determine error type and get appropriate fallback
  const errorType = classifyError(error);
  const fallback = FALLBACK_RESPONSES[errorType] || FALLBACK_RESPONSES.validation_error;
  
  // Log error for monitoring
  await logError(error, context, errorType);
  
  // Escalate to human if needed
  if (fallback.escalateToHuman) {
    await escalateToHuman(context, error);
  }
  
  // For customer service and quiz modules, return fallback response
  if (context.module === 'customer_service' || context.module === 'quiz') {
    return {
      phoneNumber: context.phoneNumber,
      content: fallback.content,
      sender: 'bot',
      source: 'whatsapp'
    } as T;
  }
  
  // For other operations, throw the error
  throw error;
}

/**
 * Classify error type for appropriate handling
 */
function classifyError(error: Error): string {
  const message = error.message.toLowerCase();
  
  if (message.includes('rate limit') || message.includes('too many requests')) {
    return 'rate_limit_exceeded';
  }
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout_error';
  }
  
  if (message.includes('groq') || message.includes('api key') || message.includes('unauthorized')) {
    return 'groq_api_error';
  }
  
  if (message.includes('database') || message.includes('connection') || message.includes('supabase')) {
    return 'database_error';
  }
  
  if (message.includes('validation') || message.includes('invalid')) {
    return 'validation_error';
  }
  
  return 'validation_error'; // Default fallback
}

/**
 * Log error for monitoring and analysis
 */
async function logError(
  error: Error,
  context: ErrorContext,
  errorType: string
): Promise<void> {
  try {
    const { supabase } = await import('./supabase');
    
    await supabase
      .from('error_logs')
      .insert({
        error_type: errorType,
        error_message: error.message,
        error_stack: error.stack,
        operation: context.operation,
        module: context.module,
        user_id: context.userId,
        phone_number: context.phoneNumber,
        session_id: context.sessionId,
        metadata: context.metadata,
        created_at: new Date().toISOString()
      });
  } catch (logError) {
    console.error('Failed to log error:', logError);
    // Don't throw - logging failure shouldn't break the main flow
  }
}

/**
 * Escalate error to human agent
 */
async function escalateToHuman(
  context: ErrorContext,
  error: Error
): Promise<void> {
  try {
    const { supabase } = await import('./supabase');
    
    await supabase
      .from('escalation_queue')
      .insert({
        module: context.module,
        phone_number: context.phoneNumber,
        session_id: context.sessionId,
        error_message: error.message,
        context_data: context.metadata,
        priority: 'high',
        status: 'pending',
        created_at: new Date().toISOString()
      });
      
    console.log(`🚨 [ERROR-MGMT] Escalated to human agent:`, {
      module: context.module,
      phoneNumber: context.phoneNumber,
      error: error.message
    });
  } catch (escalationError) {
    console.error('Failed to escalate to human:', escalationError);
  }
}

/**
 * Circuit breaker pattern for external services
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold: number = 5,
    private timeout: number = 60000,
    private resetTimeout: number = 30000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open - service unavailable');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
  
  getState(): string {
    return this.state;
  }
}

/**
 * Global circuit breakers for external services
 */
export const circuitBreakers = {
  groq: new CircuitBreaker(5, 60000, 30000),
  whatsapp: new CircuitBreaker(3, 30000, 15000),
  database: new CircuitBreaker(10, 120000, 60000)
};