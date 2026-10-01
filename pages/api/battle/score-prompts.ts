import { GoogleGenAI } from "@google/genai";
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

import { getAuthenticatedUser } from "@/lib/apiAuth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1️⃣ Auth Check
  const user = await getAuthenticatedUser(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const { room_id, round_id, image_url, battle_id } = req.body;

  if (!room_id || !round_id || !image_url) {
    return res.status(400).json({
      error: "Missing room_id, round_id or image_url",
    });
  }

  console.log("🔥 SCORE PROMPTS HIT", { room_id, round_id });

  /* ---------------- 1. FETCH ALL PROMPTS ---------------- */
  const { data: prompts, error: promptErr } = await supabaseAdmin
    .from("prompts")
    .select("id, prompt_text, user_id")
    .eq("round_id", round_id);

  if (promptErr) {
    return res.status(500).json({ error: promptErr.message });
  }

  if (!prompts || prompts.length === 0) {
    return res.status(200).json({ message: "No prompts to score." });
  }

  const validPrompts = prompts.filter(p => p.prompt_text && p.prompt_text.trim().length > 0);
  const emptyPrompts = prompts.filter(p => !p.prompt_text || p.prompt_text.trim().length === 0);

  let aiEvaluations: any[] = [];

  /* ---------------- 3. CALL GEMINI (Only for Valid Prompts) ---------------- */

  if (validPrompts.length > 0) {
    const promptList = validPrompts
      .map(
        (p, i) =>
          `Prompt ${i + 1}:\nID: ${p.id}\nUser: ${p.user_id}\nText: "${p.prompt_text}"`,
      )
      .join("\n\n");

    const instructions = `
Task: Given an image and multiple prompts, score each prompt 0–100 based on how well it matches the image.

Rules:
- Judge how likely the prompt would recreate a similar image in a text-to-image model
- Higher score = closer match
- Include constructive feedback with specific image details

Return ONLY valid JSON:
[
  {
    "user_id": "...",
    "prompt_id": "...",
    "score": 0-100,
    "reason": "short explanation"
  }
]
`;

    const contents = [
      {
        role: "user",
        parts: [
          { text: instructions },
          { fileData: { mimeType: "image/jpeg", fileUri: image_url } },
          { text: "Prompts:\n" + promptList },
        ],
      },
    ];

    try {
      const geminiResult = await ai.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents,
      });

      let text = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
      text = text.replace(/```json/g, "").replace(/```/g, "").trim();
      aiEvaluations = JSON.parse(text);

    } catch (err: any) {
      console.error("Gemini API Error:", err);
      return res.status(500).json({ error: "Gemini calculation failed" });
    }
  }

  /* ---------------- 4. MERGE RESULTS ---------------- */

  const emptyEvaluations = emptyPrompts.map(p => ({
    user_id: p.user_id,
    prompt_id: p.id,
    score: 0,
    reason: "No prompt submitted in time."
  }));

  const allEvaluations = [...aiEvaluations, ...emptyEvaluations];

  /* ---------------- 5. SAVE RESULTS ---------------- */

  for (const ev of allEvaluations) {
    //  Save score to prompt row
    await supabaseAdmin
      .from("prompts")
      .update({
        scores: ev.score,
        justification: ev.reason,
      })
      .eq("id", ev.prompt_id);

    //  Reset Player Ready State (Safe Update)
    await supabaseAdmin
      .from("room_players")
      .update({ is_ready: false })
      .eq("room_id", room_id)
      .eq("user_id", ev.user_id);

    if (!battle_id) {
      console.error("❌ MISSING BATTLE ID, CANNOT UPSERT SCORE. User:", ev.user_id);
      continue;
    }

    // 4. Calculate Total Score (Self-Healing)
    // We sum all prompt scores for this user in this battle to ensure accuracy
    const { data: totalScoreData, error: sumError } = await supabaseAdmin
      .from("prompts")
      .select("scores")
      .eq("battle_id", battle_id) // Ensure we have battle_id in scope!
      .eq("user_id", ev.user_id);

    if (sumError) {
      console.error("Error calculating sum for user:", ev.user_id, sumError);
      continue;
    }

    const currentTotal = totalScoreData?.reduce((sum, row) => sum + (row.scores || 0), 0) || 0;
    console.log(`User ${ev.user_id} Total Score: ${currentTotal}`);

    // 5. UPSERT now works correctly thanks to the UNIQUE constraint
    const { error: upsertError } = await supabaseAdmin
      .from("battle_scores")
      .upsert({
        battle_id: battle_id,
        user_id: ev.user_id,
        total_score: currentTotal,
      }, { onConflict: 'battle_id,user_id' });

    if (upsertError) {
      console.error("❌ battle_scores upsert failed", upsertError);
    } else {
      console.log("✅ Upserted battle_scores for user:", ev.user_id);
    }
  }

  // 6. Recalculate Ranks for the entire battle
  const { data: allScores } = await supabaseAdmin
    .from("battle_scores")
    .select("user_id, total_score")
    .eq("battle_id", battle_id)
    .order("total_score", { ascending: false });

  if (allScores && allScores.length > 0) {
    const rankUpdates = allScores.map((s, index) => ({
      battle_id: battle_id,
      user_id: s.user_id,
      total_score: s.total_score,
      rank: index + 1,
    }));

    const { error: rankError } = await supabaseAdmin
      .from("battle_scores")
      .upsert(rankUpdates, { onConflict: 'battle_id,user_id' });

    if (rankError) console.error("❌ Rank update failed", rankError);
    else console.log("📊 Ranks recalculated for battle:", battle_id);
  }

  /* ---------------- 6. BROADCAST ---------------- */

  await supabaseAdmin
    .channel(`room-phase-${room_id}`)
    .send({
      type: "broadcast",
      event: "results_ready",
      payload: { round_id },
    });

  return res.status(200).json({
    success: true,
    evaluations: allEvaluations,
  });
}
