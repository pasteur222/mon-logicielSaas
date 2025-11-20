import { supabase } from './supabase';

export interface BusinessPlan {
  id: string;
  name: string;
  price: number;
  features: string[];
  messageLimit: number | null;
  shortFeatures?: string[]; // Short list for initial display
  detailedDescription?: string; // Additional description for "See more" view
}

export const BUSINESS_PLANS: BusinessPlan[] = [
  {
    id: 'basic',
    name: 'Basique',
    price: 70000,
    shortFeatures: [
      'Messages illimités par mois',
      'Module WhatsApp: Envoi en masse de messages marketing',
      'Filtrage de numéros WhatsApp',
      'Module Business: Automatisation des réponses',
      'Importation de contacts depuis fichiers'
    ],
    features: [
      'Messages illimités par mois',
      'Module WhatsApp: Envoi en masse de messages marketing et promotionnels à vos clients sur WhatsApp de manière légale.',
      'Personnalisation des messages avec les prénoms, noms et autres variables de vos clients.',
      'Filtrage de numéros: Identifiez et sélectionnez uniquement les numéros actifs sur WhatsApp à partir de vos fichiers de contacts.',
      'Module Business: Automatisation des réponses sans nécessiter d\'API externe.',
      'Importation de contacts depuis des fichiers TXT ou CSV.',
      'Programmation d\'envois de messages pour plus tard.',
      'Création et réutilisation de modèles de messages.',
      'Envoi de médias enrichis: vidéos, PDF, images et fichiers audio.',
      'Statistiques de base sur les envois et les taux de livraison.'
    ],
    detailedDescription: 'Le plan Basique est idéal pour les petites entreprises qui débutent avec le marketing WhatsApp. Il offre toutes les fonctionnalités essentielles pour gérer vos communications avec vos clients, filtrer vos listes de contacts et automatiser vos réponses.',
    messageLimit: null
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 200000,
    shortFeatures: [
      'Messages illimités par mois',
      'Toutes les fonctionnalités du plan Basique',
      'Chatbot Service Client avec IA pour WhatsApp et web',
      'Base de connaissances personnalisable pour le chatbot',
      
    ],
    features: [
      'Messages illimités par mois',
      'Module WhatsApp: Envoi en masse de messages marketing et promotionnels à vos clients sur WhatsApp de manière légale.',
      'Personnalisation des messages avec les prénoms, noms et autres variables de vos clients.',
      'Filtrage de numéros: Identifiez et sélectionnez uniquement les numéros actifs sur WhatsApp à partir de vos fichiers de contacts.',
      'Module Business: Automatisation des réponses sans nécessiter d\'API externe.',
      'Importation de contacts depuis des fichiers TXT ou CSV.',
      'Programmation d\'envois de messages pour plus tard.',
      'Création et réutilisation de modèles de messages.',
      'Envoi de médias enrichis: vidéos, PDF, images et fichiers audio.',
      'Chatbot Service Client: Assistant virtuel IA pour répondre automatiquement aux questions fréquentes de vos clients.',
      'Base de connaissances personnalisable pour votre entreprise.',
      'Analyse des intentions des clients et réponses contextuelles.',
      'Détection automatique des problèmes et escalade vers un agent humain si nécessaire.',
      'Rapports détaillés sur les interactions clients et les taux de satisfaction.',
      'Automatisation avancée avec variables de personnalisation multiples.',
      'Analyses détaillées des performances de vos campagnes.',
      'Segmentation avancée de votre audience.',
      'Support prioritaire par email et téléphone.',
      'Formation personnalisée à l\'utilisation de la plateforme.'
    ],
    detailedDescription: 'Le plan Pro est conçu pour les entreprises qui souhaitent optimiser leur service client et leur marketing. En plus de toutes les fonctionnalités du plan Basique, vous bénéficiez d\'un assistant virtuel IA pour automatiser vos réponses aux questions fréquentes, d\'analyses avancées et d\'un support prioritaire.',
    messageLimit: null
  },
  {
    id: 'enterprise',
    name: 'Entreprise',
    price: 300000,
    shortFeatures: [
      'Messages illimités par mois',
      'Toutes les fonctionnalités du plan Pro',
      'Chatbot Quiz interactif',
      'API dédiée et intégrations',
      'Assistance technique 24/7'
    ],
    features: [
      'Messages illimités par mois',
      'Module WhatsApp: Envoi en masse de messages marketing et promotionnels à vos clients sur WhatsApp de manière légale.',
      'Personnalisation des messages avec les prénoms, noms et autres variables de vos clients.',
      'Filtrage de numéros: Identifiez et sélectionnez uniquement les numéros actifs sur WhatsApp à partir de vos fichiers de contacts.',
      'Module Business: Automatisation des réponses sans nécessiter d\'API externe.',
      'Importation de contacts depuis des fichiers TXT ou CSV.',
      'Programmation d\'envois de messages pour plus tard.',
      'Création et réutilisation de modèles de messages.',
      'Envoi de médias enrichis: vidéos, PDF, images et fichiers audio.',
      'Chatbot Service Client: Assistant virtuel IA pour répondre automatiquement aux questions fréquentes de vos clients.',
      'Base de connaissances personnalisable pour votre entreprise.',
      'Analyse des intentions des clients et réponses contextuelles.',
      'Détection automatique des problèmes et escalade vers un agent humain si nécessaire.',
      'Rapports détaillés sur les interactions clients et les taux de satisfaction.',
      'Chatbot Quiz: Création de quiz interactifs pour engager votre audience.',
      'Jeux-concours et sondages personnalisables avec classements automatiques.',
      'Collecte de données clients via des quiz ludiques et éducatifs.',
      'Analyse des résultats et segmentation basée sur les réponses.',
      'Programmation de quiz récurrents et campagnes de fidélisation.',
      'API dédiée pour intégration avec vos systèmes existants.',
      'Personnalisation complète de la plateforme selon vos besoins.',
      'Assistance technique dédiée 24/7.',
      'Tableau de bord analytique avancé avec rapports personnalisés.',
      'Gestion multi-utilisateurs avec différents niveaux d\'accès.',
      'Hébergement sur serveurs dédiés pour une performance optimale.',
      'Contrat de niveau de service (SLA) garantissant une disponibilité de 99,9%.'
    ],
    detailedDescription: 'Le plan Entreprise est notre offre la plus complète, idéale pour les grandes entreprises et organisations. En plus de toutes les fonctionnalités du plan Pro, vous bénéficiez de messages illimités, du module Quiz interactif pour engager votre audience, d\'une API dédiée pour des intégrations personnalisées, et d\'une assistance technique disponible 24/7.',
    messageLimit: null
  }
];

export async function checkBusinessSubscriptionStatus(userId: string): Promise<{
  active: boolean;
  plan?: string;
  messagesRemaining?: number | null;
  endDate?: string;
}> {
  // Always return active enterprise subscription with unlimited messages
  return {
    active: true,
    plan: 'enterprise',
    messagesRemaining: null,
    endDate: new Date(2099, 11, 31).toISOString()
  };
}

export async function decrementBusinessMessageCount(userId: string): Promise<boolean> {
  // Always return true to indicate successful message sending without decrementing
  return true;
}

export async function getBusinessTransactions(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('business_transactions')
      .select(`
        *,
        business_subscriptions(user_id, plan)
      `)
      .eq('business_subscriptions.user_id', userId);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting business transactions:', error);
    return [];
  }
}

export type PaymentMethod = 'paypal' | 'stripe' | 'airtel_money';

export interface PaymentRequest {
  email: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
  paymentMethod: PaymentMethod;
  planId: string;
  phoneNumber?: string;
  paypalEmail?: string;
  cardNumber?: string;
  expirationDate?: string;
  cvv?: string;
  cardholderName?: string;
}

export interface PaymentResult {
  success: boolean;
  userId?: string;
  subscriptionId?: string;
  transactionId?: string;
  message?: string;
  error?: string;
}

export async function processBusinessSubscriptionPayment(
  paymentRequest: PaymentRequest
): Promise<PaymentResult> {
  try {
    if (paymentRequest.password !== paymentRequest.confirmPassword) {
      return {
        success: false,
        error: 'Les mots de passe ne correspondent pas'
      };
    }

    if (paymentRequest.password.length < 6) {
      return {
        success: false,
        error: 'Le mot de passe doit contenir au moins 6 caractères'
      };
    }

    if (!paymentRequest.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return {
        success: false,
        error: 'Adresse email invalide'
      };
    }

    const plan = BUSINESS_PLANS.find(p => p.id === paymentRequest.planId);
    if (!plan) {
      return {
        success: false,
        error: 'Plan invalide'
      };
    }

    let userId: string;
    let isNewUser = false;

    const { data: existingUser } = await supabase.auth.getUser();

    if (existingUser?.user) {
      userId = existingUser.user.id;
    } else {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: paymentRequest.email,
        password: paymentRequest.password,
        options: {
          data: {
            first_name: paymentRequest.firstName,
            last_name: paymentRequest.lastName,
            phone_number: paymentRequest.phoneNumber
          }
        }
      });

      if (signUpError || !authData.user) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: paymentRequest.email,
          password: paymentRequest.password
        });

        if (signInError || !signInData.user) {
          return {
            success: false,
            error: 'Erreur lors de la création du compte: ' + (signUpError?.message || signInError?.message)
          };
        }

        userId = signInData.user.id;
      } else {
        userId = authData.user.id;
        isNewUser = true;

        // Wait briefly for the database trigger to create the profile
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    // Only update profile if additional info is provided (trigger already created it)
    if (paymentRequest.firstName || paymentRequest.lastName || paymentRequest.phoneNumber) {
      try {
        const { error: updateError } = await supabase
          .from('profils_utilisateurs')
          .update({
            first_name: paymentRequest.firstName,
            last_name: paymentRequest.lastName,
            phone_number: paymentRequest.phoneNumber
          })
          .eq('id', userId);

        if (updateError) {
          console.warn('Profile update warning:', updateError);
          // Continue even if profile update fails - trigger handles creation
        }
      } catch (profileError) {
        console.error('Error updating profile:', profileError);
        // Continue processing - profile was created by trigger
      }
    }

    const { data: pricingData } = await supabase
      .from('pricing')
      .select('price')
      .eq('plan tarifaire', paymentRequest.planId)
      .maybeSingle();

    const amount = pricingData?.price || plan.price;

    let paymentResult: PaymentResult;

    if (paymentRequest.paymentMethod === 'paypal') {
      if (!paymentRequest.paypalEmail) {
        return {
          success: false,
          error: 'Email PayPal requis'
        };
      }
      paymentResult = await processPayPalPayment(amount, userId, paymentRequest.paypalEmail);
    } else if (paymentRequest.paymentMethod === 'stripe') {
      if (!paymentRequest.cardNumber || !paymentRequest.expirationDate || !paymentRequest.cvv || !paymentRequest.cardholderName) {
        return {
          success: false,
          error: 'Informations de carte bancaire incomplètes'
        };
      }
      paymentResult = await processStripePayment(amount, userId, {
        cardNumber: paymentRequest.cardNumber,
        expirationDate: paymentRequest.expirationDate,
        cvv: paymentRequest.cvv,
        cardholderName: paymentRequest.cardholderName
      });
    } else if (paymentRequest.paymentMethod === 'airtel_money') {
      paymentResult = await processAirtelMoneyPayment(amount, paymentRequest.phoneNumber || '', userId);
    } else {
      return {
        success: false,
        error: 'Méthode de paiement non supportée'
      };
    }

    if (!paymentResult.success) {
      return paymentResult;
    }

    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 31);

    const { data: subscription, error: subscriptionError } = await supabase
      .from('business_subscriptions')
      .insert({
        user_id: userId,
        plan: paymentRequest.planId,
        status: 'active',
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        phone_number: paymentRequest.phoneNumber,
        messages_remaining: null
      })
      .select()
      .single();

    if (subscriptionError) {
      console.error('Error creating subscription:', subscriptionError);
      return {
        success: false,
        error: 'Erreur lors de la création de l\'abonnement'
      };
    }

    const { error: transactionError } = await supabase
      .from('business_transactions')
      .insert({
        subscription_id: subscription.id,
        amount: amount,
        status: 'completed',
        provider: paymentRequest.paymentMethod,
        provider_transaction_id: paymentResult.transactionId
      });

    if (transactionError) {
      console.error('Error creating transaction:', transactionError);
    }

    return {
      success: true,
      userId,
      subscriptionId: subscription.id,
      transactionId: paymentResult.transactionId,
      message: isNewUser
        ? 'Compte créé et abonnement activé avec succès'
        : 'Abonnement activé avec succès'
    };
  } catch (error) {
    console.error('Error processing subscription payment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Une erreur est survenue'
    };
  }
}

async function processPayPalPayment(amount: number, userId: string, paypalEmail: string): Promise<PaymentResult> {
  try {
    if (!paypalEmail || !paypalEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return {
        success: false,
        error: 'Email PayPal invalide'
      };
    }

    const sandboxTransactionId = `PAYPAL-SANDBOX-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    console.log('[PAYPAL-SANDBOX] Simulating PayPal payment:', {
      transactionId: sandboxTransactionId,
      amount,
      userId,
      paypalEmail
    });

    await new Promise(resolve => setTimeout(resolve, 1500));

    const isSuccess = Math.random() > 0.05;

    if (!isSuccess) {
      return {
        success: false,
        error: 'Le paiement PayPal a été refusé. Veuillez vérifier vos informations de compte PayPal et réessayer.'
      };
    }

    return {
      success: true,
      transactionId: sandboxTransactionId,
      message: 'Paiement PayPal traité avec succès'
    };
  } catch (error) {
    console.error('PayPal payment error:', error);
    return {
      success: false,
      error: 'Erreur lors du traitement du paiement PayPal. Veuillez réessayer ou utiliser une autre méthode de paiement.'
    };
  }
}

interface StripeCardDetails {
  cardNumber: string;
  expirationDate: string;
  cvv: string;
  cardholderName: string;
}

async function processStripePayment(amount: number, userId: string, cardDetails: StripeCardDetails): Promise<PaymentResult> {
  try {
    const cardNumberClean = cardDetails.cardNumber.replace(/\s/g, '');

    if (cardNumberClean.length < 13 || cardNumberClean.length > 19) {
      return {
        success: false,
        error: 'Numéro de carte invalide'
      };
    }

    if (!cardDetails.expirationDate.match(/^(0[1-9]|1[0-2])\/([0-9]{2})$/)) {
      return {
        success: false,
        error: 'Date d\'expiration invalide (format MM/YY)'
      };
    }

    const [month, year] = cardDetails.expirationDate.split('/');
    const currentYear = new Date().getFullYear() % 100;
    const currentMonth = new Date().getMonth() + 1;
    const cardYear = parseInt(year);
    const cardMonth = parseInt(month);

    if (cardYear < currentYear || (cardYear === currentYear && cardMonth < currentMonth)) {
      return {
        success: false,
        error: 'Carte expirée. Veuillez utiliser une carte valide.'
      };
    }

    if (cardDetails.cvv.length < 3 || cardDetails.cvv.length > 4) {
      return {
        success: false,
        error: 'CVV invalide'
      };
    }

    if (cardDetails.cardholderName.trim().length < 3) {
      return {
        success: false,
        error: 'Nom du titulaire invalide'
      };
    }

    const sandboxTransactionId = `STRIPE-SANDBOX-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    console.log('[STRIPE-SANDBOX] Simulating Stripe payment:', {
      transactionId: sandboxTransactionId,
      amount,
      userId,
      cardLast4: cardNumberClean.slice(-4),
      cardholderName: cardDetails.cardholderName
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const isSuccess = Math.random() > 0.05;

    if (!isSuccess) {
      return {
        success: false,
        error: 'Le paiement par carte a été refusé. Veuillez vérifier vos informations ou essayer une autre carte.'
      };
    }

    return {
      success: true,
      transactionId: sandboxTransactionId,
      message: 'Paiement Stripe traité avec succès'
    };
  } catch (error) {
    console.error('Stripe payment error:', error);
    return {
      success: false,
      error: 'Erreur lors du traitement du paiement par carte. Veuillez réessayer ou utiliser une autre méthode de paiement.'
    };
  }
}

async function processAirtelMoneyPayment(amount: number, phoneNumber: string, userId: string): Promise<PaymentResult> {
  try {
    if (!phoneNumber) {
      return {
        success: false,
        error: 'Numéro de téléphone requis pour Airtel Money'
      };
    }

    if (!phoneNumber.match(/^\+?[0-9]{10,15}$/)) {
      return {
        success: false,
        error: 'Numéro de téléphone invalide. Format attendu: +221771234567'
      };
    }

    const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;

    const sandboxTransactionId = `AIRTEL-SANDBOX-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    console.log('[AIRTEL-MONEY-SANDBOX] Simulating Airtel Money payment:', {
      transactionId: sandboxTransactionId,
      amount,
      phoneNumber: normalizedPhone,
      userId
    });

    await new Promise(resolve => setTimeout(resolve, 2500));

    const isSuccess = Math.random() > 0.05;

    if (!isSuccess) {
      return {
        success: false,
        error: 'Le paiement Airtel Money a été refusé. Veuillez vérifier votre solde, votre numéro et réessayer.'
      };
    }

    return {
      success: true,
      transactionId: sandboxTransactionId,
      message: 'Paiement Airtel Money traité avec succès'
    };
  } catch (error) {
    console.error('Airtel Money payment error:', error);
    return {
      success: false,
      error: 'Erreur lors du traitement du paiement Airtel Money. Veuillez réessayer ou utiliser une autre méthode de paiement.'
    };
  }
}

export async function initiateBusinessPayment(userId: string, planId: string, phoneNumber: string): Promise<any> {
  try {
    const startDate = new Date();
    const endDate = new Date(2099, 11, 31);

    const plan = BUSINESS_PLANS.find(p => p.id === planId);
    if (!plan) {
      throw new Error('Plan not found');
    }

    const { data: pricingData } = await supabase
      .from('pricing')
      .select('*')
      .eq('plan tarifaire', planId)
      .maybeSingle();

    const price = pricingData?.price || plan.price;

    const { data: subscription, error: subscriptionError } = await supabase
      .from('business_subscriptions')
      .insert({
        user_id: userId,
        plan: planId,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        status: 'active',
        phone_number: phoneNumber,
        messages_remaining: null
      })
      .select()
      .single();

    if (subscriptionError) throw subscriptionError;

    await supabase
      .from('business_transactions')
      .insert({
        subscription_id: subscription.id,
        amount: price,
        status: 'completed',
        provider: 'system',
        provider_transaction_id: 'free-access-' + Date.now()
      });

    return {
      success: true,
      message: 'Business subscription activated successfully',
      transaction: { id: 'free-access-' + Date.now() }
    };
  } catch (error) {
    console.error('Error initiating business payment:', error);
    throw error;
  }
}