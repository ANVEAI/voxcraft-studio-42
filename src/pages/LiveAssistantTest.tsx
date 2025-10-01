import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Mic, MessageSquare, Navigation, Volume2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/integrations/supabase/client'
import { CustomVoiceWidget } from '@/components/CustomVoiceWidget'

// TypeScript declarations
declare global {
  interface Window {
    VoiceAIAssistant?: {
      init: (config: {
        assistantId: string
        vapiAssistantId: string
        position: 'left' | 'right'
        theme: 'light' | 'dark'
      }) => void
    }
    VoiceAINavigate?: any
  }
}

const LiveAssistantTest = () => {
  const navigate = useNavigate()
  const [isLoaded, setIsLoaded] = useState(false)
  const [assistantStatus, setAssistantStatus] = useState('Loading...')
  const [debugInfo, setDebugInfo] = useState<string[]>([])
  const [assistantValid, setAssistantValid] = useState<boolean | null>(null)
  const [defaultAssistantId, setDefaultAssistantId] = useState<string | null>(null)

  const [transcript, setTranscript] = useState('')
  const [isSpeaking, setIsSpeaking] = useState(false)

  const addDebugInfo = (info: string) => {
    console.log('[DEBUG]', info)
    setDebugInfo(prev => [...prev, `${new Date().toLocaleTimeString()}: ${info}`])
  }

  useEffect(() => {
    // Get the first available assistant from the database
    const getFirstAssistant = async () => {
      try {
        addDebugInfo('Fetching first available assistant...')
        const { data: assistant, error } = await supabase
          .from('assistants')
          .select('vapi_assistant_id')
          .eq('status', 'active')
          .limit(1)
          .single()

        if (error || !assistant?.vapi_assistant_id) {
          addDebugInfo('❌ No active assistants found in database')
          return
        }

        const assistantId = assistant.vapi_assistant_id
        setDefaultAssistantId(assistantId)
        addDebugInfo(`✅ Found assistant: ${assistantId}`)
        
        // Now verify the assistant exists in VAPI
        const verifyAssistant = async () => {
          try {
            addDebugInfo('Verifying assistant exists in VAPI...')
            const { data, error } = await supabase.functions.invoke('check-assistant', {
              body: { assistantId }
            })
        
            if (error) {
              addDebugInfo(`Assistant verification error: ${error.message}`)
              setAssistantValid(false)
              setAssistantStatus('Verification Failed')
              return
            }
            
            addDebugInfo(`Assistant verification result: ${JSON.stringify(data)}`)
            if (data.exists) {
              setAssistantValid(true)
              addDebugInfo(`Assistant found: ${data.name || 'Unknown Name'}`)
              setIsLoaded(true)
              setAssistantStatus('Ready')
            } else {
              setAssistantValid(false)
              addDebugInfo(`Assistant not found in VAPI: ${data.error || 'Unknown error'}`)
              setAssistantStatus('Assistant Not Found')
            }
          } catch (error) {
            addDebugInfo(`Assistant verification failed: ${error}`)
            setAssistantValid(false)
            setAssistantStatus('Verification Error')
          }
        }
        
        verifyAssistant()
      } catch (error) {
        addDebugInfo(`❌ Failed to get assistant from database: ${error}`)
        setAssistantValid(false)
      }
    }
    
    getFirstAssistant()
  }, [])

  const handleSpeakingChange = (speaking: boolean) => {
    setIsSpeaking(speaking)
    addDebugInfo(`🎙️ Speaking state changed: ${speaking}`)
  }

  const handleTranscript = (transcript: string) => {
    setTranscript(transcript)
    addDebugInfo(`📝 Transcript: ${transcript}`)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Vapi Voice Interface */}
      {assistantValid && defaultAssistantId && (
        <CustomVoiceWidget
          assistantId={defaultAssistantId}
          publicKey={import.meta.env.VITE_VAPI_PUBLIC_KEY}
          position="right"
          theme="light"
        />
      )}
      
      {/* Legacy Voice Assistant Container */}
      <div id="voiceai-assistant-04903bc5-664f-488e-8977-4c5a7d605791"></div>
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => navigate('/dashboard')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Back to Dashboard</span>
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-xl font-semibold text-gray-900">Live Assistant Test</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant={isLoaded ? "default" : "secondary"} className={`${
                isLoaded ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
              }`}>
                <Mic className="h-3 w-3 mr-1" />
                {assistantStatus}
              </Badge>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Your Assistant is
            <br />
            <span className="text-yellow-300">Live & Ready!</span>
          </h1>
          <p className="text-xl md:text-2xl mb-8 max-w-3xl mx-auto">
            Click the microphone button in the bottom right to start talking with your custom voice assistant.
          </p>
          <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 max-w-2xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <strong>Assistant ID:</strong><br />
                <code className="text-yellow-300">{defaultAssistantId || 'Loading...'}</code>
              </div>
              <div>
                <strong>Database ID:</strong><br />
                <code className="text-yellow-300">04903bc5-664f-488e-8977-4c5a7d605791</code>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Test Instructions */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Test Your Assistant</h2>
            <p className="text-lg text-gray-600">Try these commands and features</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <Card className="text-center">
              <CardHeader>
                <MessageSquare className="h-8 w-8 mx-auto text-blue-600 mb-2" />
                <CardTitle className="text-lg">General Conversation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>"Hello, how are you?"</p>
                  <p>"What can you help me with?"</p>
                  <p>"Tell me about yourself"</p>
                  <p>"What's the weather like?"</p>
                </div>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Navigation className="h-8 w-8 mx-auto text-green-600 mb-2" />
                <CardTitle className="text-lg">Navigation Commands</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>"Scroll down"</p>
                  <p>"Go to the top"</p>
                  <p>"Navigate to features section"</p>
                  <p>"Show me pricing"</p>
                </div>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <Volume2 className="h-8 w-8 mx-auto text-purple-600 mb-2" />
                <CardTitle className="text-lg">Memory Test</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-gray-600">
                  <p>"Remember my name is [Your Name]"</p>
                  <p>"What did I just tell you?"</p>
                  <p>"What was our last conversation about?"</p>
                  <p>"Do you remember me?"</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Test Sections for Navigation */}
      <section id="features" className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Features Section</h2>
          <p className="text-lg text-gray-600 mb-8">Try saying "Go to features section" or "Navigate to features"</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-semibold mb-3">Voice Navigation</h3>
              <p className="text-gray-600">Navigate websites using voice commands</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-semibold mb-3">Smart Memory</h3>
              <p className="text-gray-600">Remembers conversation context</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-xl font-semibold mb-3">Easy Integration</h3>
              <p className="text-gray-600">Simple embed code for any website</p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Pricing Section</h2>
          <p className="text-lg text-gray-600 mb-8">Try saying "Show me pricing" or "Go to pricing section"</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic</CardTitle>
                <CardDescription>$29/month</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">Perfect for small websites</p>
                <Button className="w-full mt-4" data-action="select-basic">Choose Plan</Button>
              </CardContent>
            </Card>
            <Card className="border-blue-500 shadow-lg">
              <CardHeader>
                <CardTitle>Pro</CardTitle>
                <CardDescription>$99/month</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">For growing businesses</p>
                <Button className="w-full mt-4" data-action="select-pro">Choose Plan</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Enterprise</CardTitle>
                <CardDescription>Custom</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600">Large scale deployments</p>
                <Button variant="outline" className="w-full mt-4" data-action="contact-sales">Contact Sales</Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Status and Debug */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card>
            <CardHeader>
              <CardTitle>Assistant Status & Debug</CardTitle>
              <CardDescription>Real-time debug information for your assistant</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mb-6">
                <div>
                  <strong>Load Status:</strong> <span className={`${isLoaded ? 'text-green-600' : 'text-red-600'}`}>{assistantStatus}</span>
                </div>
                <div>
                  <strong>Assistant Valid:</strong> <span className={`${assistantValid === true ? 'text-green-600' : assistantValid === false ? 'text-red-600' : 'text-yellow-600'}`}>
                    {assistantValid === true ? 'Yes' : assistantValid === false ? 'No' : 'Checking...'}
                  </span>
                </div>
                <div>
                  <strong>Position:</strong> Bottom Right
                </div>
                <div>
                  <strong>Theme:</strong> Light
                </div>
                <div>
                  <strong>Enhanced Features:</strong> ✅ Navigation, Memory, DOM Control
                </div>
              </div>
              
              <div className="border-t pt-4">
                <h4 className="font-semibold mb-2">Debug Log:</h4>
                <div className="bg-black text-green-400 p-4 rounded-lg h-40 overflow-y-auto font-mono text-xs">
                  {debugInfo.map((info, index) => (
                    <div key={index}>{info}</div>
                  ))}
                  {debugInfo.length === 0 && <div>Waiting for debug information...</div>}
                </div>
              </div>
              
              {!isLoaded && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-yellow-800 text-sm">
                    <strong>Troubleshooting:</strong> The assistant is not loading. Check the debug log above for specific error messages.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p>&copy; 2024 VoiceAI Platform. Your assistant is live and ready!</p>
        </div>
      </footer>
    </div>
  )
}

export default LiveAssistantTest