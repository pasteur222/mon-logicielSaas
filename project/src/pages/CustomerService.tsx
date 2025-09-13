import React, { useState, useEffect } from 'react';
import { MessageSquare, Bot, Send, RefreshCw, AlertCircle, Plus, X, Save, Users, BarChart2, Clock, CheckCircle, Phone, MessageCircle, Globe, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendWhatsAppMessages } from '../lib/whatsapp';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import GroqApiCheck from '../components/GroqApiCheck';
import ChatbotWebIntegration from '../components/ChatbotWebIntegration';
import ChatbotHealthMonitor from '../components/ChatbotHealthMonitor';
import ConversationList from '../components/ConversationList';
import { processConversationsIntoThreads, getConversationAnalytics } from '../lib/conversation-utils';
import { subscribeToModuleUpdates, ensureConversationSync } from '../lib/chatbot-communication';
import MessageTemplateManager from '../components/MessageTemplateManager';
import { 
  processCustomerServiceMessage, 
  getCustomerServiceHistory,
  deleteCustomerServiceConversations,
  deleteCustomerServiceConversationsByTimeframe
} from '../lib/customer-service-chatbot';

interface Conversation {
  id: string;
  phone_number: string;
  web_user_id?: string;
  content: string;
  sender: 'user' | 'bot';
  intent?: string;
  response_time?: number;
  created_at: string;
}

interface AutoReplyRule {
  id: string;
  trigger_words: string[];
  response: string;
  variables?: Record<string, string>;
  priority: number;
  is_active: boolean;
}

interface CustomerServiceStats {
  totalConversations: number;
  averageResponseTime: number;
  satisfactionRate: number;
  activeChats: number;
  resolvedTickets: number;
  pendingTickets: number;
}

