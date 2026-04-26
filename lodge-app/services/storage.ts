import { File as ExpoFile } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

const BUCKET = 'id-proofs';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface IdProofFile {
  uri: string;
  mimeType: string;
  fileName: string;
}

export async function uploadIdProofDocument(
  customerId: string,
  file: IdProofFile
): Promise<string> {
  const ext = file.fileName.split('.').pop() || 'jpg';
  const storagePath = `${customerId}/${Date.now()}.${ext}`;

  const localFile = new ExpoFile(file.uri);
  const bytes = await localFile.bytes();

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, bytes, {
      contentType: file.mimeType,
      upsert: false,
    });

  if (error) throw error;

  return `${BUCKET}/${storagePath}`;
}

// Strip the bucket prefix from the stored value so we end up with the path
// the Supabase client expects. Older rows may already be stored without it.
function normaliseStoragePath(stored: string): string {
  const trimmed = stored.replace(/^\/+/, '');
  if (trimmed.startsWith(`${BUCKET}/`)) {
    return trimmed.slice(BUCKET.length + 1);
  }
  return trimmed;
}

export interface IdProofResolved {
  url: string;
  mimeType: string;
  isPdf: boolean;
}

function inferMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function getIdProofSignedUrl(
  storedPath: string
): Promise<IdProofResolved> {
  const path = normaliseStoragePath(storedPath);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;
  if (!data?.signedUrl) {
    throw new Error('Could not generate a signed URL for this document.');
  }
  const mimeType = inferMimeType(path);
  return {
    url: data.signedUrl,
    mimeType,
    isPdf: mimeType === 'application/pdf',
  };
}
