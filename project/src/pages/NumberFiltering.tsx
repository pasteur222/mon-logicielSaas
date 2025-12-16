import React, { useState, useRef } from 'react';
import { Upload, Download, Loader2, Phone, X, HelpCircle, FileText, Plus, Trash2, Clock, RefreshCw, Gauge, Save, AlertCircle, CheckCircle, XCircle, Settings, Filter, Globe, MapPin, BarChart2, Eye, Info } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import BackButton from '../components/BackButton';
import {
  validateWhatsAppNumber,
  batchValidateWhatsAppNumbers,
  getValidationStatistics,
  exportValidationResults,
  type WhatsAppValidationResult
} from '../lib/whatsapp-number-checker';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface FilterSettings {
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  retryDelay: number;
  useCache: boolean;
  skipApiValidation: boolean;
}

const NumberFiltering = () => {
  const [inputNumbers, setInputNumbers] = useState<string[]>([]);
  const [validationResults, setValidationResults] = useState<WhatsAppValidationResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showCountryInfo, setShowCountryInfo] = useState(false);
  const [showValidationDetails, setShowValidationDetails] = useState(false);
  const [validationSummary, setValidationSummary] = useState<any>(null);
  const [filterSettings, setFilterSettings] = useState<FilterSettings>({
    batchSize: 20,
    delayBetweenBatches: 1000,
    maxRetries: 3,
    retryDelay: 2000,
    useCache: true,
    skipApiValidation: false
  });
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split(/\r?\n/);
      const phoneNumbers = lines
        .map(line => line.trim())
        .filter(line => line.length > 0);

      setInputNumbers(phoneNumbers);
      setValidationResults([]);
      setValidationSummary(null);
      setError(null);
      setSuccess(null);
    };
    reader.readAsText(file);
  };

  const startProcessing = async () => {
    setIsProcessing(true);
    setProgress(0);
    setError(null);
    setSuccess(null);
    setValidationResults([]);
    setValidationSummary(null);
    abortControllerRef.current = new AbortController();

    try {
      console.log('🚀 [NUMBER-FILTERING] Starting enhanced validation process');
      
      const { results, summary } = await batchValidateWhatsAppNumbers(
        inputNumbers,
        {
          batchSize: filterSettings.batchSize,
          delayBetweenBatches: filterSettings.delayBetweenBatches,
          maxRetries: filterSettings.maxRetries,
          retryDelay: filterSettings.retryDelay,
          useCache: filterSettings.useCache,
          skipApiValidation: filterSettings.skipApiValidation
        },
        (progressData) => {
          setProgress(Math.round((progressData.completed / progressData.total) * 100));
        }
      );

      setValidationResults(results);
      setValidationSummary(summary);
      
      // Generate success message with detailed statistics
      const successMessage = `✅ Validation completed! ${summary.whatsAppValid} valid WhatsApp numbers found out of ${summary.total} processed. Pre-validation: ${summary.preValidationPassed}/${summary.total} passed format checks.`;
      setSuccess(successMessage);
      
      console.log('✅ [NUMBER-FILTERING] Validation completed:', summary);
      
      // Auto-hide success message after 5 seconds
      setTimeout(() => {
        setSuccess(null);
      }, 5000);
      
    } catch (error) {
      console.error('❌ [NUMBER-FILTERING] Validation failed:', error);
      setError(`Validation failed: ${error.message}`);
    } finally {
      setIsProcessing(false);
      setProgress(0);
      abortControllerRef.current = null;
    }
  };

  const exportResults = () => {
    if (validationResults.length === 0) {
      setError('No validation results to export');
      return;
    }

    try {
      // Export only WhatsApp-valid numbers
      const whatsAppValidNumbers = validationResults
        .filter(result => result.hasWhatsApp === true)
        .map(result => result.phoneNumber)
        .join('\n');

      if (whatsAppValidNumbers.length === 0) {
        setError('No valid WhatsApp numbers found to export');
        return;
      }

      const blob = new Blob([whatsAppValidNumbers], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `whatsapp_valid_numbers_${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccess(`Exported ${validationResults.filter(r => r.hasWhatsApp === true).length} valid WhatsApp numbers`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setError('Failed to export results');
    }
  };

  const exportDetailedResults = () => {
    if (validationResults.length === 0) {
      setError('No validation results to export');
      return;
    }

    try {
      const csvContent = exportValidationResults(validationResults);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `detailed_validation_results_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccess('Detailed validation results exported');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Export error:', error);
      setError('Failed to export detailed results');
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsProcessing(false);
    setProgress(0);
  };

  const removeNumber = (index: number) => {
    setInputNumbers(prev => prev.filter((_, i) => i !== index));
    // Clear results if numbers are modified
    if (validationResults.length > 0) {
      setValidationResults([]);
      setValidationSummary(null);
    }
  };

  const getStatusIcon = (result: WhatsAppValidationResult) => {
    if (!result.validationDetails.isValid) {
      return <XCircle className="w-4 h-4 text-red-500" />;
    }
    
    if (result.hasWhatsApp === true) {
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    } else if (result.hasWhatsApp === false) {
      return <XCircle className="w-4 h-4 text-orange-500" />;
    } else {
      return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusText = (result: WhatsAppValidationResult) => {
    if (!result.validationDetails.isValid) {
      return 'Format Invalid';
    }
    
    if (result.hasWhatsApp === true) {
      return 'WhatsApp ✅';
    } else if (result.hasWhatsApp === false) {
      return 'No WhatsApp ❌';
    } else {
      return 'Unknown';
    }
  };

  const getStatusColor = (result: WhatsAppValidationResult) => {
    if (!result.validationDetails.isValid) {
      return 'bg-red-50 border-red-200 text-red-700';
    }
    
    if (result.hasWhatsApp === true) {
      return 'bg-green-50 border-green-200 text-green-700';
    } else if (result.hasWhatsApp === false) {
      return 'bg-orange-50 border-orange-200 text-orange-700';
    } else {
      return 'bg-yellow-50 border-yellow-200 text-yellow-700';
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <BackButton />
        </div>
        
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Enhanced WhatsApp Number Filtering</h1>

        {/* Enhanced Information Panel */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3">
            <Info className="w-6 h-6 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-medium text-blue-800 mb-2">Enhanced Validation Process</h3>
              <div className="text-sm text-blue-700 space-y-2">
                <p><strong>Step 1:</strong> Mandatory country code verification - numbers without valid country codes are immediately rejected</p>
                <p><strong>Step 2:</strong> Country-specific format validation - length and mobile prefix verification</p>
                <p><strong>Step 3:</strong> WhatsApp API validation - only for numbers that pass all format checks</p>
                <p><strong>Supported:</strong> Multiple countries with specific validation rules</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setShowCountryInfo(true)}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  View supported countries
                </button>
                {validationResults.length > 0 && (
                  <button
                    onClick={() => setShowValidationDetails(true)}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    View validation details
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Upload Section */}
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Import Phone Numbers</h2>
              <p className="text-sm text-gray-500 mt-1">
                Upload a file with phone numbers including country codes (e.g., +242, +33, +1)
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                <Settings className="w-4 h-4" />
                Settings
              </button>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                disabled={isProcessing}
              />
              <label
                htmlFor="file-upload"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                Import File
              </label>
            </div>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h3 className="text-md font-medium text-gray-900 mb-4">Validation Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Batch Size
                  </label>
                  <input
                    type="number"
                    value={filterSettings.batchSize}
                    onChange={(e) => setFilterSettings({...filterSettings, batchSize: parseInt(e.target.value) || 20})}
                    min="1"
                    max="100"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Numbers processed simultaneously (1-100)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delay Between Batches (ms)
                  </label>
                  <input
                    type="number"
                    value={filterSettings.delayBetweenBatches}
                    onChange={(e) => setFilterSettings({...filterSettings, delayBetweenBatches: parseInt(e.target.value) || 1000})}
                    min="500"
                    max="5000"
                    step="100"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <p className="mt-1 text-sm text-gray-500">
                    Wait time between batches (500-5000ms)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Max Retry Attempts
                  </label>
                  <input
                    type="number"
                    value={filterSettings.maxRetries}
                    onChange={(e) => setFilterSettings({...filterSettings, maxRetries: parseInt(e.target.value) || 3})}
                    min="1"
                    max="10"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Retry attempts for failed API calls (1-10)
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Retry Delay (ms)
                  </label>
                  <input
                    type="number"
                    value={filterSettings.retryDelay}
                    onChange={(e) => setFilterSettings({...filterSettings, retryDelay: parseInt(e.target.value) || 2000})}
                    min="1000"
                    max="10000"
                    step="500"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Wait time before retry attempts (1000-10000ms)
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="use-cache"
                    checked={filterSettings.useCache}
                    onChange={(e) => setFilterSettings({...filterSettings, useCache: e.target.checked})}
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <label htmlFor="use-cache" className="ml-2 block text-sm text-gray-900">
                    Use validation cache (recommended)
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="skip-api"
                    checked={filterSettings.skipApiValidation}
                    onChange={(e) => setFilterSettings({...filterSettings, skipApiValidation: e.target.checked})}
                    className="h-4 w-4 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <label htmlFor="skip-api" className="ml-2 block text-sm text-gray-900">
                    Skip WhatsApp API validation (format check only)
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Error and Success Messages */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <p>{success}</p>
            </div>
          )}

          {/* Validation Summary */}
          {validationSummary && (
            <div className="mb-6 bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                <BarChart2 className="w-5 h-5 text-blue-600" />
                Validation Summary
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{validationSummary.total}</div>
                  <div className="text-sm text-blue-600">Total Numbers</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{validationSummary.preValidationPassed}</div>
                  <div className="text-sm text-green-600">Format Valid</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{validationSummary.whatsAppValid}</div>
                  <div className="text-sm text-purple-600">WhatsApp Valid</div>
                </div>
                <div className="text-center p-3 bg-yellow-50 rounded-lg">
                  <div className="text-2xl font-bold text-yellow-600">{validationSummary.apiCallsMade}</div>
                  <div className="text-sm text-yellow-600">API Calls Made</div>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  Pre-validation pass rate: <span className="font-medium">{((validationSummary.preValidationPassed / validationSummary.total) * 100).toFixed(1)}%</span>
                </div>
                <div className="text-sm text-gray-600">
                  WhatsApp valid rate: <span className="font-medium">{validationSummary.whatsAppValidation.validRate.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          )}

          {/* Processing Controls */}
          {inputNumbers.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  {isProcessing ? (
                    <button
                      onClick={handleCancel}
                      className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      <X className="w-4 h-4" />
                      Cancel
                    </button>
                  ) : (
                    <button
                      onClick={startProcessing}
                      disabled={isProcessing || inputNumbers.length === 0}
                      className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Phone className="w-5 h-5" />
                      )}
                      {isProcessing ? 'Validating...' : 'Start Enhanced Validation'}
                    </button>
                  )}
                  {isProcessing && (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-32 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-600 transition-all duration-300"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-sm text-gray-600">{progress}%</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-sm text-gray-500">
                    {inputNumbers.length} number(s) loaded
                  </div>
                  {validationResults.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={exportResults}
                        className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        <Download className="w-4 h-4" />
                        Export Valid Numbers
                      </button>
                      <button
                        onClick={exportDetailedResults}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        <FileText className="w-4 h-4" />
                        Export Detailed Report
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Results Display */}
          {validationResults.length > 0 ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900">Validation Results</h3>
                  <div className="text-sm text-gray-500">
                    {validationResults.filter(r => r.hasWhatsApp === true).length} valid WhatsApp numbers found
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {validationResults.map((result, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(result)}
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {formatPhoneNumberForDisplay(result.phoneNumber)}
                            </span>
                            {result.validationDetails.countryName && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                {result.validationDetails.countryName}
                              </span>
                            )}
                          </div>
                          {result.error && (
                            <p className="text-sm text-red-600 mt-1">{result.error}</p>
                          )}
                          {result.validationDetails.errors.length > 0 && (
                            <p className="text-sm text-red-600 mt-1">
                              {result.validationDetails.errors.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(result)}`}>
                          {getStatusText(result)}
                        </div>
                        <div className="text-xs text-gray-500">
                          {result.source.toUpperCase()}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : inputNumbers.length > 0 ? (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="text-sm font-medium text-gray-900">Imported Numbers (Not Yet Validated)</h3>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {inputNumbers.map((number, index) => (
                  <div key={index} className="p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-900">{number}</span>
                      <button
                        onClick={() => removeNumber(index)}
                        className="p-1 text-gray-400 hover:text-red-500"
                        disabled={isProcessing}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Phone className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>Import a file to start enhanced validation</p>
              <p className="text-sm mt-2">Supported formats: .txt, .csv with country codes</p>
            </div>
          )}
        </div>

        {/* Enhanced How It Works Section */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Enhanced Validation Process</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="text-center">
              <div className="bg-blue-100 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Globe className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">1. Country Code Check</h3>
              <p className="text-sm text-gray-600">
                Mandatory verification that all numbers include valid country codes (+242, +33, +1, etc.)
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-green-100 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <MapPin className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">2. Format Validation</h3>
              <p className="text-sm text-gray-600">
                Country-specific length and mobile prefix validation for multiple supported countries
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-purple-100 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Phone className="w-8 h-8 text-purple-600" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">3. WhatsApp API Check</h3>
              <p className="text-sm text-gray-600">
                Official WhatsApp API validation only for numbers that pass all format checks
              </p>
            </div>
            
            <div className="text-center">
              <div className="bg-yellow-100 p-3 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <Download className="w-8 h-8 text-yellow-600" />
              </div>
              <h3 className="font-medium text-gray-900 mb-2">4. Export Results</h3>
              <p className="text-sm text-gray-600">
                Export validated WhatsApp numbers or detailed validation reports with error analysis
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NumberFiltering;
