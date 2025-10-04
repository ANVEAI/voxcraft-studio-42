-- Add assistant_id column to embed_mappings to create proper relationship
ALTER TABLE public.embed_mappings 
ADD COLUMN assistant_id uuid REFERENCES public.assistants(id) ON DELETE CASCADE;

-- Populate assistant_id from existing vapi_assistant_id mappings
UPDATE public.embed_mappings em
SET assistant_id = a.id
FROM public.assistants a
WHERE em.vapi_assistant_id = a.vapi_assistant_id;

-- Create index for better query performance
CREATE INDEX idx_embed_mappings_assistant_id ON public.embed_mappings(assistant_id);