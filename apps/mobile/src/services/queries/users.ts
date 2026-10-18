import type {
  AvatarContentType,
  AvatarUploadResponse,
  FollowResponse,
  MeProfile,
  UpdateUserRequest,
  UserProfile,
} from '@app/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../store/auth';
import { apiFetch } from '../api';
import { restoreSnapshot, setFollowing, snapshotVideoCaches } from '../cache-updates';
import { queryKeys } from '../query-keys';
import { uploadFile } from '../upload-file';

export const useProfile = (id: string) =>
  useQuery({ queryKey: queryKeys.user(id), queryFn: () => apiFetch<UserProfile>(`/users/${id}`) });

export function useToggleFollow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean }) =>
      apiFetch<FollowResponse>(`/users/${userId}/follow`, { method: follow ? 'POST' : 'DELETE' }),
    onMutate: ({ userId, follow }) => {
      const snapshot = snapshotVideoCaches(qc);
      setFollowing(qc, userId, follow);
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => ctx && restoreSnapshot(qc, ctx.snapshot),
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.feed('following') }),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  const setUser = useAuth((s) => s.setUser);
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateUserRequest & { id: string }) =>
      apiFetch<MeProfile>(`/users/${id}`, { method: 'PATCH', body }),
    onSuccess: (me) => {
      setUser(me);
      void qc.invalidateQueries({ queryKey: queryKeys.user(me.id) });
    },
  });
}

/** Presigned upload to R2, then returns the public URL to save on the profile. */
export async function uploadAvatar(
  fileUri: string,
  contentType: AvatarContentType,
  contentLength: number,
): Promise<string> {
  const { uploadUrl, publicUrl } = await apiFetch<AvatarUploadResponse>(
    '/users/me/avatar-upload-url',
    {
      method: 'POST',
      body: { contentType, contentLength },
    },
  );
  await uploadFile(fileUri, uploadUrl, contentType, () => {}).done;
  return publicUrl;
}
