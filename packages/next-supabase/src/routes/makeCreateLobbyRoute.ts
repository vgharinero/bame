import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '../supabase/server';
import type { BaseGameState, GameAction, GameDefinition } from '@bame/core';

export const makeCreateLobbyRoute = <S extends BaseGameState, A extends GameAction>(
    game: GameDefinition<S, A>
) => {
    return async (req: Request) => {
        const supabase = await createSupabaseServerClient();

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json();
        const config = body.config || {};

        // 3. Generate a join code (short, readable string)
        const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

        // 4. Create the Lobby record
        // We do this in a single transaction-like flow or sequential calls
        const { data: lobby, error: lobbyErr } = await supabase
            .from('lobbies')
            .insert({
                owner_id: user.id,
                status: 'waiting',
                join_code: joinCode,
                config: config
            })
            .select()
            .single();

        if (lobbyErr) return NextResponse.json({ error: lobbyErr.message }, { status: 500 });

        // 5. Automatically add the owner to lobby_members
        const { error: memberErr } = await supabase
            .from('lobby_members')
            .insert({
                lobby_id: lobby.id,
                user_id: user.id
            });

        if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });

        return NextResponse.json({
            lobbyId: lobby.id,
            joinCode: lobby.join_code
        });
    };
};