/**
 * Auto-Reply Rule Conflict Resolution System
 * Implements rule prioritization and conflict detection
 */

import { supabase } from './supabase';

export interface AutoReplyRule {
  id: string;
  user_id: string;
  trigger_words: string[];
  response: string;
  priority: number;
  is_active: boolean;
  use_regex: boolean;
  pattern_flags: string;
  variables?: Record<string, string>;
  conditions?: {
    time_range?: { start: string; end: string };
    user_segments?: string[];
    max_uses_per_day?: number;
  };
  created_at: string;
  updated_at: string;
}

export interface RuleConflict {
  rule1: AutoReplyRule;
  rule2: AutoReplyRule;
  conflictType: 'keyword_overlap' | 'priority_tie' | 'regex_conflict' | 'condition_conflict';
  severity: 'low' | 'medium' | 'high';
  suggestion: string;
}

export interface RuleMatchResult {
  rule: AutoReplyRule;
  confidence: number;
  matchedKeywords: string[];
  conflictingRules: AutoReplyRule[];
}

/**
 * Detect conflicts between auto-reply rules
 */
export async function detectRuleConflicts(userId: string): Promise<RuleConflict[]> {
  const { data: rules, error } = await supabase
    .from('auto_reply_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error) {
    console.error('Error fetching auto-reply rules:', error);
    return [];
  }

  const conflicts: RuleConflict[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const rule1 = rules[i];
      const rule2 = rules[j];
      
      const conflict = analyzeRuleConflict(rule1, rule2);
      if (conflict) {
        conflicts.push(conflict);
      }
    }
  }

  return conflicts;
}

/**
 * Analyze potential conflict between two rules
 */
function analyzeRuleConflict(rule1: AutoReplyRule, rule2: AutoReplyRule): RuleConflict | null {
  // Check for keyword overlap
  const keywordOverlap = findKeywordOverlap(rule1.trigger_words, rule2.trigger_words);
  if (keywordOverlap.length > 0) {
    const severity = keywordOverlap.length > 2 ? 'high' : 'medium';
    return {
      rule1,
      rule2,
      conflictType: 'keyword_overlap',
      severity,
      suggestion: `Consider merging rules or adjusting keywords: ${keywordOverlap.join(', ')}`
    };
  }

  // Check for priority ties with similar triggers
  if (rule1.priority === rule2.priority) {
    const similarity = calculateTriggerSimilarity(rule1.trigger_words, rule2.trigger_words);
    if (similarity > 0.3) {
      return {
        rule1,
        rule2,
        conflictType: 'priority_tie',
        severity: 'medium',
        suggestion: 'Adjust priorities to ensure deterministic rule selection'
      };
    }
  }

  // Check for regex conflicts
  if (rule1.use_regex && rule2.use_regex) {
    const regexConflict = checkRegexConflict(rule1.trigger_words, rule2.trigger_words);
    if (regexConflict) {
      return {
        rule1,
        rule2,
        conflictType: 'regex_conflict',
        severity: 'high',
        suggestion: 'Regex patterns may match the same input - review pattern specificity'
      };
    }
  }

  return null;
}

/**
 * Find overlapping keywords between two rule sets
 */
function findKeywordOverlap(keywords1: string[], keywords2: string[]): string[] {
  const set1 = new Set(keywords1.map(k => k.toLowerCase().trim()));
  const set2 = new Set(keywords2.map(k => k.toLowerCase().trim()));
  
  return Array.from(set1).filter(keyword => set2.has(keyword));
}

/**
 * Calculate similarity between trigger word sets
 */
