import React, { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { QrCode, Smartphone, CheckCircle, XCircle, RefreshCw, Loader2, AlertTriangle, Info, Upload, Send, Users, FileText, Plus, X, MessageSquare, Power, Edit, Trash2, Image, FileVideo, File as FilePdf } from 'lucide-react';
import Papa from 'papaparse';
import BackButton from '../components/BackButton';
import RichTextEditor from '../components/RichTextEditor';
import { useAuth } from '../contexts/AuthContext';
import { decrementBusinessMessageCount, checkBusinessSubscriptionStatus } from '../lib/business-subscription';
import { useNavigate } from 'react-router-dom';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface WhatsAppSession {
  id: string;
  user_id: string;
  qr_code: string | null;
  status: 'pending' | 'connected' | 'disconnected';
  created_at: string;
  updated_at: string;
}

interface Contact {
  phoneNumber: string;
  variables: Record<string, string>;
}

interface MessageStatus {
  phoneNumber: string;
  status: 'pending' | 'sent' | 'error';
  error?: string;
}

interface AutoReply {
  id: string;
  trigger_words: string[];
  response: string;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

interface SubscriptionInfo {
  active: boolean;
  plan?: string;
  messagesRemaining?: number | null;
  endDate?: string;
}

interface MediaFile {
  file: File;
  type: 'image' | 'video' | 'pdf';
  previewUrl: string;
}

const Business = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [session, setSession] = useState<WhatsAppSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [messageStatuses, setMessageStatuses] = useState<MessageStatus[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [variables, setVariables] = useState<string[]>([]);
  const [autoReplies, setAutoReplies] = useState<AutoReply[]>([]);
  const [showAutoReplyEditor, setShowAutoReplyEditor] = useState(false);
  const [editingReply, setEditingReply] = useState<AutoReply | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newAutoReply, setNewAutoReply] = useState({
    trigger_words: '',
    response: '',
    priority: 0,
    is_active: true
  });
  const [subscription, setSubscription] = useState<SubscriptionInfo>({ 
    active: true,
    plan: 'enterprise',
    messagesRemaining: null,
    endDate: new Date(2099, 11, 31).toISOString()
  });
  const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);

  useEffect(() => {
    if (user) {
      loadSession();
      loadAutoReplies();
    }
    
    const channel = supabase
      .channel('whatsapp_sessions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_sessions',
          filter: `user_id=eq.${user?.id}`
        },
        (payload) => {
          if (payload.new) {
            setSession(payload.new as WhatsAppSession);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  const loadSession = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error) throw error;
      setSession(data);
    } catch (error) {
      console.error('Error loading session:', error);
      setError('Failed to load WhatsApp session');
    } finally {
      setLoading(false);
    }
  };

  const loadAutoReplies = async () => {
    try {
      const { data, error } = await supabase
        .from('whatsapp_auto_replies')
        .select('*')
        .eq('user_id', user?.id)
        .order('priority', { ascending: false });

      if (error) throw error;
      setAutoReplies(data || []);
    } catch (error) {
      console.error('Error loading auto-replies:', error);
      setError('Failed to load auto-reply rules');
    }
  };

  const startConnection = async () => {
    try {
      setConnecting(true);
      setError(null);

      // Open WhatsApp Web in a new tab
      window.open('https://web.whatsapp.com/', '_blank');
      
      // Create a session record in the database
      const { data, error } = await supabase
        .from('whatsapp_sessions')
        .insert({
          user_id: user?.id,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;
      
      setSession(data);
      
      // Simulate connection after a delay (in a real app, this would be handled by a webhook)
      setTimeout(() => {
        updateSessionStatus(data.id, 'connected');
      }, 10000);
      
    } catch (error) {
      console.error('Error starting connection:', error);
      setError('Failed to start WhatsApp connection');
    } finally {
      setConnecting(false);
    }
  };

  const updateSessionStatus = async (sessionId: string, status: 'pending' | 'connected' | 'disconnected') => {
    try {
      const { error } = await supabase
        .from('whatsapp_sessions')
        .update({ 
          status,
          updated_at: new Date().toISOString()
        })
        .eq('id', sessionId);

      if (error) throw error;
      
      // Update local state
      setSession(prev => prev ? { ...prev, status } : null);
    } catch (error) {
      console.error('Error updating session status:', error);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      complete: (results) => {
        const parsedContacts: Contact[] = results.data
          .filter(row => row.phoneNumber)
          .map(row => ({
            phoneNumber: row.phoneNumber,
            variables: Object.keys(row)
              .filter(key => key !== 'phoneNumber')
              .reduce((acc, key) => ({
                ...acc,
                [key]: row[key]
              }), {})
          }));

        const allVariables = Array.from(
          new Set(
            parsedContacts.flatMap(contact => 
              Object.keys(contact.variables)
            )
          )
        );

        setVariables(allVariables);
        setContacts(parsedContacts);
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        setError('Failed to parse contact file');
      }
    });
  };

  const handleSaveAutoReply = async () => {
    try {
      const trigger_words = newAutoReply.trigger_words
        .split(',')
        .map(word => word.trim().toLowerCase())
        .filter(word => word.length > 0);

      if (!trigger_words.length || !newAutoReply.response) {
        setError('Please provide trigger words and a response');
        return;
      }

      const { data, error } = await supabase
        .from('whatsapp_auto_replies')
        .insert([{
          user_id: user?.id,
          trigger_words,
          response: newAutoReply.response,
          priority: newAutoReply.priority,
          is_active: newAutoReply.is_active
        }])
        .select()
        .single();

      if (error) throw error;

      setAutoReplies(prev => [...prev, data]);
      setShowAutoReplyEditor(false);
      setNewAutoReply({
        trigger_words: '',
        response: '',
        priority: 0,
        is_active: true
      });
    } catch (error) {
      console.error('Error saving auto-reply:', error);
      setError('Failed to save auto-reply rule');
    }
  };

  const handleUpdateAutoReply = async (id: string, updates: Partial<AutoReply>) => {
    try {
      const { error } = await supabase
        .from('whatsapp_auto_replies')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      setAutoReplies(prev =>
        prev.map(reply =>
          reply.id === id ? { ...reply, ...updates } : reply
        )
      );
    } catch (error) {
      console.error('Error updating auto-reply:', error);
      setError('Failed to update auto-reply rule');
    }
  };

  const handleDeleteAutoReply = async (id: string) => {
    try {
      const { error } = await supabase
        .from('whatsapp_auto_replies')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setAutoReplies(prev => prev.filter(reply => reply.id !== id));
    } catch (error) {
      console.error('Error deleting auto-reply:', error);
      setError('Failed to delete auto-reply rule');
    }
  };

  const handleMediaUpload = (event: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'video' | 'pdf') => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size exceeds 10MB limit');
      return;
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    
    setMediaFile({
      file,
      type,
      previewUrl
    });
  };

  const removeMedia = () => {
    if (mediaFile) {
      URL.revokeObjectURL(mediaFile.previewUrl);
      setMediaFile(null);
    }
  };

  const handleCancel = () => {
    setSending(false);
    setShowResults(false);
    setMessageStatuses([]);
  };

  const sendMessages = async () => {
    // Allow sending if either message or media file is present
    if ((!message && !mediaFile) || !contacts.length) return;

    try {
      setSending(true);
      setError(null);
      setMessageStatuses([]);
      setShowResults(true);

      const results: MessageStatus[] = [];

      for (const contact of contacts) {
        try {
          let personalizedMessage = message;
          Object.entries(contact.variables).forEach(([key, value]) => {
            personalizedMessage = personalizedMessage.replace(
              new RegExp(`{{${key}}}`, 'g'),
              value
            );
          });

          // Prepare media data if present
          let mediaData;
          if (mediaFile) {
            // In a real app, you would upload the file to a storage service
            // and get a URL. For this example, we'll use the local preview URL
            mediaData = {
              type: mediaFile.type,
              url: mediaFile.previewUrl
            };
          }

          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messages: {
                phoneNumber: contact.phoneNumber,
                message: personalizedMessage,
                media: mediaData
              },
              userId: user?.id
            })
          });

          if (!response.ok) {
            throw new Error('Failed to send message');
          }

          results.push({
            phoneNumber: contact.phoneNumber,
            status: 'sent'
          });
        } catch (error) {
          results.push({
            phoneNumber: contact.phoneNumber,
            status: 'error',
            error: error instanceof Error ? error.message : 'Failed to send message'
          });
        }

        setMessageStatuses([...results]);
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Error sending messages:', error);
      setError('Failed to send messages');
    } finally {
      setSending(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'disconnected':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'pending':
        return <RefreshCw className="w-5 h-5 text-yellow-600 animate-spin" />;
      case 'disconnected':
        return <XCircle className="w-5 h-5 text-red-600" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <BackButton />
      </div>

      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="p-8 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <Smartphone className="w-8 h-8 text-red-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">WhatsApp Business</h1>
                <p className="text-gray-600">Connect your WhatsApp account to start messaging</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Subscription Status */}
            <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <h3 className="font-medium text-gray-900">
                      Abonnement Enterprise Actif
                    </h3>
                    <p className="text-sm text-gray-600">
                      Messages illimités
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {session ? (
              <div className="space-y-6">
                {/* Status Bar */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`px-4 py-2 rounded-full border flex items-center gap-2 ${getStatusColor(session.status)}`}>
                      {getStatusIcon(session.status)}
                      <span className="font-medium capitalize">{session.status}</span>
                    </div>
                    <span className="text-sm text-gray-500">
                      Last updated: {new Date(session.updated_at).toLocaleString()}
                    </span>
                  </div>
                  {session.status === 'disconnected' && (
                    <button
                      onClick={startConnection}
                      disabled={connecting}
                      className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Reconnect
                    </button>
                  )}
                </div>

                {/* QR Code Section */}
                {session.status === 'pending' && (
                  <div className="bg-white p-8 rounded-lg border-2 border-dashed border-gray-200">
                    <div className="max-w-sm mx-auto text-center">
                      <QrCode className="w-8 h-8 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">
                        Connect WhatsApp
                      </h3>
                      <p className="text-sm text-gray-600 mb-6">
                        WhatsApp Web should have opened in a new tab. Please scan the QR code there with your phone's WhatsApp app.
                      </p>
                      <p className="text-xs text-gray-500 mt-4 flex items-center justify-center gap-1">
                        <Info className="w-4 h-4" />
                        If WhatsApp Web didn't open, please click the button below
                      </p>
                      <button
                        onClick={() => window.open('https://web.whatsapp.com/', '_blank')}
                        className="mt-4 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        Open WhatsApp Web
                      </button>
                    </div>
                  </div>
                )}

                {/* Connected State with Messaging Interface */}
                {session.status === 'connected' && (
                  <div className="space-y-8">
                    <div className="bg-green-50 border border-green-200 p-6 rounded-lg">
                      <div className="flex items-center gap-3 mb-4">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                        <h3 className="text-lg font-medium text-green-900">WhatsApp Connected</h3>
                      </div>
                      <p className="text-green-700">
                        Your WhatsApp account is connected and ready to use. You can now send messages to your contacts.
                      </p>
                    </div>

                    {/* Contact Upload Section */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Upload Contacts</h3>
                      <div className="space-y-4">
                        <div className="flex items-start gap-4">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Import contacts (CSV)
                            </label>
                            <div className="flex items-center gap-4">
                              <input
                                type="file"
                                accept=".csv"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="contact-file"
                              />
                              <label
                                htmlFor="contact-file"
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
                              >
                                <Upload className="w-4 h-4" />
                                Choose File
                              </label>
                              {contacts.length > 0 && (
                                <span className="text-sm text-gray-600">
                                  {contacts.length} contacts loaded
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-sm text-gray-500">
                              Upload a CSV file with columns: phoneNumber, name, etc.
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              const template = 'phoneNumber,name,company\n+1234567890,John Doe,ACME Corp';
                              const blob = new Blob([template], { type: 'text/csv' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = 'contacts_template.csv';
                              document.body.appendChild(a);
                              a.click();
                              document.body.removeChild(a);
                              URL.revokeObjectURL(url);
                            }}
                            className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                          >
                            <FileText className="w-4 h-4" />
                            Download Template
                          </button>
                        </div>

                        {variables.length > 0 && (
                          <div className="bg-gray-50 p-4 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-900 mb-2">
                              Available Variables
                            </h4>
                            <div className="flex flex-wrap gap-2">
                              {variables.map((variable) => (
                                <span
                                  key={variable}
                                  className="px-2 py-1 bg-white border border-gray-200 rounded text-sm text-gray-600"
                                >
                                  {`{{${variable}}}`}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Message Composer */}
                    <div className="border-t border-gray-200 pt-8">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Compose Message</h3>
                      <div className="space-y-4">
                        <RichTextEditor
                          value={message}
                          onChange={setMessage}
                          placeholder="Type your message here... Use {{variable}} for personalization"
                        />

                        {/* Media Upload Section */}
                        <div className="space-y-4">
                          <h4 className="text-sm font-medium text-gray-700">Add Media (optional)</h4>
                          
                          {mediaFile ? (
                            <div className="p-4 bg-gray-50 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  {mediaFile.type === 'image' && <Image className="w-5 h-5 text-blue-600" />}
                                  {mediaFile.type === 'video' && <FileVideo className="w-5 h-5 text-purple-600" />}
                                  {mediaFile.type === 'pdf' && <FilePdf className="w-5 h-5 text-red-600" />}
                                  <span className="font-medium text-gray-900">
                                    {mediaFile.file.name}
                                  </span>
                                </div>
                                <button
                                  onClick={removeMedia}
                                  className="p-1 text-gray-500 hover:text-red-600 rounded-full hover:bg-gray-100"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </div>
                              
                              {mediaFile.type === 'image' && (
                                <div className="mt-2 max-w-xs mx-auto">
                                  <img 
                                    src={mediaFile.previewUrl} 
                                    alt="Preview" 
                                    className="rounded-lg max-h-40 object-contain"
                                  />
                                </div>
                              )}
                              
                              {mediaFile.type === 'video' && (
                                <div className="mt-2 max-w-xs mx-auto">
                                  <video 
                                    src={mediaFile.previewUrl} 
                                    controls 
                                    className="rounded-lg max-h-40 w-full"
                                  />
                                </div>
                              )}
                              
                              {mediaFile.type === 'pdf' && (
                                <div className="mt-2 p-4 bg-red-50 rounded-lg text-center">
                                  <FilePdf className="w-10 h-10 text-red-600 mx-auto mb-2" />
                                  <p className="text-sm text-gray-700">PDF Document</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-3">
                              <input
                                type="file"
                                id="image-upload"
                                accept="image/*"
                                onChange={(e) => handleMediaUpload(e, 'image')}
                                className="hidden"
                              />
                              <label
                                htmlFor="image-upload"
                                className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 cursor-pointer"
                              >
                                <Image className="w-4 h-4" />
                                Add Image
                              </label>
                              
                              <input
                                type="file"
                                id="video-upload"
                                accept="video/*"
                                onChange={(e) => handleMediaUpload(e, 'video')}
                                className="hidden"
                              />
                              <label
                                htmlFor="video-upload"
                                className="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 rounded-lg hover:bg-purple-100 cursor-pointer"
                              >
                                <FileVideo className="w-4 h-4" />
                                Add Video
                              </label>
                              
                              <input
                                type="file"
                                id="pdf-upload"
                                accept=".pdf"
                                onChange={(e) => handleMediaUpload(e, 'pdf')}
                                className="hidden"
                              />
                              <label
                                htmlFor="pdf-upload"
                                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 cursor-pointer"
                              >
                                <FilePdf className="w-4 h-4" />
                                Add PDF
                              </label>
                            </div>
                          )}
                          
                          <p className="text-xs text-gray-500">
                            Maximum file size: 10MB. Supported formats: JPG, PNG, MP4, PDF
                          </p>
                        </div>

                        <div className="flex items-center gap-4">
                          <button
                            onClick={() => setShowTemplates(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                          >
                            <Plus className="w-5 h-5" />
                            Templates
                          </button>

                          <button
                            onClick={() => setShowBulkUpload(true)}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                          >
                            <Upload className="w-5 h-5" />
                            Bulk Upload
                          </button>

                          {sending ? (
                            <button
                              onClick={handleCancel}
                              className="flex items-center gap-2 px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 ml-auto"
                            >
                              <X className="w-5 h-5" />
                              Cancel
                            </button>
                          ) : (
                            <button
                              onClick={sendMessages}
                              disabled={(!message && !mediaFile) || !contacts.length || sending}
                              className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 ml-auto"
                            >
                              {sending ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <Send className="w-5 h-5" />
                              )}
                              Send to {contacts.length} Recipients
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Results Section */}
                    {showResults && (
                      <div className="border-t border-gray-200 pt-8">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">Send Results</h3>
                        <div className="bg-white rounded-lg border border-gray-200">
                          <div className="p-4 border-b border-gray-200 bg-gray-50">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-gray-900">
                                Status Overview
                              </span>
                              <div className="flex items-center gap-4">
                
                                <span className="text-sm text-gray-500">
                                  {messageStatuses.filter(s => s.status === 'sent').length} sent
                                </span>
                                <span className="text-sm text-gray-500">
                                  {messageStatuses.filter(s => s.status === 'error').length} failed
                                </span>
                                <span className="text-sm text-gray-500">
                                  {messageStatuses.filter(s => s.status === 'pending').length} pending
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="divide-y divide-gray-200">
                            {messageStatuses.map((status, index) => (
                              <div key={index} className="p-4 flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-gray-900">{status.phoneNumber}</p>
                                  {status.error && (
                                    <p className="text-sm text-red-600">{status.error}</p>
                                  )}
                                </div>
                                <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                                  status.status === 'sent'
                                    ? 'bg-green-100 text-green-800'
                                    : status.status === 'error'
                                    ? 'bg-red-100 text-red-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {status.status}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Auto-Reply Section */}
                    <div className="border-t border-gray-200 pt-8">
                      <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-medium text-gray-900">Auto-Reply Rules</h3>
                        <button
                          onClick={() => setShowAutoReplyEditor(true)}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                        >
                          <Plus className="w-4 h-4" />
                          Add Rule
                        </button>
                      </div>

                      {/* Auto-Reply Editor */}
                      {showAutoReplyEditor && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
                            <div className="flex items-center justify-between mb-6">
                              <h3 className="text-lg font-medium text-gray-900">
                                {editingReply ? 'Edit Auto-Reply Rule' : 'New Auto-Reply Rule'}
                              </h3>
                              <button
                                onClick={() => {
                                  setShowAutoReplyEditor(false);
                                  setEditingReply(null);
                                }}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                <X className="w-6 h-6" />
                              </button>
                            </div>

                            <div className="space-y-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Trigger Words
                                </label>
                                <input
                                  type="text"
                                  value={newAutoReply.trigger_words}
                                  onChange={(e) => setNewAutoReply(prev => ({
                                    ...prev,
                                    trigger_words: e.target.value
                                  }))}
                                  placeholder="price, pricing, cost (comma-separated)"
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Response Message
                                </label>
                                <textarea
                                  value={newAutoReply.response}
                                  onChange={(e) => setNewAutoReply(prev => ({
                                    ...prev,
                                    response: e.target.value
                                  }))}
                                  placeholder="Enter the response message..."
                                  rows={4}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                />
                              </div>

                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                  Priority
                                </label>
                                <input
                                  type="number"
                                  value={newAutoReply.priority}
                                  onChange={(e) => setNewAutoReply(prev => ({
                                    ...prev,
                                    priority: parseInt(e.target.value)
                                  }))}
                                  min="0"
                                  max="100"
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                                />
                                <p className="mt-1 text-sm text-gray-500">
                                  Higher numbers = higher priority
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="is_active"
                                  checked={newAutoReply.is_active}
                                  onChange={(e) => setNewAutoReply(prev => ({
                                    ...prev,
                                    is_active: e.target.checked
                                  }))}
                                  className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                                />
                                <label htmlFor="is_active" className="text-sm text-gray-700">
                                  Enable this rule
                                </label>
                              </div>

                              <div className="flex justify-end gap-4 pt-4 border-t">
                                <button
                                  onClick={() => {
                                    setShowAutoReplyEditor(false);
                                    setEditingReply(null);
                                  }}
                                  className="px-4 py-2 text-gray-600 hover:text-gray-900"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={handleSaveAutoReply}
                                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                                >
                                  Save Rule
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Auto-Reply List */}
                      <div className="space-y-4">
                        {autoReplies.length === 0 ? (
                          <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                            <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-600">No auto-reply rules configured</p>
                            <p className="text-sm text-gray-500 mt-1">
                              Add rules to automatically respond to specific messages
                            </p>
                          </div>
                        ) : (
                          autoReplies.map((reply) => (
                            <div
                              key={reply.id}
                              className="bg-white rounded-lg border border-gray-200 p-6 hover:border-red-200 transition-colors"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="flex items-center gap-3 mb-2">
                                    <div className={`px-3 py-1 rounded-full text-sm font-medium ${
                                      reply.is_active
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-800'
                                    }`}>
                                      {reply.is_active ? 'Active' : 'Disabled'}
                                    </div>
                                    <span className="text-sm text-gray-500">
                                      Priority: {reply.priority}
                                    </span>
                                  </div>
                                  <div className="mb-4">
                                    <h4 className="font-medium text-gray-900 mb-1">Trigger Words</h4>
                                    <div className="flex flex-wrap gap-2">
                                      {reply.trigger_words.map((word, index) => (
                                        <span
                                          key={index}
                                          className="px-2 py-1 bg-gray-100 rounded text-sm text-gray-600"
                                        >
                                          {word}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <div>
                                    <h4 className="font-medium text-gray-900 mb-1">Response</h4>
                                    <p className="text-gray-600 whitespace-pre-wrap">{reply.response}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleUpdateAutoReply(reply.id, {
                                      is_active: !reply.is_active
                                    })}
                                    className={`p-2 rounded-lg ${
                                      reply.is_active
                                        ? 'text-green-600 hover:bg-green-50'
                                        : 'text-gray-400 hover:bg-gray-50'
                                    }`}
                                  >
                                    <Power className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingReply(reply);
                                      setNewAutoReply({
                                        trigger_words: reply.trigger_words.join(', '),
                                        response: reply.response,
                                        priority: reply.priority,
                                        is_active: reply.is_active
                                      });
                                      setShowAutoReplyEditor(true);
                                    }}
                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                  >
                                    <Edit className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteAutoReply(reply.id)}
                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                              </div>
                              <div className="mt-4 text-xs text-gray-400">
                                Last updated: {new Date(reply.updated_at).toLocaleString()}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="max-w-sm mx-auto">
                  <QrCode className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Connect WhatsApp
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Connect your WhatsApp account to start sending and receiving messages through our platform
                  </p>
                  <button
                    onClick={startConnection}
                    disabled={connecting}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {connecting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <QrCode className="w-5 h-5" />
                        Connect WhatsApp
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-white rounded-xl shadow-sm p-8">
          <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <Info className="w-5 h-5 text-gray-500" />
            Instructions
          </h3>
          <div className="prose prose-sm max-w-none text-gray-600">
            <h4>Connection</h4>
            <ol className="space-y-3">
              <li>Click the "Connect WhatsApp" button above</li>
              <li>WhatsApp Web will open in a new browser tab</li>
              <li>On your phone, open WhatsApp</li>
              <li>Tap Menu (iOS) or Settings (Android)</li>
              <li>Select WhatsApp Web/Desktop</li>
              <li>Point your phone camera at the QR code in the new tab to scan it</li>
              <li>Keep your phone connected to the internet</li>
            </ol>

            <h4 className="mt-6">Sending Messages</h4>
            <ol className="space-y-3">
              <li>Upload a CSV file with your contacts</li>
              <li>Use variables like {'{{name}}'} in your message</li>
              <li>Add media files (images, videos, or PDFs) if needed</li>
              <li>Preview the message to ensure variables are correct</li>
              <li>Click Send to start the broadcast</li>
            </ol>

            <p className="mt-4 text-sm">
              Note: Your WhatsApp account can only be connected to one device at a time. Connecting here will disconnect other active WhatsApp Web sessions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Business;