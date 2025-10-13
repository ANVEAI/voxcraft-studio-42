-- Create scraped_websites table for tracking website scraping history
CREATE TABLE scraped_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  assistant_id UUID REFERENCES assistants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  pages_scraped INTEGER DEFAULT 0,
  total_size_kb INTEGER DEFAULT 0,
  vapi_file_id TEXT,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE scraped_websites ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own scraping history"
  ON scraped_websites FOR SELECT
  USING (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can insert their own scraping records"
  ON scraped_websites FOR INSERT
  WITH CHECK (user_id = (auth.jwt() ->> 'sub'));

CREATE POLICY "Users can update their own scraping records"
  ON scraped_websites FOR UPDATE
  USING (user_id = (auth.jwt() ->> 'sub'));

-- Create indexes for faster queries
CREATE INDEX idx_scraped_websites_user_id ON scraped_websites(user_id);
CREATE INDEX idx_scraped_websites_assistant_id ON scraped_websites(assistant_id);