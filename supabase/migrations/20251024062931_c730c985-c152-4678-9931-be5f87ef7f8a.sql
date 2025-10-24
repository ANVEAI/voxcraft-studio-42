-- Add columns for async scraping support
ALTER TABLE scraped_websites 
ADD COLUMN IF NOT EXISTS firecrawl_job_id TEXT,
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS raw_data JSONB;

-- Update status column to support new states: 'queued', 'scraping', 'processing', 'completed', 'failed'
COMMENT ON COLUMN scraped_websites.status IS 'Status: queued, scraping, processing, completed, failed';