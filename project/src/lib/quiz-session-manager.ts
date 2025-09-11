import { supabase } from './supabase';

export interface QuizSession {
  id: string;
  user_id: string;
  phone_number?: string;
  web_user_id?: string;
  session_id?: string;
  source: 'whatsapp' | 'web';
  start_time: string;
  end_time?: string;
  duration_seconds?: number;
  questions_answered: number;
  questions_skipped: number;
  current_question_index: number;
  engagement_score: number;
  completion_status: 'active' | 'completed' | 'abandoned' | 'interrupted';
  country?: string;
  user_agent?: string;
  created_at: string;
  updated_at: string;
}

export interface QuestionEngagement {
  id: string;
  session_id: string;
  question_id: string;
  question_index: number;
  time_spent_seconds: number;
  attempts: number;
  skipped: boolean;
  answered_at?: string;
  created_at: string;
}

/**
 * Start a new quiz session with comprehensive tracking
 */
export async function startQuizSession(
  userId: string,
  phoneNumber?: string,
  webUserId?: string,
  sessionId?: string,
  source: 'whatsapp' | 'web' = 'whatsapp',
  country?: string,
  userAgent?: string
): Promise<QuizSession> {
  try {
    const sessionData = {
      user_id: userId,
      phone_number: phoneNumber,
      web_user_id: webUserId,
      session_id: sessionId,
      source,
      start_time: new Date().toISOString(),
      questions_answered: 0,
      questions_skipped: 0,
      current_question_index: 0,
      engagement_score: 0,
      completion_status: 'active' as const,
      country,
      user_agent: userAgent,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: session, error } = await supabase
      .from('quiz_sessions')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create quiz session: ${error.message}`);
    }

    console.log('✅ [QUIZ-SESSION] New session started:', {
      sessionId: session.id,
      userId,
      source,
      country
    });

    return session;
  } catch (error) {
    console.error('❌ [QUIZ-SESSION] Error starting session:', error);
    throw error;
  }
}

/**
 * Update quiz session with progress and engagement data
 */
export async function updateQuizSession(
  sessionId: string,
  updates: Partial<QuizSession>
): Promise<void> {
  try {
    const updateData = {
      ...updates,
      updated_at: new Date().toISOString()
    };

    // Calculate duration if ending session
    if (updates.end_time && !updates.duration_seconds) {
      const { data: session } = await supabase
        .from('quiz_sessions')
        .select('start_time')
        .eq('id', sessionId)
        .single();

      if (session) {
        const startTime = new Date(session.start_time);
        const endTime = new Date(updates.end_time);
        updateData.duration_seconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      }
    }

    const { error } = await supabase
      .from('quiz_sessions')
      .update(updateData)
      .eq('id', sessionId);

    if (error) {
      throw new Error(`Failed to update quiz session: ${error.message}`);
    }

    console.log('✅ [QUIZ-SESSION] Session updated:', { sessionId, updates: Object.keys(updates) });
  } catch (error) {
    console.error('❌ [QUIZ-SESSION] Error updating session:', error);
    throw error;
  }
}

/**
 * End a quiz session and calculate final metrics
 */
export async function endQuizSession(
  sessionId: string,
  completionStatus: 'completed' | 'abandoned' | 'interrupted' = 'completed'
): Promise<void> {
  try {
    const endTime = new Date().toISOString();
    
    // Get session data to calculate final metrics
    const { data: session, error: sessionError } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      throw new Error('Session not found');
    }

    // Calculate engagement score based on completion and time spent
    let engagementScore = 0;
    if (session.questions_answered > 0) {
      const completionRate = session.questions_answered / (session.questions_answered + session.questions_skipped);
      const timeScore = session.duration_seconds ? Math.min(session.duration_seconds / 300, 1) : 0; // Max 5 minutes
      engagementScore = (completionRate * 0.7 + timeScore * 0.3) * 100;
    }

    await updateQuizSession(sessionId, {
      end_time: endTime,
      completion_status: completionStatus,
      engagement_score: Math.round(engagementScore)
    });

    console.log('✅ [QUIZ-SESSION] Session ended:', {
      sessionId,
      completionStatus,
      engagementScore: Math.round(engagementScore)
    });
  } catch (error) {
    console.error('❌ [QUIZ-SESSION] Error ending session:', error);
    throw error;
  }
}

/**
 * Track question engagement metrics
 */
export async function trackQuestionEngagement(
  sessionId: string,
  questionId: string,
  questionIndex: number,
  timeSpentSeconds: number,
  attempts: number = 1,
  skipped: boolean = false
): Promise<void> {
  try {
    const engagementData = {
      session_id: sessionId,
      question_id: questionId,
      question_index: questionIndex,
      time_spent_seconds: timeSpentSeconds,
      attempts,
      skipped,
      answered_at: skipped ? null : new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('question_engagement')
      .insert(engagementData);

    if (error) {
      throw new Error(`Failed to track question engagement: ${error.message}`);
    }

    console.log('✅ [QUIZ-SESSION] Question engagement tracked:', {
      sessionId,
      questionIndex,
      timeSpentSeconds,
      skipped
    });
  } catch (error) {
    console.error('❌ [QUIZ-SESSION] Error tracking question engagement:', error);
    // Don't throw - this is analytics data and shouldn't break the main flow
  }
}

/**
 * Get session analytics for a user
 */
export async function getUserSessionAnalytics(userId: string): Promise<{
  totalSessions: number;
  completedSessions: number;
  averageDuration: number;
  averageEngagement: number;
  dropOffPoints: Array<{ questionIndex: number; dropOffRate: number }>;
}> {
  try {
    const { data: sessions, error } = await supabase
      .from('quiz_sessions')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to get user sessions: ${error.message}`);
    }

    if (!sessions || sessions.length === 0) {
      return {
        totalSessions: 0,
        completedSessions: 0,
        averageDuration: 0,
        averageEngagement: 0,
        dropOffPoints: []
      };
    }

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.completion_status === 'completed').length;
    const averageDuration = sessions
      .filter(s => s.duration_seconds)
      .reduce((sum, s) => sum + s.duration_seconds, 0) / Math.max(1, sessions.filter(s => s.duration_seconds).length);
    const averageEngagement = sessions
      .reduce((sum, s) => sum + (s.engagement_score || 0), 0) / totalSessions;

    // Calculate drop-off points
    const dropOffPoints = await calculateDropOffPoints(sessions);

    return {
      totalSessions,
      completedSessions,
      averageDuration,
      averageEngagement,
      dropOffPoints
    };
  } catch (error) {
    console.error('❌ [QUIZ-SESSION] Error getting user analytics:', error);
    throw error;
  }
}

