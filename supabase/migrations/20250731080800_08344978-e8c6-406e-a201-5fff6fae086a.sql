-- Create assistants table
CREATE TABLE public.assistants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  vapi_assistant_id TEXT,
  name TEXT NOT NULL,
  welcome_message TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'en',
  voice_id TEXT NOT NULL,
  position TEXT NOT NULL DEFAULT 'right' CHECK (position IN ('left', 'right')),
  theme TEXT NOT NULL DEFAULT 'light' CHECK (theme IN ('light', 'dark')),
  status TEXT NOT NULL DEFAULT 'creating' CHECK (status IN ('creating', 'active', 'error')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.assistants ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own assistants" 
ON public.assistants 
FOR SELECT 
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can create their own assistants" 
ON public.assistants 
FOR INSERT 
WITH CHECK (auth.uid()::text = user_id);

CREATE POLICY "Users can update their own assistants" 
ON public.assistants 
FOR UPDATE 
USING (auth.uid()::text = user_id);

CREATE POLICY "Users can delete their own assistants" 
ON public.assistants 
FOR DELETE 
USING (auth.uid()::text = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_assistants_updated_at
BEFORE UPDATE ON public.assistants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create assistant_files table for uploaded documents
CREATE TABLE public.assistant_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assistant_id UUID NOT NULL REFERENCES public.assistants(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for assistant_files
ALTER TABLE public.assistant_files ENABLE ROW LEVEL SECURITY;

-- Create policies for assistant_files
CREATE POLICY "Users can view files for their assistants" 
ON public.assistant_files 
FOR SELECT 
USING (
  assistant_id IN (
    SELECT id FROM public.assistants WHERE user_id = auth.uid()::text
  )
);

CREATE POLICY "Users can create files for their assistants" 
ON public.assistant_files 
FOR INSERT 
WITH CHECK (
  assistant_id IN (
    SELECT id FROM public.assistants WHERE user_id = auth.uid()::text
  )
);