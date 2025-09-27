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
    const { audioData, assistantId } = await req.json()

    if (!audioData) {
      throw new Error('Audio data is required')
    }

    if (!assistantId) {
      throw new Error('Assistant ID is required')
    }

    // Get API keys from environment
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }

    // Convert base64 audio to binary
    const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0))

    // Step 1: Convert speech to text using OpenAI Whisper
    const formData = new FormData()
    formData.append('file', new Blob([audioBuffer], { type: 'audio/webm' }), 'audio.webm')
    formData.append('model', 'whisper-1')

    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData,
    })

    if (!transcriptionResponse.ok) {
      const errorData = await transcriptionResponse.text()
      console.error('Transcription error:', errorData)
      throw new Error(`Transcription failed: ${transcriptionResponse.status}`)
    }

    const transcriptionData = await transcriptionResponse.json()
    const transcript = transcriptionData.text

    console.log('[ProcessSpeech] Transcript:', transcript)

    if (!transcript.trim()) {
      return new Response(
        JSON.stringify({ transcript: '', audioResponse: null }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    // Step 2: Get AI response using a simple system prompt
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful voice assistant. Keep your responses concise and conversational, suitable for speech. If asked about navigation, respond that you can help with that.'
          },
          {
            role: 'user',
            content: transcript
          }
        ],
        max_tokens: 150,
        temperature: 0.7,
      }),
    })

    if (!chatResponse.ok) {
      const errorData = await chatResponse.text()
      console.error('Chat completion error:', errorData)
      throw new Error(`Chat completion failed: ${chatResponse.status}`)
    }

    const chatData = await chatResponse.json()
    const aiResponse = chatData.choices[0].message.content

    console.log('[ProcessSpeech] AI Response:', aiResponse)

    // Step 3: Convert AI response to speech
    const speechResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: aiResponse,
        voice: 'alloy',
        response_format: 'mp3',
      }),
    })

    if (!speechResponse.ok) {
      const errorData = await speechResponse.text()
      console.error('Speech synthesis error:', errorData)
      throw new Error(`Speech synthesis failed: ${speechResponse.status}`)
    }

    // Convert audio buffer to base64
    const audioArrayBuffer = await speechResponse.arrayBuffer()
    const base64Audio = btoa(
      String.fromCharCode(...new Uint8Array(audioArrayBuffer))
    )

    return new Response(
      JSON.stringify({
        transcript: transcript,
        aiResponse: aiResponse,
        audioResponse: base64Audio
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  } catch (error: any) {
    console.error('Error in process-speech function:', error)
    return new Response(
      JSON.stringify({ error: error?.message || 'Unknown error' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})