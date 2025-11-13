-- Migration: Add async processing support to scraped_websites table
-- Date: 2024-11-13
-- Purpose: Enable pre-processing + async AI enhancement architecture

-- Add columns for async processing support
ALTER TABLE scraped_websites 
ADD COLUMN IF NOT EXISTS raw_pages JSONB,
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS structured_data JSONB,
ADD COLUMN IF NOT EXISTS knowledge_base_content TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS scraped_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP;

-- Update existing records to have proper processing_status
UPDATE scraped_websites 
SET processing_status = CASE 
  WHEN status = 'completed' THEN 'completed'
  WHEN status = 'failed' THEN 'failed'
  ELSE 'pending'
END
WHERE processing_status IS NULL;

-- Add index for efficient querying of pending records
CREATE INDEX IF NOT EXISTS idx_scraped_websites_processing_status 
ON scraped_websites(processing_status);

-- Add index for user queries
CREATE INDEX IF NOT EXISTS idx_scraped_websites_user_status 
ON scraped_websites(user_id, processing_status);

-- Add comments for documentation
COMMENT ON COLUMN scraped_websites.raw_pages IS 'Raw scraped page data from Firecrawl before AI processing';
COMMENT ON COLUMN scraped_websites.processing_status IS 'Status of AI processing: pending, processing, completed, failed';
COMMENT ON COLUMN scraped_websites.structured_data IS 'AI-enhanced structured data after processing';
COMMENT ON COLUMN scraped_websites.knowledge_base_content IS 'Final knowledge base TXT content';
COMMENT ON COLUMN scraped_websites.error_message IS 'Error details if processing failed';
COMMENT ON COLUMN scraped_websites.scraped_at IS 'When scraping was completed';
COMMENT ON COLUMN scraped_websites.processed_at IS 'When AI processing was completed';