/**
 * Calculate drop-off points across all sessions
 */
async function calculateDropOffPoints(sessions: QuizSession[]): Promise<Array<{ questionIndex: number; dropOffRate: number }>> {
  try {
    const questionDropOffs: Record<number, { started: number; completed: number }> = {};

    sessions.forEach(session => {
      for (let i = 0; i <= session.current_question_index; i++) {
        if (!questionDropOffs[i]) {
          questionDropOffs[i] = { started: 0, completed: 0 };
        }
        questionDropOffs[i].started++;
        
        if (i < session.current_question_index || session.completion_status === 'completed') {
          questionDropOffs[i].completed++;
        }
      }
    });

    return Object.entries(questionDropOffs)
      .map(([index, data]) => ({
        questionIndex: parseInt(index),
        dropOffRate: data.started > 0 ? ((data.started - data.completed) / data.started) * 100 : 0
      }))
      .filter(point => point.dropOffRate > 0)
      .sort((a, b) => b.dropOffRate - a.dropOffRate);
  } catch (error) {
    console.error('❌ [QUIZ-SESSION] Error calculating drop-off points:', error);
    return [];
  }
}

/**
 * Recover interrupted session
 */
export async function recoverInterruptedSession(
  userId: string,
  phoneNumber?: string,
  webUserId?: string
): Promise<QuizSession | null> {
  try {
    let query = supabase
      .from('quiz_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('completion_status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (phoneNumber) {
      query = query.eq('phone_number', phoneNumber);
    } else if (webUserId) {
      query = query.eq('web_user_id', webUserId);
    }

    const { data: session, error } = await query.maybeSingle();

    if (error) {
      throw new Error(`Failed to recover session: ${error.message}`);
    }

    if (session) {
      console.log('🔄 [QUIZ-SESSION] Recovered interrupted session:', {
        sessionId: session.id,
        currentQuestion: session.current_question_index
      });
    }

    return session;
  } catch (error) {
    console.error('❌ [QUIZ-SESSION] Error recovering session:', error);
    return null;
  }
}