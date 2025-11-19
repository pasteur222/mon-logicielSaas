/**
 * Enhanced Phone Number Validation System
 * Implements mandatory country code verification and country-specific validation rules
 */

export interface CountryValidationRule {
  countryCode: string;
  countryName: string;
  totalLength: number; // excluding country code
  mobilePrefixes: string[];
  description: string;
}

export interface ValidationResult {
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

// Comprehensive country validation rules
export const COUNTRY_VALIDATION_RULES: CountryValidationRule[] = [
  {
    countryCode: '+242',
    countryName: 'Republic of Congo',
    totalLength: 9,
    mobilePrefixes: ['05', '06'],
    description: 'Congo mobile numbers: +242 05/06 XXX XXXX'
  },
  {
    countryCode: '+243',
    countryName: 'DR Congo',
    totalLength: 9,
    mobilePrefixes: ['81', '82', '99'],
    description: 'DR Congo mobile numbers: +243 81/82/99 XXX XXXX'
  },
  {
    countryCode: '+33',
    countryName: 'France',
    totalLength: 9,
    mobilePrefixes: ['6', '7'],
    description: 'France mobile numbers: +33 6/7 XX XX XX XX'
  },
  {
    countryCode: '+241',
    countryName: 'Gabon',
    totalLength: 8,
    mobilePrefixes: ['06', '07'],
    description: 'Gabon mobile numbers: +241 06/07 XX XX XX'
  },
  {
    countryCode: '+1',
    countryName: 'Canada/USA',
    totalLength: 10,
    mobilePrefixes: [
      // Major Canadian area codes
      '204', '226', '236', '249', '250', '289', '306', '343', '365', '403', '416', '418', '431', '437', '438', '450', '506', '514', '519', '548', '579', '581', '587', '604', '613', '639', '647', '672', '705', '709', '778', '780', '782', '807', '819', '825', '867', '873', '902', '905',
      // Major US area codes (mobile-heavy areas)
      '201', '202', '203', '205', '206', '207', '208', '209', '210', '212', '213', '214', '215', '216', '217', '218', '219', '224', '225', '228', '229', '231', '234', '239', '240', '248', '251', '252', '253', '254', '256', '260', '262', '267', '269', '270', '272', '274', '276', '281', '283', '301', '302', '303', '304', '305', '307', '308', '309', '310', '312', '313', '314', '315', '316', '317', '318', '319', '320', '321', '323', '325', '330', '331', '334', '336', '337', '339', '346', '347', '351', '352', '360', '361', '364', '380', '385', '386', '401', '402', '404', '405', '406', '407', '408', '409', '410', '412', '413', '414', '415', '417', '419', '423', '424', '425', '430', '432', '434', '435', '440', '442', '443', '445', '447', '458', '463', '464', '469', '470', '475', '478', '479', '480', '484', '501', '502', '503', '504', '505', '507', '508', '509', '510', '512', '513', '515', '516', '517', '518', '520', '530', '531', '534', '539', '540', '541', '551', '559', '561', '562', '563', '564', '567', '570', '571', '573', '574', '575', '580', '585', '586', '601', '602', '603', '605', '606', '607', '608', '609', '610', '612', '614', '615', '616', '617', '618', '619', '620', '623', '626', '628', '629', '630', '631', '636', '641', '646', '650', '651', '657', '660', '661', '662', '667', '669', '678', '681', '682', '689', '701', '702', '703', '704', '706', '707', '708', '712', '713', '714', '715', '716', '717', '718', '719', '720', '724', '725', '727', '731', '732', '734', '737', '740', '743', '747', '754', '757', '760', '762', '763', '765', '769', '770', '772', '773', '774', '775', '779', '781', '785', '786', '787', '801', '802', '803', '804', '805', '806', '808', '810', '812', '813', '814', '815', '816', '817', '818', '828', '830', '831', '832', '843', '845', '847', '848', '850', '856', '857', '858', '859', '860', '862', '863', '864', '865', '870', '872', '878', '901', '903', '904', '906', '907', '908', '909', '910', '912', '913', '914', '915', '916', '917', '918', '919', '920', '925', '928', '929', '930', '931', '934', '936', '937', '938', '940', '941', '947', '949', '951', '952', '954', '956', '959', '970', '971', '972', '973', '975', '978', '979', '980', '984', '985', '989'
    ],
    description: 'North America mobile numbers: +1 XXX XXX XXXX'
  },
  {
    countryCode: '+32',
    countryName: 'Belgium',
    totalLength: 9,
    mobilePrefixes: ['4'],
    description: 'Belgium mobile numbers: +32 4XX XX XX XX'
  },
  {
    countryCode: '+221',
    countryName: 'Senegal',
    totalLength: 9,
    mobilePrefixes: ['70', '76', '77', '78'],
    description: 'Senegal mobile numbers: +221 7X XXX XXXX'
  }
];

/**
 * Comprehensive phone number validation with mandatory country code verification
 */
export function validatePhoneNumberComprehensive(phoneNumber: string): ValidationResult {
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
    result.errors.push(`Invalid mobile prefix for ${matchedRule.countryName}. Expected prefixes: ${matchedRule.mobilePrefixes.join(', ')}, got: ${localNumber.substring(0, 2)}`);
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
export function batchValidatePhoneNumbers(phoneNumbers: string[]): {
  valid: ValidationResult[];
  invalid: ValidationResult[];
  summary: {
    total: number;
    validCount: number;
    invalidCount: number;
    byCountry: Record<string, number>;
    commonErrors: Record<string, number>;
  };
} {
  const valid: ValidationResult[] = [];
  const invalid: ValidationResult[] = [];
  const byCountry: Record<string, number> = {};
  const commonErrors: Record<string, number> = {};

  phoneNumbers.forEach(phoneNumber => {
    const validation = validatePhoneNumberComprehensive(phoneNumber);
    
    if (validation.isValid) {
      valid.push(validation);
      byCountry[validation.countryName] = (byCountry[validation.countryName] || 0) + 1;
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
      commonErrors
    }
  };
}

/**
 * Get validation statistics for a country
 */
export function getCountryValidationStats(countryCode: string): CountryValidationRule | null {
  return COUNTRY_VALIDATION_RULES.find(rule => rule.countryCode === countryCode) || null;
}

/**
 * Get all supported countries
 */
export function getSupportedCountries(): CountryValidationRule[] {
  return [...COUNTRY_VALIDATION_RULES];
}

/**
 * Format phone number for display
 */
export function formatPhoneNumberForDisplay(phoneNumber: string): string {
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
      return `${rule.countryCode} ${validation.localNumber.substring(0, 1)} ${validation.localNumber.substring(1, 3)} ${validation.localNumber.substring(3, 5)} ${validation.localNumber.substring(5, 7)} ${validation.localNumber.substring(7)}`;
    
    case '+241': // Gabon
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 4)} ${validation.localNumber.substring(4, 6)} ${validation.localNumber.substring(6)}`;
    
    case '+1': // North America
      return `${rule.countryCode} (${validation.localNumber.substring(0, 3)}) ${validation.localNumber.substring(3, 6)}-${validation.localNumber.substring(6)}`;
    
    case '+32': // Belgium
      return `${rule.countryCode} ${validation.localNumber.substring(0, 3)} ${validation.localNumber.substring(3, 5)} ${validation.localNumber.substring(5, 7)} ${validation.localNumber.substring(7)}`;
    
    case '+221': // Senegal
      return `${rule.countryCode} ${validation.localNumber.substring(0, 2)} ${validation.localNumber.substring(2, 5)} ${validation.localNumber.substring(5, 7)} ${validation.localNumber.substring(7)}`;
    
    default:
      return phoneNumber;
  }
}

/**
 * Normalize phone number to E.164 format after validation
 */
export function normalizeValidatedPhoneNumber(phoneNumber: string): string {
  const validation = validatePhoneNumberComprehensive(phoneNumber);
  
  if (!validation.isValid) {
    throw new Error(`Cannot normalize invalid phone number: ${validation.errors.join(', ')}`);
  }

  return `${validation.countryCode}${validation.localNumber}`;
}

/**
 * Get validation error summary for UI display
 */
export function getValidationErrorSummary(validationResults: ValidationResult[]): {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByCountry: Record<string, number>;
  suggestions: string[];
} {
  const errorsByType: Record<string, number> = {};
  const errorsByCountry: Record<string, number> = {};
  const suggestions: string[] = [];
  let totalErrors = 0;

  validationResults.forEach(result => {
    if (!result.isValid) {
      totalErrors++;
      
      result.errors.forEach(error => {
        errorsByType[error] = (errorsByType[error] || 0) + 1;
      });

      if (result.countryName) {
        errorsByCountry[result.countryName] = (errorsByCountry[result.countryName] || 0) + 1;
      }
    }
  });

  // Generate suggestions based on common errors
  if (errorsByType['Phone number must include country code (e.g., +242, +33, +1)']) {
    suggestions.push('Add country codes to numbers without them (e.g., +242 for Congo, +33 for France)');
  }

  if (Object.keys(errorsByType).some(error => error.includes('Invalid length'))) {
    suggestions.push('Check number lengths - each country has specific digit requirements');
  }

  if (Object.keys(errorsByType).some(error => error.includes('Invalid mobile prefix'))) {
    suggestions.push('Verify mobile prefixes - only mobile numbers are supported for WhatsApp');
  }

  return {
    totalErrors,
    errorsByType,
    errorsByCountry,
    suggestions
  };
}