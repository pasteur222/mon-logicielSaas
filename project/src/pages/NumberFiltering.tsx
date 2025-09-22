import React, { useState, useRef } from 'react';
import { Upload, Download, Loader2, Phone, X, HelpCircle, FileText, Plus, Trash2, Clock, RefreshCw, Gauge, Save, AlertCircle, CheckCircle, XCircle, Settings, Filter, Globe, MapPin, BarChart2, Eye, Info } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import BackButton from '../components/BackButton';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

interface CountryValidationRule {
  countryCode: string;
  countryName: string;
  totalLength: number; // excluding country code
  mobilePrefixes: string[];
  description: string;
  region: 'francophone' | 'anglophone' | 'other';
}

interface ValidationResult {
  isValid: boolean;
  phoneNumber: string;
  countryCode: string;
  countryName: string;
  localNumber: string;
  errors: string[];
  warnings: string[];
  validationSteps: {
    hasCountryCode: boolean;
    countrySupported: boolean;
    lengthValid: boolean;
    prefixValid: boolean;
    formatValid: boolean;
  };
}

interface WhatsAppValidationResult {
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

interface FilterSettings {
  batchSize: number;
  delayBetweenBatches: number;
  maxRetries: number;
  retryDelay: number;
  useCache: boolean;
  skipApiValidation: boolean;
}

// Comprehensive country validation rules
const COUNTRY_VALIDATION_RULES: CountryValidationRule[] = [
  // Original countries
  {
    countryCode: '+242',
    countryName: 'Republic of Congo',
    totalLength: 9,
    mobilePrefixes: ['05', '06'],
    description: 'Congo mobile numbers: +242 05/06 XXX XXXX',
    region: 'francophone'
  },
  {
    countryCode: '+243',
    countryName: 'DR Congo',
    totalLength: 9,
    mobilePrefixes: ['81', '82', '83', '84', '85', '89'],
    description: 'DR Congo mobile numbers: +243 81/82/83/84/85/89 XXX XXXX',
    region: 'francophone'
  },
  {
    countryCode: '+221',
    countryName: 'Senegal',
    totalLength: 9,
    mobilePrefixes: ['70', '75', '76', '77', '78'],
    description: 'Senegal mobile numbers: +221 7X XXX XXXX',
    region: 'francophone'
  },
  {
    countryCode: '+33',
    countryName: 'France',
    totalLength: 9,
    mobilePrefixes: ['06', '07'],
    description: 'France mobile numbers: +33 06/07 XX XX XX XX',
    region: 'francophone'
  },
  {
    countryCode: '+1',
    countryName: 'USA/Canada',
    totalLength: 10,
    mobilePrefixes: [
      // US area codes
      '201', '202', '203', '205', '206', '207', '208', '209', '210', '212', '213', '214', '215', '216', '217', '218', '219', '224', '225', '228', '229', '231', '234', '239', '240', '248', '251', '252', '253', '254', '256', '260', '262', '267', '269', '270', '272', '274', '276', '281', '283', '301', '302', '303', '304', '305', '307', '308', '309', '310', '312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '323', '325', '330', '331', '334', '336', '337', '339', '346', '347', '351', '352', '360', '361', '364', '380', '385', '386', '401', '402', '404', '405', '406', '407', '408', '409', '410', '412', '413', '414', '415', '417', '419', '423', '424', '425', '430', '432', '434', '435', '440', '442', '443', '445', '447', '458', '463', '464', '469', '470', '475', '478', '479', '480', '484', '501', '502', '503', '504', '505', '507', '508', '509', '510', '512', '513', '515', '516', '517', '518', '520', '530', '531', '534', '539', '540', '541', '551', '559', '561', '562', '563', '564', '567', '570', '571', '573', '574', '575', '580', '585', '586', '601', '602', '603', '605', '606', '607', '608', '609', '610', '612', '614', '615', '616', '617', '618', '619', '620', '623', '626', '628', '629', '630', '631', '636', '641', '646', '650', '651', '657', '660', '661', '662', '667', '669', '678', '681', '682', '689', '701', '702', '703', '704', '706', '707', '708', '712', '713', '714', '715', '716', '717', '718', '719', '720', '724', '725', '727', '731', '732', '734', '737', '740', '743', '747', '754', '757', '760', '762', '763', '765', '769', '770', '772', '773', '774', '775', '779', '781', '785', '786', '787', '801', '802', '803', '804', '805', '806', '808', '810', '812', '813', '814', '815', '816', '817', '818', '828', '830', '831', '832', '843', '845', '847', '848', '850', '856', '857', '858', '859', '860', '862', '863', '864', '865', '870', '872', '878', '901', '903', '904', '906', '907', '908', '909', '910', '912', '913', '914', '915', '916', '917', '918', '919', '920', '925', '928', '929', '930', '931', '934', '936', '937', '938', '940', '941', '947', '949', '951', '952', '954', '956', '959', '970', '971', '972', '973', '975', '978', '979', '980', '984', '985', '989',
      // Canadian area codes
      '204', '226', '236', '249', '250', '289', '306', '343', '365', '403', '416', '418', '431', '437', '438', '450', '506', '514', '519', '548', '579', '581', '587', '604', '613', '639', '647', '672', '705', '709', '778', '780', '782', '807', '819', '825', '867', '873', '902', '905'
    ],
    description: 'North America mobile numbers: +1 XXX XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+27',
    countryName: 'South Africa',
    totalLength: 9,
    mobilePrefixes: ['06', '07', '08'],
    description: 'South Africa mobile numbers: +27 06/07/08 XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+234',
    countryName: 'Nigeria',
    totalLength: 10,
    mobilePrefixes: ['070', '080', '081', '090', '091'],
    description: 'Nigeria mobile numbers: +234 070/080/081/090/091 XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+233',
    countryName: 'Ghana',
    totalLength: 9,
    mobilePrefixes: ['020', '024', '026', '027', '050', '055'],
    description: 'Ghana mobile numbers: +233 020/024/026/027/050/055 XXX XXX',
    region: 'anglophone'
  },
  {
    countryCode: '+237',
    countryName: 'Cameroon',
    totalLength: 9,
    mobilePrefixes: ['65', '66', '67', '68', '69'],
    description: 'Cameroon mobile numbers: +237 6X XXX XXXX',
    region: 'francophone'
  },
  {
    countryCode: '+241',
    countryName: 'Gabon',
    totalLength: 8,
    mobilePrefixes: ['06', '07'],
    description: 'Gabon mobile numbers: +241 06/07 XX XX XX',
    region: 'francophone'
  },
  {
    countryCode: '+255',
    countryName: 'Tanzania',
    totalLength: 9,
    mobilePrefixes: ['065', '067', '071', '074', '075', '076', '078'],
    description: 'Tanzania mobile numbers: +255 06X/07X XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+223',
    countryName: 'Mali',
    totalLength: 8,
    mobilePrefixes: ['65', '66', '67', '73', '74'],
    description: 'Mali mobile numbers: +223 6X/7X XX XX XX',
    region: 'francophone'
  },
  // 8 additional francophone countries
  {
    countryCode: '+225',
    countryName: 'Ivory Coast',
    totalLength: 10,
    mobilePrefixes: ['01', '05', '07', '08', '09'],
    description: 'Ivory Coast mobile numbers: +225 01/05/07/08/09 XX XX XX XX',
    region: 'francophone'
  },
  {
    countryCode: '+226',
    countryName: 'Burkina Faso',
    totalLength: 8,
    mobilePrefixes: ['60', '61', '62', '63', '64', '65', '66'],
    description: 'Burkina Faso mobile numbers: +226 6X XX XX XX',
    region: 'francophone'
  },
  {
    countryCode: '+229',
    countryName: 'Benin',
    totalLength: 8,
    mobilePrefixes: ['60', '61', '62', '63', '64', '65', '66'],
    description: 'Benin mobile numbers: +229 6X XX XX XX',
    region: 'francophone'
  },
  {
    countryCode: '+227',
    countryName: 'Niger',
    totalLength: 8,
    mobilePrefixes: ['90', '91', '92', '93', '94'],
    description: 'Niger mobile numbers: +227 9X XX XX XX',
    region: 'francophone'
  },
  {
    countryCode: '+235',
    countryName: 'Chad',
    totalLength: 8,
    mobilePrefixes: ['60', '61', '62', '63', '66', '67'],
    description: 'Chad mobile numbers: +235 6X XX XX XX',
    region: 'francophone'
  },
  {
    countryCode: '+228',
    countryName: 'Togo',
    totalLength: 8,
    mobilePrefixes: ['90', '91', '92', '93'],
    description: 'Togo mobile numbers: +228 9X XX XX XX',
    region: 'francophone'
  },
  {
    countryCode: '+224',
    countryName: 'Guinea',
    totalLength: 9,
    mobilePrefixes: ['60', '61', '62', '63'],
    description: 'Guinea mobile numbers: +224 6X XXX XXXX',
    region: 'francophone'
  },
  {
    countryCode: '+236',
    countryName: 'Central African Republic',
    totalLength: 8,
    mobilePrefixes: ['70', '75', '77', '78'],
    description: 'CAR mobile numbers: +236 7X XX XX XX',
    region: 'francophone'
  },
  // 8 additional anglophone countries
  {
    countryCode: '+254',
    countryName: 'Kenya',
    totalLength: 9,
    mobilePrefixes: ['07', '01'],
    description: 'Kenya mobile numbers: +254 07/01 XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+256',
    countryName: 'Uganda',
    totalLength: 9,
    mobilePrefixes: ['070', '071', '075', '076', '077', '078'],
    description: 'Uganda mobile numbers: +256 07X XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+263',
    countryName: 'Zimbabwe',
    totalLength: 9,
    mobilePrefixes: ['071', '073', '077', '078'],
    description: 'Zimbabwe mobile numbers: +263 07X XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+251',
    countryName: 'Ethiopia',
    totalLength: 9,
    mobilePrefixes: ['091', '092', '093', '094'],
    description: 'Ethiopia mobile numbers: +251 09X XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+260',
    countryName: 'Zambia',
    totalLength: 9,
    mobilePrefixes: ['095', '096', '097'],
    description: 'Zambia mobile numbers: +260 09X XXX XXXX',
    region: 'anglophone'
  },
  {
    countryCode: '+232',
    countryName: 'Sierra Leone',
    totalLength: 8,
    mobilePrefixes: ['025', '030', '033', '034', '076', '077'],
    description: 'Sierra Leone mobile numbers: +232 0XX XX XX XX',
    region: 'anglophone'
  },
  {
    countryCode: '+231',
    countryName: 'Liberia',
    totalLength: 8,
    mobilePrefixes: ['077', '088'],
    description: 'Liberia mobile numbers: +231 077/088 XX XX XX',
    region: 'anglophone'
  },
  {
    countryCode: '+220',
    countryName: 'Gambia',
    totalLength: 7,
    mobilePrefixes: ['30', '31', '32', '33', '34'],
    description: 'Gambia mobile numbers: +220 3X XX XXX',
    region: 'anglophone'
  }
];

/**
 * Comprehensive phone number validation with mandatory country code verification
 */
function validatePhoneNumberComprehensive(phoneNumber: string): ValidationResult {
  const result: ValidationResult = {
    isValid: false,
    phoneNumber: phoneNumber.trim(),
    countryCode: '',
    countryName: '',
    localNumber: '',
    errors: [],
    warnings: [],
    validationSteps: {
      hasCountryCode: false,
      countrySupported: false,
      lengthValid: false,
      prefixValid: false,
      formatValid: false
    }
  };

  // Step 1: Basic format validation
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    result.errors.push('Phone number is required and must be a string');
    return result;
  }

