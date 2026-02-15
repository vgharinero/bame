import { createBrowserClient } from '@supabase/ssr';

export const browserClient = (url: string, key: string) => {
	return createBrowserClient(url, key);
};
