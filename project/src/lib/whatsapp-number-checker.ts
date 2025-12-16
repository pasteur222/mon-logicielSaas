/**
 * Enhanced WhatsApp Number Checker with Pre-validation
 * Only calls WhatsApp API for numbers that pass all format checks
 */

import { supabase } from './supabase';
import { validatePhoneNumberComprehensive, type ValidationResult } from './phone-validation';

export interface WhatsAppValidationResult {
  phoneNumber: string;
  isValid: boolean;
  hasWhatsApp: boolean | null;
  waId?: string;
  validationDetails: ValidationResult;
  apiCalled: boolean;
  source: 'cache' | 'api' | 'pre_validation_failed';
  error?: string;
  timestamp: string;
}

export interface BatchValidationOptions {
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  retryDelay: number;
  useCache: boolean;
  skipApiValidation: boolean;
}

const DEFAULT_BATCH_OPTIONS: BatchValidationOptions = {
  batchSize: 20,
  delayBetweenBatches: 1000,
  maxRetries: 3,
  retryDelay: 2000,
  useCache: true,
  skipApiValidation: false
};

/**
 * Enhanced WhatsApp number validation with mandatory pre-validation
 */
export async function validateWhatsAppNumber(
  phoneNumber: string,
  options: Partial<BatchValidationOptions> = {}
): Promise<WhatsAppValidationResult> {
  const opts = { ...DEFAULT_BATCH_OPTIONS, ...options };
  const timestamp = new Date().toISOString();

  console.log('📱 [WHATSAPP-CHECKER] Starting validation for:', phoneNumber);

  // Step 1: MANDATORY pre-validation (format, country code, length, prefix)
  const preValidation = validatePhoneNumberComprehensive(phoneNumber);
  
  console.log('🔍 [WHATSAPP-CHECKER] Pre-validation result:', {
    isValid: preValidation.isValid,
    countryCode: preValidation.countryCode,
    countryName: preValidation.countryName,
    errors: preValidation.errors,
    validationSteps: preValidation.validationSteps
  });

  // If pre-validation fails, IMMEDIATELY reject without API call
  if (!preValidation.isValid) {
    console.log('❌ [WHATSAPP-CHECKER] Pre-validation failed, rejecting without API call');
    
    return {
      phoneNumber,
      isValid: false,
      hasWhatsApp: false,
      validationDetails: preValidation,
      apiCalled: false,
      source: 'pre_validation_failed',
      error: `Pre-validation failed: ${preValidation.errors.join(', ')}`,
      timestamp
    };
  }

  console.log('✅ [WHATSAPP-CHECKER] Pre-validation passed, proceeding to WhatsApp check');

  const normalizedNumber = `${preValidation.countryCode}${preValidation.localNumber}`;

  // Step 2: Check cache if enabled
  if (opts.useCache) {
    const cachedResult = await checkWhatsAppCache(normalizedNumber);
    if (cachedResult) {
      console.log('💾 [WHATSAPP-CHECKER] Found in cache:', normalizedNumber);
      
      return {
        phoneNumber: normalizedNumber,
        isValid: true,
        hasWhatsApp: true,
        waId: cachedResult.wa_id,
        validationDetails: preValidation,
        apiCalled: false,
        source: 'cache',
        timestamp
      };
    }
  }

  // Step 3: Call WhatsApp API only for pre-validated numbers
  if (opts.skipApiValidation) {
    console.log('⏭️ [WHATSAPP-CHECKER] Skipping API validation as requested');
    
    return {
      phoneNumber: normalizedNumber,
      isValid: true,
      hasWhatsApp: null, // Unknown without API call
      validationDetails: preValidation,
      apiCalled: false,
      source: 'pre_validation_failed',
      timestamp
    };
  }

  try {
    console.log('📞 [WHATSAPP-CHECKER] Calling WhatsApp API for validated number:', normalizedNumber);
    
    const apiResult = await callWhatsAppValidationAPI([normalizedNumber], opts);
    const result = apiResult[0];

    if (result && result.status === 'valid') {
      // Cache the positive result
      if (opts.useCache && result.wa_id) {
        await cacheWhatsAppNumber(normalizedNumber, result.wa_id);
      }

      console.log('✅ [WHATSAPP-CHECKER] WhatsApp API confirmed number is valid');

      return {
        phoneNumber: normalizedNumber,
        isValid: true,
        hasWhatsApp: true,
        waId: result.wa_id,
        validationDetails: preValidation,
        apiCalled: true,
        source: 'api',
        timestamp
      };
    } else {
      console.log('❌ [WHATSAPP-CHECKER] WhatsApp API confirmed number is not on WhatsApp');

      return {
        phoneNumber: normalizedNumber,
        isValid: true, // Format is valid, just not on WhatsApp
        hasWhatsApp: false,
        validationDetails: preValidation,
        apiCalled: true,
        source: 'api',
        timestamp
      };
    }

  } catch (apiError) {
    console.error('❌ [WHATSAPP-CHECKER] WhatsApp API error:', apiError);

    return {
      phoneNumber: normalizedNumber,
      isValid: true, // Format is valid, API error doesn't change that
      hasWhatsApp: null, // Unknown due to API error
      validationDetails: preValidation,
      apiCalled: true,
      source: 'api',
      error: `API error: ${apiError.message}`,
      timestamp
    };
  }
}

