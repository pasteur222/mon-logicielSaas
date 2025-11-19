/**
 * Centralized Score Calculation System
 * Implements event-driven score updates with consistency guarantees
 */

import { supabase } from './supabase';

export interface ScoreEvent {
  id: string;
  session_id: string;
  event_type: 'question_answered' | 'bonus_awarded' | 'penalty_applied' | 'time_bonus' | 'streak_bonus';
  points: number;
  multiplier: number;
  metadata: {
    question_id?: string;
    answer_correct?: boolean;
    time_taken?: number;
    streak_count?: number;
    difficulty_level?: string;
    bonus_reason?: string;
  };
  created_at: string;
  processed: boolean;
}

export interface ScoreCalculationRule {
  id: string;
  rule_type: 'base_points' | 'time_bonus' | 'streak_bonus' | 'difficulty_multiplier' | 'penalty';
  condition: string; // JSON condition
  points: number;
  multiplier: number;
  max_applications?: number;
  is_active: boolean;
}

export interface ScoreBreakdown {
  base_score: number;
  time_bonuses: number;
  streak_bonuses: number;
  difficulty_bonuses: number;
  penalties: number;
  total_score: number;
  events: ScoreEvent[];
}

export interface ScoreCalculationContext {
  sessionId: string;
  userId: string;
  quizId: string;
  currentStreak: number;
  totalQuestions: number;
  answeredQuestions: number;
  averageTimePerQuestion: number;
  difficultyLevel: string;
}

/**
 * Calculate score for a question answer
 */
export async function calculateQuestionScore(
  sessionId: string,
  questionId: string,
  isCorrect: boolean,
  timeSpent: number,
  difficultyLevel: string = 'medium'
): Promise<ScoreBreakdown> {
  try {
    // Get current session context
    const context = await getScoreCalculationContext(sessionId);
    if (!context) {
      throw new Error('Session context not found');
    }

    // Get active scoring rules
    const rules = await getActiveScoringRules();

    const events: ScoreEvent[] = [];
    let totalPoints = 0;

    if (isCorrect) {
      // Base points for correct answer
      const basePoints = calculateBasePoints(difficultyLevel, rules);
      events.push(await createScoreEvent(
        sessionId,
        'question_answered',
        basePoints,
        1.0,
        {
          question_id: questionId,
          answer_correct: true,
          difficulty_level: difficultyLevel
        }
      ));
      totalPoints += basePoints;

      // Time bonus
      const timeBonus = calculateTimeBonus(timeSpent, difficultyLevel, rules);
      if (timeBonus > 0) {
        events.push(await createScoreEvent(
          sessionId,
          'time_bonus',
          timeBonus,
          1.0,
          {
            question_id: questionId,
            time_taken: timeSpent,
            difficulty_level: difficultyLevel
          }
        ));
        totalPoints += timeBonus;
      }

      // Streak bonus
      const newStreak = context.currentStreak + 1;
      const streakBonus = calculateStreakBonus(newStreak, rules);
      if (streakBonus > 0) {
        events.push(await createScoreEvent(
          sessionId,
          'streak_bonus',
          streakBonus,
          1.0,
          {
            question_id: questionId,
            streak_count: newStreak
          }
        ));
        totalPoints += streakBonus;
      }

      // Update streak
      await updateSessionStreak(sessionId, newStreak);
    } else {
      // Reset streak on wrong answer
      await updateSessionStreak(sessionId, 0);

      // Apply penalty if configured
      const penalty = calculatePenalty(difficultyLevel, rules);
      if (penalty > 0) {
        events.push(await createScoreEvent(
          sessionId,
          'penalty_applied',
          -penalty,
          1.0,
          {
            question_id: questionId,
            answer_correct: false,
            difficulty_level: difficultyLevel
          }
        ));
        totalPoints -= penalty;
      }
    }

    // Process all score events
    for (const event of events) {
      await processScoreEvent(event);
    }

    // Get updated score breakdown
    return await getScoreBreakdown(sessionId);
  } catch (error) {
    console.error('Error calculating question score:', error);
    throw error;
  }
}

/**
 * Get score calculation context for session
 */
