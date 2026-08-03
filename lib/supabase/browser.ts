"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getClientEnvironment } from "@/lib/env/client";

export function createSupabaseBrowserClient() {
  const environment = getClientEnvironment();
  return createBrowserClient(
    environment.NEXT_PUBLIC_SUPABASE_URL,
    environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
