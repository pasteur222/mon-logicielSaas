/**
 * Message Queue System for Performance Optimization
 * Implements message queuing and batch processing for real-time sync
 */

import { supabase } from './supabase';

export interface QueuedMessage {
  id: string;
  phone_number: string;
  content: string;
  sender: 'user' | 'bot';
  message_type: 'text' | 'image' | 'document' | 'audio';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  retry_count: number;
  max_retries: number;
  scheduled_at: string;
  created_at: string;
  metadata?: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
}

export interface BatchProcessingConfig {
  batchSize: number;
  processingInterval: number;
  maxConcurrentBatches: number;
  retryDelay: number;
  priorityWeights: Record<string, number>;
}

export interface QueueMetrics {
  pending_count: number;
  processing_count: number;
  completed_count: number;
  failed_count: number;
  avg_processing_time: number;
  throughput_per_minute: number;
}

const DEFAULT_CONFIG: BatchProcessingConfig = {
  batchSize: 10,
  processingInterval: 1000, // 1 second
  maxConcurrentBatches: 3,
  retryDelay: 5000, // 5 seconds
  priorityWeights: {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1
  }
};

class MessageQueue {
  private config: BatchProcessingConfig;
  private isProcessing = false;
  private activeBatches = 0;
  private processingInterval: NodeJS.Timeout | null = null;
  private metrics: QueueMetrics = {
    pending_count: 0,
    processing_count: 0,
    completed_count: 0,
    failed_count: 0,
    avg_processing_time: 0,
    throughput_per_minute: 0
  };

  constructor(config: Partial<BatchProcessingConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Add message to queue
   */
  async enqueue(
    phoneNumber: string,
    content: string,
    sender: 'user' | 'bot',
    priority: QueuedMessage['priority'] = 'normal',
    messageType: QueuedMessage['message_type'] = 'text',
    metadata?: Record<string, any>,
    scheduledAt?: Date
  ): Promise<string> {
    try {
      const messageId = crypto.randomUUID();
      const now = new Date().toISOString();

      const queuedMessage: Partial<QueuedMessage> = {
        id: messageId,
        phone_number: phoneNumber,
        content,
        sender,
        message_type: messageType,
        priority,
        retry_count: 0,
        max_retries: 3,
        scheduled_at: scheduledAt?.toISOString() || now,
        created_at: now,
        metadata,
        status: 'pending'
      };

      const { error } = await supabase
        .from('message_queue')
        .insert(queuedMessage);

      if (error) {
        throw error;
      }

      console.log(`📨 [QUEUE] Message enqueued:`, {
        id: messageId,
        phoneNumber,
        priority,
        sender
      });

      // Start processing if not already running
      if (!this.isProcessing) {
        this.startProcessing();
      }

      return messageId;
    } catch (error) {
      console.error('Error enqueuing message:', error);
      throw error;
    }
  }

  /**
   * Start batch processing
   */
  startProcessing(): void {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    console.log('🚀 [QUEUE] Starting message queue processing');

    this.processingInterval = setInterval(async () => {
      if (this.activeBatches < this.config.maxConcurrentBatches) {
        await this.processBatch();
      }
    }, this.config.processingInterval);
  }

  /**
   * Stop batch processing
   */
  stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    this.isProcessing = false;
    console.log('⏹️ [QUEUE] Stopped message queue processing');
  }

  /**
   * Process a batch of messages
   */
  private async processBatch(): Promise<void> {
    if (this.activeBatches >= this.config.maxConcurrentBatches) {
      return;
    }

    this.activeBatches++;

    try {
      // Get next batch of messages ordered by priority and scheduled time
      const { data: messages, error } = await supabase
        .from('message_queue')
        .select('*')
        .eq('status', 'pending')
        .lte('scheduled_at', new Date().toISOString())
        .order('priority', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(this.config.batchSize);

      if (error) {
        console.error('Error fetching batch:', error);
        return;
      }

      if (!messages || messages.length === 0) {
        return;
      }

      console.log(`⚡ [QUEUE] Processing batch of ${messages.length} messages`);

      // Mark messages as processing
      const messageIds = messages.map(m => m.id);
      await supabase
        .from('message_queue')
        .update({ status: 'processing' })
        .in('id', messageIds);

      // Process messages in parallel with controlled concurrency
      const processingPromises = messages.map(message => 
        this.processMessage(message).catch(error => {
          console.error(`Error processing message ${message.id}:`, error);
          return { success: false, error };
        })
      );

      const results = await Promise.allSettled(processingPromises);

      // Update message statuses based on results
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const message = messages[i];

        if (result.status === 'fulfilled' && result.value.success) {
          await this.markMessageCompleted(message.id);
        } else {
          await this.handleMessageFailure(message);
        }
      }

      // Update metrics
      await this.updateMetrics();

    } catch (error) {
      console.error('Error processing batch:', error);
    } finally {
      this.activeBatches--;
    }
  }

  /**
   * Process individual message
   */
  private async processMessage(message: QueuedMessage): Promise<{ success: boolean; error?: any }> {
    const startTime = Date.now();

    try {
      if (message.sender === 'user') {
        // Process incoming user message
        await this.processIncomingMessage(message);
      } else {
        // Send outgoing bot message
        await this.sendOutgoingMessage(message);
      }

      const processingTime = Date.now() - startTime;
      console.log(`✅ [QUEUE] Message processed successfully:`, {
        id: message.id,
        phoneNumber: message.phone_number,
        processingTime: `${processingTime}ms`
      });

      return { success: true };
    } catch (error) {
      console.error(`❌ [QUEUE] Message processing failed:`, {
        id: message.id,
        error: error.message
      });
      return { success: false, error };
    }
  }

