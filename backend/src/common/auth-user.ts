import type { Role } from '../generated/prisma/client.js';

/** The authenticated principal attached to `request.user` by the JWT strategy. */
export type AuthUser = {
  id: string;
  role: Role;
};
