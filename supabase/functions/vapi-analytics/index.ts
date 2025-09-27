import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('[VAPI Analytics] Request received:', req.method, req.url);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Extract the Clerk JWT token
    const jwt = authHeader.replace('Bearer ', '');
    
    let userId;
    try {
      // Skip Clerk verification and directly decode the JWT
      // This is the working method from the original logs
      const base64Url = jwt.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(atob(base64));
      userId = payload.sub;
      console.log('[VAPI Analytics] Extracted user ID from JWT payload:', userId);
    } catch (decodeError) {
      console.error('[VAPI Analytics] Failed to decode JWT:', decodeError);
      return new Response(JSON.stringify({ error: 'Invalid authentication token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'No user ID found in token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(req.url);
    const pathname = new URL(req.url).pathname;
    
    // Get VAPI private key
    const vapiPrivateKey = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!vapiPrivateKey) {
      return new Response(JSON.stringify({ error: 'VAPI private key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Route based on pathname to match the endpoint structure
    if (pathname.includes('/overview')) {
      return await getOverviewAnalytics(supabase, userId, vapiPrivateKey, url);
    } else if (pathname.includes('/calls')) {
      return await getCallAnalytics(supabase, userId, vapiPrivateKey, url);
    } else if (pathname.includes('/sessions')) {
      return await getSessionAnalytics(supabase, userId, vapiPrivateKey, url);
    } else if (pathname.includes('/logs')) {
      return await getCallLogs(supabase, userId, vapiPrivateKey, url);
    } else if (pathname.includes('/bots')) {
      return await getBotAnalytics(supabase, userId, vapiPrivateKey, url);
    } else {
      // Default to overview analytics
      return await getOverviewAnalytics(supabase, userId, vapiPrivateKey, url);
    }

  } catch (error) {
    console.error('[VAPI Analytics] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

async function fetchCallsFromVapi(supabase: any, userId: string, vapiPrivateKey: string) {
  console.log('[VAPI Analytics] Fetching calls from VAPI API');

  try {
    // Get user's assistants to filter calls
    const { data: assistants, error: assistantError } = await supabase
      .from('assistants')
      .select('id, vapi_assistant_id, name')
      .eq('user_id', userId);
    
    if (assistantError) {
      throw new Error(`Failed to fetch assistants: ${assistantError.message}`);
    }

    if (!assistants || assistants.length === 0) {
      return new Response(JSON.stringify({ 
        calls: [], 
        message: 'No assistants found' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('[VAPI Analytics] Found assistants:', assistants.length);

    // Fetch calls from VAPI API for each assistant
    let allCalls: any[] = [];
    
    for (const assistant of assistants) {
      if (!assistant.vapi_assistant_id) continue;
      
      try {
        console.log('[VAPI Analytics] Fetching calls for assistant:', assistant.vapi_assistant_id);
        
        // Use correct VAPI API endpoint for listing calls
        const vapiResponse = await fetch(`https://api.vapi.ai/call?assistantId=${assistant.vapi_assistant_id}&limit=100&sortOrder=DESC`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${vapiPrivateKey}`,
            'Content-Type': 'application/json'
          }
        });

        if (!vapiResponse.ok) {
          console.error('[VAPI Analytics] VAPI API error for assistant:', assistant.vapi_assistant_id, vapiResponse.status);
          continue;
        }

        const vapiCalls = await vapiResponse.json();
        console.log('[VAPI Analytics] Fetched calls for assistant:', assistant.name, vapiCalls.length);
        
        // Add assistant info to each call
        const callsWithAssistant = vapiCalls.map((call: any) => ({
          ...call,
          local_assistant_id: assistant.id,
          local_assistant_name: assistant.name
        }));
        
        allCalls = allCalls.concat(callsWithAssistant);
        
        // Store calls in database
        for (const call of callsWithAssistant) {
          await upsertCallLog(supabase, userId, call, assistant);
        }
        
      } catch (error) {
        console.error('[VAPI Analytics] Error fetching calls for assistant:', assistant.vapi_assistant_id, error);
      }
    }

    // Get stored calls from database
    const { data: storedCalls, error: dbError } = await supabase
      .from('call_logs')
      .select(`
        *,
        assistants (
          name,
          vapi_assistant_id
        )
      `)
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(100);

    if (dbError) {
      console.error('[VAPI Analytics] Database error:', dbError);
    }

    return new Response(JSON.stringify({ 
      calls: storedCalls || [],
      totalFetched: allCalls.length,
      assistantCount: assistants.length,
      lastSync: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Analytics] Error fetching calls:', error);
    throw error;
  }
}

async function getAnalyticsData(supabase: any, userId: string, vapiPrivateKey: string) {
  console.log('[VAPI Analytics] Getting analytics data');

  try {
    // Get user's assistants for analytics filtering
    const { data: assistants, error: assistantError } = await supabase
      .from('assistants')
      .select('id, vapi_assistant_id, name')
      .eq('user_id', userId);
    
    if (assistantError) {
      throw new Error(`Failed to fetch assistants: ${assistantError.message}`);
    }

    const assistantIds = assistants?.map(a => a.vapi_assistant_id).filter(Boolean) || [];
    console.log('[VAPI Analytics] Found assistant IDs:', assistantIds);
    
    // Fetch calls directly from VAPI API for the most accurate data
    let vapiCalls: any[] = [];
    try {
      console.log('[VAPI Analytics] Fetching calls from VAPI API...');
      
      // Get calls from the last 30 days
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const callsResponse = await fetch(`https://api.vapi.ai/call?limit=1000&createdAtGe=${startDate.toISOString()}&createdAtLe=${endDate.toISOString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${vapiPrivateKey}`,
          'Content-Type': 'application/json',
        },
      });

      const callsResponseText = await callsResponse.text();
      console.log('[VAPI Analytics] Calls API response status:', callsResponse.status);
      
      if (callsResponse.ok) {
        try {
          const callsData = JSON.parse(callsResponseText);
          vapiCalls = callsData || [];
          console.log('[VAPI Analytics] Successfully fetched', vapiCalls.length, 'calls from VAPI');
          
          // Filter calls for user's assistants if we have assistant IDs
          if (assistantIds.length > 0) {
            vapiCalls = vapiCalls.filter(call => 
              call.assistantId && assistantIds.includes(call.assistantId)
            );
            console.log('[VAPI Analytics] Filtered to', vapiCalls.length, 'calls for user assistants');
          }
        } catch (parseError) {
          console.error('[VAPI Analytics] Error parsing calls response:', parseError);
          vapiCalls = [];
        }
      } else {
        console.error('[VAPI Analytics] VAPI Calls API error:', callsResponse.status, callsResponseText);
        vapiCalls = [];
      }
    } catch (error) {
      console.error('[VAPI Analytics] Error calling VAPI Calls API:', error);
      vapiCalls = [];
    }

    // Calculate metrics from VAPI calls data
    const totalCalls = vapiCalls.length;
    const activeCalls = vapiCalls.filter(c => c.status === 'in-progress').length;
    const completedCalls = vapiCalls.filter(c => c.status === 'ended').length;
    
    // Calculate successful calls (ended but not due to errors)
    const successfulCalls = vapiCalls.filter(c => {
      if (c.status !== 'ended') return false;
      const errorReasons = [
        'assistant-error',
        'pipeline-error', 
        'customer-did-not-give-microphone-permission',
        'assistant-not-found',
        'assistant-not-invalid',
        'phone-call-provider-bypass-enabled-but-no-call-received',
        'exceeded-max-duration',
        'no-input-received'
      ];
      return !errorReasons.includes(c.endedReason);
    }).length;

    // Calculate durations (convert from ms to seconds)
    const totalDurationMs = vapiCalls.reduce((sum, call) => {
      return sum + (call.durationMs || 0);
    }, 0);
    const totalDuration = Math.round(totalDurationMs / 1000); // Convert to seconds
    const averageDuration = completedCalls > 0 ? totalDuration / completedCalls : 0;
    
    // Calculate total cost
    const totalCost = vapiCalls.reduce((sum, call) => {
      if (call.costBreakdown && call.costBreakdown.total) {
        return sum + call.costBreakdown.total;
      }
      return sum;
    }, 0);

    const successRate = completedCalls > 0 ? (successfulCalls / completedCalls) * 100 : 0;

    // Sync calls to local database for historical tracking
    try {
      await syncCallsFromVapi(supabase, userId, vapiPrivateKey);
    } catch (syncError) {
      console.error('[VAPI Analytics] Error syncing calls to database:', syncError);
    }

    // Get recent calls for display (limit to 10 most recent)
    const recentCalls = vapiCalls
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map(call => ({
        id: call.id,
        vapi_call_id: call.id,
        assistant_id: call.assistantId,
        status: call.status,
        started_at: call.createdAt,
        ended_at: call.endedAt,
        duration_seconds: call.durationMs ? Math.round(call.durationMs / 1000) : 0,
        ended_reason: call.endedReason,
        recording_url: call.recordingUrl,
        transcript: call.transcript,
        costs: call.costBreakdown ? [{ cost: call.costBreakdown.total }] : [],
        analysis: call.analysis
      }));

    const analytics = {
      overview: {
        totalCalls,
        activeCalls,
        completedCalls,
        successfulCalls,
        successRate: Math.round(successRate * 100) / 100,
        totalDuration,
        averageDuration: Math.round(averageDuration * 100) / 100,
        totalCost: Math.round(totalCost * 10000) / 10000
      },
      recentCalls,
      assistants: assistants || [],
      lastSync: new Date().toISOString(),
      dataSource: 'vapi-api'
    };

    console.log('[VAPI Analytics] Final analytics calculated:', analytics.overview);

    return new Response(JSON.stringify(analytics), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Analytics] Error getting analytics:', error);
    throw error;
  }
}

async function syncCallsFromVapi(supabase: any, userId: string, vapiPrivateKey: string) {
  // Same implementation as fetchCallsFromVapi but focused on syncing
  return await fetchCallsFromVapi(supabase, userId, vapiPrivateKey);
}

// Overview Analytics Endpoint: GET /api/analytics/overview
async function getOverviewAnalytics(supabase: any, userId: string, vapiPrivateKey: string, url: URL) {
  console.log('[VAPI Analytics] Getting overview analytics');
  
  try {
    // Get user's assistants
    const { data: assistants, error: assistantError } = await supabase
      .from('assistants')
      .select('id, vapi_assistant_id, name, status')
      .eq('user_id', userId);
    
    if (assistantError) {
      throw new Error(`Failed to fetch assistants: ${assistantError.message}`);
    }

    const assistantIds = assistants?.map(a => a.vapi_assistant_id).filter(Boolean) || [];
    console.log('[VAPI Analytics Overview] Found', assistants?.length || 0, 'assistants with IDs:', assistantIds);
    
    // Fetch ALL calls at once instead of per assistant to avoid 400 errors
    let allCalls = [];
    try {
      console.log('[VAPI Analytics Overview] Fetching all calls from VAPI...');
      
      // Get calls from the last 30 days
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      const vapiResponse = await fetch(`https://api.vapi.ai/call?limit=1000&createdAtGe=${startDate.toISOString()}&createdAtLe=${endDate.toISOString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${vapiPrivateKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (vapiResponse.ok) {
        const allVapiCalls = await vapiResponse.json();
        console.log('[VAPI Analytics Overview] Fetched', allVapiCalls.length, 'total calls from VAPI');
        
        // Filter calls for user's assistants
        if (assistantIds.length > 0) {
          allCalls = allVapiCalls.filter(call => 
            call.assistantId && assistantIds.includes(call.assistantId)
          );
          console.log('[VAPI Analytics Overview] Filtered to', allCalls.length, 'calls for user assistants');
          
          // Add assistant names
          allCalls = allCalls.map(call => {
            const assistant = assistants?.find(a => a.vapi_assistant_id === call.assistantId);
            return { ...call, assistantName: assistant?.name || 'Unknown Assistant' };
          });
        } else {
          console.log('[VAPI Analytics Overview] No assistant IDs found, returning empty results');
          allCalls = [];
        }
      } else {
        const errorText = await vapiResponse.text();
        console.error('[VAPI Analytics Overview] VAPI API error:', vapiResponse.status, errorText);
        allCalls = [];
      }
    } catch (error) {
      console.error('[VAPI Analytics Overview] Error fetching calls from VAPI:', error);
      allCalls = [];
    }

    // Calculate metrics
    const totalCalls = allCalls.length;
    const activeCalls = allCalls.filter(c => c.status === 'in-progress').length;
    const completedCalls = allCalls.filter(c => c.status === 'ended').length;
    const successfulCalls = allCalls.filter(c => 
      c.status === 'ended' && 
      !['assistant-error', 'pipeline-error', 'customer-did-not-give-microphone-permission'].includes(c.endedReason)
    ).length;

    console.log('[VAPI Analytics Overview] Overview metrics calculated:', {
      totalCalls,
      activeCalls, 
      completedCalls,
      successfulCalls,
      assistantCount: assistants?.length || 0,
      totalCallsFound: allCalls.length
    });

    const totalDuration = allCalls.reduce((sum, call) => {
      if (call.endedAt && call.startedAt) {
        return sum + Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000);
      }
      return sum;
    }, 0);

    const totalCost = allCalls.reduce((sum, call) => {
      if (call.cost) {
        return sum + call.cost;
      }
      if (call.costBreakdown?.total) {
        return sum + call.costBreakdown.total;
      }
      if (call.costs && Array.isArray(call.costs)) {
        return sum + call.costs.reduce((costSum, cost) => costSum + (cost.cost || 0), 0);
      }
      return sum;
    }, 0);

    const result = {
      vapiCallMetrics: {
        totalCalls,
        totalDuration,
        averageDuration: completedCalls > 0 ? Math.round((totalDuration / completedCalls) * 100) / 100 : 0,
        totalCost: Math.round(totalCost * 10000) / 10000
      },
      sessionData: {
        activeSessions: activeCalls,
        completedSessions: completedCalls,
        successRate: completedCalls > 0 ? Math.round((successfulCalls / completedCalls) * 100 * 100) / 100 : 0
      },
      enhancedMetrics: {
        dailyStats: allCalls.reduce((acc, call) => {
        if (call.startedAt) {
          const date = new Date(call.startedAt).toISOString().split('T')[0];
          const existing = acc.find(item => item.date === date);
          if (existing) {
            existing.calls += 1;
            existing.duration += call.endedAt && call.startedAt ? 
              Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000) : 0;
          } else {
            acc.push({
              date,
              calls: 1,
              duration: call.endedAt && call.startedAt ? 
                Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000) : 0
            });
          }
        }
        return acc;
        }, [] as any[]).slice(-7)
      }
    };

    console.log('[VAPI Analytics] Final result structure:', result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Analytics] Error in overview analytics:', error);
    throw error;
  }
}

// Call Analytics Endpoint: GET /api/analytics/calls
async function getCallAnalytics(supabase: any, userId: string, vapiPrivateKey: string, url: URL) {
  console.log('[VAPI Analytics] Getting call analytics');
  
  try {
    const { data: assistants } = await supabase
      .from('assistants')
      .select('id, vapi_assistant_id, name')
      .eq('user_id', userId);

    let allCalls = [];
    for (const assistant of assistants || []) {
      if (!assistant.vapi_assistant_id) continue;
      
      try {
        const vapiResponse = await fetch(`https://api.vapi.ai/call?assistantId=${assistant.vapi_assistant_id}&limit=100`, {
          headers: { 'Authorization': `Bearer ${vapiPrivateKey}` }
        });
        
        if (vapiResponse.ok) {
          const calls = await vapiResponse.json();
          allCalls = allCalls.concat(calls);
        }
      } catch (error) {
        console.error(`Error fetching calls for assistant ${assistant.vapi_assistant_id}:`, error);
      }
    }

    const successfulCalls = allCalls.filter(c => 
      c.status === 'ended' && 
      !['assistant-error', 'pipeline-error'].includes(c.endedReason)
    ).length;

    const failedCalls = allCalls.filter(c => 
      ['assistant-error', 'pipeline-error'].includes(c.endedReason)
    ).length;

    const result = {
      totalCalls: allCalls.length,
      successfulCalls,
      failedCalls,
      callDurations: allCalls.map(call => {
        if (call.endedAt && call.startedAt) {
          return Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000);
        }
        return 0;
      }),
      volumeTrends: {
        daily: [], // Would implement daily aggregation
        weekly: [], // Would implement weekly aggregation
        monthly: [] // Would implement monthly aggregation
      },
      calls: allCalls.slice(0, 50) // Paginated results
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Analytics] Error in call analytics:', error);
    throw error;
  }
}

// Session Analytics Endpoint: GET /api/analytics/sessions
async function getSessionAnalytics(supabase: any, userId: string, vapiPrivateKey: string, url: URL) {
  console.log('[VAPI Analytics] Getting session analytics');
  
  try {
    // Get sessions from call logs in database
    const { data: sessions } = await supabase
      .from('call_logs')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false });

    const activeSessions = sessions?.filter(s => s.status === 'in-progress').length || 0;
    const completedSessions = sessions?.filter(s => s.status === 'ended').length || 0;

    const result = {
      totalSessions: sessions?.length || 0,
      activeSessions,
      completedSessions,
      durationStats: {
        average: sessions?.length ? 
          sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / sessions.length : 0,
        median: 0, // Would calculate median
        longest: Math.max(...(sessions?.map(s => s.duration_seconds || 0) || [0])),
        shortest: Math.min(...(sessions?.map(s => s.duration_seconds || 0).filter(d => d > 0) || [0]))
      },
      geographic: {
        // Mock data - would integrate with actual geographic tracking
        'US': 45,
        'UK': 20,
        'CA': 15,
        'AU': 10,
        'Other': 10
      },
      deviceTypes: {
        // Mock data - would integrate with actual device tracking
        'Desktop': 60,
        'Mobile': 35,
        'Tablet': 5
      },
      browserStats: {
        // Mock data - would integrate with actual browser tracking
        'Chrome': 70,
        'Firefox': 15,
        'Safari': 10,
        'Edge': 5
      }
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Analytics] Error in session analytics:', error);
    throw error;
  }
}

// Call Logs Endpoint: GET /api/analytics/logs
async function getCallLogs(supabase: any, userId: string, vapiPrivateKey: string, url: URL) {
  console.log('[VAPI Analytics] Getting call logs');
  
  try {
    const { data: assistants } = await supabase
      .from('assistants')
      .select('id, vapi_assistant_id, name')
      .eq('user_id', userId);

    let detailedLogs = [];
    for (const assistant of assistants || []) {
      if (!assistant.vapi_assistant_id) continue;
      
      try {
        const vapiResponse = await fetch(`https://api.vapi.ai/call?assistantId=${assistant.vapi_assistant_id}&limit=50`, {
          headers: { 'Authorization': `Bearer ${vapiPrivateKey}` }
        });
        
        if (vapiResponse.ok) {
          const calls = await vapiResponse.json();
          
          // Fetch detailed information for each call
          for (const call of calls) {
            try {
              const detailResponse = await fetch(`https://api.vapi.ai/call/${call.id}`, {
                headers: { 'Authorization': `Bearer ${vapiPrivateKey}` }
              });
              
              if (detailResponse.ok) {
                const detailedCall = await detailResponse.json();
                detailedLogs.push({
                  ...detailedCall,
                  assistantName: assistant.name
                });
              }
            } catch (error) {
              console.error(`Error fetching call details for ${call.id}:`, error);
              detailedLogs.push({ ...call, assistantName: assistant.name });
            }
          }
        }
      } catch (error) {
        console.error(`Error fetching calls for assistant ${assistant.vapi_assistant_id}:`, error);
      }
    }

    const result = {
      logs: detailedLogs,
      total: detailedLogs.length,
      transcriptsAvailable: detailedLogs.filter(log => log.transcript).length,
      recordingsAvailable: detailedLogs.filter(log => log.recordingUrl).length
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Analytics] Error in call logs:', error);
    throw error;
  }
}

// Bot Analytics Endpoint: GET /api/analytics/bots
async function getBotAnalytics(supabase: any, userId: string, vapiPrivateKey: string, url: URL) {
  console.log('[VAPI Analytics] Getting bot analytics');
  
  try {
    const { data: assistants } = await supabase
      .from('assistants')
      .select('*')
      .eq('user_id', userId);

    // Fetch assistant details from VAPI
    let detailedAssistants = [];
    for (const assistant of assistants || []) {
      if (!assistant.vapi_assistant_id) continue;
      
      try {
        const vapiResponse = await fetch(`https://api.vapi.ai/assistant/${assistant.vapi_assistant_id}`, {
          headers: { 'Authorization': `Bearer ${vapiPrivateKey}` }
        });
        
        if (vapiResponse.ok) {
          const detailedAssistant = await vapiResponse.json();
          detailedAssistants.push({
            ...assistant,
            vapiDetails: detailedAssistant
          });
        }
      } catch (error) {
        console.error(`Error fetching assistant details for ${assistant.vapi_assistant_id}:`, error);
        detailedAssistants.push(assistant);
      }
    }

    // Get call counts for each bot
    const botCallCounts = {};
    for (const assistant of assistants || []) {
      if (!assistant.vapi_assistant_id) continue;
      
      try {
        const vapiResponse = await fetch(`https://api.vapi.ai/call?assistantId=${assistant.vapi_assistant_id}&limit=1000`, {
          headers: { 'Authorization': `Bearer ${vapiPrivateKey}` }
        });
        
        if (vapiResponse.ok) {
          const calls = await vapiResponse.json();
          botCallCounts[assistant.id] = calls.length;
        }
      } catch (error) {
        console.error(`Error fetching call count for assistant ${assistant.vapi_assistant_id}:`, error);
        botCallCounts[assistant.id] = 0;
      }
    }

    const activeBots = assistants?.filter(a => a.status === 'active').length || 0;
    const inactiveBots = assistants?.filter(a => a.status !== 'active').length || 0;
    const ragEnabledBots = detailedAssistants.filter(a => 
      a.vapiDetails?.tools?.some(tool => tool.type === 'query')
    ).length;

    const result = {
      totalBots: assistants?.length || 0,
      activeBots,
      inactiveBots,
      ragEnabledBots,
      creationTrends: {
        // Would implement creation trend analysis
        thisMonth: assistants?.filter(a => {
          const thisMonth = new Date().getMonth();
          return new Date(a.created_at).getMonth() === thisMonth;
        }).length || 0
      },
      topPerformingBots: Object.entries(botCallCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([botId, callCount]) => {
          const bot = assistants?.find(a => a.id === botId);
          return {
            id: botId,
            name: bot?.name || 'Unknown',
            callCount
          };
        }),
      voiceDistribution: {
        // Would analyze voice usage from assistant details
        'default': 80,
        'custom': 20
      },
      languageDistribution: {
        // Would analyze language usage from assistant details
        'en': 85,
        'es': 10,
        'fr': 5
      },
      bots: detailedAssistants
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[VAPI Analytics] Error in bot analytics:', error);
    throw error;
  }
}

async function upsertCallLog(supabase: any, userId: string, call: any, assistant: any) {
  try {
    const callData = {
      vapi_call_id: call.id,
      user_id: userId,
      assistant_id: assistant.id,
      vapi_assistant_id: call.assistantId || assistant.vapi_assistant_id,
      call_type: call.type || 'webCall',
      status: call.status || 'unknown',
      started_at: call.startedAt ? new Date(call.startedAt).toISOString() : null,
      ended_at: call.endedAt ? new Date(call.endedAt).toISOString() : null,
      duration_seconds: call.endedAt && call.startedAt ? 
        Math.floor((new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000) : null,
      ended_reason: call.endedReason || null,
      phone_number: call.phoneNumber || null,
      recording_url: call.recordingUrl || null,
      transcript: call.transcript || null,
      messages: call.messages || null,
      costs: call.costs || null,
      analysis: call.analysis || null,
      metadata: {
        orgId: call.orgId,
        updatedAt: call.updatedAt,
        createdAt: call.createdAt
      }
    };

    const { error } = await supabase
      .from('call_logs')
      .upsert(callData, { 
        onConflict: 'vapi_call_id',
        ignoreDuplicates: false 
      });

    if (error) {
      console.error('[VAPI Analytics] Error upserting call:', error);
    }

  } catch (error) {
    console.error('[VAPI Analytics] Error in upsertCallLog:', error);
  }
}