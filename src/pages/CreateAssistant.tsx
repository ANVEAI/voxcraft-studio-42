import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, ArrowRight, Upload, Check, Edit, Bot, Globe } from 'lucide-react'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { createAsyncProcessingManager } from '@/utils/asyncProcessingNotifications'


interface AssistantData {
  // Step 1: Basic Configuration
  botName: string
  welcomeMessage: string
  systemPromptTemplate: string
  systemPrompt: string
  
  // Step 2: Voice and Appearance
  language: string
  voice: string
  position: 'left' | 'right'
  theme: 'light' | 'dark'
  
  // Step 3: Data Upload
  uploadedFiles: File[]
}

const CreateAssistant = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [assistantData, setAssistantData] = useState<AssistantData>({
    botName: '',
    welcomeMessage: '',
    systemPromptTemplate: '',
    systemPrompt: '',
    language: '',
    voice: '',
    position: 'right',
    theme: 'light',
    uploadedFiles: []
  })
  const [isCreating, setIsCreating] = useState(false)
  const [embedCode, setEmbedCode] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [isScraping, setIsScraping] = useState(false)
  const [scrapeProgress, setScrapeProgress] = useState('')
  const [scrapeJobId, setScrapeJobId] = useState<string | null>(null)
  const [scrapeRecordId, setScrapeRecordId] = useState<string | null>(null)
  const [isPolling, setIsPolling] = useState(false)

  const form = useForm()

  // WebSocket subscription for processing updates
  useEffect(() => {
    if (!scrapeRecordId || !user?.id) return;

    console.log('📡 Setting up WebSocket subscription for record:', scrapeRecordId);

    const channel = supabase
      .channel('processing_updates')
      .on('broadcast', { event: 'processing_complete' }, (payload) => {
        console.log('📨 Received processing update:', payload);
        
        if (payload.payload.recordId === scrapeRecordId) {
          if (payload.payload.status === 'completed') {
            setScrapeProgress(`✅ AI processing complete! ${payload.payload.pagesProcessed} pages processed (${payload.payload.sizeKB}KB)`);
            
            // Download and add knowledge base to files
            handleDownloadKnowledgeBase(scrapeRecordId);
            
            toast({
              title: "Processing Complete!",
              description: `AI processed ${payload.payload.pagesProcessed} pages into structured knowledge base`,
            });
          } else if (payload.payload.status === 'failed') {
            setScrapeProgress('❌ AI processing failed');
            toast({
              title: "Processing Failed",
              description: payload.payload.error || 'Unknown error',
              variant: "destructive"
            });
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [scrapeRecordId, user?.id]);

  // Download knowledge base when processing completes
  const handleDownloadKnowledgeBase = async (recordId: string) => {
    try {
      const { data, error } = await supabase
        .from('scraped_websites')
        .select('*')
        .eq('id', recordId)
        .single();

      if (error) {
        console.error('Error fetching knowledge base:', error);
        return;
      }

      // Cast to any to work around type sync issues
      const record = data as any;

      // Extract structured data or knowledge base content
      const structuredData = record?.structured_data;
      const knowledgeBaseContent = record?.knowledge_base_content;

      let txtContent: string;
      if (knowledgeBaseContent) {
        txtContent = knowledgeBaseContent;
      } else if (structuredData) {
        // Generate TXT content from structured data if knowledge base not yet generated
        txtContent = generateKnowledgeBaseTXT(structuredData);
      } else {
        console.error('No knowledge base data available');
        return;
      }

      // Convert to File object
      const blob = new Blob([txtContent], { type: 'text/plain' });
      const hostname = record?.url ? new URL(record.url).hostname : 'website';
      const file = new File([blob], `knowledge-base-${hostname}.txt`, { type: 'text/plain' });

      // Add to uploaded files
      setAssistantData(prev => ({
        ...prev,
        uploadedFiles: [...prev.uploadedFiles, file]
      }));

      // Clear scraping state
      setScrapeRecordId(null);
      setScrapeProgress('');
      setIsScraping(false);
    } catch (error) {
      console.error('Error downloading knowledge base:', error);
    }
  };

  // Helper to generate knowledge base TXT (simplified version)
  const generateKnowledgeBaseTXT = (structuredData: any): string => {
    let content = `# ${structuredData.siteName || 'Website'} Knowledge Base\n\n`;
    content += `URL: ${structuredData.baseUrl}\n`;
    content += `Last Updated: ${new Date().toISOString()}\n`;
    content += `Total Pages: ${structuredData.pages?.length || 0}\n\n`;
    content += `---\n\n`;

    if (structuredData.pages) {
      structuredData.pages.forEach((page: any, index: number) => {
        content += `## Page ${index + 1}: ${page.title}\n`;
        content += `URL: ${page.url}\n\n`;
        content += `${page.content}\n\n`;
        content += `---\n\n`;
      });
    }

    return content;
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  const systemPromptTemplates = [
    { id: 'general', label: 'General Assistant', prompt: 'You are a helpful assistant that provides accurate and informative responses to user questions.' },
    { id: 'customer-service', label: 'Customer Service', prompt: 'You are a customer service representative. Be friendly, professional, and help resolve customer inquiries efficiently.' },
    { id: 'tutor', label: 'Educational Tutor', prompt: 'You are an educational tutor. Explain concepts clearly, provide examples, and encourage learning.' },
    { id: 'sales', label: 'Sales Assistant', prompt: 'You are a sales assistant. Help customers find products, explain features, and guide them through purchasing decisions.' },
    { id: 'support', label: 'Technical Support', prompt: 'You are a technical support specialist. Diagnose issues, provide step-by-step solutions, and ensure customer satisfaction.' }
  ]

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'hi', name: 'Hindi' },
    { code: 'zh', name: 'Chinese' }
  ]

  // VAPI Native Voice Options (Valid VAPI voice IDs only)
  const voices = [
    { id: 'vapi-elliot', name: 'Elliot - Professional Male', provider: 'vapi', voiceId: 'Elliot' },
    { id: 'vapi-kylie', name: 'Kylie - Clear Female', provider: 'vapi', voiceId: 'Kylie' },
    { id: 'vapi-rohan', name: 'Rohan - Confident Male', provider: 'vapi', voiceId: 'Rohan' },
    { id: 'vapi-lily', name: 'Lily - Warm Female', provider: 'vapi', voiceId: 'Lily' },
    { id: 'vapi-savannah', name: 'Savannah - Energetic Female', provider: 'vapi', voiceId: 'Savannah' },
    { id: 'vapi-hana', name: 'Hana - Gentle Female', provider: 'vapi', voiceId: 'Hana' },
    { id: 'vapi-neha', name: 'Neha - Friendly Female', provider: 'vapi', voiceId: 'Neha' },
    { id: 'vapi-cole', name: 'Cole - Deep Male', provider: 'vapi', voiceId: 'Cole' },
    { id: 'vapi-harry', name: 'Harry - Casual Male', provider: 'vapi', voiceId: 'Harry' },
    { id: 'vapi-paige', name: 'Paige - Professional Female', provider: 'vapi', voiceId: 'Paige' },
    { id: 'vapi-spencer', name: 'Spencer - Strong Male', provider: 'vapi', voiceId: 'Spencer' }
  ]

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleTemplateSelect = (template: any) => {
    setAssistantData({
      ...assistantData,
      systemPromptTemplate: template.label,
      systemPrompt: template.prompt
    })
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files) {
      const validFiles = Array.from(files).filter(file => 
        file.type === 'application/pdf' || 
        file.type === 'text/plain' || 
        file.type === 'text/csv'
      )
      setAssistantData({
        ...assistantData,
        uploadedFiles: [...assistantData.uploadedFiles, ...validFiles]
      })
    }
  }

  const removeFile = (index: number) => {
    const newFiles = assistantData.uploadedFiles.filter((_, i) => i !== index)
    setAssistantData({
      ...assistantData,
      uploadedFiles: newFiles
    })
  }

  const handleCreateBot = async () => {
    setIsCreating(true)
    try {
      // Validate required fields
      if (!assistantData.botName || !assistantData.welcomeMessage || !assistantData.systemPrompt || !assistantData.language || !assistantData.voice) {
        throw new Error('Please fill in all required fields')
      }

      // Get selected voice configuration
      const selectedVoiceConfig = voices.find(v => v.id === assistantData.voice);
      if (!selectedVoiceConfig) {
        throw new Error(`Invalid voice selection: ${assistantData.voice}`)
      }

      const selectedVoice = {
        voiceId: selectedVoiceConfig.voiceId,
        provider: selectedVoiceConfig.provider,
        name: selectedVoiceConfig.name
      };


      console.log('Creating VAPI assistant with data:', assistantData)

      // Convert files to base64 for edge function
      const convertedFiles = await Promise.all(
        assistantData.uploadedFiles.map(async (file) => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                name: file.name,
                type: file.type,
                size: file.size,
                data: reader.result as string
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );

      console.log('Creating VAPI assistant with files:', convertedFiles.length);

      // Use Supabase edge function to create assistant (secure approach)
      const { data: response, error } = await supabase.functions.invoke('create-vapi-assistant', {
        body: {
          assistantData,
          selectedVoice,
          files: convertedFiles
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to create assistant');
      }

      const vapiAssistant = response.assistant;

      // Step 5: Save assistant data to Supabase database and create embed mapping
      console.log('Saving assistant to Supabase database...');
      let embedId = '';
      try {
        // Get Clerk token for authentication
        const token = await getToken();
        if (!token) {
          throw new Error('No authentication token available');
        }

        // Use edge function to save assistant with proper authentication
        const { data: saveResponse, error: saveError } = await supabase.functions.invoke('save-assistant', {
          body: {
            vapi_assistant_id: vapiAssistant.id,
            name: assistantData.botName,
            welcome_message: assistantData.welcomeMessage,
            system_prompt: assistantData.systemPrompt,
            language: assistantData.language,
            voice_id: assistantData.voice,
            position: assistantData.position,
            theme: assistantData.theme,
            status: 'active',
            api_key: import.meta.env.VITE_VAPI_PUBLIC_KEY
          },
          headers: {
            Authorization: `Bearer ${token}`
          }
        });

        if (saveError) {
          console.error('Assistant save error:', saveError);
          throw new Error('Failed to save assistant to database');
        }

        console.log('Assistant saved to database:', saveResponse.assistant);
        embedId = saveResponse.embedId;

        if (!embedId) {
          throw new Error('Failed to generate embed ID');
        }

        console.log('Embed mapping created:', embedId);

      } catch (dbError) {
        console.error('Database operation failed:', dbError);
        toast({
          title: "Warning", 
          description: "Assistant created in VAPI but database save failed. You can manage it from the dashboard.",
          variant: "destructive",
        });
      }

      const successMessage = assistantData.uploadedFiles.length > 0 
        ? `Assistant "${assistantData.botName}" created successfully with knowledge base! ID: ${vapiAssistant.id}. ${assistantData.uploadedFiles.length} files uploaded and connected.`
        : `Assistant "${assistantData.botName}" created successfully! ID: ${vapiAssistant.id}`;

      toast({
        title: "Success!",
        description: successMessage,
      })

      // Generate embed code with embedId
      const embedCodeContent = `<!-- Load Supabase JS -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js"></script>

<!-- Load Voice Assistant (Persistent Embed - Never needs updating) -->
<script src="https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/voice-assistant-embed-js?embedId=${embedId}&position=${assistantData.position === 'left' ? 'bottom-left' : 'bottom-right'}&theme=${assistantData.theme}"></script>`;

      setEmbedCode(embedCodeContent);

      toast({
        title: "Success!",
        description: successMessage,
      })

      // Don't navigate immediately, show the embed code first
      setCurrentStep(4)
      
    } catch (error) {
      console.error('Error creating assistant:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to create assistant. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsCreating(false)
    }
  }

  const editStep = (step: number) => {
    setCurrentStep(step)
  }

  const renderStep1 = () => (
    <div className="space-y-6">
      <div>
        <Label htmlFor="botName">Bot Name *</Label>
        <Input
          id="botName"
          value={assistantData.botName}
          onChange={(e) => setAssistantData({...assistantData, botName: e.target.value})}
          placeholder="e.g., Physics Tutor Bot"
          className="mt-1"
        />
      </div>
      
      <div>
        <Label htmlFor="welcomeMessage">Welcome Message *</Label>
        <Textarea
          id="welcomeMessage"
          value={assistantData.welcomeMessage}
          onChange={(e) => setAssistantData({...assistantData, welcomeMessage: e.target.value})}
          placeholder="Hi! I'm here to help. Ask me anything!"
          className="mt-1"
        />
      </div>
      
      <div>
        <Label>System Prompt Template</Label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
          {systemPromptTemplates.map((template) => (
            <Card 
              key={template.id} 
              className={`cursor-pointer transition-colors ${assistantData.systemPromptTemplate === template.label ? 'border-blue-500 bg-blue-50' : ''}`}
              onClick={() => handleTemplateSelect(template)}
            >
              <CardContent className="p-3">
                <p className="font-medium text-sm">{template.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
      
      <div>
        <Label htmlFor="systemPrompt">System Prompt *</Label>
        <Textarea
          id="systemPrompt"
          value={assistantData.systemPrompt}
          onChange={(e) => setAssistantData({...assistantData, systemPrompt: e.target.value})}
          placeholder="Customize your assistant's behavior and instructions..."
          className="mt-1 min-h-[100px]"
        />
      </div>
    </div>
  )

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label>Language *</Label>
          <Select value={assistantData.language} onValueChange={(value) => setAssistantData({...assistantData, language: value})}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Voice *</Label>
          <Select value={assistantData.voice} onValueChange={(value) => setAssistantData({...assistantData, voice: value})}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select voice" />
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.id} value={voice.id}>{voice.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <Label>Position</Label>
          <Select value={assistantData.position} onValueChange={(value: 'left' | 'right') => setAssistantData({...assistantData, position: value})}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label>Theme</Label>
          <Select value={assistantData.theme} onValueChange={(value: 'light' | 'dark') => setAssistantData({...assistantData, theme: value})}>
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )

  // Cleanup polling on unmount

  useEffect(() => {
    return () => {
      if (isPolling) {
        setIsPolling(false);
      }
    }
  }, [isPolling])

  const handleScrapeWebsite = async () => {
    setIsScraping(true)
    setScrapeProgress('🕷️ Starting website scrape...')

    try {
      const token = await getToken()
      
      // Stage 1: Start scrape (returns immediately with job ID)
      const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('scrape-website', {
        body: { url: websiteUrl, userId: user?.id },
        headers: { Authorization: `Bearer ${token}` }
      })

      if (scrapeError) throw scrapeError

      if (!scrapeData.success) {
        throw new Error(scrapeData.error || 'Failed to start scraping')
      }

      const jobId = scrapeData.jobId
      const recordId = scrapeData.recordId
      setScrapeJobId(jobId)
      setScrapeRecordId(recordId)
      setScrapeProgress('🔄 Scraping in progress (0 pages)...')

      // Stage 2: Poll for status every 5 seconds
      let attempts = 0
      let consecutiveErrors = 0
      const maxAttempts = 360 // 30 minutes max (360 * 5 seconds) - increased for deep crawls with 500 pages
      const maxConsecutiveErrors = 3
      
      const interval = setInterval(async () => {
        attempts++
        
        try {
          const { data: statusData, error: statusError } = await supabase.functions.invoke('check-scrape-status', {
            body: { jobId, userId: user?.id, recordId }
          })

          if (statusError) {
            console.error('Status check error:', statusError)
            consecutiveErrors++
            if (consecutiveErrors >= maxConsecutiveErrors) {
              clearInterval(interval)
              setIsScraping(false)
              toast({
                title: "Error",
                description: "Failed to check scraping status. Please try again.",
                variant: "destructive"
              })
            }
            return
          }

          // Reset error counter on success
          consecutiveErrors = 0

          const { status, completed, total, data: scrapedData } = statusData
          console.log(`Scrape status: ${status}, ${completed}/${total} pages`)

          // Update progress message
          setScrapeProgress(`🔄 Scraping: ${completed}/${total} pages (${Math.round((completed/total) * 100)}%)`)

          // Check if completed
          if (status === 'completed') {
            clearInterval(interval)
            setIsPolling(false)
            
            setScrapeProgress('✅ Scrape complete! AI processing in background...')
            
            // Clear scraping state but keep the record ID for later
            setWebsiteUrl('')
            setIsScraping(false)
            setScrapeJobId(null)

          } 
          // Check if failed
          else if (status === 'failed') {
            clearInterval(interval)
            setIsPolling(false)
            throw new Error('Scraping job failed')
          }
          // Check timeout
          else if (attempts >= maxAttempts) {
            clearInterval(interval)
            setIsPolling(false)
            throw new Error('Scraping timed out after 10 minutes. Please try a smaller website.')
          }

        } catch (pollingError: any) {
          clearInterval(interval)
          setIsPolling(false)
          setIsScraping(false)
          setScrapeProgress('')
          
          toast({
            title: "Error",
            description: pollingError.message || "Failed during scraping",
            variant: "destructive",
          })
        }
      }, 5000) // Poll every 5 seconds

      setIsPolling(true)

    } catch (error: any) {
      console.error('Scraping error:', error)
      
      setIsPolling(false)
      
      toast({
        title: "Error",
        description: error.message || "Failed to scrape website",
        variant: "destructive",
      })
      
      setIsScraping(false)
      setScrapeProgress('')
      setScrapeJobId(null)
      setScrapeRecordId(null)
    }
  }

  const renderStep3 = () => (
    <div className="space-y-6">
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="upload">📁 Upload Files</TabsTrigger>
          <TabsTrigger value="scrape">🕷️ Scrape Website</TabsTrigger>
        </TabsList>
        
        <TabsContent value="upload" className="space-y-4 mt-6">
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-sm font-medium">Upload Data Files</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Enhance your assistant's knowledge by uploading documents
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supported formats: PDF, TXT, CSV
            </p>
          </div>
          
          <div className="mt-6">
            <input
              type="file"
              multiple
              accept=".pdf,.txt,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label htmlFor="file-upload">
              <Button variant="outline" className="w-full cursor-pointer" asChild>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  Choose Files
                </span>
              </Button>
            </label>
          </div>
        </TabsContent>
        
        <TabsContent value="scrape" className="space-y-4 mt-6">
          <div className="text-center">
            <Globe className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-2 text-sm font-medium">Scrape Website</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter a website URL to create a knowledge base
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Max 50 pages • Powered by Firecrawl
            </p>
          </div>
          
          <div className="mt-6 space-y-4">
            <Input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={isScraping}
            />
            
            <Button 
              onClick={handleScrapeWebsite} 
              disabled={!websiteUrl || isScraping}
              className="w-full"
            >
              {isScraping ? '🕷️ Scraping...' : '🚀 Start Scraping'}
            </Button>

            {scrapeProgress && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded text-sm text-blue-800 dark:text-blue-200">
                {scrapeProgress}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Show uploaded files (both manual + scraped) */}
      {assistantData.uploadedFiles.length > 0 && (
        <div className="space-y-2 mt-6">
          <h4 className="text-sm font-medium">Knowledge Base Files:</h4>
          {assistantData.uploadedFiles.map((file, index) => (
            <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
              <span className="text-sm">{file.name}</span>
              <Button variant="ghost" size="sm" onClick={() => removeFile(index)}>
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderStep4 = () => (
    <div className="space-y-6">
      {embedCode ? (
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold">Assistant Created Successfully!</h3>
          <p className="text-gray-600">Your voice assistant is ready to deploy.</p>
          
          <div className="bg-gray-100 p-4 rounded-lg">
            <Label className="text-sm font-medium">Embed Code:</Label>
            <Textarea 
              value={embedCode} 
              readOnly 
              className="mt-2 font-mono text-xs"
              rows={6}
            />
            <Button 
              variant="outline" 
              className="mt-2 w-full"
              onClick={() => navigator.clipboard.writeText(embedCode)}
            >
              Copy Embed Code
            </Button>
          </div>
          
          <Button onClick={() => navigate('/dashboard')} className="w-full">
            Return to Dashboard
          </Button>
        </div>
      ) : (
        <div>
          <h3 className="text-lg font-semibold mb-4">Review & Deploy</h3>
          
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Basic Configuration</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => editStep(1)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>Bot Name:</strong> {assistantData.botName || 'Not set'}</p>
                <p><strong>Welcome Message:</strong> {assistantData.welcomeMessage || 'Not set'}</p>
                <p><strong>Template:</strong> {assistantData.systemPromptTemplate || 'Not selected'}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Voice & Appearance</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => editStep(2)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <p><strong>Language:</strong> {languages.find(l => l.code === assistantData.language)?.name || 'Not selected'}</p>
                <p><strong>Voice:</strong> {voices.find(v => v.id === assistantData.voice)?.name || 'Not selected'}</p>
                <p><strong>Position:</strong> {assistantData.position}</p>
                <p><strong>Theme:</strong> {assistantData.theme}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Data Upload</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => editStep(3)}>
                  <Edit className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="text-sm">
                <p>{assistantData.uploadedFiles.length} file(s) uploaded</p>
              </CardContent>
            </Card>
          </div>
          
          <Button 
            onClick={handleCreateBot} 
            disabled={isCreating || !assistantData.botName || !assistantData.welcomeMessage || !assistantData.systemPrompt || !assistantData.language || !assistantData.voice}
            className="w-full mt-6"
          >
            {isCreating ? (
              <>
                <Bot className="mr-2 h-4 w-4 animate-spin" />
                Creating Assistant...
              </>
            ) : (
              <>
                <Bot className="mr-2 h-4 w-4" />
                Create Bot
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )

  const steps = [
    { number: 1, title: 'Basic Configuration', description: 'Set up your assistant\'s core settings' },
    { number: 2, title: 'Voice & Appearance', description: 'Customize how your assistant looks and sounds' },
    { number: 3, title: 'Data Upload', description: 'Upload documents to enhance knowledge (Optional)' },
    { number: 4, title: 'Review & Deploy', description: 'Review settings and create your assistant' }
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Button variant="ghost" onClick={() => navigate('/dashboard')} className="mr-4">
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">Create Voice Assistant</h1>
            </div>
            <div className="text-sm text-gray-600">
              Step {currentStep} of 4
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Progress Steps */}
        <div className="mb-8">
          <div className="flex justify-between">
            {steps.map((step) => (
              <div key={step.number} className="flex flex-col items-center">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep >= step.number 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-200 text-gray-600'
                }`}>
                  {currentStep > step.number ? <Check className="h-5 w-5" /> : step.number}
                </div>
                <div className="mt-2 text-center">
                  <p className="text-xs font-medium text-gray-900">{step.title}</p>
                  <p className="text-xs text-gray-500 hidden sm:block">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <Card>
          <CardContent className="p-6">
            {currentStep === 1 && renderStep1()}
            {currentStep === 2 && renderStep2()}
            {currentStep === 3 && renderStep3()}
            {currentStep === 4 && renderStep4()}
          </CardContent>
        </Card>

        {/* Navigation */}
        {currentStep < 4 && !embedCode && (
          <div className="flex justify-between mt-6">
            <Button 
              variant="outline" 
              onClick={handleBack} 
              disabled={currentStep === 1}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button 
              onClick={handleNext}
              disabled={
                (currentStep === 1 && (!assistantData.botName || !assistantData.welcomeMessage || !assistantData.systemPrompt)) ||
                (currentStep === 2 && (!assistantData.language || !assistantData.voice))
              }
            >
              Next
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

export default CreateAssistant