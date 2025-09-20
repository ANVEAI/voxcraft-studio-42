import { useEffect, useState } from 'react'
import { useAuth, useUser } from '@clerk/clerk-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Phone, PlayCircle, RefreshCw, MessageSquare } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/integrations/supabase/client'
import Navbar from '@/components/Navbar'

interface CallLog {
  id: string
  vapi_call_id: string
  assistant_id: string
  vapi_assistant_id: string
  call_type: string
  status: string
  started_at: string
  ended_at: string
  duration_seconds: number
  ended_reason: string
  phone_number: string
  recording_url: string
  transcript: any
  messages: any[]
  costs: any[]
  analysis: any
  assistants?: {
    name: string
    vapi_assistant_id: string
  }
  // Support VAPI API format as well
  assistantName?: string
  startedAt?: string
  endedAt?: string
  durationMs?: number
  recordingUrl?: string
  costBreakdown?: {
    total: number
  }
}

interface Analytics {
  overview: {
    totalCalls: number
    activeCalls: number
    completedCalls: number
    successfulCalls: number
    successRate: number
    totalDuration: number
    averageDuration: number
    totalCost: number
  }
  dailyAnalytics: any[]
  recentCalls: CallLog[]
  costBreakdown?: {
    byAssistant: Array<{ name: string; cost: number }>
    byProvider: Array<{ provider: string; cost: number }>
    byEndReason: Array<{ reason: string; count: number }>
  }
  filesCount?: number
  recentFiles?: Array<{ name: string; createdAt: string; status: string }>
}

