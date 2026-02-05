import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "../supabase/server";

export const makeCreateLobbyRoute = () => {
    return async function POST() {
        const supabase = await createSupabaseServerClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data, error } = await supabase.rpc("rpc_create_lobby");
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });

        return NextResponse.json(data); // { lobby_id, code }
    };
}