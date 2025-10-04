import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Copy, Edit, History, RefreshCw, Trash2, Check, ExternalLink } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

interface EmbedMapping {
  id: string
  embed_id: string
  user_id: string
  vapi_assistant_id: string
  api_key: string
  name: string | null
  is_active: boolean
  domain_whitelist: string[] | null
  created_at: string
  updated_at: string
}

interface EmbedHistory {
  id: string
  embed_id: string
  changed_by: string
  old_vapi_assistant_id: string | null
  new_vapi_assistant_id: string | null
  old_api_key: string | null
  new_api_key: string | null
  change_reason: string | null
  changed_at: string
}

const EmbedManagement = () => {
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const navigate = useNavigate()
  const { toast } = useToast()
  
  const [embeds, setEmbeds] = useState<EmbedMapping[]>([])
  const [selectedEmbed, setSelectedEmbed] = useState<EmbedMapping | null>(null)
  const [embedHistory, setEmbedHistory] = useState<EmbedHistory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  
  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    vapi_assistant_id: '',
    api_key: '',
    is_active: true,
    domain_whitelist: '',
    change_reason: ''
  })

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      navigate('/auth')
    } else if (isSignedIn) {
      loadEmbeds()
    }
  }, [isLoaded, isSignedIn, navigate])

  const loadEmbeds = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('embed_mappings')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setEmbeds(data || [])
    } catch (error) {
      console.error('Error loading embeds:', error)
      toast({
        title: 'Error',
        description: 'Failed to load embed mappings',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadHistory = async (embedId: string) => {
    try {
      const { data, error } = await supabase
        .from('embed_mapping_history')
        .select('*')
        .eq('embed_id', embedId)
        .order('changed_at', { ascending: false })

      if (error) throw error
      setEmbedHistory(data || [])
    } catch (error) {
      console.error('Error loading history:', error)
      toast({
        title: 'Error',
        description: 'Failed to load embed history',
        variant: 'destructive'
      })
    }
  }

  const handleEditClick = (embed: EmbedMapping) => {
    setSelectedEmbed(embed)
    setEditForm({
      name: embed.name || '',
      vapi_assistant_id: embed.vapi_assistant_id,
      api_key: embed.api_key,
      is_active: embed.is_active,
      domain_whitelist: embed.domain_whitelist?.join('\n') || '',
      change_reason: ''
    })
    setIsEditDialogOpen(true)
  }

  const handleHistoryClick = async (embed: EmbedMapping) => {
    setSelectedEmbed(embed)
    await loadHistory(embed.embed_id)
    setIsHistoryDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!selectedEmbed || !user) return

    try {
      const oldAssistantId = selectedEmbed.vapi_assistant_id
      const oldApiKey = selectedEmbed.api_key

      // Update embed mapping
      const { error: updateError } = await supabase
        .from('embed_mappings')
        .update({
          name: editForm.name || null,
          vapi_assistant_id: editForm.vapi_assistant_id,
          api_key: editForm.api_key,
          is_active: editForm.is_active,
          domain_whitelist: editForm.domain_whitelist 
            ? editForm.domain_whitelist.split('\n').filter(d => d.trim()) 
            : null
        })
        .eq('embed_id', selectedEmbed.embed_id)

      if (updateError) throw updateError

      // Record history if assistant or API key changed
      if (oldAssistantId !== editForm.vapi_assistant_id || oldApiKey !== editForm.api_key) {
        const { error: historyError } = await supabase
          .from('embed_mapping_history')
          .insert({
            embed_id: selectedEmbed.embed_id,
            changed_by: user.id,
            old_vapi_assistant_id: oldAssistantId !== editForm.vapi_assistant_id ? oldAssistantId : null,
            new_vapi_assistant_id: oldAssistantId !== editForm.vapi_assistant_id ? editForm.vapi_assistant_id : null,
            old_api_key: oldApiKey !== editForm.api_key ? oldApiKey : null,
            new_api_key: oldApiKey !== editForm.api_key ? editForm.api_key : null,
            change_reason: editForm.change_reason || null
          })

        if (historyError) console.error('History recording failed:', historyError)
      }

      toast({
        title: 'Success',
        description: 'Embed mapping updated successfully'
      })

      setIsEditDialogOpen(false)
      loadEmbeds()
    } catch (error) {
      console.error('Error updating embed:', error)
      toast({
        title: 'Error',
        description: 'Failed to update embed mapping',
        variant: 'destructive'
      })
    }
  }

  const handleDeleteEmbed = async (embedId: string) => {
    if (!confirm('Are you sure you want to delete this embed mapping? This cannot be undone.')) return

    try {
      const { error } = await supabase
        .from('embed_mappings')
        .delete()
        .eq('embed_id', embedId)

      if (error) throw error

      toast({
        title: 'Success',
        description: 'Embed mapping deleted successfully'
      })

      loadEmbeds()
    } catch (error) {
      console.error('Error deleting embed:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete embed mapping',
        variant: 'destructive'
      })
    }
  }

  const copyToClipboard = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const generateEmbedCode = (embed: EmbedMapping) => {
    return `<!-- Load Supabase JS -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js"></script>

<!-- Load Voice Assistant -->
<script src="https://mdkcdjltvfpthqudhhmx.supabase.co/functions/v1/voice-assistant-embed-js?embedId=${embed.embed_id}&position=bottom-right&theme=light"></script>`
  }

  if (!isLoaded || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Dashboard
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Embed Management</h1>
              <p className="text-muted-foreground">Manage your voice assistant embeddings</p>
            </div>
          </div>
          <Button onClick={loadEmbeds}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Total Embeds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{embeds.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Active Embeds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {embeds.filter(e => e.is_active).length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Inactive Embeds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {embeds.filter(e => !e.is_active).length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Embeds Table */}
        <Card>
          <CardHeader>
            <CardTitle>Your Embed Mappings</CardTitle>
            <CardDescription>
              Manage assistant IDs, API keys, and domain restrictions for your embeds
            </CardDescription>
          </CardHeader>
          <CardContent>
            {embeds.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No embed mappings found</p>
                <Button onClick={() => navigate('/create-assistant')}>
                  Create Your First Assistant
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Embed ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>VAPI Assistant</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {embeds.map((embed) => (
                    <TableRow key={embed.id}>
                      <TableCell className="font-mono text-xs">
                        <div className="flex items-center gap-2">
                          {embed.embed_id}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(embed.embed_id, embed.embed_id)}
                          >
                            {copiedId === embed.embed_id ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{embed.name || 'Unnamed'}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {embed.vapi_assistant_id.substring(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <Badge variant={embed.is_active ? 'default' : 'secondary'}>
                          {embed.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(embed.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditClick(embed)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleHistoryClick(embed)}
                          >
                            <History className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => copyToClipboard(generateEmbedCode(embed), `code-${embed.embed_id}`)}
                          >
                            {copiedId === `code-${embed.embed_id}` ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteEmbed(embed.embed_id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Embed Mapping</DialogTitle>
              <DialogDescription>
                Update the VAPI assistant ID, API key, or configuration for this embed
              </DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="configuration">Configuration</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
              </TabsList>
              
              <TabsContent value="general" className="space-y-4">
                <div>
                  <Label htmlFor="name">Friendly Name</Label>
                  <Input
                    id="name"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="My Voice Assistant"
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="is_active">Active Status</Label>
                    <p className="text-sm text-muted-foreground">
                      Inactive embeds will not load on websites
                    </p>
                  </div>
                  <Switch
                    id="is_active"
                    checked={editForm.is_active}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, is_active: checked })}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="configuration" className="space-y-4">
                <div>
                  <Label htmlFor="vapi_assistant_id">VAPI Assistant ID</Label>
                  <Input
                    id="vapi_assistant_id"
                    value={editForm.vapi_assistant_id}
                    onChange={(e) => setEditForm({ ...editForm, vapi_assistant_id: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Change which VAPI bot this embed points to
                  </p>
                </div>
                
                <div>
                  <Label htmlFor="api_key">VAPI Public API Key</Label>
                  <Input
                    id="api_key"
                    type="password"
                    value={editForm.api_key}
                    onChange={(e) => setEditForm({ ...editForm, api_key: e.target.value })}
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Rotate the API key without updating customer embed code
                  </p>
                </div>
              </TabsContent>
              
              <TabsContent value="security" className="space-y-4">
                <div>
                  <Label htmlFor="domain_whitelist">Domain Whitelist (Optional)</Label>
                  <Textarea
                    id="domain_whitelist"
                    value={editForm.domain_whitelist}
                    onChange={(e) => setEditForm({ ...editForm, domain_whitelist: e.target.value })}
                    placeholder="example.com&#10;subdomain.example.com"
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    One domain per line. Leave empty to allow all domains.
                  </p>
                </div>
              </TabsContent>
            </Tabs>

            <div className="space-y-2">
              <Label htmlFor="change_reason">Change Reason (Optional)</Label>
              <Textarea
                id="change_reason"
                value={editForm.change_reason}
                onChange={(e) => setEditForm({ ...editForm, change_reason: e.target.value })}
                placeholder="Why are you making this change?"
                rows={2}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Change History</DialogTitle>
              <DialogDescription>
                View all changes made to this embed mapping
              </DialogDescription>
            </DialogHeader>
            
            {embedHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No changes recorded yet
              </div>
            ) : (
              <div className="space-y-4 max-h-[400px] overflow-y-auto">
                {embedHistory.map((history) => (
                  <Card key={history.id}>
                    <CardContent className="pt-4">
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="text-sm font-medium">
                              {new Date(history.changed_at).toLocaleString()}
                            </p>
                            {history.change_reason && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Reason: {history.change_reason}
                              </p>
                            )}
                          </div>
                        </div>
                        
                        {history.old_vapi_assistant_id && history.new_vapi_assistant_id && (
                          <div className="text-sm">
                            <p className="font-medium">Assistant ID Changed:</p>
                            <p className="font-mono text-xs text-muted-foreground">
                              {history.old_vapi_assistant_id} → {history.new_vapi_assistant_id}
                            </p>
                          </div>
                        )}
                        
                        {history.old_api_key && history.new_api_key && (
                          <div className="text-sm">
                            <p className="font-medium">API Key Rotated</p>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
            
            <DialogFooter>
              <Button onClick={() => setIsHistoryDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

export default EmbedManagement
