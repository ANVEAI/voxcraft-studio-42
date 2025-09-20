import { useState, useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileText, Trash2, Database, Brain } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AssistantFile {
  id: string;
  filename: string;
  file_type: string;
  file_size: number;
  processed: boolean;
  storage_path: string; // VAPI file ID
  created_at: string;
}

interface Assistant {
  id: string;
  name: string;
  vapi_assistant_id: string;
}

const QueryTool = () => {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [selectedAssistant, setSelectedAssistant] = useState<string>("");
  const [files, setFiles] = useState<AssistantFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [creatingTool, setCreatingTool] = useState(false);
  const [toolName, setToolName] = useState("");
  const [toolDescription, setToolDescription] = useState("");

  useEffect(() => {
    fetchAssistants();
  }, []);

  useEffect(() => {
    if (selectedAssistant) {
      fetchFiles();
    }
  }, [selectedAssistant]);

  const fetchAssistants = async () => {
    try {
      const { data, error } = await supabase
        .from('assistants')
        .select('id, name, vapi_assistant_id')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAssistants(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const fetchFiles = async () => {
    if (!selectedAssistant) return;

    try {
      const { data, error } = await supabase
        .from('assistant_files')
        .select('*')
        .eq('assistant_id', selectedAssistant)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedAssistant) {
      toast({
        title: "Error",
        description: "Please select an assistant first",
        variant: "destructive",
      });
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'text/csv',
      'application/json',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a text, PDF, CSV, JSON, or Word document",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "File size must be less than 10MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('assistantId', selectedAssistant);

      const response = await supabase.functions.invoke('vapi-file-upload', {
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.error) throw response.error;

      toast({
        title: "Success",
        description: "File uploaded successfully!",
      });

      fetchFiles();
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleCreateQueryTool = async () => {
    if (!selectedAssistant || !toolName || files.length === 0) {
      toast({
        title: "Error",
        description: "Please select an assistant, provide a tool name, and upload at least one file",
        variant: "destructive",
      });
      return;
    }

    setCreatingTool(true);

    try {
      const token = await getToken();
      const fileIds = files.map(f => f.storage_path); // These are VAPI file IDs

      const response = await supabase.functions.invoke('vapi-query-tool', {
        body: {
          assistantId: selectedAssistant,
          toolName,
          description: toolDescription || `Knowledge base for ${toolName}`,
          fileIds
        },
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.error) throw response.error;

      toast({
        title: "Success",
        description: "Query tool created and attached to assistant!",
      });

      setToolName("");
      setToolDescription("");
    } catch (error: any) {
      toast({
        title: "Failed to create query tool",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setCreatingTool(false);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      const { error } = await supabase
        .from('assistant_files')
        .delete()
        .eq('id', fileId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "File deleted successfully",
      });

      fetchFiles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">RAG Query Tool</h1>
        <p className="text-muted-foreground mt-2">
          Upload files and create knowledge bases for your voice assistants
        </p>
      </div>

      <div className="grid gap-6">
        {/* Assistant Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Select Assistant
            </CardTitle>
            <CardDescription>
              Choose which assistant to add knowledge base files to
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={selectedAssistant} onValueChange={setSelectedAssistant}>
              <SelectTrigger>
                <SelectValue placeholder="Select an assistant" />
              </SelectTrigger>
              <SelectContent>
                {assistants.map((assistant) => (
                  <SelectItem key={assistant.id} value={assistant.id}>
                    {assistant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* File Upload */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload Files
            </CardTitle>
            <CardDescription>
              Upload documents, PDFs, or text files for your knowledge base
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="file-upload">Choose File</Label>
                <Input
                  id="file-upload"
                  type="file"
                  onChange={handleFileUpload}
                  disabled={uploading || !selectedAssistant}
                  accept=".txt,.md,.pdf,.csv,.json,.doc,.docx"
                  className="mt-1"
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Supported formats: TXT, MD, PDF, CSV, JSON, DOC, DOCX (max 10MB)
                </p>
              </div>
              {uploading && (
                <p className="text-sm text-blue-600">Uploading file...</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Uploaded Files */}
        {selectedAssistant && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Uploaded Files ({files.length})
              </CardTitle>
              <CardDescription>
                Files in the knowledge base for this assistant
              </CardDescription>
            </CardHeader>
            <CardContent>
              {files.length === 0 ? (
                <p className="text-muted-foreground">No files uploaded yet</p>
              ) : (
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium">{file.filename}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatFileSize(file.file_size)} • {file.file_type} • 
                            {file.processed ? (
                              <span className="text-green-600"> Processed</span>
                            ) : (
                              <span className="text-yellow-600"> Processing</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteFile(file.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Create Query Tool */}
        {selectedAssistant && files.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Create Query Tool
              </CardTitle>
              <CardDescription>
                Create a knowledge base query tool from uploaded files
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="tool-name">Tool Name</Label>
                  <Input
                    id="tool-name"
                    value={toolName}
                    onChange={(e) => setToolName(e.target.value)}
                    placeholder="e.g., Product Knowledge, Support Docs"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="tool-description">Description (Optional)</Label>
                  <Textarea
                    id="tool-description"
                    value={toolDescription}
                    onChange={(e) => setToolDescription(e.target.value)}
                    placeholder="Describe when this knowledge base should be used..."
                    className="mt-1"
                  />
                </div>
                <Button
                  onClick={handleCreateQueryTool}
                  disabled={creatingTool || !toolName}
                  className="w-full"
                >
                  {creatingTool ? "Creating Tool..." : "Create Query Tool"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default QueryTool;