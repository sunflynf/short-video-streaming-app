import type { AuthResponse, LoginRequest, SignupRequest } from '@app/shared';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../../store/auth';
import { track } from '../../lib/analytics';
import { apiFetch } from '../api';

const useAuthMutation = <T>(path: string, event?: 'signup') => {
  const signIn = useAuth((s) => s.signIn);
  return useMutation({
    mutationFn: (body: T) =>
      apiFetch<AuthResponse>(path, { method: 'POST', body, anonymous: true }),
    onSuccess: async (auth) => {
      await signIn(auth);
      if (event) track(event);
    },
  });
};

export const useLogin = () => useAuthMutation<LoginRequest>('/auth/login');
export const useSignup = () => useAuthMutation<SignupRequest>('/auth/signup', 'signup');
