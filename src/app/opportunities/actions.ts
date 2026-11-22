"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOwner } from "@/lib/supabase/server";

export async function setOpportunityStatus(id: string, status: string) {
  const input = z.object({ id: z.string().uuid(), status: z.string().trim().min(1).max(60) }).parse({ id, status });
  const { supabase, user } = await requireOwner();
  const { error } = await supabase.from("opportunities").update({ status: input.status }).eq("id", input.id).eq("owner", user.id);
  if (error) throw new Error("Could not update.");
  revalidatePath("/");
}
