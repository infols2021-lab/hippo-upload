import { createBrowserClient } from "@supabase/ssr";

declare global {
  // eslint-disable-next-line no-var
  var __sbBrowserClient: ReturnType<typeof createBrowserClient> | undefined;
}

export function supabaseBrowser() {
  if (globalThis.__sbBrowserClient) return globalThis.__sbBrowserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const client = createBrowserClient(url, anon);
  globalThis.__sbBrowserClient = client;

  return client;
}
