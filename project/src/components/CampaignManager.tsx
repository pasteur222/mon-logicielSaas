import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Upload, Download, Send, BarChart2, Users, Trophy, Target, AlertCircle, CheckCircle, RefreshCw, Calendar, Clock, Play, Pause, Eye, Settings } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { 
  initializeCampaignScheduler, 
  stopCampaignScheduler, 
  getCampaignStatus,
  triggerCampaignExecution,
  validateCampaign,
  type Campaign 
} from '../lib/campaign-scheduler';
import { uploadWhatsAppMedia } from '../lib/whatsapp';

interface CampaignManagerProps {
  onClose?: () => void;
}

interface CampaignFormData {
  name: string;
  description: string;
  target_audience: string[];
  start_date: string;
  end_date: string;
  message_template: string;
  media?: {
    type: 'image' | 'video' | 'document';
    url: string;
  };
  variables?: Record<string, string>;
}

const CampaignManager: React.FC<CampaignManagerProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCampaignEditor, setShowCampaignEditor] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [formData, setFormData] = useState<CampaignFormData>({
    name: '',
    description: '',
    target_audience: [],
    start_date: new Date().toISOString().slice(0, 16),
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
    message_template: '',
    variables: {}
  });
  const [audienceText, setAudienceText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [schedulerRunning, setSchedulerRunning] = useState(false);
  const [testingCampaign, setTestingCampaign] = useState<string | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [campaignStatusData, setCampaignStatusData] = useState<any>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [mediaUploadError, setMediaUploadError] = useState<string | null>(null);

  useEffect(() => {
    loadCampaigns();
    
    // Initialize scheduler
    initializeCampaignScheduler();
    setSchedulerRunning(true);
    
    return () => {
      stopCampaignScheduler();
    };
  }, []);

  const loadCampaigns = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (err) {
      console.error('Error loading campaigns:', err);
      setError('Impossible de charger les campagnes');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCampaign = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      // Validate form data
      const validation = validateCampaign({
        ...formData,
        target_audience: audienceText.split('\n').filter(phone => phone.trim())
      });

      if (!validation.isValid) {
        setError(validation.errors.join(', '));
        return;
      }

      const campaignData = {
        name: formData.name,
        description: formData.description,
        target_audience: audienceText.split('\n').filter(phone => phone.trim()),
        start_date: formData.start_date,
        end_date: formData.end_date,
        message_template: formData.message_template,
        status: 'draft',
        metrics: {
          sent: 0,
          delivered: 0,
          opened: 0,
          clicked: 0
        },
        user_id: user?.id,
        media: formData.media,
        variables: formData.variables
      };

      if (editingCampaign) {
        // Update existing campaign
        const { error } = await supabase
          .from('campaigns')
          .update({
            ...campaignData,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingCampaign.id);

        if (error) throw error;
        setSuccess('Campagne mise à jour avec succès');
      } else {
        // Create new campaign
        const { error } = await supabase
          .from('campaigns')
          .insert([campaignData]);

        if (error) throw error;
        setSuccess('Campagne créée avec succès');
      }

      setShowCampaignEditor(false);
      setEditingCampaign(null);
      resetForm();
      await loadCampaigns();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving campaign:', err);
      setError('Erreur lors de la sauvegarde de la campagne');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette campagne ?')) return;

    try {
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setSuccess('Campagne supprimée avec succès');
      await loadCampaigns();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error deleting campaign:', err);
      setError('Erreur lors de la suppression de la campagne');
    }
  };

  const handleTestCampaign = async (campaignId: string) => {
    try {
      setTestingCampaign(campaignId);
      setError(null);
      
      await triggerCampaignExecution(campaignId);
      setSuccess('Campagne exécutée avec succès');
      
      // Reload campaigns to see updated status
      await loadCampaigns();
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error testing campaign:', err);
      setError(`Erreur lors du test: ${err.message}`);
    } finally {
      setTestingCampaign(null);
    }
  };

  const handleViewCampaignStatus = async (campaign: Campaign) => {
    try {
      setSelectedCampaign(campaign);
      const status = await getCampaignStatus(campaign.id);
      setCampaignStatusData(status);
    } catch (err) {
      console.error('Error getting campaign status:', err);
      setError('Impossible de charger le statut de la campagne');
    }
  };

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingMedia(true);
      setMediaUploadError(null);
      setError(null);

      console.log('📤 [CAMPAIGN-MANAGER] Starting media upload:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type
      });

      // Upload to Supabase Storage and get public URL
      const mediaUrl = await uploadWhatsAppMedia(file, user?.id);
      
      // Determine media type
      let mediaType: 'image' | 'video' | 'document' = 'document';
      if (file.type.startsWith('image/')) {
        mediaType = 'image';
      } else if (file.type.startsWith('video/')) {
        mediaType = 'video';
      }

      // Set the media for the campaign
      setFormData(prev => ({
        ...prev,
        media: {
          type: mediaType,
          url: mediaUrl
        }
      }));

      console.log('✅ [CAMPAIGN-MANAGER] Media upload successful:', {
        fileName: file.name,
        mediaType,
        mediaUrl: mediaUrl.substring(0, 50) + '...'
      });

    } catch (err) {
      console.error('❌ [CAMPAIGN-MANAGER] Media upload failed:', err);
      setMediaUploadError(err instanceof Error ? err.message : 'Failed to upload media');
    } finally {
      setUploadingMedia(false);
      // Reset the input
      event.target.value = '';
    }
  };

  const handleRemoveMedia = () => {
    setFormData(prev => ({
      ...prev,
      media: undefined
    }));
    setMediaUploadError(null);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      target_audience: [],
      start_date: new Date().toISOString().slice(0, 16),
      end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
      message_template: '',
      variables: {}
    });
    setAudienceText('');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      case 'scheduled':
        return 'bg-yellow-100 text-yellow-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
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
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
          <CheckCircle className="w-5 h-5 flex-shrink-0" />
          <p>{success}</p>
        </div>
      )}

      {mediaUploadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{mediaUploadError}</p>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Gestion des Campagnes</h3>
          <p className="text-sm text-gray-500">Créez et gérez vos campagnes marketing WhatsApp</p>
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
            onClick={() => {
              setShowCampaignEditor(true);
              setEditingCampaign(null);
              resetForm();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Plus className="w-4 h-4" />
            Nouvelle Campagne
          </button>
        </div>
      </div>

      {/* Campaign List */}
      <div className="space-y-4">
        {campaigns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Target className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>Aucune campagne créée</p>
            <p className="text-sm mt-1">Créez votre première campagne pour commencer</p>
          </div>
        ) : (
          campaigns.map((campaign) => (
            <div key={campaign.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:border-red-200 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-gray-900">{campaign.name}</h4>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(campaign.status)}`}>
                      {campaign.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600">{campaign.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleViewCampaignStatus(campaign)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Voir le statut"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleTestCampaign(campaign.id)}
                    disabled={testingCampaign === campaign.id}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg disabled:opacity-50"
                    title="Tester maintenant"
                  >
                    {testingCampaign === campaign.id ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setEditingCampaign(campaign);
                      setFormData({
                        name: campaign.name,
                        description: campaign.description,
                        target_audience: campaign.target_audience,
                        start_date: campaign.start_date,
                        end_date: campaign.end_date,
                        message_template: campaign.message_template,
                        media: campaign.media,
                        variables: campaign.variables
                      });
                      setAudienceText(campaign.target_audience.join('\n'));
                      setShowCampaignEditor(true);
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Modifier"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCampaign(campaign.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-semibold text-blue-600">{campaign.metrics?.sent || 0}</div>
                  <div className="text-xs text-blue-600">Envoyés</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-semibold text-green-600">{campaign.metrics?.delivered || 0}</div>
                  <div className="text-xs text-green-600">Livrés</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-lg font-semibold text-yellow-600">{campaign.metrics?.opened || 0}</div>
                  <div className="text-xs text-yellow-600">Ouverts</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-lg font-semibold text-purple-600">{campaign.metrics?.clicked || 0}</div>
                  <div className="text-xs text-purple-600">Cliqués</div>
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
                  <span className="text-gray-500">Créée:</span>
                  <span className="ml-1 text-gray-900">{formatDateTime(campaign.created_at)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Campaign Editor Modal */}
      {showCampaignEditor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">
                {editingCampaign ? 'Modifier la Campagne' : 'Nouvelle Campagne'}
              </h3>
              <button
                onClick={() => setShowCampaignEditor(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de la campagne
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Ex: Promotion Été 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={3}
                  placeholder="Description de la campagne..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Audience cible (un numéro par ligne)
                </label>
                <textarea
                  value={audienceText}
                  onChange={(e) => setAudienceText(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={6}
                  placeholder="+221123456789&#10;+221987654321"
                />
                <p className="text-sm text-gray-500 mt-1">
                  {audienceText.split('\n').filter(line => line.trim()).length} numéro(s)
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de début
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.start_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de fin
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.end_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Template de message
                </label>
                <textarea
                  value={formData.message_template}
                  onChange={(e) => setFormData(prev => ({ ...prev, message_template: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={4}
                  placeholder="Votre message ici... Utilisez {{variable}} pour la personnalisation"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Média (Optionnel)
                </label>
                
                {!formData.media ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      id="campaign-media-upload"
                      className="hidden"
                      accept="image/*,video/*,.pdf,.doc,.docx"
                      onChange={handleMediaUpload}
                      disabled={uploadingMedia}
                    />
                    <label
                      htmlFor="campaign-media-upload"
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors ${
                        uploadingMedia 
                          ? 'bg-gray-400 text-white cursor-not-allowed' 
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {uploadingMedia ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          Upload en cours...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Ajouter un média
                        </>
                      )}
                    </label>
                  </div>
                ) : (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {formData.media.type === 'image' && <Image className="w-5 h-5 text-blue-600" />}
                        {formData.media.type === 'video' && <Video className="w-5 h-5 text-blue-600" />}
                        {formData.media.type === 'document' && <File className="w-5 h-5 text-blue-600" />}
                        <div>
                          <p className="text-sm font-medium text-blue-800">
                            {formData.media.type === 'image' ? 'Image' : 
                             formData.media.type === 'video' ? 'Vidéo' : 'Document'} ajouté
                          </p>
                          <p className="text-xs text-blue-600">
                            Sera envoyé avec chaque message
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleRemoveMedia}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-gray-200">
                <button
                  onClick={() => setShowCampaignEditor(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  Annuler
                </button>
                <button
                  onClick={handleSaveCampaign}
                  disabled={isSaving || !formData.name || !formData.message_template || audienceText.split('\n').filter(line => line.trim()).length === 0}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Enregistrement...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {editingCampaign ? 'Mettre à jour' : 'Créer la campagne'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Campaign Status Modal */}
      {selectedCampaign && campaignStatusData && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Statut de la Campagne</h3>
              <button
                onClick={() => {
                  setSelectedCampaign(null);
                  setCampaignStatusData(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h4 className="font-medium text-gray-900 mb-2">{campaignStatusData.campaign.name}</h4>
                <p className="text-gray-600">{campaignStatusData.campaign.description}</p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-semibold text-blue-600">{campaignStatusData.campaign.metrics?.sent || 0}</div>
                  <div className="text-xs text-blue-600">Envoyés</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-semibold text-green-600">{campaignStatusData.campaign.metrics?.delivered || 0}</div>
                  <div className="text-xs text-green-600">Livrés</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-lg font-semibold text-yellow-600">{campaignStatusData.campaign.metrics?.opened || 0}</div>
                  <div className="text-xs text-yellow-600">Ouverts</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-lg font-semibold text-purple-600">{campaignStatusData.campaign.metrics?.clicked || 0}</div>
                  <div className="text-xs text-purple-600">Cliqués</div>
                </div>
              </div>

              {campaignStatusData.executionLogs && campaignStatusData.executionLogs.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Historique d'Exécution</h4>
                  <div className="space-y-2">
                    {campaignStatusData.executionLogs.map((log: any, index: number) => (
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

              {campaignStatusData.nextExecution && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-medium text-blue-800 mb-1">Prochaine Exécution</h4>
                  <p className="text-blue-600">{formatDateTime(campaignStatusData.nextExecution.toISOString())}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignManager;