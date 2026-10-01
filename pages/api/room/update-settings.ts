import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/apiAuth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") return res.status(405).end();

  // 1️⃣ Auth Check
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { room_id, total_rounds } = req.body;

  if (!room_id || !total_rounds) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  const { error } = await supabaseAdmin
    .from("rooms")
    .update({ total_rounds })
    .eq("id", room_id);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ success: true });
}