async function getScoreCalculationContext(sessionId: string): Promise<ScoreCalculationContext | null> {
  const { data: session, error: sessionError } = await supabase
    .from('quiz_sessions')
    .select(`
      *,
      quizzes (
        id,
        questions,
        difficulty_level
      )
    `)
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return null;
  }

  const quiz = session.quizzes as any;
  const answers = session.answers as Record<string, any>;
  const answeredQuestions = Object.keys(answers).length;
  const totalQuestions = quiz.questions?.length || 0;

  // Calculate current streak
  let currentStreak = 0;
  const sortedAnswers = Object.entries(answers)
    .sort(([, a], [, b]) => new Date(a.answered_at).getTime() - new Date(b.answered_at).getTime());

  for (let i = sortedAnswers.length - 1; i >= 0; i--) {
    if (sortedAnswers[i][1].is_correct) {
      currentStreak++;
    } else {
      break;
    }
  }

  // Calculate average time per question
  const totalTime = Object.values(answers).reduce((sum: number, answer: any) => 
    sum + (answer.time_spent || 0), 0
  );
  const averageTimePerQuestion = answeredQuestions > 0 ? totalTime / answeredQuestions : 0;

  return {
    sessionId,
    userId: session.user_id,
    quizId: session.quiz_id,
    currentStreak,
    totalQuestions,
    answeredQuestions,
    averageTimePerQuestion,
    difficultyLevel: quiz.difficulty_level || 'medium'
  };
}

/**
 * Get active scoring rules
 */
async function getActiveScoringRules(): Promise<ScoreCalculationRule[]> {
  const { data: rules, error } = await supabase
    .from('score_calculation_rules')
    .select('*')
    .eq('is_active', true)
    .order('rule_type');

  if (error) {
    console.error('Error fetching scoring rules:', error);
    return [];
  }

  return rules || [];
}

/**
 * Calculate base points for correct answer
 */
function calculateBasePoints(difficultyLevel: string, rules: ScoreCalculationRule[]): number {
  const baseRule = rules.find(r => r.rule_type === 'base_points');
  let basePoints = baseRule?.points || 10;

  // Apply difficulty multiplier
  const difficultyRule = rules.find(r => 
    r.rule_type === 'difficulty_multiplier' && 
    r.condition.includes(difficultyLevel)
  );

  if (difficultyRule) {
    basePoints *= difficultyRule.multiplier;
  }

  return Math.round(basePoints);
}

/**
 * Calculate time bonus
 */
function calculateTimeBonus(timeSpent: number, difficultyLevel: string, rules: ScoreCalculationRule[]): number {
  const timeBonusRule = rules.find(r => r.rule_type === 'time_bonus');
  if (!timeBonusRule) return 0;

  // Define optimal time ranges by difficulty
  const optimalTimes: Record<string, { min: number; max: number }> = {
    easy: { min: 5000, max: 15000 },    // 5-15 seconds
    medium: { min: 10000, max: 30000 }, // 10-30 seconds
    hard: { min: 15000, max: 45000 }    // 15-45 seconds
  };

  const optimal = optimalTimes[difficultyLevel] || optimalTimes.medium;

  if (timeSpent >= optimal.min && timeSpent <= optimal.max) {
    // Full bonus for optimal time
    return timeBonusRule.points;
  } else if (timeSpent < optimal.min) {
    // Partial bonus for very fast answers
    return Math.round(timeBonusRule.points * 0.5);
  }

  return 0; // No bonus for slow answers
}

/**
 * Calculate streak bonus
 */
function calculateStreakBonus(streakCount: number, rules: ScoreCalculationRule[]): number {
  const streakRule = rules.find(r => r.rule_type === 'streak_bonus');
  if (!streakRule || streakCount < 3) return 0; // Minimum 3 for streak bonus

  // Exponential bonus growth with cap
  const bonusMultiplier = Math.min(streakCount - 2, 10); // Cap at 10x
  return Math.round(streakRule.points * bonusMultiplier);
}

/**
 * Calculate penalty for wrong answer
 */
function calculatePenalty(difficultyLevel: string, rules: ScoreCalculationRule[]): number {
  const penaltyRule = rules.find(r => 
    r.rule_type === 'penalty' && 
    r.condition.includes(difficultyLevel)
  );

  return penaltyRule?.points || 0;
}

/**
 * Create score event
 */