  /**
   * Process incoming user message
   */
  private async processIncomingMessage(message: QueuedMessage): Promise<void> {
    // Store message in database
    await supabase
      .from('whatsapp_messages')
      .insert({
        phone_number: message.phone_number,
        content: message.content,
        sender: message.sender,
        message_type: message.message_type,
        metadata: message.metadata,
        created_at: message.created_at
      });

    // Process with AI if needed
    if (message.metadata?.requiresAI) {
      const { processWhatsAppMessage } = await import('./whatsapp-handler');
      await processWhatsAppMessage({
        phoneNumber: message.phone_number,
        content: message.content,
        sender: message.sender,
        source: 'whatsapp'
      });
    }
  }

  /**
   * Send outgoing bot message
   */
  private async sendOutgoingMessage(message: QueuedMessage): Promise<void> {
    const { sendWhatsAppMessage } = await import('./whatsapp');
    
    await sendWhatsAppMessage(
      message.phone_number,
      message.content,
      message.message_type
    );

    // Store sent message in database
    await supabase
      .from('whatsapp_messages')
      .insert({
        phone_number: message.phone_number,
        content: message.content,
        sender: message.sender,
        message_type: message.message_type,
        metadata: message.metadata,
        created_at: new Date().toISOString()
      });
  }

  /**
   * Mark message as completed
   */
  private async markMessageCompleted(messageId: string): Promise<void> {
    await supabase
      .from('message_queue')
      .update({ 
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', messageId);
  }

  /**
   * Handle message processing failure
   */
  private async handleMessageFailure(message: QueuedMessage): Promise<void> {
    const newRetryCount = message.retry_count + 1;

    if (newRetryCount <= message.max_retries) {
      // Schedule retry with exponential backoff
      const retryDelay = this.config.retryDelay * Math.pow(2, newRetryCount - 1);
      const scheduledAt = new Date(Date.now() + retryDelay);

      await supabase
        .from('message_queue')
        .update({
          status: 'pending',
          retry_count: newRetryCount,
          scheduled_at: scheduledAt.toISOString()
        })
        .eq('id', message.id);

      console.log(`🔄 [QUEUE] Message scheduled for retry:`, {
        id: message.id,
        retryCount: newRetryCount,
        scheduledAt: scheduledAt.toISOString()
      });
    } else {
      // Mark as failed after max retries
      await supabase
        .from('message_queue')
        .update({ 
          status: 'failed',
          failed_at: new Date().toISOString()
        })
        .eq('id', message.id);

      console.error(`💀 [QUEUE] Message failed after max retries:`, {
        id: message.id,
        maxRetries: message.max_retries
      });
    }
  }

  /**
   * Update queue metrics
   */
  private async updateMetrics(): Promise<void> {
    try {
      const { data: stats, error } = await supabase
        .from('message_queue')
        .select('status, created_at, completed_at')
        .gte('created_at', new Date(Date.now() - 60000).toISOString()); // Last minute

      if (error || !stats) {
        return;
      }

      const statusCounts = stats.reduce((acc, msg) => {
        acc[msg.status] = (acc[msg.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Calculate average processing time
      const completedMessages = stats.filter(msg => 
        msg.status === 'completed' && msg.completed_at
      );

      let avgProcessingTime = 0;
      if (completedMessages.length > 0) {
        const totalProcessingTime = completedMessages.reduce((sum, msg) => {
          return sum + (new Date(msg.completed_at).getTime() - new Date(msg.created_at).getTime());
        }, 0);
        avgProcessingTime = totalProcessingTime / completedMessages.length;
      }

      this.metrics = {
        pending_count: statusCounts.pending || 0,
        processing_count: statusCounts.processing || 0,
        completed_count: statusCounts.completed || 0,
        failed_count: statusCounts.failed || 0,
        avg_processing_time: Math.round(avgProcessingTime),
        throughput_per_minute: completedMessages.length
      };
    } catch (error) {
      console.error('Error updating metrics:', error);
    }
  }

  /**
   * Get current queue metrics
   */
  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  /**
   * Get queue status
   */
  async getQueueStatus(): Promise<{
    isProcessing: boolean;
    activeBatches: number;
    metrics: QueueMetrics;
    config: BatchProcessingConfig;
  }> {
    await this.updateMetrics();
    
    return {
      isProcessing: this.isProcessing,
      activeBatches: this.activeBatches,
      metrics: this.metrics,
      config: this.config
    };
  }

  /**
   * Clear completed and failed messages older than specified days
   */
  async cleanup(daysToKeep: number = 7): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const { error } = await supabase
      .from('message_queue')
      .delete()
      .in('status', ['completed', 'failed'])
      .lt('created_at', cutoffDate.toISOString());

    if (error) {
      console.error('Error cleaning up message queue:', error);
    } else {
      console.log(`✅ [QUEUE] Cleaned up messages older than ${daysToKeep} days`);
    }
  }
}

// Export singleton instance
export const messageQueue = new MessageQueue();

// Auto-start processing
messageQueue.startProcessing();

// Cleanup old messages daily
setInterval(() => {
  messageQueue.cleanup();
}, 24 * 60 * 60 * 1000); // 24 hours