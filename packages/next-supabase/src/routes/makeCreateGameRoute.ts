import { NextResponse } from "next/server";
import { z } from "zod";
import { type GameDefinition, serializeState } from "@bame/core";
import { createSupabaseServerClient } from "../supabase/server";

const Body = z.object({ lobbyId: z.string().uuid() });

export function makeCreateGameRoute<State, Action>(opts: {
    game: GameDefinition<State, Action>;
}) {
    return async function POST(req: Request) {
        const supabase = await createSupabaseServerClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = Body.safeParse(await req.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

        // 1) read lobby + verify owner
        const lobbyId = parsed.data.lobbyId;

        const lobbyRes = await supabase.from("lobbies").select("*").eq("id", lobbyId).single();
        if (lobbyRes.error) return NextResponse.json({ error: lobbyRes.error.message }, { status: 400 });
        if (lobbyRes.data.owner_id !== auth.user.id)
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        // 2) members
        const membersRes = await supabase
            .from("lobby_members")
            .select("user_id")
            .eq("lobby_id", lobbyId);

        if (membersRes.error) return NextResponse.json({ error: membersRes.error.message }, { status: 400 });

        const playerIds = membersRes.data.map((m) => m.user_id);
        const initial = opts.game.createInitialState({ playerIds });
        const stateToStore = serializeState(initial);

        // 3) create game row
        const firstTurn = playerIds[0]; // or derive however you want
        const gameIns = await supabase
            .from("games")
            .insert({
                lobby_id: lobbyId,
                state: stateToStore,
                state_version: 0,
                current_turn_user_id: firstTurn,
                status: "active",
            })
            .select("*")
            .single();

        if (gameIns.error) return NextResponse.json({ error: gameIns.error.message }, { status: 400 });

        // 4) update lobby status
        await supabase.from("lobbies").update({ status: "in_game" }).eq("id", lobbyId);

        return NextResponse.json({ game: gameIns.data });
    };
}