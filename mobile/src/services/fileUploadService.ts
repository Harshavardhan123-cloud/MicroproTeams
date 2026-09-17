import DocumentPicker from 'react-native-document-picker';
import { apiClient } from '../api/client';

export interface UploadedFile {
  id?: string;
  name: string;
  url: string;
  mime_type?: string;
  size?: number;
}

/**
 * Lets the user pick a single file from the device and uploads it to
 * POST /files/upload (multipart/form-data, field name "file"), returning the
 * server's file metadata normalized to a common shape. Handles a handful of
 * possible response field names defensively since the backend's exact field
 * naming isn't guaranteed (mirrors the web frontend's MessageComposer logic).
 *
 * Resolves to `null` if the user cancels the picker or the upload fails.
 */
export async function pickAndUploadFile(): Promise<UploadedFile | null> {
  let picked;
  try {
    picked = await DocumentPicker.pick({
      type: [DocumentPicker.types.allFiles],
      allowMultiSelection: false,
    });
  } catch (err: any) {
    if (DocumentPicker.isCancel(err)) {
      return null;
    }
    console.warn('File pick failed:', err);
    return null;
  }

  const file = picked?.[0];
  if (!file) return null;

  try {
    const formData = new FormData();
    // React Native's fetch/FormData implementation supports {uri, name, type}
    // file objects directly - no need to read the file into memory first.
    formData.append('file', {
      uri: file.uri,
      name: file.name || 'file',
      type: file.type || 'application/octet-stream',
    } as any);

    const res = await apiClient.post('/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    const data = res.data?.data || res.data;
    const name: string = data?.name || data?.original_name || data?.file_name || file.name || 'file';
    const url: string = data?.url || data?.file_url || data?.download_url || '';

    if (!url) {
      console.warn('File upload response did not contain a usable URL:', data);
      return null;
    }

    return {
      id: data?.id,
      name,
      url,
      mime_type: data?.mime_type || data?.type || file.type || undefined,
      size: data?.size ?? file.size ?? undefined,
    };
  } catch (err) {
    console.warn('File upload failed:', err);
    return null;
  }
}
