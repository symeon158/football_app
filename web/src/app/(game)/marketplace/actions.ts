"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { toUserMessage } from "@/lib/errors";
import { createClient, getUserId } from "@/lib/supabase/server";
import { idempotencyKeySchema } from "@/lib/validation/market";

/**
 * Coin-spending actions. The client sends a fresh idempotency key per purchase
 * intent and reuses it on retry, so a double-click or a network retry can
 * never charge twice: buy_card / open_pack return the original result.
 * Price, balance and availability are decided by the database, never here.
 */
const purchaseSchema = z.object({ id: z.uuid(), key: idempotencyKeySchema });

export type PurchaseResult = { ok: boolean; message?: string; ownershipId?: string };

export async function buyCard(input: { cardId: string; key: string }): Promise<PurchaseResult> {
  const parsed = purchaseSchema.safeParse({ id: input.cardId, key: input.key });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  if (!(await getUserId())) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buy_card", { p_card_id: parsed.data.id, p_idempotency_key: parsed.data.key });
  if (error) return { ok: false, message: toUserMessage(error) };
  refresh(); // updates the coin balance in the top bar
  return { ok: true, ownershipId: data, message: "Added to your collection." };
}

export async function openPack(input: { packId: string; key: string }): Promise<PurchaseResult> {
  const parsed = purchaseSchema.safeParse({ id: input.packId, key: input.key });
  if (!parsed.success) return { ok: false, message: "Invalid request." };
  if (!(await getUserId())) return { ok: false, message: toUserMessage({ message: "NOT_AUTHENTICATED" }) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_pack", { p_pack_id: parsed.data.id, p_idempotency_key: parsed.data.key });
  if (error) return { ok: false, message: toUserMessage(error) };
  // The redirect alone keeps the shared layout (and its stale coin balance);
  // refresh() makes the client re-render the whole tree, top bar included.
  refresh();
  redirect(`/marketplace/packs/${data}`);
}
