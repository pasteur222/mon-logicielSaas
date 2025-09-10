import React, { useState, useEffect } from 'react';
import { Play, Pause, RefreshCw, AlertCircle, CheckCircle, Clock, BarChart2, Settings, Eye, Calendar } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { 
  initializeCampaignScheduler, 
  stopCampaignScheduler, 
  getCampaignStatus,
  getScheduledMessageStatus,
  triggerCampaignExecution,
  triggerMessageExecution,
  type Campaign,
  type ScheduledMessage 
} from '../lib/campaign-scheduler';

interface CampaignTestingPanelProps {
  onClose?: () => void;
}

const CampaignTestingPanel: React.FC<CampaignTestingPanelProps> = ({ onClose }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [testingItem, setTestingItem] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<ScheduledMessage | null>(null);
  const [campaignStatus, setCampaignStatus] = useState<any>(null);
  const [messageStatus, setMessageStatus] = useState<any>(null);

  useEffect(() => {
    loadData();
    
    // Check if scheduler is running
    setSchedulerRunning(true);
    
    return () => {
      stopCampaignScheduler();
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load campaigns
      const { data: campaignsData, error: campaignsError } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (campaignsError) throw campaignsError;

      // Load scheduled messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('scheduled_messages')
        .select('*')
        .order('send_at', { ascending: true });

      if (messagesError) throw messagesError;

      setCampaigns(campaignsData || []);
      setScheduledMessages(messagesData || []);
    } catch (err) {
      console.error('Error loading data:', err);
      setError('Impossible de charger les données');
    } finally {
      setLoading(false);
    }
  };

  const toggleScheduler = () => {
    if (schedulerRunning) {
      stopCampaignScheduler();
      setSchedulerRunning(false);
      setSuccess('Scheduler arrêté');
    } else {
      initializeCampaignScheduler();
      setSchedulerRunning(true);
      setSuccess('Scheduler démarré');
    }
    
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleTestCampaign = async (campaignId: string) => {
    try {
      setTestingItem(campaignId);
      setError(null);
      
      await triggerCampaignExecution(campaignId);
      setSuccess('Campagne exécutée avec succès');
      
      // Reload data to see updated status
      await loadData();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error testing campaign:', error);
      setError(`Erreur lors du test: ${error.message}`);
    } finally {
      setTestingItem(null);
    }
  };

  const handleTestMessage = async (messageId: string) => {
    try {
      setTestingItem(messageId);
      setError(null);
      
      await triggerMessageExecution(messageId);
      setSuccess('Message exécuté avec succès');
      
      // Reload data to see updated status
      await loadData();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error testing message:', error);
      setError(`Erreur lors du test: ${error.message}`);
    } finally {
      setTestingItem(null);
    }
  };

  const handleViewCampaignStatus = async (campaign: Campaign) => {
    try {
      setSelectedCampaign(campaign);
      const status = await getCampaignStatus(campaign.id);
      setCampaignStatus(status);
    } catch (error) {
      console.error('Error getting campaign status:', error);
      setError('Impossible de charger le statut de la campagne');
    }
  };

  const handleViewMessageStatus = async (message: ScheduledMessage) => {
    try {
      setSelectedMessage(message);
      const status = await getScheduledMessageStatus(message.id);
      setMessageStatus(status);
    } catch (error) {
      console.error('Error getting message status:', error);
      setError('Impossible de charger le statut du message');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
      case 'sent':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Panneau de Test des Campagnes</h2>
          <p className="text-sm text-gray-500">Testez et surveillez l'exécution automatique des campagnes</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${schedulerRunning ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-sm text-gray-600">
              Scheduler {schedulerRunning ? 'Actif' : 'Arrêté'}
            </span>
            <button
              onClick={toggleScheduler}
              className={`p-2 rounded-lg ${
                schedulerRunning 
                  ? 'text-red-600 hover:bg-red-50' 
                  : 'text-green-600 hover:bg-green-50'
              }`}
              title={schedulerRunning ? 'Arrêter le scheduler' : 'Démarrer le scheduler'}
            >
              {schedulerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          </div>
          <button
            onClick={loadData}
            className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="w-4 h-4" />
            Actualiser
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Campaigns Section */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Campagnes Programmées</h3>
          <div className="space-y-4">
            {campaigns.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Aucune campagne trouvée</p>
              </div>
            ) : (
              campaigns.map((campaign) => (
                <div key={campaign.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-gray-900">{campaign.name}</h4>
                      <p className="text-sm text-gray-600">{campaign.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(campaign.status)}`}>
                        {campaign.status}
                      </span>
                      <button
                        onClick={() => handleViewCampaignStatus(campaign)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Voir le statut"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleTestCampaign(campaign.id)}
                        disabled={testingItem === campaign.id}
                        className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                        title="Tester maintenant"
                      >
                        {testingItem === campaign.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Début:</span>
                      <span className="ml-1 text-gray-900">{formatDateTime(campaign.start_date)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Fin:</span>
                      <span className="ml-1 text-gray-900">{formatDateTime(campaign.end_date)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Audience:</span>
                      <span className="ml-1 text-gray-900">{campaign.target_audience.length} contacts</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Envoyés:</span>
                      <span className="ml-1 text-gray-900">{campaign.metrics.sent}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Scheduled Messages Section */}
        <div>
          <h3 className="text-lg font-medium text-gray-900 mb-4">Messages Programmés</h3>
          <div className="space-y-4">
            {scheduledMessages.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Aucun message programmé</p>
              </div>
            ) : (
              scheduledMessages.map((message) => (
                <div key={message.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(message.status)}`}>
                        {message.status}
                      </span>
                      {message.repeat_type !== 'none' && (
                        <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                          {message.repeat_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewMessageStatus(message)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Voir le statut"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleTestMessage(message.id)}
                        disabled={testingItem === message.id}
                        className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                        title="Tester maintenant"
                      >
                        {testingItem === message.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  
                  <p className="text-sm text-gray-900 mb-2 line-clamp-2">{message.message}</p>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Envoi:</span>
                      <span className="ml-1 text-gray-900">{formatDateTime(message.send_at)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Destinataires:</span>
                      <span className="ml-1 text-gray-900">{message.recipients.length}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Campaign Status Modal */}
      {selectedCampaign && campaignStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Statut de la Campagne</h3>
              <button
                onClick={() => {
                  setSelectedCampaign(null);
                  setCampaignStatus(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">{campaignStatus.campaign.name}</h4>
                <p className="text-gray-600">{campaignStatus.campaign.description}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-semibold text-blue-600">{campaignStatus.campaign.metrics.sent}</div>
                  <div className="text-xs text-blue-600">Envoyés</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-semibold text-green-600">{campaignStatus.campaign.metrics.delivered}</div>
                  <div className="text-xs text-green-600">Livrés</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-lg font-semibold text-yellow-600">{campaignStatus.campaign.metrics.opened}</div>
                  <div className="text-xs text-yellow-600">Ouverts</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-lg font-semibold text-purple-600">{campaignStatus.campaign.metrics.clicked}</div>
                  <div className="text-xs text-purple-600">Cliqués</div>
                </div>
              </div>

              {campaignStatus.executionLogs && campaignStatus.executionLogs.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Historique d'Exécution</h4>
                  <div className="space-y-2">
                    {campaignStatus.executionLogs.map((log: any, index: number) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-900">
                            {log.messages_sent} envoyés, {log.messages_failed} échoués
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDateTime(log.executed_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {campaignStatus.nextExecution && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-1">Prochaine Exécution</h4>
                  <p className="text-blue-600">{formatDateTime(campaignStatus.nextExecution.toISOString())}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Message Status Modal */}
      {selectedMessage && messageStatus && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Statut du Message</h3>
              <button
                onClick={() => {
                  setSelectedMessage(null);
                  setMessageStatus(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">Message</h4>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-gray-900 whitespace-pre-wrap">{messageStatus.message.message}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-gray-700 mb-1">Statut</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(messageStatus.message.status)}`}>
                    {messageStatus.message.status}
                  </span>
                </div>
                <div>
                  <h4 className="font-medium text-gray-700 mb-1">Destinataires</h4>
                  <p className="text-gray-900">{messageStatus.message.recipients.length}</p>
                </div>
              </div>

              <div>
                <h4 className="font-medium text-gray-700 mb-1">Programmé pour</h4>
                <p className="text-gray-900">{formatDateTime(messageStatus.message.send_at)}</p>
              </div>

              {messageStatus.message.repeat_type !== 'none' && (
                <div>
                  <h4 className="font-medium text-gray-700 mb-1">Répétition</h4>
                  <p className="text-gray-900">{messageStatus.message.repeat_type}</p>
                </div>
              )}

              {messageStatus.executionLogs && messageStatus.executionLogs.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Historique d'Exécution</h4>
                  <div className="space-y-2">
                    {messageStatus.executionLogs.map((log: any, index: number) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-900">
                            {log.messages_sent} envoyés, {log.messages_failed} échoués
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatDateTime(log.executed_at)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {messageStatus.nextExecution && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-1">Prochaine Exécution</h4>
                  <p className="text-blue-600">{formatDateTime(messageStatus.nextExecution.toISOString())}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Scheduler Status */}
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="w-5 h-5 text-blue-600" />
          <h4 className="font-medium text-blue-800">État du Scheduler</h4>
        </div>
        <div className="text-blue-700 text-sm space-y-1">
          <p>• Le scheduler vérifie les campagnes et messages toutes les minutes</p>
          <p>• Les campagnes sont exécutées automatiquement à leur date de début</p>
          <p>• Les messages répétitifs sont reprogrammés automatiquement</p>
          <p>• Statut actuel: <strong>{schedulerRunning ? 'Actif' : 'Arrêté'}</strong></p>
        </div>
      </div>
    </div>
  );
};

export default CampaignTestingPanel;