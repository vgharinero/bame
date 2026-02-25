export type Serializable =
	| string
	| number
	| boolean
	| null
	| Serializable[]
	| { [key: string]: Serializable };

export type PayloadMap = Record<string, Payload>;

export type Payload = Record<string, Serializable> | null;

export type KeysOfType<T, V> = {
	[K in keyof T]: T[K] extends V ? K : never;
}[keyof T];
