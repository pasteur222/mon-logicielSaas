import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: any;
}

export interface QuizUserInput {
  phone_number?: string;
  web_user_id?: string;
  name?: string;
  email?: string;
  address?: string;
  profession?: string;
  country?: string;
  preferences?: any;
}

export interface QuizQuestionInput {
  text: string;
  type: 'personal' | 'preference' | 'quiz' | 'product_test';
  options?: any;
  points?: any;
  required: boolean;
  order_index: number;
  correct_answer?: boolean;
  category?: string;
  conditional_logic?: {
    show_if: {
      question_id: string;
      answer_value: any;
    };
  };
}

/**
 * Validate and sanitize quiz user input
 */
export function validateQuizUser(input: QuizUserInput): ValidationResult {
  const errors: string[] = [];
  const sanitizedData: QuizUserInput = {};

  // Validate phone number if provided
  if (input.phone_number) {
    try {
      const phoneNumber = parsePhoneNumber(input.phone_number);
      if (!phoneNumber || !isValidPhoneNumber(input.phone_number)) {
        errors.push('Invalid phone number format');
      } else {
        sanitizedData.phone_number = phoneNumber.format('E.164');
      }
    } catch (error) {
      errors.push('Invalid phone number format');
    }
  }

  // Validate web user ID if provided
  if (input.web_user_id) {
    const webUserIdRegex = /^web_[a-zA-Z0-9\-_]{8,50}$/;
    if (!webUserIdRegex.test(input.web_user_id)) {
      errors.push('Invalid web user ID format');
    } else {
      sanitizedData.web_user_id = input.web_user_id;
    }
  }

  // At least one identifier is required
  if (!input.phone_number && !input.web_user_id) {
    errors.push('Either phone number or web user ID is required');
  }

  // Validate name
  if (input.name) {
    const sanitizedName = input.name.trim().substring(0, 100);
    if (sanitizedName.length < 1) {
      errors.push('Name cannot be empty');
    } else if (!/^[a-zA-ZÀ-ÿ\s\-'\.]+$/.test(sanitizedName)) {
      errors.push('Name contains invalid characters');
    } else {
      sanitizedData.name = sanitizedName;
    }
  }

  // Validate email
  if (input.email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const sanitizedEmail = input.email.trim().toLowerCase().substring(0, 255);
    if (!emailRegex.test(sanitizedEmail)) {
      errors.push('Invalid email format');
    } else {
      sanitizedData.email = sanitizedEmail;
    }
  }

  // Validate address
  if (input.address) {
    const sanitizedAddress = input.address.trim().substring(0, 500);
    if (sanitizedAddress.length > 0) {
      sanitizedData.address = sanitizedAddress;
    }
  }

  // Validate profession
  if (input.profession) {
    const sanitizedProfession = input.profession.trim().substring(0, 100);
    if (sanitizedProfession.length > 0) {
      sanitizedData.profession = sanitizedProfession;
    }
  }

  // Validate country
  if (input.country) {
    const countryRegex = /^[A-Z]{2}$/; // ISO 3166-1 alpha-2 country codes
    const sanitizedCountry = input.country.trim().toUpperCase();
    if (!countryRegex.test(sanitizedCountry)) {
      errors.push('Invalid country code (use ISO 3166-1 alpha-2 format)');
    } else {
      sanitizedData.country = sanitizedCountry;
    }
  }

  // Validate preferences
  if (input.preferences) {
    try {
      if (typeof input.preferences === 'string') {
        sanitizedData.preferences = JSON.parse(input.preferences);
      } else if (typeof input.preferences === 'object') {
        sanitizedData.preferences = input.preferences;
      } else {
        errors.push('Preferences must be a valid JSON object');
      }
    } catch (error) {
      errors.push('Invalid preferences JSON format');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: errors.length === 0 ? sanitizedData : undefined
  };
}

/**
 * Validate quiz question input
 */
export function validateQuizQuestion(input: QuizQuestionInput): ValidationResult {
  const errors: string[] = [];
  const sanitizedData: QuizQuestionInput = { ...input };

  // Validate text
  if (!input.text || input.text.trim().length === 0) {
    errors.push('Question text is required');
  } else {
    const sanitizedText = input.text.trim().substring(0, 1000);
    if (sanitizedText.length < 5) {
      errors.push('Question text must be at least 5 characters long');
    } else {
      sanitizedData.text = sanitizedText;
    }
  }

  // Validate type
  const validTypes = ['personal', 'preference', 'quiz', 'product_test'];
  if (!validTypes.includes(input.type)) {
    errors.push('Invalid question type');
  }

  // Validate order_index
  if (typeof input.order_index !== 'number' || input.order_index < 0) {
    errors.push('Order index must be a non-negative number');
  }

  // Type-specific validations
  switch (input.type) {
    case 'quiz':
    case 'product_test':
      // Validate correct_answer for quiz/product test questions
      if (input.correct_answer === undefined || input.correct_answer === null) {
        errors.push('Correct answer is required for quiz and product test questions');
      }

      // Validate points configuration
      if (input.points) {
        try {
          if (typeof input.points === 'string') {
            sanitizedData.points = JSON.parse(input.points);
          } else {
            sanitizedData.points = input.points;
          }

          if (typeof sanitizedData.points.value !== 'number' || sanitizedData.points.value < 0) {
            errors.push('Points value must be a non-negative number');
          }
        } catch (error) {
          errors.push('Invalid points configuration JSON');
        }
      }
      break;

    case 'preference':
      // Validate options for preference questions
      if (input.options) {
        try {
          if (typeof input.options === 'string') {
            sanitizedData.options = JSON.parse(input.options);
          } else {
            sanitizedData.options = input.options;
          }

          if (!Array.isArray(sanitizedData.options) || sanitizedData.options.length < 2) {
            errors.push('Preference questions must have at least 2 options');
          }
        } catch (error) {
          errors.push('Invalid options JSON format');
        }
      }
      break;
  }

  // Validate conditional logic
  if (input.conditional_logic) {
    try {
      if (typeof input.conditional_logic === 'string') {
        sanitizedData.conditional_logic = JSON.parse(input.conditional_logic);
      } else {
        sanitizedData.conditional_logic = input.conditional_logic;
      }

      if (!sanitizedData.conditional_logic.show_if?.question_id) {
        errors.push('Conditional logic must specify a question_id');
      }
    } catch (error) {
      errors.push('Invalid conditional logic JSON format');
    }
  }

  // Validate category
  if (input.category) {
    const sanitizedCategory = input.category.trim().substring(0, 50);
    if (sanitizedCategory.length > 0) {
      sanitizedData.category = sanitizedCategory;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: errors.length === 0 ? sanitizedData : undefined
  };
}

/**
 * Validate quiz answer input
 */
export function validateQuizAnswer(
  answer: string,
  questionType: string,
  options?: any
): ValidationResult {
  const errors: string[] = [];
  let sanitizedAnswer = answer.trim();

  if (!sanitizedAnswer) {
    errors.push('Answer cannot be empty');
    return { isValid: false, errors };
  }

  switch (questionType) {
    case 'quiz':
    case 'product_test':
      // Validate true/false answers
      const normalizedAnswer = sanitizedAnswer.toLowerCase();
      const validAnswers = ['true', 'false', 'vrai', 'faux', 'yes', 'no', 'oui', 'non'];
      
      if (!validAnswers.includes(normalizedAnswer)) {
        errors.push('Answer must be true/false, vrai/faux, yes/no, or oui/non');
      } else {
        // Normalize to boolean
        const isTrueAnswer = ['true', 'vrai', 'yes', 'oui'].includes(normalizedAnswer);
        sanitizedAnswer = isTrueAnswer.toString();
      }
      break;

    case 'preference':
      // Validate against available options
      if (options && Array.isArray(options)) {
        const validOption = options.find(option => 
          option.toLowerCase() === sanitizedAnswer.toLowerCase()
        );
        if (!validOption) {
          errors.push(`Answer must be one of: ${options.join(', ')}`);
        } else {
          sanitizedAnswer = validOption;
        }
      }
      break;

    case 'personal':
      // Basic validation for personal information
      if (sanitizedAnswer.length > 500) {
        errors.push('Answer is too long (maximum 500 characters)');
      }
      
      // Remove potentially harmful content
      sanitizedAnswer = sanitizedAnswer.replace(/<[^>]*>/g, '').trim();
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: sanitizedAnswer
  };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(page?: number, limit?: number): {
  page: number;
  limit: number;
  offset: number;
} {
  const validatedPage = Math.max(1, Math.floor(page || 1));
  const validatedLimit = Math.min(100, Math.max(1, Math.floor(limit || 20))); // Max 100 items per page
  const offset = (validatedPage - 1) * validatedLimit;

  return {
    page: validatedPage,
    limit: validatedLimit,
    offset
  };
}

/**
 * Sanitize user input to prevent XSS and injection attacks
 */
export function sanitizeUserInput(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  return input
    .trim()
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '') // Remove event handlers
    .substring(0, 1000); // Limit length
}

/**
 * Validate country code and get country name
 */
export function validateAndGetCountry(countryCode?: string): {
  isValid: boolean;
  code?: string;
  name?: string;
} {
  if (!countryCode) {
    return { isValid: false };
  }

  const code = countryCode.trim().toUpperCase();
  
  // Basic validation for ISO 3166-1 alpha-2 codes
  if (!/^[A-Z]{2}$/.test(code)) {
    return { isValid: false };
  }

  // Common African country codes and names
  const countries: Record<string, string> = {
    'DZ': 'Algeria',
    'AO': 'Angola',
    'BJ': 'Benin',
    'BW': 'Botswana',
    'BF': 'Burkina Faso',
    'BI': 'Burundi',
    'CM': 'Cameroon',
    'CV': 'Cape Verde',
    'CF': 'Central African Republic',
    'TD': 'Chad',
    'KM': 'Comoros',
    'CG': 'Congo',
    'CD': 'Democratic Republic of Congo',
    'DJ': 'Djibouti',
    'EG': 'Egypt',
    'GQ': 'Equatorial Guinea',
    'ER': 'Eritrea',
    'ET': 'Ethiopia',
    'GA': 'Gabon',
    'GM': 'Gambia',
    'GH': 'Ghana',
    'GN': 'Guinea',
    'GW': 'Guinea-Bissau',
    'CI': 'Ivory Coast',
    'KE': 'Kenya',
    'LS': 'Lesotho',
    'LR': 'Liberia',
    'LY': 'Libya',
    'MG': 'Madagascar',
    'MW': 'Malawi',
    'ML': 'Mali',
    'MR': 'Mauritania',
    'MU': 'Mauritius',
    'MA': 'Morocco',
    'MZ': 'Mozambique',
    'NA': 'Namibia',
    'NE': 'Niger',
    'NG': 'Nigeria',
    'RW': 'Rwanda',
    'ST': 'Sao Tome and Principe',
    'SN': 'Senegal',
    'SC': 'Seychelles',
    'SL': 'Sierra Leone',
    'SO': 'Somalia',
    'ZA': 'South Africa',
    'SS': 'South Sudan',
    'SD': 'Sudan',
    'SZ': 'Swaziland',
    'TZ': 'Tanzania',
    'TG': 'Togo',
    'TN': 'Tunisia',
    'UG': 'Uganda',
    'ZM': 'Zambia',
    'ZW': 'Zimbabwe'
  };

  const name = countries[code];
  
  return {
    isValid: !!name,
    code: name ? code : undefined,
    name
  };
}

/**
 * Validate quiz answer based on question type and constraints
 */
export function validateQuizAnswerAdvanced(
  answer: string,
  questionType: string,
  questionData: any
): ValidationResult {
  const errors: string[] = [];
  let sanitizedAnswer = sanitizeUserInput(answer);

  if (!sanitizedAnswer) {
    errors.push('Answer cannot be empty');
    return { isValid: false, errors };
  }

  switch (questionType) {
    case 'quiz':
    case 'product_test':
      // Enhanced validation for quiz/product test questions
      const normalizedAnswer = sanitizedAnswer.toLowerCase();
      const validAnswers = ['true', 'false', 'vrai', 'faux', 'yes', 'no', 'oui', 'non'];
      
      if (!validAnswers.includes(normalizedAnswer)) {
        errors.push('Answer must be true/false, vrai/faux, yes/no, or oui/non');
      } else {
        // Convert to boolean for consistency
        const isTrueAnswer = ['true', 'vrai', 'yes', 'oui'].includes(normalizedAnswer);
        sanitizedAnswer = isTrueAnswer ? 'true' : 'false';
      }
      break;

    case 'preference':
      // Validate against available options
      if (questionData.options && Array.isArray(questionData.options)) {
        const matchingOption = questionData.options.find((option: string) => 
          option.toLowerCase().trim() === sanitizedAnswer.toLowerCase()
        );
        
        if (!matchingOption) {
          errors.push(`Answer must be one of: ${questionData.options.join(', ')}`);
        } else {
          sanitizedAnswer = matchingOption;
        }
      }
      break;

    case 'personal':
      // Enhanced validation for personal information
      if (sanitizedAnswer.length > 500) {
        errors.push('Answer is too long (maximum 500 characters)');
      }
      
      // Check for common personal info patterns
      const questionText = questionData.text?.toLowerCase() || '';
      
      if (questionText.includes('email')) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(sanitizedAnswer)) {
          errors.push('Please provide a valid email address');
        }
      } else if (questionText.includes('phone') || questionText.includes('téléphone')) {
        try {
          const phoneNumber = parsePhoneNumber(sanitizedAnswer);
          if (!phoneNumber || !isValidPhoneNumber(sanitizedAnswer)) {
            errors.push('Please provide a valid phone number');
          } else {
            sanitizedAnswer = phoneNumber.format('E.164');
          }
        } catch (error) {
          errors.push('Please provide a valid phone number');
        }
      }
      break;
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: sanitizedAnswer
  };
}

/**
 * Validate conditional logic for questions
 */
export function validateConditionalLogic(
  conditionalLogic: any,
  availableQuestions: Array<{ id: string; type: string }>
): ValidationResult {
  const errors: string[] = [];

  if (!conditionalLogic || typeof conditionalLogic !== 'object') {
    return { isValid: true, errors: [] }; // Conditional logic is optional
  }

  if (conditionalLogic.show_if) {
    const { question_id, answer_value } = conditionalLogic.show_if;
    
    if (!question_id) {
      errors.push('Conditional logic must specify a question_id');
    } else {
      const referencedQuestion = availableQuestions.find(q => q.id === question_id);
      if (!referencedQuestion) {
        errors.push('Referenced question not found');
      }
    }
    
    if (answer_value === undefined || answer_value === null) {
      errors.push('Conditional logic must specify an answer_value');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: conditionalLogic
  };
}