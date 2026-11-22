import { requireOwner } from "@/lib/supabase/server";
import ImportClient from "./ImportClient";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  await requireOwner();
  return <ImportClient />;
}
