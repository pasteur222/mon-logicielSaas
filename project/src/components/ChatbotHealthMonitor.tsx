import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Activity, MessageSquare, GamepadIcon } from 'lucide-react';
import { performChatbotHealthCheck, subscribeToModuleUpdates } from '../lib/chatbot-communication';
import { checkCustomerServiceHealth } from '../lib/customer-service-chatbot';
import { checkQuizHealth } from '../lib/quiz-chatbot';

interface HealthStatus {
  conversations: boolean;
  quiz: boolean;
  realtime: boolean;
  errors: string[];
}

interface ModuleHealth {
  customerService: {
    healthy: boolean;
    errors: string[];
    stats: any;
  };
  quiz: {
    healthy: boolean;
    errors: string[];
    stats: any;
  };
}

const ChatbotHealthMonitor: React.FC = () => {
  const [healthStatus, setHealthStatus] = useState<HealthStatus>({
    conversations: false,
    quiz: false,
    realtime: false,
    errors: []
  });
  const [moduleHealth, setModuleHealth] = useState<ModuleHealth>({
    customerService: { healthy: false, errors: [], stats: {} },
    quiz: { healthy: false, errors: [], stats: {} }
  });
  const [loading, setLoading] = useState(true);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  useEffect(() => {
    performHealthCheck();
    
    // Set up real-time monitoring
    let mounted = true;
    
    const setupRealTimeMonitoring = () => {
      const unsubscribeConversations = subscribeToModuleUpdates('conversations', (payload) => {
        if (!mounted) return;
        
        console.log('📨 [HEALTH-MONITOR] Conversations module update:', payload);
        // Refresh health check when conversations are updated
        if (payload.action === 'message_added') {
          performHealthCheck();
        }
      });

      const unsubscribeQuiz = subscribeToModuleUpdates('quiz', (payload) => {
        if (!mounted) return;
        
        console.log('🎯 [HEALTH-MONITOR] Quiz module update:', payload);
        // Refresh health check when quiz is updated
        if (payload.action === 'answer_submitted' || payload.action === 'quiz_completed') {
          performHealthCheck();
        }
      });
      
      return () => {
        unsubscribeConversations();
        unsubscribeQuiz();
      };
    };
    
    const cleanup = setupRealTimeMonitoring();

    // Periodic health checks every 30 seconds
    const interval = setInterval(() => {
      if (mounted) {
        performHealthCheck();
      }
    }, 30000);

    return () => {
      mounted = false;
      cleanup();
      clearInterval(interval);
    };
  }, []);

  const performHealthCheck = async () => {
    try {
      setLoading(true);
      
      // Check overall chatbot communication health
      const overallHealth = await performChatbotHealthCheck();
      setHealthStatus(overallHealth);

      // Check customer service specific health
      const customerServiceHealth = await checkCustomerServiceHealth();
      
      // Check quiz specific health
      const quizHealth = await checkQuizHealth();

      setModuleHealth({
        customerService: customerServiceHealth,
        quiz: quizHealth
      });

      setLastCheck(new Date());
    } catch (error) {
      console.error('Health check failed:', error);
      setHealthStatus(prev => ({
        ...prev,
        errors: [...prev.errors, `Health check failed: ${error.message}`]
      }));
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (healthy: boolean) => {
    if (loading) {
      return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />;
    }
    return healthy ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <AlertCircle className="w-4 h-4 text-red-500" />
    );
  };

  const getStatusColor = (healthy: boolean) => {
    return healthy ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-600 bg-red-50 border-red-200';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Chatbot Health Monitor</h3>
            <p className="text-sm text-gray-500">
              {lastCheck ? `Last check: ${lastCheck.toLocaleTimeString()}` : 'Checking...'}
            </p>
          </div>
        </div>
        <button
          onClick={performHealthCheck}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Overall System Health */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`p-4 rounded-lg border ${getStatusColor(healthStatus.conversations)}`}>
          <div className="flex items-center gap-2 mb-2">
            {getStatusIcon(healthStatus.conversations)}
            <span className="font-medium">Conversations DB</span>
          </div>
          <p className="text-sm">
            {healthStatus.conversations ? 'Connected' : 'Connection issues'}
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${getStatusColor(healthStatus.quiz)}`}>
          <div className="flex items-center gap-2 mb-2">
            {getStatusIcon(healthStatus.quiz)}
            <span className="font-medium">Quiz System</span>
          </div>
          <p className="text-sm">
            {healthStatus.quiz ? 'Operational' : 'System issues'}
          </p>
        </div>

        <div className={`p-4 rounded-lg border ${getStatusColor(healthStatus.realtime)}`}>
          <div className="flex items-center gap-2 mb-2">
            {getStatusIcon(healthStatus.realtime)}
            <span className="font-medium">Real-time Sync</span>
          </div>
          <p className="text-sm">
            {healthStatus.realtime ? 'Active' : 'Disconnected'}
          </p>
        </div>
      </div>

      {/* Module-Specific Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Service Health */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            <h4 className="font-medium text-gray-900">Customer Service</h4>
            {getStatusIcon(moduleHealth.customerService.healthy)}
          </div>
          
          {moduleHealth.customerService.stats && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Messages (24h):</span>
                <span className="font-medium">{moduleHealth.customerService.stats.totalMessages || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Avg Response Time:</span>
                <span className="font-medium">{(moduleHealth.customerService.stats.avgResponseTime || 0).toFixed(1)}s</span>
              </div>
              <div className="flex justify-between">
                <span>User Messages:</span>
                <span className="font-medium">{moduleHealth.customerService.stats.userMessages || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Bot Responses:</span>
                <span className="font-medium">{moduleHealth.customerService.stats.botMessages || 0}</span>
              </div>
            </div>
          )}

          {moduleHealth.customerService.errors.length > 0 && (
            <div className="mt-3 p-2 bg-red-50 rounded border border-red-200">
              <p className="text-xs text-red-600">
                {moduleHealth.customerService.errors.join(', ')}
              </p>
            </div>
          )}
        </div>

        {/* Quiz Health */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <GamepadIcon className="w-5 h-5 text-yellow-600" />
            <h4 className="font-medium text-gray-900">Quiz System</h4>
            {getStatusIcon(moduleHealth.quiz.healthy)}
          </div>
          
          {moduleHealth.quiz.stats && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Participants:</span>
                <span className="font-medium">{moduleHealth.quiz.stats.totalParticipants || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Average Score:</span>
                <span className="font-medium">{(moduleHealth.quiz.stats.averageScore || 0).toFixed(1)}</span>
              </div>
              <div className="flex justify-between">
                <span>Completion Rate:</span>
                <span className="font-medium">{(moduleHealth.quiz.stats.completionRate || 0).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span>VIP Users:</span>
                <span className="font-medium">{moduleHealth.quiz.stats.profileBreakdown?.vip || 0}</span>
              </div>
            </div>
          )}

          {moduleHealth.quiz.errors.length > 0 && (
            <div className="mt-3 p-2 bg-red-50 rounded border border-red-200">
              <p className="text-xs text-red-600">
                {moduleHealth.quiz.errors.join(', ')}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* System Errors */}
      {healthStatus.errors.length > 0 && (
        <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h4 className="font-medium text-red-800">System Errors</h4>
          </div>
          <ul className="text-sm text-red-700 space-y-1">
            {healthStatus.errors.map((error, index) => (
              <li key={index}>• {error}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ChatbotHealthMonitor;