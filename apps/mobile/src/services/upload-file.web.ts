export type UploadHandle = { done: Promise<void>; cancel(): void };

/** Web build: the picker returns blob/data URIs, uploaded with XHR for progress events. */
export function uploadFile(
  fileUri: string,
  url: string,
  contentType: string,
  onProgress: (fraction: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const done = (async () => {
    const blob = await (await fetch(fileUri)).blob();
    await new Promise<void>((resolve, reject) => {
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () =>
        xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(blob);
    });
  })();
  return { done, cancel: () => xhr.abort() };
}

export async function fileSize(fileUri: string): Promise<number | undefined> {
  return (await (await fetch(fileUri)).blob()).size;
}