/**
 * Batch validate WhatsApp numbers with enhanced pre-validation
 */
export async function batchValidateWhatsAppNumbers(
  phoneNumbers: string[],
  options: Partial<BatchValidationOptions> = {},
  onProgress?: (progress: { completed: number; total: number; currentBatch: number }) => void
): Promise<{
  results: WhatsAppValidationResult[];
  summary: {
    total: number;
    preValidationPassed: number;
    preValidationFailed: number;
    whatsAppValid: number;
    whatsAppInvalid: number;
    apiCallsMade: number;
    cacheHits: number;
    errors: number;
  };
}> {
  const opts = { ...DEFAULT_BATCH_OPTIONS, ...options };
  const results: WhatsAppValidationResult[] = [];
  
  console.log(`📱 [WHATSAPP-CHECKER] Starting batch validation for ${phoneNumbers.length} numbers`);
  console.log('⚙️ [WHATSAPP-CHECKER] Options:', opts);

  // Process numbers in batches
  const batchSize = opts.batchSize;
  const totalBatches = Math.ceil(phoneNumbers.length / batchSize);

  for (let i = 0; i < phoneNumbers.length; i += batchSize) {
    const batch = phoneNumbers.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    console.log(`📦 [WHATSAPP-CHECKER] Processing batch ${batchNumber}/${totalBatches} (${batch.length} numbers)`);

    // Pre-validate entire batch first
    const preValidatedNumbers: string[] = [];
    const batchResults: WhatsAppValidationResult[] = [];

    for (const phoneNumber of batch) {
      const preValidation = validatePhoneNumberComprehensive(phoneNumber);
      
      if (preValidation.isValid) {
        const normalizedNumber = `${preValidation.countryCode}${preValidation.localNumber}`;
        preValidatedNumbers.push(normalizedNumber);
        
        // Check cache first
        if (opts.useCache) {
          const cachedResult = await checkWhatsAppCache(normalizedNumber);
          if (cachedResult) {
            batchResults.push({
              phoneNumber: normalizedNumber,
              isValid: true,
              hasWhatsApp: true,
              waId: cachedResult.wa_id,
              validationDetails: preValidation,
              apiCalled: false,
              source: 'cache',
              timestamp: new Date().toISOString()
            });
            continue;
          }
        }
      } else {
        // Pre-validation failed - add to results without API call
        batchResults.push({
          phoneNumber,
          isValid: false,
          hasWhatsApp: false,
          validationDetails: preValidation,
          apiCalled: false,
          source: 'pre_validation_failed',
          error: `Pre-validation failed: ${preValidation.errors.join(', ')}`,
          timestamp: new Date().toISOString()
        });
      }
    }

    // Only call API for numbers that passed pre-validation and aren't cached
    const numbersForApi = preValidatedNumbers.filter(num => 
      !batchResults.some(result => result.phoneNumber === num)
    );

    if (numbersForApi.length > 0 && !opts.skipApiValidation) {
      console.log(`📞 [WHATSAPP-CHECKER] Calling WhatsApp API for ${numbersForApi.length} pre-validated numbers`);
      
      try {
        const apiResults = await callWhatsAppValidationAPI(numbersForApi, opts);
        
        apiResults.forEach((apiResult, index) => {
          const phoneNumber = numbersForApi[index];
          const preValidation = validatePhoneNumberComprehensive(phoneNumber);
          
          const result: WhatsAppValidationResult = {
            phoneNumber,
            isValid: true, // Pre-validation already passed
            hasWhatsApp: apiResult.status === 'valid',
            waId: apiResult.wa_id,
            validationDetails: preValidation,
            apiCalled: true,
            source: 'api',
            timestamp: new Date().toISOString()
          };

          if (apiResult.error) {
            result.error = apiResult.error;
            result.hasWhatsApp = null; // Unknown due to error
          }

          batchResults.push(result);

          // Cache positive results
          if (opts.useCache && apiResult.status === 'valid' && apiResult.wa_id) {
            cacheWhatsAppNumber(phoneNumber, apiResult.wa_id).catch(console.error);
          }
        });

      } catch (apiError) {
        console.error(`❌ [WHATSAPP-CHECKER] API error for batch ${batchNumber}:`, apiError);
        
        // Add error results for numbers that couldn't be checked
        numbersForApi.forEach(phoneNumber => {
          const preValidation = validatePhoneNumberComprehensive(phoneNumber);
          
          batchResults.push({
            phoneNumber,
            isValid: true, // Pre-validation passed
            hasWhatsApp: null, // Unknown due to API error
            validationDetails: preValidation,
            apiCalled: true,
            source: 'api',
            error: `API error: ${apiError.message}`,
            timestamp: new Date().toISOString()
          });
        });
      }
    }

    results.push(...batchResults);

    // Report progress
    if (onProgress) {
      onProgress({
        completed: Math.min(i + batchSize, phoneNumbers.length),
        total: phoneNumbers.length,
        currentBatch: batchNumber
      });
    }

    // Add delay between batches (except for the last batch)
    if (i + batchSize < phoneNumbers.length) {
      console.log(`⏳ [WHATSAPP-CHECKER] Waiting ${opts.delayBetweenBatches}ms before next batch...`);
      await new Promise(resolve => setTimeout(resolve, opts.delayBetweenBatches));
    }
  }

  // Calculate summary statistics
  const summary = {
    total: results.length,
    preValidationPassed: results.filter(r => r.validationDetails.isValid).length,
    preValidationFailed: results.filter(r => !r.validationDetails.isValid).length,
    whatsAppValid: results.filter(r => r.hasWhatsApp === true).length,
    whatsAppInvalid: results.filter(r => r.hasWhatsApp === false).length,
    apiCallsMade: results.filter(r => r.apiCalled).length,
    cacheHits: results.filter(r => r.source === 'cache').length,
    errors: results.filter(r => r.error).length
  };

  console.log('📊 [WHATSAPP-CHECKER] Batch validation completed:', summary);

  return { results, summary };
}

