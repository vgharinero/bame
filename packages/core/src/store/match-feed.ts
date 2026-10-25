export interface VersionedSnapshot<TView> {
	version: number;
	view: TView;
}

export interface MatchFeedOptions<TView> {
	/**
	 * Fetch the latest snapshot from the server (used on initial load, reconnect,
	 * or when a version gap is detected).
	 */
	fetchLatest: () => Promise<VersionedSnapshot<TView>>;
	/**
	 * Called whenever a newer snapshot becomes the current state.
	 */
	onChange: (view: TView, version: number) => void;
}

/**
 * Client-side snapshot synchronizer that guarantees monotonic state updates.
 * - Ignores stale or duplicate snapshots (`version <= currentVersion`).
 * - Applies sequential snapshots (`version === currentVersion + 1`) immediately.
 * - On a version gap (`version > currentVersion + 1`), applies the newer snapshot
 *   immediately (since snapshots are self-contained) and optionally triggers
 *   `refetch()` when requested on reconnect.
 */
export class MatchFeed<TView> {
	private currentVersion = 0;
	private currentView: TView | null = null;
	private refetchPromise: Promise<TView> | null = null;

	constructor(private readonly options: MatchFeedOptions<TView>) {}

	public get version(): number {
		return this.currentVersion;
	}

	public get view(): TView | null {
		return this.currentView;
	}

	public receive(snapshot: VersionedSnapshot<TView>): boolean {
		if (snapshot.version <= this.currentVersion) {
			return false;
		}

		this.currentVersion = snapshot.version;
		this.currentView = snapshot.view;
		this.options.onChange(snapshot.view, snapshot.version);
		return true;
	}

	public async refetch(): Promise<TView> {
		if (this.refetchPromise) {
			return this.refetchPromise;
		}

		this.refetchPromise = (async () => {
			try {
				const latest = await this.options.fetchLatest();
				if (latest.version > this.currentVersion || this.currentView === null) {
					this.currentVersion = latest.version;
					this.currentView = latest.view;
					this.options.onChange(latest.view, latest.version);
				}
				return this.currentView as TView;
			} finally {
				this.refetchPromise = null;
			}
		})();

		return this.refetchPromise;
	}
}
