import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

import { getAuthenticatedUser } from "@/lib/apiAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1️⃣ Auth Check
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { room_id, battle_id } = req.body;

  if (!room_id || !battle_id) {
    return res.status(400).json({ error: "Missing room_id or battle_id" });
  }

  try {
    /* ---------------- 1. READ BATTLE STATE ---------------- */
    const { data: battle } = await supabaseAdmin
      .from("battles")
      .select("current_round, total_rounds")
      .eq("id", battle_id)
      .single();

    if (!battle) {
      return res.status(404).json({ error: "Battle not found" });
    }

    const nextRoundNum = battle.current_round + 1;

    // Race Condition Check
    const { data: existingRound } = await supabaseAdmin
      .from("rounds")
      .select("id")
      .eq("battle_id", battle_id)
      .eq("round_number", nextRoundNum)
      .single();

    if (existingRound) {
      return res.status(200).json({ message: "Round already advanced" });
    }

    /* ---------------- 2. CHECK GAME FINISHED ---------------- */
    if (nextRoundNum > battle.total_rounds) {

      // A. Mark battle as finished
      await supabaseAdmin
        .from("battles")
        .update({ status: 'finished' })
        .eq("id", battle_id);

      // B. [REMOVED] History archival is now done incrementally in score-prompts.ts


      // C. Broadcast Finish
      await supabaseAdmin.channel(`room-phase-${room_id}`).send({
        type: "broadcast",
        event: "game_finished",
        payload: { battle_id },
      });
      return res.status(200).json({ finished: true });
    }

    /* ---------------- 3. NEXT ROUND LOGIC (If not finished) ---------------- */

    // Get Image
    const { data: images } = await supabaseAdmin.from("images").select("id, url");
    const image = images![Math.floor(Math.random() * images!.length)];

    // Update Battle Counter
    await supabaseAdmin
      .from("battles")
      .update({ current_round: nextRoundNum })
      .eq("id", battle_id);

    // Create Round
    const { data: round } = await supabaseAdmin
      .from("rounds")
      .insert({
        room_id,
        battle_id,
        round_number: nextRoundNum,
        image_id: image.id,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    // Broadcast
    await supabaseAdmin.channel(`room-phase-${room_id}`).send({
      type: "broadcast",
      event: "phase_update",
      payload: {
        phase: "submission",
        time: 60,
        image_url: image.url,
        round_id: round.id,
        round_number: nextRoundNum,
        battle_id,
        total_rounds: battle.total_rounds
      },
    });

    return res.status(200).json({ success: true, round: nextRoundNum });

  } catch (err: any) {
    console.error("ADVANCE_ROUND Error:", err);
    return res.status(500).json({ error: err.message });
  }
}
