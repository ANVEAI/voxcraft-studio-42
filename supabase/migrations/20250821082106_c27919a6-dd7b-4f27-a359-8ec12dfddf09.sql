-- Fix RLS security vulnerability: Update assistants table policies
-- Drop existing insecure policies
DROP POLICY IF EXISTS "Users can create their own assistants" ON public.assistants;
DROP POLICY IF EXISTS "Users can delete their own assistants" ON public.assistants;
DROP POLICY IF EXISTS "Users can update their own assistants" ON public.assistants;
DROP POLICY IF EXISTS "Users can view their own assistants" ON public.assistants;

-- Create secure policies for assistants table
CREATE POLICY "Users can create their own assistants" 
ON public.assistants 
FOR INSERT 
WITH CHECK (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can view their own assistants" 
ON public.assistants 
FOR SELECT 
USING (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can update their own assistants" 
ON public.assistants 
FOR UPDATE 
USING (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can delete their own assistants" 
ON public.assistants 
FOR DELETE 
USING (user_id = (auth.jwt() ->> 'sub'::text));

-- Fix assistant_files table: Add user_id column and secure policies
-- First, add user_id column to assistant_files
ALTER TABLE public.assistant_files 
ADD COLUMN user_id text;

-- Update existing assistant_files records to have the correct user_id
-- by getting it from the related assistant
UPDATE public.assistant_files 
SET user_id = (
  SELECT assistants.user_id 
  FROM public.assistants 
  WHERE assistants.id = assistant_files.assistant_id
);

-- Make user_id NOT NULL after backfilling data
ALTER TABLE public.assistant_files 
ALTER COLUMN user_id SET NOT NULL;

-- Drop existing insecure policies for assistant_files
DROP POLICY IF EXISTS "Users can create files for their assistants" ON public.assistant_files;
DROP POLICY IF EXISTS "Users can view files for their assistants" ON public.assistant_files;

-- Create secure policies for assistant_files table
CREATE POLICY "Users can create their own assistant files" 
ON public.assistant_files 
FOR INSERT 
WITH CHECK (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can view their own assistant files" 
ON public.assistant_files 
FOR SELECT 
USING (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can update their own assistant files" 
ON public.assistant_files 
FOR UPDATE 
USING (user_id = (auth.jwt() ->> 'sub'::text));

CREATE POLICY "Users can delete their own assistant files" 
ON public.assistant_files 
FOR DELETE 
USING (user_id = (auth.jwt() ->> 'sub'::text));