'use client';
import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import { cosmeticFields } from '../shared/cosmetics';
export const accountClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [inferAdditionalFields({ user: cosmeticFields })],
});
