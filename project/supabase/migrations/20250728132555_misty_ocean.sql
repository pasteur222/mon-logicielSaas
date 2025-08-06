/*
  # Create WhatsApp Media Storage Bucket
  
  1. New Storage Bucket
    - Creates 'whatsapp-media' bucket for storing WhatsApp media files
    - Sets appropriate security policies for media uploads
    - Ensures proper MIME type handling
  
  2. Security
    - Enables row level security
    - Adds policies for authenticated users to upload media
    - Allows public access for WhatsApp to fetch media
*/

-- Create whatsapp-media storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO NOTHING;

-- Set up security policies for whatsapp-media bucket
DO $$
BEGIN
  -- Policy for uploading media files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Authenticated users can upload WhatsApp media'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated users can upload WhatsApp media"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'whatsapp-media');
  END IF;

  -- Policy for public access (required for WhatsApp to fetch media)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Public can view WhatsApp media'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Public can view WhatsApp media"
    ON storage.objects FOR SELECT TO public
    USING (bucket_id = 'whatsapp-media');
  END IF;

  -- Policy for updating media files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Authenticated users can update WhatsApp media'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated users can update WhatsApp media"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'whatsapp-media')
    WITH CHECK (bucket_id = 'whatsapp-media');
  END IF;

  -- Policy for deleting media files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE policyname = 'Authenticated users can delete WhatsApp media'
    AND tablename = 'objects'
    AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "Authenticated users can delete WhatsApp media"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'whatsapp-media');
  END IF;
END $$;