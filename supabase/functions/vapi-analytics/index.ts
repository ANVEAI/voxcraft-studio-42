// @ts-nocheck
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.53.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📥 Processing VAPI analytics request');

    const body = await req.json();
    const { timeframe = '7d', userId } = body;
    
    if (!userId) {
      console.error('❌ No userId provided');
      return new Response(JSON.stringify({ error: 'User ID is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log('🔄 Fetching analytics data for timeframe:', timeframe);

    const VAPI_PRIVATE_KEY = Deno.env.get('VAPI_PRIVATE_KEY');
    if (!VAPI_PRIVATE_KEY) {
      console.error('❌ VAPI_PRIVATE_KEY not configured');
      return new Response(JSON.stringify({ error: 'VAPI API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || 'https://mdkcdjltvfpthqudhhmx.supabase.co';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseServiceKey) {
      console.error('❌ SUPABASE_SERVICE_ROLE_KEY not configured');
      return new Response(JSON.stringify({ error: 'Database connection not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's assistants from our database
    const { data: assistants, error: assistantsError } = await supabase
      .from('assistants')
      .select('*')
      .eq('user_id', userId);

    if (assistantsError) {
      console.error('Database error fetching assistants:', assistantsError);
      return new Response(JSON.stringify({ error: 'Failed to fetch assistants from database' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`Found ${assistants?.length || 0} assistants for user`);

    if (!assistants || assistants.length === 0) {
      // Return empty analytics for users with no assistants
      return new Response(JSON.stringify({
        success: true,
        timeframe,
        data: {
          totalCalls: 0,
          totalDuration: 0,
          averageDuration: 0,
          totalCost: 0,
          activeCalls: 0,
          completedCalls: 0,
          successfulCalls: 0,
          failureRate: 0,
          dailyStats: [],
          topAssistants: [],
          callsByStatus: {
            'in-progress': 0,
            'ended': 0,
            'failed': 0
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calculate date range for filtering
    const now = new Date();
    let startDate = new Date();
    
    switch (timeframe) {
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Batch fetch VAPI calls for all assistants
    console.log('📡 Fetching VAPI analytics data...');
    
    let allCalls: any[] = [];
    const assistantCalls: any = {};
    
    try {
      // Process assistants in batches to avoid rate limits
      const batchSize = 5;
      for (let i = 0; i < assistants.length; i += batchSize) {
        const batch = assistants.slice(i, i + batchSize);
        
        const batchPromises = batch.map(async (assistant: any) => {
          try {
            const response = await fetch(`https://api.vapi.ai/call?assistantId=${assistant.vapi_assistant_id}&limit=100`, {
              headers: {
                'Authorization': `Bearer ${VAPI_PRIVATE_KEY}`,
                'Content-Type': 'application/json',
              },
            });

            if (response.ok) {
              const data = await response.json();
              const calls = data || [];
              assistantCalls[assistant.vapi_assistant_id] = calls;
              return calls;
            } else {
              console.warn(`Failed to fetch calls for assistant ${assistant.vapi_assistant_id}:`, response.status);
              assistantCalls[assistant.vapi_assistant_id] = [];
              return [];
            }
          } catch (error) {
            console.error(`Error fetching calls for assistant ${assistant.vapi_assistant_id}:`, error);
            assistantCalls[assistant.vapi_assistant_id] = [];
            return [];
          }
        });

        const batchResults = await Promise.all(batchPromises);
        batchResults.forEach(calls => {
          allCalls = allCalls.concat(calls);
        });

        // Small delay between batches to respect rate limits
        if (i + batchSize < assistants.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      console.error('Error in batch processing:', error);
    }

    // Filter calls by date range
    const filteredCalls = allCalls.filter((call: any) => {
      if (!call.createdAt) return false;
      const callDate = new Date(call.createdAt);
      return callDate >= startDate && callDate <= now;
    });

    console.log(`Found ${filteredCalls.length} calls in timeframe from ${allCalls.length} total calls`);

    // Calculate metrics
    const totalCalls = filteredCalls.length;
    const activeCalls = filteredCalls.filter((c: any) => c.status === 'in-progress').length;
    const completedCalls = filteredCalls.filter((c: any) => c.status === 'ended').length;
    const successfulCalls = filteredCalls.filter((c: any) => 
      c.status === 'ended' && (!c.endedReason || c.endedReason === 'assistant-ended' || c.endedReason === 'user-ended')
    ).length;

    const failureRate = totalCalls > 0 ? ((totalCalls - successfulCalls) / totalCalls) * 100 : 0;

    // Calculate total duration (in seconds)
    const totalDuration = filteredCalls.reduce((sum: any, call: any) => {
      if (call.startedAt && call.endedAt) {
        const duration = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
        return sum + duration;
      }
      return sum;
    }, 0);

    // Calculate total cost
    const totalCost = filteredCalls.reduce((sum: any, call: any) => {
      if (call.costs && Array.isArray(call.costs)) {
        return sum + call.costs.reduce((costSum: any, cost: any) => costSum + (cost.cost || 0), 0);
      }
      return sum;
    }, 0);

    const averageDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

    // Generate daily stats
    const dailyStatsMap: any = {};
    const dayCount = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)));
    
    // Initialize all days with zero values
    for (let d = 0; d < dayCount; d++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + d);
      const dateStr = date.toISOString().split('T')[0];
      dailyStatsMap[dateStr] = { date: dateStr, calls: 0, duration: 0, cost: 0 };
    }

    // Populate with actual data
    filteredCalls.forEach((call: any) => {
      if (call.createdAt) {
        const date = new Date(call.createdAt).toISOString().split('T')[0];
        if (dailyStatsMap[date]) {
          dailyStatsMap[date].calls += 1;
          
          if (call.startedAt && call.endedAt) {
            const duration = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
            dailyStatsMap[date].duration += duration;
          }
          
          if (call.costs && Array.isArray(call.costs)) {
            const callCost = call.costs.reduce((sum: any, cost: any) => sum + (cost.cost || 0), 0);
            dailyStatsMap[date].cost += callCost;
          }
        }
      }
    });

    const dailyStats = Object.values(dailyStatsMap).sort((a: any, b: any) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    // Get top assistants by call count
    const assistantCallCounts: any = {};
    assistants?.forEach((assistant: any) => {
      const calls = assistantCalls[assistant.vapi_assistant_id] || [];
      const filteredAssistantCalls = calls.filter((call: any) => {
        if (!call.createdAt) return false;
        const callDate = new Date(call.createdAt);
        return callDate >= startDate && callDate <= now;
      });
      
      if (filteredAssistantCalls.length > 0) {
        assistantCallCounts[assistant.id] = filteredAssistantCalls.length;
      }
    });

    const topAssistants = Object.entries(assistantCallCounts)
      .sort((a: any, b: any) => b[1] - a[1])
      .slice(0, 5)
      .map(([assistantId, callCount]: any) => {
        const assistant = assistants?.find((a: any) => a.id === assistantId);
        return {
          id: assistantId,
          name: assistant?.name || 'Unknown',
          calls: callCount
        };
      });

    // Group calls by status
    const callsByStatus = filteredCalls.reduce((acc: any, call: any) => {
      const status = call.status || 'unknown';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});

    const responseData = {
      success: true,
      timeframe,
      data: {
        totalCalls,
        totalDuration: Math.round(totalDuration),
        averageDuration: Math.round(averageDuration),
        totalCost: Number(totalCost.toFixed(4)),
        activeCalls,
        completedCalls,
        successfulCalls,
        failureRate: Number(failureRate.toFixed(2)),
        dailyStats,
        topAssistants,
        callsByStatus
      }
    };

    console.log('✅ Analytics data calculated successfully');
    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('💥 Error in vapi-analytics:', error);
    return new Response(JSON.stringify({ 
      error: (error as Error).message || 'Failed to fetch analytics data',
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});