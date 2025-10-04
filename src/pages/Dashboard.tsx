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

  const generateEmbedCode = (assistant: any) => {
    if (!assistant.embed_id) {
      return '<!-- Error: No embed ID found for this assistant. Please contact support. -->';
    }
    return `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js"></script>

<!-- Load Voice Assistant (Persistent Embed - Never needs updating) -->
<script src="https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/voice-assistant-embed-js?embedId=${assistant.embed_id}&position=${assistant.position === 'left' ? 'bottom-left' : 'bottom-right'}&theme=${assistant.theme}"></script>`;
  }

  const copyEmbedCode = (assistant: any) => {
    if (!assistant.embed_id) {
      toast({
        title: "Error",
        description: "No embed ID found for this assistant. Please contact support.",
        variant: "destructive",
      });
      return;
    }
    const embedCode = generateEmbedCode(assistant);
    navigator.clipboard.writeText(embedCode);
    toast({
      title: "Embed Code Copied!",
      description: "Paste this code into your website to add the voice assistant.",
    });
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
                                onClick={() => copyEmbedCode(assistant)}
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
                              onClick={() => copyEmbedCode(assistant)}
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
                            className="bg-blue-600 hover:bg-blue-700 w-full"
                            onClick={() => {
                              const demoUrl = `/voice-demo?assistant=${assistant.vapi_assistant_id}&name=${encodeURIComponent(assistant.name)}`
                              window.open(demoUrl, '_blank')
                            }}
                          >
                            <Mic className="h-4 w-4 mr-2" />
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Voice Navigation Demo
              </CardTitle>
              <CardDescription>
                Experience the power of voice-controlled website navigation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Try saying commands like "scroll down", "click on Dashboard", or "go to top of page" 
                  to see how visitors can navigate your website hands-free.
                </p>
                <Button 
                  className="w-full"
                  onClick={() => window.open('/navigation-demo.html', '_blank')}
                >
                  Open Navigation Demo
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Usage Analytics
              </CardTitle>
              <CardDescription>
                Monitor your voice assistants' performance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{assistants.length}</div>
                    <div className="text-xs text-gray-500">Active Assistants</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{documentsCount}</div>
                    <div className="text-xs text-gray-500">Knowledge Files</div>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => navigate('/analytics')}
                >
                  View Full Analytics
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Getting Started */}
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>
              Follow these steps to deploy your voice assistant
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-blue-600 font-bold">1</span>
                </div>
                <h3 className="font-medium mb-2">Create Assistant</h3>
                <p className="text-sm text-gray-600">
                  Configure your assistant's voice, behavior, and knowledge base
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-green-600 font-bold">2</span>
                </div>
                <h3 className="font-medium mb-2">Get Embed Code</h3>
                <p className="text-sm text-gray-600">
                  Copy the generated code from your assistant's action menu
                </p>
              </div>
              
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-purple-600 font-bold">3</span>
                </div>
                <h3 className="font-medium mb-2">Deploy</h3>
                <p className="text-sm text-gray-600">
                  Paste the code into your website's HTML to activate voice navigation
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

export default Dashboard