async function createScoreEvent(
  sessionId: string,
  eventType: ScoreEvent['event_type'],
  points: number,
  multiplier: number,
  metadata: ScoreEvent['metadata']
): Promise<ScoreEvent> {
  const event: Partial<ScoreEvent> = {
    id: crypto.randomUUID(),
    session_id: sessionId,
    event_type: eventType,
    points,
    multiplier,
    metadata,
    created_at: new Date().toISOString(),
    processed: false
  };

  const { data, error } = await supabase
    .from('score_events')
    .insert(event)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create score event: ${error.message}`);
  }

  return data as ScoreEvent;
}

/**
 * Process score event and update session
 */
async function processScoreEvent(event: ScoreEvent): Promise<void> {
  try {
    // Calculate final points with multiplier
    const finalPoints = Math.round(event.points * event.multiplier);

    // Update session score atomically
    const { error: updateError } = await supabase.rpc('update_session_score', {
      p_session_id: event.session_id,
      p_points_delta: finalPoints
    });

    if (updateError) {
      throw updateError;
    }

    // Mark event as processed
    await supabase
      .from('score_events')
      .update({ processed: true })
      .eq('id', event.id);

    console.log(`📊 [SCORE] Event processed:`, {
      eventId: event.id,
      sessionId: event.session_id,
      eventType: event.event_type,
      points: finalPoints
    });
  } catch (error) {
    console.error('Error processing score event:', error);
    throw error;
  }
}

/**
 * Update session streak
 */
async function updateSessionStreak(sessionId: string, streakCount: number): Promise<void> {
  const { error } = await supabase
    .from('quiz_sessions')
    .update({ 
      current_streak: streakCount,
      max_streak: supabase.rpc('greatest', { 
        val1: streakCount, 
        val2: supabase.rpc('coalesce', { val: 'max_streak', default_val: 0 })
      })
    })
    .eq('id', sessionId);

  if (error) {
    console.error('Error updating session streak:', error);
  }
}

/**
 * Get complete score breakdown for session
 */
export async function getScoreBreakdown(sessionId: string): Promise<ScoreBreakdown> {
  try {
    // Get all score events for session
    const { data: events, error: eventsError } = await supabase
      .from('score_events')
      .select('*')
      .eq('session_id', sessionId)
      .eq('processed', true)
      .order('created_at');

    if (eventsError) {
      throw eventsError;
    }

    const scoreEvents = (events || []) as ScoreEvent[];

    // Calculate breakdown by event type
    let baseScore = 0;
    let timeBonuses = 0;
    let streakBonuses = 0;
    let difficultyBonuses = 0;
    let penalties = 0;

    for (const event of scoreEvents) {
      const points = Math.round(event.points * event.multiplier);

      switch (event.event_type) {
        case 'question_answered':
          if (points > 0) baseScore += points;
          break;
        case 'time_bonus':
          timeBonuses += points;
          break;
        case 'streak_bonus':
          streakBonuses += points;
          break;
        case 'bonus_awarded':
          difficultyBonuses += points;
          break;
        case 'penalty_applied':
          penalties += Math.abs(points);
          break;
      }
    }

    const totalScore = baseScore + timeBonuses + streakBonuses + difficultyBonuses - penalties;

    return {
      base_score: baseScore,
      time_bonuses: timeBonuses,
      streak_bonuses: streakBonuses,
      difficulty_bonuses: difficultyBonuses,
      penalties,
      total_score: Math.max(0, totalScore), // Ensure non-negative
      events: scoreEvents
    };
  } catch (error) {
    console.error('Error getting score breakdown:', error);
    throw error;
  }
}

/**
 * Recalculate session score from events
 */
export async function recalculateSessionScore(sessionId: string): Promise<number> {
  try {
    const breakdown = await getScoreBreakdown(sessionId);
    
    // Update session with recalculated score
    const { error } = await supabase
      .from('quiz_sessions')
      .update({ score: breakdown.total_score })
      .eq('id', sessionId);

    if (error) {
      throw error;
    }

    console.log(`🔄 [SCORE] Session score recalculated:`, {
      sessionId,
      newScore: breakdown.total_score
    });

    return breakdown.total_score;
  } catch (error) {
    console.error('Error recalculating session score:', error);
    throw error;
  }
}

/**
 * Award bonus points
 */
export async function awardBonusPoints(
  sessionId: string,
  points: number,
  reason: string,
  metadata: Record<string, any> = {}
): Promise<void> {
  const event = await createScoreEvent(
    sessionId,
    'bonus_awarded',
    points,
    1.0,
    {
      bonus_reason: reason,
      ...metadata
    }
  );

  await processScoreEvent(event);
}

/**
 * Get leaderboard for quiz
 */
export async function getQuizLeaderboard(
  quizId: string,
  limit: number = 10
): Promise<Array<{
  user_id: string;
  phone_number: string;
  score: number;
  completion_time: number;
  completed_at: string;
}>> {
  try {
    const { data, error } = await supabase
      .from('quiz_sessions')
      .select('user_id, phone_number, score, started_at, completed_at')
      .eq('quiz_id', quizId)
      .eq('status', 'completed')
      .order('score', { ascending: false })
      .order('completed_at', { ascending: true })
      .limit(limit);

    if (error) {
      throw error;
    }

    return (data || []).map(session => ({
      user_id: session.user_id,
      phone_number: session.phone_number,
      score: session.score,
      completion_time: new Date(session.completed_at).getTime() - new Date(session.started_at).getTime(),
      completed_at: session.completed_at
    }));
  } catch (error) {
    console.error('Error getting quiz leaderboard:', error);
    return [];
  }
}