/**
 * Atomic Session Management System for Quiz Module
 * Implements transaction locks and session state consistency
 */

import { supabase } from './supabase';

export interface QuizSession {
  id: string;
  user_id: string;
  phone_number: string;
  quiz_id: string;
  current_question_index: number;
  answers: Record<string, any>;
  score: number;
  status: 'active' | 'completed' | 'abandoned' | 'paused';
  started_at: string;
  completed_at?: string;
  last_activity_at: string;
  metadata?: {
    time_spent: number;
    question_times: Record<string, number>;
    engagement_score: number;
    difficulty_adjustments: string[];
  };
  lock_version: number;
  locked_by?: string;
  locked_at?: string;
}

export interface SessionLock {
  sessionId: string;
  lockId: string;
  lockedBy: string;
  lockedAt: string;
  expiresAt: string;
}

export interface SessionTransaction {
  sessionId: string;
  operation: 'answer_question' | 'next_question' | 'complete_quiz' | 'update_score';
  data: Record<string, any>;
  timestamp: string;
  lockId: string;
}

const LOCK_TIMEOUT = 30000; // 30 seconds
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Acquire exclusive lock on quiz session
 */
export async function acquireSessionLock(
  sessionId: string,
  operationType: string,
  timeout: number = LOCK_TIMEOUT
): Promise<string | null> {
  const lockId = crypto.randomUUID();
  const lockBy = `${operationType}-${Date.now()}`;
  const expiresAt = new Date(Date.now() + timeout);

  try {
    // Try to acquire lock atomically
    const { data, error } = await supabase.rpc('acquire_session_lock', {
      p_session_id: sessionId,
      p_lock_id: lockId,
      p_locked_by: lockBy,
      p_expires_at: expiresAt.toISOString()
    });

    if (error) {
      console.error('Error acquiring session lock:', error);
      return null;
    }

    if (data) {
      console.log(`🔒 [SESSION] Lock acquired:`, {
        sessionId,
        lockId,
        operationType,
        expiresAt: expiresAt.toISOString()
      });
      return lockId;
    }

    return null;
  } catch (error) {
    console.error('Error in acquireSessionLock:', error);
    return null;
  }
}

/**
 * Release session lock
 */
export async function releaseSessionLock(
  sessionId: string,
  lockId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('release_session_lock', {
      p_session_id: sessionId,
      p_lock_id: lockId
    });

    if (error) {
      console.error('Error releasing session lock:', error);
      return false;
    }

    console.log(`🔓 [SESSION] Lock released:`, { sessionId, lockId });
    return data;
  } catch (error) {
    console.error('Error in releaseSessionLock:', error);
    return false;
  }
}

/**
 * Execute session operation with atomic transaction
 */
export async function executeSessionTransaction<T>(
  sessionId: string,
  operation: SessionTransaction['operation'],
  transactionFn: (session: QuizSession, lockId: string) => Promise<T>,
  retryAttempts: number = MAX_RETRY_ATTEMPTS
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    const lockId = await acquireSessionLock(sessionId, operation);
    
    if (!lockId) {
      if (attempt === retryAttempts) {
        throw new Error(`Failed to acquire session lock after ${retryAttempts} attempts`);
      }
      
      console.warn(`⚠️ [SESSION] Lock acquisition failed, retrying... (${attempt}/${retryAttempts})`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
      continue;
    }

    try {
      // Get current session state
      const session = await getSessionWithLock(sessionId, lockId);
      if (!session) {
        throw new Error('Session not found or lock invalid');
      }

      // Execute transaction
      const result = await transactionFn(session, lockId);

      console.log(`✅ [SESSION] Transaction completed:`, {
        sessionId,
        operation,
        attempt
      });

      return result;
    } catch (error) {
      lastError = error as Error;
      console.error(`❌ [SESSION] Transaction failed:`, {
        sessionId,
        operation,
        attempt,
        error: lastError.message
      });

      if (attempt === retryAttempts) {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
    } finally {
      // Always release lock
      await releaseSessionLock(sessionId, lockId);
    }
  }

  throw lastError!;
}

/**
 * Get session with lock validation
 */
async function getSessionWithLock(
  sessionId: string,
  lockId: string
): Promise<QuizSession | null> {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    return null;
  }

  // Validate lock
  const { data: lockData, error: lockError } = await supabase
    .from('session_locks')
    .select('*')
    .eq('session_id', sessionId)
    .eq('lock_id', lockId)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (lockError || !lockData) {
    throw new Error('Invalid or expired lock');
  }

  return data as QuizSession;
}

/**
 * Update session state atomically
 */
export async function updateSessionState(
  sessionId: string,
  updates: Partial<QuizSession>,
  lockId: string
): Promise<QuizSession> {
  // Increment lock version for optimistic locking
  const updatesWithVersion = {
    ...updates,
    lock_version: supabase.rpc('increment_lock_version', { session_id: sessionId }),
    last_activity_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('quiz_sessions')
    .update(updatesWithVersion)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update session: ${error.message}`);
  }

  return data as QuizSession;
}

/**
 * Answer question with atomic session update
 */
export async function answerQuestion(
  sessionId: string,
  questionId: string,
  answer: any,
  isCorrect: boolean,
  timeSpent: number
): Promise<QuizSession> {
  return executeSessionTransaction(
    sessionId,
    'answer_question',
    async (session, lockId) => {
      // Validate question order
      const { data: quiz, error: quizError } = await supabase
        .from('quizzes')
        .select('questions')
        .eq('id', session.quiz_id)
        .single();

      if (quizError || !quiz) {
        throw new Error('Quiz not found');
      }

      const questions = quiz.questions as any[];
      const currentQuestion = questions[session.current_question_index];

      if (!currentQuestion || currentQuestion.id !== questionId) {
        throw new Error('Invalid question sequence');
      }

      // Update session with answer
      const newAnswers = { ...session.answers };
      newAnswers[questionId] = {
        answer,
        is_correct: isCorrect,
        time_spent: timeSpent,
        answered_at: new Date().toISOString()
      };

      const newScore = isCorrect ? session.score + (currentQuestion.points || 1) : session.score;
      const newQuestionIndex = session.current_question_index + 1;

      // Update metadata
      const metadata = session.metadata || {
        time_spent: 0,
        question_times: {},
        engagement_score: 0,
        difficulty_adjustments: []
      };

      metadata.time_spent += timeSpent;
      metadata.question_times[questionId] = timeSpent;
      metadata.engagement_score = calculateEngagementScore(newAnswers, metadata.time_spent);

      const updates: Partial<QuizSession> = {
        answers: newAnswers,
        score: newScore,
        current_question_index: newQuestionIndex,
        metadata,
        status: newQuestionIndex >= questions.length ? 'completed' : 'active',
        completed_at: newQuestionIndex >= questions.length ? new Date().toISOString() : undefined
      };

      return updateSessionState(sessionId, updates, lockId);
    }
  );
}

/**
 * Calculate engagement score based on answers and time
 */
function calculateEngagementScore(
  answers: Record<string, any>,
  totalTimeSpent: number
): number {
  const answerCount = Object.keys(answers).length;
  if (answerCount === 0) return 0;

  const avgTimePerQuestion = totalTimeSpent / answerCount;
  const correctAnswers = Object.values(answers).filter(a => a.is_correct).length;
  const accuracy = correctAnswers / answerCount;

  // Score based on engagement factors
  let score = 0;
  
  // Time engagement (optimal range: 10-60 seconds per question)
  if (avgTimePerQuestion >= 10000 && avgTimePerQuestion <= 60000) {
    score += 40;
  } else if (avgTimePerQuestion < 10000) {
    score += 20; // Too fast, less engaged
  } else {
    score += 30; // Too slow, but still engaged
  }

  // Accuracy engagement
  score += accuracy * 40;

  // Completion engagement
  score += Math.min(answerCount * 2, 20);

  return Math.round(Math.min(score, 100));
}

/**
 * Get session with consistency check
 */
export async function getSession(sessionId: string): Promise<QuizSession | null> {
  const { data, error } = await supabase
    .from('quiz_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error || !data) {
    return null;
  }

  return data as QuizSession;
}

/**
 * Create new quiz session
 */
export async function createQuizSession(
  userId: string,
  phoneNumber: string,
  quizId: string
): Promise<QuizSession> {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newSession: Partial<QuizSession> = {
    id: sessionId,
    user_id: userId,
    phone_number: phoneNumber,
    quiz_id: quizId,
    current_question_index: 0,
    answers: {},
    score: 0,
    status: 'active',
    started_at: now,
    last_activity_at: now,
    metadata: {
      time_spent: 0,
      question_times: {},
      engagement_score: 0,
      difficulty_adjustments: []
    },
    lock_version: 1
  };

  const { data, error } = await supabase
    .from('quiz_sessions')
    .insert(newSession)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create quiz session: ${error.message}`);
  }

  console.log(`🎯 [SESSION] New quiz session created:`, {
    sessionId,
    userId,
    quizId
  });

  return data as QuizSession;
}

