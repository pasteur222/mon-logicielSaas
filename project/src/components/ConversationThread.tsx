import React, { useState } from 'react';
import { MessageSquare, Phone, Globe, MapPin, User, Clock, ChevronRight, X, Send } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  created_at: string;
  response_time?: number;
}

interface ConversationThreadProps {
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
  status: 'active' | 'recent' | 'inactive';
  onSelect: (participantId: string) => void;
  isSelected: boolean;
  onSendMessage?: (participantId: string, message: string) => void;
}

const ConversationThread: React.FC<ConversationThreadProps> = ({
  participantId,
  participantType,
  participantInfo,
  messages,
  lastActivity,
  messageCount,
  status,
  onSelect,
  isSelected,
  onSendMessage
}) => {
  const [showFullConversation, setShowFullConversation] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');

  const getStatusColor = () => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'recent':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'active':
        return 'En ligne';
      case 'recent':
        return 'Récent';
      default:
        return 'Hors ligne';
    }
  };

  const getParticipantDisplayName = () => {
    if (participantType === 'whatsapp') {
      return participantInfo.name || participantInfo.phone_number || 'Client WhatsApp';
    } else {
      return `Client Web ${participantInfo.web_user_id?.substring(0, 8) || 'Inconnu'}`;
    }
  };

  const getParticipantSubtitle = () => {
    if (participantType === 'whatsapp') {
      const parts = [];
      if (participantInfo.phone_number && participantInfo.name) {
        parts.push(participantInfo.phone_number);
      }
      if (participantInfo.country) {
        parts.push(`📍 ${participantInfo.country}`);
      }
      return parts.join(' • ');
    } else {
      const parts = [];
      if (participantInfo.web_user_id) {
        parts.push(`ID: ${participantInfo.web_user_id}`);
      }
      if (participantInfo.location || participantInfo.country) {
        parts.push(`📍 ${participantInfo.location || participantInfo.country}`);
      }
      return parts.join(' • ');
    }
  };

  const getLastMessage = () => {
    if (messages.length === 0) return 'Aucun message';
    const lastMessage = messages[messages.length - 1];
    const preview = lastMessage.content.length > 60 
      ? lastMessage.content.substring(0, 60) + '...'
      : lastMessage.content;
    return `${lastMessage.sender === 'user' ? '👤' : '🤖'} ${preview}`;
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);
    
    if (diffInHours < 1) {
      return 'À l\'instant';
    } else if (diffInHours < 24) {
      return `Il y a ${Math.floor(diffInHours)}h`;
    } else {
      return date.toLocaleDateString('fr-FR', { 
        day: 'numeric', 
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const handleSendReply = () => {
    if (replyMessage.trim() && onSendMessage) {
      onSendMessage(participantId, replyMessage);
      setReplyMessage('');
      setShowFullConversation(false);
    }
  };

  return (
    <>
      <div 
        className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
          isSelected ? 'bg-blue-50 border-blue-200' : ''
        }`}
        onClick={() => onSelect(participantId)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Avatar */}
            <div className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              participantType === 'whatsapp' ? 'bg-green-100' : 'bg-blue-100'
            }`}>
              {participantType === 'whatsapp' ? (
                <Phone className={`w-6 h-6 text-green-600`} />
              ) : (
                <Globe className={`w-6 h-6 text-blue-600`} />
              )}
            </div>

            {/* Conversation Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-medium text-gray-900 truncate">
                  {getParticipantDisplayName()}
                </h4>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${getStatusColor()}`}>
                  {getStatusLabel()}
                </span>
              </div>
              
              {getParticipantSubtitle() && (
                <p className="text-xs text-gray-500 mb-1 truncate">
                  {getParticipantSubtitle()}
                </p>
              )}
              
              <p className="text-sm text-gray-600 truncate">
                {getLastMessage()}
              </p>
            </div>
          </div>

          {/* Conversation Meta */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-3">
            <span className="text-xs text-gray-500">
              {formatTime(lastActivity)}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">
                {messageCount} msg{messageCount > 1 ? 's' : ''}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFullConversation(true);
                }}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                title="Voir la conversation complète"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full Conversation Modal */}
      {showFullConversation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  participantType === 'whatsapp' ? 'bg-green-100' : 'bg-blue-100'
                }`}>
                  {participantType === 'whatsapp' ? (
                    <Phone className="w-5 h-5 text-green-600" />
                  ) : (
                    <Globe className="w-5 h-5 text-blue-600" />
                  )}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">
                    {getParticipantDisplayName()}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {getParticipantSubtitle()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFullConversation(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.sender === 'bot' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.sender === 'bot'
                      ? 'bg-red-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}>
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-xs ${
                        message.sender === 'bot' ? 'text-red-100' : 'text-gray-500'
                      }`}>
                        {message.sender === 'bot' ? 'Assistant' : 'Client'}
                      </span>
                      <span className={`text-xs ${
                        message.sender === 'bot' ? 'text-red-100' : 'text-gray-500'
                      }`}>
                        {new Date(message.created_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Reply */}
            {onSendMessage && (
              <div className="p-4 border-t border-gray-200">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="Tapez votre réponse..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        handleSendReply();
                      }
                    }}
                  />
                  <button
                    onClick={handleSendReply}
                    disabled={!replyMessage.trim()}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default ConversationThread;