const CustomerService = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [autoReplyRules, setAutoReplyRules] = useState<AutoReplyRule[]>([]);
  const [stats, setStats] = useState<CustomerServiceStats>({
    totalConversations: 0,
    averageResponseTime: 0,
    satisfactionRate: 85,
    activeChats: 0,
    resolvedTickets: 0,
    pendingTickets: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showRuleEditor, setShowRuleEditor] = useState(false);
  const [editingRule, setEditingRule] = useState<AutoReplyRule | null>(null);
  const [newRule, setNewRule] = useState<Partial<AutoReplyRule>>({
    trigger_words: [],
    response: '',
    priority: 0,
    is_active: true
  });
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [manualMessage, setManualMessage] = useState('');
  const [sendingManualMessage, setSendingManualMessage] = useState(false);
  const [showWebChatbot, setShowWebChatbot] = useState(false);
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);
  const [deletingConversations, setDeletingConversations] = useState(false);
  const [showDeleteOptions, setShowDeleteOptions] = useState(false);
  const [deleteTimeframe, setDeleteTimeframe] = useState<'1h' | '24h' | '7d' | 'all'>('24h');
  const [showTemplateManager, setShowTemplateManager] = useState(false);

  useEffect(() => {
    loadData();
    
    // Set up real-time subscriptions
    const conversationsSubscription = supabase
      .channel('customer_conversations_changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'customer_conversations' 
      }, () => {
        loadConversations();
        loadStats();
      })
      .subscribe();

    // Subscribe to chatbot communication updates
    const unsubscribeChatbotUpdates = subscribeToModuleUpdates('customer_service', (payload) => {
      console.log('Customer service update received:', payload);
      if (payload.action === 'response_generated') {
        loadConversations();
        loadStats();
      }
    });

    return () => {
      conversationsSubscription.unsubscribe();
      unsubscribeChatbotUpdates();
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      await Promise.all([
        loadConversations(),
        loadAutoReplyRules(),
        loadStats()
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
      setError('Impossible de charger les données du service client. Veuillez actualiser la page.');
    } finally {
      setLoading(false);
    }
  };

  const loadConversations = async () => {
    try {
      // Ensure conversation synchronization first
      await ensureConversationSync('all', 'client');
      
      const { data, error } = await supabase
        .from('customer_conversations')
        .select('*')
        .eq('intent', 'client')
        .order('created_at', { ascending: false })
        .limit(1000); // Increase limit to get more complete conversations

      if (error) {
        console.error('Error loading conversations:', error);
        throw error;
      }
      
      console.log(`Loaded ${data?.length || 0} conversations`);
      setConversations(data || []);
    } catch (error) {
      console.error('Error loading conversations:', error);
      throw new Error('Erreur lors du chargement des conversations');
    }
  };

  const loadAutoReplyRules = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_auto_replies')
        .select('*')
        .eq('user_id', user?.id)
        .order('priority', { ascending: false });

      if (error) throw error;
      setAutoReplyRules(data || []);
    } catch (error) {
      console.error('Error loading auto-reply rules:', error);
      // Don't throw here as this is not critical
    }
  };

  const loadStats = async () => {
    try {
      // Use the new analytics function
      const analytics = await getConversationAnalytics('client');
      
      setStats({
        totalConversations: analytics.totalMessages,
        averageResponseTime: analytics.averageResponseTime,
        satisfactionRate: analytics.resolutionRate,
        activeChats: analytics.active,
        resolvedTickets: Math.floor(analytics.totalMessages * 0.8),
        pendingTickets: Math.floor(analytics.totalMessages * 0.2)
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleSaveRule = async () => {
    try {
      setError(null);
      
      if (!newRule.trigger_words || newRule.trigger_words.length === 0 || !newRule.response) {
        setError('Veuillez remplir tous les champs obligatoires');
        return;
      }

      if (editingRule) {
        // Update existing rule
        const { error } = await supabase
          .from('whatsapp_auto_replies')
          .update({
            trigger_words: newRule.trigger_words,
            response: newRule.response,
            priority: newRule.priority,
            is_active: newRule.is_active,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingRule.id);

        if (error) throw error;
        setSuccess('Règle mise à jour avec succès');
      } else {
        // Create new rule
        const { error } = await supabase
          .from('whatsapp_auto_replies')
          .insert({
            user_id: user?.id,
            trigger_words: newRule.trigger_words,
            response: newRule.response,
            priority: newRule.priority,
            is_active: newRule.is_active
          });

        if (error) throw error;
        setSuccess('Règle créée avec succès');
      }

      setShowRuleEditor(false);
      setEditingRule(null);
      setNewRule({
        trigger_words: [],
        response: '',
        priority: 0,
        is_active: true
      });
      
      await loadAutoReplyRules();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error saving rule:', error);
      setError('Erreur lors de la sauvegarde de la règle');
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette règle ?')) return;

    try {
      const { error } = await supabase
        .from('whatsapp_auto_replies')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setSuccess('Règle supprimée avec succès');
      await loadAutoReplyRules();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error deleting rule:', error);
      setError('Erreur lors de la suppression de la règle');
    }
  };

  const handleDeleteSelectedConversations = async () => {
    try {
      if (selectedConversations.length === 0) {
        setError('Aucune conversation sélectionnée');
        return;
      }

      console.log('🗑️ [CUSTOMER-SERVICE-UI] Starting deletion of selected conversations:', selectedConversations);

      const result = await deleteCustomerServiceConversations(selectedConversations);
      if (result.success) {
        setSuccess(`${result.deletedCount} conversation(s) supprimée(s) avec succès`);
        setSelectedConversations([]);
        
        console.log('✅ [CUSTOMER-SERVICE-UI] Deletion successful, refreshing conversation list');
        
        // Force immediate refresh of conversations list
        await loadConversations();
        
        setTimeout(() => setSuccess(null), 3000);
      } else {
        console.error('❌ [CUSTOMER-SERVICE-UI] Deletion failed:', result.error);
        setError(result.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error deleting selected conversations:', error);
      setError('Erreur lors de la suppression des conversations');
    }
  };

  const handleDeleteRecentConversations = async () => {
    try {
      setDeletingConversations(true);
      setError(null);

      const timeframeLabel = {
        '1h': 'dernière heure',
        '24h': 'dernières 24 heures',
        '7d': 'derniers 7 jours',
        'all': 'toutes les conversations'
      }[deleteTimeframe];

      if (!confirm(`Êtes-vous sûr de vouloir supprimer toutes les conversations de la ${timeframeLabel} ? Cette action est irréversible.`)) {
        return;
      }

      console.log('🗑️ [CUSTOMER-SERVICE-UI] Starting timeframe deletion:', deleteTimeframe);

      // Use the dedicated deletion function
      const result = await deleteCustomerServiceConversationsByTimeframe(deleteTimeframe);
      
      if (!result.success) {
        throw new Error(result.error || 'Deletion failed');
      }
      
      console.log('✅ [CUSTOMER-SERVICE-UI] Timeframe deletion successful, refreshing conversation list');
      
      // Always reload conversations to get the updated list
      await loadConversations();
      
      setSuccess(`${result.deletedCount} conversation(s) supprimée(s) avec succès`);
      setShowDeleteOptions(false);
      
      // Reload stats to reflect the changes
      await loadStats();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error deleting recent conversations:', error);
      setError(`Erreur lors de la suppression des conversations récentes: ${error.message}`);
    } finally {
      setDeletingConversations(false);
    }
  };

  const handleSendManualMessage = async (participantId?: string, messageContent?: string) => {
    const targetParticipant = participantId || selectedConversation;
    const messageToSend = messageContent || manualMessage;
    
    if (!targetParticipant || !messageToSend.trim()) {
      setError('Veuillez sélectionner une conversation et saisir un message');
      return;
    }

    try {
      setSendingManualMessage(true);
      setError(null);

      // Find the phone number for the selected conversation
      const conversation = conversations.find(c => 
        c.phone_number === targetParticipant || c.web_user_id === targetParticipant
      );
      if (!conversation) {
        setError('Conversation non trouvée');
        return;
      }

      // Process the manual message through the customer service chatbot
      const botResponse = await processCustomerServiceMessage({
        phoneNumber: conversation.phone_number,
        webUserId: conversation.web_user_id,
        source: 'whatsapp',
        content: messageToSend,
        sender: 'user'
      });

      // Send WhatsApp message
      if (conversation.phone_number) {
        const results = await sendWhatsAppMessages([{
          phoneNumber: conversation.phone_number,
          message: botResponse.content
        }], user?.id);

        const result = results[0];
        if (result.status === 'success') {
          setSuccess('Message envoyé avec succès');
          setManualMessage('');
          setSelectedConversation(null);
          await loadConversations();
        } else {
          setError(`Erreur lors de l'envoi: ${result.error}`);
        }
      } else {
        // For web clients, just save the response to database
        setSuccess('Réponse enregistrée pour le client web');
        setManualMessage('');
        setSelectedConversation(null);
        await loadConversations();
      }

      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error sending manual message:', error);
      setError('Erreur lors de l\'envoi du message');
    } finally {
      setSendingManualMessage(false);
    }
  };

  const handleSelectTemplate = (template: any) => {
    setManualMessage(template.content);
    setShowTemplateManager(false);
    setSuccess('Template inséré dans le message');
    setTimeout(() => setSuccess(null), 3000);
  };

  const getUniqueParticipants = () => {
    const participants = new Set<string>();
    conversations.forEach(conv => {
      const participantId = conv.phone_number || conv.web_user_id;
      if (participantId && participantId !== 'unknown') {
        participants.add(participantId);
      }
    });
    return Array.from(participants);
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
            <p className="text-gray-600">Chargement du service client...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <GroqApiCheck>
        <div className="p-4 bg-gray-50">
          <BackButton />
        </div>
        
        <div className="flex-1 flex flex-col">
          <div className="p-6 bg-white border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bot className="w-8 h-8 text-red-600" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Service Client Automatisé</h1>
                  <p className="text-sm text-gray-500">Assistant virtuel intelligent avec intervention manuelle</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowWebChatbot(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <MessageCircle className="w-4 h-4" />
                  Intégration Chatbot Web
                </button>
                <button
                  onClick={() => setShowRuleEditor(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <Plus className="w-4 h-4" />
                  Nouvelle Règle
                </button>
                <button
                  onClick={() => setShowRuleEditor(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <Plus className="w-4 h-4" />
                  Nouvelle Règle
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
                <MessageSquare className="w-5 h-5 text-blue-600" />
                <h3 className="font-medium text-gray-900">Conversations</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.totalConversations}</p>
              <p className="text-sm text-gray-500 mt-1">Total des demandes</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <Clock className="w-5 h-5 text-green-600" />
                <h3 className="font-medium text-gray-900">Temps de Réponse</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.averageResponseTime.toFixed(1)}s</p>
              <p className="text-sm text-gray-500 mt-1">Temps moyen</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <Users className="w-5 h-5 text-purple-600" />
                <h3 className="font-medium text-gray-900">Chats Actifs</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.activeChats}</p>
              <p className="text-sm text-gray-500 mt-1">Dernières 24h</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <BarChart2 className="w-5 h-5 text-yellow-600" />
                <h3 className="font-medium text-gray-900">Satisfaction</h3>
              </div>
              <p className="text-2xl font-semibold text-gray-900">{stats.satisfactionRate}%</p>
              <p className="text-sm text-gray-500 mt-1">Taux de satisfaction</p>
            </div>
          </div>

          {/* Manual Intervention Section */}
          <div className="mx-6 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-red-600" />
                Intervention Manuelle
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sélectionner une conversation
                  </label>
                  <select
                    value={selectedConversation || ''}
                    onChange={(e) => setSelectedConversation(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  >
                    <option value="">Choisir un client...</option>
                    {getUniqueParticipants().map((participantId) => (
                      <option key={participantId} value={participantId}>
                        {participantId}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message à envoyer
                  </label>
                  <div className="space-y-2">
                    <textarea
                      value={manualMessage}
                      onChange={(e) => setManualMessage(e.target.value)}
                      placeholder="Tapez votre message ici...&#10;&#10;Utilisez Shift + Entrée pour ajouter des sauts de ligne."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                      rows={4}
                      disabled={!selectedConversation}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendManualMessage();
                        }
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setShowTemplateManager(true)}
                        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Insérer un template
                      </button>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-sm text-gray-500">
                        Appuyez sur Entrée pour envoyer, Shift + Entrée pour une nouvelle ligne
                      </p>
                      <button
                        onClick={() => handleSendManualMessage()}
                        disabled={!selectedConversation || !manualMessage.trim() || sendingManualMessage}
                        className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {sendingManualMessage ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        Envoyer
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Envoyez un message directement au client via WhatsApp
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Auto-Reply Rules */}
          <div className="mx-6 mb-6">
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Règles de Réponse Automatique</h3>
              </div>

              <div className="divide-y divide-gray-200">
                {autoReplyRules.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <Bot className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <p>Aucune règle configurée</p>
                    <p className="text-sm mt-1">Créez votre première règle pour automatiser les réponses</p>
                  </div>
                ) : (
                  autoReplyRules.map((rule) => (
                    <div key={rule.id} className="p-6 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                              rule.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {rule.is_active ? 'Actif' : 'Inactif'}
                            </span>
                            <span className="text-sm text-gray-500">Priorité: {rule.priority}</span>
                          </div>
                          <div className="mb-2">
                            <span className="text-sm font-medium text-gray-700">Mots-clés: </span>
                            <span className="text-sm text-gray-600">{rule.trigger_words.join(', ')}</span>
                          </div>
                          <p className="text-sm text-gray-900">{rule.response}</p>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={() => {
                              setEditingRule(rule);
                              setNewRule(rule);
                              setShowRuleEditor(true);
                            }}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteRule(rule.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Recent Conversations */}
          <div className="flex-1 p-6">
            <ConversationList
              conversations={conversations}
              onSendMessage={handleSendManualMessage}
              onRefresh={loadConversations}
              loading={loading}
              onDeleteConversations={async (conversationIds) => {
                try {
                  console.log('🗑️ [CUSTOMER-SERVICE-UI] ConversationList deletion request:', conversationIds);
                  
                  const result = await deleteCustomerServiceConversations(conversationIds);
                  if (result.success) {
                    setSuccess(`${result.deletedCount} conversation(s) supprimée(s) avec succès`);
                    
                    console.log('✅ [CUSTOMER-SERVICE-UI] ConversationList deletion successful, refreshing');
                    
                    // Force immediate refresh of conversations list
                    await loadConversations();
                    
                    setTimeout(() => setSuccess(null), 3000);
                  } else {
                    console.error('❌ [CUSTOMER-SERVICE-UI] ConversationList deletion failed:', result.error);
                    setError(result.error || 'Erreur lors de la suppression');
                  }
                } catch (error) {
                  console.error('Error deleting conversations:', error);
                  setError('Erreur lors de la suppression des conversations');
                }
              }}
            />
          </div>
        </div>

        {/* Rule Editor Modal */}
        {showRuleEditor && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-semibold">
                  {editingRule ? 'Modifier la Règle' : 'Nouvelle Règle'}
                </h3>
                <button
                  onClick={() => setShowRuleEditor(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mots-clés déclencheurs (séparés par des virgules)
                  </label>
                  <input
                    type="text"
                    value={newRule.trigger_words?.join(', ') || ''}
                    onChange={(e) => setNewRule(prev => ({ 
                      ...prev, 
                      trigger_words: e.target.value.split(',').map(w => w.trim()).filter(w => w) 
                    }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="aide, support, problème, facture"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Réponse automatique
                  </label>
                  <textarea
                    value={newRule.response}
                    onChange={(e) => setNewRule(prev => ({ ...prev, response: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    rows={4}
                    placeholder="Merci pour votre message. Notre équipe vous répondra dans les plus brefs délais."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priorité (0-100)
                  </label>
                  <input
                    type="number"
                    value={newRule.priority}
                    onChange={(e) => setNewRule(prev => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    min="0"
                    max="100"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Plus la priorité est élevée, plus la règle sera évaluée en premier
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={newRule.is_active}
                    onChange={(e) => setNewRule(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Activer cette règle
                  </label>
                </div>

                <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowRuleEditor(false)}
                    className="px-4 py-2 text-gray-600 hover:text-gray-900"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveRule}
                    disabled={!newRule.trigger_words?.length || !newRule.response}
                    className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    Enregistrer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </GroqApiCheck>

      {/* Delete Conversations Modal */}
      {showDeleteOptions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Supprimer les Conversations</h3>
              <button
                onClick={() => setShowDeleteOptions(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                  <h4 className="font-medium text-red-800">Attention</h4>
                </div>
                <p className="text-red-700 text-sm">
                  Cette action supprimera définitivement les conversations sélectionnées. Cette action ne peut pas être annulée.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Période à supprimer
                </label>
                <select
                  value={deleteTimeframe}
                  onChange={(e) => setDeleteTimeframe(e.target.value as any)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                >
                  <option value="1h">Dernière heure</option>
                  <option value="24h">Dernières 24 heures</option>
                  <option value="7d">Derniers 7 jours</option>
                  <option value="all">Toutes les conversations</option>
                </select>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t">
                <button
                  onClick={() => setShowDeleteOptions(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                  disabled={deletingConversations}
                >
                  Annuler
                </button>
                <button
                  onClick={handleDeleteRecentConversations}
                  disabled={deletingConversations}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {deletingConversations ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Suppression...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Supprimer
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Web Chatbot Integration Modal */}
      {showWebChatbot && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-semibold text-gray-900">Intégration Chatbot Web</h2>
              <button
                onClick={() => setShowWebChatbot(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <ChatbotWebIntegration onClose={() => setShowWebChatbot(false)} />
          </div>
        </div>
      )}

      {/* Template Manager Modal */}
      {showTemplateManager && (
        <MessageTemplateManager
          onSelectTemplate={handleSelectTemplate}
          onClose={() => setShowTemplateManager(false)}
        />
      )}
    </div>
  );
};

export default CustomerService;