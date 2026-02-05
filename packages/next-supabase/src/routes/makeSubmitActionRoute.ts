import { NextResponse } from "next/server";
import { type GameDefinition, applyAction, serializeState } from "@bame/core";
import { createSupabaseServerClient } from "../supabase/server";
import { SubmitActionSchema } from "../shared/zod";

export function makeSubmitActionRoute<State, Action>(opts: {
    game: GameDefinition<State, Action>;
}) {
    return async function POST(req: Request) {
        const supabase = await createSupabaseServerClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const parsed = SubmitActionSchema.safeParse(await req.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

        const { gameId, action: rawAction } = parsed.data;

        // 1) Fetch current game state
        const gameRes = await supabase.from("games").select("*").eq("id", gameId).single();
        if (gameRes.error) return NextResponse.json({ error: gameRes.error.message }, { status: 400 });

        const game = gameRes.data;

        // 2) Check game is active
        if (game.status !== "active") {
            return NextResponse.json({ error: "Game is not active" }, { status: 400 });
        }

        // 3) Apply action using engine
        const result = applyAction(
            opts.game,
            game.state as State,
            game.current_turn_user_id,
            auth.user.id,
            rawAction
        );

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        // 4) Update game state with optimistic locking
        const updateRes = await supabase
            .from("games")
            .update({
                state: serializeState(result.result.state),
                state_version: game.state_version + 1,
                current_turn_user_id: result.result.nextTurnActorId,
                status: result.result.status ?? "active",
                updated_at: new Date().toISOString(),
            })
            .eq("id", gameId)
            .eq("state_version", game.state_version) // Optimistic lock
            .select("*")
            .single();

        if (updateRes.error) {
            // Could be a version conflict
            return NextResponse.json({ error: "Conflict - game state changed" }, { status: 409 });
        }

        return NextResponse.json({ game: updateRes.data });
    };
}

