import React, { useState, useEffect } from 'react';
import { MessageSquare, Bot, Settings, RefreshCw, AlertCircle, Plus, X, Save, Play, Pause, Database, BarChart2, Trash2, AlertTriangle, Calendar, Clock, Users, CheckCircle, Target, Send, Trophy, Edit } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendQuizToNumbers, exportQuizResults, getQuestionTypeLabel } from '../lib/quiz-marketing';
import { getEnhancedQuizStatistics, getQuizParticipants } from '../lib/quiz-chatbot';
import { getProfileColor, getStatusColor } from '../utils/colors';
import BackButton from '../components/BackButton';
import QuizMarketingManager from '../components/QuizMarketingManager';
import ChatbotHealthMonitor from '../components/ChatbotHealthMonitor';
import { subscribeToModuleUpdates, recalculateQuizAnalytics } from '../lib/chatbot-communication';
import { invalidateQuizCache } from '../lib/quiz-statistics-cache';

interface QuizUser {
  id: number;
  phone_number: string;
  web_user_id?: string;
  name?: string;
  email?: string;
  address?: string;
  profession?: string;
  country?: string;
  preferences?: any;
  score: number;
  profile: string;
  current_step: number;
  status: 'active' | 'ended' | 'completed';
  engagement_level?: 'low' | 'medium' | 'high';
  total_sessions?: number;
  last_session_at?: string;
  created_at: string;
  updated_at: string;
}

interface QuizQuestion {
  id: number;
  text: string;
  type: 'personal' | 'preference' | 'quiz' | 'product_test';
  options?: any;
  points?: any;
  required: boolean;
  order_index: number;
  category?: string;
  conditional_logic?: any;
  created_at: string;
}

interface QuizStats {
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

const Quiz = () => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [users, setUsers] = useState<QuizUser[]>([]);
  const [stats, setStats] = useState<QuizStats>({
    totalParticipants: 0,
    profileBreakdown: { discovery: 0, active: 0, vip: 0 },
    averageScore: 0,
    completionRate: 0,
    accuracyRate: 0,
    averageTimePerQuestion: 0,
    dropOffRate: 0,
    countryDistribution: {},
    engagementMetrics: {
      averageSessionDuration: 0,
      questionsPerSession: 0,
      returnRate: 0
    }
  });
  const [showManager, setShowManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filters, setFilters] = useState({
    profile: '',
    status: '',
    country: '',
    search: ''
  });

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([
        loadQuestions(),
        loadUsers(currentPage),
        loadStats()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Impossible de charger les données du quiz. Veuillez actualiser la page.');
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('quiz_questions')
        .select('*')
        .order('order_index', { ascending: true });

      if (error) throw error;
      setQuestions(data || []);
    } catch (error) {
      console.error('Error fetching questions:', error);
      throw new Error('Erreur lors du chargement des questions');
    }
  };

  const loadUsers = async () => {
    try {
      const result = await getQuizParticipants(currentPage, 20, {
        profile: filters.profile || undefined,
        status: filters.status || undefined,
        country: filters.country || undefined,
        search: filters.search || undefined
      });

      setUsers(result.participants);
      setTotalPages(result.totalPages);
    } catch (error) {
      console.error('Error fetching users:', error);
      throw new Error('Erreur lors du chargement des participants');
    }
  };

  const loadStats = async () => {
    try {
      const statsData = await getEnhancedQuizStatistics();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading stats:', error);
      throw new Error('Erreur lors du chargement des statistiques');
    }
  };

  useEffect(() => {
    loadData();
    
    // Set up real-time subscriptions
    const questionsSubscription = supabase
      .channel('quiz_questions_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'quiz_questions' 
      }, () => {
        loadQuestions();
      })
      .subscribe();

    const usersSubscription = supabase
      .channel('quiz_users_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'quiz_users' 
      }, () => {
        loadUsers();
        loadStats();
      })
      .subscribe();

