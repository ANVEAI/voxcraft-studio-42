import { useAuth, UserButton, useUser } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, FileText, Settings, BarChart3, Bot, Trash2, Mic } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'

const Dashboard = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [assistants, setAssistants] = useState([])
  const [loading, setLoading] = useState(true)
  const [documentsCount, setDocumentsCount] = useState(0)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate('/auth')
    } else if (isLoaded && isSignedIn && user) {
      fetchAssistants()
      fetchDocumentsCount()
    }
  }, [isLoaded, isSignedIn, navigate, user])

  const fetchAssistants = async () => {
    if (!user?.id || !getToken) return;
    
    try {
      setLoading(true)
      
      // Get Clerk JWT token for authentication
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      console.log('🔑 Using token for get-assistants:', token.substring(0, 50) + '...')

      // Use the get-assistants edge function with proper authentication
      const { data, error } = await supabase.functions.invoke('get-assistants', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (error) {
        console.error('Error fetching assistants:', error)
        toast({
          title: "Error",
          description: "Failed to load your assistants.",
          variant: "destructive",
        })
      } else if (data?.success) {
        setAssistants(data.assistants || [])
        console.log('Fetched assistants:', data.assistants)
      } else {
        console.error('Unexpected response:', data)
        setAssistants([])
      }
    } catch (error) {
      console.error('Error:', error)
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchDocumentsCount = async () => {
    if (!user?.id || !getToken) return;
    
    try {
      // Get Clerk JWT token for authentication
      const token = await getToken()
      if (!token) {
        throw new Error('No authentication token available')
      }

      console.log('🔑 Using token for vapi-list-files:', token.substring(0, 50) + '...')

      // Fetch files directly from VAPI API via our edge function
      const { data, error } = await supabase.functions.invoke('vapi-list-files', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })

      if (error) {
        console.error('Error fetching documents from VAPI:', error)
        // Fallback to local database count
        const { count, error: dbError } = await supabase
          .from('assistant_files')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        
        if (!dbError) {
          setDocumentsCount(count || 0)
        }
      } else if (data?.success) {
        setDocumentsCount(data.count || 0)
        console.log('📁 Documents count from VAPI:', data.count)
      }
    } catch (error) {
      console.error('Error fetching documents:', error)
    }
  }

  // Don't render anything until Clerk is loaded
  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">VoiceAI Platform</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user?.firstName || 'User'}!</span>
              <UserButton afterSignOutUrl="/auth" />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Dashboard</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card 
              className="hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate('/create-assistant')}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Create Assistant</CardTitle>
                <Plus className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">New</div>
                <p className="text-xs text-muted-foreground">Build a voice assistant</p>
              </CardContent>
            </Card>


            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Assistants</CardTitle>
                <Bot className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{assistants.length}</div>
                <p className="text-xs text-muted-foreground">Created assistants</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Analytics</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{assistants.reduce((sum, assistant) => {
                  // Mock calculation based on assistant count
                  return sum + Math.floor(Math.random() * 50) + 10
                }, 0)}</div>
                <p className="text-xs text-muted-foreground">
                  <Button 
                    variant="link" 
                    className="p-0 h-auto text-xs"
                    onClick={() => navigate('/analytics')}
                  >
                    View detailed analytics →
                  </Button>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Assistants List */}
        {assistants.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Your Voice Assistants</CardTitle>
              <CardDescription>
                Manage and deploy your created assistants
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Desktop Table View */}
              <div className="hidden lg:block">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4 font-medium">Bot Name</th>
                        <th className="text-left py-3 px-4 font-medium">Assistant ID</th>
                        <th className="text-left py-3 px-4 font-medium">Created At</th>
                        <th className="text-left py-3 px-4 font-medium">Status</th>
                        <th className="text-left py-3 px-4 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assistants.map((assistant) => (
                        <tr key={assistant.id} className="border-b hover:bg-gray-50">
                          <td className="py-4 px-4">
                            <div>
                              <div className="font-medium">{assistant.name}</div>
                              <div className="text-sm text-gray-500">{assistant.welcome_message.substring(0, 50)}...</div>
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm font-mono text-gray-600">
                              {assistant.vapi_assistant_id}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="text-sm text-gray-600">
                              {new Date(assistant.created_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className={`inline-flex px-2 py-1 rounded text-xs ${
                              assistant.status === 'active' ? 'bg-green-100 text-green-800' :
                              assistant.status === 'creating' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-red-100 text-red-800'
                            }`}>
                              {assistant.status}
                            </div>
                          </td>
                          <td className="py-4 px-4">
                            <div className="flex space-x-2">
                               <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                const embedCode = `<script>
// Universal Voice Navigation Embed Script - Simplified & Fixed
// Add this script to any website to enable voice navigation
(function() {
  'use strict';
  
  // Configuration - Replace with your Vapi credentials
  const VAPI_CONFIG = {
    assistant: "${assistant.vapi_assistant_id}", // Replace with your assistant ID
    apiKey: "${import.meta.env.VITE_VAPI_PUBLIC_KEY}",     // Replace with your API key
    position: "${assistant.position === 'left' ? 'bottom-left' : 'bottom-right'}",
    theme: "${assistant.theme}",
    mode: "voice"
  };

  class UniversalVoiceNavigator {
    constructor() {
      this.vapiWidget = null;
      this.isInitialized = false;
      this.currentPageElements = [];
      this.statusEl = null;
      this.navigationInProgress = false;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 3;
      
      // Simple speech tracking
      this.callActive = false;
      this.assistantSpeaking = false;
      this.lastProcessedTranscript = '';
      
      // Session persistence
      this.sessionId = 'voice_' + Date.now();
      
      this.init();
    }

    init() {
      console.log('🎤 Initializing Universal Voice Navigator...');
      this.createStatusIndicator();
      this.updateStatus("Loading voice navigation...");
      this.loadVapiSDK();
      this.analyzePageContent();
      this.setupNavigationHandling();
      
      // Check for session restoration
      setTimeout(() => {
        this.checkForSessionRestore();
      }, 1500);
    }

    createStatusIndicator() {
      if (this.statusEl) return;
      
      this.statusEl = document.createElement('div');
      this.statusEl.id = 'voice-nav-status';
      this.statusEl.style.cssText = \`
        position: fixed;
        \${VAPI_CONFIG.position.includes('left') ? 'left: 20px;' : 'right: 20px;'}
        bottom: 80px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        max-width: 200px;
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: none;
      \`;
      document.body.appendChild(this.statusEl);
    }

    updateStatus(message, type = 'info') {
      if (!this.statusEl) return;
      
      this.statusEl.textContent = message;
      this.statusEl.style.opacity = '1';
      
      const colors = {
        info: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        success: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        warning: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        error: 'linear-gradient(135deg, #ff4b1f 0%, #ff9068 100%)'
      };
      
      this.statusEl.style.background = colors[type] || colors.info;
      
      // Auto-hide after 3 seconds for non-error messages
      if (type !== 'error') {
        setTimeout(() => {
          if (this.statusEl) {
            this.statusEl.style.opacity = '0';
          }
        }, 3000);
      }
    }

    loadVapiSDK() {
      if (window.Vapi) {
        this.initializeVapi();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest';
      script.onload = () => {
        console.log('✅ Vapi SDK loaded');
        this.initializeVapi();
      };
      script.onerror = () => {
        console.error('❌ Failed to load Vapi SDK');
        this.updateStatus('Failed to load voice system', 'error');
      };
      document.head.appendChild(script);
    }

    initializeVapi() {
      try {
        this.vapiWidget = new window.Vapi(VAPI_CONFIG.apiKey);
        this.setupVapiEvents();
        this.updateStatus('Voice navigation ready! 🎤', 'success');
        this.isInitialized = true;
        
        // Create the floating button
        this.createFloatingButton();
        
      } catch (error) {
        console.error('❌ Failed to initialize Vapi:', error);
        this.updateStatus('Voice system error', 'error');
      }
    }

    createFloatingButton() {
      if (document.getElementById('voice-nav-button')) return;
      
      const button = document.createElement('div');
      button.id = 'voice-nav-button';
      button.innerHTML = '🎤';
      button.style.cssText = \`
        position: fixed;
        \${VAPI_CONFIG.position.includes('left') ? 'left: 20px;' : 'right: 20px;'}
        bottom: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: all 0.3s ease;
        user-select: none;
      \`;
      
      button.addEventListener('click', () => this.toggleVoiceCall());
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.1)';
        button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      });
      
      document.body.appendChild(button);
    }

    toggleVoiceCall() {
      if (!this.isInitialized) {
        this.updateStatus('Voice system not ready', 'warning');
        return;
      }
      
      if (this.callActive) {
        this.vapiWidget.stop();
      } else {
        this.startVoiceCall();
      }
    }

    startVoiceCall() {
      try {
        this.vapiWidget.start(VAPI_CONFIG.assistant);
        this.updateStatus('Starting voice call...', 'info');
      } catch (error) {
        console.error('❌ Failed to start voice call:', error);
        this.updateStatus('Failed to start call', 'error');
      }
    }

    setupVapiEvents() {
      this.vapiWidget.on('call-start', () => {
        console.log('📞 Call started');
        this.callActive = true;
        this.updateStatus('Call active - speak now! 🎤', 'success');
        this.updateButtonState(true);
      });

      this.vapiWidget.on('call-end', () => {
        console.log('📞 Call ended');
        this.callActive = false;
        this.assistantSpeaking = false;
        this.updateStatus('Call ended', 'info');
        this.updateButtonState(false);
      });

      this.vapiWidget.on('speech-start', () => {
        console.log('🗣️ User started speaking');
        this.updateStatus('Listening... 👂', 'info');
      });

      this.vapiWidget.on('speech-end', () => {
        console.log('🔇 User stopped speaking');
        this.updateStatus('Processing...', 'info');
      });

      this.vapiWidget.on('message', (message) => {
        console.log('💬 Message received:', message);
        
        if (message.type === 'transcript' && message.transcript) {
          this.processVoiceTranscript(message.transcript);
        }
      });

      this.vapiWidget.on('error', (error) => {
        console.error('❌ Vapi error:', error);
        this.updateStatus('Voice error occurred', 'error');
        this.callActive = false;
        this.updateButtonState(false);
      });
    }

    updateButtonState(active) {
      const button = document.getElementById('voice-nav-button');
      if (!button) return;
      
      if (active) {
        button.innerHTML = '🔴';
        button.style.background = 'linear-gradient(135deg, #ff4b1f 0%, #ff9068 100%)';
        button.style.animation = 'pulse 1.5s infinite';
      } else {
        button.innerHTML = '🎤';
        button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        button.style.animation = 'none';
      }
    }

    processVoiceTranscript(transcript) {
      const text = transcript.toLowerCase().trim();
      
      // Avoid processing the same transcript multiple times
      if (text === this.lastProcessedTranscript || text.length < 3) return;
      this.lastProcessedTranscript = text;
      
      console.log('🎯 Processing command:', text);
      
      // Enhanced command processing
      if (text.includes('scroll down') || text.includes('scroll down page')) {
        this.executeCommand('scroll', 'down');
      } else if (text.includes('scroll up') || text.includes('scroll up page')) {
        this.executeCommand('scroll', 'up');
      } else if (text.includes('go to top') || text.includes('top of page')) {
        this.executeCommand('scroll', 'top');
      } else if (text.includes('go to bottom') || text.includes('bottom of page')) {
        this.executeCommand('scroll', 'bottom');
      } else if (text.includes('refresh page') || text.includes('reload page')) {
        this.executeCommand('refresh');
      } else if (text.includes('go back') || text.includes('go back page')) {
        this.executeCommand('back');
      } else if (text.includes('click') || text.includes('press')) {
        this.handleClickCommand(text);
      } else if (text.includes('navigate to') || text.includes('go to')) {
        this.handleNavigationCommand(text);
      }
    }

    executeCommand(action, direction = null) {
      switch (action) {
        case 'scroll':
          this.handleScrollCommand(direction);
          break;
        case 'refresh':
          this.updateStatus('Refreshing page...', 'info');
          setTimeout(() => window.location.reload(), 1000);
          break;
        case 'back':
          this.updateStatus('Going back...', 'info');
          setTimeout(() => window.history.back(), 500);
          break;
      }
    }

    handleScrollCommand(direction) {
      const scrollAmount = window.innerHeight * 0.8;
      
      switch (direction) {
        case 'down':
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          this.updateStatus('Scrolling down ⬇️', 'success');
          break;
        case 'up':
          window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
          this.updateStatus('Scrolling up ⬆️', 'success');
          break;
        case 'top':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          this.updateStatus('Going to top ⬆️', 'success');
          break;
        case 'bottom':
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          this.updateStatus('Going to bottom ⬇️', 'success');
          break;
      }
    }

    handleClickCommand(text) {
      // Extract what to click on
      const clickMatch = text.match(/click\\s+(?:on\\s+)?(.+)/);
      if (!clickMatch) return;
      
      const target = clickMatch[1].trim();
      this.findAndClickElement(target);
    }

    findAndClickElement(target) {
      const elements = this.currentPageElements;
      
      // Find element by text content or common attributes
      const element = elements.find(el => {
        const text = el.textContent.toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        
        return text.includes(target) || ariaLabel.includes(target) || title.includes(target);
      });
      
      if (element) {
        this.clickElementWithFeedback(element);
      } else {
        this.updateStatus(\`Could not find "\${target}"\`, 'warning');
      }
    }

    clickElementWithFeedback(element) {
      // Scroll to element
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setTimeout(() => {
        // Visual feedback
        const originalStyle = element.style.cssText;
        element.style.outline = '3px solid #667eea';
        element.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
        
        // Click after brief highlight
        setTimeout(() => {
          element.click();
          this.updateStatus('Clicked successfully! ✅', 'success');
          
          // Restore original style
          setTimeout(() => {
            element.style.cssText = originalStyle;
          }, 500);
        }, 300);
      }, 500);
    }

    analyzePageContent() {
      // Find clickable elements
      this.currentPageElements = Array.from(document.querySelectorAll(
        'a, button, [role="button"], [onclick], input[type="submit"], input[type="button"], .btn, [tabindex]'
      )).filter(el => {
        // Filter out hidden elements
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
      });
      
      console.log(\`🔍 Found \${this.currentPageElements.length} interactive elements\`);
    }

    setupNavigationHandling() {
      // Re-analyze page content when DOM changes
      const observer = new MutationObserver(() => {
        clearTimeout(this.analyzeTimeout);
        this.analyzeTimeout = setTimeout(() => {
          this.analyzePageContent();
        }, 500);
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    checkForSessionRestore() {
      // Simple session persistence could be added here
      console.log('🔄 Session check complete');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new UniversalVoiceNavigator();
    });
  } else {
    new UniversalVoiceNavigator();
  }

  // Add pulsing animation
  const style = document.createElement('style');
  style.textContent = \`
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
  \`;
  document.head.appendChild(style);

})();
</script>`
                                  navigator.clipboard.writeText(embedCode)
                                  toast({
                                    title: "Embed Code Copied!",
                                    description: "Paste this code into your website to add the voice assistant.",
                                  })
                                }}
                              >
                                Embed
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  toast({
                                    title: "Edit Assistant",
                                    description: "Feature coming soon!",
                                  })
                                }}
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button 
                                size="sm" 
                                className="bg-blue-600 hover:bg-blue-700"
                                onClick={() => {
                                  const demoUrl = `/voice-demo?assistant=${assistant.vapi_assistant_id}&name=${encodeURIComponent(assistant.name)}`
                                  window.open(demoUrl, '_blank')
                                }}
                              >
                                <Mic className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile/Tablet Card View */}
              <div className="lg:hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {assistants.map((assistant) => (
                  <Card key={assistant.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{assistant.name}</CardTitle>
                        <div className={`px-2 py-1 rounded text-xs ${
                          assistant.status === 'active' ? 'bg-green-100 text-green-800' :
                          assistant.status === 'creating' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {assistant.status}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-600 mb-3">{assistant.welcome_message}</p>
                      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                        <span>Voice: {assistant.voice_id}</span>
                        <span>Language: {assistant.language}</span>
                      </div>
                      <div className="text-xs text-gray-500 mb-3">
                        <span>VAPI ID: {assistant.vapi_assistant_id}</span>
                      </div>
                      <div className="flex flex-col space-y-2">
                        <div className="flex space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                             onClick={() => {
                               const embedCode = `<script>
// Universal Voice Navigation Embed Script - Simplified & Fixed
// Add this script to any website to enable voice navigation
(function() {
  'use strict';
  
  // Configuration - Replace with your Vapi credentials
  const VAPI_CONFIG = {
    assistant: "${assistant.vapi_assistant_id}", // Replace with your assistant ID
    apiKey: "${import.meta.env.VITE_VAPI_PUBLIC_KEY}",     // Replace with your API key
    position: "${assistant.position === 'left' ? 'bottom-left' : 'bottom-right'}",
    theme: "${assistant.theme}",
    mode: "voice"
  };

  class UniversalVoiceNavigator {
    constructor() {
      this.vapiWidget = null;
      this.isInitialized = false;
      this.currentPageElements = [];
      this.statusEl = null;
      this.navigationInProgress = false;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 3;
      
      // Simple speech tracking
      this.callActive = false;
      this.assistantSpeaking = false;
      this.lastProcessedTranscript = '';
      
      // Session persistence
      this.sessionId = 'voice_' + Date.now();
      
      this.init();
    }

    init() {
      console.log('🎤 Initializing Universal Voice Navigator...');
      this.createStatusIndicator();
      this.updateStatus("Loading voice navigation...");
      this.loadVapiSDK();
      this.analyzePageContent();
      this.setupNavigationHandling();
      
      // Check for session restoration
      setTimeout(() => {
        this.checkForSessionRestore();
      }, 1500);
    }

    createStatusIndicator() {
      if (this.statusEl) return;
      
      this.statusEl = document.createElement('div');
      this.statusEl.id = 'voice-nav-status';
      this.statusEl.style.cssText = \`
        position: fixed;
        \${VAPI_CONFIG.position.includes('left') ? 'left: 20px;' : 'right: 20px;'}
        bottom: 80px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 8px 12px;
        border-radius: 20px;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        max-width: 200px;
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: none;
      \`;
      document.body.appendChild(this.statusEl);
    }

    updateStatus(message, type = 'info') {
      if (!this.statusEl) return;
      
      this.statusEl.textContent = message;
      this.statusEl.style.opacity = '1';
      
      const colors = {
        info: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        success: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        warning: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        error: 'linear-gradient(135deg, #ff4b1f 0%, #ff9068 100%)'
      };
      
      this.statusEl.style.background = colors[type] || colors.info;
      
      // Auto-hide after 3 seconds for non-error messages
      if (type !== 'error') {
        setTimeout(() => {
          if (this.statusEl) {
            this.statusEl.style.opacity = '0';
          }
        }, 3000);
      }
    }

    loadVapiSDK() {
      if (window.Vapi) {
        this.initializeVapi();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@vapi-ai/web@latest';
      script.onload = () => {
        console.log('✅ Vapi SDK loaded');
        this.initializeVapi();
      };
      script.onerror = () => {
        console.error('❌ Failed to load Vapi SDK');
        this.updateStatus('Failed to load voice system', 'error');
      };
      document.head.appendChild(script);
    }

    initializeVapi() {
      try {
        this.vapiWidget = new window.Vapi(VAPI_CONFIG.apiKey);
        this.setupVapiEvents();
        this.updateStatus('Voice navigation ready! 🎤', 'success');
        this.isInitialized = true;
        
        // Create the floating button
        this.createFloatingButton();
        
      } catch (error) {
        console.error('❌ Failed to initialize Vapi:', error);
        this.updateStatus('Voice system error', 'error');
      }
    }

    createFloatingButton() {
      if (document.getElementById('voice-nav-button')) return;
      
      const button = document.createElement('div');
      button.id = 'voice-nav-button';
      button.innerHTML = '🎤';
      button.style.cssText = \`
        position: fixed;
        \${VAPI_CONFIG.position.includes('left') ? 'left: 20px;' : 'right: 20px;'}
        bottom: 20px;
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        transition: all 0.3s ease;
        user-select: none;
      \`;
      
      button.addEventListener('click', () => this.toggleVoiceCall());
      button.addEventListener('mouseenter', () => {
        button.style.transform = 'scale(1.1)';
        button.style.boxShadow = '0 6px 16px rgba(0,0,0,0.4)';
      });
      button.addEventListener('mouseleave', () => {
        button.style.transform = 'scale(1)';
        button.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
      });
      
      document.body.appendChild(button);
    }

    toggleVoiceCall() {
      if (!this.isInitialized) {
        this.updateStatus('Voice system not ready', 'warning');
        return;
      }
      
      if (this.callActive) {
        this.vapiWidget.stop();
      } else {
        this.startVoiceCall();
      }
    }

    startVoiceCall() {
      try {
        this.vapiWidget.start(VAPI_CONFIG.assistant);
        this.updateStatus('Starting voice call...', 'info');
      } catch (error) {
        console.error('❌ Failed to start voice call:', error);
        this.updateStatus('Failed to start call', 'error');
      }
    }

    setupVapiEvents() {
      this.vapiWidget.on('call-start', () => {
        console.log('📞 Call started');
        this.callActive = true;
        this.updateStatus('Call active - speak now! 🎤', 'success');
        this.updateButtonState(true);
      });

      this.vapiWidget.on('call-end', () => {
        console.log('📞 Call ended');
        this.callActive = false;
        this.assistantSpeaking = false;
        this.updateStatus('Call ended', 'info');
        this.updateButtonState(false);
      });

      this.vapiWidget.on('speech-start', () => {
        console.log('🗣️ User started speaking');
        this.updateStatus('Listening... 👂', 'info');
      });

      this.vapiWidget.on('speech-end', () => {
        console.log('🔇 User stopped speaking');
        this.updateStatus('Processing...', 'info');
      });

      this.vapiWidget.on('message', (message) => {
        console.log('💬 Message received:', message);
        
        if (message.type === 'transcript' && message.transcript) {
          this.processVoiceTranscript(message.transcript);
        }
      });

      this.vapiWidget.on('error', (error) => {
        console.error('❌ Vapi error:', error);
        this.updateStatus('Voice error occurred', 'error');
        this.callActive = false;
        this.updateButtonState(false);
      });
    }

    updateButtonState(active) {
      const button = document.getElementById('voice-nav-button');
      if (!button) return;
      
      if (active) {
        button.innerHTML = '🔴';
        button.style.background = 'linear-gradient(135deg, #ff4b1f 0%, #ff9068 100%)';
        button.style.animation = 'pulse 1.5s infinite';
      } else {
        button.innerHTML = '🎤';
        button.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        button.style.animation = 'none';
      }
    }

    processVoiceTranscript(transcript) {
      const text = transcript.toLowerCase().trim();
      
      // Avoid processing the same transcript multiple times
      if (text === this.lastProcessedTranscript || text.length < 3) return;
      this.lastProcessedTranscript = text;
      
      console.log('🎯 Processing command:', text);
      
      // Enhanced command processing
      if (text.includes('scroll down') || text.includes('scroll down page')) {
        this.executeCommand('scroll', 'down');
      } else if (text.includes('scroll up') || text.includes('scroll up page')) {
        this.executeCommand('scroll', 'up');
      } else if (text.includes('go to top') || text.includes('top of page')) {
        this.executeCommand('scroll', 'top');
      } else if (text.includes('go to bottom') || text.includes('bottom of page')) {
        this.executeCommand('scroll', 'bottom');
      } else if (text.includes('refresh page') || text.includes('reload page')) {
        this.executeCommand('refresh');
      } else if (text.includes('go back') || text.includes('go back page')) {
        this.executeCommand('back');
      } else if (text.includes('click') || text.includes('press')) {
        this.handleClickCommand(text);
      } else if (text.includes('navigate to') || text.includes('go to')) {
        this.handleNavigationCommand(text);
      }
    }

    executeCommand(action, direction = null) {
      switch (action) {
        case 'scroll':
          this.handleScrollCommand(direction);
          break;
        case 'refresh':
          this.updateStatus('Refreshing page...', 'info');
          setTimeout(() => window.location.reload(), 1000);
          break;
        case 'back':
          this.updateStatus('Going back...', 'info');
          setTimeout(() => window.history.back(), 500);
          break;
      }
    }

    handleScrollCommand(direction) {
      const scrollAmount = window.innerHeight * 0.8;
      
      switch (direction) {
        case 'down':
          window.scrollBy({ top: scrollAmount, behavior: 'smooth' });
          this.updateStatus('Scrolling down ⬇️', 'success');
          break;
        case 'up':
          window.scrollBy({ top: -scrollAmount, behavior: 'smooth' });
          this.updateStatus('Scrolling up ⬆️', 'success');
          break;
        case 'top':
          window.scrollTo({ top: 0, behavior: 'smooth' });
          this.updateStatus('Going to top ⬆️', 'success');
          break;
        case 'bottom':
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          this.updateStatus('Going to bottom ⬇️', 'success');
          break;
      }
    }

    handleClickCommand(text) {
      // Extract what to click on
      const clickMatch = text.match(/click\\s+(?:on\\s+)?(.+)/);
      if (!clickMatch) return;
      
      const target = clickMatch[1].trim();
      this.findAndClickElement(target);
    }

    findAndClickElement(target) {
      const elements = this.currentPageElements;
      
      // Find element by text content or common attributes
      const element = elements.find(el => {
        const text = el.textContent.toLowerCase();
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const title = (el.getAttribute('title') || '').toLowerCase();
        
        return text.includes(target) || ariaLabel.includes(target) || title.includes(target);
      });
      
      if (element) {
        this.clickElementWithFeedback(element);
      } else {
        this.updateStatus(\`Could not find "\${target}"\`, 'warning');
      }
    }

    clickElementWithFeedback(element) {
      // Scroll to element
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      setTimeout(() => {
        // Visual feedback
        const originalStyle = element.style.cssText;
        element.style.outline = '3px solid #667eea';
        element.style.backgroundColor = 'rgba(102, 126, 234, 0.1)';
        
        // Click after brief highlight
        setTimeout(() => {
          element.click();
          this.updateStatus('Clicked successfully! ✅', 'success');
          
          // Restore original style
          setTimeout(() => {
            element.style.cssText = originalStyle;
          }, 500);
        }, 300);
      }, 500);
    }

    analyzePageContent() {
      // Find clickable elements
      this.currentPageElements = Array.from(document.querySelectorAll(
        'a, button, [role="button"], [onclick], input[type="submit"], input[type="button"], .btn, [tabindex]'
      )).filter(el => {
        // Filter out hidden elements
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetWidth > 0;
      });
      
      console.log(\`🔍 Found \${this.currentPageElements.length} interactive elements\`);
    }

    setupNavigationHandling() {
      // Re-analyze page content when DOM changes
      const observer = new MutationObserver(() => {
        clearTimeout(this.analyzeTimeout);
        this.analyzeTimeout = setTimeout(() => {
          this.analyzePageContent();
        }, 500);
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    checkForSessionRestore() {
      // Simple session persistence could be added here
      console.log('🔄 Session check complete');
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      new UniversalVoiceNavigator();
    });
  } else {
    new UniversalVoiceNavigator();
  }

  // Add pulsing animation
  const style = document.createElement('style');
  style.textContent = \`
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
  \`;
  document.head.appendChild(style);

})();
</script>`
                              navigator.clipboard.writeText(embedCode)
                              toast({
                                title: "Embed Code Copied!",
                                description: "Paste this code into your website to add the voice assistant.",
                              })
                            }}
                          >
                            Get Code
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => {
                              toast({
                                title: "Edit Assistant",
                                description: "Feature coming soon!",
                              })
                            }}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                        </div>
                        <Button 
                          size="sm" 
                          className="w-full bg-blue-600 hover:bg-blue-700"
                          onClick={() => {
                            // Create a live demo modal or redirect to demo with assistant ID
                            const demoUrl = `/voice-demo?assistant=${assistant.vapi_assistant_id}&name=${encodeURIComponent(assistant.name)}`
                            window.open(demoUrl, '_blank')
                          }}
                        >
                          <Mic className="mr-2 h-4 w-4" />
                          Try Live Demo
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Demo Section */}
        <Card className="mb-8 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <div className="bg-blue-500 rounded-full p-2">
                <Bot className="h-6 w-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-blue-900">Experience Voice Navigation</CardTitle>
                <CardDescription>
                  Try our enhanced voice assistant with website navigation and conversation memory
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="space-y-2">
                <p className="text-sm text-blue-800 font-medium">✨ New Features:</p>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• Voice-controlled scrolling and navigation</li>
                  <li>• Multi-turn conversation memory</li>
                  <li>• Interactive DOM element control</li>
                </ul>
              </div>
              <Button 
                onClick={() => navigate('/voice-demo')}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Bot className="mr-2 h-4 w-4" />
                Try Live Demo
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Getting Started */}
        <Card>
          <CardHeader>
            <CardTitle>Get Started</CardTitle>
            <CardDescription>
              Create your first voice assistant in just a few steps
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600">1</span>
                </div>
                <div>
                  <p className="font-medium">Upload Documents</p>
                  <p className="text-sm text-gray-600">Upload PDFs, DOCX, or TXT files to train your assistant</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600">2</span>
                </div>
                <div>
                  <p className="font-medium">Customize Voice & Personality</p>
                  <p className="text-sm text-gray-600">Set system prompts, voice style, and assistant behavior</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0 w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600">3</span>
                </div>
                <div>
                  <p className="font-medium">Deploy & Embed</p>
                  <p className="text-sm text-gray-600">Get an embed code to add your assistant to any website</p>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <Button 
                className="w-full sm:w-auto"
                onClick={() => navigate('/create-assistant')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Your First Assistant
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default Dashboard