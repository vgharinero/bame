import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../supabase/server'; // Your client
import type { BaseGameState, GameAction, GameDefinition } from '@bame/core';

export const makeCreateGameRoute = <S extends BaseGameState, A extends GameAction>(
    gameDef: GameDefinition<S, A>
) => {
    return async (req: Request) => {
        const supabase = await createSupabaseServerClient();

        const { lobbyId } = await req.json();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: lobby, error: lobbyErr } = await supabase
            .from('lobbies')
            .select('*, lobby_members(user_id)')
            .eq('id', lobbyId)
            .single();

        if (lobbyErr || !lobby) return NextResponse.json({ error: 'Lobby not found' }, { status: 404 });
        if (lobby.owner_id !== user.id) return NextResponse.json({ error: 'Only owner can start' }, { status: 403 });

        const playerIds = lobby.lobby_members.map((m: any) => m.user_id);
        if (playerIds.length < gameDef.minPlayers || playerIds.length > gameDef.maxPlayers) {
            return NextResponse.json({ error: 'Invalid player count' }, { status: 400 });
        }

        const initialState = gameDef.initialState(playerIds);
        const { data: game, error: gameErr } = await supabase
            .from('games')
            .insert({
                id: lobbyId,
                state: initialState,
                status: 'playing',
                config: lobby.config
            })
            .select()
            .single();

        if (gameErr) return NextResponse.json({ error: gameErr.message }, { status: 500 });

        await supabase.from('lobbies').update({ status: 'started' }).eq('id', lobbyId);
        return NextResponse.json({ game });
    };
};