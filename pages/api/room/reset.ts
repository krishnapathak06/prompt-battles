import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();
  const { room_id } = req.body;

  if (!room_id) return res.status(400).json({ error: "Missing room_id" });

  try {
    console.log("🔄 Resetting Room:", room_id);

    /* 1. ARCHIVE OLD BATTLES (The Critical Fix) */
    // We mark the finished battle as 'archived' so the frontend stops finding it.
    await supabaseAdmin
      .from("battles")
      .update({ status: 'archived' })
      .eq("room_id", room_id)
      .eq("status", "finished");

    /* 2. UNLINK BATTLE FROM ROOM */
    // Ensure the room knows there is no active battle currently
    await supabaseAdmin
      .from("rooms")
      .update({ active_battle_id: null, current_round: 0 })
      .eq("id", room_id);

    /* 3. RESET GUESTS (Make them Not Ready) */
    await supabaseAdmin
      .from("room_players")
      .update({ is_ready: false })
      .eq("room_id", room_id)
      .eq("is_host", false);

    /* 4. RESET HOST (Make them ALWAYS Ready) */
    await supabaseAdmin
      .from("room_players")
      .update({ is_ready: true })
      .eq("room_id", room_id)
      .eq("is_host", true);

    /* 5. RESET SCORES */
    // Resetting to 0 is good for the lobby display
    /*await supabaseAdmin
      .from("player_scores")
      .update({ total_score: 0 })
      .eq("room_id", room_id);*/

    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error("Reset Error:", error);
    return res.status(500).json({ error: error.message });
  }
}