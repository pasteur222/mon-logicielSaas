import React, { useState, useEffect, useRef } from 'react';
import { Send, Upload, Download, Users, MessageSquare, Settings, RefreshCw, AlertCircle, Plus, X, Calendar, FileText, Zap, CheckCircle, XCircle, Clock, Filter, Search, Trash2, Edit, Copy, Eye, EyeOff, Smartphone, Globe, BarChart2, Target, Repeat, Play, Pause, Save, Image, Video, File as FileIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { sendWhatsAppMessages, getWhatsAppTemplates, checkMessageStatus, parseMessageVariables, replaceMessageVariables, sanitizeWhatsAppMessage, type MessageResult, type MessageVariable } from '../lib/whatsapp';
import { sendWhatsAppTemplateMessage } from '../lib/whatsapp-template';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import BulkUpload from '../components/BulkUpload';
import MessageScheduler from '../components/MessageScheduler';
import MessageTemplateManager from '../components/MessageTemplateManager';
import WhatsAppTemplateSelector from '../components/WhatsAppTemplateSelector';
import WhatsAppAnalytics from '../components/WhatsAppAnalytics';
import RichTextEditor from '../components/RichTextEditor';

interface Contact {
  id: string;
  phoneNumber: string;
  name?: string;
  company?: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  status?: 'active' | 'inactive';
}

interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  variables: string[];
}

interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed';
  recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  scheduledFor?: Date;
}

