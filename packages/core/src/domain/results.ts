import type { GameDefinition, GameStatus } from './game';
import type { Turn } from './turn';

export type InitializationResult<TDef extends GameDefinition> = {
	state: TDef['State'];
	playerStates: Record<string, TDef['PlayerState']>;
	initialTurn: Turn<TDef['ActionMap'], TDef['PhaseMap']>;
};

export type ApplyActionResult<TDef extends GameDefinition> =
	| {
			success: true;
			state: TDef['State'];
			playerStates: Record<string, TDef['PlayerState']>;
			newStatus?: GameStatus;
			newTurn?: Turn<TDef['ActionMap'], TDef['PhaseMap']>;
	  }
	| {
			success: false;
			error: string;
	  };

export type ValidateActionResult =
	| {
			isValid: true;
	  }
	| {
			isValid: false;
			reason: string;
	  };

export type CheckGameEndResult =
	| {
			isFinished: false;
	  }
	| {
			isFinished: true;
			winner?: string;
			isDraw?: boolean;
	  };
