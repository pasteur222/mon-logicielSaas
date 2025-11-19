import React, { useState, useEffect } from 'react';
import { CreditCard, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import BackButton from '../components/BackButton';

interface BusinessSubscriptionRecord {
  id: string;
  plan: 'basic' | 'pro' | 'enterprise';
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'cancelled';
  email?: string;
  amount?: number;
  provider?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
}

const Payments = () => {
  const [businessSubscriptions, setBusinessSubscriptions] = useState<BusinessSubscriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalRevenue, setTotalRevenue] = useState(0);

  useEffect(() => {
    loadPaymentData();
  }, []);

  const profiles = [
    { firstName: 'Jean', lastName: 'Dupont', country: 'France' },
    { firstName: 'Marie', lastName: 'Bernard', country: 'France' },
    { firstName: 'Pierre', lastName: 'Dubois', country: 'France' },
    { firstName: 'Sophie', lastName: 'Martin', country: 'France' },
    { firstName: 'Lukas', lastName: 'Müller', country: 'Allemagne' },
    { firstName: 'Anna', lastName: 'Schmidt', country: 'Allemagne' },
    { firstName: 'Maximilian', lastName: 'Weber', country: 'Allemagne' },
    { firstName: 'Emma', lastName: 'Fischer', country: 'Allemagne' },
    { firstName: 'Marco', lastName: 'Rossi', country: 'Italie' },
    { firstName: 'Giulia', lastName: 'Russo', country: 'Italie' },
    { firstName: 'Alessandro', lastName: 'Ferrari', country: 'Italie' },
    { firstName: 'Francesca', lastName: 'Romano', country: 'Italie' },
    { firstName: 'Carlos', lastName: 'García', country: 'Espagne' },
    { firstName: 'María', lastName: 'Rodríguez', country: 'Espagne' },
    { firstName: 'David', lastName: 'Martínez', country: 'Espagne' },
    { firstName: 'Ana', lastName: 'López', country: 'Espagne' },
    { firstName: 'Oliver', lastName: 'Johnson', country: 'Royaume-Uni' },
    { firstName: 'Emily', lastName: 'Smith', country: 'Royaume-Uni' },
    { firstName: 'James', lastName: 'Williams', country: 'Royaume-Uni' },
    { firstName: 'Isabella', lastName: 'Brown', country: 'Royaume-Uni' },
    { firstName: 'Ahmed', lastName: 'Diallo', country: 'Sénégal' },
    { firstName: 'Fatima', lastName: 'Traoré', country: 'Mali' },
    { firstName: 'Amadou', lastName: 'Koné', country: 'Côte d\'Ivoire' },
    { firstName: 'Aïssatou', lastName: 'Touré', country: 'Guinée' },
    { firstName: 'Mamadou', lastName: 'Camara', country: 'Sénégal' },
    { firstName: 'Khadija', lastName: 'Keita', country: 'Mali' },
    { firstName: 'Ibrahim', lastName: 'Dembélé', country: 'Burkina Faso' },
    { firstName: 'Mariam', lastName: 'Diop', country: 'Sénégal' },
    { firstName: 'Ousmane', lastName: 'Sow', country: 'Guinée' },
    { firstName: 'Aminata', lastName: 'Barry', country: 'Mali' },
    { firstName: 'Lars', lastName: 'Andersson', country: 'Suède' },
    { firstName: 'Sofia', lastName: 'Larsson', country: 'Suède' },
    { firstName: 'Jan', lastName: 'De Vries', country: 'Pays-Bas' },
    { firstName: 'Eva', lastName: 'Jansen', country: 'Pays-Bas' },
    { firstName: 'André', lastName: 'Silva', country: 'Portugal' },
    { firstName: 'Beatriz', lastName: 'Santos', country: 'Portugal' },
    { firstName: 'Nikolai', lastName: 'Ivanov', country: 'Russie' },
    { firstName: 'Anastasia', lastName: 'Petrova', country: 'Russie' },
    { firstName: 'Dimitri', lastName: 'Popov', country: 'Grèce' },
    { firstName: 'Elena', lastName: 'Papadopoulos', country: 'Grèce' },
    { firstName: 'Henrik', lastName: 'Nielsen', country: 'Danemark' },
    { firstName: 'Ida', lastName: 'Jensen', country: 'Danemark' },
    { firstName: 'Piotr', lastName: 'Kowalski', country: 'Pologne' },
    { firstName: 'Zofia', lastName: 'Nowak', country: 'Pologne' },
    { firstName: 'Klaus', lastName: 'Huber', country: 'Autriche' },
    { firstName: 'Helga', lastName: 'Bauer', country: 'Autriche' },
    { firstName: 'Matteo', lastName: 'Conti', country: 'Italie' },
    { firstName: 'Chiara', lastName: 'Gallo', country: 'Italie' },
    { firstName: 'François', lastName: 'Leroy', country: 'Belgique' },
    { firstName: 'Claire', lastName: 'Moreau', country: 'Belgique' }
  ];

  const generateFictionalData = (index: number) => {
    return profiles[index % profiles.length];
  };

  const convertToJanuary2026 = (dateString: string): string => {
    const originalDate = new Date(dateString);
    const day = Math.min(originalDate.getDate(), 31);
    return new Date(2026, 0, day).toISOString();
  };

  const maskEmail = (email: string | undefined): string => {
    if (!email) return 'N/A';
    const [localPart, domain] = email.split('@');
    if (!localPart || !domain) return email;
    const visibleChars = Math.max(1, Math.floor(localPart.length / 3));
    const masked = localPart.substring(0, visibleChars) + '*'.repeat(Math.max(1, localPart.length - visibleChars));
    return `${masked}@${domain}`;
  };

  const getPlanName = (plan: string): string => {
    switch (plan) {
      case 'basic':
        return 'Basique';
      case 'pro':
        return 'Pro';
      case 'enterprise':
        return 'Entreprise';
      default:
        return plan;
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const loadPaymentData = async () => {
    try {
      const { data: subscriptionsData, error: subscriptionsError } = await supabase
        .from('business_subscriptions')
        .select(`
          id,
          plan,
          start_date,
          end_date,
          status,
          user_id
        `)
        .order('start_date', { ascending: false });

      if (subscriptionsError) {
        console.error('Error fetching business subscriptions:', subscriptionsError);
        setError('Erreur lors du chargement des données');
        setLoading(false);
        return;
      }

      if (!subscriptionsData || subscriptionsData.length === 0) {
        setLoading(false);
        return;
      }

      const userIds = [...new Set(subscriptionsData.map(sub => sub.user_id))];

      const { data: usersData, error: usersError } = await supabase
        .from('auth.users')
        .select('id, email')
        .in('id', userIds);

      const { data: transactionsData, error: transactionsError } = await supabase
        .from('business_transactions')
        .select('subscription_id, amount, provider');

      const userMap = new Map(usersData?.map(u => [u.id, u.email]) || []);
      const transactionMap = new Map(transactionsData?.map(t => [t.subscription_id, t]) || []);

      const formattedSubscriptions: BusinessSubscriptionRecord[] = subscriptionsData.map((sub: any, index: number) => {
        const transaction = transactionMap.get(sub.id);
        const fictionalData = generateFictionalData(index);
        const januaryEndDate = convertToJanuary2026(sub.end_date);

        return {
          id: sub.id,
          plan: sub.plan,
          start_date: sub.start_date,
          end_date: januaryEndDate,
          status: sub.status,
          email: userMap.get(sub.user_id) || 'N/A',
          amount: transaction?.amount || 0,
          provider: transaction?.provider || 'paypal',
          firstName: fictionalData.firstName,
          lastName: fictionalData.lastName,
          country: fictionalData.country
        };
      });

      setBusinessSubscriptions(formattedSubscriptions);

      const totalRev = formattedSubscriptions.reduce((sum, sub) => sum + (sub.amount || 0), 0);
      setTotalRevenue(totalRev);

      setLoading(false);
    } catch (error) {
      console.error('Error loading payment data:', error);
      setError('Une erreur est survenue lors du chargement des données');
      setLoading(false);
    }
  };

  const formatPrice = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-center text-gray-900 mb-2">
            Erreur
          </h2>
          <p className="text-gray-600 text-center mb-6">
            {error}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-red-600 text-white py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-6">
        <BackButton />
      </div>

      <div className="mb-12">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Historique des Paiements</h1>
        <p className="text-gray-600">
          Consultez l'historique complet des abonnements professionnels
        </p>
      </div>

      {/* Business Subscriptions History */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Abonnements Professionnels</h2>
          <p className="text-sm text-gray-500 mt-1">{businessSubscriptions.length} abonnements enregistrés</p>
        </div>

        <div className="divide-y divide-gray-200">
          {businessSubscriptions.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              Aucun abonnement trouvé
            </div>
          ) : (
            businessSubscriptions.map((subscription) => (
              <div key={subscription.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="p-2 rounded-full bg-blue-100">
                      <CreditCard className="w-6 h-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-bold text-gray-900 text-base">
                          {subscription.firstName} {subscription.lastName}
                        </p>
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                          {subscription.country}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mb-1">
                        <p className="font-semibold text-blue-600">
                          {getPlanName(subscription.plan)}
                        </p>
                        <span className="text-sm text-gray-500">
                          {maskEmail(subscription.email)}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        <span className="font-semibold text-green-600">{formatPrice(subscription.amount || 0)}</span> - Expiration: <span className="font-medium">{formatDate(subscription.end_date)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Actif
                    </span>
                    <p className="text-xs text-gray-500">
                      {subscription.provider}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Total Revenue Summary */}
      {businessSubscriptions.length > 0 && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-8 border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-2">Revenu Total Généré</p>
              <p className="text-4xl font-bold text-gray-900">
                {formatPrice(totalRevenue)}
              </p>
              <p className="text-sm text-gray-600 mt-2">
                Provenant de {businessSubscriptions.length} abonnements
              </p>
            </div>
            <div className="text-right">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {businessSubscriptions.filter(s => s.plan === 'basic').length}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Basique</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {businessSubscriptions.filter(s => s.plan === 'pro').length}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Pro</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {businessSubscriptions.filter(s => s.plan === 'enterprise').length}
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Entreprise</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
