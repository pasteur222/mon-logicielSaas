import React, { useState, useEffect } from 'react';
import { MessageSquare, Send, Upload, Download, RefreshCw, AlertCircle, CheckCircle, Users, BarChart2, Settings, Calendar, Target, Zap, Filter, Plus, Eye, Edit, Trash2 } from 'lucide-react';
import { sendWhatsAppMessages, checkWhatsAppConnection, getWhatsAppTemplates, MessageResult, MessageVariable, parseMessageVariables, replaceMessageVariables } from '../lib/whatsapp';
import { useAuth } from '../contexts/AuthContext';
import BackButton from '../components/BackButton';
import BulkUpload from '../components/BulkUpload';
import RichTextEditor from '../components/RichTextEditor';
import MessageTemplateManager from '../components/MessageTemplateManager';
import WhatsAppTemplateSelector from '../components/WhatsAppTemplateSelector';
import MessageScheduler from '../components/MessageScheduler';
import WhatsAppAnalytics from '../components/WhatsAppAnalytics';
import CampaignManager from '../components/CampaignManager';
import { supabase } from '../lib/supabase';

interface Contact {
  phoneNumber: string;
  name?: string;
  company?: string;
  [key: string]: any;
}

interface Template {
  id: string;
  name: string;
  content: string;
  category: string;
  variables: string[];
}

