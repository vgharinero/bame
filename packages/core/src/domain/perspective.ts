import type { Keys, Payload } from '../primitives';

export type Perspective<
	TPrivate extends Payload = Payload,
	TPublic extends Payload = Payload,
> = {
	private: TPrivate;
	public: TPublic;
};

export type Viz = keyof Perspective;

export type Public<TPublic extends Payload> = Perspective<TPublic, TPublic>;

export type PerspectiveMap = Record<string, Perspective>;

export type EitherVizFields<
	TViz extends Viz,
	TPrivate extends Payload,
	TPublic extends Payload = {},
> = TViz extends 'private' ? TPrivate : TPublic;

export type FromVizUnionFields<
	TKey extends string,
	TData extends string,
	TMap extends PerspectiveMap,
	TViz extends Viz,
> = {
	[K in Keys<TMap>]: {
		[P in TKey]: K;
	} & {
		[P in TData]: FromViz<TMap[K], TViz>;
	};
}[Keys<TMap>];

export type FromViz<T, TViz extends Viz> = T extends Perspective ? T[TViz] : T;