    const answersSubscription = supabase
      .channel('quiz_answers_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'quiz_answers' 
      }, () => {
        loadStats();
        // Invalidate cache instead of full recalculation
        invalidateQuizCache();
      })
      .subscribe();

    // Subscribe to quiz module updates
    const unsubscribeQuizUpdates = subscribeToModuleUpdates('quiz', (payload) => {
      console.log('Quiz module update received:', payload);
      if (payload.action === 'answer_submitted' || payload.action === 'quiz_completed') {
        loadUsers();
        loadStats();
      }
    });

    const unsubscribeAnalyticsUpdates = subscribeToModuleUpdates('quiz_analytics', (payload) => {
      console.log('Quiz analytics update received:', payload);
      if (payload.action === 'analytics_updated') {
        setStats(payload.analytics);
      }
    });

    return () => {
      questionsSubscription.unsubscribe();
      usersSubscription.unsubscribe();
      answersSubscription.unsubscribe();
      unsubscribeQuizUpdates();
      unsubscribeAnalyticsUpdates();
    };
  }, [currentPage, filters]);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const handleFilterChange = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 bg-gray-50">
          <BackButton />
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Chargement du module Quiz...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-gray-50">
        <BackButton />
      </div>
      
      <div className="flex-1 flex flex-col">
        <div className="p-6 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="w-8 h-8 text-red-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Quiz Marketing WhatsApp</h1>
                <p className="text-sm text-gray-500">Système de quiz intelligent avec gestion de sessions persistantes</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowManager(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <BarChart2 className="w-4 h-4" />
                Configuration & Analytics
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {success && (
          <div className="mx-6 mt-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {/* Statistics Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 p-6">
          {/* Health Monitor */}
          <div className="md:col-span-4 mb-6">
            <ChatbotHealthMonitor />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-blue-600" />
              <h3 className="font-medium text-gray-900">Total Participants</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{stats.totalParticipants}</p>
            <p className="text-sm text-gray-500 mt-1">Utilisateurs uniques</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <Trophy className="w-5 h-5 text-yellow-600" />
              <h3 className="font-medium text-gray-900">Score Moyen</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{stats.averageScore.toFixed(1)}</p>
            <p className="text-sm text-gray-500 mt-1">Points par participant</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <Target className="w-5 h-5 text-green-600" />
              <h3 className="font-medium text-gray-900">Taux de Complétion</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{stats.completionRate.toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">Quiz terminés</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <BarChart2 className="w-5 h-5 text-purple-600" />
              <h3 className="font-medium text-gray-900">Taux de Précision</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{stats.accuracyRate.toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">Réponses correctes</p>
          </div>
        </div>

        {/* Enhanced Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <h3 className="font-medium text-gray-900">Temps Moyen/Question</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{stats.averageTimePerQuestion.toFixed(1)}s</p>
            <p className="text-sm text-gray-500 mt-1">Engagement utilisateur</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <h3 className="font-medium text-gray-900">Taux d'Abandon</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{stats.dropOffRate.toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">Sessions abandonnées</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <RefreshCw className="w-5 h-5 text-green-600" />
              <h3 className="font-medium text-gray-900">Taux de Retour</h3>
            </div>
            <p className="text-2xl font-semibold text-gray-900">{stats.engagementMetrics.returnRate.toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">Utilisateurs récurrents</p>
          </div>
        </div>

        {/* Profile Breakdown */}
        <div className="mx-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Répartition des Profils Marketing</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-3xl font-bold text-blue-600 mb-2">{stats.profileBreakdown.discovery}</div>
                <div className="text-sm font-medium text-blue-800">DISCOVERY</div>
                <div className="text-xs text-blue-600 mt-1">Nouveaux prospects</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-3xl font-bold text-green-600 mb-2">{stats.profileBreakdown.active}</div>
                <div className="text-sm font-medium text-green-800">ACTIVE</div>
                <div className="text-xs text-green-600 mt-1">Clients engagés</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-3xl font-bold text-purple-600 mb-2">{stats.profileBreakdown.vip}</div>
                <div className="text-sm font-medium text-purple-800">VIP</div>
                <div className="text-xs text-purple-600 mt-1">Clients premium</div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Participants */}
        <div className="flex-1 p-6">
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Participants Récents</h3>
                <div className="flex items-center gap-4">
                  {/* Filters */}
                  <div className="flex items-center gap-2">
                    <select
                      value={filters.profile}
                      onChange={(e) => handleFilterChange({ ...filters, profile: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="">Tous profils</option>
                      <option value="discovery">Discovery</option>
                      <option value="active">Active</option>
                      <option value="vip">VIP</option>
                    </select>
                    
                    <select
                      value={filters.status}
                      onChange={(e) => handleFilterChange({ ...filters, status: e.target.value })}
                      className="text-sm border border-gray-300 rounded px-2 py-1"
                    >
                      <option value="">Tous statuts</option>
                      <option value="active">Actif</option>
                      <option value="completed">Terminé</option>
                      <option value="ended">Arrêté</option>
                    </select>
                  </div>
                  
                  <button
                    onClick={loadData}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Actualiser
                  </button>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-200">
              {users.length === 0 ? (
                <div className="p-6 text-center text-gray-500">
                  <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>Aucun participant pour le moment</p>
                  <p className="text-sm mt-1">Les participants apparaîtront ici après avoir commencé le quiz</p>
                </div>
              ) : (
                users.slice(0, 10).map((user) => (
                  <div key={user.id} className="p-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                            <Users className="w-5 h-5 text-gray-500" />
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {user.name || user.phone_number}
                          </p>
                          {user.name && (
                            <p className="text-sm text-gray-500 truncate">
                              {user.phone_number || user.web_user_id}
                            </p>
                          )}
                          {user.profession && (
                            <p className="text-xs text-gray-400">{user.profession}</p>
                          )}
                          {user.country && (
                            <p className="text-xs text-gray-400">📍 {user.country}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">{user.score} pts</p>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getProfileColor(user.profile)}`}>
                            {user.profile.toUpperCase()}
                          </span>
                          {user.engagement_level && (
                            <p className="text-xs text-gray-500 mt-1">
                              Engagement: {user.engagement_level}
                            </p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(user.status)}`}>
                            {user.status === 'completed' ? 'Terminé' :
                             user.status === 'active' ? 'En cours' : 'Arrêté'}
                          </span>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(user.created_at).toLocaleDateString()}
                          </p>
                          {user.total_sessions && user.total_sessions > 1 && (
                            <p className="text-xs text-blue-600 mt-1">
                              {user.total_sessions} sessions
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-500">
                  Page {currentPage} sur {totalPages}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage <= 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    Précédent
                  </button>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                  >
                    Suivant
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Quiz Manager Modal */}
      {showManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
          <div className="bg-white w-full h-full overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <BarChart2 className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Centre de Contrôle Quiz</h2>
                  <p className="text-sm text-gray-500">Configuration avancée et analyses marketing</p>
                </div>
              </div>
              <button 
                onClick={() => setShowManager(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="h-[calc(100vh-80px)] overflow-hidden">
              <QuizMarketingManager onClose={() => setShowManager(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Quiz;