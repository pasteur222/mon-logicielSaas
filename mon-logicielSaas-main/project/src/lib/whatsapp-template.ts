import { supabase } from './supabase';

interface TemplateRequest {
  to: string;
  templateName: string;
  language?: string;
  components?: any[];
  headerMediaUrl?: string;
  bodyMediaUrl?: string;
  footerMediaUrl?: string;
  customBody?: string;
  customFooter?: string;
}

/**
 * Send WhatsApp template message using Supabase Edge Function
 */
export async function sendWhatsAppTemplateMessage(
  request: TemplateRequest,
  userId?: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-template`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...request,
          userId
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Template sending failed');
    }

    return {
      success: true,
      messageId: data.messages?.[0]?.id
    };
  } catch (error) {
    console.error('Error sending WhatsApp template:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Upload media file for WhatsApp templates
 */
export async function uploadTemplateMedia(file: File): Promise<string> {
  try {
    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/mov', 'video/avi', 'video/webm',
      'application/pdf'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}`);
    }

    // Validate file size (16MB limit for WhatsApp)
    if (file.size > 16 * 1024 * 1024) {
      throw new Error('File size must be less than 16MB');
    }

    // Generate secure filename
    const timestamp = Date.now();
    const extension = file.name.split('.').pop() || 'bin';
    const sanitizedName = file.name.split('.')[0].replace(/[^a-zA-Z0-9-]/g, '_');
    const fileName = `template-media/${timestamp}_${sanitizedName}.${extension}`;

    // Upload to Supabase storage
    const { data, error } = await supabase.storage
      .from('whatsapp-media')
      .upload(fileName, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    // Get public URL
    const { data: publicUrlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  } catch (error) {
    console.error('Error uploading template media:', error);
    throw error;
  }
}

/**
 * Get available WhatsApp templates
 */
export async function getTemplates(userId?: string): Promise<any[]> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-templates?userId=${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.templates || [];
  } catch (error) {
    console.error('Error fetching templates:', error);
    return [];
  }
}