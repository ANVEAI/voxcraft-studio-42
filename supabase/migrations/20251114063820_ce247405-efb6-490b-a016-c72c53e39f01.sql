-- Reset stuck processing records to pending so they can be reprocessed
UPDATE scraped_websites 
SET processing_status = 'pending',
    last_checked_at = NOW()
WHERE processing_status = 'processing' 
AND id = '7e076247-3bbc-4c70-a2a9-79b56a4b3255';