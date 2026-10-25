export interface SseEvent {
	event: string;
	data: string;
}
/** Incremental SSE parsing, including CRLF split across UTF-8 chunks. */
export async function* readSse(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	const reader = body.getReader(),
		decoder = new TextDecoder();
	let buffer = '',
		pendingCR = false;
	const normalize = (text: string) => {
		let result = '';
		for (const char of text) {
			if (pendingCR) {
				pendingCR = false;
				if (char === '\n') continue;
			}
			if (char === '\r') {
				result += '\n';
				pendingCR = true;
			} else result += char;
		}
		return result;
	};
	try {
		for (;;) {
			const { done, value } = await reader.read();
			buffer += normalize(
				done ? decoder.decode() : decoder.decode(value, { stream: true }),
			);
			let end = buffer.indexOf('\n\n');
			while (end >= 0) {
				const frame = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);
				let event = 'message';
				const data: string[] = [];
				for (const line of frame.split('\n')) {
					if (line.startsWith(':')) continue;
					const colon = line.indexOf(':');
					const field = colon < 0 ? line : line.slice(0, colon);
					const raw = colon < 0 ? '' : line.slice(colon + 1);
					const text = raw.startsWith(' ') ? raw.slice(1) : raw;
					if (field === 'event') event = text;
					else if (field === 'data') data.push(text);
				}
				if (data.length) yield { event, data: data.join('\n') };
				end = buffer.indexOf('\n\n');
			}
			if (done) break;
		}
	} finally {
		try {
			await reader.cancel();
		} finally {
			reader.releaseLock();
		}
	}
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		const finish = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', finish);
			resolve();
		};
		const timer = setTimeout(finish, ms);
		signal?.addEventListener('abort', finish, { once: true });
		if (signal?.aborted) finish();
	});
}
