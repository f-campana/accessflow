import { createTRPCClient, httpBatchLink } from "@trpc/client";

import type { AppRouter } from "@accessflow/api/router";

const apiBaseUrl = () =>
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: `${apiBaseUrl()}/trpc`,
      fetch(url, options) {
        return fetch(url, {
          ...(options as RequestInit | undefined),
          credentials: "include",
          signal: options?.signal ?? null
        });
      }
    })
  ]
});
