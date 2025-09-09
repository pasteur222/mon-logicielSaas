import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Send, X, Save, RefreshCw, AlertCircle, CheckCircle, Repeat, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendWhatsAppMessages } from '../lib/whatsapp';
import { useAuth } from '../contexts/AuthContext';

interface MessageSchedulerProps {
  onClose: () => void;
}

interface ScheduledMessage {
  id?: string;
  message: string;
  recipients: string[];
  sendAt: Date;
  repeatType: 'none' | 'daily' | 'weekly' | 'monthly';
  status: 'scheduled' | 'sent' | 'failed';
}

const MessageScheduler: React.FC<MessageSchedulerProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [scheduledMessage, setScheduledMessage] = useState<ScheduledMessage>({
    message: '',
    recipients: [],
    sendAt: new Date(),
    repeatType: 'none',
    status: 'scheduled'
  });
  const [scheduledMessages, setScheduledMessages] = useState<ScheduledMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'manage'>('create');

  useEffect(() => {
    loadScheduledMessages();
  }, []);

  const loadScheduledMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*')
        .order('send_at', { ascending: true });

      if (error) throw error;
      
      const formattedMessages = data?.map(msg => ({
        id: msg.id,
        message: msg.message,
        recipients: msg.recipients,
        sendAt: new Date(msg.send_at),
        repeatType: msg.repeat_type,
        status: msg.status
      })) || [];

      setScheduledMessages(formattedMessages);
    } catch (error) {
      console.error('Error loading scheduled messages:', error);
      setError('Failed to load scheduled messages');
    }
  };

  const handleSchedule = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!scheduledMessage.message.trim()) {
        setError('Please enter a message');
        return;
      }

      if (scheduledMessage.recipients.length === 0) {
        setError('Please add recipients');
        return;
      }

      if (scheduledMessage.sendAt <= new Date()) {
        setError('Please select a future date and time');
        return;
      }

      const { error } = await supabase
        .from('scheduled_messages')
        .insert([{
          message: scheduledMessage.message,
          recipients: scheduledMessage.recipients,
          send_at: scheduledMessage.sendAt.toISOString(),
          repeat_type: scheduledMessage.repeatType,
          status: 'scheduled'
        }]);

      if (error) throw error;

      setSuccess('Message scheduled successfully');
      setScheduledMessage({
        message: '',
        recipients: [],
        sendAt: new Date(),
        repeatType: 'none',
        status: 'scheduled'
      });
      
      await loadScheduledMessages();
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error scheduling message:', error);
      setError('Failed to schedule message');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteScheduled = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled message?')) return;

    try {
      const { error } = await supabase
        .from('scheduled_messages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      setSuccess('Scheduled message deleted');
      await loadScheduledMessages();
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error deleting scheduled message:', error);
      setError('Failed to delete scheduled message');
    }
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-semibold text-gray-900">Message Scheduler</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('create')}
              className={`px-6 py-3 border-b-2 text-sm font-medium ${
                activeTab === 'create'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Calendar className="w-5 h-5 inline-block mr-2" />
              Schedule Message
            </button>
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-6 py-3 border-b-2 text-sm font-medium ${
                activeTab === 'manage'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Clock className="w-5 h-5 inline-block mr-2" />
              Manage Scheduled ({scheduledMessages.length})
            </button>
          </nav>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p>{success}</p>
            </div>
          )}

          {activeTab === 'create' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Message
                </label>
                <textarea
                  value={scheduledMessage.message}
                  onChange={(e) => setScheduledMessage(prev => ({ ...prev, message: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  placeholder="Enter your message here..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recipients (one per line)
                </label>
                <textarea
                  value={scheduledMessage.recipients.join('\n')}
                  onChange={(e) => setScheduledMessage(prev => ({ 
                    ...prev, 
                    recipients: e.target.value.split('\n').filter(r => r.trim()) 
                  }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={4}
                  placeholder="+221123456789&#10;+221987654321"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Send Date
                  </label>
                  <input
                    type="date"
                    value={scheduledMessage.sendAt.toISOString().split('T')[0]}
                    onChange={(e) => {
                      const newDate = new Date(e.target.value);
                      newDate.setHours(scheduledMessage.sendAt.getHours());
                      newDate.setMinutes(scheduledMessage.sendAt.getMinutes());
                      setScheduledMessage(prev => ({ ...prev, sendAt: newDate }));
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Send Time
                  </label>
                  <input
                    type="time"
                    value={`${scheduledMessage.sendAt.getHours().toString().padStart(2, '0')}:${scheduledMessage.sendAt.getMinutes().toString().padStart(2, '0')}`}
                    onChange={(e) => {
                      const [hours, minutes] = e.target.value.split(':').map(Number);
                      const newDate = new Date(scheduledMessage.sendAt);
                      newDate.setHours(hours);
                      newDate.setMinutes(minutes);
                      setScheduledMessage(prev => ({ ...prev, sendAt: newDate }));
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Repeat
                </label>
                <select
                  value={scheduledMessage.repeatType}
                  onChange={(e) => setScheduledMessage(prev => ({ 
                    ...prev, 
                    repeatType: e.target.value as typeof scheduledMessage.repeatType 
                  }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="none">No repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              <button
                onClick={handleSchedule}
                disabled={loading || !scheduledMessage.message.trim() || scheduledMessage.recipients.length === 0}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Scheduling...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Schedule Message
                  </>
                )}
              </button>
            </div>
          )}

          {activeTab === 'manage' && (
            <div className="space-y-4">
              {scheduledMessages.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                  <p>No scheduled messages</p>
                </div>
              ) : (
                scheduledMessages.map((msg) => (
                  <div key={msg.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          msg.status === 'scheduled' ? 'bg-blue-100 text-blue-800' :
                          msg.status === 'sent' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {msg.status}
                        </span>
                        {msg.repeatType !== 'none' && (
                          <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                            <Repeat className="w-3 h-3 inline mr-1" />
                            {msg.repeatType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">
                          {formatDateTime(msg.sendAt)}
                        </span>
                        <button
                          onClick={() => handleDeleteScheduled(msg.id!)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    
                    <p className="text-sm text-gray-900 mb-2">{msg.message}</p>
                    
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Users className="w-3 h-3" />
                      <span>{msg.recipients.length} recipients</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageScheduler;