import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Storage
export const storage = getStorage(app);

/**
 * Upload media file to Firebase Storage and get signed URL
 * @param file The file to upload
 * @param folder The folder to upload to (e.g., 'whatsapp-media')
 * @returns Promise resolving to the download URL
 */
export async function uploadMediaToFirebase(file: File, folder: string = 'whatsapp-media'): Promise<string> {
  try {
    // Validate file type
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/mov', 'video/avi', 'video/webm',
      'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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
    const fileName = `${folder}/${timestamp}_${sanitizedName}.${extension}`;

    // Create storage reference
    const storageRef = ref(storage, fileName);

    // Upload file
    const snapshot = await uploadBytes(storageRef, file, {
      contentType: file.type,
      customMetadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString()
      }
    });

    // Get download URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    console.log('✅ [FIREBASE] Media uploaded successfully:', {
      fileName,
      downloadURL: downloadURL.substring(0, 50) + '...',
      fileSize: file.size,
      fileType: file.type
    });

    return downloadURL;
  } catch (error) {
    console.error('❌ [FIREBASE] Error uploading media:', error);
    throw new Error(`Failed to upload media: ${error.message}`);
  }
}

/**
 * Delete media file from Firebase Storage
 * @param url The download URL of the file to delete
 */
export async function deleteMediaFromFirebase(url: string): Promise<void> {
  try {
    // Extract the file path from the download URL
    const urlObj = new URL(url);
    const pathMatch = urlObj.pathname.match(/\/o\/(.+)\?/);
    
    if (!pathMatch) {
      throw new Error('Invalid Firebase Storage URL');
    }
    
    const filePath = decodeURIComponent(pathMatch[1]);
    const fileRef = ref(storage, filePath);
    
    // Delete the file
    await deleteObject(fileRef);
    
    console.log('✅ [FIREBASE] Media deleted successfully:', filePath);
  } catch (error) {
    console.error('❌ [FIREBASE] Error deleting media:', error);
    throw new Error(`Failed to delete media: ${error.message}`);
  }
}

/**
 * Validate Firebase configuration
 * @returns Whether Firebase is properly configured
 */
export function validateFirebaseConfig(): boolean {
  const requiredEnvVars = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_STORAGE_BUCKET',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_APP_ID'
  ];

  const missingVars = requiredEnvVars.filter(varName => !import.meta.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ [FIREBASE] Missing environment variables:', missingVars);
    return false;
  }

  return true;
}