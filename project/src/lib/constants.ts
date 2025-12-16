// Groq AI Models - Updated with currently supported models
// See: https://console.groq.com/docs/models
export const GROQ_MODELS = [
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B Versatile (Recommended)' },
  { id: 'llama-3.1-70b-versatile', name: 'Llama 3.1 70B Versatile' },
  { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B Instant (Fast)' },
  { id: 'gemma2-9b-it', name: 'Gemma 2 9B Instruct' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B (32K context)' }
];

// Default Groq model to use if none is specified
// Using Gemma 2 9B as it's fast, reliable, and cost-effective
export const DEFAULT_GROQ_MODEL = 'gemma2-9b-it';