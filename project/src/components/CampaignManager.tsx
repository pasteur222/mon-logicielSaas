import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Save, X, Upload, Download, Send, BarChart2, Users, Trophy, Target, AlertCircle, CheckCircle, RefreshCw, Calendar, Clock, Filter, Eye } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface Campaign {
  id: string;
  name: string;
  description: string;
  target_audience: string[];
  start_date: string;
  end_date: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'cancelled';
  message_template: string;
  metrics: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
  };
  created_at: string;
  updated_at: string;
}

const CampaignManager: React.FC = () => {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    target_audience: [] as string[],
    start_date: '',
    end_date: '',
    message_template: '',
    status: 'draft' as const
  });
  const [viewingCampaign, setViewingCampaign] = useState<Campaign | null>(null);

  // Rate limit response constant
  const rateLimitedResponse = {
    code: "rate-limited",
    message: "You have hit the rate limit. Please upgrade to keep chatting.",
    providerLimitHit: false,
    isRetryable: true,
  };

  useEffect(() => {
    loadCampaigns();
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

  const handleCreateCampaign = async () => {
    try {
      setError(null);
      
      if (!newCampaign.name || !newCampaign.message_template) {
        setError('Veuillez remplir tous les champs obligatoires');
        return;
      }

      const { error } = await supabase
        .from('campaigns')
        .insert([{
          name: newCampaign.name,
          description: newCampaign.description,
          target_audience: newCampaign.target_audience,
          start_date: newCampaign.start_date,
          end_date: newCampaign.end_date,
          message_template: newCampaign.message_template,
          status: newCampaign.status,
          metrics: { sent: 0, delivered: 0, opened: 0, clicked: 0 }
        }]);

      if (error) throw error;

      setSuccess('Campagne créée avec succès');
      setShowCreateModal(false);
      setNewCampaign({
        name: '',
        description: '',
        target_audience: [],
        start_date: '',
        end_date: '',
        message_template: '',
        status: 'draft'
      });
      
      await loadCampaigns();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error creating campaign:', err);
      setError('Erreur lors de la création de la campagne');
    }
  };

  const handleEditCampaign = async () => {
    try {
      setError(null);
      
      if (!editingCampaign || !newCampaign.name || !newCampaign.message_template) {
        setError('Veuillez remplir tous les champs obligatoires');
        return;
      }

      const { error } = await supabase
        .from('campaigns')
        .update({
          name: newCampaign.name,
          description: newCampaign.description,
          target_audience: newCampaign.target_audience,
          start_date: newCampaign.start_date,
          end_date: newCampaign.end_date,
          message_template: newCampaign.message_template,
          status: newCampaign.status,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingCampaign.id);

      if (error) throw error;

      setSuccess('Campagne modifiée avec succès');
      setEditingCampaign(null);
      setNewCampaign({
        name: '',
        description: '',
        target_audience: [],
        start_date: '',
        end_date: '',
        message_template: '',
        status: 'draft'
      });
      
      await loadCampaigns();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error editing campaign:', err);
      setError('Erreur lors de la modification de la campagne');
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      case 'scheduled': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'completed': return 'Terminée';
      case 'scheduled': return 'Planifiée';
      case 'cancelled': return 'Annulée';
      case 'draft': return 'Brouillon';
      default: return status;
    }
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
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Gestion des Campagnes</h3>
          <p className="text-sm text-gray-500">Créez et gérez vos campagnes marketing WhatsApp</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          <Plus className="w-4 h-4" />
          Nouvelle Campagne
        </button>
      </div>

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

      <div className="grid grid-cols-1 gap-6">
        {campaigns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Target className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>Aucune campagne créée</p>
            <p className="text-sm mt-1">Créez votre première campagne pour commencer</p>
          </div>
        ) : (
          campaigns.map((campaign) => (
            <div key={campaign.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:border-red-300 transition-colors">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="text-lg font-medium text-gray-900">{campaign.name}</h4>
                  <p className="text-sm text-gray-600">{campaign.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(campaign.status)}`}>
                    {getStatusLabel(campaign.status)}
                  </span>
                  <button
                    onClick={() => setViewingCampaign(campaign)}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                    title="Voir les détails"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingCampaign(campaign);
                      setNewCampaign({
                        name: campaign.name,
                        description: campaign.description,
                        target_audience: campaign.target_audience,
                        start_date: campaign.start_date,
                        end_date: campaign.end_date,
                        message_template: campaign.message_template,
                        status: campaign.status
                      });
                    }}
                    className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                    title="Modifier la campagne"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCampaign(campaign.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    title="Supprimer la campagne"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-semibold text-blue-600">{campaign.metrics.sent}</div>
                  <div className="text-xs text-blue-600">Envoyés</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-semibold text-green-600">{campaign.metrics.delivered}</div>
                  <div className="text-xs text-green-600">Livrés</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-lg font-semibold text-yellow-600">{campaign.metrics.opened}</div>
                  <div className="text-xs text-yellow-600">Ouverts</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-lg font-semibold text-purple-600">{campaign.metrics.clicked}</div>
                  <div className="text-xs text-purple-600">Cliqués</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(campaign.start_date).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {campaign.target_audience.length} contacts
                  </span>
                </div>
                <span>Créée le {new Date(campaign.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create Campaign Modal */}
      {(showCreateModal || editingCampaign) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">
                {editingCampaign ? 'Modifier la Campagne' : 'Nouvelle Campagne'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingCampaign(null);
                  setNewCampaign({
                    name: '',
                    description: '',
                    target_audience: [],
                    start_date: '',
                    end_date: '',
                    message_template: '',
                    status: 'draft'
                  });
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de la campagne
                </label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Ex: Campagne Rentrée 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={3}
                  placeholder="Description de la campagne..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Message template
                </label>
                <textarea
                  value={newCampaign.message_template}
                  onChange={(e) => setNewCampaign(prev => ({ ...prev, message_template: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  rows={4}
                  placeholder="Votre message ici... Utilisez {{nom}} pour personnaliser"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de début
                  </label>
                  <input
                    type="datetime-local"
                    value={newCampaign.start_date}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date de fin
                  </label>
                  <input
                    type="datetime-local"
                    value={newCampaign.end_date}
                    onChange={(e) => setNewCampaign(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingCampaign(null);
                    setNewCampaign({
                      name: '',
                      description: '',
                      target_audience: [],
                      start_date: '',
                      end_date: '',
                      message_template: '',
                      status: 'draft'
                    });
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  Annuler
                </button>
                <button
                  onClick={editingCampaign ? handleEditCampaign : handleCreateCampaign}
                  disabled={!newCampaign.name || !newCampaign.message_template}
                  className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {editingCampaign ? 'Modifier la Campagne' : 'Créer la Campagne'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Campaign Modal */}
      {viewingCampaign && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h3 className="text-xl font-semibold text-gray-900">Détails de la Campagne</h3>
              <button
                onClick={() => setViewingCampaign(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Nom de la campagne</h4>
                  <p className="text-gray-900">{viewingCampaign.name}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Statut</h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(viewingCampaign.status)}`}>
                    {getStatusLabel(viewingCampaign.status)}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Description</h4>
                <p className="text-gray-900">{viewingCampaign.description || 'Aucune description'}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Date de début</h4>
                  <p className="text-gray-900">{new Date(viewingCampaign.start_date).toLocaleString()}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Date de fin</h4>
                  <p className="text-gray-900">{new Date(viewingCampaign.end_date).toLocaleString()}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Message template</h4>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-gray-900 whitespace-pre-wrap">{viewingCampaign.message_template}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Audience cible</h4>
                <p className="text-gray-900">{viewingCampaign.target_audience.length} contact(s)</p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-4">Métriques de performance</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-lg font-semibold text-blue-600">{viewingCampaign.metrics.sent}</div>
                    <div className="text-xs text-blue-600">Envoyés</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-lg font-semibold text-green-600">{viewingCampaign.metrics.delivered}</div>
                    <div className="text-xs text-green-600">Livrés</div>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <div className="text-lg font-semibold text-yellow-600">{viewingCampaign.metrics.opened}</div>
                    <div className="text-xs text-yellow-600">Ouverts</div>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-lg font-semibold text-purple-600">{viewingCampaign.metrics.clicked}</div>
                    <div className="text-xs text-purple-600">Cliqués</div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t">
                <button
                  onClick={() => {
                    setEditingCampaign(viewingCampaign);
                    setNewCampaign({
                      name: viewingCampaign.name,
                      description: viewingCampaign.description,
                      target_audience: viewingCampaign.target_audience,
                      start_date: viewingCampaign.start_date,
                      end_date: viewingCampaign.end_date,
                      message_template: viewingCampaign.message_template,
                      status: viewingCampaign.status
                    });
                    setViewingCampaign(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <Edit className="w-4 h-4" />
                  Modifier
                </button>
                <button
                  onClick={() => setViewingCampaign(null)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampaignManager;