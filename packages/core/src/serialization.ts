/**
 * Serialize game state for database storage.
 * 
 * Supabase/PostgreSQL JSONB handles this natively - the database driver
 * converts JS objects to optimized binary JSONB format automatically.
 * No manual JSON.stringify needed.
 * 
 * State must be JSON-compatible (objects, arrays, strings, numbers, booleans, null).
 */
export const serializeState = <State>(state: State): State => {
    return state;
};

/**
 * Deserialize game state from database.
 * 
 * Supabase/PostgreSQL JSONB is automatically parsed by the database driver
 * back into JS objects. No manual parsing needed.
 */
export const deserializeState = <State>(raw: unknown): State => {
    return raw as State;
};

