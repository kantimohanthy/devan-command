import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { env } from "@/lib/env";

export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // called from a Server Component; middleware refreshes the session instead
        }
      },
    },
  });
}

/**
 * Server-side gate for every page and action. Verifies the session with Supabase
 * (getUser hits the auth server, unlike getSession) and that the user is the owner.
 */
export async function requireOwner() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  if ((data.user.email ?? "").toLowerCase() !== env.ownerEmail()) {
    await supabase.auth.signOut();
    notFound();
  }
  return { supabase, user: data.user };
}