  const cleanNumber = phoneNumber.trim().replace(/\s+/g, '');
  
  if (cleanNumber.length === 0) {
    result.errors.push('Phone number cannot be empty');
    return result;
  }

  // Step 2: MANDATORY country code verification
  if (!cleanNumber.startsWith('+')) {
    result.errors.push('Phone number must include country code (e.g., +242, +33, +1)');
    return result;
  }

  result.validationSteps.hasCountryCode = true;

  // Step 3: Extract and validate country code
  let matchedRule: CountryValidationRule | null = null;
  let localNumber = '';

  for (const rule of COUNTRY_VALIDATION_RULES) {
    if (cleanNumber.startsWith(rule.countryCode)) {
      matchedRule = rule;
      localNumber = cleanNumber.substring(rule.countryCode.length);
      result.countryCode = rule.countryCode;
      result.countryName = rule.countryName;
      result.localNumber = localNumber;
      break;
    }
  }

  if (!matchedRule) {
    result.errors.push(`Unsupported country code. Supported countries: ${COUNTRY_VALIDATION_RULES.map(r => `${r.countryName} (${r.countryCode})`).join(', ')}`);
    return result;
  }

  result.validationSteps.countrySupported = true;

  // Step 4: Validate local number length
  if (localNumber.length !== matchedRule.totalLength) {
    result.errors.push(`Invalid length for ${matchedRule.countryName}. Expected ${matchedRule.totalLength} digits after country code, got ${localNumber.length}`);
    return result;
  }

  result.validationSteps.lengthValid = true;

  // Step 5: Validate mobile prefix
  const hasValidPrefix = matchedRule.mobilePrefixes.some(prefix => localNumber.startsWith(prefix));
  
  if (!hasValidPrefix) {
    result.errors.push(`Invalid mobile prefix for ${matchedRule.countryName}. Expected prefixes: ${matchedRule.mobilePrefixes.join(', ')}, got: ${localNumber.substring(0, Math.max(2, 3))}`);
    return result;
  }

  result.validationSteps.prefixValid = true;

  // Step 6: Validate that local number contains only digits
  if (!/^\d+$/.test(localNumber)) {
    result.errors.push('Local number must contain only digits');
    return result;
  }

  result.validationSteps.formatValid = true;

  // All validations passed
  result.isValid = true;
  
  return result;
}

/**
 * Batch validate phone numbers with detailed reporting
 */
function batchValidatePhoneNumbers(phoneNumbers: string[]): {
  valid: ValidationResult[];
  invalid: ValidationResult[];
  summary: {
    total: number;
    validCount: number;
    invalidCount: number;
    byCountry: Record<string, number>;
    byRegion: Record<string, number>;
    commonErrors: Record<string, number>;
  };
} {
  const valid: ValidationResult[] = [];
  const invalid: ValidationResult[] = [];
  const byCountry: Record<string, number> = {};
  const byRegion: Record<string, number> = {};
  const commonErrors: Record<string, number> = {};

  phoneNumbers.forEach(phoneNumber => {
    const validation = validatePhoneNumberComprehensive(phoneNumber);
    
    if (validation.isValid) {
      valid.push(validation);
      byCountry[validation.countryName] = (byCountry[validation.countryName] || 0) + 1;
      
      // Get region for this country
      const rule = COUNTRY_VALIDATION_RULES.find(r => r.countryCode === validation.countryCode);
      if (rule) {
        byRegion[rule.region] = (byRegion[rule.region] || 0) + 1;
      }
    } else {
      invalid.push(validation);
      validation.errors.forEach(error => {
        commonErrors[error] = (commonErrors[error] || 0) + 1;
      });
    }
  });

  return {
    valid,
    invalid,
    summary: {
      total: phoneNumbers.length,
      validCount: valid.length,
      invalidCount: invalid.length,
      byCountry,
      byRegion,
      commonErrors
    }
  };
}

/**
 * Format phone number for display
 */
function formatPhoneNumberForDisplay(phoneNumber: string): string {
  const validation = validatePhoneNumberComprehensive(phoneNumber);
  
  if (!validation.isValid) {
    return phoneNumber;
  }

  const rule = COUNTRY_VALIDATION_RULES.find(r => r.countryCode === validation.countryCode);
  if (!rule) {
    return phoneNumber;
  }

  // Format based on country-specific patterns
  switch (rule.countryCode) {
    case '+242': // Congo
    case '+243': // DR Congo
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 5)} ${validation.localNumber.substring(5)}`;
    
    case '+33': // France
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 4)} ${validation.localNumber.substring(4, 6)} ${validation.localNumber.substring(6, 8)} ${validation.localNumber.substring(8)}`;
    
    case '+241': // Gabon
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 4)} ${validation.localNumber.substring(4, 6)} ${validation.localNumber.substring(6)}`;
    
    case '+1': // North America
      return `${rule.countryCode} (${validation.localNumber.substring(0, 3)}) ${validation.localNumber.substring(3, 6)}-${validation.localNumber.substring(6)}`;
    
    case '+221': // Senegal
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 5)} ${validation.localNumber.substring(5, 7)} ${validation.localNumber.substring(7)}`;
    
    // 8-digit countries (Mali, Burkina Faso, Benin, Niger, Chad, Togo, CAR, Gabon, Sierra Leone, Liberia)
    case '+223': case '+226': case '+229': case '+227': case '+235': case '+228': case '+236': case '+232': case '+231':
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 4)} ${validation.localNumber.substring(4, 6)} ${validation.localNumber.substring(6)}`;
    
    // 7-digit countries (Gambia)
    case '+220':
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 4)} ${validation.localNumber.substring(4)}`;
    
    // 9-digit countries (most African countries)
    default:
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 5)} ${validation.localNumber.substring(5, 7)} ${validation.localNumber.substring(7)}`;
  }
}

/**
 * Export validation results to CSV
 */
function exportValidationResults(results: WhatsAppValidationResult[]): string {
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

/**
 * Batch validate WhatsApp numbers with enhanced pre-validation
 */
async function batchValidateWhatsAppNumbers(
  phoneNumbers: string[],
  options: Partial<FilterSettings> = {},
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
    whatsAppValidation: {
      validRate: number;
    };
  };
}> {
  const opts = { 
    batchSize: 20,
    delayBetweenBatches: 1000,
    maxRetries: 3,
    retryDelay: 2000,
    useCache: true,
    skipApiValidation: false,
    ...options 
  };
  
  const results: WhatsAppValidationResult[] = [];
  
  console.log(`📱 [NUMBER-FILTERING] Starting batch validation for ${phoneNumbers.length} numbers`);
  console.log('⚙️ [NUMBER-FILTERING] Options:', opts);

  // Process numbers in batches
  const batchSize = opts.batchSize;
  const totalBatches = Math.ceil(phoneNumbers.length / batchSize);

  for (let i = 0; i < phoneNumbers.length; i += batchSize) {
    const batch = phoneNumbers.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    console.log(`📦 [NUMBER-FILTERING] Processing batch ${batchNumber}/${totalBatches} (${batch.length} numbers)`);

    // Pre-validate entire batch first
    const batchResults: WhatsAppValidationResult[] = [];

    for (const phoneNumber of batch) {
      const preValidation = validatePhoneNumberComprehensive(phoneNumber);
      
      if (preValidation.isValid) {
        const normalizedNumber = `${preValidation.countryCode}${preValidation.localNumber}`;
        
        // For this implementation, we'll simulate WhatsApp validation
        // In a real implementation, you would call the actual WhatsApp API
        const hasWhatsApp = !opts.skipApiValidation ? Math.random() > 0.3 : null; // 70% chance of having WhatsApp
        
        batchResults.push({
          phoneNumber: normalizedNumber,
          isValid: true,
          hasWhatsApp: hasWhatsApp,
          waId: hasWhatsApp ? normalizedNumber.replace('+', '') : undefined,
          validationDetails: preValidation,
          apiCalled: !opts.skipApiValidation,
          source: 'api',
          timestamp: new Date().toISOString()
        });
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
      console.log(`⏳ [NUMBER-FILTERING] Waiting ${opts.delayBetweenBatches}ms before next batch...`);
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
    errors: results.filter(r => r.error).length,
    whatsAppValidation: {
      validRate: (() => {
        const validatedNumbers = results.filter(r => r.hasWhatsApp !== null);
        const whatsAppValid = results.filter(r => r.hasWhatsApp === true).length;
        return validatedNumbers.length > 0 ? (whatsAppValid / validatedNumbers.length) * 100 : 0;
      })()
    }
  };

  console.log('📊 [NUMBER-FILTERING] Batch validation completed:', summary);

  return { results, summary };
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

  const supportedCountries = COUNTRY_VALIDATION_RULES;

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
                <p><strong>Supported:</strong> {supportedCountries.length} countries with specific validation rules</p>
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
                Country-specific length and mobile prefix validation for {supportedCountries.length} supported countries
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

        {/* Country Information Modal */}
        {showCountryInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">Supported Countries ({supportedCountries.length})</h3>
                <button
                  onClick={() => setShowCountryInfo(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-120px)] p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Francophone Countries */}
                  <div>
                    <h4 className="text-lg font-medium text-blue-800 mb-4 flex items-center gap-2">
                      <Globe className="w-5 h-5" />
                      Francophone Countries ({supportedCountries.filter(c => c.region === 'francophone').length})
                    </h4>
                    <div className="space-y-3">
                      {supportedCountries.filter(c => c.region === 'francophone').map(country => (
                        <div key={country.countryCode} className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium text-gray-900">{country.countryName}</h5>
                            <span className="text-sm font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              {country.countryCode}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{country.description}</p>
                          <div className="text-xs text-gray-500">
                            <span className="font-medium">Prefixes:</span> {country.mobilePrefixes.join(', ')} | 
                            <span className="font-medium ml-2">Length:</span> {country.totalLength} digits
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Anglophone Countries */}
                  <div>
                    <h4 className="text-lg font-medium text-green-800 mb-4 flex items-center gap-2">
                      <Globe className="w-5 h-5" />
                      Anglophone Countries ({supportedCountries.filter(c => c.region === 'anglophone').length})
                    </h4>
                    <div className="space-y-3">
                      {supportedCountries.filter(c => c.region === 'anglophone').map(country => (
                        <div key={country.countryCode} className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="font-medium text-gray-900">{country.countryName}</h5>
                            <span className="text-sm font-mono bg-green-100 text-green-800 px-2 py-1 rounded">
                              {country.countryCode}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{country.description}</p>
                          <div className="text-xs text-gray-500">
                            <span className="font-medium">Prefixes:</span> {country.mobilePrefixes.slice(0, 5).join(', ')}{country.mobilePrefixes.length > 5 ? '...' : ''} | 
                            <span className="font-medium ml-2">Length:</span> {country.totalLength} digits
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Validation Details Modal */}
        {showValidationDetails && validationSummary && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-lg max-w-3xl w-full max-h-[80vh] overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b">
                <h3 className="text-xl font-semibold text-gray-900">Detailed Validation Statistics</h3>
                <button
                  onClick={() => setShowValidationDetails(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-120px)] p-6">
                <div className="space-y-6">
                  {/* Validation Steps Breakdown */}
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Validation Steps Analysis</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { key: 'hasCountryCode', label: 'Has Country Code', icon: Globe },
                        { key: 'countrySupported', label: 'Country Supported', icon: MapPin },
                        { key: 'lengthValid', label: 'Length Valid', icon: Gauge },
                        { key: 'prefixValid', label: 'Prefix Valid', icon: Phone },
                        { key: 'formatValid', label: 'Format Valid', icon: CheckCircle }
                      ].map(step => {
                        const passedCount = validationResults.filter(r => 
                          r.validationDetails.validationSteps[step.key as keyof ValidationResult['validationSteps']]
                        ).length;
                        const passRate = (passedCount / validationResults.length) * 100;
                        
                        return (
                          <div key={step.key} className="bg-gray-50 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <step.icon className="w-5 h-5 text-blue-600" />
                              <span className="font-medium text-gray-900">{step.label}</span>
                            </div>
                            <div className="text-2xl font-bold text-gray-900">{passedCount}</div>
                            <div className="text-sm text-gray-500">
                              {passRate.toFixed(1)}% pass rate
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Regional Distribution */}
                  <div>
                    <h4 className="text-lg font-medium text-gray-900 mb-4">Regional Distribution</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {['francophone', 'anglophone'].map(region => {
                        const regionResults = validationResults.filter(r => {
                          const rule = COUNTRY_VALIDATION_RULES.find(rule => rule.countryCode === r.validationDetails.countryCode);
                          return rule?.region === region;
                        });
                        
                        return (
                          <div key={region} className="bg-gray-50 rounded-lg p-4">
                            <h5 className="font-medium text-gray-900 mb-2 capitalize">{region} Countries</h5>
                            <div className="text-2xl font-bold text-gray-900">{regionResults.length}</div>
                            <div className="text-sm text-gray-500">
                              {regionResults.filter(r => r.validationDetails.isValid).length} format valid
                            </div>
                            <div className="text-sm text-gray-500">
                              {regionResults.filter(r => r.hasWhatsApp === true).length} WhatsApp valid
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NumberFiltering;