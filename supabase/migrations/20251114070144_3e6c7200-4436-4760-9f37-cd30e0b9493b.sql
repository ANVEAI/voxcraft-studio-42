-- Add batch tracking columns to scraped_websites table
ALTER TABLE scraped_websites 
ADD COLUMN IF NOT EXISTS current_batch INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_batches INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS batch_errors JSONB DEFAULT '[]'::jsonb;