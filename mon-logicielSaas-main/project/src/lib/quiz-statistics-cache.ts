import { supabase } from './supabase';

export interface CachedStatistics {
  id: string;
  metric_name: string;
  metric_value: number;
  metadata?: any;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface QuizMetrics {
  totalParticipants: number;
  profileBreakdown: { discovery: number; active: number; vip: number };
  averageScore: number;
  completionRate: number;
  accuracyRate: number;
  averageTimePerQuestion: number;
  dropOffRate: number;
  countryDistribution: Record<string, number>;
  engagementMetrics: {
    averageSessionDuration: number;
    questionsPerSession: number;
    returnRate: number;
  };
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds
const CACHE_KEYS = {
  QUIZ_OVERVIEW: 'quiz_overview_stats',
  PROFILE_BREAKDOWN: 'quiz_profile_breakdown',
  ENGAGEMENT_METRICS: 'quiz_engagement_metrics',
  COUNTRY_DISTRIBUTION: 'quiz_country_distribution',
  ACCURACY_METRICS: 'quiz_accuracy_metrics'
};

/**
 * Get cached statistics or calculate if expired
 */
export async function getCachedQuizStatistics(): Promise<QuizMetrics> {
  try {
    // Check if we have valid cached data
    const cachedData = await getCachedMetrics(Object.values(CACHE_KEYS));
    
    if (cachedData.length === Object.values(CACHE_KEYS).length) {
      console.log('✅ [QUIZ-CACHE] Using cached statistics');
      return buildMetricsFromCache(cachedData);
    }

    console.log('🔄 [QUIZ-CACHE] Cache miss or expired, recalculating statistics');
    return await recalculateAndCacheStatistics();
  } catch (error) {
    console.error('❌ [QUIZ-CACHE] Error getting cached statistics:', error);
    // Fallback to direct calculation
    return await calculateQuizStatisticsDirectly();
  }
}

/**
 * Get cached metrics that haven't expired
 */
async function getCachedMetrics(metricNames: string[]): Promise<CachedStatistics[]> {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('quiz_statistics_cache')
    .select('*')
    .in('metric_name', metricNames)
    .gt('expires_at', now);

  if (error) {
    console.error('Error fetching cached metrics:', error);
    return [];
  }

  return data || [];
}

/**
 * Recalculate statistics and update cache
 */
export async function recalculateAndCacheStatistics(): Promise<QuizMetrics> {
  try {
    console.log('📊 [QUIZ-CACHE] Starting statistics recalculation');
    
    // Calculate all metrics
    const [
      overviewStats,
      profileBreakdown,
      engagementMetrics,
      countryDistribution,
      accuracyMetrics
    ] = await Promise.all([
      calculateOverviewStatistics(),
      calculateProfileBreakdown(),
      calculateEngagementMetrics(),
      calculateCountryDistribution(),
      calculateAccuracyMetrics()
    ]);

    // Cache the results
    const expiresAt = new Date(Date.now() + CACHE_DURATION).toISOString();
    const cacheEntries = [
      {
        metric_name: CACHE_KEYS.QUIZ_OVERVIEW,
        metric_value: overviewStats.totalParticipants,
        metadata: overviewStats,
        expires_at: expiresAt
      },
      {
        metric_name: CACHE_KEYS.PROFILE_BREAKDOWN,
        metric_value: profileBreakdown.discovery + profileBreakdown.active + profileBreakdown.vip,
        metadata: profileBreakdown,
        expires_at: expiresAt
      },
      {
        metric_name: CACHE_KEYS.ENGAGEMENT_METRICS,
        metric_value: engagementMetrics.averageSessionDuration,
        metadata: engagementMetrics,
        expires_at: expiresAt
      },
      {
        metric_name: CACHE_KEYS.COUNTRY_DISTRIBUTION,
        metric_value: Object.keys(countryDistribution).length,
        metadata: countryDistribution,
        expires_at: expiresAt
      },
      {
        metric_name: CACHE_KEYS.ACCURACY_METRICS,
        metric_value: accuracyMetrics.accuracyRate,
        metadata: accuracyMetrics,
        expires_at: expiresAt
      }
    ];

    // Upsert cache entries
    const { error } = await supabase
      .from('quiz_statistics_cache')
      .upsert(cacheEntries, { onConflict: 'metric_name' });

    if (error) {
      console.error('Error caching statistics:', error);
    } else {
      console.log('✅ [QUIZ-CACHE] Statistics cached successfully');
    }

    return {
      totalParticipants: overviewStats.totalParticipants,
      profileBreakdown,
      averageScore: overviewStats.averageScore,
      completionRate: overviewStats.completionRate,
      accuracyRate: accuracyMetrics.accuracyRate,
      averageTimePerQuestion: accuracyMetrics.averageTimePerQuestion,
      dropOffRate: accuracyMetrics.dropOffRate,
      countryDistribution,
      engagementMetrics
    };
  } catch (error) {
    console.error('❌ [QUIZ-CACHE] Error recalculating statistics:', error);
    throw error;
  }
}

/**
 * Calculate overview statistics
 */
async function calculateOverviewStatistics(): Promise<{
  totalParticipants: number;
  averageScore: number;
  completionRate: number;
}> {
  const { data: users, error } = await supabase
    .from('quiz_users')
    .select('score, status');

  if (error) {
    throw new Error(`Failed to get quiz users: ${error.message}`);
  }

  const totalParticipants = users?.length || 0;
  const averageScore = totalParticipants > 0
    ? users!.reduce((sum, user) => sum + user.score, 0) / totalParticipants
    : 0;

  const completedUsers = users?.filter(u => u.status === 'completed').length || 0;
  const completionRate = totalParticipants > 0 ? (completedUsers / totalParticipants) * 100 : 0;

  return {
    totalParticipants,
    averageScore,
    completionRate
  };
}

/**
 * Calculate profile breakdown
 */
async function calculateProfileBreakdown(): Promise<{ discovery: number; active: number; vip: number }> {
  const { data: users, error } = await supabase
    .from('quiz_users')
    .select('profile');

  if (error) {
    throw new Error(`Failed to get user profiles: ${error.message}`);
  }

  return {
    discovery: users?.filter(u => u.profile === 'discovery').length || 0,
    active: users?.filter(u => u.profile === 'active').length || 0,
    vip: users?.filter(u => u.profile === 'vip').length || 0
  };
}

/**
 * Calculate engagement metrics from sessions
 */
async function calculateEngagementMetrics(): Promise<{
  averageSessionDuration: number;
  questionsPerSession: number;
  returnRate: number;
}> {
  const { data: sessions, error } = await supabase
    .from('quiz_sessions')
    .select('duration_seconds, questions_answered, user_id');

  if (error) {
    console.warn('Quiz sessions table not available, using fallback metrics');
    return {
      averageSessionDuration: 0,
      questionsPerSession: 0,
      returnRate: 0
    };
  }

  const validSessions = sessions?.filter(s => s.duration_seconds > 0) || [];
  const averageSessionDuration = validSessions.length > 0
    ? validSessions.reduce((sum, s) => sum + s.duration_seconds, 0) / validSessions.length
    : 0;

  const questionsPerSession = sessions?.length > 0
    ? sessions.reduce((sum, s) => sum + (s.questions_answered || 0), 0) / sessions.length
    : 0;

  // Calculate return rate (users with multiple sessions)
  const userSessionCounts = sessions?.reduce((acc: Record<string, number>, session) => {
    acc[session.user_id] = (acc[session.user_id] || 0) + 1;
    return acc;
  }, {}) || {};

  const usersWithMultipleSessions = Object.values(userSessionCounts).filter(count => count > 1).length;
  const totalUsers = Object.keys(userSessionCounts).length;
  const returnRate = totalUsers > 0 ? (usersWithMultipleSessions / totalUsers) * 100 : 0;

  return {
    averageSessionDuration,
    questionsPerSession,
    returnRate
  };
}

/**
 * Calculate country distribution
 */
async function calculateCountryDistribution(): Promise<Record<string, number>> {
  const { data: sessions, error } = await supabase
    .from('quiz_sessions')
    .select('country');

  if (error) {
    console.warn('Quiz sessions table not available for country distribution');
    return {};
  }

  const distribution: Record<string, number> = {};
  sessions?.forEach(session => {
    if (session.country) {
      distribution[session.country] = (distribution[session.country] || 0) + 1;
    }
  });

  return distribution;
}

/**
 * Calculate accuracy metrics (only for quiz-type questions)
 */
async function calculateAccuracyMetrics(): Promise<{
  accuracyRate: number;
  averageTimePerQuestion: number;
  dropOffRate: number;
}> {
  // Get quiz-type answers only
  const { data: answers, error: answersError } = await supabase
    .from('quiz_answers')
    .select(`
      points_awarded,
      created_at,
      quiz_questions!inner(type)
    `)
    .eq('quiz_questions.type', 'quiz');

  if (answersError) {
    console.warn('Error getting quiz answers for accuracy calculation:', answersError);
    return { accuracyRate: 0, averageTimePerQuestion: 0, dropOffRate: 0 };
  }

  const quizAnswers = answers || [];
  const totalQuizAnswers = quizAnswers.length;
  const correctAnswers = quizAnswers.filter(a => a.points_awarded > 0).length;
  const accuracyRate = totalQuizAnswers > 0 ? (correctAnswers / totalQuizAnswers) * 100 : 0;

  // Get engagement data for time per question
  const { data: engagements, error: engagementError } = await supabase
    .from('question_engagement')
    .select('time_spent_seconds');

  const averageTimePerQuestion = engagements?.length > 0
    ? engagements.reduce((sum, e) => sum + (e.time_spent_seconds || 0), 0) / engagements.length
    : 0;

  // Calculate drop-off rate from sessions
  const { data: sessions, error: sessionsError } = await supabase
    .from('quiz_sessions')
    .select('completion_status');

  const abandonedSessions = sessions?.filter(s => s.completion_status === 'abandoned').length || 0;
  const totalSessions = sessions?.length || 0;
  const dropOffRate = totalSessions > 0 ? (abandonedSessions / totalSessions) * 100 : 0;

  return {
    accuracyRate,
    averageTimePerQuestion,
    dropOffRate
  };
}

/**
 * Build metrics object from cached data
 */
function buildMetricsFromCache(cachedData: CachedStatistics[]): QuizMetrics {
  const metricsMap = new Map(cachedData.map(item => [item.metric_name, item]));
  
  const overviewCache = metricsMap.get(CACHE_KEYS.QUIZ_OVERVIEW);
  const profileCache = metricsMap.get(CACHE_KEYS.PROFILE_BREAKDOWN);
  const engagementCache = metricsMap.get(CACHE_KEYS.ENGAGEMENT_METRICS);
  const countryCache = metricsMap.get(CACHE_KEYS.COUNTRY_DISTRIBUTION);
  const accuracyCache = metricsMap.get(CACHE_KEYS.ACCURACY_METRICS);

  return {
    totalParticipants: overviewCache?.metadata?.totalParticipants || 0,
    profileBreakdown: profileCache?.metadata || { discovery: 0, active: 0, vip: 0 },
    averageScore: overviewCache?.metadata?.averageScore || 0,
    completionRate: overviewCache?.metadata?.completionRate || 0,
    accuracyRate: accuracyCache?.metadata?.accuracyRate || 0,
    averageTimePerQuestion: accuracyCache?.metadata?.averageTimePerQuestion || 0,
    dropOffRate: accuracyCache?.metadata?.dropOffRate || 0,
    countryDistribution: countryCache?.metadata || {},
    engagementMetrics: engagementCache?.metadata || {
      averageSessionDuration: 0,
      questionsPerSession: 0,
      returnRate: 0
    }
  };
}

/**
 * Direct calculation without caching (fallback)
 */
async function calculateQuizStatisticsDirectly(): Promise<QuizMetrics> {
  console.log('📊 [QUIZ-CACHE] Calculating statistics directly (no cache)');
  
  const [
    overviewStats,
    profileBreakdown,
    engagementMetrics,
    countryDistribution,
    accuracyMetrics
  ] = await Promise.all([
    calculateOverviewStatistics(),
    calculateProfileBreakdown(),
    calculateEngagementMetrics(),
    calculateCountryDistribution(),
    calculateAccuracyMetrics()
  ]);

  return {
    totalParticipants: overviewStats.totalParticipants,
    profileBreakdown,
    averageScore: overviewStats.averageScore,
    completionRate: overviewStats.completionRate,
    accuracyRate: accuracyMetrics.accuracyRate,
    averageTimePerQuestion: accuracyMetrics.averageTimePerQuestion,
    dropOffRate: accuracyMetrics.dropOffRate,
    countryDistribution,
    engagementMetrics
  };
}

/**
 * Invalidate specific cache entries
 */
export async function invalidateQuizCache(metricNames?: string[]): Promise<void> {
  try {
    const namesToInvalidate = metricNames || Object.values(CACHE_KEYS);
    
    const { error } = await supabase
      .from('quiz_statistics_cache')
      .delete()
      .in('metric_name', namesToInvalidate);

    if (error) {
      console.error('Error invalidating cache:', error);
    } else {
      console.log('✅ [QUIZ-CACHE] Cache invalidated for:', namesToInvalidate);
    }
  } catch (error) {
    console.error('❌ [QUIZ-CACHE] Error invalidating cache:', error);
  }
}

/**
 * Incrementally update specific metrics
 */
export async function updateMetricIncremental(
  metricName: string,
  increment: number,
  metadata?: any
): Promise<void> {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('quiz_statistics_cache')
      .select('*')
      .eq('metric_name', metricName)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching existing metric:', fetchError);
      return;
    }

    const expiresAt = new Date(Date.now() + CACHE_DURATION).toISOString();

    if (existing) {
      // Update existing metric
      const { error: updateError } = await supabase
        .from('quiz_statistics_cache')
        .update({
          metric_value: existing.metric_value + increment,
          metadata: metadata || existing.metadata,
          expires_at: expiresAt,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Error updating metric incrementally:', updateError);
      }
    } else {
      // Create new metric
      const { error: insertError } = await supabase
        .from('quiz_statistics_cache')
        .insert({
          metric_name: metricName,
          metric_value: increment,
          metadata,
          expires_at: expiresAt,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('Error creating new metric:', insertError);
      }
    }

    console.log('✅ [QUIZ-CACHE] Metric updated incrementally:', { metricName, increment });
  } catch (error) {
    console.error('❌ [QUIZ-CACHE] Error updating metric incrementally:', error);
  }
}

/**
 * Clean up expired cache entries
 */
export async function cleanupExpiredCache(): Promise<void> {
  try {
    const now = new Date().toISOString();
    
    const { error } = await supabase
      .from('quiz_statistics_cache')
      .delete()
      .lt('expires_at', now);

    if (error) {
      console.error('Error cleaning up expired cache:', error);
    } else {
      console.log('✅ [QUIZ-CACHE] Expired cache entries cleaned up');
    }
  } catch (error) {
    console.error('❌ [QUIZ-CACHE] Error cleaning up cache:', error);
  }
}