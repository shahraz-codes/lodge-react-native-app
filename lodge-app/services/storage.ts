import { File as ExpoFile } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

const BUCKET = 'id-proofs';

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
