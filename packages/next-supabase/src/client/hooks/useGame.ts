
"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "../../supabase/client";

export const useGame = (gameId: string) => {
    const supabase = createSupabaseBrowserClient();
    const [game, setGame] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let channel: ReturnType<typeof supabase.channel> | null = null;

        (async () => {
            setLoading(true);
            const res = await supabase.from("games").select("*").eq("id", gameId).single();
            if (!res.error) setGame(res.data);
            setLoading(false);

            channel = supabase
                .channel(`game:${gameId}`)
                .on(
                    "postgres_changes",
                    { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
                    (payload) => setGame(payload.new)
                )
                .subscribe();
        })();

        return () => {
            if (channel) supabase.removeChannel(channel);
        };
    }, [gameId]);

    return { game, loading };
}