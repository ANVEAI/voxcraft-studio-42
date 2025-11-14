import { createClient } from '@supabase/supabase-js';

// Types for async processing notifications
export interface ProcessingNotification {
  userId: string;
  recordId: string;
  status: 'completed' | 'failed' | 'processing';
  pagesProcessed?: number;
  sizeKB?: number;
  websiteUrl?: string;
  error?: string;
  timestamp: string;
}

export interface AsyncProcessingManager {
  subscribeToProcessingUpdates: (userId: string, onUpdate: (notification: ProcessingNotification) => void) => () => void;
  checkProcessingStatus: (recordId: string) => Promise<{
    processingStatus: string;
    knowledgeBaseReady: boolean;
    structuredData?: any;
  }>;
  downloadKnowledgeBase: (recordId: string) => Promise<string>;
}

export function createAsyncProcessingManager(supabaseUrl: string, supabaseKey: string): AsyncProcessingManager {
  const supabase = createClient(supabaseUrl, supabaseKey);

  return {
    // Subscribe to real-time processing updates
    subscribeToProcessingUpdates: (userId: string, onUpdate: (notification: ProcessingNotification) => void) => {
      console.log(`📡 Subscribing to processing updates for user: ${userId}`);
      
      const channel = supabase
        .channel('processing_updates')
        .on('broadcast', { event: 'processing_complete' }, (payload) => {
          const notification = payload.payload as ProcessingNotification;
          
          // Only handle notifications for this user
          if (notification.userId === userId) {
            console.log('📨 Processing notification received:', notification);
            onUpdate(notification);
          }
        })
        .subscribe();

      // Return unsubscribe function
      return () => {
        console.log('📡 Unsubscribing from processing updates');
        supabase.removeChannel(channel);
      };
    },

    // Check current processing status
    checkProcessingStatus: async (recordId: string) => {
      const { data, error } = await supabase
        .from('scraped_websites')
        .select('processing_status, structured_data, knowledge_base_content')
        .eq('id', recordId)
        .single();

      if (error) {
        throw new Error(`Failed to check processing status: ${error.message}`);
      }

      return {
        processingStatus: data?.processing_status || 'pending',
        knowledgeBaseReady: data?.processing_status === 'completed',
        structuredData: data?.structured_data
      };
    },

    // Download knowledge base content
    downloadKnowledgeBase: async (recordId: string) => {
      const { data, error } = await supabase
        .from('scraped_websites')
        .select('knowledge_base_content, url')
        .eq('id', recordId)
        .single();

      if (error) {
        throw new Error(`Failed to get knowledge base: ${error.message}`);
      }

      if (!data?.knowledge_base_content) {
        throw new Error('Knowledge base not ready yet');
      }

      return data.knowledge_base_content;
    }
  };
}

// UI Helper functions for notifications
export function showProcessingNotification(notification: ProcessingNotification) {
  const { status, websiteUrl, pagesProcessed, error } = notification;
  
  switch (status) {
    case 'completed':
      return {
        type: 'success',
        title: 'Knowledge Base Ready! 🎉',
        message: `Successfully processed ${pagesProcessed} pages for ${websiteUrl}`,
        action: 'Download Knowledge Base'
      };
      
    case 'failed':
      return {
        type: 'error',
        title: 'Processing Failed ❌',
        message: `Failed to process ${websiteUrl}: ${error}`,
        action: 'Retry Processing'
      };
      
    case 'processing':
      return {
        type: 'info',
        title: 'Processing in Progress... ⚙️',
        message: `AI is enhancing the knowledge base for ${websiteUrl}`,
        action: null
      };
      
    default:
      return {
        type: 'info',
        title: 'Processing Update',
        message: `Status update for ${websiteUrl}`,
        action: null
      };
  }
}

// Polling fallback for environments without WebSocket support
export async function pollProcessingStatus(
  recordId: string, 
  checkStatus: (recordId: string) => Promise<any>,
  onUpdate: (status: any) => void,
  intervalMs: number = 5000,
  maxAttempts: number = 60 // 5 minutes max
): Promise<void> {
  let attempts = 0;
  
  const poll = async () => {
    try {
      attempts++;
      const status = await checkStatus(recordId);
      
      onUpdate(status);
      
      // Stop polling if completed or failed, or max attempts reached
      if (status.knowledgeBaseReady || status.processingStatus === 'failed' || attempts >= maxAttempts) {
        console.log(`📊 Polling stopped: ${status.processingStatus} (${attempts} attempts)`);
        return;
      }
      
      // Continue polling
      setTimeout(poll, intervalMs);
      
    } catch (error) {
      console.error('⚠️ Polling error:', error);
      
      // Retry up to max attempts
      if (attempts < maxAttempts) {
        setTimeout(poll, intervalMs);
      }
    }
  };
  
  // Start polling
  poll();
}

// Example usage for React components
export const useAsyncProcessing = (supabaseUrl: string, supabaseKey: string, userId: string) => {
  const manager = createAsyncProcessingManager(supabaseUrl, supabaseKey);
  
  return {
    // Subscribe to notifications
    subscribeToUpdates: (onUpdate: (notification: ProcessingNotification) => void) => {
      return manager.subscribeToProcessingUpdates(userId, onUpdate);
    },
    
    // Check status
    checkStatus: (recordId: string) => {
      return manager.checkProcessingStatus(recordId);
    },
    
    // Download result
    downloadKnowledgeBase: (recordId: string) => {
      return manager.downloadKnowledgeBase(recordId);
    },
    
    // Start polling as fallback
    startPolling: (recordId: string, onUpdate: (status: any) => void) => {
      return pollProcessingStatus(recordId, manager.checkProcessingStatus, onUpdate);
    }
  };
};
