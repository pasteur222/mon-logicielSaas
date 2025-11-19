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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const channels: any[] = [];
    
    const initializeConnection = async () => {
      try {
        setConnectionError(null);
        
        // Test basic Supabase connectivity first
        const { data, error } = await supabase
          .from('customer_conversations')
          .select('id')
          .limit(1);
        
        if (error) {
          throw new Error(`Database connectivity test failed: ${error.message}`);
        }
        
        console.log('✅ [REALTIME-SYNC] Database connectivity test passed');
        
        // Monitor Supabase connection status with better error handling
        const connectionChannel = supabase.channel('connection_monitor', {
          config: {
            presence: {
              key: 'dashboard-sync'
            }
          }
        });
        
        channels.push(connectionChannel);
    
        connectionChannel
          .on('system', {}, (payload) => {
            if (!mounted) return;
            
            console.log('✅ [REALTIME-SYNC] Supabase system event:', payload);
            if (payload.status === 'SUBSCRIBED') {
              setIsConnected(true);
              setLastSync(new Date());
              setRetryCount(0);
              console.log('✅ [REALTIME-SYNC] Connection established');
            } else if (payload.status === 'CLOSED') {
              setIsConnected(false);
              console.log('⚠️ [REALTIME-SYNC] Connection closed');
            } else if (payload.status === 'CHANNEL_ERROR') {
              setIsConnected(false);
              setConnectionError('Channel error occurred');
              console.error('❌ [REALTIME-SYNC] Channel error:', payload);
            }
          })
          .on('presence', { event: 'sync' }, () => {
            if (!mounted) return;
            setIsConnected(true);
            setLastSync(new Date());
          })
          .subscribe((status) => {
            if (!mounted) return;
            
            console.log('📡 [REALTIME-SYNC] Channel subscription status:', status);
            if (status === 'SUBSCRIBED') {
              setIsConnected(true);
              setLastSync(new Date());
            } else if (status === 'CHANNEL_ERROR') {
              setIsConnected(false);
              setConnectionError('Subscription failed');
            }
          });

        // Subscribe to all module updates for monitoring with error handling
        const unsubscribeConversations = subscribeToModuleUpdates('conversations', (payload) => {
          if (!mounted) return;
          
          console.log('📨 [REALTIME-SYNC] Conversations update received:', payload);
          setLastSync(new Date());
          setSyncCount(prev => prev + 1);
          setIsConnected(true); // Mark as connected when receiving updates
          onSyncUpdate?.('conversations', payload);
        });

        const unsubscribeCustomerService = subscribeToModuleUpdates('customer_service', (payload) => {
          if (!mounted) return;
          
          console.log('🎧 [REALTIME-SYNC] Customer service update received:', payload);
          setLastSync(new Date());
          setSyncCount(prev => prev + 1);
          setIsConnected(true);
          onSyncUpdate?.('customer_service', payload);
        });

        const unsubscribeQuiz = subscribeToModuleUpdates('quiz', (payload) => {
          if (!mounted) return;
          
          console.log('🎯 [REALTIME-SYNC] Quiz update received:', payload);
          setLastSync(new Date());
          setSyncCount(prev => prev + 1);
          setIsConnected(true);
          onSyncUpdate?.('quiz', payload);
        });

        const unsubscribeQuizAnalytics = subscribeToModuleUpdates('quiz_analytics', (payload) => {
          if (!mounted) return;
          
          console.log('📊 [REALTIME-SYNC] Quiz analytics update received:', payload);
          setLastSync(new Date());
          setSyncCount(prev => prev + 1);
          setIsConnected(true);
          onSyncUpdate?.('quiz_analytics', payload);
        });

        // Cleanup function
        return () => {
          mounted = false;
          channels.forEach(channel => {
            try {
              channel.unsubscribe();
            } catch (error) {
              console.warn('Error unsubscribing channel:', error);
            }
          });
          unsubscribeConversations();
          unsubscribeCustomerService();
          unsubscribeQuiz();
          unsubscribeQuizAnalytics();
        };
        
      } catch (error) {
        console.error('❌ [REALTIME-SYNC] Initialization error:', error);
        setConnectionError(error.message);
        setIsConnected(false);
        
        // Retry connection after delay
        if (retryCount < 3) {
          setTimeout(() => {
            if (mounted) {
              setRetryCount(prev => prev + 1);
              initializeConnection();
            }
          }, 2000 * (retryCount + 1)); // Exponential backoff
        }
      }
    };

    // Initialize connection
    const cleanup = initializeConnection();

    return () => {
      cleanup.then(cleanupFn => {
        if (cleanupFn) cleanupFn();
      }).catch(console.error);
    };
  }, [onSyncUpdate]);

  // Periodic connection health check
  useEffect(() => {
    const healthCheckInterval = setInterval(async () => {
      try {
        const { error } = await supabase
          .from('customer_conversations')
          .select('id')
          .limit(1);
        
        if (error) {
          console.warn('⚠️ [REALTIME-SYNC] Health check failed:', error);
          setIsConnected(false);
          setConnectionError(error.message);
        } else if (!isConnected) {
          // If health check passes but we're marked as disconnected, try to reconnect
          console.log('🔄 [REALTIME-SYNC] Health check passed, attempting reconnection');
          setIsConnected(true);
          setConnectionError(null);
        }
      } catch (error) {
        console.error('❌ [REALTIME-SYNC] Health check error:', error);
        setIsConnected(false);
        setConnectionError(error.message);
      }
    }, 10000); // Check every 10 seconds

    return () => clearInterval(healthCheckInterval);
  }, [isConnected]);
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors ${
      isConnected 
        ? 'bg-green-100 text-green-700' 
        : 'bg-red-100 text-red-700'
    }`}>
      {isConnected ? (
        <>
          <Wifi className="w-4 h-4 text-green-500" />
          <span>Sync Active</span>
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-red-500" />
          <span>Disconnected</span>
          {retryCount > 0 && (
            <span className="text-xs">({retryCount}/3)</span>
          )}
        </>
      )}
      
      {lastSync && (
        <span className={`ml-2 text-xs ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
          {lastSync.toLocaleTimeString()}
        </span>
      )}
      
      {syncCount > 0 && (
        <span className={`ml-1 text-xs ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
          ({syncCount})
        </span>
      )}
      
      {connectionError && (
        <span className="ml-1 text-xs text-red-600" title={connectionError}>
          ⚠️
        </span>
      )}
    </div>
  );
};

export default RealTimeSync;