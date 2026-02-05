
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../supabase/server";

export const makeJoinLobbyRoute = () => {
    return async (req: Request) => {
        const supabase = await createSupabaseServerClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { code } = await req.json();
        const { data, error } = await supabase.rpc("rpc_join_lobby_by_code", {
            p_code: code,
        });

        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json(data); // { lobby_id }
    };
}