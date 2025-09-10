import React, { useState, useEffect } from 'react';
import { Code, Copy, CheckCircle, AlertCircle, Globe, Settings, Palette, MessageSquare, X, Save, RefreshCw, Download, Eye, Shield, ExternalLink, Monitor } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ChatbotWebIntegrationProps {
  onClose?: () => void;
}

interface ChatbotConfig {
  id?: string;
  user_id: string;
  widget_color: string;
  widget_title: string;
  widget_position: 'left' | 'right';
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

const ChatbotWebIntegration: React.FC<ChatbotWebIntegrationProps> = ({ onClose }) => {
  const { user } = useAuth();
  const [config, setConfig] = useState<ChatbotConfig>({
    user_id: user?.id || '',
    widget_color: '#E60012',
    widget_title: 'Service Client',
    widget_position: 'right',
    is_active: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'setup' | 'customize' | 'preview'>('setup');
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'success' | 'error'>('unknown');

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('chatbot_widget_config')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setConfig(data);
      }
    } catch (err) {
      console.error('Error loading chatbot config:', err);
      setError('Impossible de charger la configuration du chatbot');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      if (!user?.id) {
        throw new Error('Utilisateur non authentifié');
      }

      const configData = {
        user_id: user.id,
        widget_color: config.widget_color,
        widget_title: config.widget_title,
        widget_position: config.widget_position,
        is_active: config.is_active,
        updated_at: new Date().toISOString()
      };

      if (config.id) {
        // Update existing config
        const { error } = await supabase
          .from('chatbot_widget_config')
          .update(configData)
          .eq('id', config.id);

        if (error) throw error;
      } else {
        // Insert new config
        const { data, error } = await supabase
          .from('chatbot_widget_config')
          .insert([configData])
          .select()
          .single();

        if (error) throw error;
        setConfig(prev => ({ ...prev, id: data.id }));
      }

      setSuccess('Configuration sauvegardée avec succès');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving chatbot config:', err);
      setError('Impossible de sauvegarder la configuration');
    } finally {
      setSaving(false);
    }
  };

