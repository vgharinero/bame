export type Serializable =
	| string
	| number
	| boolean
	| null
	| Serializable[]
	| { [key: string]: Serializable };

export type Payload = Record<string, Serializable> | null;

export type PayloadMap = Record<string, Payload>;

export type Keys<T extends Record<string, unknown>> = keyof T & string;

export type KeysOfType<T, V> = {
	[K in keyof T]: T[K] extends V ? K : never;
}[keyof T];
