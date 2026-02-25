import type { Payload, PayloadMap } from '../primitives';

type Prettify<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

export type DiscriminatedFields<
	TMap extends PayloadMap,
	TTypeKey extends string,
	TDataKey extends string,
> = {
	[K in keyof TMap]: Prettify<
		TMap[K] extends null
			? { [T in TTypeKey]: K } & { [D in TDataKey]: null }
			: { [T in TTypeKey]: K } & { [D in TDataKey]: TMap[K] }
	>;
}[keyof TMap];

export type Perspective<
	TPrivate extends Payload = Payload,
	TPublic extends Payload = Payload,
> = {
	private: TPrivate;
	public: TPublic;
};

export type Public<TPublic extends Payload> = Perspective<TPublic, TPublic>;
export type Private<TPrivate extends Payload> = Perspective<TPrivate, never>;

export type PerspectiveMap = Record<string, Perspective>;

export type FromPerspective<
	T,
	TPerspective extends keyof Perspective,
> = T extends Perspective ? T[TPerspective] : T;