/**
 * Abandon session (mark as abandoned)
 */
export async function abandonSession(sessionId: string): Promise<void> {
  await executeSessionTransaction(
    sessionId,
    'complete_quiz',
    async (session, lockId) => {
      if (session.status === 'completed') {
        return session; // Already completed
      }

      const updates: Partial<QuizSession> = {
        status: 'abandoned',
        completed_at: new Date().toISOString()
      };

      return updateSessionState(sessionId, updates, lockId);
    }
  );
}

/**
 * Clean up expired locks
 */
export async function cleanupExpiredLocks(): Promise<void> {
  try {
    const { error } = await supabase
      .from('session_locks')
      .delete()
      .lt('expires_at', new Date().toISOString());

    if (error) {
      console.error('Error cleaning up expired locks:', error);
    } else {
      console.log('✅ [SESSION] Cleaned up expired locks');
    }
  } catch (error) {
    console.error('Error in cleanupExpiredLocks:', error);
  }
}

/**
 * Get session statistics
 */
export async function getSessionStatistics(
  userId: string,
  days: number = 30
): Promise<{
  total_sessions: number;
  completed_sessions: number;
  abandoned_sessions: number;
  avg_completion_time: number;
  avg_score: number;
  completion_rate: number;
}> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data: sessions, error } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('started_at', startDate.toISOString());

    if (error || !sessions) {
      return {
        total_sessions: 0,
        completed_sessions: 0,
        abandoned_sessions: 0,
        avg_completion_time: 0,
        avg_score: 0,
        completion_rate: 0
      };
    }

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const abandonedSessions = sessions.filter(s => s.status === 'abandoned');

    const avgCompletionTime = completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => {
          const startTime = new Date(s.started_at).getTime();
          const endTime = new Date(s.completed_at!).getTime();
          return sum + (endTime - startTime);
        }, 0) / completedSessions.length
      : 0;

    const avgScore = completedSessions.length > 0
      ? completedSessions.reduce((sum, s) => sum + s.score, 0) / completedSessions.length
      : 0;

    const completionRate = totalSessions > 0
      ? (completedSessions.length / totalSessions) * 100
      : 0;

    return {
      total_sessions: totalSessions,
      completed_sessions: completedSessions.length,
      abandoned_sessions: abandonedSessions.length,
      avg_completion_time: Math.round(avgCompletionTime / 1000), // Convert to seconds
      avg_score: Math.round(avgScore * 100) / 100,
      completion_rate: Math.round(completionRate * 100) / 100
    };
  } catch (error) {
    console.error('Error getting session statistics:', error);
    return {
      total_sessions: 0,
      completed_sessions: 0,
      abandoned_sessions: 0,
      avg_completion_time: 0,
      avg_score: 0,
      completion_rate: 0
    };
  }
}

// Auto-cleanup expired locks every 5 minutes
setInterval(cleanupExpiredLocks, 5 * 60 * 1000);