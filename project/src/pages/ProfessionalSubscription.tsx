import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Brain, MessageSquare, BookOpen, Target, Clock, Calendar, CreditCard, ArrowRight, Briefcase, Users, BarChart2, Shield, ChevronDown, ChevronUp, GamepadIcon, Repeat } from 'lucide-react';
import { BUSINESS_PLANS } from '../lib/business-subscription';
import BackButton from '../components/BackButton';
import { supabase, getPricing } from '../lib/supabase';

const ProfessionalSubscription = () => {
  const navigate = useNavigate();
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [plans, setPlans] = useState(BUSINESS_PLANS);
  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState<'FCFA' | 'USD'>('FCFA');
  const exchangeRate = 0.00165; // 1 FCFA = 0.00165 USD (approximate)

  useEffect(() => {
    loadCustomPricing();
  }, []);

  const loadCustomPricing = async () => {
    try {
      setLoading(true);
      const data = await getPricing();

      if (data && data.length > 0) {
        // Create a copy of the plans to modify
        const updatedPlans = [...BUSINESS_PLANS];
        
        // Update prices based on database values
        data.forEach(item => {
          const planIndex = updatedPlans.findIndex(p => p.id === item['plan tarifaire']);
          if (planIndex !== -1) {
            updatedPlans[planIndex] = {
              ...updatedPlans[planIndex],
              price: item.price
            };
          }
        });
        
        setPlans(updatedPlans);
      }
    } catch (error) {
      console.error('Error loading custom pricing:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = (planId: string) => {
    navigate(`/business-payment/${planId}`);
  };

  const togglePlanDetails = (planId: string) => {
    setExpandedPlan(expandedPlan === planId ? null : planId);
  };

  const toggleCurrency = () => {
    if (currency === 'FCFA') {
      setCurrency('USD');
    } else {
      setCurrency('FCFA');
    }
  };

  const formatPrice = (price: number) => {
    if (currency === 'USD') {
      const usdPrice = price * exchangeRate;
      return usdPrice.toFixed(2);
    }
    return price.toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4">
        <BackButton />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Briefcase className="w-12 h-12 text-red-600" />
            <h1 className="text-4xl font-bold text-gray-900">Abonnement Professionnel</h1>
          </div>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Transformez votre entreprise avec nos solutions de communication intelligentes
          </p>
        </div>

        <div className="flex justify-center mb-8">
          <button
            onClick={toggleCurrency}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <Repeat className="w-4 h-4" />
            {currency === 'FCFA' ? 'Afficher en USD' : 'Afficher en FCFA'}
          </button>
        </div>

        {/* Features Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          <div className="bg-white rounded-xl p-8 shadow-sm text-center transform transition-transform hover:scale-105">
            <MessageSquare className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Communication Omnicanale</h3>
            <p className="text-gray-600">Gérez toutes vos conversations WhatsApp depuis une interface unique et intuitive</p>
          </div>
          <div className="bg-white rounded-xl p-8 shadow-sm text-center transform transition-transform hover:scale-105">
            <Users className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Marketing Automatisé</h3>
            <p className="text-gray-600">Envoyez des messages personnalisés à grande échelle et augmentez votre engagement client</p>
          </div>
          <div className="bg-white rounded-xl p-8 shadow-sm text-center transform transition-transform hover:scale-105">
            <BarChart2 className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Analyse de Performance</h3>
            <p className="text-gray-600">Suivez l'efficacité de vos campagnes marketing avec des tableaux de bord détaillés</p>
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`bg-white rounded-xl shadow-lg overflow-hidden ${
                plan.id === 'pro' ? 'ring-2 ring-red-600 transform scale-105' : ''
              }`}
            >
              {plan.id === 'pro' && (
                <div className="bg-red-600 text-white text-center py-2 text-sm font-medium">
                  Plus populaire
                </div>
              )}
              <div className="p-8">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">{plan.name}</h3>
                <div className="flex items-baseline mb-6">
                  {currency === 'USD' ? (
                    <>
                      <span className="text-gray-500 mr-1">{currency}</span>
                      <span className="text-4xl font-bold text-gray-900">{formatPrice(plan.price)}</span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-gray-900">{formatPrice(plan.price)}</span>
                      <span className="text-gray-500 ml-1">{currency}</span>
                    </>
                  )}
                  <span className="text-gray-500 ml-1">/mois</span>
                </div>

                <ul className="space-y-4 mb-8">
                  {(plan.shortFeatures || plan.features.slice(0, 5)).map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start">
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0 mr-2" />
                      <span className="text-gray-600 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {expandedPlan === plan.id && (
                  <div className="mt-4 mb-8 border-t border-gray-100 pt-4">
                    <div className="mb-4">
                      <p className="text-gray-600 text-sm mb-4">{plan.detailedDescription}</p>
                    </div>
                    <ul className="space-y-4">
                      {plan.features.slice(5).map((feature, featureIndex) => (
                        <li key={featureIndex + 5} className="flex items-start">
                          <Check className="w-5 h-5 text-green-500 flex-shrink-0 mr-2" />
                          <span className="text-gray-600 text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => togglePlanDetails(plan.id)}
                    className="w-full px-4 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-1"
                  >
                    {expandedPlan === plan.id ? (
                      <>
                        Voir moins
                        <ChevronUp className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        Voir plus
                        <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => handleSubscribe(plan.id)}
                    className={`w-full px-6 py-3 rounded-lg flex items-center justify-center gap-2 ${
                      plan.id === 'pro'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'bg-gray-900 text-white hover:bg-gray-800'
                    } transition-colors shadow-sm`}
                  >
                    <CreditCard className="w-5 h-5" />
                    Choisir ce plan
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Benefits Section */}
        <div className="bg-white rounded-xl shadow-sm p-8 mb-16">
          <h3 className="text-2xl font-semibold text-gray-900 mb-8 text-center">Avantages de l'abonnement professionnel</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex items-start gap-4">
              <div className="bg-blue-100 p-3 rounded-lg">
                <MessageSquare className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">Communication Omnicanale</h4>
                <p className="text-gray-600">Gérez toutes vos conversations WhatsApp depuis une interface unique et intuitive. Répondez rapidement à vos clients et suivez l'historique complet des échanges.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="bg-green-100 p-3 rounded-lg">
                <Users className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">Automatisation Intelligente</h4>
                <p className="text-gray-600">Configurez des réponses automatiques personnalisées pour les questions fréquentes. Libérez du temps pour vous concentrer sur les tâches à forte valeur ajoutée.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="bg-red-100 p-3 rounded-lg">
                <Target className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">Marketing Ciblé</h4>
                <p className="text-gray-600">Créez et envoyez des campagnes marketing personnalisées à vos segments de clients. Augmentez vos taux de conversion avec des messages pertinents.</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4">
              <div className="bg-yellow-100 p-3 rounded-lg">
                <GamepadIcon className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <h4 className="text-lg font-medium text-gray-900 mb-2">Quiz et Engagement</h4>
                <p className="text-gray-600">Créez des quiz interactifs pour engager votre audience, collecter des données clients et fidéliser votre communauté de manière ludique et éducative.</p>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-xl shadow-sm p-8">
          <h3 className="text-2xl font-semibold text-gray-900 mb-8 text-center">Questions fréquentes</h3>
          
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Comment fonctionne l'intégration WhatsApp?</h4>
              <p className="text-gray-600">Notre plateforme se connecte directement à l'API WhatsApp Business. Vous pouvez scanner un QR code pour lier votre compte WhatsApp et commencer à envoyer et recevoir des messages immédiatement.</p>
            </div>
            
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Puis-je envoyer des messages en masse?</h4>
              <p className="text-gray-600">Oui, tous nos forfaits permettent l'envoi de messages en masse. Le nombre de messages varie selon le forfait choisi. Vous pouvez importer vos contacts via CSV et personnaliser vos messages avec des variables.</p>
            </div>
            
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Comment fonctionnent les réponses automatiques?</h4>
              <p className="text-gray-600">Vous pouvez configurer des règles basées sur des mots-clés ou des expressions régulières. Lorsqu'un client envoie un message correspondant à ces règles, une réponse prédéfinie est automatiquement envoyée.</p>
            </div>
            
            <div>
              <h4 className="text-lg font-medium text-gray-900 mb-2">Puis-je changer de forfait à tout moment?</h4>
              <p className="text-gray-600">Oui, vous pouvez passer à un forfait supérieur à tout moment. Le changement prend effet immédiatement et la différence de prix est calculée au prorata de la période restante.</p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <Clock className="w-12 h-12 text-blue-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Support Prioritaire</h3>
            <p className="mt-2 text-gray-600">
              Bénéficiez d'une assistance technique dédiée pour votre entreprise
            </p>
          </div>
          <div className="text-center">
            <Calendar className="w-12 h-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">Facturation Mensuelle</h3>
            <p className="mt-2 text-gray-600">
              Paiement simple et transparent avec renouvellement automatique
            </p>
          </div>
          <div className="text-center">
            <Brain className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900">IA Avancée</h3>
            <p className="mt-2 text-gray-600">
              Automatisez vos réponses avec notre technologie d'intelligence artificielle
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfessionalSubscription;