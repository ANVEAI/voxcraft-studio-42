-- Create enum for embed status if needed in future
-- Create embed_mappings table - main mapping table
CREATE TABLE public.embed_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  embed_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  vapi_assistant_id TEXT NOT NULL,
  api_key TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  domain_whitelist TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create embed_mapping_history table - audit trail
CREATE TABLE public.embed_mapping_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  embed_id TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  old_vapi_assistant_id TEXT,
  new_vapi_assistant_id TEXT,
  old_api_key TEXT,
  new_api_key TEXT,
  change_reason TEXT,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.embed_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embed_mapping_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for embed_mappings
CREATE POLICY "Users can view their own embed mappings"
  ON public.embed_mappings
  FOR SELECT
  USING (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can insert their own embed mappings"
  ON public.embed_mappings
  FOR INSERT
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can update their own embed mappings"
  ON public.embed_mappings
  FOR UPDATE
  USING (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can delete their own embed mappings"
  ON public.embed_mappings
  FOR DELETE
  USING (user_id = (auth.jwt() ->> 'sub'::text));

-- RLS Policies for embed_mapping_history (append-only, users can view their own)
CREATE POLICY "Users can view their own embed mapping history"
  ON public.embed_mapping_history
  FOR SELECT
  USING (changed_by = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can insert embed mapping history"
  ON public.embed_mapping_history
  FOR INSERT
  WITH CHECK (changed_by = (auth.jwt() ->> 'sub'::text));

-- Add trigger for updating updated_at on embed_mappings
CREATE TRIGGER update_embed_mappings_updated_at
  BEFORE UPDATE ON public.embed_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for faster lookups
CREATE INDEX idx_embed_mappings_embed_id ON public.embed_mappings(embed_id);
CREATE INDEX idx_embed_mappings_user_id ON public.embed_mappings(user_id);
CREATE INDEX idx_embed_mapping_history_embed_id ON public.embed_mapping_history(embed_id);