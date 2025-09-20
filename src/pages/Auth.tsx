import { SignIn, SignUp, useAuth } from '@clerk/clerk-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import VapiVoiceInterface from '@/components/VapiVoiceInterface'
import { supabase } from '@/integrations/supabase/client'

const Auth = () => {
  const { isSignedIn, isLoaded } = useAuth()
  const navigate = useNavigate()
  const [defaultAssistantId, setDefaultAssistantId] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate('/')
    }
  }, [isLoaded, isSignedIn, navigate])

  useEffect(() => {
    // Get the first available assistant from the database to use as default
    const fetchDefaultAssistant = async () => {
      try {
        const { data: assistants, error } = await supabase
          .from('assistants')
          .select('vapi_assistant_id')
          .eq('status', 'active')
          .limit(1)
          .single()

        if (!error && assistants?.vapi_assistant_id) {
          setDefaultAssistantId(assistants.vapi_assistant_id)
        }
      } catch (error) {
        console.log('[Auth] No default assistant available:', error)
      }
    }

    fetchDefaultAssistant()
  }, [])

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      {/* Voice Navigation Interface - Only show if we have a valid assistant */}
      {defaultAssistantId && (
        <VapiVoiceInterface
          assistantId={defaultAssistantId}
          publicKey={import.meta.env.VITE_VAPI_PUBLIC_KEY}
          position="right"
          theme="light"
          onSpeakingChange={(speaking) => console.log('[Auth] Speaking:', speaking)}
          onTranscript={(transcript) => console.log('[Auth] Transcript:', transcript)}
        />
      )}
      
      <Card className="w-full max-w-md">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">VoiceAI Platform</h1>
            <p className="text-gray-600 mt-2">Create powerful voice assistants with ease</p>
          </div>
          
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin" className="mt-6">
              <SignIn 
                appearance={{
                  elements: {
                    rootBox: "mx-auto",
                    card: "shadow-none border-none bg-transparent"
                  }
                }}
                fallbackRedirectUrl="/"
              />
            </TabsContent>
            
            <TabsContent value="signup" className="mt-6">
              <SignUp 
                appearance={{
                  elements: {
                    rootBox: "mx-auto",
                    card: "shadow-none border-none bg-transparent"
                  }
                }}
                fallbackRedirectUrl="/"
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

export default Auth