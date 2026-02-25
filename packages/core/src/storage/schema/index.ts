import { ACTIONS_SCHEMA } from './action';
import { GAMES_SCHEMA } from './game';
import { LOBBIES_SCHEMA } from './lobby';
import { LOBBY_MEMBERS_SCHEMA } from './lobby-member';
import { PLAYER_SCHEMA } from './player';
import { PROFILES_SCHEMA } from './profile';

export const SCHEMAS = {
	[PROFILES_SCHEMA.tableName]: PROFILES_SCHEMA,
	[LOBBIES_SCHEMA.tableName]: LOBBIES_SCHEMA,
	[LOBBY_MEMBERS_SCHEMA.tableName]: LOBBY_MEMBERS_SCHEMA,
	[GAMES_SCHEMA.tableName]: GAMES_SCHEMA,
	[PLAYER_SCHEMA.tableName]: PLAYER_SCHEMA,
	[ACTIONS_SCHEMA.tableName]: ACTIONS_SCHEMA,
} as const;

export const TABLES = Object.fromEntries(
	Object.entries(SCHEMAS).map(([key, value]) => [
		key.toUpperCase(),
		value.tableName,
	]),
) as {
	[key in Uppercase<TableName>]: (typeof SCHEMAS)[Lowercase<key>]['tableName'];
};

export type TableName = keyof typeof SCHEMAS;
export type TableRecord<TTable extends TableName> =
	(typeof SCHEMAS)[TTable]['_record'];
