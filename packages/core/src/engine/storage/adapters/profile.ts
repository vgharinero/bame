import type { Profile } from '../../domain';
import { ProfileMapper } from '../mappers';
import { VersionedStorage } from '../realtime/versioned-storage';
import { TABLES } from '../schema';

export class ProfileStorageAdapter extends VersionedStorage {
	async getProfile(userId: string): Promise<Profile | null> {
		const profileRecord = await this.dataSource.performGet(
			TABLES.PROFILES,
			userId,
		);

		if (!profileRecord) {
			return null;
		}

		return ProfileMapper.toDomain(profileRecord);
	}

	async getProfilesByIds(userIds: string[]): Promise<Profile[]> {
		const profileRecords = await this.dataSource.performGetMany(
			TABLES.PROFILES,
			userIds,
		);

		return profileRecords.map((record) => ProfileMapper.toDomain(record));
	}

	async updateProfile(profile: Profile): Promise<void> {
		const profileRecord = ProfileMapper.toRecord(profile);
		await this.updateVersionedRecord(TABLES.PROFILES, profileRecord);
	}
}
