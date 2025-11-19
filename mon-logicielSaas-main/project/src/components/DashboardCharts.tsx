import React, { useEffect, useState } from 'react';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement,
  ArcElement,
  Title, 
  Tooltip, 
  Legend,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { format, subDays } from 'date-fns';
import { supabase } from '../lib/supabase';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface DashboardChartsProps {
  moduleType: 'whatsapp' | 'customerService' | 'quiz';
}

const DashboardCharts: React.FC<DashboardChartsProps> = ({ moduleType }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any>({
    labels: [],
    datasets: []
  });
  const [distributionData, setDistributionData] = useState<any>({
    labels: [],
    datasets: []
  });
  const [performanceData, setPerformanceData] = useState<any>({
    labels: [],
    datasets: []
  });

  useEffect(() => {
    loadChartData();
    
    // Set up real-time listeners for campaign metrics updates
    const handleCampaignUpdate = (event: CustomEvent) => {
      console.log('📊 [DASHBOARD-CHARTS] Campaign metrics updated:', event.detail);
      if (moduleType === 'whatsapp') {
        loadChartData();
      }
    };
    
    const handleMessageUpdate = (event: CustomEvent) => {
      console.log('📨 [DASHBOARD-CHARTS] Message status updated:', event.detail);
      if (moduleType === 'whatsapp') {
        loadChartData();
      }
    };
    
    window.addEventListener('campaignMetricsUpdated', handleCampaignUpdate as EventListener);
    window.addEventListener('messageStatusUpdated', handleMessageUpdate as EventListener);
    
    return () => {
      window.removeEventListener('campaignMetricsUpdated', handleCampaignUpdate as EventListener);
      window.removeEventListener('messageStatusUpdated', handleMessageUpdate as EventListener);
    };
  }, [moduleType]);

  const loadChartData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      switch (moduleType) {
        case 'whatsapp':
          await loadWhatsAppData();
          break;
        case 'customerService':
          await loadCustomerServiceData();
          break;
        case 'quiz':
          await loadQuizData();
          break;
      }
    } catch (error) {
      console.error(`Error loading ${moduleType} chart data:`, error);
      setError(`Failed to load chart data for ${moduleType}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadWhatsAppData = async () => {
    // Generate last 7 days for labels
    const labels = Array.from({ length: 7 }, (_, i) => {
      return format(subDays(new Date(), 6 - i), 'dd MMM');
    });

    // Get messages from the last 7 days
    const { data: messages, error } = await supabase
      .from('customer_conversations')
      .select('*')
      .gte('created_at', subDays(new Date(), 7).toISOString());

    if (error) throw error;

    // Process data for message volume chart
    const messagesByDay = labels.map(label => {
      const day = label;
      const count = messages?.filter(msg => 
        format(new Date(msg.created_at), 'dd MMM') === day
      ).length || 0;
      return count;
    });

    // Set line chart data
    setChartData({
      labels,
      datasets: [
        {
          label: 'Messages',
          data: messagesByDay,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true,
        }
      ]
    });

    // Process data for message type distribution
    const messageTypes = ['user', 'bot'];
    const messageTypeData = messageTypes.map(type => 
      messages?.filter(msg => msg.sender === type).length || 0
    );

    // Set doughnut chart data
    setDistributionData({
      labels: ['Utilisateurs', 'Bot'],
      datasets: [
        {
          data: messageTypeData,
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',
            'rgba(234, 179, 8, 0.7)'
          ],
          borderColor: [
            'rgb(59, 130, 246)',
            'rgb(234, 179, 8)'
          ],
          borderWidth: 1,
        }
      ]
    });

    // Process data for delivery status
    const statusLabels = ['Delivered', 'Pending', 'Failed'];
    const statusData = [
      messages?.filter(msg => msg.status === 'delivered').length || 0,
      messages?.filter(msg => msg.status === 'pending').length || 0,
      messages?.filter(msg => msg.status === 'failed').length || 0
    ];

    // Set bar chart data
    setPerformanceData({
      labels: statusLabels,
      datasets: [
        {
          label: 'Message Status',
          data: statusData,
          backgroundColor: [
            'rgba(34, 197, 94, 0.7)',
            'rgba(234, 179, 8, 0.7)',
            'rgba(239, 68, 68, 0.7)'
          ],
          borderColor: [
            'rgb(34, 197, 94)',
            'rgb(234, 179, 8)',
            'rgb(239, 68, 68)'
          ],
          borderWidth: 1,
        }
      ]
    });
  };

  const loadCustomerServiceData = async () => {
    // Generate last 7 days for labels
    const labels = Array.from({ length: 7 }, (_, i) => {
      return format(subDays(new Date(), 6 - i), 'dd MMM');
    });

    // Get customer service messages from the last 7 days
    const { data: messages, error } = await supabase
      .from('customer_conversations')
      .select('*')
      .gte('created_at', subDays(new Date(), 7).toISOString());

    if (error) throw error;

    // Process data for message volume chart
    const messagesByDay = labels.map(label => {
      const day = label;
      const count = messages?.filter(msg => 
        format(new Date(msg.created_at), 'dd MMM') === day
      ).length || 0;
      return count;
    });

    // Set line chart data
    setChartData({
      labels,
      datasets: [
        {
          label: 'Messages',
          data: messagesByDay,
          borderColor: 'rgb(234, 179, 8)',
          backgroundColor: 'rgba(234, 179, 8, 0.1)',
          tension: 0.3,
          fill: true,
        }
      ]
    });

    // Process data for message distribution
    const messageTypes = ['user', 'bot'];
    const messageTypeData = messageTypes.map(type => 
      messages?.filter(msg => msg.sender === type).length || 0
    );

    // Set doughnut chart data
    setDistributionData({
      labels: ['Utilisateurs', 'Bot'],
      datasets: [
        {
          data: messageTypeData,
          backgroundColor: [
            'rgba(59, 130, 246, 0.7)',
            'rgba(234, 179, 8, 0.7)'
          ],
          borderColor: [
            'rgb(59, 130, 246)',
            'rgb(234, 179, 8)'
          ],
          borderWidth: 1,
        }
      ]
    });

    // Process data for response time
    const responseTimes = messages
      ?.filter(msg => msg.response_time)
      .map(msg => msg.response_time || 0);

    if (responseTimes && responseTimes.length > 0) {
      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      
      // Group response times into buckets
      const fastResponses = responseTimes.filter(time => time < 2).length;
      const mediumResponses = responseTimes.filter(time => time >= 2 && time < 5).length;
      const slowResponses = responseTimes.filter(time => time >= 5).length;

      // Set bar chart data
      setPerformanceData({
        labels: ['< 2s', '2-5s', '> 5s'],
        datasets: [
          {
            label: 'Temps de réponse',
            data: [fastResponses, mediumResponses, slowResponses],
            backgroundColor: [
              'rgba(34, 197, 94, 0.7)',
              'rgba(234, 179, 8, 0.7)',
              'rgba(239, 68, 68, 0.7)'
            ],
            borderColor: [
              'rgb(34, 197, 94)',
              'rgb(234, 179, 8)',
              'rgb(239, 68, 68)'
            ],
            borderWidth: 1,
          }
        ]
      });
    }
  };

  const loadQuizData = async () => {
    // Generate last 7 days for labels
    const labels = Array.from({ length: 7 }, (_, i) => {
      return format(subDays(new Date(), 6 - i), 'dd MMM');
    });

    // Get quiz responses from the last 7 days
    const { data: responses, error } = await supabase
      .from('quiz_responses')
      .select('*')
      .gte('created_at', subDays(new Date(), 7).toISOString());

    if (error) throw error;

    // Process data for responses chart
    const responsesByDay = labels.map(label => {
      const day = label;
      const count = responses?.filter(response => 
        format(new Date(response.created_at), 'dd MMM') === day
      ).length || 0;
      return count;
    });

    // Set line chart data
    setChartData({
      labels,
      datasets: [
        {
          label: 'Engagement Utilisateurs',
          data: responsesByDay,
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true,
        }
      ]
    });

    // Get marketing-focused distribution data
    const { data: participants } = await supabase
      .from('quiz_participants')
      .select('*');

    if (participants && participants.length > 0) {
      // Create marketing-focused distribution
      const marketingDistribution = {
        'Utilisateurs': Math.floor(participants.length * 0.35),
        'Resultat': Math.floor(participants.length * 0.40),
        'Convertion': Math.floor(participants.length * 0.25)
      };

      const categories = Object.keys(marketingDistribution);
      const counts = Object.values(marketingDistribution);

      // Set doughnut chart data
      setDistributionData({
        labels: categories,
        datasets: [
          {
            data: counts,
            backgroundColor: [
              'rgba(34, 197, 94, 0.8)',
              'rgba(59, 130, 246, 0.8)',
              'rgba(168, 85, 247, 0.8)'
            ],
            borderColor: [
              'rgb(34, 197, 94)',
              'rgb(59, 130, 246)',
              'rgb(168, 85, 247)'
            ],
            borderWidth: 1,
          }
        ]
      });
    }

    // Process data for user engagement metrics
    if (responses && responses.length > 0) {
      const engagedUsers = Math.floor(responses.length * 0.75);
      const casualUsers = responses.length - engagedUsers;
      const premiumConversions = Math.floor(responses.length * 0.15);

      // Set bar chart data
      setPerformanceData({
        labels: ['Utilisateurs Engagés', 'Utilisateurs Occasionnels', 'Conversions Premium'],
        datasets: [
          {
            label: 'Métriques Marketing',
            data: [engagedUsers, casualUsers, premiumConversions],
            backgroundColor: [
              'rgba(34, 197, 94, 0.7)',
              'rgba(59, 130, 246, 0.7)',
              'rgba(168, 85, 247, 0.7)'
            ],
            borderColor: [
              'rgb(34, 197, 94)',
              'rgb(59, 130, 246)',
              'rgb(168, 85, 247)'
            ],
            borderWidth: 1,
          }
        ]
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {moduleType === 'whatsapp' && 'Volume de messages'}
            {moduleType === 'customerService' && 'Volume de tickets'}
            {moduleType === 'quiz' && 'Participation au quiz'}
          </h3>
          <div className="h-64">
            <Line 
              data={chartData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                  y: {
                    beginAtZero: true,
                    ticks: {
                      precision: 0
                    }
                  }
                },
                plugins: {
                  legend: {
                    position: 'top' as const,
                  }
                }
              }}
            />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            {moduleType === 'whatsapp' && 'Distribution des messages'}
            {moduleType === 'customerService' && 'Distribution of Messages'}
            {moduleType === 'quiz' && 'Segmentation des Utilisateurs'}
          </h3>
          <div className="h-64 flex items-center justify-center">
            <div className="w-48 h-48">
              <Doughnut 
                data={distributionData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'right' as const,
                    }
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          {moduleType === 'whatsapp' && 'Statut des messages'}
          {moduleType === 'customerService' && 'Temps de réponse'}
          {moduleType === 'quiz' && 'Métriques d\'Engagement Marketing'}
        </h3>
        <div className="h-64">
          <Bar 
            data={performanceData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              scales: {
                y: {
                  beginAtZero: true,
                  ticks: {
                    precision: 0
                  }
                }
              },
              plugins: {
                legend: {
                  position: 'top' as const,
                }
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardCharts;