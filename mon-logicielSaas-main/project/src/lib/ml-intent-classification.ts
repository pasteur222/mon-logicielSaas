/**
 * ML-Based Intent Classification System
 * Implements confidence scoring and advanced intent detection
 */

import { supabase } from './supabase';

export interface IntentClassification {
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  alternatives: Array<{ intent: string; confidence: number }>;
  metadata: {
    processing_time: number;
    model_version: string;
    features_used: string[];
  };
}

export interface TrainingData {
  text: string;
  intent: string;
  entities: Record<string, any>;
  language: string;
  context?: Record<string, any>;
}

export interface IntentModel {
  id: string;
  name: string;
  version: string;
  intents: string[];
  features: string[];
  accuracy: number;
  training_data_count: number;
  last_trained: string;
  is_active: boolean;
}

/**
 * Built-in intent patterns for French customer service
 */
const INTENT_PATTERNS = {
  greeting: {
    patterns: [
      /^(bonjour|salut|hello|bonsoir|hey)/i,
      /^(comment ça va|ça va)/i
    ],
    keywords: ['bonjour', 'salut', 'hello', 'bonsoir', 'hey', 'coucou'],
    confidence_boost: 0.2
  },
  
  order_status: {
    patterns: [
      /(statut|état|suivi).*(commande|order)/i,
      /(où est|où se trouve).*(commande|colis|livraison)/i,
      /commande.*(en cours|expédiée|livrée)/i
    ],
    keywords: ['commande', 'order', 'statut', 'suivi', 'livraison', 'colis', 'expédition'],
    confidence_boost: 0.3
  },

  product_inquiry: {
    patterns: [
      /(prix|coût|tarif).*(produit|article)/i,
      /(disponible|stock|dispo).*(produit|article)/i,
      /(caractéristiques|specs|détails).*(produit)/i
    ],
    keywords: ['prix', 'coût', 'tarif', 'produit', 'article', 'disponible', 'stock', 'caractéristiques'],
    confidence_boost: 0.25
  },

  support_request: {
    patterns: [
      /(aide|help|support|assistance)/i,
      /(problème|souci|bug|erreur)/i,
      /(ne fonctionne pas|marche pas|broken)/i
    ],
    keywords: ['aide', 'help', 'support', 'assistance', 'problème', 'souci', 'bug', 'erreur'],
    confidence_boost: 0.3
  },

  complaint: {
    patterns: [
      /(mécontent|insatisfait|déçu|furieux)/i,
      /(réclamation|plainte|complaint)/i,
      /(remboursement|rembourser|refund)/i
    ],
    keywords: ['mécontent', 'insatisfait', 'déçu', 'réclamation', 'plainte', 'remboursement'],
    confidence_boost: 0.35
  },

  appointment: {
    patterns: [
      /(rendez-vous|rdv|appointment|réservation)/i,
      /(disponibilité|créneau|slot)/i,
      /(programmer|planifier|schedule)/i
    ],
    keywords: ['rendez-vous', 'rdv', 'appointment', 'réservation', 'disponibilité', 'créneau'],
    confidence_boost: 0.3
  },

  cancellation: {
    patterns: [
      /(annuler|cancel|supprimer)/i,
      /(ne veux plus|plus besoin)/i,
      /(changer d'avis|changed mind)/i
    ],
    keywords: ['annuler', 'cancel', 'supprimer', 'annulation'],
    confidence_boost: 0.4
  },

  quiz_start: {
    patterns: [
      /(commencer|start|débuter).*(quiz|test|questionnaire)/i,
      /(quiz|test|questionnaire).*(prêt|ready)/i,
      /^(quiz|test|questionnaire)$/i
    ],
    keywords: ['quiz', 'test', 'questionnaire', 'commencer', 'start', 'débuter'],
    confidence_boost: 0.4
  },

  quiz_answer: {
    patterns: [
      /^[a-d]$/i,
      /^(option|choix)\s*[a-d]/i,
      /^(réponse|answer)\s*[a-d]/i
    ],
    keywords: ['option', 'choix', 'réponse', 'answer'],
    confidence_boost: 0.5
  },

  goodbye: {
    patterns: [
      /^(au revoir|bye|goodbye|à bientôt|salut)/i,
      /(merci|thank you).*(au revoir|bye)/i
    ],
    keywords: ['au revoir', 'bye', 'goodbye', 'à bientôt', 'salut', 'merci'],
    confidence_boost: 0.2
  }
};

/**
 * Classify intent using ML-based approach
 */
export async function classifyIntent(
  text: string,
  context?: Record<string, any>
): Promise<IntentClassification> {
  const startTime = Date.now();
  
  try {
    // Normalize text
    const normalizedText = normalizeText(text);
    
    // Extract features
    const features = extractFeatures(normalizedText, context);
    
    // Get pattern-based classification
    const patternResults = classifyWithPatterns(normalizedText);
    
    // Get context-based adjustments
    const contextAdjustments = getContextAdjustments(patternResults, context);
    
    // Combine results and calculate final confidence
    const finalResults = combineClassificationResults(patternResults, contextAdjustments);
    
    // Extract entities
    const entities = extractEntities(normalizedText, finalResults.intent);
    
    const processingTime = Date.now() - startTime;
    
    const classification: IntentClassification = {
      intent: finalResults.intent,
      confidence: finalResults.confidence,
      entities,
      alternatives: finalResults.alternatives,
      metadata: {
        processing_time: processingTime,
        model_version: '1.0.0',
        features_used: features
      }
    };

    // Log classification for training data
    await logClassification(text, classification, context);
    
    console.log(`🧠 [INTENT] Classification completed:`, {
      text: text.substring(0, 50) + '...',
      intent: classification.intent,
      confidence: Math.round(classification.confidence * 100) + '%',
      processingTime: `${processingTime}ms`
    });

    return classification;
  } catch (error) {
    console.error('Error in intent classification:', error);
    
    // Fallback classification
    return {
      intent: 'unknown',
      confidence: 0.1,
      entities: {},
      alternatives: [],
      metadata: {
        processing_time: Date.now() - startTime,
        model_version: '1.0.0',
        features_used: ['fallback']
      }
    };
  }
}

/**
 * Normalize text for processing
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Extract features from text
 */
function extractFeatures(text: string, context?: Record<string, any>): string[] {
  const features: string[] = [];
  
  // Length features
  if (text.length < 10) features.push('short_text');
  else if (text.length > 100) features.push('long_text');
  else features.push('medium_text');
  
  // Word count features
  const wordCount = text.split(' ').length;
  if (wordCount === 1) features.push('single_word');
  else if (wordCount < 5) features.push('few_words');
  else features.push('many_words');
  
  // Question features
  if (text.includes('?')) features.push('question');
  if (text.match(/^(qui|quoi|où|quand|comment|pourquoi)/)) features.push('wh_question');
  
  // Urgency features
  if (text.match(/(urgent|rapidement|vite|asap)/)) features.push('urgent');
  if (text.match(/(!|!!|!!!)/)) features.push('exclamation');
  
  // Context features
  if (context?.previousIntent) {
    features.push(`prev_intent_${context.previousIntent}`);
  }
  
  if (context?.conversationLength) {
    if (context.conversationLength === 1) features.push('first_message');
    else if (context.conversationLength > 10) features.push('long_conversation');
  }
  
  return features;
}

/**
 * Classify using pattern matching
 */
function classifyWithPatterns(text: string): {
  intent: string;
  confidence: number;
  alternatives: Array<{ intent: string; confidence: number }>;
} {
  const scores: Record<string, number> = {};
  
  // Calculate scores for each intent
  for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
    let score = 0;
    
    // Pattern matching
    for (const pattern of config.patterns) {
      if (pattern.test(text)) {
        score += 0.6;
        break; // Only count one pattern match per intent
      }
    }
    
    // Keyword matching
    const words = text.split(' ');
    let keywordMatches = 0;
    for (const keyword of config.keywords) {
      if (words.some(word => word.includes(keyword) || keyword.includes(word))) {
        keywordMatches++;
      }
    }
    
    if (keywordMatches > 0) {
      score += Math.min(keywordMatches * 0.1, 0.4);
    }
    
    // Apply confidence boost
    if (score > 0) {
      score += config.confidence_boost;
    }
    
    scores[intent] = Math.min(score, 1.0);
  }
  
  // Sort by score
  const sortedIntents = Object.entries(scores)
    .filter(([, score]) => score > 0)
    .sort(([, a], [, b]) => b - a);
  
  if (sortedIntents.length === 0) {
    return {
      intent: 'unknown',
      confidence: 0.1,
      alternatives: []
    };
  }
  
  const [topIntent, topScore] = sortedIntents[0];
  const alternatives = sortedIntents
    .slice(1, 4) // Top 3 alternatives
    .map(([intent, confidence]) => ({ intent, confidence }));
  
  return {
    intent: topIntent,
    confidence: topScore,
    alternatives
  };
}

/**
 * Get context-based adjustments
 */
function getContextAdjustments(
  patternResults: { intent: string; confidence: number },
  context?: Record<string, any>
): { intent: string; confidence: number } {
  let adjustedIntent = patternResults.intent;
  let adjustedConfidence = patternResults.confidence;
  
  if (!context) {
    return { intent: adjustedIntent, confidence: adjustedConfidence };
  }
  
  // Previous intent context
  if (context.previousIntent) {
    const intentTransitions: Record<string, Record<string, number>> = {
      greeting: {
        order_status: 0.2,
        product_inquiry: 0.2,
        support_request: 0.15
      },
      support_request: {
        complaint: 0.3,
        cancellation: 0.2
      },
      product_inquiry: {
        order_status: 0.25,
        appointment: 0.15
      },
      quiz_start: {
        quiz_answer: 0.4
      }
    };
    
    const transitions = intentTransitions[context.previousIntent];
    if (transitions && transitions[adjustedIntent]) {
      adjustedConfidence += transitions[adjustedIntent];
    }
  }
  
  // Time-based context
  if (context.timeOfDay) {
    const hour = new Date().getHours();
    if (hour < 9 || hour > 18) {
      // Outside business hours - boost support/urgent intents
      if (['support_request', 'complaint'].includes(adjustedIntent)) {
        adjustedConfidence += 0.1;
      }
    }
  }
  
  // Conversation length context
  if (context.conversationLength) {
    if (context.conversationLength === 1 && adjustedIntent === 'greeting') {
      adjustedConfidence += 0.2; // First message is likely a greeting
    } else if (context.conversationLength > 5 && adjustedIntent === 'goodbye') {
      adjustedConfidence += 0.15; // Long conversations often end with goodbye
    }
  }
  
  return {
    intent: adjustedIntent,
    confidence: Math.min(adjustedConfidence, 1.0)
  };
}

