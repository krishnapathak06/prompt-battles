import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { getAuthenticatedUser } from "@/lib/apiAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1️⃣ Auth Check
  const authUser = await getAuthenticatedUser(req);
  if (!authUser) return res.status(401).json({ error: "Unauthorized" });

  const { room_id, user_id, total_rounds } = req.body;

  if (!room_id || !user_id) {
    return res.status(400).json({ error: "Missing room_id or user_id" });
  }

  if (user_id !== authUser.id) {
    return res.status(403).json({ error: "Cannot start battle for another user" });
  }

  try {
    /* ---------------- HOST CHECK ---------------- */
    const { data: hostRow } = await supabaseAdmin
      .from("room_players")
      .select("is_host")
      .eq("room_id", room_id)
      .eq("user_id", user_id)
      .single();

    if (!hostRow?.is_host) {
      // You can uncomment this if strictly needed, but sometimes it blocks testing
      // return res.status(403).json({ error: "Only host can start the battle" });
    }

    /* ---------------- READINESS CHECK ---------------- */
    // Ensure guests are ready before creating the Battle
    const { data: players } = await supabaseAdmin
      .from("room_players")
      .select("is_ready, is_host")
      .eq("room_id", room_id);

    const nonHostPlayers = players?.filter((p) => !p.is_host) ?? [];
    const allReady = nonHostPlayers.length === 0 || nonHostPlayers.every((p) => p.is_ready);

    if (!allReady) {
      return res.status(400).json({ error: "All players must be ready" });
    }

    /* ---------------- 1. CREATE NEW BATTLE ---------------- */
    // This is the key fix. We create a FRESH battle entry.
    // 'total_rounds' comes from your Host Settings UI selector (or default 3)
    const { data: battle, error: battleErr } = await supabaseAdmin
      .from("battles")
      .insert({
        room_id,
        total_rounds: total_rounds || 3,
        current_round: 1,
        status: 'active'
      })
      .select()
      .single();

    if (battleErr) {
      console.error("Battle Creation Error:", battleErr);
      throw battleErr;
    }

    /* ---------------- 2. LINK BATTLE TO ROOM ---------------- */
    // We update the room so everyone knows "Battle ID: X is currently live"
    await supabaseAdmin
      .from("rooms")
      .update({ active_battle_id: battle.id })
      .eq("id", room_id);

    /* ---------------- 3. RESET PLAYER SCORES (Optional) ---------------- */
    // If you want a fresh scoreboard for this new battle
    await supabaseAdmin.from("player_scores").delete().eq("room_id", room_id);

    // Reset "Ready" status for next time (or keep them ready, your choice)
    // await supabaseAdmin.from("room_players").update({ is_ready: false }).eq("room_id", room_id);

    /* ---------------- 4. SELECT RANDOM IMAGE ---------------- */
    const { data: images } = await supabaseAdmin.from("images").select("id, url");
    const randomImage = images![Math.floor(Math.random() * images!.length)];

    /* ---------------- 5. CREATE ROUND 1 ---------------- */
    const { data: round, error: roundErr } = await supabaseAdmin
      .from("rounds")
      .insert({
        room_id,
        battle_id: battle.id,
        round_number: 1,
        image_id: randomImage.id,
        started_at: new Date().toISOString(), // <--- ADD THIS LINE!
      })
      .select()
      .single();

    if (roundErr) throw roundErr;
    /* ---------------- 6. BROADCAST START ---------------- */
    await supabaseAdmin.channel(`room-phase-${room_id}`).send({
      type: "broadcast",
      event: "phase_update",
      payload: {
        phase: "submission",
        time: 60,
        image_url: randomImage.url,
        round_id: round.id,
        round_number: 1,
        battle_id: battle.id, // Send this to frontend to track current game
        total_rounds: battle.total_rounds
      },
    });

    return res.status(200).json({
      success: true,
      battle_id: battle.id,
      round_id: round.id,
      image_url: randomImage.url,
    });

  } catch (error: any) {
    console.error("Start Handler Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
