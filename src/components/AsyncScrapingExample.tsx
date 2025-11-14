import React, { useState, useEffect } from 'react';
import { useAsyncProcessing, ProcessingNotification, showProcessingNotification } from '../utils/asyncProcessingNotifications';

interface AsyncScrapingExampleProps {
  supabaseUrl: string;
  supabaseKey: string;
  userId: string;
}

export const AsyncScrapingExample: React.FC<AsyncScrapingExampleProps> = ({
  supabaseUrl,
  supabaseKey,
  userId
}) => {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentJob, setCurrentJob] = useState<{
    recordId: string;
    status: string;
    processingStatus?: string;
  } | null>(null);
  const [notifications, setNotifications] = useState<ProcessingNotification[]>([]);
  const [knowledgeBase, setKnowledgeBase] = useState<string | null>(null);

  const asyncProcessing = useAsyncProcessing(supabaseUrl, supabaseKey, userId);

  // Subscribe to processing notifications
  useEffect(() => {
    const unsubscribe = asyncProcessing.subscribeToUpdates((notification) => {
      console.log('📨 Received notification:', notification);
      
      // Add to notifications list
      setNotifications(prev => [notification, ...prev.slice(0, 4)]); // Keep last 5
      
      // Update current job if it matches
      if (currentJob && notification.recordId === currentJob.recordId) {
        setCurrentJob(prev => prev ? {
          ...prev,
          processingStatus: notification.status
        } : null);
        
        // If completed, we can download the knowledge base
        if (notification.status === 'completed') {
          setIsLoading(false);
        }
      }
    });

    return unsubscribe;
  }, [currentJob?.recordId]);

  const handleScrapeWebsite = async () => {
    if (!url) return;

    setIsLoading(true);
    setCurrentJob(null);
    setKnowledgeBase(null);

    try {
      // Start scraping
      const response = await fetch(`${supabaseUrl}/functions/v1/scrape-website`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, userId })
      });

      const result = await response.json();
      
      if (result.success) {
        setCurrentJob({
          recordId: result.recordId,
          status: result.status,
          processingStatus: 'pending'
        });
        
        // Start polling for scraping status
        pollScrapingStatus(result.jobId, result.recordId);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('Scraping error:', error);
      setIsLoading(false);
      alert(`Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const pollScrapingStatus = async (jobId: string, recordId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/check-scrape-status`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ jobId, recordId, userId })
        });

        const result = await response.json();
        
        if (result.success) {
          setCurrentJob(prev => prev ? {
            ...prev,
            status: result.status,
            processingStatus: result.processingStatus
          } : null);

          // If scraping completed, check if knowledge base is ready
          if (result.status === 'completed') {
            if (result.knowledgeBaseReady) {
              setIsLoading(false);
              console.log('✅ Knowledge base ready!');
            } else {
              console.log('🔄 Scraping done, AI processing in background...');
              // Continue polling for processing completion via WebSocket
            }
            return; // Stop polling scraping status
          }
          
          // If still scraping, continue polling
          if (result.status === 'scraping') {
            setTimeout(checkStatus, 3000); // Poll every 3 seconds
          } else if (result.status === 'failed') {
            setIsLoading(false);
            alert('Scraping failed: ' + (result.error || 'Unknown error'));
          }
        }
      } catch (error) {
        console.error('Status check error:', error);
        setTimeout(checkStatus, 5000); // Retry in 5 seconds
      }
    };

    checkStatus();
  };

  const handleDownloadKnowledgeBase = async () => {
    if (!currentJob?.recordId) return;

    try {
      const content = await asyncProcessing.downloadKnowledgeBase(currentJob.recordId);
      setKnowledgeBase(content);
      
      // Create download
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `knowledge_base_${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      alert(`Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const getStatusDisplay = () => {
    if (!currentJob) return null;

    const { status, processingStatus } = currentJob;
    
    if (status === 'scraping') {
      return {
        text: 'Scraping website...',
        color: 'text-blue-600',
        icon: '🕷️'
      };
    } else if (status === 'scraped' || status === 'completed') {
      if (processingStatus === 'pending') {
        return {
          text: 'Scraping complete! AI processing starting...',
          color: 'text-yellow-600',
          icon: '⚙️'
        };
      } else if (processingStatus === 'processing') {
        return {
          text: 'AI enhancing knowledge base...',
          color: 'text-purple-600',
          icon: '🧠'
        };
      } else if (processingStatus === 'completed') {
        return {
          text: 'Knowledge base ready!',
          color: 'text-green-600',
          icon: '✅'
        };
      } else if (processingStatus === 'failed') {
        return {
          text: 'AI processing failed',
          color: 'text-red-600',
          icon: '❌'
        };
      }
    } else if (status === 'failed') {
      return {
        text: 'Scraping failed',
        color: 'text-red-600',
        icon: '❌'
      };
    }

    return null;
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-6">Async Website Scraper</h2>
      
      {/* URL Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Website URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            onClick={handleScrapeWebsite}
            disabled={isLoading || !url}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Scrape'}
          </button>
        </div>
      </div>

      {/* Status Display */}
      {statusDisplay && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <div className={`flex items-center gap-2 ${statusDisplay.color}`}>
            <span className="text-xl">{statusDisplay.icon}</span>
            <span className="font-medium">{statusDisplay.text}</span>
          </div>
          
          {currentJob?.processingStatus === 'completed' && (
            <button
              onClick={handleDownloadKnowledgeBase}
              className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              📥 Download Knowledge Base
            </button>
          )}
        </div>
      )}

      {/* Notifications */}
      {notifications.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Recent Notifications</h3>
          <div className="space-y-2">
            {notifications.map((notification, index) => {
              const display = showProcessingNotification(notification);
              return (
                <div
                  key={`${notification.recordId}-${index}`}
                  className={`p-3 rounded-lg border-l-4 ${
                    display.type === 'success' ? 'bg-green-50 border-green-500' :
                    display.type === 'error' ? 'bg-red-50 border-red-500' :
                    'bg-blue-50 border-blue-500'
                  }`}
                >
                  <div className="font-medium">{display.title}</div>
                  <div className="text-sm text-gray-600">{display.message}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(notification.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Knowledge Base Preview */}
      {knowledgeBase && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Knowledge Base Preview</h3>
          <pre className="bg-gray-100 p-4 rounded-lg text-sm overflow-auto max-h-96">
            {knowledgeBase.substring(0, 1000)}
            {knowledgeBase.length > 1000 && '\n... (truncated)'}
          </pre>
        </div>
      )}

      {/* Instructions */}
      <div className="text-sm text-gray-600">
        <h4 className="font-medium mb-2">How it works:</h4>
        <ol className="list-decimal list-inside space-y-1">
          <li>Enter a website URL and click "Scrape"</li>
          <li>Scraping completes in ~30 seconds (immediate feedback)</li>
          <li>AI processing happens in background (2-5 minutes)</li>
          <li>Get notified when knowledge base is ready</li>
          <li>Download the enhanced knowledge base</li>
        </ol>
      </div>
    </div>
  );
};