function calculateTriggerSimilarity(triggers1: string[], triggers2: string[]): number {
  const set1 = new Set(triggers1.map(t => t.toLowerCase()));
  const set2 = new Set(triggers2.map(t => t.toLowerCase()));
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Check for regex pattern conflicts
 */
function checkRegexConflict(patterns1: string[], patterns2: string[]): boolean {
  const testStrings = [
    'hello world',
    'help me please',
    'order status',
    'cancel subscription',
    'technical support'
  ];

  for (const pattern1 of patterns1) {
    for (const pattern2 of patterns2) {
      try {
        const regex1 = new RegExp(pattern1, 'i');
        const regex2 = new RegExp(pattern2, 'i');
        
        // Check if both patterns match any test string
        for (const testString of testStrings) {
          if (regex1.test(testString) && regex2.test(testString)) {
            return true;
          }
        }
      } catch (error) {
        console.warn('Invalid regex pattern:', { pattern1, pattern2, error });
      }
    }
  }

  return false;
}

/**
 * Find the best matching rule for a message with conflict resolution
 */
export async function findBestMatchingRule(
  message: string,
  userId: string,
  phoneNumber: string
): Promise<RuleMatchResult | null> {
  const { data: rules, error } = await supabase
    .from('auto_reply_rules')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('priority', { ascending: false });

  if (error || !rules?.length) {
    return null;
  }

  const matchingRules: RuleMatchResult[] = [];
  const normalizedMessage = message.toLowerCase().trim();

  for (const rule of rules) {
    const matchResult = evaluateRuleMatch(rule, normalizedMessage, phoneNumber);
    if (matchResult.confidence > 0) {
      matchingRules.push(matchResult);
    }
  }

  if (matchingRules.length === 0) {
    return null;
  }

  // Sort by priority first, then by confidence
  matchingRules.sort((a, b) => {
    if (a.rule.priority !== b.rule.priority) {
      return b.rule.priority - a.rule.priority;
    }
    return b.confidence - a.confidence;
  });

  const bestMatch = matchingRules[0];
  
  // Find conflicting rules (other matches with similar priority/confidence)
  const conflictingRules = matchingRules
    .slice(1)
    .filter(match => 
      Math.abs(match.rule.priority - bestMatch.rule.priority) <= 1 &&
      match.confidence > 0.7
    )
    .map(match => match.rule);

  return {
    ...bestMatch,
    conflictingRules
  };
}

/**
 * Evaluate how well a rule matches a message
 */
function evaluateRuleMatch(
  rule: AutoReplyRule,
  normalizedMessage: string,
  phoneNumber: string
): RuleMatchResult {
  let confidence = 0;
  const matchedKeywords: string[] = [];

  if (rule.use_regex) {
    // Regex matching
    for (const pattern of rule.trigger_words) {
      try {
        const regex = new RegExp(pattern, rule.pattern_flags || 'i');
        if (regex.test(normalizedMessage)) {
          confidence = Math.max(confidence, 0.9);
          matchedKeywords.push(pattern);
        }
      } catch (error) {
        console.warn('Invalid regex pattern:', pattern, error);
      }
    }
  } else {
    // Keyword matching
    for (const keyword of rule.trigger_words) {
      const normalizedKeyword = keyword.toLowerCase().trim();
      if (normalizedMessage.includes(normalizedKeyword)) {
        const keywordWeight = normalizedKeyword.length / normalizedMessage.length;
        confidence = Math.max(confidence, Math.min(0.8, keywordWeight * 2));
        matchedKeywords.push(keyword);
      }
    }
  }

  // Apply condition filters
  if (confidence > 0 && rule.conditions) {
    confidence *= evaluateConditions(rule.conditions, phoneNumber);
  }

  return {
    rule,
    confidence,
    matchedKeywords,
    conflictingRules: []
  };
}

/**
 * Evaluate rule conditions
 */
function evaluateConditions(
  conditions: AutoReplyRule['conditions'],
  phoneNumber: string
): number {
  let conditionScore = 1.0;

  if (conditions?.time_range) {
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const [startHour, startMin] = conditions.time_range.start.split(':').map(Number);
    const [endHour, endMin] = conditions.time_range.end.split(':').map(Number);
    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    if (currentTime < startTime || currentTime > endTime) {
      conditionScore *= 0.1; // Heavily penalize outside time range
    }
  }

  // Additional condition evaluations can be added here
  // (user segments, usage limits, etc.)

  return conditionScore;
}

/**
 * Resolve rule conflicts automatically
 */
export async function resolveRuleConflicts(
  userId: string,
  conflicts: RuleConflict[]
): Promise<{ resolved: number; suggestions: string[] }> {
  let resolved = 0;
  const suggestions: string[] = [];

  for (const conflict of conflicts) {
    switch (conflict.conflictType) {
      case 'keyword_overlap':
        if (conflict.severity === 'high') {
          // Automatically merge similar rules
          const mergeResult = await attemptRuleMerge(conflict.rule1, conflict.rule2);
          if (mergeResult.success) {
            resolved++;
          } else {
            suggestions.push(`Consider merging rules "${conflict.rule1.id}" and "${conflict.rule2.id}": ${mergeResult.reason}`);
          }
        }
        break;

      case 'priority_tie':
        // Automatically adjust priorities
        await adjustRulePriorities(userId, [conflict.rule1, conflict.rule2]);
        resolved++;
        break;

      case 'regex_conflict':
        suggestions.push(`Review regex patterns in rules "${conflict.rule1.id}" and "${conflict.rule2.id}" for specificity`);
        break;
    }
  }

  return { resolved, suggestions };
}

/**
 * Attempt to merge two conflicting rules
 */
async function attemptRuleMerge(
  rule1: AutoReplyRule,
  rule2: AutoReplyRule
): Promise<{ success: boolean; reason: string }> {
  // Only merge if responses are similar or one is clearly better
  const responseSimilarity = calculateResponseSimilarity(rule1.response, rule2.response);
  
  if (responseSimilarity < 0.3) {
    return { success: false, reason: 'Responses too different to merge automatically' };
  }

  try {
    // Create merged rule
    const mergedRule = {
      trigger_words: [...new Set([...rule1.trigger_words, ...rule2.trigger_words])],
      response: rule1.response.length > rule2.response.length ? rule1.response : rule2.response,
      priority: Math.max(rule1.priority, rule2.priority),
      use_regex: rule1.use_regex || rule2.use_regex,
      pattern_flags: rule1.pattern_flags || rule2.pattern_flags,
      conditions: { ...rule1.conditions, ...rule2.conditions }
    };

    // Update the higher priority rule
    const targetRule = rule1.priority >= rule2.priority ? rule1 : rule2;
    const ruleToDelete = rule1.priority >= rule2.priority ? rule2 : rule1;

    await supabase
      .from('auto_reply_rules')
      .update(mergedRule)
      .eq('id', targetRule.id);

    await supabase
      .from('auto_reply_rules')
      .delete()
      .eq('id', ruleToDelete.id);

    return { success: true, reason: 'Rules merged successfully' };
  } catch (error) {
    return { success: false, reason: `Merge failed: ${error}` };
  }
}

/**
 * Calculate similarity between two response texts
 */
function calculateResponseSimilarity(response1: string, response2: string): number {
  const words1 = response1.toLowerCase().split(/\s+/);
  const words2 = response2.toLowerCase().split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Adjust rule priorities to resolve conflicts
 */
async function adjustRulePriorities(
  userId: string,
  conflictingRules: AutoReplyRule[]
): Promise<void> {
  // Sort by creation date (older rules get higher priority)
  conflictingRules.sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (let i = 0; i < conflictingRules.length; i++) {
    const newPriority = conflictingRules[i].priority + (conflictingRules.length - i - 1);
    
    await supabase
      .from('auto_reply_rules')
      .update({ priority: newPriority })
      .eq('id', conflictingRules[i].id);
  }
}