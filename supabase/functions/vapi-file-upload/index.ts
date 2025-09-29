import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper function to parse JWT token and extract user_id
function parseClerkToken(token: string): string | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const payload = JSON.parse(atob(parts[1]));
    return payload.sub || null;
  } catch (error) {
    console.error('Error parsing token:', error);
    return null;
  }
}

serve(async (req) => {
  console.log(`${req.method} /vapi-file-upload`);

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get user authentication
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const userId = parseClerkToken(token);
    if (!userId) {
      throw new Error('Invalid authentication token');
    }

    // Get VAPI private key
    const vapiPrivateKey = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!vapiPrivateKey) {
      throw new Error('VAPI_PRIVATE_KEY not configured');
    }

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const assistantId = formData.get('assistantId') as string;

    if (!file) {
      throw new Error('No file provided');
    }

    if (!assistantId) {
      throw new Error('No assistant ID provided');
    }

    // Validate file type and size
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
      throw new Error(`File type ${file.type} not supported. Allowed types: ${allowedTypes.join(', ')}`);
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('File size must be less than 10MB');
    }

    console.log(`Uploading file: ${file.name}, size: ${file.size}, type: ${file.type}`);

    // Upload file to VAPI
    const uploadFormData = new FormData();
    uploadFormData.append('file', file);

    const vapiResponse = await fetch('https://api.vapi.ai/file', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${vapiPrivateKey}`,
      },
      body: uploadFormData,
    });

    if (!vapiResponse.ok) {
      const errorText = await vapiResponse.text();
      console.error('VAPI upload error:', errorText);
      throw new Error(`Failed to upload file to VAPI: ${vapiResponse.status} ${errorText}`);
    }

    const vapiFileData = await vapiResponse.json();
    console.log('VAPI file upload response:', vapiFileData);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Save file metadata to our database
    const { data: fileRecord, error: dbError } = await supabase
      .from('assistant_files')
      .insert({
        assistant_id: assistantId,
        user_id: userId,
        filename: file.name,
        file_type: file.type,
        file_size: file.size,
        storage_path: vapiFileData.id, // Store VAPI file ID as storage path
        processed: vapiFileData.status === 'done'
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error(`Failed to save file metadata: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        file: {
          id: fileRecord.id,
          vapiFileId: vapiFileData.id,
          filename: file.name,
          fileType: file.type,
          fileSize: file.size,
          status: vapiFileData.status,
          processed: vapiFileData.status === 'done'
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in vapi-file-upload function:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});