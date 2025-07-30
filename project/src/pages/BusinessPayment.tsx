import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CreditCard, CheckCircle, XCircle, Loader2, AlertTriangle } from 'lucide-react';
import { BUSINESS_PLANS } from '../lib/business-subscription';
import { useAuth } from '../contexts/AuthContext';
import BusinessPayment from '../components/BusinessPayment';

const BusinessPaymentPage = () => {
  const { planId } = useParams<{ planId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<typeof BUSINESS_PLANS[0] | null>(null);

  useEffect(() => {
    const plan = BUSINESS_PLANS.find(p => p.id === planId);
    if (!plan) {
      setError('Plan d\'abonnement non trouvé');
      setLoading(false);
      return;
    }

    setSelectedPlan(plan);
    setShowPayment(true);
    setLoading(false);
  }, [planId, navigate]);

  const handlePaymentSuccess = () => {
    navigate('/dashboard');
  };

  const handlePaymentCancel = () => {
    navigate('/professional-subscription');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
            <div className="flex flex-col items-center">
              <XCircle className="w-16 h-16 text-red-600 mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Erreur</h1>
              <p className="text-gray-600 text-center mb-6">{error}</p>
              <button
                onClick={() => navigate('/professional-subscription')}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Retour aux abonnements
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-8">
          <button
            onClick={() => navigate('/professional-subscription')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-5 h-5" />
            Retour aux abonnements
          </button>
        </div>

        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            {selectedPlan && showPayment && (
              <BusinessPayment
                plan={selectedPlan}
                onSuccess={handlePaymentSuccess}
                onCancel={handlePaymentCancel}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessPaymentPage;