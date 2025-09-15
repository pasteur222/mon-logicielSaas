import React, { useState, useEffect } from 'react';
import { Activity, Users, MessageSquare, Trophy, Clock, BarChart2, Calendar, CheckCircle, XCircle, Gauge, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import DashboardCharts from '../components/DashboardCharts';
import ChatbotHealthMonitor from '../components/ChatbotHealthMonitor';
import RealTimeSync from '../components/RealTimeSync';
import { subscribeToModuleUpdates } from '../lib/chatbot-communication';

interface DashboardStats {
  whatsapp: {
    totalMessages: number;
    deliveryRate: number;
    activeChats: number;
  };
  customerService: {
    totalTickets: number;
    responseTime: number;
    satisfactionRate: number;
    commonTopics: Array<{ topic: string; count: number }>;
  };
  quiz: {
    activeGames: number;
    totalParticipants: number;
    averageScore: number;
    completionRate: number;
    profileBreakdown: { discovery: number; active: number; vip: number };
  };
}

interface SubscriptionInfo {
  active: boolean;
  planType?: string;
  endDate?: string;
  daysRemaining?: number;
  messagesRemaining?: number;
}

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    whatsapp: { totalMessages: 0, deliveryRate: 0, activeChats: 0 },
    customerService: { totalTickets: 0, responseTime: 0, satisfactionRate: 0, commonTopics: [] },
    quiz: { activeGames: 0, totalParticipants: 0, averageScore: 0, completionRate: 0, profileBreakdown: { discovery: 0, active: 0, vip: 0 } }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionInfo>({ 
    active: true,
    planType: 'monthly',
    endDate: new Date(2099, 11, 31).toLocaleDateString(),
    daysRemaining: 9999,
    messagesRemaining: null
  });
  const [activeModule, setActiveModule] = useState<'whatsapp' | '' | 'customerService' | 'quiz'>('whatsapp');

  useEffect(() => {
    fetchDashboardStats();
    
    // Subscribe to real-time updates from all chatbot modules
    const unsubscribeConversations = subscribeToModuleUpdates('conversations', (payload) => {
      console.log('Dashboard received conversations update:', payload);
      fetchDashboardStats();
    });

    const unsubscribeQuiz = subscribeToModuleUpdates('quiz_analytics', (payload) => {
      console.log('Dashboard received quiz analytics update:', payload);
      if (payload.action === 'analytics_updated') {
        setStats(prev => ({
          ...prev,
          quiz: {
            ...prev.quiz,
            ...payload.analytics
          }
        }));
      }
    });

    const unsubscribeCustomerService = subscribeToModuleUpdates('customer_service', (payload) => {
      console.log('Dashboard received customer service update:', payload);
      fetchDashboardStats();
    });

    // Subscribe to campaign metrics updates
    const unsubscribeCampaigns = subscribeToModuleUpdates('campaigns', (payload) => {
      console.log('Dashboard received campaign update:', payload);
      if (payload.action === 'metrics_updated') {
        fetchDashboardStats();
      }
    });

    return () => {
      unsubscribeConversations();
      unsubscribeQuiz();
      unsubscribeCustomerService();
      unsubscribeCampaigns();
    };
  }, [user, isAdmin]);

  const fetchDashboardStats = async () => {
    try {
      // WhatsApp Stats
      const { data: whatsappMessages } = await supabase
        .from('customer_conversations')
        .select('*');

      // Fix: Use the correct table name 'user_whatsapp_config' instead of 'whatsapp_config'
      const { data: whatsappConfig } = await supabase
        .from('user_whatsapp_config')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      // Quiz Stats
      const { data: quizGames } = await supabase
        .from('quiz_games')
        .select('*');

      const { data: quizParticipants } = await supabase
        .from('quiz_participants')
        .select('*');

      // Customer Service Stats
      const { data: customerMessages } = await supabase
        .from('customer_conversations')
        .select('*')
        .eq('sender', 'user');

      // Calculer les statistiques
      setStats({
        whatsapp: {
          totalMessages: whatsappMessages?.length || 0,
          deliveryRate: calculateDeliveryRate(whatsappMessages || []),
          activeChats: calculateActiveChats(whatsappMessages || [])
        },
        customerService: {
          totalTickets: customerMessages?.length || 0,
          responseTime: calculateAverageResponseTime(customerMessages || []),
          satisfactionRate: 85, // À implémenter: calcul réel
          commonTopics: calculateCommonTopics(customerMessages || [])
        },
        quiz: {
          activeGames: quizGames?.filter(g => g.status === 'active').length || 0,
          totalParticipants: quizParticipants?.length || 0,
          averageScore: calculateQuizAverageScore(quizParticipants || []),
          completionRate: calculateQuizCompletionRate(quizParticipants || []),
          profileBreakdown: { discovery: 0, active: 0, vip: 0 }
        }
      });

      // Load marketing quiz stats
      const { data: quizUsers } = await supabase
        .from('quiz_users')
        .select('*');

      if (quizUsers) {
        const profileBreakdown = {
          discovery: quizUsers.filter(u => u.profile === 'discovery').length,
          active: quizUsers.filter(u => u.profile === 'active').length,
          vip: quizUsers.filter(u => u.profile === 'vip').length
        };

        setStats(prev => ({
          ...prev,
          quiz: {
            ...prev.quiz,
            totalParticipants: quizUsers.length,
            profileBreakdown
          }
        }));
      }

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      setIsLoading(false);
    }
  };

  const calculateDeliveryRate = (messages: any[]) => {
    const delivered = messages.filter(m => m.status === 'delivered').length;
    return messages.length > 0 ? (delivered / messages.length) * 100 : 0;
  };

  const calculateActiveChats = (messages: any[]) => {
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const uniqueNumbers = new Set(
      messages
        .filter(m => new Date(m.created_at) > last24Hours)
        .map(m => m.phone_number)
    );
    return uniqueNumbers.size;
  };

  const calculateAverageScore = (sessions: any[]) => {
    if (sessions.length === 0) return 0;
    const totalScore = sessions.reduce((acc, session) => acc + (session.comprehension_score || 0), 0);
    return (totalScore / sessions.length) * 100;
  };

  const calculateAverageResponseTime = (messages: any[]) => {
    const responseTimes = messages
      .filter(m => m.response_time)
      .map(m => m.response_time);
    return responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;
  };

  const calculateCommonTopics = (messages: any[]) => {
    const topics = messages.reduce((acc: Record<string, number>, message) => {
      if (message.intent) {
        acc[message.intent] = (acc[message.intent] || 0) + 1;
      }
      return acc;
    }, {});

    return Object.entries(topics)
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  };

  const calculateQuizAverageScore = (participants: any[]) => {
    if (participants.length === 0) return 0;
    const totalScore = participants.reduce((acc, p) => acc + (p.score || 0), 0);
    return totalScore / participants.length;
  };

  const calculateQuizCompletionRate = (participants: any[]) => {
    if (participants.length === 0) return 0;
    const completed = participants.filter(p => p.total_answers > 0).length;
    return (completed / participants.length) * 100;
  };

  const getPlanName = (planType: string) => {
    switch (planType) {
      case 'daily': return 'Journalier';
      case 'weekly': return 'Hebdomadaire';
      case 'monthly': return 'Mensuel';
      default: return planType;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Tableau de Bord</h1>
      
      {/* Real-time Sync Status */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <RealTimeSync onSyncUpdate={(module, data) => {
            console.log(`📊 [DASHBOARD] Sync update from ${module}:`, data);
            // Trigger a refresh of dashboard stats when updates are received
            if (data.action === 'message_added' || data.action === 'analytics_updated') {
              fetchDashboardStats();
            }
          }} />
        </div>
      </div>

      {/* Chatbot Health Monitor */}
      <div className="mb-8">
        <ChatbotHealthMonitor />
      </div>

      {/* Subscription Status */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-1 gap-6">
        {/* Educational Subscription Status */}
        {!isAdmin && (
          <div className="p-6 rounded-xl bg-green-50 border border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <BookOpen className="w-8 h-8 text-green-600" />
                <div>
                  <h2 className="text-lg font-semibold">
                    Abonnement Éducatif {getPlanName(subscription.planType || '')}
                  </h2>
                  <p className="text-sm">
                    Accès illimité jusqu'au {subscription.endDate}
                  </p>
                  <p className="text-sm mt-1">
                    Messages: <span className="font-medium">Illimités</span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Module Selector */}
      <div className="mb-6 flex flex-wrap gap-4">
        <button
          onClick={() => setActiveModule('whatsapp')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeModule === 'whatsapp' 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          WhatsApp
        </button>
        <button
          onClick={() => setActiveModule('customerService')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeModule === 'customerService' 
              ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' 
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          Service Client
        </button>
        <button
          onClick={() => setActiveModule('quiz')}
          className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
            activeModule === 'quiz' 
              ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' 
              : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          <Trophy className="w-5 h-5" />
          Quiz
        </button>
      </div>

      {/* Charts */}
      <div className="mb-8">
        <DashboardCharts moduleType={activeModule} />
      </div>

      {/* WhatsApp */}
      {activeModule === 'whatsapp' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-600" />
            WhatsApp
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <Activity className="w-5 h-5 text-blue-600" />
                <h3 className="font-medium text-gray-900">Messages envoyés</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.whatsapp.totalMessages}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="font-medium text-gray-900">Taux de livraison</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.whatsapp.deliveryRate.toFixed(1)}%</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-yellow-500" />
                <h3 className="font-medium text-gray-900">Conversations actives</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.whatsapp.activeChats}</p>
            </div>
          </div>
        </div>
      )}

      {/* Service Client */}
      {activeModule === 'customerService' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-yellow-500" />
            Service Client
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <h3 className="font-medium text-gray-900">Clients traités</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.customerService.totalTickets}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-green-600" />
                <h3 className="font-medium text-gray-900">Temps de réponse</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.customerService.responseTime.toFixed(1)}s</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="w-5 h-5 text-yellow-500" />
                <h3 className="font-medium text-gray-900">Satisfaction client</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.customerService.satisfactionRate}%</p>
            </div>
          </div>
        </div>
      )}

      {/* Quiz */}
      {activeModule === 'quiz' && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-500" />
            Quiz Marketing
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-medium text-gray-900">Total Participants</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.quiz.totalParticipants}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <Trophy className="w-5 h-5 text-yellow-600" />
                <h3 className="font-medium text-gray-900">Score Moyen</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.quiz.averageScore.toFixed(1)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h3 className="font-medium text-gray-900">Taux de Complétion</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.quiz.completionRate.toFixed(1)}%</p>
            </div>
          </div>
          
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Répartition des Profils Marketing</h3>
            <div className="grid grid-cols-3 gap-6">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600 mb-1">{stats.quiz.profileBreakdown?.discovery || 0}</div>
                <div className="text-sm font-medium text-blue-800">DISCOVERY</div>
                <div className="text-xs text-blue-600">Nouveaux prospects</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600 mb-1">{stats.quiz.profileBreakdown?.active || 0}</div>
                <div className="text-sm font-medium text-green-800">ACTIVE</div>
                <div className="text-xs text-green-600">Clients engagés</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;