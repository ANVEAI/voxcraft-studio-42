import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { assistantId, action } = await req.json()

    if (!assistantId) {
      throw new Error('Assistant ID is required')
    }

    // Get VAPI private key from environment
    const vapiPrivateKey = Deno.env.get('VAPI_PRIVATE_KEY')
    if (!vapiPrivateKey) {
      throw new Error('VAPI_PRIVATE_KEY not configured')
    }

    let response

    if (action === 'start') {
      // Start a VAPI call
      response = await fetch('https://api.vapi.ai/call/web', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${vapiPrivateKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assistantId: assistantId,
        }),
      })
    } else if (action === 'stop') {
      // Stop the call
      const { callId } = await req.json()
      if (!callId) {
        throw new Error('Call ID is required for stop action')
      }
      
      response = await fetch(`https://api.vapi.ai/call/${callId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${vapiPrivateKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'ended'
        }),
      })
    } else {
      throw new Error('Invalid action. Use "start" or "stop"')
    }

    if (!response.ok) {
      const errorData = await response.text()
      console.error('VAPI API Error:', errorData)
      throw new Error(`VAPI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()

    return new Response(
      JSON.stringify(data),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error) {
    console.error('Error in vapi-call function:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})