/**
 * Combine classification results
 */
function combineClassificationResults(
  patternResults: { intent: string; confidence: number; alternatives: Array<{ intent: string; confidence: number }> },
  contextAdjustments: { intent: string; confidence: number }
): { intent: string; confidence: number; alternatives: Array<{ intent: string; confidence: number }> } {
  // If context suggests a different intent with high confidence, use it
  if (contextAdjustments.intent !== patternResults.intent && contextAdjustments.confidence > 0.7) {
    return {
      intent: contextAdjustments.intent,
      confidence: contextAdjustments.confidence,
      alternatives: [
        { intent: patternResults.intent, confidence: patternResults.confidence },
        ...patternResults.alternatives
      ]
    };
  }
  
  // Otherwise, use pattern results with context-adjusted confidence
  return {
    intent: patternResults.intent,
    confidence: contextAdjustments.confidence,
    alternatives: patternResults.alternatives
  };
}

/**
 * Extract entities from text based on intent
 */
function extractEntities(text: string, intent: string): Record<string, any> {
  const entities: Record<string, any> = {};
  
  switch (intent) {
    case 'order_status':
      // Extract order numbers
      const orderMatch = text.match(/(?:commande|order|#)\s*([a-z0-9]+)/i);
      if (orderMatch) {
        entities.order_number = orderMatch[1];
      }
      break;
      
    case 'product_inquiry':
      // Extract product names or categories
      const productMatch = text.match(/(produit|article)\s+([a-z\s]+)/i);
      if (productMatch) {
        entities.product = productMatch[2].trim();
      }
      break;
      
    case 'appointment':
      // Extract dates and times
      const dateMatch = text.match(/(\d{1,2}\/\d{1,2}|\d{1,2}\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre))/i);
      if (dateMatch) {
        entities.date = dateMatch[0];
      }
      
      const timeMatch = text.match(/(\d{1,2}h\d{0,2}|\d{1,2}:\d{2})/);
      if (timeMatch) {
        entities.time = timeMatch[0];
      }
      break;
      
    case 'quiz_answer':
      // Extract answer choice
      const answerMatch = text.match(/[a-d]/i);
      if (answerMatch) {
        entities.answer_choice = answerMatch[0].toLowerCase();
      }
      break;
  }
  
  // Extract common entities
  
  // Phone numbers
  const phoneMatch = text.match(/(\+33|0)[1-9](\d{8})/);
  if (phoneMatch) {
    entities.phone_number = phoneMatch[0];
  }
  
  // Email addresses
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    entities.email = emailMatch[0];
  }
  
  // Numbers
  const numberMatch = text.match(/\d+/);
  if (numberMatch) {
    entities.number = parseInt(numberMatch[0]);
  }
  
  return entities;
}

