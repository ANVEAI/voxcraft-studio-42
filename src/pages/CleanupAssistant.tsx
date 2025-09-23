import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@clerk/clerk-react";

export default function CleanupAssistant() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();
  const { getToken } = useAuth();

  const cleanupAssistant = async () => {
    setIsLoading(true);
    setResult(null);
    
    try {
      const token = await getToken();
      if (!token) {
        throw new Error('No authentication token available');
      }

      // Use the "Caliente" assistant ID from the error
      const assistantId = "7f9aa882-8045-43bb-a625-476ba66eac95";

      const { data, error } = await supabase.functions.invoke('vapi-cleanup-assistant-tools', {
        body: { assistantId },
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (error) {
        throw error;
      }

      setResult(data);
      
      if (data.cleanupPerformed) {
        toast({
          title: "✅ Cleanup Successful",
          description: `Removed ${data.invalidToolIds.length} invalid tools from the assistant.`,
        });
      } else {
        toast({
          title: "✅ No Cleanup Needed",
          description: "All tools are valid and working correctly.",
        });
      }

    } catch (error: any) {
      console.error('Cleanup error:', error);
      toast({
        title: "❌ Cleanup Failed",
        description: error.message || 'An unexpected error occurred',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>🧹 VAPI Assistant Cleanup</CardTitle>
          <CardDescription>
            Fix the "Caliente" assistant by removing invalid tool references that are causing the 400 error.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <h3 className="font-semibold text-destructive mb-2">Current Issue:</h3>
            <p className="text-sm text-muted-foreground">
              The assistant has an invalid tool ID <code>469ceac5-0171-4bd0-87c9-0bdc0898a6fe</code> 
              that doesn't exist, causing VAPI calls to fail with a 400 error.
            </p>
          </div>

          <Button 
            onClick={cleanupAssistant} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "🔧 Cleaning up..." : "🧹 Cleanup Assistant Tools"}
          </Button>

          {result && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Cleanup Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div>
                    <strong>Valid Tools:</strong> {result.validToolIds.length}
                    {result.validToolIds.length > 0 && (
                      <ul className="ml-4 mt-1 text-xs text-muted-foreground">
                        {result.validToolIds.map((id: string) => (
                          <li key={id} className="font-mono">✅ {id}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  
                  <div>
                    <strong>Invalid Tools Removed:</strong> {result.invalidToolIds.length}
                    {result.invalidToolIds.length > 0 && (
                      <ul className="ml-4 mt-1 text-xs text-muted-foreground">
                        {result.invalidToolIds.map((id: string) => (
                          <li key={id} className="font-mono">❌ {id}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  
                  <div className="pt-2 border-t">
                    <strong>Status:</strong> {result.message}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-muted-foreground">
            <p><strong>What this does:</strong></p>
            <ul className="ml-4 space-y-1">
              <li>• Checks which tools currently exist in your VAPI account</li>
              <li>• Removes any invalid/stale tool references from the assistant</li>
              <li>• Keeps only working tools to prevent 400 errors</li>
              <li>• Tests the voice functionality after cleanup</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}