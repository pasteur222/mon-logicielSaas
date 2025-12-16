import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Link, Copy, CheckCircle, AlertCircle, Save, ExternalLink } from 'lucide-react';

interface SystemConfig {
  id: string;
  config_key: string;
  config_value: string;
  config_type: string;
  description: string;
}

const SubscriberConfigLinks: React.FC = () => {
  const { user } = useAuth();
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{ [key: string]: 'success' | 'error' | null }>({});

  useEffect(() => {
    fetchConfigurations();
  }, []);

  const fetchConfigurations = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('system_configurations')
        .select('*')
        .eq('is_active', true)
        .eq('visible_to_subscribers', true)
        .in('config_key', ['webhook_url', 'groq_api_endpoint'])
        .order('config_key');

      if (fetchError) throw fetchError;

      setConfigs(data || []);
    } catch (err: any) {
      console.error('Error fetching configurations:', err);
      setError(err.message || 'Failed to load configurations');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    }
  };

  const saveToSettings = async (config: SystemConfig) => {
    try {
      setSavingKey(config.config_key);
      setSaveStatus({ ...saveStatus, [config.config_key]: null });

      if (config.config_key === 'webhook_url') {
        const { data: existingConfig } = await supabase
          .from('user_whatsapp_config')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();

        if (existingConfig) {
          const { error: updateError } = await supabase
            .from('user_whatsapp_config')
            .update({ webhook_url: config.config_value, updated_at: new Date().toISOString() })
            .eq('user_id', user?.id);

          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('user_whatsapp_config')
            .insert({
              user_id: user?.id,
              webhook_url: config.config_value,
              access_token: '',
              phone_number_id: '',
              is_active: false
            });

          if (insertError) throw insertError;
        }

        setSaveStatus({ ...saveStatus, [config.config_key]: 'success' });
      } else if (config.config_key === 'groq_api_endpoint') {
        const { data: existingConfig } = await supabase
          .from('user_groq_config')
          .select('id')
          .eq('user_id', user?.id)
          .maybeSingle();

        if (existingConfig) {
          const { error: updateError } = await supabase
            .from('user_groq_config')
            .update({
              api_key: config.config_value,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user?.id);

          if (updateError) throw updateError;
        } else {
          const { error: insertError } = await supabase
            .from('user_groq_config')
            .insert({
              user_id: user?.id,
              api_key: config.config_value,
              model: 'mixtral-8x7b-32768'
            });

          if (insertError) throw insertError;
        }

        setSaveStatus({ ...saveStatus, [config.config_key]: 'success' });
      }

      setTimeout(() => {
        setSaveStatus({ ...saveStatus, [config.config_key]: null });
      }, 3000);
    } catch (err: any) {
      console.error('Error saving configuration:', err);
      setSaveStatus({ ...saveStatus, [config.config_key]: 'error' });
      setTimeout(() => {
        setSaveStatus({ ...saveStatus, [config.config_key]: null });
      }, 3000);
    } finally {
      setSavingKey(null);
    }
  };

  const getConfigIcon = (type: string) => {
    switch (type) {
      case 'webhook':
        return <Link className="w-5 h-5 text-blue-600" />;
      case 'api':
        return <ExternalLink className="w-5 h-5 text-green-600" />;
      default:
        return <Link className="w-5 h-5 text-gray-600" />;
    }
  };

  const getConfigTitle = (key: string) => {
    switch (key) {
      case 'webhook_url':
        return 'WhatsApp Webhook URL';
      case 'groq_api_endpoint':
        return 'Groq API Endpoint';
      default:
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          <span className="ml-3 text-gray-600">Loading configurations...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3" />
          <div>
            <h4 className="text-sm font-medium text-red-900">Error Loading Configurations</h4>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (configs.length === 0) {
    return null;
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-lg shadow-sm p-6 border border-blue-100">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Link className="w-5 h-5 text-blue-600" />
          Subscriber Resources
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Access your webhook and API configuration links. Copy or save them to your account settings.
        </p>
      </div>

      <div className="space-y-4">
        {configs.map((config) => (
          <div
            key={config.id}
            className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {getConfigIcon(config.config_type)}
                  <h4 className="text-sm font-medium text-gray-900">
                    {getConfigTitle(config.config_key)}
                  </h4>
                </div>
                {config.description && (
                  <p className="text-xs text-gray-500 mb-2">{config.description}</p>
                )}
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-50 px-3 py-2 rounded border border-gray-200 text-gray-700 font-mono break-all">
                    {config.config_value}
                  </code>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => copyToClipboard(config.config_value, config.config_key)}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium whitespace-nowrap"
                  title="Copy to clipboard"
                >
                  {copiedKey === config.config_key ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-green-600" />
                      <span className="text-green-600">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => saveToSettings(config)}
                  disabled={savingKey === config.config_key}
                  className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  title="Save to your settings"
                >
                  {savingKey === config.config_key ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      <span>Saving...</span>
                    </>
                  ) : saveStatus[config.config_key] === 'success' ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Saved!</span>
                    </>
                  ) : saveStatus[config.config_key] === 'error' ? (
                    <>
                      <AlertCircle className="w-4 h-4" />
                      <span>Error</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-blue-800">
            <strong>Note:</strong> These configuration links are provided by the system administrator.
            You can copy them for your records or save them directly to your account settings.
            Saved configurations will be available in the Settings page.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SubscriberConfigLinks;
