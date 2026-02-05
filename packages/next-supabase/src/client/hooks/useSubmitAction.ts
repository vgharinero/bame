"use client";

import { useState, useCallback } from "react";

export type SubmitActionState = {
    submitting: boolean;
    error: string | null;
};

export type UseSubmitActionReturn = SubmitActionState & {
    submitAction: (gameId: string, action: unknown) => Promise<boolean>;
    clearError: () => void;
};

/**
 * Hook to submit game actions.
 * 
 * @param endpoint - The API endpoint for submitting actions (default: "/api/game/action")
 */
export const useSubmitAction = (endpoint = "/api/game/action"): UseSubmitActionReturn => {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submitAction = useCallback(async (gameId: string, action: unknown): Promise<boolean> => {
        setSubmitting(true);
        setError(null);

        try {
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ gameId, action }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to submit action");
                setSubmitting(false);
                return false;
            }

            setSubmitting(false);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Network error");
            setSubmitting(false);
            return false;
        }
    }, [endpoint]);

    const clearError = useCallback(() => setError(null), []);

    return { submitting, error, submitAction, clearError };
};

