export interface VersionedEntity<TIdentifier = string> {
	id: TIdentifier;
	version: number;
	createdAt: number;
	updatedAt: number;
}