  const testChatbotConnection = async () => {
    try {
      setTestingConnection(true);
      setError(null);

      // Test the chatbot API endpoint
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-chatbot`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          webUserId: 'test_user_' + Date.now(),
          sessionId: 'test_session_' + Date.now(),
          source: 'web',
          text: 'Test connection',
          chatbotType: 'client'
        })
      });

      if (!response.ok) {
        throw new Error(`API test failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success) {
        setConnectionStatus('success');
        setSuccess('Connexion au chatbot testée avec succès');
      } else {
        throw new Error(data.error || 'API test failed');
      }
    } catch (err) {
      console.error('Error testing chatbot connection:', err);
      setConnectionStatus('error');
      setError(`Test de connexion échoué: ${err.message}`);
    } finally {
      setTestingConnection(false);
    }
  };

  const generateEmbedCode = () => {
    const baseUrl = window.location.origin;
    const embedCode = `<!-- Airtel GPT Chatbot Widget -->
<script 
  src="${baseUrl}/chatbot-widget.js"
  data-user-id="${user?.id}"
  data-color="${config.widget_color}"
  data-title="${config.widget_title}"
  data-position="${config.widget_position}"
  data-api-url="${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-chatbot"
  data-api-key="${import.meta.env.VITE_SUPABASE_ANON_KEY}"
  data-max-retries="3"
  async>
</script>
<!-- End Airtel GPT Chatbot Widget -->`;
    
    return embedCode;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateEmbedCode());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadScript = () => {
    // Create a blob with the chatbot widget script
    fetch('/chatbot-widget.js')
      .then(response => response.text())
      .then(scriptContent => {
        const blob = new Blob([scriptContent], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'airtel-chatbot-widget.js';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(error => {
        console.error('Error downloading script:', error);
        setError('Impossible de télécharger le script');
      });
  };

  const previewWidget = () => {
    return (
      <div className="relative bg-gray-100 rounded-lg p-8 min-h-[400px] border-2 border-dashed border-gray-300">
        <div className="text-center text-gray-500 mb-8">
          <Globe className="w-12 h-12 mx-auto mb-2" />
          <p className="text-lg font-medium">Aperçu de votre site web</p>
          <p className="text-sm">Le chatbot apparaîtra comme ceci sur votre site</p>
        </div>
        
        <div 
          className={`absolute bottom-4 ${config.widget_position}-4`}
          style={{ position: 'absolute' }}
        >
          <div
            className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer transform hover:scale-110 transition-transform"
            style={{ backgroundColor: config.widget_color }}
          >
            <MessageSquare className="w-6 h-6 text-white" />
          </div>
          
          {/* Preview chat window */}
          <div className="absolute bottom-16 right-0 w-80 h-96 bg-white rounded-lg shadow-xl border border-gray-200 hidden hover:block">
            <div 
              className="p-4 text-white rounded-t-lg"
              style={{ backgroundColor: config.widget_color }}
            >
              <h3 className="font-medium">{config.widget_title}</h3>
              <p className="text-sm opacity-90">En ligne</p>
            </div>
            <div className="p-4 flex-1">
              <div className="bg-gray-100 rounded-lg p-3 mb-4">
                <p className="text-sm">Bonjour ! Comment puis-je vous aider aujourd'hui ?</p>
              </div>
            </div>
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Tapez votre message..."
                  className="flex-1 px-3 py-2 border rounded-lg text-sm"
                  disabled
                />
                <button 
                  className="px-4 py-2 text-white rounded-lg text-sm"
                  style={{ backgroundColor: config.widget_color }}
                  disabled
                >
                  Envoyer
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh]">
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
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex -mb-px px-6">
          <button
            onClick={() => setActiveTab('setup')}
            className={`px-6 py-3 border-b-2 text-sm font-medium ${
              activeTab === 'setup'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Code className="w-5 h-5 inline-block mr-2" />
            Installation
          </button>
          <button
            onClick={() => setActiveTab('customize')}
            className={`px-6 py-3 border-b-2 text-sm font-medium ${
              activeTab === 'customize'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Palette className="w-5 h-5 inline-block mr-2" />
            Personnalisation
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`px-6 py-3 border-b-2 text-sm font-medium ${
              activeTab === 'preview'
                ? 'border-red-500 text-red-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Eye className="w-5 h-5 inline-block mr-2" />
            Aperçu
          </button>
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {activeTab === 'setup' && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare className="w-8 h-8 text-blue-600" />
                <div>
                  <h3 className="text-lg font-medium text-blue-800">Chatbot Web Intelligent</h3>
                  <p className="text-blue-600">Assistant virtuel pour votre site web</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
                <div className="space-y-2">
                  <p>✅ Réponses automatiques 24/7</p>
                  <p>✅ Interface moderne et responsive</p>
                  <p>✅ Historique des conversations</p>
                  <p>✅ Gestion des erreurs et reconnexion automatique</p>
                </div>
                <div className="space-y-2">
                  <p>✅ Compatible tous navigateurs</p>
                  <p>✅ Optimisé mobile et desktop</p>
                  <p>✅ Intégration en 2 minutes</p>
                  <p>✅ Sécurisé et conforme RGPD</p>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Test de Connexion</h3>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    connectionStatus === 'success' ? 'bg-green-500' :
                    connectionStatus === 'error' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <span className="text-sm text-gray-600">
                    {connectionStatus === 'success' ? 'Connecté' :
                     connectionStatus === 'error' ? 'Erreur' : 'Non testé'}
                  </span>
                </div>
              </div>
              
              <button
                onClick={testChatbotConnection}
                disabled={testingConnection}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {testingConnection ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Test en cours...
                  </>
                ) : (
                  <>
                    <Monitor className="w-4 h-4" />
                    Tester la connexion
                  </>
                )}
              </button>
              
              <p className="text-sm text-gray-500 mt-2">
                Testez la connexion au chatbot avant de l'intégrer sur votre site
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Code d'intégration</h3>
                <div className="flex gap-2">
                  <button
                    onClick={downloadScript}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                  >
                    <Download className="w-4 h-4" />
                    Télécharger le script
                  </button>
                  <button
                    onClick={copyToClipboard}
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                  >
                    {copied ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copier le code
                      </>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="relative">
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                  <code>{generateEmbedCode()}</code>
                </pre>
              </div>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <h4 className="font-medium text-green-800 mb-2">Instructions d'installation</h4>
              <ol className="text-green-700 text-sm space-y-2 list-decimal list-inside">
                <li>Copiez le code d'intégration ci-dessus</li>
                <li>Ouvrez l'éditeur de votre site web</li>
                <li>Collez le code juste avant la balise &lt;/body&gt; de votre page</li>
                <li>Sauvegardez et publiez votre site</li>
                <li>Le chatbot apparaîtra automatiquement en bas à droite</li>
              </ol>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h4 className="font-medium text-amber-800 mb-2 flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  Compatibilité
                </h4>
                <div className="text-amber-700 text-sm space-y-1">
                  <p>✅ WordPress, Shopify, Wix, Squarespace</p>
                  <p>✅ Sites HTML statiques</p>
                  <p>✅ Tous navigateurs modernes</p>
                  <p>✅ Appareils mobiles et desktop</p>
                </div>
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-medium text-blue-800 mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Sécurité
                </h4>
                <div className="text-blue-700 text-sm space-y-1">
                  <p>✅ Chiffrement des communications</p>
                  <p>✅ Isolation Shadow DOM</p>
                  <p>✅ Protection XSS intégrée</p>
                  <p>✅ Conforme RGPD</p>
                </div>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="font-medium text-red-800 mb-2">Important pour la Production</h4>
              <div className="text-red-700 text-sm space-y-2">
                <p>• Testez toujours le chatbot sur un environnement de test avant la production</p>
                <p>• Vérifiez que votre configuration Groq API est active</p>
                <p>• Le chatbot nécessite une connexion internet pour fonctionner</p>
                <p>• Les conversations sont sauvegardées dans votre base de données</p>
              </div>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-800 mb-2">Support Technique</h4>
              <p className="text-gray-700 text-sm mb-3">
                Si vous rencontrez des problèmes d'intégration, voici les étapes de dépannage :
              </p>
              <ol className="text-gray-700 text-sm space-y-1 list-decimal list-inside">
                <li>Vérifiez que le script est placé avant &lt;/body&gt;</li>
                <li>Ouvrez la console développeur (F12) pour voir les erreurs</li>
                <li>Testez la connexion avec le bouton ci-dessus</li>
                <li>Contactez le support si le problème persiste</li>
              </ol>
            </div>
          </div>
        )}

        {activeTab === 'customize' && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-6">Personnalisation du chatbot</h3>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Titre du chatbot
                  </label>
                  <input
                    type="text"
                    value={config.widget_title}
                    onChange={(e) => setConfig(prev => ({ ...prev, widget_title: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="Service Client"
                    maxLength={50}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Ce titre apparaîtra en haut de la fenêtre de chat
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Couleur du chatbot
                  </label>
                  <div className="flex items-center gap-4">
                    <input
                      type="color"
                      value={config.widget_color}
                      onChange={(e) => setConfig(prev => ({ ...prev, widget_color: e.target.value }))}
                      className="w-12 h-12 border border-gray-300 rounded-lg cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config.widget_color}
                      onChange={(e) => setConfig(prev => ({ ...prev, widget_color: e.target.value }))}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      placeholder="#E60012"
                      pattern="^#[0-9A-Fa-f]{6}$"
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    Choisissez une couleur qui s'harmonise avec votre site
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Position du chatbot
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="left"
                        checked={config.widget_position === 'left'}
                        onChange={(e) => setConfig(prev => ({ ...prev, widget_position: e.target.value as 'left' | 'right' }))}
                        className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700">En bas à gauche</span>
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="right"
                        checked={config.widget_position === 'right'}
                        onChange={(e) => setConfig(prev => ({ ...prev, widget_position: e.target.value as 'left' | 'right' }))}
                        className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300"
                      />
                      <span className="ml-2 text-sm text-gray-700">En bas à droite</span>
                    </label>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={config.is_active}
                    onChange={(e) => setConfig(prev => ({ ...prev, is_active: e.target.checked }))}
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_active" className="text-sm text-gray-700">
                    Activer le chatbot sur votre site
                  </label>
                </div>

                <div className="pt-4 border-t border-gray-200">
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {saving ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Enregistrement...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Sauvegarder
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h4 className="font-medium text-yellow-800 mb-2">Optimisation des Performances</h4>
              <div className="text-yellow-700 text-sm space-y-2">
                <p>• Le widget se charge de manière asynchrone pour ne pas ralentir votre site</p>
                <p>• Les conversations sont mises en cache localement pour une meilleure réactivité</p>
                <p>• Le widget s'adapte automatiquement à la taille de l'écran</p>
                <p>• Optimisé pour les Core Web Vitals de Google</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'preview' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Aperçu du chatbot</h3>
              <p className="text-gray-600 mb-6">
                Voici comment le chatbot apparaîtra sur votre site web :
              </p>
              {previewWidget()}
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <h4 className="font-medium text-green-800 mb-3">Fonctionnalités du chatbot</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ul className="text-green-700 text-sm space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Réponses automatiques intelligentes
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Interface responsive et moderne
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Historique des conversations
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Gestion des erreurs robuste
                  </li>
                </ul>
                <ul className="text-green-700 text-sm space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Reconnexion automatique
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    File d'attente des messages
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Indicateurs de statut
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Analytics intégrées
                  </li>
                </ul>
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <h4 className="font-medium text-purple-800 mb-2">API et Intégrations</h4>
              <div className="text-purple-700 text-sm space-y-2">
                <p><strong>Endpoint API:</strong> {import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-chatbot</p>
                <p><strong>Méthode:</strong> POST</p>
                <p><strong>Authentification:</strong> Bearer Token</p>
                <p><strong>Format:</strong> JSON</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 p-6 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            <div className="space-y-1">
              <p>💡 <strong>Astuce :</strong> Le chatbot utilise la même IA que votre service client WhatsApp</p>
              <p>🔧 <strong>Support :</strong> Consultez la documentation ou contactez notre équipe</p>
            </div>
          </div>
          <div className="flex gap-3">
            <a
              href="https://docs.airtelgpt.com/chatbot-integration"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              <ExternalLink className="w-4 h-4" />
              Documentation
            </a>
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
              >
                Fermer
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotWebIntegration;