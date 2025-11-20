import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CreditCard, Loader2, CheckCircle, XCircle, Lock, Mail, User, Phone, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { processBusinessSubscriptionPayment, type PaymentMethod } from '../lib/business-subscription';
import Navigation from '../components/Navigation';

interface PlanDetails {
  id: string;
  name: string;
  price: number;
  features: string[];
}

const BusinessPayment = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('paypal');

  const [paypalEmail, setPaypalEmail] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const FCFA_TO_USD = 0.0016;

  useEffect(() => {
    loadPlanDetails();
  }, [planId]);

  const loadPlanDetails = async () => {
    try {
      if (!planId) {
        setLoading(false);
        return;
      }

      const { data: pricingData, error: pricingError } = await supabase
        .from('pricing')
        .select('price')
        .eq('plan tarifaire', planId)
        .maybeSingle();

      if (pricingError) {
        console.error('Error fetching pricing:', pricingError);
      }

      const planNames: Record<string, string> = {
        'basic': 'Basique',
        'pro': 'Pro',
        'enterprise': 'Entreprise'
      };

      const planFeatures: Record<string, string[]> = {
        'basic': [
          'Messages illimités par mois',
          'Module WhatsApp: Envoi en masse',
          'Filtrage de numéros WhatsApp',
          'Automatisation des réponses',
          'Importation de contacts'
        ],
        'pro': [
          'Toutes les fonctionnalités Basic',
          'Chatbot IA Service Client',
          'Base de connaissances personnalisable',
          'Analyses avancées',
          'Support prioritaire'
        ],
        'enterprise': [
          'Toutes les fonctionnalités Pro',
          'Chatbot Quiz interactif',
          'API dédiée et intégrations',
          'Assistance technique 24/7',
          'SLA 99.9% garantie'
        ]
      };

      const dbPrice = pricingData?.price || 0;

      setPlan({
        id: planId,
        name: planNames[planId] || planId,
        price: dbPrice,
        features: planFeatures[planId] || []
      });

      setLoading(false);
    } catch (err) {
      console.error('Error loading plan:', err);
      setLoading(false);
    }
  };

  const formatPriceUSD = (priceFCFA: number): string => {
    const usdPrice = priceFCFA * FCFA_TO_USD;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(usdPrice);
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];

    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      errors.push('Adresse email invalide');
    }

    if (password.length < 6) {
      errors.push('Le mot de passe doit contenir au moins 6 caractères');
    }

    if (password !== confirmPassword) {
      errors.push('Les mots de passe ne correspondent pas');
    }

    if (paymentMethod === 'paypal') {
      if (!paypalEmail) {
        errors.push('Email PayPal requis');
      } else if (!paypalEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
        errors.push('Email PayPal invalide');
      }
    }

    if (paymentMethod === 'stripe') {
      if (!cardNumber || cardNumber.replace(/\s/g, '').length < 13) {
        errors.push('Numéro de carte invalide (minimum 13 chiffres)');
      }
      if (!expirationDate || !expirationDate.match(/^(0[1-9]|1[0-2])\/([0-9]{2})$/)) {
        errors.push('Date d\'expiration invalide (format MM/YY)');
      }
      if (!cvv || cvv.length < 3) {
        errors.push('CVV invalide (3 ou 4 chiffres)');
      }
      if (!cardholderName || cardholderName.trim().length < 3) {
        errors.push('Nom du titulaire de carte requis');
      }
    }

    if (paymentMethod === 'airtel_money') {
      if (!phoneNumber) {
        errors.push('Numéro de téléphone requis pour Airtel Money');
      } else if (!phoneNumber.match(/^\+?[0-9]{10,15}$/)) {
        errors.push('Numéro de téléphone invalide (format international)');
      }
    }

    if (!planId) {
      errors.push('Plan invalide');
    }

    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProcessing(true);
    setError(null);
    setValidationErrors([]);
    setStatus('processing');

    try {
      const errors = validateForm();
      if (errors.length > 0) {
        setValidationErrors(errors);
        setStatus('idle');
        setProcessing(false);
        return;
      }

      const result = await processBusinessSubscriptionPayment({
        email,
        password,
        confirmPassword,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        paymentMethod,
        planId,
        phoneNumber: phoneNumber || undefined,
        paypalEmail: paypalEmail || undefined,
        cardNumber: cardNumber || undefined,
        expirationDate: expirationDate || undefined,
        cvv: cvv || undefined,
        cardholderName: cardholderName || undefined
      });

      if (!result.success) {
        throw new Error(result.error || 'Erreur lors du traitement du paiement');
      }

      setStatus('success');
      setTimeout(() => {
        navigate('/dashboard');
      }, 2500);
    } catch (err) {
      console.error('Payment error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Une erreur est survenue');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        <Navigation />
        <div className="flex items-center justify-center min-h-[80vh]">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">
              Plan non trouvé
            </h2>
            <p className="text-gray-600 text-center mb-6">
              Le plan sélectionné n'existe pas ou n'est plus disponible.
            </p>
            <button
              onClick={() => navigate('/')}
              className="w-full bg-blue-600 text-white py-3 px-6 rounded-xl hover:bg-blue-700 transition-all transform hover:scale-105 font-medium"
            >
              Retour à l'accueil
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white p-12 rounded-2xl shadow-2xl max-w-md w-full text-center">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Paiement réussi !</h2>
          <p className="text-gray-600 mb-2">
            Votre abonnement <span className="font-semibold text-blue-600">{plan.name}</span> a été activé avec succès.
          </p>
          <p className="text-sm text-gray-500 mb-8">
            Redirection vers votre tableau de bord...
          </p>
          <div className="animate-pulse">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600 mx-auto" />
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
        <div className="bg-white p-12 rounded-2xl shadow-2xl max-w-md w-full text-center">
          <XCircle className="w-20 h-20 text-red-500 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Erreur de paiement</h2>
          <p className="text-red-600 mb-8 font-medium">{error}</p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setStatus('idle');
                setError(null);
              }}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all font-medium"
            >
              Réessayer
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-medium"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-gray-100">
      <Navigation />
      <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <button
          onClick={() => navigate('/')}
          className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors group"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <span className="font-medium">Retour</span>
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Plan Summary Card */}
          <div className="lg:col-span-1">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl shadow-xl p-8 text-white sticky top-8">
              <div className="flex items-center gap-3 mb-6">
                <CreditCard className="w-8 h-8" />
                <h3 className="text-2xl font-bold">Plan {plan.name}</h3>
              </div>

              <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 mb-6">
                <p className="text-sm text-blue-100 mb-2">Tarif mensuel</p>
                <p className="text-4xl font-bold">{formatPriceUSD(plan.price)}</p>
                <p className="text-xs text-blue-200 mt-2">Paiement unique pour 30 jours</p>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-semibold text-blue-100 uppercase tracking-wide mb-3">Fonctionnalités incluses</p>
                {plan.features.slice(0, 5).map((feature, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <CheckCircle className="w-5 h-5 text-green-300 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-blue-50">{feature}</span>
                  </div>
                ))}
                {plan.features.length > 5 && (
                  <p className="text-sm text-blue-200 italic pt-2">+ {plan.features.length - 5} autres fonctionnalités</p>
                )}
              </div>
            </div>
          </div>

          {/* Payment Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6">
                <h2 className="text-2xl font-bold text-white">Informations de paiement</h2>
                <p className="text-blue-100 mt-1">Complétez le formulaire pour finaliser votre abonnement</p>
              </div>

              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                {/* Account Information */}
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    Informations du compte
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          placeholder="votre@email.com"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Prénom
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="text"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          placeholder="Jean"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Mot de passe <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          placeholder="••••••••"
                          required
                          minLength={6}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Minimum 6 caractères</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Confirmer mot de passe <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          placeholder="••••••••"
                          required
                          minLength={6}
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Nom
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        placeholder="Dupont"
                      />
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="space-y-4 pt-6 border-t-2 border-gray-100">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <Wallet className="w-5 h-5 text-blue-600" />
                    Méthode de paiement
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('paypal')}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        paymentMethod === 'paypal'
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="text-center">
                        <CreditCard className={`w-8 h-8 mx-auto mb-2 ${paymentMethod === 'paypal' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <p className="font-semibold text-gray-900">PayPal</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('stripe' as PaymentMethod)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        paymentMethod === 'stripe'
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="text-center">
                        <CreditCard className={`w-8 h-8 mx-auto mb-2 ${paymentMethod === 'stripe' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <p className="font-semibold text-gray-900">Stripe</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('airtel_money')}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        paymentMethod === 'airtel_money'
                          ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      <div className="text-center">
                        <Phone className={`w-8 h-8 mx-auto mb-2 ${paymentMethod === 'airtel_money' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <p className="font-semibold text-gray-900">Airtel Money</p>
                      </div>
                    </button>
                  </div>

                  {/* PayPal Email Field */}
                  {paymentMethod === 'paypal' && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-100">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email PayPal <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="email"
                          value={paypalEmail}
                          onChange={(e) => setPaypalEmail(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                          placeholder="votre.email@paypal.com"
                          required={paymentMethod === 'paypal'}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-2">Saisissez l'email associé à votre compte PayPal</p>
                    </div>
                  )}

                  {/* Stripe Card Fields */}
                  {paymentMethod === 'stripe' && (
                    <div className="mt-6 p-6 bg-blue-50 rounded-xl border-2 border-blue-100 space-y-4">
                      <p className="text-sm font-semibold text-gray-700 mb-4">Informations de carte bancaire</p>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Nom du titulaire <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            type="text"
                            value={cardholderName}
                            onChange={(e) => setCardholderName(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                            placeholder="Jean Dupont"
                            required={paymentMethod === 'stripe'}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Numéro de carte <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                          <input
                            type="text"
                            value={cardNumber}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\s/g, '').replace(/[^0-9]/g, '');
                              const formatted = value.match(/.{1,4}/g)?.join(' ') || value;
                              setCardNumber(formatted);
                            }}
                            className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                            placeholder="1234 5678 9012 3456"
                            maxLength={19}
                            required={paymentMethod === 'stripe'}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Date d'expiration <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={expirationDate}
                            onChange={(e) => {
                              let value = e.target.value.replace(/[^0-9]/g, '');
                              if (value.length >= 2) {
                                value = value.slice(0, 2) + '/' + value.slice(2, 4);
                              }
                              setExpirationDate(value);
                            }}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                            placeholder="MM/YY"
                            maxLength={5}
                            required={paymentMethod === 'stripe'}
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            CVV <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={cvv}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '');
                              setCvv(value);
                            }}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                            placeholder="123"
                            maxLength={4}
                            required={paymentMethod === 'stripe'}
                          />
                        </div>
                      </div>

                      <div className="flex items-start gap-2 mt-4 p-3 bg-white rounded-lg">
                        <Lock className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-600">Vos informations de paiement sont sécurisées et cryptées</p>
                      </div>
                    </div>
                  )}

                  {/* Airtel Money Phone Field */}
                  {paymentMethod === 'airtel_money' && (
                    <div className="mt-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-100">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Numéro de téléphone <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all bg-white"
                          placeholder="+221 XX XXX XX XX"
                          required={paymentMethod === 'airtel_money'}
                        />
                      </div>
                      <p className="text-xs text-gray-600 mt-2">Format international recommandé (ex: +221771234567)</p>
                    </div>
                  )}
                </div>

                {/* Validation Errors */}
                {validationErrors.length > 0 && (
                  <div className="mt-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-red-900 mb-2">Veuillez corriger les erreurs suivantes :</h4>
                        <ul className="space-y-1">
                          {validationErrors.map((error, index) => (
                            <li key={index} className="text-sm text-red-700 flex items-start gap-2">
                              <span className="text-red-500 font-bold">•</span>
                              <span>{error}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-6 border-t-2 border-gray-100">
                  <div className="bg-blue-50 rounded-xl p-4 mb-6">
                    <p className="text-sm text-gray-600">
                      En confirmant votre paiement, un compte professionnel sera automatiquement créé avec vos identifiants.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      type="button"
                      onClick={() => navigate('/')}
                      className="flex-1 px-6 py-4 border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-semibold"
                      disabled={processing}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={processing}
                      className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 font-semibold shadow-lg"
                    >
                      {processing ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Traitement en cours...
                        </>
                      ) : (
                        <>
                          <Lock className="w-5 h-5" />
                          Payer {formatPriceUSD(plan.price)}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessPayment;
