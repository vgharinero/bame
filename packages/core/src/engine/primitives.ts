export type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };

export type PayloadMap = Record<string, Payload | null>;

export type Payload = Record<string, JsonValue>;

export type KeysOfType<T, V> = {
	[K in keyof T]: T[K] extends V ? K : never;
}[keyof T];
