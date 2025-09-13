import React, { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, MessageSquare, Users, Clock, Globe, Phone, Trash2 } from 'lucide-react';
import ConversationThread from './ConversationThread';
import MessageTemplateManager from './MessageTemplateManager';

interface Message {
  id: string;
  phone_number?: string;
  web_user_id?: string;
  content: string;
  sender: 'user' | 'bot';
  created_at: string;
  response_time?: number;
  session_id?: string;
  source?: 'whatsapp' | 'web';
}

interface ConversationSummary {
  participantId: string;
  participantType: 'whatsapp' | 'web';
  participantInfo: {
    name?: string;
    phone_number?: string;
    web_user_id?: string;
    country?: string;
    location?: string;
  };
  messages: Message[];
  lastActivity: string;
  messageCount: number;
  userMessageCount: number;
  botMessageCount: number;
  status: 'active' | 'recent' | 'inactive';
  averageResponseTime: number;
}

interface ConversationListProps {
  conversations: Message[];
  onSendMessage?: (participantId: string, message: string) => void;
  onRefresh?: () => void;
  loading?: boolean;
  onDeleteConversations?: (conversationIds: string[]) => Promise<void>;
}

const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  onSendMessage,
  onRefresh,
  loading = false,
  onDeleteConversations
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'whatsapp' | 'web'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'recent' | 'inactive'>('all');
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [conversationSummaries, setConversationSummaries] = useState<ConversationSummary[]>([]);
  const [selectedConversations, setSelectedConversations] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [templateTargetParticipant, setTemplateTargetParticipant] = useState<string | null>(null);

  useEffect(() => {
    processConversations();
  }, [conversations]);

  const processConversations = () => {
    const conversationMap = new Map<string, ConversationSummary>();

    // Group messages by participant
    conversations.forEach(message => {
      const participantId = message.phone_number || message.web_user_id || 'unknown';
      const participantType = message.source === 'web' || message.web_user_id ? 'web' : 'whatsapp';
      
      if (!conversationMap.has(participantId)) {
        // Extract participant info
        const participantInfo: ConversationSummary['participantInfo'] = {};
        
        if (participantType === 'whatsapp') {
          participantInfo.phone_number = message.phone_number;
          // Extract country from phone number (basic implementation)
          if (message.phone_number) {
            participantInfo.country = extractCountryFromPhone(message.phone_number);
          }
        } else {
          participantInfo.web_user_id = message.web_user_id;
          participantInfo.location = 'Web'; // Could be enhanced with IP geolocation
        }

        conversationMap.set(participantId, {
          participantId,
          participantType,
          participantInfo,
          messages: [],
          lastActivity: message.created_at,
          messageCount: 0,
          userMessageCount: 0,
          botMessageCount: 0,
          status: 'inactive',
          averageResponseTime: 0
        });
      }

      const conversation = conversationMap.get(participantId)!;
      conversation.messages.push(message);
      conversation.messageCount++;
      
      if (message.sender === 'user') {
        conversation.userMessageCount++;
      } else {
        conversation.botMessageCount++;
      }

      // Update last activity
      if (new Date(message.created_at) > new Date(conversation.lastActivity)) {
        conversation.lastActivity = message.created_at;
      }
    });

    // Process each conversation
    const summaries = Array.from(conversationMap.values()).map(conversation => {
      // Sort messages by date
      conversation.messages.sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );

      // Calculate status based on last activity
      const timeSinceLastMessage = Date.now() - new Date(conversation.lastActivity).getTime();
      const hoursAgo = timeSinceLastMessage / (1000 * 60 * 60);
      
      if (hoursAgo < 1) {
        conversation.status = 'active';
      } else if (hoursAgo < 24) {
        conversation.status = 'recent';
      } else {
        conversation.status = 'inactive';
      }

      // Calculate average response time
      const botMessages = conversation.messages.filter(m => m.sender === 'bot' && m.response_time);
      conversation.averageResponseTime = botMessages.length > 0
        ? botMessages.reduce((sum, m) => sum + (m.response_time || 0), 0) / botMessages.length
        : 0;

      return conversation;
    });

    // Sort by last activity (most recent first)
    summaries.sort((a, b) => 
      new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
    );

    setConversationSummaries(summaries);
  };

  const extractCountryFromPhone = (phoneNumber: string): string => {
    // Basic country extraction from phone number
    const countryMap: Record<string, string> = {
      '+242': 'Congo',
      '+221': 'Sénégal',
      '+223': 'Mali',
      '+224': 'Guinée',
      '+225': 'Côte d\'Ivoire',
      '+226': 'Burkina Faso',
      '+227': 'Niger',
      '+228': 'Togo',
      '+229': 'Bénin',
      '+233': 'Ghana',
      '+234': 'Nigeria',
      '+237': 'Cameroun',
      '+241': 'Gabon',
      '+243': 'RD Congo',
      '+250': 'Rwanda',
      '+254': 'Kenya',
      '+255': 'Tanzanie',
      '+256': 'Ouganda',
      '+260': 'Zambie',
      '+263': 'Zimbabwe',
      '+265': 'Malawi',
      '+267': 'Botswana'
    };

    for (const [code, country] of Object.entries(countryMap)) {
      if (phoneNumber.startsWith(code)) {
        return country;
      }
    }
    return 'Inconnu';
  };

  const filteredConversations = conversationSummaries.filter(conversation => {
    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchesSearch = 
        conversation.participantInfo.phone_number?.toLowerCase().includes(term) ||
        conversation.participantInfo.web_user_id?.toLowerCase().includes(term) ||
        conversation.participantInfo.name?.toLowerCase().includes(term) ||
        conversation.messages.some(m => m.content.toLowerCase().includes(term));
      
      if (!matchesSearch) return false;
    }

    // Source filter
    if (sourceFilter !== 'all' && conversation.participantType !== sourceFilter) {
      return false;
    }

    // Status filter
    if (statusFilter !== 'all' && conversation.status !== statusFilter) {
      return false;
    }

    return true;
  });

  const getFilterCounts = () => {
    return {
      all: conversationSummaries.length,
      whatsapp: conversationSummaries.filter(c => c.participantType === 'whatsapp').length,
      web: conversationSummaries.filter(c => c.participantType === 'web').length,
      active: conversationSummaries.filter(c => c.status === 'active').length,
      recent: conversationSummaries.filter(c => c.status === 'recent').length,
      inactive: conversationSummaries.filter(c => c.status === 'inactive').length
    };
  };

  const handleSelectConversation = (conversationId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedConversations(prev => [...prev, conversationId]);
    } else {
      setSelectedConversations(prev => prev.filter(id => id !== conversationId));
    }
  };

  const handleDeleteSelected = () => {
    if (selectedConversations.length === 0) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (onDeleteConversations && selectedConversations.length > 0) {
      console.log('🗑️ [CONVERSATION-LIST] Confirming deletion of conversations:', selectedConversations);
      
      // Call the deletion function and refresh the list
      onDeleteConversations(selectedConversations)?.then(() => {
        console.log('✅ [CONVERSATION-LIST] Deletion completed successfully');
        // Clear selection after successful deletion
        setSelectedConversations([]);
      }).catch((error) => {
        console.error('❌ [CONVERSATION-LIST] Error during deletion:', error);
        // Keep selection if deletion failed
      });
    }
    setShowDeleteConfirm(false);
  };

  const handleInsertTemplate = (participantId: string) => {
    setTemplateTargetParticipant(participantId);
    setShowTemplateManager(true);
  };

  const handleSelectTemplate = (template: any) => {
    if (templateTargetParticipant && onSendMessage) {
      onSendMessage(templateTargetParticipant, template.content);
    }
    setShowTemplateManager(false);
    setTemplateTargetParticipant(null);
  };

  const counts = getFilterCounts();

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-red-600" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Conversations Récentes</h3>
              <p className="text-sm text-gray-500">
                {conversationSummaries.length} conversation{conversationSummaries.length !== 1 ? 's' : ''} • 
                {counts.whatsapp} WhatsApp • {counts.web} Web
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedConversations.length > 0 && (
              <button
                onClick={handleDeleteSelected}
                className="flex items-center gap-2 px-3 py-1.5 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer ({selectedConversations.length})
              </button>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Rechercher dans les conversations..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            />
          </div>

          {/* Source Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as any)}
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            >
              <option value="all">Toutes sources ({counts.all})</option>
              <option value="whatsapp">WhatsApp ({counts.whatsapp})</option>
              <option value="web">Web ({counts.web})</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent text-sm"
            >
              <option value="all">Tous statuts</option>
              <option value="active">En ligne ({counts.active})</option>
              <option value="recent">Récent ({counts.recent})</option>
              <option value="inactive">Hors ligne ({counts.inactive})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Conversation List */}
      <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-400" />
            <p className="text-gray-500">Chargement des conversations...</p>
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            {searchTerm || sourceFilter !== 'all' || statusFilter !== 'all' ? (
              <>
                <Filter className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Aucune conversation trouvée</p>
                <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
              </>
            ) : (
              <>
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Aucune conversation pour le moment</p>
                <p className="text-sm mt-1">Les conversations apparaîtront ici après les premiers échanges</p>
              </>
            )}
          </div>
        ) : (
          filteredConversations.map((conversation) => (
            <ConversationThread
              key={conversation.participantId}
              participantId={conversation.participantId}
              participantType={conversation.participantType}
              participantInfo={conversation.participantInfo}
              messages={conversation.messages}
              lastActivity={conversation.lastActivity}
              messageCount={conversation.messageCount}
              status={conversation.status}
              onSelect={(id) => setSelectedConversation(id)}
              isSelected={selectedConversation === conversation.participantId}
              onSendMessage={onSendMessage}
              onSelectForDeletion={handleSelectConversation}
              isSelectedForDeletion={selectedConversations.includes(conversation.participantId)}
              onInsertTemplate={handleInsertTemplate}
            />
          ))
        )}
      </div>

      {/* Summary Footer */}
      {filteredConversations.length > 0 && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Phone className="w-4 h-4 text-green-600" />
                <span>{counts.whatsapp} WhatsApp</span>
              </div>
              <div className="flex items-center gap-1">
                <Globe className="w-4 h-4 text-blue-600" />
                <span>{counts.web} Web</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-green-600">{counts.active} en ligne</span>
              <span className="text-yellow-600">{counts.recent} récents</span>
              <span className="text-gray-500">{counts.inactive} inactifs</span>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Confirmer la suppression</h3>
              <p className="text-gray-600 mb-6">
                Êtes-vous sûr de vouloir supprimer {selectedConversations.length} conversation(s) sélectionnée(s) ? 
                Cette action est irréversible.
              </p>
              <div className="flex justify-end gap-4">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Template Manager Modal */}
      {showTemplateManager && (
        <MessageTemplateManager
          onSelectTemplate={handleSelectTemplate}
          onClose={() => {
            setShowTemplateManager(false);
            setTemplateTargetParticipant(null);
          }}
        />
      )}
    </div>
  );
};

export default ConversationList;