const WhatsApp = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<MessageResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showWhatsAppTemplates, setShowWhatsAppTemplates] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeTab, setActiveTab] = useState<'compose' | 'contacts' | 'campaigns' | 'analytics'>('compose');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [variables, setVariables] = useState<MessageVariable[]>([]);
  const [showVariables, setShowVariables] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadContacts();
    loadTemplates();
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (selectedTemplate) {
      const templateVariables = parseMessageVariables(selectedTemplate.content);
      setVariables(templateVariables.map(name => ({ name, value: '' })));
      setShowVariables(templateVariables.length > 0);
    }
  }, [selectedTemplate]);

  const loadContacts = async () => {
    try {
      // Load contacts from various sources
      const { data: conversations } = await supabase
        .from('customer_conversations')
        .select('phone_number')
        .order('created_at', { ascending: false });

      const { data: students } = await supabase
        .from('student_profiles')
        .select('phone_number, first_name, last_name');

      // Combine and deduplicate contacts
      const allContacts = new Map<string, Contact>();
      
      conversations?.forEach(conv => {
        if (conv.phone_number && !allContacts.has(conv.phone_number)) {
          allContacts.set(conv.phone_number, {
            id: conv.phone_number,
            phoneNumber: conv.phone_number,
            status: 'active'
          });
        }
      });

      students?.forEach(student => {
        if (student.phone_number) {
          const existing = allContacts.get(student.phone_number);
          allContacts.set(student.phone_number, {
            id: student.phone_number,
            phoneNumber: student.phone_number,
            name: `${student.first_name || ''} ${student.last_name || ''}`.trim(),
            status: 'active',
            ...existing
          });
        }
      });

      setContacts(Array.from(allContacts.values()));
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  const loadCampaigns = async () => {
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const formattedCampaigns = data?.map(campaign => ({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        recipients: campaign.target_audience?.length || 0,
        sent: campaign.metrics?.sent || 0,
        delivered: campaign.metrics?.delivered || 0,
        opened: campaign.metrics?.opened || 0,
        clicked: campaign.metrics?.clicked || 0,
        scheduledFor: campaign.start_date ? new Date(campaign.start_date) : undefined
      })) || [];

      setCampaigns(formattedCampaigns);
    } catch (error) {
      console.error('Error loading campaigns:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() && mediaUrls.length === 0) {
      setError('Please enter a message or upload media');
      return;
    }

    if (recipients.length === 0 && selectedContacts.length === 0) {
      setError('Please select recipients');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      setSuccess(null);

      // Sanitize the message before sending
      const sanitizedMessage = message.trim() ? sanitizeWhatsAppMessage(message) : '';

      // Prepare recipients list
      const allRecipients = [...recipients, ...selectedContacts.map(id => 
        contacts.find(c => c.id === id)?.phoneNumber
      ).filter(Boolean)];

      // Prepare messages with variables if template is selected
      let finalMessage = sanitizedMessage;
      if (selectedTemplate && variables.length > 0) {
        finalMessage = replaceMessageVariables(selectedTemplate.content, variables);
        finalMessage = sanitizeWhatsAppMessage(finalMessage);
      }

      // Prepare message data
      const messageData = allRecipients.map(phoneNumber => ({
        phoneNumber: phoneNumber!,
        message: finalMessage,
        variables: variables.length > 0 ? variables : undefined,
        media: mediaUrls.length > 0 ? (() => {
          const mediaUrl = mediaUrls[0];
          // Determine media type from URL or file extension
          const mediaFile = mediaFiles[0];
          let mediaType: 'image' | 'video' | 'document' = 'image';
          
          if (mediaFile) {
            if (mediaFile.type.startsWith('video/')) {
              mediaType = 'video';
            } else if (mediaFile.type === 'application/pdf') {
              mediaType = 'document';
            } else {
              mediaType = 'image';
            }
          }
          
          console.log('📎 [WHATSAPP-SEND] Preparing media:', {
            type: mediaType,
            url: mediaUrl,
            fileType: mediaFile?.type
          });
          
          return {
            type: mediaType,
            url: mediaUrl
          };
        })() : undefined
      }));

      const results = await sendWhatsAppMessages(messageData, user?.id);
      setResults(results);

      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      if (successCount > 0) {
        setSuccess(`Successfully sent ${successCount} message(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
      }
      if (errorCount > 0 && successCount === 0) {
        setError(`Failed to send ${errorCount} message(s)`);
      }

      // Clear form on success
      if (successCount > 0) {
        setMessage('');
        setRecipients([]);
        setSelectedContacts([]);
        setSelectedTemplate(null);
        setVariables([]);
        setShowVariables(false);
        setMediaFiles([]);
        setMediaUrls([]);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkUpload = async (data: any[]) => {
    try {
      setIsLoading(true);
      setError(null);

      const messageData = data.map(item => {
        // Sanitize the message if it exists
        const sanitizedMessage = item.message ? sanitizeWhatsAppMessage(item.message) : '';
        
        return {
          phoneNumber: item.phoneNumber,
          message: sanitizedMessage,
          variables: item.variables
        };
      });

      const results = await sendWhatsAppMessages(messageData, user?.id);
      setResults(results);

      const successCount = results.filter(r => r.status === 'success').length;
      setSuccess(`Successfully processed ${successCount} contacts`);
    } catch (error) {
      console.error('Error in bulk upload:', error);
      setError('Failed to process bulk upload');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTemplateSelect = (template: MessageTemplate) => {
    setSelectedTemplate(template);
    setMessage(template.content);
    setShowTemplates(false);
  };

  const handleWhatsAppTemplateSelect = async (template: any, parameters: Record<string, string>) => {
    try {
      setIsLoading(true);
      setError(null);

      const allRecipients = [...recipients, ...selectedContacts.map(id => 
        contacts.find(c => c.id === id)?.phoneNumber
      ).filter(Boolean)];

      if (allRecipients.length === 0) {
        setError('Please select recipients');
        return;
      }

      // Send template message to each recipient
      const results = await Promise.all(
        allRecipients.map(async (phoneNumber) => {
          try {
            const result = await sendWhatsAppTemplateMessage({
              to: phoneNumber!,
              templateName: template.template_name,
              language: 'fr',
              components: template.parameters?.components,
              headerMediaUrl: parameters.header_media,
              bodyMediaUrl: parameters.body_media,
              footerMediaUrl: parameters.footer_media,
              customBody: parameters.custom_body,
              customFooter: parameters.custom_footer
            }, user?.id);

            return {
              status: result.success ? 'success' as const : 'error' as const,
              phoneNumber: phoneNumber!,
              message: `Template: ${template.template_name}`,
              timestamp: new Date(),
              messageId: result.messageId,
              error: result.error
            };
          } catch (error) {
            return {
              status: 'error' as const,
              phoneNumber: phoneNumber!,
              message: `Template: ${template.template_name}`,
              timestamp: new Date(),
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      setResults(results);
      const successCount = results.filter(r => r.status === 'success').length;
      setSuccess(`Successfully sent template to ${successCount} recipient(s)`);
      setShowWhatsAppTemplates(false);
    } catch (error) {
      console.error('Error sending WhatsApp template:', error);
      setError('Failed to send template message');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMediaUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    try {
      setIsUploadingMedia(true);
      const uploadedUrls: string[] = [];

      for (const file of files) {
        // Validate file type and size with explicit MIME type checking
        const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const allowedVideoTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/webm'];
        const allowedDocTypes = ['application/pdf'];
        
        const isValidType = [
          ...allowedImageTypes,
          ...allowedVideoTypes,
          ...allowedDocTypes
        ].includes(file.type);
        
        if (!isValidType) {
          setError(`Unsupported file type: ${file.type}. Supported types: JPEG, PNG, GIF, WebP, MP4, MOV, PDF`);
          continue;
        }

        if (file.size > 16 * 1024 * 1024) { // 16MB limit for WhatsApp
          setError('File size must be less than 16MB');
          continue;
        }

        // Generate filename with proper extension based on MIME type
        const timestamp = Date.now();
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_${sanitizedName}`;
        
        console.log('📤 [MEDIA-UPLOAD] Uploading file:', {
          fileName,
          fileType: file.type,
          fileSize: file.size,
          originalName: file.name
        });
        
        // Upload to Supabase storage with explicit content type
        const { data, error } = await supabase.storage
          .from('whatsapp-media')
          .upload(fileName, file, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false
          });

        if (error) throw error;

        // Get public URL and validate it
        const { data: publicUrlData } = supabase.storage
          .from('whatsapp-media')
          .getPublicUrl(fileName);

        const publicUrl = publicUrlData.publicUrl;
        
        // Validate the URL is accessible
        try {
          const urlCheck = await fetch(publicUrl, { method: 'HEAD' });
          if (!urlCheck.ok) {
            throw new Error(`URL not accessible: ${urlCheck.status}`);
          }
          
          console.log('✅ [MEDIA-UPLOAD] File uploaded and URL validated:', {
            fileName,
            publicUrl,
            contentType: urlCheck.headers.get('content-type')
          });
          
          uploadedUrls.push(publicUrl);
        } catch (urlError) {
          console.error('❌ [MEDIA-UPLOAD] URL validation failed:', urlError);
          setError(`Failed to validate uploaded file URL: ${urlError.message}`);
          continue;
        }
      }

      setMediaFiles(prev => [...prev, ...files]);
      setMediaUrls(prev => [...prev, ...uploadedUrls]);
    } catch (error) {
      console.error('Error uploading media:', error);
      setError('Failed to upload media files');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const removeMedia = (index: number) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
    setMediaUrls(prev => prev.filter((_, i) => i !== index));
  };

  const filteredContacts = contacts.filter(contact => {
    const matchesSearch = !searchTerm || 
      contact.phoneNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      contact.company?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || contact.status === filterStatus;
    
    return matchesSearch && matchesFilter;
  });

  const toggleContactSelection = (contactId: string) => {
    setSelectedContacts(prev => 
      prev.includes(contactId) 
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  };

  const selectAllContacts = () => {
    if (selectedContacts.length === filteredContacts.length) {
      setSelectedContacts([]);
    } else {
      setSelectedContacts(filteredContacts.map(c => c.id));
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-gray-50">
        <BackButton />
      </div>

      <div className="flex-1 flex">
        <div className="flex-1 flex flex-col">
          <div className="p-6 bg-white border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-8 h-8 text-green-600" />
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">WhatsApp Business</h1>
                  <p className="text-sm text-gray-500">Send messages and manage campaigns</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowAnalytics(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-100 text-purple-600 rounded-lg hover:bg-purple-200"
                >
                  <BarChart2 className="w-4 h-4" />
                  Analytics
                </button>
                <button
                  onClick={() => setShowScheduler(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200"
                >
                  <Calendar className="w-4 h-4" />
                  Schedule
                </button>
                <button
                  onClick={() => setShowBulkUpload(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"
                >
                  <Upload className="w-4 h-4" />
                  Bulk Upload
                </button>
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('compose')}
                className={`px-6 py-3 border-b-2 text-sm font-medium ${
                  activeTab === 'compose'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Send className="w-5 h-5 inline-block mr-2" />
                Compose
              </button>
              <button
                onClick={() => setActiveTab('contacts')}
                className={`px-6 py-3 border-b-2 text-sm font-medium ${
                  activeTab === 'contacts'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Users className="w-5 h-5 inline-block mr-2" />
                Contacts ({contacts.length})
              </button>
              <button
                onClick={() => setActiveTab('campaigns')}
                className={`px-6 py-3 border-b-2 text-sm font-medium ${
                  activeTab === 'campaigns'
                    ? 'border-green-500 text-green-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Target className="w-5 h-5 inline-block mr-2" />
                Campaigns ({campaigns.length})
              </button>
            </nav>
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

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'compose' && (
              <div className="max-w-4xl mx-auto space-y-6">
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Compose Message</h2>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowTemplates(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        <FileText className="w-4 h-4" />
                        Templates
                      </button>
                      <button
                        onClick={() => setShowWhatsAppTemplates(true)}
                        className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
                      >
                        <MessageSquare className="w-4 h-4" />
                        WhatsApp Templates
                      </button>
                    </div>
                  </div>

                  {selectedTemplate && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-800">
                          Using template: {selectedTemplate.name}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedTemplate(null);
                            setMessage('');
                            setVariables([]);
                            setShowVariables(false);
                          }}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}

                  {showVariables && variables.length > 0 && (
                    <div className="mb-4 space-y-3">
                      <h3 className="text-sm font-medium text-gray-700">Template Variables</h3>
                      {variables.map((variable, index) => (
                        <div key={index}>
                          <label className="block text-sm text-gray-600 mb-1">
                            {variable.name}
                          </label>
                          <input
                            type="text"
                            value={variable.value}
                            onChange={(e) => {
                              const newVariables = [...variables];
                              newVariables[index].value = e.target.value;
                              setVariables(newVariables);
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                            placeholder={`Enter value for ${variable.name}`}
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Message
                      </label>
                      <RichTextEditor
                        value={message}
                        onChange={setMessage}
                        placeholder="Type your message here..."
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Media Files (Optional)
                      </label>
                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
                          <input
                            ref={fileInputRef}
                            type="file"
                            multiple
                            accept="image/*,video/*,.pdf"
                            onChange={handleMediaUpload}
                            className="hidden"
                          />
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploadingMedia}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                          >
                            {isUploadingMedia ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Upload className="w-4 h-4" />
                            )}
                            Upload Media
                          </button>
                          <span className="text-sm text-gray-500">
                            Images, videos, or PDF files (max 16MB each)
                          </span>
                        </div>

                        {mediaFiles.length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {mediaFiles.map((file, index) => (
                              <div key={index} className="relative bg-gray-50 rounded-lg p-3">
                                <div className="flex items-center gap-2">
                                  {file.type.startsWith('image/') && <Image className="w-4 h-4 text-blue-600" />}
                                  {file.type.startsWith('video/') && <Video className="w-4 h-4 text-purple-600" />}
                                  {file.type === 'application/pdf' && <FileIcon className="w-4 h-4 text-red-600" />}
                                  <span className="text-sm text-gray-700 truncate">{file.name}</span>
                                </div>
                                <button
                                  onClick={() => removeMedia(index)}
                                  className="absolute top-1 right-1 p-1 text-gray-400 hover:text-red-600"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Recipients
                      </label>
                      <div className="space-y-3">
                        <textarea
                          value={recipients.join('\n')}
                          onChange={(e) => setRecipients(e.target.value.split('\n').filter(r => r.trim()))}
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                          rows={4}
                          placeholder="Enter phone numbers (one per line)&#10;+1234567890&#10;+0987654321"
                        />
                        <p className="text-sm text-gray-500">
                          Enter phone numbers in international format (+country code + number)
                        </p>
                      </div>
                    </div>

                    {selectedContacts.length > 0 && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-sm text-green-800">
                          {selectedContacts.length} contact(s) selected from your contact list
                        </p>
                      </div>
                    )}

                    <button
                      onClick={handleSendMessage}
                      disabled={isLoading || (!message.trim() && mediaUrls.length === 0) || (recipients.length === 0 && selectedContacts.length === 0)}
                      className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <>
                          <RefreshCw className="w-5 h-5 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Send Message
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {results.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Sending Results</h3>
                    <div className="space-y-2">
                      {results.map((result, index) => (
                        <div
                          key={index}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            result.status === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {result.status === 'success' ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600" />
                            )}
                            <span className="font-medium">{result.phoneNumber}</span>
                          </div>
                          <div className="text-sm text-gray-600">
                            {result.status === 'success' ? (
                              <span className="text-green-600">Sent successfully</span>
                            ) : (
                              <span className="text-red-600">{result.error}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'contacts' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Contact Management</h2>
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        placeholder="Search contacts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="all">All Contacts</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <button
                          onClick={selectAllContacts}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                        >
                          {selectedContacts.length === filteredContacts.length ? 'Deselect All' : 'Select All'}
                        </button>
                        {selectedContacts.length > 0 && (
                          <span className="text-sm text-gray-600">
                            {selectedContacts.length} selected
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500">
                        {filteredContacts.length} contacts
                      </span>
                    </div>
                  </div>

                  <div className="divide-y divide-gray-200">
                    {filteredContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className={`p-4 hover:bg-gray-50 cursor-pointer ${
                          selectedContacts.includes(contact.id) ? 'bg-green-50' : ''
                        }`}
                        onClick={() => toggleContactSelection(contact.id)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedContacts.includes(contact.id)}
                              onChange={() => toggleContactSelection(contact.id)}
                              className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                            />
                            <div>
                              <p className="font-medium text-gray-900">
                                {contact.name || contact.phoneNumber}
                              </p>
                              {contact.name && (
                                <p className="text-sm text-gray-500">{contact.phoneNumber}</p>
                              )}
                              {contact.company && (
                                <p className="text-sm text-gray-500">{contact.company}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              contact.status === 'active' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {contact.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {filteredContacts.length === 0 && (
                    <div className="p-12 text-center text-gray-500">
                      <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p>No contacts found</p>
                      <p className="text-sm mt-1">
                        {searchTerm ? 'Try adjusting your search' : 'Import contacts to get started'}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'campaigns' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Campaign Management</h2>
                  <button className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                    <Plus className="w-4 h-4" />
                    New Campaign
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-white rounded-xl shadow-sm p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-gray-900">{campaign.name}</h3>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          campaign.status === 'active' ? 'bg-green-100 text-green-800' :
                          campaign.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                          campaign.status === 'scheduled' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {campaign.status}
                        </span>
                      </div>

                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Recipients:</span>
                          <span className="font-medium">{campaign.recipients}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Sent:</span>
                          <span className="font-medium">{campaign.sent}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Delivered:</span>
                          <span className="font-medium">{campaign.delivered}</span>
                        </div>
                        {campaign.scheduledFor && (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Scheduled:</span>
                            <span className="font-medium">
                              {campaign.scheduledFor.toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button className="flex-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
                          <Eye className="w-4 h-4 inline mr-1" />
                          View
                        </button>
                        <button className="flex-1 px-3 py-1.5 text-sm bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200">
                          <Edit className="w-4 h-4 inline mr-1" />
                          Edit
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {campaigns.length === 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                    <Target className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No campaigns yet</h3>
                    <p className="text-gray-500 mb-6">
                      Create your first campaign to start reaching your audience
                    </p>
                    <button className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">
                      Create Campaign
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {showBulkUpload && (
        <BulkUpload
          onClose={() => setShowBulkUpload(false)}
          onSend={handleBulkUpload}
        />
      )}

      {showScheduler && (
        <MessageScheduler
          onClose={() => setShowScheduler(false)}
        />
      )}

      {showTemplates && (
        <MessageTemplateManager
          onSelectTemplate={handleTemplateSelect}
          onClose={() => setShowTemplates(false)}
        />
      )}

      {showWhatsAppTemplates && (
        <WhatsAppTemplateSelector
          onSelectTemplate={handleWhatsAppTemplateSelect}
          onClose={() => setShowWhatsAppTemplates(false)}
        />
      )}

      {showAnalytics && (
        <WhatsAppAnalytics
          onClose={() => setShowAnalytics(false)}
        />
      )}
    </div>
  );
};

export default WhatsApp;