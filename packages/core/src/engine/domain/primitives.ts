import type { PayloadMap } from '../primitives';

type Prettify<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type DiscriminatedFields<
	TMap extends PayloadMap,
	TTypeKey extends string,
	TDataKey extends string,
> = {
	[K in keyof TMap]: Prettify<
		{ [T in TTypeKey]: K } & { [D in TDataKey]: TMap[K] }
	>;
}[keyof TMap];
