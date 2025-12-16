import React, { useState, useEffect } from 'react';
import { Link, Save, X, AlertCircle, CheckCircle, ExternalLink } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

interface WebhookApiLinksConfig {
  id?: string;
  webhook_url: string;
  groq_api_url: string;
  webhook_enabled: boolean;
  groq_enabled: boolean;
  notes: string;
}

export function WebhookApiLinksManager() {
  const { user } = useAuth();
  const [config, setConfig] = useState<WebhookApiLinksConfig>({
    webhook_url: '',
    groq_api_url: '',
    webhook_enabled: true,
    groq_enabled: true,
    notes: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('webhook_api_links')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (data) {
        setConfig({
          id: data.id,
          webhook_url: data.webhook_url || '',
          groq_api_url: data.groq_api_url || '',
          webhook_enabled: data.webhook_enabled,
          groq_enabled: data.groq_enabled,
          notes: data.notes || ''
        });
      }
    } catch (err) {
      console.error('Error loading webhook/API links config:', err);
      setError(err instanceof Error ? err.message : 'Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Validate URLs
      if (config.webhook_url && config.webhook_enabled) {
        try {
          new URL(config.webhook_url);
        } catch {
          throw new Error('Webhook URL is not valid');
        }
      }

      if (config.groq_api_url && config.groq_enabled) {
        try {
          new URL(config.groq_api_url);
        } catch {
          throw new Error('Groq API URL is not valid');
        }
      }

      const payload = {
        user_id: user?.id,
        webhook_url: config.webhook_url,
        groq_api_url: config.groq_api_url,
        webhook_enabled: config.webhook_enabled,
        groq_enabled: config.groq_enabled,
        notes: config.notes
      };

      if (config.id) {
        // Update existing
        const { error: updateError } = await supabase
          .from('webhook_api_links')
          .update(payload)
          .eq('id', config.id);

        if (updateError) throw updateError;
      } else {
        // Insert new
        const { data: insertData, error: insertError } = await supabase
          .from('webhook_api_links')
          .insert(payload)
          .select('id')
          .single();

        if (insertError) throw insertError;
        setConfig(prev => ({ ...prev, id: insertData.id }));
      }

      setSuccess('Configuration saved successfully');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error saving webhook/API links config:', err);
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const testWebhook = () => {
    if (config.webhook_url) {
      window.open(config.webhook_url, '_blank');
    }
  };

  const testGroqApi = () => {
    if (config.groq_api_url) {
      window.open(config.groq_api_url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center gap-2 mb-6">
        <Link className="w-6 h-6 text-blue-600" />
        <h2 className="text-xl font-semibold text-gray-900">Webhook & API Configuration</h2>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-green-800">{success}</p>
          </div>
          <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="space-y-6">
        {/* Webhook URL */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Webhook URL
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.webhook_enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, webhook_enabled: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Enabled</span>
            </label>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={config.webhook_url}
              onChange={(e) => setConfig(prev => ({ ...prev, webhook_url: e.target.value }))}
              placeholder="https://your-domain.com/webhook"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!config.webhook_enabled}
            />
            <button
              onClick={testWebhook}
              disabled={!config.webhook_url || !config.webhook_enabled}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            URL where incoming messages will be forwarded
          </p>
        </div>

        {/* Groq API URL */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Groq API URL
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.groq_enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, groq_enabled: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">Enabled</span>
            </label>
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              value={config.groq_api_url}
              onChange={(e) => setConfig(prev => ({ ...prev, groq_api_url: e.target.value }))}
              placeholder="https://api.groq.com/openai/v1"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={!config.groq_enabled}
            />
            <button
              onClick={testGroqApi}
              disabled={!config.groq_api_url || !config.groq_enabled}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Groq API endpoint for AI processing
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Notes (Optional)
          </label>
          <textarea
            value={config.notes}
            onChange={(e) => setConfig(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Add any notes about this configuration..."
            rows={3}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Save Button */}
        <div className="flex justify-end pt-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex gap-2">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Configuration Guide:</p>
            <ul className="list-disc list-inside space-y-1 text-xs">
              <li>Webhook URL: Endpoint where incoming messages are sent</li>
              <li>Groq API URL: AI processing endpoint for chatbot responses</li>
              <li>Toggle switches to enable/disable each integration</li>
              <li>Use the external link button to test URLs in a new tab</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
