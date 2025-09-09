import React, { useEffect, useState } from 'react';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { subscribeToModuleUpdates } from '../lib/chatbot-communication';

interface RealTimeSyncProps {
  onSyncUpdate?: (module: string, data: any) => void;
}

const RealTimeSync: React.FC<RealTimeSyncProps> = ({ onSyncUpdate }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [syncCount, setSyncCount] = useState(0);

  useEffect(() => {
    // Monitor Supabase connection status
    const channel = supabase.channel('connection_monitor');
    
    channel
      .on('system', {}, (payload) => {
        console.log('Supabase system event:', payload);
        if (payload.status === 'SUBSCRIBED') {
          setIsConnected(true);
          setLastSync(new Date());
        } else if (payload.status === 'CLOSED') {
          setIsConnected(false);
        }
      })
      .subscribe();

    // Subscribe to all module updates for monitoring
    const unsubscribeConversations = subscribeToModuleUpdates('conversations', (payload) => {
      setLastSync(new Date());
      setSyncCount(prev => prev + 1);
      onSyncUpdate?.('conversations', payload);
    });

    const unsubscribeCustomerService = subscribeToModuleUpdates('customer_service', (payload) => {
      setLastSync(new Date());
      setSyncCount(prev => prev + 1);
      onSyncUpdate?.('customer_service', payload);
    });

    const unsubscribeQuiz = subscribeToModuleUpdates('quiz', (payload) => {
      setLastSync(new Date());
      setSyncCount(prev => prev + 1);
      onSyncUpdate?.('quiz', payload);
    });

    const unsubscribeQuizAnalytics = subscribeToModuleUpdates('quiz_analytics', (payload) => {
      setLastSync(new Date());
      setSyncCount(prev => prev + 1);
      onSyncUpdate?.('quiz_analytics', payload);
    });

    // Initial connection test
    const testConnection = async () => {
      try {
        const { error } = await supabase.from('customer_conversations').select('id').limit(1);
        setIsConnected(!error);
      } catch (error) {
        setIsConnected(false);
      }
    };

    testConnection();

    return () => {
      channel.unsubscribe();
      unsubscribeConversations();
      unsubscribeCustomerService();
      unsubscribeQuiz();
      unsubscribeQuizAnalytics();
    };
  }, [onSyncUpdate]);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-sm">
      {isConnected ? (
        <>
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-green-700">Sync Active</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-red-500" />
          <span className="text-red-700">Disconnected</span>
        </>
      )}
      
      {lastSync && (
        <span className="text-gray-500 ml-2">
          {lastSync.toLocaleTimeString()}
        </span>
      )}
      
      {syncCount > 0 && (
        <span className="text-blue-600 ml-1">
          ({syncCount})
        </span>
      )}
    </div>
  );
};

export default RealTimeSync;