const Analytics = () => {
  const { isSignedIn, isLoaded, getToken } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const { toast } = useToast()
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [callLogs, setCallLogs] = useState<CallLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [selectedCall, setSelectedCall] = useState<CallLog | null>(null)
  const [playingAudio, setPlayingAudio] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate('/auth')
    } else if (isLoaded && isSignedIn && user) {
      fetchAnalyticsData()
    }
  }, [isLoaded, isSignedIn, navigate, user])

  const fetchAnalyticsData = async () => {
    try {
      setLoading(true)
      const token = await getToken()
      
      if (!token) {
        throw new Error('No auth token available')
      }

      console.log('Fetching analytics with token:', token?.substring(0, 20) + '...')

      // Fetch overview analytics using the new endpoint structure
      const analyticsResponse = await fetch(`https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/vapi-analytics/overview`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!analyticsResponse.ok) {
        throw new Error(`Analytics API error: ${analyticsResponse.status}`)
      }

      const overviewData = await analyticsResponse.json()
      console.log('Overview analytics data received:', overviewData)

      // Fetch call logs for the detailed view
      const callLogsResponse = await fetch(`https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/vapi-analytics/logs`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      let callLogsData = { logs: [] }
      if (callLogsResponse.ok) {
        callLogsData = await callLogsResponse.json()
      }

      setCallLogs(callLogsData.logs || [])

    } catch (error) {
      console.error('Error fetching analytics:', error)
      toast({
        title: "Error",
        description: "Failed to load analytics data.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const syncCallData = async () => {
    try {
      setSyncing(true)
      
      toast({
        title: "Syncing...",
        description: "Fetching latest call data from VAPI",
      })

      // Refresh data directly
      await fetchAnalyticsData()
      
      toast({
        title: "Success",
        description: "Analytics data synced successfully",
      })

    } catch (error) {
      console.error('Error syncing calls:', error)
      toast({
        title: "Error",
        description: "Failed to sync call data.",
        variant: "destructive",
      })
    } finally {
      setSyncing(false)
    }
  }

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0:00'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ended':
        return 'bg-green-100 text-green-800'
      case 'in-progress':
        return 'bg-blue-100 text-blue-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const playRecording = (recordingUrl: string, callId: string) => {
    if (recordingUrl) {
      if (playingAudio === callId) {
        setPlayingAudio(null)
        // Stop all audio elements
        document.querySelectorAll('audio').forEach(audio => {
          audio.pause()
          audio.currentTime = 0
        })
      } else {
        setPlayingAudio(callId)
      }
    }
  }

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading analytics...</p>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      {/* Analytics Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">VAPI Analytics</h1>
              <p className="text-gray-600">Monitor your voice assistant performance and usage</p>
            </div>
            <Button
              variant="outline"
              onClick={syncCallData}
              disabled={syncing}
              className="flex items-center space-x-2"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
              <span>Sync Data</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Detailed Analytics */}
        <Tabs defaultValue="calls" className="space-y-6">
          <TabsList>
            <TabsTrigger value="calls">
              <Phone className="h-4 w-4 mr-2" />
              Call Logs
            </TabsTrigger>
            <TabsTrigger value="transcripts">
              <MessageSquare className="h-4 w-4 mr-2" />
              Transcripts & Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calls">
            <Card>
              <CardHeader>
                <CardTitle>Call Logs</CardTitle>
                <CardDescription>
                  Detailed logs of all voice assistant calls with recordings and metadata
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Assistant</TableHead>
                        <TableHead>Started</TableHead>
                        <TableHead>Duration</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Recording</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                       {callLogs.length > 0 ? callLogs.map((call) => (
                        <TableRow key={call.id}>
                          <TableCell className="font-medium">
                            {call.assistants?.name || call.assistantName || 'Unknown'}
                          </TableCell>
                          <TableCell>{call.started_at ? formatDate(call.started_at) : formatDate(call.startedAt || new Date().toISOString())}</TableCell>
                          <TableCell>{formatDuration(call.duration_seconds || call.durationMs/1000 || 0)}</TableCell>
                          <TableCell>
                            <Badge className={getStatusColor(call.status)}>
                              {call.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {call.costs && Array.isArray(call.costs) ? 
                              formatCurrency(call.costs.reduce((sum, cost) => sum + (cost.cost || 0), 0)) :
                              call.costBreakdown?.total ? formatCurrency(call.costBreakdown.total) :
                              '$0.00'
                            }
                          </TableCell>
                          <TableCell>
                            {(call.recording_url || call.recordingUrl) ? (
                              <div className="flex flex-col items-center space-y-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => playRecording(call.recording_url || call.recordingUrl, call.id)}
                                >
                                  <PlayCircle className={`h-4 w-4 ${playingAudio === call.id ? 'text-blue-600' : ''}`} />
                                </Button>
                                {playingAudio === call.id && (
                                  <audio 
                                    controls 
                                    autoPlay
                                    className="w-full max-w-xs"
                                    onEnded={() => setPlayingAudio(null)}
                                    onPause={() => setPlayingAudio(null)}
                                  >
                                    <source src={call.recording_url || call.recordingUrl} type="audio/wav" />
                                    Your browser does not support the audio element.
                                  </audio>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedCall(call)}
                            >
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      )) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                            No call logs available. Create an assistant and make some calls to see data here.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transcripts">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Transcripts</CardTitle>
                  <CardDescription>Conversation transcripts from recent calls</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {callLogs.filter(call => call.transcript || call.messages).slice(0, 10).map((call) => (
                        <div key={call.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-medium">{call.assistants?.name}</h4>
                            <span className="text-sm text-gray-500">{formatDate(call.started_at)}</span>
                          </div>
                          {call.messages && Array.isArray(call.messages) && call.messages.length > 0 ? (
                            <div className="space-y-2">
                              {call.messages.slice(0, 3).map((message, idx) => (
                                <div key={idx} className="text-sm">
                                  <span className="font-medium capitalize">{message.role}: </span>
                                  <span>{message.message?.substring(0, 100)}...</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">No transcript available</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Call Analysis</CardTitle>
                  <CardDescription>AI-powered insights from call analysis</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {callLogs.filter(call => call.analysis).slice(0, 5).map((call) => (
                        <div key={call.id} className="border rounded-lg p-4">
                          <div className="flex justify-between items-start mb-2">
                            <h4 className="font-medium">{call.assistants?.name}</h4>
                            <span className="text-sm text-gray-500">{formatDate(call.started_at)}</span>
                          </div>
                          {call.analysis ? (
                            <div className="space-y-2">
                              {call.analysis.summary && (
                                <div>
                                  <h5 className="text-sm font-medium">Summary:</h5>
                                  <p className="text-sm text-gray-600">{call.analysis.summary}</p>
                                </div>
                              )}
                              {call.analysis.successEvaluation && (
                                <div>
                                  <h5 className="text-sm font-medium">Success Evaluation:</h5>
                                  <p className="text-sm text-gray-600">{call.analysis.successEvaluation}</p>
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500">Analysis in progress...</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

        </Tabs>

        {/* Call Detail Modal */}
        {selectedCall && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Call Details - {selectedCall.assistants?.name}</CardTitle>
                  <Button variant="ghost" onClick={() => setSelectedCall(null)}>×</Button>
                </div>
                <CardDescription>
                  {formatDate(selectedCall.started_at)} • {formatDuration(selectedCall.duration_seconds)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[60vh]">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-medium mb-2">Call Information</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>Call ID: {selectedCall.vapi_call_id}</div>
                        <div>Type: {selectedCall.call_type}</div>
                        <div>Status: <Badge className={getStatusColor(selectedCall.status)}>{selectedCall.status}</Badge></div>
                        <div>Ended Reason: {selectedCall.ended_reason || 'N/A'}</div>
                      </div>
                    </div>

                    {selectedCall.messages && Array.isArray(selectedCall.messages) && (
                      <div>
                        <h4 className="font-medium mb-2">Conversation</h4>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {selectedCall.messages.map((message, idx) => (
                            <div key={idx} className="p-2 border rounded">
                              <div className="font-medium capitalize">{message.role}</div>
                              <div className="text-sm text-gray-600">{message.message}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedCall.analysis && (
                      <div>
                        <h4 className="font-medium mb-2">Analysis</h4>
                        <div className="space-y-2">
                          {selectedCall.analysis.summary && (
                            <div>
                              <h5 className="text-sm font-medium">Summary:</h5>
                              <p className="text-sm text-gray-600">{selectedCall.analysis.summary}</p>
                            </div>
                          )}
                          {selectedCall.analysis.successEvaluation && (
                            <div>
                              <h5 className="text-sm font-medium">Success Evaluation:</h5>
                              <p className="text-sm text-gray-600">{selectedCall.analysis.successEvaluation}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {selectedCall.costs && Array.isArray(selectedCall.costs) && (
                      <div>
                        <h4 className="font-medium mb-2">Cost Breakdown</h4>
                        <div className="space-y-1">
                          {selectedCall.costs.map((cost, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                              <span>{cost.type} ({cost.provider})</span>
                              <span>{formatCurrency(cost.cost || 0)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedCall.recording_url && (
                      <div>
                        <h4 className="font-medium mb-2">Recording</h4>
                        <Button onClick={() => playRecording(selectedCall.recording_url, selectedCall.id)}>
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Play Recording
                        </Button>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}

export default Analytics