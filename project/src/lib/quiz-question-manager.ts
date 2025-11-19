import { supabase } from './supabase';

export interface QuizQuestionData {
  text: string;
  type: 'personal' | 'preference' | 'quiz' | 'product_test';
  options?: any;
  points?: any;
  required: boolean;
  order_index: number;
  correct_answer?: boolean;
  category?: string;
  conditional_logic?: any;
}

export interface QuizQuestionValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: QuizQuestionData;
}

/**
 * Comprehensive validation for quiz question data
 */
export function validateQuizQuestionData(data: Partial<QuizQuestionData>): QuizQuestionValidationResult {
  const errors: string[] = [];
  const sanitizedData: QuizQuestionData = {
    text: '',
    type: 'personal',
    required: true,
    order_index: 0
  };

  // Validate text
  if (!data.text || typeof data.text !== 'string' || data.text.trim().length === 0) {
    errors.push('Question text is required and cannot be empty');
  } else {
    const trimmedText = data.text.trim();
    if (trimmedText.length < 5) {
      errors.push('Question text must be at least 5 characters long');
    } else if (trimmedText.length > 1000) {
      errors.push('Question text cannot exceed 1000 characters');
    } else {
      sanitizedData.text = trimmedText;
    }
  }

  // Validate type
  const validTypes = ['personal', 'preference', 'quiz', 'product_test'];
  if (!data.type || !validTypes.includes(data.type)) {
    errors.push('Question type must be one of: personal, preference, quiz, product_test');
  } else {
    sanitizedData.type = data.type;
  }

  // Validate required field
  sanitizedData.required = Boolean(data.required);

  // Validate order_index
  if (typeof data.order_index !== 'number' || data.order_index < 0) {
    errors.push('Order index must be a non-negative number');
  } else {
    sanitizedData.order_index = Math.floor(data.order_index);
  }

  // Type-specific validations
  switch (data.type) {
    case 'quiz':
    case 'product_test':
      // These types require correct_answer
      if (data.correct_answer === undefined || data.correct_answer === null) {
        errors.push(`${data.type} questions require a correct_answer (true or false)`);
      } else {
        sanitizedData.correct_answer = Boolean(data.correct_answer);
      }

      // Validate points if provided
      if (data.points !== undefined && data.points !== null) {
        try {
          let pointsData;
          if (typeof data.points === 'string') {
            pointsData = JSON.parse(data.points);
          } else {
            pointsData = data.points;
          }

          if (typeof pointsData === 'object' && pointsData !== null) {
            // Validate points structure
            if (typeof pointsData.value === 'number' && pointsData.value >= 0) {
              sanitizedData.points = pointsData;
            } else {
              errors.push('Points must have a valid numeric value >= 0');
            }
          } else {
            errors.push('Points must be a valid object with a value property');
          }
        } catch (parseError) {
          errors.push('Points must be valid JSON or an object');
        }
      }
      break;

    case 'preference':
      // Validate options for preference questions
      if (data.options !== undefined && data.options !== null) {
        try {
          let optionsData;
          if (typeof data.options === 'string') {
            optionsData = JSON.parse(data.options);
          } else {
            optionsData = data.options;
          }

          if (Array.isArray(optionsData) && optionsData.length >= 2) {
            // Validate that all options are strings
            const validOptions = optionsData.every(option => 
              typeof option === 'string' && option.trim().length > 0
            );
            
            if (validOptions) {
              sanitizedData.options = optionsData.map(option => option.trim());
            } else {
              errors.push('All options must be non-empty strings');
            }
          } else {
            errors.push('Preference questions must have at least 2 options');
          }
        } catch (parseError) {
          errors.push('Options must be valid JSON array or an array');
        }
      }
      break;

    case 'personal':
      // Personal questions don't require correct_answer
      if (data.correct_answer !== undefined) {
        sanitizedData.correct_answer = null; // Explicitly set to null for personal questions
      }
      break;
  }

  // Validate category if provided
  if (data.category !== undefined && data.category !== null) {
    if (typeof data.category === 'string') {
      const trimmedCategory = data.category.trim();
      if (trimmedCategory.length > 0 && trimmedCategory.length <= 100) {
        sanitizedData.category = trimmedCategory;
      } else if (trimmedCategory.length > 100) {
        errors.push('Category cannot exceed 100 characters');
      }
    } else {
      errors.push('Category must be a string');
    }
  }

  // Validate conditional_logic if provided
  if (data.conditional_logic !== undefined && data.conditional_logic !== null) {
    try {
      let logicData;
      if (typeof data.conditional_logic === 'string') {
        logicData = JSON.parse(data.conditional_logic);
      } else {
        logicData = data.conditional_logic;
      }

      if (typeof logicData === 'object' && logicData !== null) {
        // Basic validation for conditional logic structure
        if (logicData.show_if && typeof logicData.show_if === 'object') {
          if (logicData.show_if.question_id && logicData.show_if.answer_value !== undefined) {
            sanitizedData.conditional_logic = logicData;
          } else {
            errors.push('Conditional logic must have question_id and answer_value');
          }
        } else {
          sanitizedData.conditional_logic = logicData; // Allow other logic structures
        }
      } else {
        errors.push('Conditional logic must be a valid object');
      }
    } catch (parseError) {
      errors.push('Conditional logic must be valid JSON or an object');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedData: errors.length === 0 ? sanitizedData : undefined
  };
}

/**
 * Create a new quiz question with comprehensive validation and error handling
 */
export async function createQuizQuestion(questionData: Partial<QuizQuestionData>): Promise<{
  success: boolean;
  questionId?: string;
  error?: string;
}> {
  try {
    console.log('🔧 [QUIZ-QUESTION-MANAGER] Creating question:', {
      type: questionData.type,
      hasText: !!questionData.text,
      textLength: questionData.text?.length || 0
    });

    // Validate the question data
    const validation = validateQuizQuestionData(questionData);
    
    if (!validation.isValid) {
      const errorMessage = `Validation failed: ${validation.errors.join(', ')}`;
      console.error('❌ [QUIZ-QUESTION-MANAGER] Validation failed:', validation.errors);
      return {
        success: false,
        error: errorMessage
      };
    }

    const sanitizedData = validation.sanitizedData!;

    // Prepare the data for database insertion
    const insertData: any = {
      text: sanitizedData.text,
      type: sanitizedData.type,
      required: sanitizedData.required,
      order_index: sanitizedData.order_index,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add type-specific fields
    if (sanitizedData.correct_answer !== undefined) {
      insertData.correct_answer = sanitizedData.correct_answer;
    }

    if (sanitizedData.options !== undefined) {
      insertData.options = sanitizedData.options;
    }

    if (sanitizedData.points !== undefined) {
      insertData.points = sanitizedData.points;
    }

    if (sanitizedData.category !== undefined) {
      insertData.category = sanitizedData.category;
    }

    if (sanitizedData.conditional_logic !== undefined) {
      insertData.conditional_logic = sanitizedData.conditional_logic;
    }

    console.log('💾 [QUIZ-QUESTION-MANAGER] Inserting question into database');

    // Insert the question into the database with retry logic
    let insertAttempts = 0;
    const maxAttempts = 3;
    let lastError: any = null;

    while (insertAttempts < maxAttempts) {
      try {
        const { data, error } = await supabase
          .from('quiz_questions')
          .insert([insertData])
          .select('id')
          .single();

        if (error) {
          throw error;
        }

        console.log('✅ [QUIZ-QUESTION-MANAGER] Question created successfully:', {
          questionId: data.id,
          type: sanitizedData.type,
          attempts: insertAttempts + 1
        });

        return {
          success: true,
          questionId: data.id
        };

      } catch (insertError) {
        insertAttempts++;
        lastError = insertError;
        
        console.warn(`⚠️ [QUIZ-QUESTION-MANAGER] Insert attempt ${insertAttempts} failed:`, {
          error: insertError.message,
          code: insertError.code,
          details: insertError.details
        });

        // If it's a constraint violation or unique constraint error, don't retry
        if (insertError.code === '23505' || insertError.code === '23514') {
          break;
        }

        // Wait before retrying (exponential backoff)
        if (insertAttempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, insertAttempts) * 1000));
        }
      }
    }

    // All attempts failed
    console.error('❌ [QUIZ-QUESTION-MANAGER] All insert attempts failed:', {
      attempts: insertAttempts,
      lastError: lastError?.message,
      code: lastError?.code
    });

    return {
      success: false,
      error: `Failed to create question after ${insertAttempts} attempts: ${lastError?.message || 'Unknown error'}`
    };

  } catch (error) {
    console.error('❌ [QUIZ-QUESTION-MANAGER] Critical error creating question:', error);
    return {
      success: false,
      error: `Critical error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Delete a quiz question with comprehensive error handling and cleanup
 */
export async function deleteQuizQuestion(questionId: string | number): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    console.log('🗑️ [QUIZ-QUESTION-MANAGER] Deleting question:', { questionId });

    // Validate questionId
    if (!questionId) {
      return {
        success: false,
        error: 'Question ID is required'
      };
    }

    // Convert to string for consistent handling
    const questionIdStr = String(questionId);

    // First, check if the question exists
    const { data: existingQuestion, error: checkError } = await supabase
      .from('quiz_questions')
      .select('id, text, type')
      .eq('id', questionIdStr)
      .maybeSingle();

    if (checkError) {
      console.error('❌ [QUIZ-QUESTION-MANAGER] Error checking question existence:', checkError);
      return {
        success: false,
        error: `Failed to verify question existence: ${checkError.message}`
      };
    }

    if (!existingQuestion) {
      console.warn('⚠️ [QUIZ-QUESTION-MANAGER] Question not found:', { questionId: questionIdStr });
      return {
        success: false,
        error: 'Question not found'
      };
    }

    console.log('✅ [QUIZ-QUESTION-MANAGER] Question found, proceeding with deletion:', {
      questionId: existingQuestion.id,
      type: existingQuestion.type,
      textPreview: existingQuestion.text.substring(0, 50) + '...'
    });

    // Delete related data first (cascade delete simulation)
    console.log('🧹 [QUIZ-QUESTION-MANAGER] Cleaning up related data');

    // Delete quiz answers related to this question
    const { error: answersDeleteError } = await supabase
      .from('quiz_answers')
      .delete()
      .eq('question_id', questionIdStr);

    if (answersDeleteError) {
      console.warn('⚠️ [QUIZ-QUESTION-MANAGER] Error deleting related answers:', answersDeleteError);
      // Continue with question deletion even if answer cleanup fails
    } else {
      console.log('✅ [QUIZ-QUESTION-MANAGER] Related answers cleaned up');
    }

    // Delete question engagement data
    const { error: engagementDeleteError } = await supabase
      .from('question_engagement')
      .delete()
      .eq('question_id', questionIdStr);

    if (engagementDeleteError) {
      console.warn('⚠️ [QUIZ-QUESTION-MANAGER] Error deleting engagement data:', engagementDeleteError);
      // Continue with question deletion even if engagement cleanup fails
    } else {
      console.log('✅ [QUIZ-QUESTION-MANAGER] Question engagement data cleaned up');
    }

    // Now delete the question itself with retry logic
    let deleteAttempts = 0;
    const maxAttempts = 3;
    let lastError: any = null;

    while (deleteAttempts < maxAttempts) {
      try {
        const { error: deleteError } = await supabase
          .from('quiz_questions')
          .delete()
          .eq('id', questionIdStr);

        if (deleteError) {
          throw deleteError;
        }

        console.log('✅ [QUIZ-QUESTION-MANAGER] Question deleted successfully:', {
          questionId: questionIdStr,
          attempts: deleteAttempts + 1
        });

        // Invalidate quiz cache after successful deletion
        try {
          const { invalidateQuizCache } = await import('./quiz-statistics-cache');
          await invalidateQuizCache();
          console.log('✅ [QUIZ-QUESTION-MANAGER] Quiz cache invalidated');
        } catch (cacheError) {
          console.warn('⚠️ [QUIZ-QUESTION-MANAGER] Failed to invalidate cache:', cacheError);
          // Don't fail the deletion if cache invalidation fails
        }

        return {
          success: true
        };

      } catch (deleteError) {
        deleteAttempts++;
        lastError = deleteError;
        
        console.warn(`⚠️ [QUIZ-QUESTION-MANAGER] Delete attempt ${deleteAttempts} failed:`, {
          error: deleteError.message,
          code: deleteError.code,
          questionId: questionIdStr
        });

        // If it's a foreign key constraint error, try to handle it
        if (deleteError.code === '23503') {
          console.log('🔗 [QUIZ-QUESTION-MANAGER] Foreign key constraint detected, attempting cleanup');
          
          // Try to delete related records more aggressively
          try {
            await supabase.rpc('delete_question_cascade', { question_id: questionIdStr });
            console.log('✅ [QUIZ-QUESTION-MANAGER] Cascade delete completed');
            
            // Try the delete again after cascade cleanup
            continue;
          } catch (cascadeError) {
            console.error('❌ [QUIZ-QUESTION-MANAGER] Cascade delete failed:', cascadeError);
          }
        }

        // Wait before retrying (exponential backoff)
        if (deleteAttempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, deleteAttempts) * 1000));
        }
      }
    }

    // All attempts failed
    console.error('❌ [QUIZ-QUESTION-MANAGER] All delete attempts failed:', {
      attempts: deleteAttempts,
      questionId: questionIdStr,
      lastError: lastError?.message,
      code: lastError?.code
    });

    return {
      success: false,
      error: `Failed to delete question after ${deleteAttempts} attempts: ${lastError?.message || 'Unknown error'}`
    };

  } catch (error) {
    console.error('❌ [QUIZ-QUESTION-MANAGER] Critical error deleting question:', error);
    return {
      success: false,
      error: `Critical error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Update question order indices after deletion to maintain consistency
 */
export async function reorderQuestionsAfterDeletion(deletedOrderIndex: number): Promise<void> {
  try {
    console.log('🔄 [QUIZ-QUESTION-MANAGER] Reordering questions after deletion:', { deletedOrderIndex });

    // Get all questions with order_index greater than the deleted question
    const { data: questionsToReorder, error: fetchError } = await supabase
      .from('quiz_questions')
      .select('id, order_index')
      .gt('order_index', deletedOrderIndex)
      .order('order_index', { ascending: true });

    if (fetchError) {
      console.error('❌ [QUIZ-QUESTION-MANAGER] Error fetching questions to reorder:', fetchError);
      return;
    }

    if (!questionsToReorder || questionsToReorder.length === 0) {
      console.log('✅ [QUIZ-QUESTION-MANAGER] No questions to reorder');
      return;
    }

    // Update order indices
    const updates = questionsToReorder.map((question, index) => ({
      id: question.id,
      order_index: deletedOrderIndex + index
    }));

    // Perform batch update
    for (const update of updates) {
      const { error: updateError } = await supabase
        .from('quiz_questions')
        .update({ order_index: update.order_index })
        .eq('id', update.id);

      if (updateError) {
        console.warn('⚠️ [QUIZ-QUESTION-MANAGER] Error updating question order:', {
          questionId: update.id,
          newOrderIndex: update.order_index,
          error: updateError.message
        });
      }
    }

    console.log('✅ [QUIZ-QUESTION-MANAGER] Questions reordered successfully:', {
      updatedCount: updates.length
    });

  } catch (error) {
    console.error('❌ [QUIZ-QUESTION-MANAGER] Error reordering questions:', error);
    // Don't throw - this is cleanup and shouldn't fail the main operation
  }
}

/**
 * Get the next available order index for new questions
 */
export async function getNextOrderIndex(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('quiz_questions')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('❌ [QUIZ-QUESTION-MANAGER] Error getting max order index:', error);
      return 0; // Default to 0 if we can't determine the max
    }

    const maxOrderIndex = data?.order_index ?? -1;
    return maxOrderIndex + 1;

  } catch (error) {
    console.error('❌ [QUIZ-QUESTION-MANAGER] Error in getNextOrderIndex:', error);
    return 0; // Default to 0 on error
  }
}