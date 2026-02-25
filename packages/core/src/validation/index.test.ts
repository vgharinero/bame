import { describe, expect, it } from 'vitest';
import {
	createMockAction,
	createMockGame,
	createMockPlayer,
} from '../domain/fixtures';
import {
	areRequiredActionsComplete,
	canAdvancePhase,
	canPerformAction,
	canPlayerAct,
	isActionAllowed,
	isGameActive,
	isPlayerActive,
	isPlayerTurn,
	validateRequiredPhase,
} from '.';

describe('base-validators', () => {
	describe('isGameActive', () => {
		it('should return true when game status is active', () => {
			const game = createMockGame({ status: 'active' });

			expect(isGameActive(game)).toBe(true);
		});

		it('should return false when game status is waiting', () => {
			const game = createMockGame({ status: 'waiting' });

			expect(isGameActive(game)).toBe(false);
		});

		it('should return false when game status is paused', () => {
			const game = createMockGame({ status: 'paused' });

			expect(isGameActive(game)).toBe(false);
		});

		it('should return false when game status is finished', () => {
			const game = createMockGame({ status: 'finished' });

			expect(isGameActive(game)).toBe(false);
		});

		it('should return false when game status is aborted', () => {
			const game = createMockGame({ status: 'aborted' });

			expect(isGameActive(game)).toBe(false);
		});
	});

	describe('isPlayerTurn', () => {
		it('should return true when player ID matches current player', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isPlayerTurn(game, 'user-1')).toBe(true);
		});

		it('should return false when player ID does not match current player', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isPlayerTurn(game, 'user-2')).toBe(false);
		});

		it('should return false for non-existent player ID', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isPlayerTurn(game, 'user-999')).toBe(false);
		});

		it('should handle empty string player ID', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: '',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isPlayerTurn(game, '')).toBe(true);
			expect(isPlayerTurn(game, 'user-1')).toBe(false);
		});
	});

	describe('isPlayerActive', () => {
		it('should return true when player exists and status is active', () => {
			const players = [
				createMockPlayer('user-1', 'active'),
				createMockPlayer('user-2', 'active'),
			];

			expect(isPlayerActive(players, 'user-1')).toBe(true);
		});

		it('should return false when player exists but status is eliminated', () => {
			const players = [
				createMockPlayer('user-1', 'eliminated'),
				createMockPlayer('user-2', 'active'),
			];

			expect(isPlayerActive(players, 'user-1')).toBe(false);
		});

		it('should return false when player exists but status is disconnected', () => {
			const players = [
				createMockPlayer('user-1', 'disconnected'),
				createMockPlayer('user-2', 'active'),
			];

			expect(isPlayerActive(players, 'user-1')).toBe(false);
		});

		it('should return false when player exists but status is syncing', () => {
			const players = [
				createMockPlayer('user-1', 'syncing'),
				createMockPlayer('user-2', 'active'),
			];

			expect(isPlayerActive(players, 'user-1')).toBe(false);
		});

		it('should return false when player does not exist', () => {
			const players = [
				createMockPlayer('user-1', 'active'),
				createMockPlayer('user-2', 'active'),
			];

			expect(isPlayerActive(players, 'user-999')).toBe(false);
		});

		it('should return false for empty players array', () => {
			expect(isPlayerActive([], 'user-1')).toBe(false);
		});

		it('should find correct player in array with multiple players', () => {
			const players = [
				createMockPlayer('user-1', 'eliminated'),
				createMockPlayer('user-2', 'active'),
				createMockPlayer('user-3', 'disconnected'),
				createMockPlayer('user-4', 'active'),
			];

			expect(isPlayerActive(players, 'user-2')).toBe(true);
			expect(isPlayerActive(players, 'user-4')).toBe(true);
			expect(isPlayerActive(players, 'user-1')).toBe(false);
			expect(isPlayerActive(players, 'user-3')).toBe(false);
		});
	});

	describe('isActionAllowed', () => {
		it('should return true when action is in allowed actions', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move', 'pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isActionAllowed(game, 'move')).toBe(true);
			expect(isActionAllowed(game, 'pass')).toBe(true);
		});

		it('should return false when action is not in allowed actions', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move', 'pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isActionAllowed(game, 'draw')).toBe(false);
		});

		it('should return false when allowed actions is empty', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: [],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isActionAllowed(game, 'move')).toBe(false);
		});

		it('should handle single allowed action', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isActionAllowed(game, 'pass')).toBe(true);
			expect(isActionAllowed(game, 'move')).toBe(false);
		});

		it('should handle all possible actions allowed', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move', 'draw', 'pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(isActionAllowed(game, 'move')).toBe(true);
			expect(isActionAllowed(game, 'draw')).toBe(true);
			expect(isActionAllowed(game, 'pass')).toBe(true);
		});
	});

	describe('validateRequiredPhase', () => {
		it('should return true when no required phase is specified', () => {
			expect(validateRequiredPhase('play')).toBe(true);
			expect(validateRequiredPhase('setup')).toBe(true);
			expect(validateRequiredPhase('end')).toBe(true);
		});

		it('should return true when current phase matches required phase', () => {
			expect(validateRequiredPhase('play', 'play')).toBe(true);
			expect(validateRequiredPhase('setup', 'setup')).toBe(true);
			expect(validateRequiredPhase('end', 'end')).toBe(true);
		});

		it('should return false when current phase does not match required phase', () => {
			expect(validateRequiredPhase('play', 'setup')).toBe(false);
			expect(validateRequiredPhase('setup', 'play')).toBe(false);
			expect(validateRequiredPhase('play', 'end')).toBe(false);
		});

		it('should handle undefined required phase explicitly', () => {
			expect(validateRequiredPhase('play', undefined)).toBe(true);
			expect(validateRequiredPhase('setup', undefined)).toBe(true);
		});
	});

	describe('areRequiredActionsComplete', () => {
		it('should return true when requiredActions is undefined', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: undefined,
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(areRequiredActionsComplete(game)).toBe(true);
		});

		it('should return true when requiredActions is empty array', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: [],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(areRequiredActionsComplete(game)).toBe(true);
		});

		it('should return false when requiredActions has one action', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(areRequiredActionsComplete(game)).toBe(false);
		});

		it('should return false when requiredActions has multiple actions', () => {
			const game = createMockGame({
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move', 'draw', 'pass'],
					requiredActions: ['move', 'draw', 'pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(areRequiredActionsComplete(game)).toBe(false);
		});
	});

	describe('canPlayerAct', () => {
		it('should return true when all conditions are met', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canPlayerAct(game, 'user-1')).toBe(true);
		});

		it('should return false when game is not active', () => {
			const game = createMockGame({
				status: 'waiting',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canPlayerAct(game, 'user-1')).toBe(false);
		});

		it('should return false when it is not the player turn', () => {
			const game = createMockGame({
				status: 'active',
				players: [
					createMockPlayer('user-1', 'active'),
					createMockPlayer('user-2', 'active'),
				],
				turn: {
					currentPlayerId: 'user-2',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canPlayerAct(game, 'user-1')).toBe(false);
		});

		it('should return false when player is not active', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'eliminated')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canPlayerAct(game, 'user-1')).toBe(false);
		});

		it('should return false when player does not exist', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-999',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canPlayerAct(game, 'user-999')).toBe(false);
		});

		it('should return false when game is finished', () => {
			const game = createMockGame({
				status: 'finished',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canPlayerAct(game, 'user-1')).toBe(false);
		});

		it('should return false when player is disconnected', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'disconnected')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canPlayerAct(game, 'user-1')).toBe(false);
		});

		it('should return false when player is syncing', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'syncing')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canPlayerAct(game, 'user-1')).toBe(false);
		});
	});

	describe('canPerformAction', () => {
		it('should return true when all conditions are met', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move', 'pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			const action = createMockAction({
				userId: 'user-1',
				type: 'move',
				payload: { position: 0 },
				requiredPhase: 'play',
			});

			expect(canPerformAction(game, action)).toBe(true);
		});

		it('should return true when action has no required phase', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move', 'pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			const action = createMockAction({
				userId: 'user-1',
				type: 'move',
				payload: { position: 0 },
				requiredPhase: undefined,
			});

			expect(canPerformAction(game, action)).toBe(true);
		});

		it('should return false when player cannot act', () => {
			const game = createMockGame({
				status: 'waiting',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			const action = createMockAction({
				userId: 'user-1',
				type: 'move',
				payload: { position: 0 },
				requiredPhase: 'play',
			});

			expect(canPerformAction(game, action)).toBe(false);
		});

		it('should return false when action is not allowed', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			const action = createMockAction({
				userId: 'user-1',
				type: 'move',
				payload: { position: 0 },
				requiredPhase: 'play',
			});

			expect(canPerformAction(game, action)).toBe(false);
		});

		it('should return false when phase does not match required phase', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			const action = createMockAction({
				userId: 'user-1',
				type: 'move',
				payload: { position: 0 },
				requiredPhase: 'setup',
			});

			expect(canPerformAction(game, action)).toBe(false);
		});

		it('should return false when it is not the player turn', () => {
			const game = createMockGame({
				status: 'active',
				players: [
					createMockPlayer('user-1', 'active'),
					createMockPlayer('user-2', 'active'),
				],
				turn: {
					currentPlayerId: 'user-2',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			const action = createMockAction({
				userId: 'user-1',
				type: 'move',
				payload: { position: 0 },
				requiredPhase: 'play',
			});

			expect(canPerformAction(game, action)).toBe(false);
		});

		it('should return false when player is eliminated', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'eliminated')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			const action = createMockAction({
				userId: 'user-1',
				type: 'move',
				payload: { position: 0 },
				requiredPhase: 'play',
			});

			expect(canPerformAction(game, action)).toBe(false);
		});

		it('should handle action with pass type', () => {
			const game = createMockGame({
				status: 'active',
				players: [createMockPlayer('user-1', 'active')],
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			const action = createMockAction({
				userId: 'user-1',
				type: 'pass',
				payload: null,
				requiredPhase: 'play',
			});

			expect(canPerformAction(game, action)).toBe(true);
		});
	});

	describe('canAdvancePhase', () => {
		it('should return true when game is active and no required actions', () => {
			const game = createMockGame({
				status: 'active',
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: undefined,
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canAdvancePhase(game)).toBe(true);
		});

		it('should return true when game is active and required actions are empty', () => {
			const game = createMockGame({
				status: 'active',
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: [],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canAdvancePhase(game)).toBe(true);
		});

		it('should return false when game is not active', () => {
			const game = createMockGame({
				status: 'waiting',
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: undefined,
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canAdvancePhase(game)).toBe(false);
		});

		it('should return false when required actions are not complete', () => {
			const game = createMockGame({
				status: 'active',
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: ['move'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canAdvancePhase(game)).toBe(false);
		});

		it('should return false when game is finished even if no required actions', () => {
			const game = createMockGame({
				status: 'finished',
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: undefined,
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canAdvancePhase(game)).toBe(false);
		});

		it('should return false when game is paused even if no required actions', () => {
			const game = createMockGame({
				status: 'paused',
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move'],
					requiredActions: [],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canAdvancePhase(game)).toBe(false);
		});

		it('should return false when game is active but has multiple required actions', () => {
			const game = createMockGame({
				status: 'active',
				turn: {
					currentPlayerId: 'user-1',
					allowedActions: ['move', 'draw', 'pass'],
					requiredActions: ['move', 'draw', 'pass'],
					number: 1,
					phase: 'play',
					phaseData: { round: 1 },
				},
			});

			expect(canAdvancePhase(game)).toBe(false);
		});
	});
});
