"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../supabase/client";
import type { Lobby, LobbyMember } from "../../shared/types";

export type LobbyState = {
    lobby: Lobby | null;
    members: LobbyMember[];
    loading: boolean;
    error: string | null;
};

export const useLobby = (lobbyId: string): LobbyState => {
    const supabase = createSupabaseBrowserClient();
    const [lobby, setLobby] = useState<Lobby | null>(null);
    const [members, setMembers] = useState<LobbyMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let lobbyChannel: ReturnType<typeof supabase.channel> | null = null;
        let membersChannel: ReturnType<typeof supabase.channel> | null = null;

        const fetchData = async () => {
            setLoading(true);
            setError(null);

            // Fetch lobby
            const lobbyRes = await supabase
                .from("lobbies")
                .select("*")
                .eq("id", lobbyId)
                .single();

            if (lobbyRes.error) {
                setError(lobbyRes.error.message);
                setLoading(false);
                return;
            }
            setLobby(lobbyRes.data);

            // Fetch members
            const membersRes = await supabase
                .from("lobby_members")
                .select("*")
                .eq("lobby_id", lobbyId);

            if (membersRes.error) {
                setError(membersRes.error.message);
            } else {
                setMembers(membersRes.data);
            }

            setLoading(false);

            // Subscribe to lobby changes
            lobbyChannel = supabase
                .channel(`lobby:${lobbyId}`)
                .on(
                    "postgres_changes",
                    { event: "UPDATE", schema: "public", table: "lobbies", filter: `id=eq.${lobbyId}` },
                    (payload) => setLobby(payload.new as Lobby)
                )
                .subscribe();

            // Subscribe to member changes
            membersChannel = supabase
                .channel(`lobby_members:${lobbyId}`)
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table: "lobby_members", filter: `lobby_id=eq.${lobbyId}` },
                    async () => {
                        // Refetch members on any change
                        const res = await supabase
                            .from("lobby_members")
                            .select("*")
                            .eq("lobby_id", lobbyId);
                        if (!res.error) setMembers(res.data);
                    }
                )
                .subscribe();
        };

        fetchData();

        return () => {
            if (lobbyChannel) supabase.removeChannel(lobbyChannel);
            if (membersChannel) supabase.removeChannel(membersChannel);
        };
    }, [lobbyId]);

    return { lobby, members, loading, error };
};