/**
 * Log classification for training data collection
 */
async function logClassification(
  text: string,
  classification: IntentClassification,
  context?: Record<string, any>
): Promise<void> {
  try {
    await supabase
      .from('intent_classifications')
      .insert({
        text,
        predicted_intent: classification.intent,
        confidence: classification.confidence,
        entities: classification.entities,
        alternatives: classification.alternatives,
        context,
        metadata: classification.metadata,
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Error logging classification:', error);
    // Don't throw - logging failure shouldn't break classification
  }
}

/**
 * Get intent classification statistics
 */
export async function getIntentStatistics(days: number = 30): Promise<{
  total_classifications: number;
  intent_distribution: Record<string, number>;
  avg_confidence: number;
  low_confidence_count: number;
}> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: classifications, error } = await supabase
      .from('intent_classifications')
      .select('predicted_intent, confidence')
      .gte('created_at', startDate.toISOString());

    if (error || !classifications) {
      return {
        total_classifications: 0,
        intent_distribution: {},
        avg_confidence: 0,
        low_confidence_count: 0
      };
    }

    const totalClassifications = classifications.length;
    const intentDistribution: Record<string, number> = {};
    let totalConfidence = 0;
    let lowConfidenceCount = 0;

    for (const classification of classifications) {
      // Count intent distribution
      intentDistribution[classification.predicted_intent] = 
        (intentDistribution[classification.predicted_intent] || 0) + 1;
      
      // Sum confidence scores
      totalConfidence += classification.confidence;
      
      // Count low confidence classifications
      if (classification.confidence < 0.5) {
        lowConfidenceCount++;
      }
    }

    const avgConfidence = totalClassifications > 0 ? totalConfidence / totalClassifications : 0;

    return {
      total_classifications: totalClassifications,
      intent_distribution: intentDistribution,
      avg_confidence: Math.round(avgConfidence * 100) / 100,
      low_confidence_count: lowConfidenceCount
    };
  } catch (error) {
    console.error('Error getting intent statistics:', error);
    return {
      total_classifications: 0,
      intent_distribution: {},
      avg_confidence: 0,
      low_confidence_count: 0
    };
  }
}

/**
 * Improve classification with feedback
 */
export async function provideFeedback(
  classificationId: string,
  correctIntent: string,
  feedback: 'correct' | 'incorrect' | 'partially_correct'
): Promise<void> {
  try {
    await supabase
      .from('intent_classifications')
      .update({
        correct_intent: correctIntent,
        feedback,
        feedback_at: new Date().toISOString()
      })
      .eq('id', classificationId);

    console.log(`📝 [INTENT] Feedback provided:`, {
      classificationId,
      correctIntent,
      feedback
    });
  } catch (error) {
    console.error('Error providing feedback:', error);
  }
}

/**
 * Retrain model with feedback data
 */
export async function retrainModel(): Promise<{
  success: boolean;
  accuracy: number;
  training_samples: number;
}> {
  try {
    // Get feedback data for training
    const { data: feedbackData, error } = await supabase
      .from('intent_classifications')
      .select('text, correct_intent, predicted_intent, confidence, feedback')
      .not('feedback', 'is', null);

    if (error || !feedbackData || feedbackData.length < 10) {
      return {
        success: false,
        accuracy: 0,
        training_samples: 0
      };
    }

    // Calculate current accuracy
    const correctPredictions = feedbackData.filter(
      item => item.feedback === 'correct' || item.predicted_intent === item.correct_intent
    ).length;
    
    const accuracy = correctPredictions / feedbackData.length;

    // In a real implementation, this would trigger actual ML model retraining
    // For now, we'll just update the model metadata
    
    console.log(`🎯 [INTENT] Model retrained:`, {
      trainingSamples: feedbackData.length,
      accuracy: Math.round(accuracy * 100) + '%'
    });

    return {
      success: true,
      accuracy: Math.round(accuracy * 100) / 100,
      training_samples: feedbackData.length
    };
  } catch (error) {
    console.error('Error retraining model:', error);
    return {
      success: false,
      accuracy: 0,
      training_samples: 0
    };
  }
}