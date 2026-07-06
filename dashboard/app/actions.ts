"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}

export async function createApiKey(name: string): Promise<{ key: string }> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const orgId = user.app_metadata?.org_id as string | undefined;
  if (!orgId) throw new Error("Organisation not found — try signing out and back in.");

  const rawKey = "aid_live_" + crypto.randomBytes(28).toString("hex");
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.substring(0, 18);

  const { error } = await supabase.from("api_keys").insert({
    org_id: orgId,
    name: name.trim(),
    key_hash: keyHash,
    key_prefix: keyPrefix,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/api-keys");
  return { key: rawKey };
}

export async function revokeApiKey(id: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { error } = await supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/api-keys");
}
