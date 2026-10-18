import { FileSystemUploadType, createUploadTask, getInfoAsync } from 'expo-file-system/legacy';

export type UploadHandle = { done: Promise<void>; cancel(): void };

/** PUTs a local file to a presigned URL as raw bytes, reporting progress from 0 to 1. */
export function uploadFile(
  fileUri: string,
  url: string,
  contentType: string,
  onProgress: (fraction: number) => void,
): UploadHandle {
  const task = createUploadTask(
    url,
    fileUri,
    {
      httpMethod: 'PUT',
      uploadType: FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': contentType },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (totalBytesExpectedToSend > 0) onProgress(totalBytesSent / totalBytesExpectedToSend);
    },
  );
  const done = task.uploadAsync().then((res) => {
    if (!res) throw new Error('Upload cancelled');
    if (res.status >= 300) throw new Error(`Upload failed (${res.status})`);
  });
  return { done, cancel: () => void task.cancelAsync() };
}

export async function fileSize(fileUri: string): Promise<number | undefined> {
  const info = await getInfoAsync(fileUri);
  return info.exists ? info.size : undefined;
}
