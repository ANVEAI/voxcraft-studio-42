-- Create tables for VAPI analytics and call logs

-- Table to store call logs from VAPI
CREATE TABLE public.call_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vapi_call_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  assistant_id UUID REFERENCES public.assistants(id),
  vapi_assistant_id TEXT,
  call_type TEXT NOT NULL, -- 'inboundPhoneCall', 'outboundPhoneCall', 'webCall'
  status TEXT NOT NULL, -- 'queued', 'ringing', 'in-progress', 'forwarding', 'ended'
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  ended_reason TEXT,
  phone_number TEXT,
  recording_url TEXT,
  transcript JSONB,
  messages JSONB,
  costs JSONB,
  analysis JSONB, -- VAPI call analysis results
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Table for call analytics aggregated data
CREATE TABLE public.call_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  assistant_id UUID REFERENCES public.assistants(id),
  date DATE NOT NULL,
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  failed_calls INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  total_cost DECIMAL(10,4) DEFAULT 0,
  average_duration_seconds DECIMAL(8,2) DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, assistant_id, date)
);

-- Enable RLS on call_logs
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for call_logs
CREATE POLICY "Users can view their own call logs"
ON public.call_logs
FOR SELECT
USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own call logs"
ON public.call_logs
FOR INSERT
WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own call logs"
ON public.call_logs
FOR UPDATE
USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete their own call logs"
ON public.call_logs
FOR DELETE
USING (user_id = auth.jwt() ->> 'sub');

-- Enable RLS on call_analytics
ALTER TABLE public.call_analytics ENABLE ROW LEVEL SECURITY;

-- Create policies for call_analytics
CREATE POLICY "Users can view their own call analytics"
ON public.call_analytics
FOR SELECT
USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can insert their own call analytics"
ON public.call_analytics
FOR INSERT
WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can update their own call analytics"
ON public.call_analytics
FOR UPDATE
USING (user_id = auth.jwt() ->> 'sub');

CREATE POLICY "Users can delete their own call analytics"
ON public.call_analytics
FOR DELETE
USING (user_id = auth.jwt() ->> 'sub');

-- Create indexes for better performance
CREATE INDEX idx_call_logs_user_id ON public.call_logs(user_id);
CREATE INDEX idx_call_logs_assistant_id ON public.call_logs(assistant_id);
CREATE INDEX idx_call_logs_vapi_call_id ON public.call_logs(vapi_call_id);
CREATE INDEX idx_call_logs_started_at ON public.call_logs(started_at);
CREATE INDEX idx_call_logs_status ON public.call_logs(status);

CREATE INDEX idx_call_analytics_user_id ON public.call_analytics(user_id);
CREATE INDEX idx_call_analytics_assistant_id ON public.call_analytics(assistant_id);
CREATE INDEX idx_call_analytics_date ON public.call_analytics(date);

-- Create trigger for updated_at timestamps
CREATE TRIGGER update_call_logs_updated_at
  BEFORE UPDATE ON public.call_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_call_analytics_updated_at
  BEFORE UPDATE ON public.call_analytics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();