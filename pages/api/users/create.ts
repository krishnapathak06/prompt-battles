// pages/api/users/create.ts
// Purpose: Create a player row in the "players" table after Google login.
import type { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAuthenticatedUser } from "@/lib/apiAuth";

export default async function handler(
	req: NextApiRequest,
	res: NextApiResponse,
) {
	if (req.method !== "POST") {
		return res.status(405).json({ error: "Method not allowed" });
	}

	// 1️⃣ Auth Check
	const authUser = await getAuthenticatedUser(req);
	if (!authUser) return res.status(401).json({ error: "Unauthorized" });

	const { user } = req.body;

	if (!user || !user.id) {
		return res.status(400).json({ error: "Invalid user data" });
	}

	if (user.id !== authUser.id) {
		return res.status(403).json({ error: "Cannot create profile for another user" });
	}

	// Insert or update player record
	const { error } = await supabaseAdmin.from("players").upsert({
		id: user.id,
		name: user.user_metadata.full_name || user.email,
		avatar: user.user_metadata.avatar_url || null,
		email: user.email,
	});

	if (error) {
		console.error("User create error:", error);
		return res.status(500).json({ error: error.message });
	}

	return res.status(200).json({ success: true });
}
