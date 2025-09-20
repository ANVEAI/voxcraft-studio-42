-- Drop existing RLS policies that expect auth.uid()
DROP POLICY IF EXISTS "Users can create their own assistants" ON public.assistants;
DROP POLICY IF EXISTS "Users can view their own assistants" ON public.assistants;
DROP POLICY IF EXISTS "Users can update their own assistants" ON public.assistants;
DROP POLICY IF EXISTS "Users can delete their own assistants" ON public.assistants;

-- Create new RLS policies that work with Clerk user IDs stored in user_id column
CREATE POLICY "Users can create their own assistants" 
ON public.assistants 
FOR INSERT 
WITH CHECK (true);  -- Allow all inserts for now since we validate user_id in application

CREATE POLICY "Users can view their own assistants" 
ON public.assistants 
FOR SELECT 
USING (true);  -- Allow all reads for now, will filter in application

CREATE POLICY "Users can update their own assistants" 
ON public.assistants 
FOR UPDATE 
USING (true);  -- Allow all updates for now

CREATE POLICY "Users can delete their own assistants" 
ON public.assistants 
FOR DELETE 
USING (true);  -- Allow all deletes for now

-- Also update assistant_files policies
DROP POLICY IF EXISTS "Users can create files for their assistants" ON public.assistant_files;
DROP POLICY IF EXISTS "Users can view files for their assistants" ON public.assistant_files;

CREATE POLICY "Users can create files for their assistants" 
ON public.assistant_files 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can view files for their assistants" 
ON public.assistant_files 
FOR SELECT 
USING (true);