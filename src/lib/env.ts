// Server-only environment access. Fails loudly instead of falling back to defaults.
import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  // The Supabase URL and anon key are designed to be public; RLS protects the data.
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  // Only this email may use DEVAN. Anyone else is signed out and gets a 404.
  ownerEmail: () => required("DEVAN_OWNER_EMAIL").toLowerCase(),
  // Server-side only. Never prefix with NEXT_PUBLIC_.
  anthropicKey: () => process.env.ANTHROPIC_API_KEY ?? null,
};
