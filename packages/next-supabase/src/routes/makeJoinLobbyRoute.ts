
import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "../supabase/server";

const Body = z.object({ code: z.string().min(3).max(32) });

export const makeJoinLobbyRoute = () => {
    return async function POST(req: Request) {
        const supabase = await createSupabaseServerClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = Body.safeParse(await req.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

        const { data, error } = await supabase.rpc("rpc_join_lobby_by_code", {
            p_code: parsed.data.code,
        });

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data); // { lobby_id }
    };
}