/**
 * Check WhatsApp number cache
 */
async function checkWhatsAppCache(phoneNumber: string): Promise<{ wa_id: string } | null> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_valid_numbers')
      .select('wa_id')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (error) {
      console.error('Cache check error:', error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error checking WhatsApp cache:', error);
    return null;
  }
}

/**
 * Cache WhatsApp number validation result
 */
async function cacheWhatsAppNumber(phoneNumber: string, waId: string): Promise<void> {
  try {
    await supabase
      .from('whatsapp_valid_numbers')
      .upsert({
        phone_number: phoneNumber,
        wa_id: waId,
        validated_at: new Date().toISOString()
      }, { onConflict: 'phone_number' });

    console.log('💾 [WHATSAPP-CHECKER] Cached validation result for:', phoneNumber);
  } catch (error) {
    console.error('Error caching WhatsApp number:', error);
  }
}

/**
 * Call WhatsApp validation API (only for pre-validated numbers)
 */
async function callWhatsAppValidationAPI(
  phoneNumbers: string[],
  options: BatchValidationOptions
): Promise<Array<{ input: string; status: 'valid' | 'invalid'; wa_id?: string; error?: string }>> {
  try {
    console.log(`📞 [WHATSAPP-CHECKER] Calling WhatsApp API for ${phoneNumbers.length} pre-validated numbers`);

    // Call the Edge Function for WhatsApp validation
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/check-whatsapp-numbers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ phoneNumbers })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'API validation failed');
    }

    console.log(`✅ [WHATSAPP-CHECKER] API validation completed for ${phoneNumbers.length} numbers`);
    
    return data.results || [];

  } catch (error) {
    console.error('❌ [WHATSAPP-CHECKER] WhatsApp API error:', error);
    
    // Return error results for all numbers
    return phoneNumbers.map(phoneNumber => ({
      input: phoneNumber,
      status: 'invalid' as const,
      error: error.message
    }));
  }
}