const WhatsApp = () => {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [phoneNumbers, setPhoneNumbers] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [results, setResults] = useState<MessageResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showCampaignManager, setShowCampaignManager] = useState(false);
  const [activeTab, setActiveTab] = useState<'send' | 'templates' | 'campaigns' | 'analytics'>('send');
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateError, setTemplateError] = useState<string | null>(null);

  useEffect(() => {
    checkConnection();
    loadTemplates();
  }, []);

  const checkConnection = async () => {
    try {
      const connected = await checkWhatsAppConnection(user?.id);
      setIsConnected(connected);
    } catch (error) {
      console.error('Error checking WhatsApp connection:', error);
      setIsConnected(false);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      setTemplateError(null);
      const templatesData = await getWhatsAppTemplates(user?.id);
      setTemplates(templatesData || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      setTemplateError('Impossible de charger les templates WhatsApp');
    } finally {
      setLoadingTemplates(false);
    }
  };

  const handleSendMessages = async () => {
    if (!message.trim() && !phoneNumbers.trim() && contacts.length === 0) {
      setError('Veuillez saisir un message et des numéros de téléphone');
      return;
    }

    setIsSending(true);
    setError(null);
    setSuccess(null);

    try {
      let messagesToSend: Array<{ phoneNumber: string; message: string; variables?: MessageVariable[] }> = [];

      if (contacts.length > 0) {
        // Use contacts from bulk upload
        messagesToSend = contacts.map(contact => ({
          phoneNumber: contact.phoneNumber,
          message: contact.message || message,
          variables: contact.variables
        }));
      } else {
        // Use manually entered phone numbers
        const numbers = phoneNumbers
          .split('\n')
          .map(num => num.trim())
          .filter(num => num.length > 0);

        if (numbers.length === 0) {
          setError('Veuillez entrer au moins un numéro de téléphone');
          return;
        }

        messagesToSend = numbers.map(phoneNumber => ({
          phoneNumber,
          message
        }));
      }

      const results = await sendWhatsAppMessages(messagesToSend, user?.id);
      setResults(results);

      const successCount = results.filter(r => r.status === 'success').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      if (successCount > 0) {
        setSuccess(`${successCount} message(s) envoyé(s) avec succès${errorCount > 0 ? `, ${errorCount} échec(s)` : ''}`);
      }

      if (errorCount === results.length) {
        setError('Tous les messages ont échoué');
      }

      // Clear form after successful send
      if (successCount > 0) {
        setMessage('');
        setPhoneNumbers('');
        setContacts([]);
      }

    } catch (error) {
      console.error('Error sending messages:', error);
      setError('Erreur lors de l\'envoi des messages');
    } finally {
      setIsSending(false);
    }
  };

  const handleBulkUpload = async (uploadedContacts: Contact[]) => {
    setContacts(uploadedContacts);
    setShowBulkUpload(false);
    
    if (uploadedContacts.length > 0) {
      setSuccess(`${uploadedContacts.length} contact(s) importé(s) avec succès`);
      setTimeout(() => setSuccess(null), 3000);
    }
  };

  const handleSelectTemplate = (template: Template) => {
    setMessage(template.content);
    setShowTemplateManager(false);
    setSuccess('Template sélectionné');
    setTimeout(() => setSuccess(null), 3000);
  };

  const handleSelectWhatsAppTemplate = (template: any, parameters: Record<string, string>) => {
    // Process WhatsApp template with parameters
    let processedMessage = template.parameters?.components?.find((c: any) => c.type === 'body')?.text || '';
    
    // Replace parameters in the message
    Object.entries(parameters).forEach(([key, value]) => {
      if (key.includes('body_')) {
        const paramIndex = parseInt(key.split('_')[1]);
        processedMessage = processedMessage.replace(`{{${paramIndex + 1}}}`, value);
      }
    });

    setMessage(processedMessage);
    setShowTemplateSelector(false);
    setSuccess('Template WhatsApp sélectionné');
    setTimeout(() => setSuccess(null), 3000);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'send':
        return (
          <div className="space-y-6">
            {!isConnected && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2 text-yellow-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>WhatsApp n'est pas connecté. Veuillez configurer votre API dans les paramètres.</p>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Message
                  </label>
                  <RichTextEditor
                    value={message}
                    onChange={setMessage}
                    placeholder="Tapez votre message ici..."
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setShowTemplateManager(true)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Utiliser un template
                    </button>
                    <button
                      onClick={() => setShowTemplateSelector(true)}
                      className="text-sm text-green-600 hover:text-green-800"
                    >
                      Template WhatsApp
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Numéros de téléphone (un par ligne)
                  </label>
                  <textarea
                    value={phoneNumbers}
                    onChange={(e) => setPhoneNumbers(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    rows={6}
                    placeholder="+221123456789&#10;+221987654321&#10;+221555666777"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <button
                      onClick={() => setShowBulkUpload(true)}
                      className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <Upload className="w-4 h-4" />
                      Import en masse
                    </button>
                    {phoneNumbers && (
                      <span className="text-sm text-gray-500">
                        {phoneNumbers.split('\n').filter(n => n.trim()).length} numéro(s)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Aperçu</h3>
                  <div className="bg-white rounded-lg p-3 border border-gray-200">
                    <div className="text-sm text-gray-600 mb-2">Message:</div>
                    <div className="text-sm text-gray-900 whitespace-pre-wrap">
                      {message || 'Votre message apparaîtra ici...'}
                    </div>
                  </div>
                  {contacts.length > 0 && (
                    <div className="mt-3">
                      <div className="text-sm text-gray-600 mb-2">Contacts importés:</div>
                      <div className="text-sm text-gray-900">{contacts.length} contact(s)</div>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleSendMessages}
                    disabled={isSending || !isConnected || (!message.trim() && contacts.length === 0)}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSending ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        Envoyer
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => setShowScheduler(true)}
                    className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    title="Programmer l'envoi"
                  >
                    <Calendar className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {results.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <h3 className="text-sm font-medium text-gray-900">Résultats d'envoi</h3>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {results.map((result, index) => (
                    <div key={index} className="px-4 py-3 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-900">{result.phoneNumber}</span>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            result.status === 'success' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {result.status === 'success' ? 'Envoyé' : 'Échec'}
                          </span>
                          {result.error && (
                            <span className="text-xs text-red-600" title={result.error}>
                              ⚠️
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'templates':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Templates WhatsApp</h3>
                <p className="text-sm text-gray-500">Gérez vos templates de messages approuvés</p>
              </div>
              <button
                onClick={loadTemplates}
                disabled={loadingTemplates}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loadingTemplates ? 'animate-spin' : ''}`} />
                Actualiser
              </button>
            </div>

            {templateError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p>{templateError}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {templates.map((template) => (
                <div key={template.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-red-300 hover:shadow-sm transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium text-gray-900">{template.template_name}</h4>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      template.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {template.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{template.category}</p>
                  <div className="text-xs text-gray-500">
                    {template.parameters?.components?.find((c: any) => c.type === 'body')?.text?.substring(0, 100) || 'Pas de contenu'}...
                  </div>
                </div>
              ))}
            </div>

            {templates.length === 0 && !loadingTemplates && (
              <div className="text-center py-12 text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>Aucun template trouvé</p>
                <p className="text-sm mt-1">Créez des templates dans votre compte WhatsApp Business</p>
              </div>
            )}
          </div>
        );

      case 'campaigns':
        return <CampaignManager />;

      case 'analytics':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Analyses WhatsApp</h3>
                <p className="text-sm text-gray-500">Suivez les performances de vos envois</p>
              </div>
              <button
                onClick={() => setShowAnalytics(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                <BarChart2 className="w-4 h-4" />
                Voir les analyses détaillées
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Send className="w-5 h-5 text-blue-600" />
                  <h4 className="font-medium text-gray-900">Messages envoyés</h4>
                </div>
                <p className="text-2xl font-semibold text-gray-900">0</p>
                <p className="text-sm text-gray-500 mt-1">Aujourd'hui</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h4 className="font-medium text-gray-900">Taux de livraison</h4>
                </div>
                <p className="text-2xl font-semibold text-gray-900">0%</p>
                <p className="text-sm text-gray-500 mt-1">Dernières 24h</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  <h4 className="font-medium text-gray-900">Contacts actifs</h4>
                </div>
                <p className="text-2xl font-semibold text-gray-900">{contacts.length}</p>
                <p className="text-sm text-gray-500 mt-1">Dans la session</p>
              </div>

              <div className="bg-white rounded-xl shadow-sm p-6">
                <div className="flex items-center gap-3 mb-2">
                  <Target className="w-5 h-5 text-yellow-600" />
                  <h4 className="font-medium text-gray-900">Taux d'ouverture</h4>
                </div>
                <p className="text-2xl font-semibold text-gray-900">0%</p>
                <p className="text-sm text-gray-500 mt-1">Estimation</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 bg-gray-50">
        <BackButton />
      </div>
      
      <div className="flex-1 flex flex-col">
        <div className="p-6 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-8 h-8 text-green-600" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900">WhatsApp Business</h1>
                <p className="text-sm text-gray-500">Envoi de messages en masse et gestion des campagnes</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
                isConnected 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                {isConnected ? 'Connecté' : 'Déconnecté'}
              </div>
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

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 bg-gray-50">
          <nav className="flex -mb-px px-6">
            <button
              onClick={() => setActiveTab('send')}
              className={`px-6 py-3 border-b-2 text-sm font-medium ${
                activeTab === 'send'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Send className="w-4 h-4 inline-block mr-2" />
              Envoi de Messages
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`px-6 py-3 border-b-2 text-sm font-medium ${
                activeTab === 'templates'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <MessageSquare className="w-4 h-4 inline-block mr-2" />
              Templates
            </button>
            <button
              onClick={() => setActiveTab('campaigns')}
              className={`px-6 py-3 border-b-2 text-sm font-medium ${
                activeTab === 'campaigns'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Target className="w-4 h-4 inline-block mr-2" />
              Campagnes
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`px-6 py-3 border-b-2 text-sm font-medium ${
                activeTab === 'analytics'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <BarChart2 className="w-4 h-4 inline-block mr-2" />
              Analytics
            </button>
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {renderTabContent()}
        </div>
      </div>

      {/* Modals */}
      {showBulkUpload && (
        <BulkUpload
          onClose={() => setShowBulkUpload(false)}
          onSend={handleBulkUpload}
        />
      )}

      {showTemplateManager && (
        <MessageTemplateManager
          onSelectTemplate={handleSelectTemplate}
          onClose={() => setShowTemplateManager(false)}
        />
      )}

      {showTemplateSelector && (
        <WhatsAppTemplateSelector
          onSelectTemplate={handleSelectWhatsAppTemplate}
          onClose={() => setShowTemplateSelector(false)}
        />
      )}

      {showScheduler && (
        <MessageScheduler
          onClose={() => setShowScheduler(false)}
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