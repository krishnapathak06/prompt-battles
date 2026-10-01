import { createClient } from "@supabase/supabase-js";
import { NextApiRequest } from "next";

export const getAuthenticatedUser = async (req: NextApiRequest) => {
    // Check Authorization header for Bearer token
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return null;
    }

    // Use a fresh client for verification to avoid any persistent session issues
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
        return null;
    }

    return user;
};