/**
 * Get validation statistics for reporting
 */
export function getValidationStatistics(results: WhatsAppValidationResult[]): {
  preValidation: {
    passed: number;
    failed: number;
    passRate: number;
  };
  whatsAppValidation: {
    valid: number;
    invalid: number;
    unknown: number;
    validRate: number;
  };
  apiUsage: {
    callsMade: number;
    cacheHits: number;
    errors: number;
    efficiency: number;
  };
  byCountry: Record<string, {
    total: number;
    preValidationPassed: number;
    whatsAppValid: number;
  }>;
} {
  const total = results.length;
  const preValidationPassed = results.filter(r => r.validationDetails.isValid).length;
  const preValidationFailed = total - preValidationPassed;
  
  const whatsAppValid = results.filter(r => r.hasWhatsApp === true).length;
  const whatsAppInvalid = results.filter(r => r.hasWhatsApp === false).length;
  const whatsAppUnknown = results.filter(r => r.hasWhatsApp === null).length;
  
  const apiCallsMade = results.filter(r => r.apiCalled).length;
  const cacheHits = results.filter(r => r.source === 'cache').length;
  const errors = results.filter(r => r.error).length;

  // Group by country
  const byCountry: Record<string, { total: number; preValidationPassed: number; whatsAppValid: number }> = {};
  
  results.forEach(result => {
    const country = result.validationDetails.countryName || 'Unknown';
    if (!byCountry[country]) {
      byCountry[country] = { total: 0, preValidationPassed: 0, whatsAppValid: 0 };
    }
    
    byCountry[country].total++;
    if (result.validationDetails.isValid) {
      byCountry[country].preValidationPassed++;
    }
    if (result.hasWhatsApp === true) {
      byCountry[country].whatsAppValid++;
    }
  });

  return {
    preValidation: {
      passed: preValidationPassed,
      failed: preValidationFailed,
      passRate: total > 0 ? (preValidationPassed / total) * 100 : 0
    },
    whatsAppValidation: {
      valid: whatsAppValid,
      invalid: whatsAppInvalid,
      unknown: whatsAppUnknown,
      validRate: (whatsAppValid + whatsAppInvalid) > 0 ? (whatsAppValid / (whatsAppValid + whatsAppInvalid)) * 100 : 0
    },
    apiUsage: {
      callsMade: apiCallsMade,
      cacheHits,
      errors,
      efficiency: total > 0 ? ((cacheHits + (apiCallsMade - errors)) / total) * 100 : 0
    },
    byCountry
  };
}

/**
 * Export validation results to CSV
 */
export function exportValidationResults(results: WhatsAppValidationResult[]): string {
  const headers = [
    'Phone Number',
    'Country Code',
    'Country Name',
    'Local Number',
    'Pre-Validation Status',
    'WhatsApp Status',
    'WA ID',
    'API Called',
    'Source',
    'Validation Errors',
    'Timestamp'
  ];

  const csvRows = [headers.join(',')];

  results.forEach(result => {
    const row = [
      result.phoneNumber,
      result.validationDetails.countryCode,
      result.validationDetails.countryName,
      result.validationDetails.localNumber,
      result.validationDetails.isValid ? 'PASSED' : 'FAILED',
      result.hasWhatsApp === true ? 'VALID' : result.hasWhatsApp === false ? 'INVALID' : 'UNKNOWN',
      result.waId || '',
      result.apiCalled ? 'YES' : 'NO',
      result.source.toUpperCase(),
      result.validationDetails.errors.join('; '),
      result.timestamp
    ].map(value => `"${String(value).replace(/"/g, '""')}"`);
    
    csvRows.push(row.join(','));
  });

  return csvRows.join('\n');
}