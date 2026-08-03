"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function RealtimeCases({ escritorioId }: { escritorioId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel(`casos:${escritorioId}`).on("postgres_changes", {
      event: "UPDATE", schema: "public", table: "casos", filter: `escritorio_id=eq.${escritorioId}`,
    }, () => router.refresh()).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [escritorioId, router]);
  return null;
}

