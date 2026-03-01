import Constants from './ac5e-constants.mjs';
import { lazySandbox } from './ac5e-main.mjs';
import { evaluateCondition, prepareRollFormula } from './ac5e-parser.mjs';
import { _ac5eChecks } from './ac5e-setpieces.mjs';
import Settings from './ac5e-settings.mjs';

export const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const settings = new Settings();
const USE_CONFIG_INFLIGHT_TTL_MS = 15000;
const useConfigInflightCache = new Map();
const FLAG_REGISTRY_HOOK_TYPES = new Set(['attack', 'damage', 'save', 'check', 'heal', 'init', 'use']);
const FLAG_REGISTRY_MODE_NAMES = new Set([
	'advantage',
	'bonus',
	'critical',
	'diceUpgrade',
	'diceDowngrade',
	'disadvantage',
	'fail',
	'fumble',
	'modifier',
	'modifyDC',
	'noAdvantage',
	'noCritical',
	'noDisadvantage',
	'range',
	'success',
	'extraDice',
	'targetADC',
	'criticalThreshold',
	'fumbleThreshold',
]);

function _debugFlagEnabled(flag, legacyRootFlag = null) {
	return Boolean(ac5e?.debug?.[flag] ?? (legacyRootFlag ? ac5e?.[legacyRootFlag] : false));
}

function _createFlagRegistryState() {
	return {
		version: 1,
		updatedAt: 0,
		entriesById: new Map(),
		byActorUuid: new Map(),
		byItemUuid: new Map(),
		byEffectUuid: new Map(),
		byHookType: new Map(),
		byMode: new Map(),
	};
}

const ac5eFlagRegistryState = _createFlagRegistryState();

function _clearMapSets(map) {
	for (const key of map.keys()) map.delete(key);
}

function _resetFlagRegistryState() {
	ac5eFlagRegistryState.updatedAt = Date.now();
	ac5eFlagRegistryState.entriesById.clear();
	_clearMapSets(ac5eFlagRegistryState.byActorUuid);
	_clearMapSets(ac5eFlagRegistryState.byItemUuid);
	_clearMapSets(ac5eFlagRegistryState.byEffectUuid);
	_clearMapSets(ac5eFlagRegistryState.byHookType);
	_clearMapSets(ac5eFlagRegistryState.byMode);
}

function _indexRegistrySet(map, key, value) {
	if (!key || !value) return;
	const set = map.get(key) ?? new Set();
	set.add(value);
	map.set(key, set);
}

function _collectionCount(collection) {
	if (!collection) return 0;
	if (typeof collection.size === 'number') return collection.size;
	if (Array.isArray(collection) || typeof collection === 'string') return collection.length;
	return 0;
}

function _getAc5eFlagsFromDocument(document) {
	return document?.flags?.[Constants.MODULE_ID] ?? {};
}

function _safeUuid(document) {
	return document?.uuid ?? document?.document?.uuid;
}

function _normalizeCadenceToken(value) {
	if (value == null) return null;
	const token = String(value).trim().toLowerCase();
	if (!token) return null;
	if (token === 'onceperturn' || token === 'turn') return 'oncePerTurn';
	if (token === 'onceperround' || token === 'round') return 'oncePerRound';
	if (token === 'oncepercombat' || token === 'combat' || token === 'encounter') return 'oncePerCombat';
	return null;
}

function _extractRuleMetadata(value) {
	if (typeof value !== 'string') return { optin: false, priority: 0, addTo: null, condition: null, cadence: null };
	const fragments = value
		.split(/[;|]/)
		.map((part) => part.trim())
		.filter(Boolean);
	let optin = false;
	let priority = 0;
	let addTo = null;
	let condition = null;
	let cadence = null;
	for (const fragment of fragments) {
		const normalizedFragment = fragment.toLowerCase();
		if (normalizedFragment === 'optin') {
			optin = true;
			continue;
		}
		const fragmentCadence = _normalizeCadenceToken(normalizedFragment);
		if (fragmentCadence) {
			cadence = fragmentCadence;
			continue;
		}
		const [rawKey, ...rest] = fragment.split('=');
		if (!rawKey || !rest.length) continue;
		const key = rawKey.trim().toLowerCase();
		const parsedValue = rest.join('=').trim();
		if (!parsedValue) continue;
		if (key === 'priority') {
			const parsedPriority = Number(parsedValue);
			if (!Number.isNaN(parsedPriority)) priority = parsedPriority;
		} else if (key === 'addto') addTo = parsedValue;
		else if (key === 'condition') condition = parsedValue;
		else if (key === 'cadence') {
			const parsedCadence = _normalizeCadenceToken(parsedValue);
			if (parsedCadence) cadence = parsedCadence;
		}
	}
	return { optin, priority, addTo, condition, cadence };
}

function _getEffectOwnerActor(effect) {
	const parent = effect?.parent;
	if (!parent) return null;
	if (parent?.documentName === 'Actor') return parent;
	if (parent?.actor) return parent.actor;
	return null;
}

function _collectRegistryEntriesFromFlags({ sourceType, sourceDocument, actorDocument, itemDocument = null, effectDocument = null }) {
	const root = _getAc5eFlagsFromDocument(sourceDocument);
	if (!root || typeof root !== 'object') return [];
	const sourceUuid = _safeUuid(sourceDocument);
	const actorUuid = _safeUuid(actorDocument);
	const itemUuid = _safeUuid(itemDocument);
	const effectUuid = _safeUuid(effectDocument);
	const targetScopeFromPath = (parts) => {
		if (parts[0] === 'grants') return 'grants';
		if (parts[0] === 'aura') return 'aura';
		return 'source';
	};
	const entries = [];
	const walk = (node, path = []) => {
		if (node == null) return;
		if (Array.isArray(node)) {
			node.forEach((value, idx) => walk(value, [...path, String(idx)]));
			return;
		}
		if (typeof node === 'object') {
			for (const [key, value] of Object.entries(node)) walk(value, [...path, key]);
			return;
		}

		const last = path[path.length - 1];
		const mode = FLAG_REGISTRY_MODE_NAMES.has(last) ? last : null;
		const normalizedPath = path[0] === 'grants' || path[0] === 'aura' ? path.slice(1) : path;
		const hookType = normalizedPath.find((segment) => FLAG_REGISTRY_HOOK_TYPES.has(segment)) ?? null;
		if (!mode && !hookType) return;

		const meta = _extractRuleMetadata(node);
		const id = `${sourceType}:${sourceUuid}:${path.join('.')}`;
		entries.push({
			id,
			sourceType,
			sourceUuid,
			actorUuid,
			itemUuid,
			effectUuid,
			parentItemUuid: itemUuid,
			parentActorUuid: actorUuid,
			hookTypes: hookType ? [hookType] : [],
			targetScope: targetScopeFromPath(path),
			mode: mode ?? 'unknown',
			addTo: meta.addTo,
			value: node,
			optin: meta.optin,
			priority: meta.priority,
			cadence: meta.cadence,
			conditions: {
				expression: meta.condition,
			},
			debugLabel: `${sourceType}:${sourceDocument?.name ?? sourceUuid}`,
			raw: {
				path: path.join('.'),
				value: node,
			},
		});
	};
	walk(root, []);
	return entries;
}

function _indexRegistryEntries(entries = []) {
	for (const entry of entries) {
		ac5eFlagRegistryState.entriesById.set(entry.id, entry);
		_indexRegistrySet(ac5eFlagRegistryState.byActorUuid, entry.actorUuid, entry.id);
		_indexRegistrySet(ac5eFlagRegistryState.byItemUuid, entry.itemUuid, entry.id);
		_indexRegistrySet(ac5eFlagRegistryState.byEffectUuid, entry.effectUuid, entry.id);
		for (const hookType of entry.hookTypes ?? []) _indexRegistrySet(ac5eFlagRegistryState.byHookType, hookType, entry.id);
		if (entry.mode) _indexRegistrySet(ac5eFlagRegistryState.byMode, entry.mode, entry.id);
	}
}

function _collectActorRegistryEntries(actor) {
	const entries = [];
	entries.push(..._collectRegistryEntriesFromFlags({ sourceType: 'actor', sourceDocument: actor, actorDocument: actor }));
	for (const item of actor?.items ?? []) {
		entries.push(..._collectRegistryEntriesFromFlags({ sourceType: 'item', sourceDocument: item, actorDocument: actor, itemDocument: item }));
		for (const effect of item?.effects ?? []) {
			entries.push(..._collectRegistryEntriesFromFlags({ sourceType: 'effect', sourceDocument: effect, actorDocument: actor, itemDocument: item, effectDocument: effect }));
		}
	}
	for (const effect of actor?.effects ?? []) {
		entries.push(..._collectRegistryEntriesFromFlags({ sourceType: 'effect', sourceDocument: effect, actorDocument: actor, effectDocument: effect }));
	}
	return entries;
}

function _resolveActorFromAnyDocument(document) {
	if (!document) return null;
	if (document?.documentName === 'Actor') return document;
	if (document?.documentName === 'Item') return document?.actor ?? null;
	if (document?.documentName === 'ActiveEffect') return _getEffectOwnerActor(document);
	return document?.actor ?? null;
}

function _registrySpecificity(sourceType) {
	if (sourceType === 'effect') return 3;
	if (sourceType === 'item') return 2;
	return 1;
}

function _registryCandidateIds({ actorUuid, itemUuid, effectUuid, hookType, mode }) {
	const ids = new Set();
	const add = (map, key) => {
		if (!key) return;
		for (const id of map.get(key) ?? []) ids.add(id);
	};
	add(ac5eFlagRegistryState.byActorUuid, actorUuid);
	add(ac5eFlagRegistryState.byItemUuid, itemUuid);
	add(ac5eFlagRegistryState.byEffectUuid, effectUuid);
	if (!ids.size) {
		add(ac5eFlagRegistryState.byHookType, hookType);
		add(ac5eFlagRegistryState.byMode, mode);
	}
	return ids;
}

export function _buildFlagRegistry() {
	_resetFlagRegistryState();
	for (const actor of game?.actors ?? []) {
		const actorEntries = _collectActorRegistryEntries(actor);
		_indexRegistryEntries(actorEntries);
	}
	ac5eFlagRegistryState.updatedAt = Date.now();
	if (globalThis.ac5e?.debug.optins || settings.debug) {
		console.warn('AC5E flag registry rebuilt', {
			entries: ac5eFlagRegistryState.entriesById.size,
			actors: ac5eFlagRegistryState.byActorUuid.size,
			items: ac5eFlagRegistryState.byItemUuid.size,
			effects: ac5eFlagRegistryState.byEffectUuid.size,
		});
	}
	return ac5eFlagRegistryState;
}

export function _reindexFlagRegistryActor(document) {
	const actor = _resolveActorFromAnyDocument(document);
	if (!actor?.uuid) return ac5eFlagRegistryState;
	_buildFlagRegistry();
	return ac5eFlagRegistryState;
}

export function _getRelevantFlagRegistryEntries({ actor = null, item = null, effect = null, hookType = null, mode = null, targetScope = null } = {}) {
	const actorUuid = _safeUuid(actor);
	const itemUuid = _safeUuid(item);
	const effectUuid = _safeUuid(effect);
	const candidateIds = _registryCandidateIds({ actorUuid, itemUuid, effectUuid, hookType, mode });
	const entries = [...candidateIds]
		.map((id) => ac5eFlagRegistryState.entriesById.get(id))
		.filter(Boolean)
		.filter((entry) => !hookType || entry.hookTypes.includes(hookType))
		.filter((entry) => !mode || entry.mode === mode)
		.filter((entry) => !targetScope || entry.targetScope === targetScope)
		.sort((a, b) => {
			if (a.priority !== b.priority) return b.priority - a.priority;
			return _registrySpecificity(b.sourceType) - _registrySpecificity(a.sourceType);
		});
	return {
		subjectEntries: entries.filter((entry) => entry.targetScope === 'source'),
		opponentEntries: entries.filter((entry) => entry.targetScope === 'grants'),
		allEntries: entries,
	};
}

export function _inspectFlagRegistry({ actorUuid = null, hookType = null, mode = null } = {}) {
	const byActor = actorUuid ? [...(ac5eFlagRegistryState.byActorUuid.get(actorUuid) ?? [])] : [];
	const byHook = hookType ? [...(ac5eFlagRegistryState.byHookType.get(hookType) ?? [])] : [];
	const byMode = mode ? [...(ac5eFlagRegistryState.byMode.get(mode) ?? [])] : [];
	const candidateIds = new Set([...byActor, ...byHook, ...byMode]);
	const entries = [...candidateIds].map((id) => ac5eFlagRegistryState.entriesById.get(id)).filter(Boolean);
	return {
		meta: {
			version: ac5eFlagRegistryState.version,
			updatedAt: ac5eFlagRegistryState.updatedAt,
			totalEntries: ac5eFlagRegistryState.entriesById.size,
		},
		entries,
	};
}

function _pruneUseConfigInflightCache(now = Date.now()) {
	for (const [key, entry] of useConfigInflightCache.entries()) {
		if (!entry?.expiresAt || entry.expiresAt <= now) useConfigInflightCache.delete(key);
	}
}

function _getUseConfigInflightCacheEntry(ids = []) {
	_pruneUseConfigInflightCache();
	for (const id of ids) {
		if (!id) continue;
		const entry = useConfigInflightCache.get(id);
		if (entry?.useConfig) return entry;
	}
	return null;
}

export function _setUseConfigInflightCache({ messageId, originatingMessageId, useConfig } = {}) {
	if (!useConfig) return;
	const now = Date.now();
	const expiresAt = now + USE_CONFIG_INFLIGHT_TTL_MS;
	const safeIds = new Set([messageId, originatingMessageId].filter(Boolean));
	if (!safeIds.size) return;
	const clonedUseConfig = foundry.utils.duplicate(useConfig);
	if (clonedUseConfig?.options?.originatingUseConfig !== undefined) delete clonedUseConfig.options.originatingUseConfig;
	for (const id of safeIds) {
		useConfigInflightCache.set(id, { useConfig: clonedUseConfig, expiresAt });
	}
}

export function _getMessageFlagScope(message, scope) {
	if (!message || !scope) return undefined;
	if (message?.data?.flags?.[scope] !== undefined) return message.data.flags[scope];
	return message?.flags?.[scope];
}

export function _setMessageFlagScope(messageLike, scope, patch, { merge = true } = {}) {
	if (!messageLike || !scope) return;
	const currentScope = _getMessageFlagScope(messageLike, scope);
	let nextScope;
	if (merge && currentScope && typeof currentScope === 'object' && patch && typeof patch === 'object') {
		nextScope = foundry.utils.mergeObject(foundry.utils.duplicate(currentScope), patch, { inplace: false });
	} else if (patch && typeof patch === 'object') {
		nextScope = foundry.utils.duplicate(patch);
	} else {
		nextScope = patch;
	}
	try {
		foundry.utils.setProperty(messageLike, `data.flags.${scope}`, nextScope);
	} catch (_err) {
		// ignore immutable message-like payloads
	}
	try {
		foundry.utils.setProperty(messageLike, `flags.${scope}`, patch && typeof patch === 'object' ? foundry.utils.duplicate(nextScope) : nextScope);
	} catch (_err) {
		// ignore immutable message-like payloads
	}
	if (messageLike?.updateSource instanceof Function) {
		try {
			messageLike.updateSource({ [`flags.${scope}`]: nextScope });
		} catch (_err) {
			// ignore immutable message source payloads
		}
	}
}

function _getMessageDnd5eFlags(message) {
	return _getMessageFlagScope(message, 'dnd5e');
}

function _getMessageAc5eFlags(message) {
	return _getMessageFlagScope(message, Constants.MODULE_ID);
}

export function _resolveUseMessageContext({ message = null, messageId = null, originatingMessageId = null } = {}) {
	const triggerMessage = message ?? (messageId ? game.messages.get(messageId) : undefined);
	const triggerDnd5eFlags = _getMessageDnd5eFlags(triggerMessage);
	const resolvedOriginatingMessageId =
		originatingMessageId ?? triggerDnd5eFlags?.originatingMessage ?? triggerMessage?.id;
	const registryMessages = resolvedOriginatingMessageId ? dnd5e?.registry?.messages?.get(resolvedOriginatingMessageId) : undefined;
	const originatingMessage =
		resolvedOriginatingMessageId ?
			(game.messages.get(resolvedOriginatingMessageId) ?? registryMessages?.find((msg) => msg?.id === resolvedOriginatingMessageId) ?? registryMessages?.[0])
		:	triggerMessage;
	const usageMessage = registryMessages?.find((msg) => _getMessageDnd5eFlags(msg)?.messageType === 'usage');
	const resolvedMessage = triggerMessage ?? usageMessage ?? originatingMessage;
	const resolvedMessageId = resolvedMessage?.id ?? messageId;
	const useConfig = _getMessageAc5eFlags(usageMessage)?.use ?? _getMessageAc5eFlags(originatingMessage)?.use ?? null;
	return {
		message: resolvedMessage,
		triggerMessage,
		originatingMessageId: resolvedOriginatingMessageId,
		originatingMessage,
		usageMessage,
		registryMessages,
		resolvedMessageId,
		useConfig,
	};
}

/**
 * Foundry v12 updated.
 * Gets the minimum distance between two tokens,
 * evaluating perimeter grid spaces they occupy and checking for walls blocking.
 */
export function _getDistance(tokenA, tokenB, includeUnits = false, overrideMidi = true, checkCollision = false, includeHeight = true) {
	let totalDistance = Infinity;
	const meleeDiagonals = settings.autoRangeChecks.has('meleeDiagonals');
	let adjacent2D;

	const tokenInstance = foundry.canvas.placeables.Token;
	if (typeof tokenA === 'string') {
		if (tokenA.includes('.')) tokenA = fromUuidSync(tokenA)?.object;
		else tokenA = canvas.tokens.get(tokenA);
	}
	if (typeof tokenB === 'string') {
		if (tokenB.includes('.')) tokenB = fromUuidSync(tokenB)?.object;
		else tokenB = canvas.tokens.get(tokenB);
	}
	if (!(tokenA instanceof tokenInstance) || !(tokenB instanceof tokenInstance)) return totalDistance;

	const { grid } = canvas || {};
	if (foundry.utils.isEmpty(grid)) return totalDistance;
	const { size, sizeX, sizeY, diagonals: gridDiagonals, distance: gridDistance, units, isGridless, isHexagonal, isSquare } = grid;

	if (_activeModule('midi-qol') && !overrideMidi) {
		const result = MidiQOL.computeDistance(tokenA, tokenB);
		if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - Defer to MidiQOL.computeDistance():`, { sourceId: tokenA?.id, targetId: tokenB?.id, result, units });
		if (includeUnits) return result + (includeUnits ? units : '');
		if (result === -1) return totalDistance;
		return result;
	}

	let diagonals, spaces;

	if (isHexagonal) {
		const tokenAHexes = getHexesOnPerimeter(tokenA);
		if (settings.debug) tokenAHexes.forEach((e) => canvas.ping(e));
		const tokenBHexes = getHexesOnPerimeter(tokenB);
		if (settings.debug) tokenBHexes.forEach((e) => canvas.ping(e));

		outer: for (const pointA of tokenAHexes) {
			for (const pointB of tokenBHexes) {
				if (
					checkCollision &&
					CONFIG.Canvas.polygonBackends[checkCollision].testCollision(pointB, pointA, {
						source: tokenB.document,
						mode: 'any',
						type: checkCollision,
					})
				)
					continue;
				adjacent2D = testAdjacency(canvas.grid.getOffset(pointA), canvas.grid.getOffset(pointB));
				if (adjacent2D && meleeDiagonals) {
					totalDistance = gridDistance;
					diagonals = 0;
					spaces = 1;
					break outer;
				} else {
					const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
					if (distance2D < totalDistance) {
						totalDistance = distance2D;
						diagonals = pathDiagonals;
						spaces = pathSpaces;
					}
				}
			}
		}
	} else {
		const areTokensIntersencting = tokenA.bounds.intersects(tokenB.bounds);
		if (areTokensIntersencting) {
			totalDistance = 0;
			diagonals = 0;
			spaces = 0;
		} else if (isGridless) {
			const tokenASquares = getGridlessSquaresOnPerimeter(tokenA);
			if (settings.debug) tokenASquares.forEach((s) => canvas.ping(s));
			const tokenBSquares = getGridlessSquaresOnPerimeter(tokenB);
			if (settings.debug) tokenBSquares.forEach((s) => canvas.ping(s));
			for (const pointA of tokenASquares) {
				for (const pointB of tokenBSquares) {
					if (
						checkCollision &&
						CONFIG.Canvas.polygonBackends[checkCollision].testCollision(pointB, pointA, {
							source: tokenB.document,
							mode: 'any',
							type: checkCollision,
						})
					)
						continue;
					const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
					if (distance2D < totalDistance) {
						const leeway = settings.autoRangeChecks.has('meleeOoR') ? gridDistance * 2 : false; //@to-do: offer a setting to turn on and set to user choice.
						totalDistance = leeway && distance2D <= leeway ? gridDistance : distance2D;
						diagonals = pathDiagonals;
						spaces = pathSpaces;
					}
				}
			}
		} else if (isSquare) {
			//const tokensIntersection = tokenA.bounds.intersection(tokenB.bounds);
			const tokenASquares = getSquaresOnPerimeter(tokenA);
			if (settings.debug) tokenASquares.forEach((s) => canvas.ping(s));
			const tokenBSquares = getSquaresOnPerimeter(tokenB);
			if (settings.debug) tokenBSquares.forEach((s) => canvas.ping(s));

			outer: for (const pointA of tokenASquares) {
				for (const pointB of tokenBSquares) {
					if (
						checkCollision &&
						CONFIG.Canvas.polygonBackends[checkCollision].testCollision(pointB, pointA, {
							source: tokenB.document,
							mode: 'any',
							type: checkCollision,
						})
					)
						continue;
					adjacent2D = testAdjacency(canvas.grid.getOffset(pointA), canvas.grid.getOffset(pointB));
					if (adjacent2D && meleeDiagonals) {
						totalDistance = gridDistance;
						diagonals = 0;
						spaces = 1;
						break outer;
					} else {
						const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
						if (distance2D < totalDistance) {
							totalDistance = distance2D;
							diagonals = pathDiagonals;
							spaces = pathSpaces;
						}
					}
				}
			}
		}
	}

	if (includeHeight) totalDistance = heightDifference(tokenA, tokenB, totalDistance, diagonals, spaces, grid, adjacent2D);
	if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - getDistance():`, { sourceId: tokenA.id, opponentId: tokenB.id, result: totalDistance, units });
	if (includeUnits) return ((totalDistance * 100) | 0) / 100 + units;
	return ((totalDistance * 100) | 0) / 100;
}

// reworked canvas.grid.testAdjacency to not care about diagonals
function testAdjacency(coords1, coords2) {
	const { i: i1, j: j1, k: k1 } = canvas.grid.getOffset(coords1);
	const { i: i2, j: j2, k: k2 } = canvas.grid.getOffset(coords2);
	const di = Math.abs(i1 - i2);
	const dj = Math.abs(j1 - j2);
	// @to-do: use 3D foundry functions instead of heightdifference dz
	const dk = k1 !== undefined ? Math.abs(k1 - k2) : 0;
	return Math.max(di, dj, dk) === 1;
}

function heightDifference(tokenA, tokenB, totalDistance, diagonals, spaces, grid, adjacent2D) {
	tokenA.z0 = (tokenA.document.elevation / grid.distance) | 0;
	tokenA.z1 = tokenA.z0 + Math.max(1, Math.min(tokenA.document.width | 0, tokenA.document.height | 0));
	tokenB.z0 = (tokenB.document.elevation / grid.distance) | 0;
	tokenB.z1 = tokenB.z0 + Math.max(1, Math.min(tokenB.document.width | 0, tokenB.document.height | 0));
	const dz =
		tokenB.z0 >= tokenA.z1 ? tokenB.z0 - tokenA.z1 + 1
		: tokenA.z0 >= tokenB.z1 ? tokenA.z0 - tokenB.z1 + 1
		: 0;
	if (Math.abs(dz) <= 1 && adjacent2D) return totalDistance;
	if (grid.isGridless) {
		const verticalDistance = dz * grid.distance;
		totalDistance = dz ? Math.sqrt(totalDistance * totalDistance + verticalDistance * verticalDistance) : totalDistance;
	} else totalDistance = dz ? calculateDiagonalsZ(diagonals, dz, spaces, grid) : totalDistance;
	return totalDistance;
}

function getHexesOnPerimeter(t) {
	const perimeterPoints = getHexPerimeterPoints(t);
	if (!perimeterPoints || perimeterPoints.length === 0) {
		console.warn('No perimeter points found for the token.');
		return [];
	}

	const foundHexes = {};

	for (let i = 0; i < perimeterPoints.length; i += 1) {
		const p = perimeterPoints[i];
		const nudged = nudgeToward(p, t.center);
		const pointToCube = canvas.grid.pointToCube({ x: nudged[0], y: nudged[1] });
		const hex = canvas.grid.getCenterPoint(pointToCube);
		hex.id = hex.x + hex.y;
		if (!foundHexes[hex.id] && hex.x > t.bounds.left && hex.x < t.bounds.right && hex.y < t.bounds.bottom && hex.y > t.bounds.top) {
			foundHexes[hex.id] = hex;
		}
	}
	return Object.values(foundHexes);
}
function nudgeToward(point, center, distance = 0.2) {
	const dx = center.x - point.x;
	const dy = center.y - point.y;
	const radians = Math.atan2(dy, dx);
	const degrees = radians * (180 / Math.PI);
	const nudgedPoint = getHexTranslatedPoint(point, degrees, distance);
	return [nudgedPoint.x, nudgedPoint.y];
}

function getHexPerimeterPoints(t) {
	const clipperP = t.shape.toClipperPoints();

	const points = [];
	clipperP.forEach((r) => points.push({ x: t.x + r.X, y: t.y + r.Y }));
	return points;
}

function getHexTranslatedPoint(point, direction, distance) {
	direction = Math.toRadians(direction);
	const dx = Math.cos(direction);
	const dy = Math.sin(direction);
	let q;
	let r;
	if (canvas.grid.columns) {
		q = 2 * Math.SQRT1_3 * dx;
		r = -0.5 * q + dy;
	} else {
		r = 2 * Math.SQRT1_3 * dy;
		q = -0.5 * r + dx;
	}
	const s = ((distance / canvas.grid.distance) * canvas.grid.size) / ((Math.abs(r) + Math.abs(q) + Math.abs(q + r)) / 2);
	const newPoint = { x: point.x + dx * s, y: point.y + dy * s };
	return newPoint;
}

function getGridlessSquaresOnPerimeter(t) {
	const perimeterCenterPoints = {};
	if (t.bounds.width === canvas.grid.sizeX && t.bounds.height === canvas.grid.sizeY)
		perimeterCenterPoints['one'] = { x: t.x + Math.floor(canvas.grid.size / 2), y: t.y + Math.floor(canvas.grid.size / 2) };
	else {
		const bounds = t.bounds;
		for (let x = bounds.x; x < bounds.right; x += canvas.grid.size) {
			for (let y = bounds.y; y < bounds.bottom; y += canvas.grid.size) {
				if (x === bounds.x || x === bounds.right - canvas.grid.size || y === bounds.y || y === bounds.bottom - canvas.grid.size) {
					const newX = x;
					const newY = y;
					const centerPoint = { x: newX + Math.floor(canvas.grid.size / 2), y: newY + Math.floor(canvas.grid.size / 2) };
					const newID = `${centerPoint.x}_${centerPoint.y}`;
					if (!perimeterCenterPoints[newID]) perimeterCenterPoints[newID] = { x: centerPoint.x, y: centerPoint.y };
				}
			}
		}
	}
	return Object.values(perimeterCenterPoints);
}

function getSquaresOnPerimeter(t) {
	const perimeterCenterPoints = {};
	const clipperPoints = game.version < 13 ? t.shape.toPolygon().toClipperPoints() : t.shape.toClipperPoints();
	for (let x = clipperPoints[0].X; x < clipperPoints[1].X; x += canvas.grid.size) {
		for (let y = clipperPoints[0].Y; y < clipperPoints[3].Y; y += canvas.grid.size) {
			if (x === 0 || x === clipperPoints[1].X - canvas.grid.size || y === 0 || y === clipperPoints[3].Y - canvas.grid.size) {
				const newX = t.x + x;
				const newY = t.y + y;
				const centerPoint = canvas.grid.getCenterPoint({ i: Math.floor(newY / canvas.grid.size), j: Math.floor(newX / canvas.grid.size) });
				const newID = `${centerPoint.x}_${centerPoint.y}`;
				if (!perimeterCenterPoints[newID]) perimeterCenterPoints[newID] = { x: centerPoint.x, y: centerPoint.y };
			}
		}
	}
	return Object.values(perimeterCenterPoints);
}

function calculateDiagonalsZ(diagonals, dz, spaces, grid) {
	const XY = { diagonals, illegal: spaces, moves: 0 };
	const Z = { illegal: dz, diagonals: Math.min(XY.illegal, dz), diagonalsXYZ: 0, diagonalsXZ_YZ: 0, moves: 0 };
	Z.diagonalsXYZ = Math.min(XY.diagonals, Z.diagonals);
	Z.diagonalsXZ_YZ = Z.diagonals - Z.diagonalsXYZ;
	XY.moves = spaces - (XY.diagonals + Z.diagonalsXZ_YZ);
	Z.moves = dz - Z.diagonals;
	const overallDiagonals = Math.max(XY.diagonals, Z.diagonals);
	let totalDistance = 0;
	switch (grid.diagonals) {
		case CONST.GRID_DIAGONALS.EQUIDISTANT:
			totalDistance = XY.moves + Z.moves + overallDiagonals;
			break;

		case CONST.GRID_DIAGONALS.ALTERNATING_1:
			for (let i = 1; i <= overallDiagonals; i++) {
				totalDistance += i & 1 ? 1 : 2; // Odd/even check with bitwise
			}
			totalDistance += XY.moves + Z.moves;
			break;

		case CONST.GRID_DIAGONALS.ALTERNATING_2:
			for (let i = 1; i <= overallDiagonals; i++) {
				totalDistance += i & 1 ? 2 : 1; // Alternate between 2 and 1
			}
			totalDistance += XY.moves + Z.moves;
			break;

		case CONST.GRID_DIAGONALS.ILLEGAL:
			totalDistance = XY.illegal + Z.illegal;
			break;

		case CONST.GRID_DIAGONALS.EXACT:
			totalDistance = XY.moves + Z.moves + (overallDiagonals - Z.diagonalsXYZ) * Math.sqrt(2) + Z.diagonalsXYZ * Math.sqrt(3);
			break;

		case CONST.GRID_DIAGONALS.APPROXIMATE:
			totalDistance = XY.moves + Z.moves + overallDiagonals * 1.5;
			break;

		case CONST.GRID_DIAGONALS.RECTILINEAR:
			totalDistance = XY.moves + Z.moves + overallDiagonals * 2;
			break;

		default:
			throw new Error(`${Constants.MODULE_NAME_SHORT}: Unknown diagonal rule: ${grid.diagonals}`);
	}

	totalDistance *= grid.distance;
	return totalDistance;
}

export function _i18nConditions(name) {
	const str = `EFFECT.DND5E.Status${name}`;
	if (game.i18n.has(str)) return game.i18n.localize(str);
	return game.i18n.localize(`DND5E.Con${name}`);
}

export function _localize(string) {
	return game.i18n.translations.DND5E?.[string] ?? game.i18n.localize(string);
}

export function _hasStatuses(actor, statuses, quick = false) {
	if (!actor) return [];
	if (typeof statuses === 'string') statuses = [statuses];
	if (quick) return statuses.some((status) => actor.statuses.has(status));
	const endsWithNumber = (str) => /\d+$/.test(str);
	const exhaustionNumberedStatus = statuses.find((s) => endsWithNumber(s));
	if (exhaustionNumberedStatus) {
		statuses = statuses.filter((s) => !endsWithNumber(s));
		if (_getExhaustionLevel(actor, exhaustionNumberedStatus.split('exhaustion')[1]))
			return [...actor.statuses]
				.filter((s) => statuses.includes(s))
				.map((el) => _i18nConditions(el.capitalize()))
				.concat(`${_i18nConditions('Exhaustion')} ${_getExhaustionLevel(actor)}`)
				.sort();
	}
	return [...actor.statuses]
		.filter((s) => statuses.includes(s))
		.map((el) => _i18nConditions(el.capitalize()))
		.sort();
}

export function _hasAppliedEffects(actor) {
	return !!actor?.appliedEffects.length;
}

export function _getExhaustionLevel(actor, min = undefined, max = undefined) {
	if (!actor) return false;
	let exhaustionLevel = '';
	const hasExhaustion = actor.statuses.has('exhaustion') || actor.flags?.['automated-conditions-5e']?.statuses;
	if (hasExhaustion) exhaustionLevel = actor.system.attributes.exhaustion;
	return min ? min <= exhaustionLevel : exhaustionLevel;
}

export function _filterOptinEntries(entries = [], optinSelected = {}) {
	const selected = new Set(Object.keys(optinSelected ?? {}).filter((key) => optinSelected[key]));
	return (entries ?? []).filter((entry) => {
		if (!entry || typeof entry !== 'object') return true;
		if (!entry.optin) return true;
		return selected.has(entry.id);
	});
}

const D20_BASELINE_HOOKS = new Set(['attack', 'save', 'check']);
const DAMAGE_BASELINE_HOOKS = new Set(['damage']);

function getD20BaselineRollProfile(ac5eConfig, config) {
	const hookType = ac5eConfig?.hookType;
	const options = ac5eConfig?.options ?? {};
	const ammunitionId =
		typeof config?.ammunition === 'string' ? config.ammunition
		: config?.ammunition?.id ? config.ammunition.id
		: typeof options?.ammo === 'string' ? options.ammo
		: options?.ammunition?.id ? options.ammunition.id
		: null;
	return {
		hookType,
		ability: config?.ability ?? options?.ability ?? null,
		skill: config?.skill ?? options?.skill ?? null,
		tool: config?.tool ?? options?.tool ?? null,
		attackMode: config?.attackMode ?? options?.attackMode ?? null,
		mastery: config?.mastery ?? options?.mastery ?? null,
		ammunition: ammunitionId,
	};
}

function getD20BaselineProfileKey(profile = {}) {
	return JSON.stringify(profile);
}

function freezeRollProfileSnapshot(profile = {}, roll0 = {}, config = {}, ac5eConfig = {}) {
	const roll0Options = roll0?.options ?? {};
	const parts =
		Array.isArray(roll0?.parts) ? roll0.parts
		: Array.isArray(config?.parts) ? config.parts
		: [];
	const appliedParts = Array.isArray(ac5eConfig?.parts) ? ac5eConfig.parts : [];
	const frozenProfile = Object.freeze(foundry.utils.duplicate(profile));
	const frozenParts = Object.freeze(foundry.utils.duplicate(parts));
	const frozenAppliedParts = Object.freeze(foundry.utils.duplicate(appliedParts));
	const frozenButtons = Object.freeze({
		advantage: !!config?.advantage,
		disadvantage: !!config?.disadvantage,
		advantageMode: roll0Options.advantageMode ?? ac5eConfig?.advantageMode ?? null,
		defaultButton: ac5eConfig?.defaultButton ?? null,
	});
	const frozenTarget = Object.freeze({
		value: roll0Options.target ?? config?.target ?? null,
		criticalSuccess: roll0Options.criticalSuccess ?? null,
		criticalFailure: roll0Options.criticalFailure ?? null,
		maximum: roll0Options.maximum ?? null,
		minimum: roll0Options.minimum ?? null,
	});
	return Object.freeze({
		profile: frozenProfile,
		profileKey: getD20BaselineProfileKey(profile),
		formula: typeof roll0?.formula === 'string' ? roll0.formula : null,
		parts: frozenParts,
		appliedParts: frozenAppliedParts,
		buttons: frozenButtons,
		target: frozenTarget,
	});
}

export function _captureFrozenD20Baseline(ac5eConfig, config) {
	if (!ac5eConfig || !config) return null;
	if (!D20_BASELINE_HOOKS.has(ac5eConfig.hookType)) return null;
	const hasRoll0 = Array.isArray(config.rolls) && config.rolls[0] && typeof config.rolls[0] === 'object';
	const roll0 = hasRoll0 ? config.rolls[0] : { options: {} };
	if (hasRoll0 && (!roll0.options || typeof roll0.options !== 'object')) roll0.options = {};
	ac5eConfig.preAC5eConfig ??= {};
	const rollProfile = getD20BaselineRollProfile(ac5eConfig, config);
	const profileKey = getD20BaselineProfileKey(rollProfile);
	ac5eConfig.preAC5eConfig.frozenD20BaselineByProfile ??= {};
	let baseline = ac5eConfig.preAC5eConfig.frozenD20BaselineByProfile[profileKey];
	if (!baseline) {
		baseline = freezeRollProfileSnapshot(rollProfile, roll0, config, ac5eConfig);
		ac5eConfig.preAC5eConfig.frozenD20BaselineByProfile[profileKey] = baseline;
	}
	ac5eConfig.preAC5eConfig.activeRollProfileKey = profileKey;
	ac5eConfig.preAC5eConfig.frozenD20Baseline = baseline;
	ac5eConfig.frozenD20Baseline = baseline;
	return baseline;
}

export function _restoreD20ConfigFromFrozenBaseline(ac5eConfig, config) {
	if (!ac5eConfig || !config) return false;
	if (!D20_BASELINE_HOOKS.has(ac5eConfig.hookType)) return false;
	const preConfig = ac5eConfig.preAC5eConfig ?? {};
	const profile = getD20BaselineRollProfile(ac5eConfig, config);
	const profileKey = getD20BaselineProfileKey(profile);
	const baseline = preConfig?.frozenD20BaselineByProfile?.[profileKey] ?? preConfig?.frozenD20Baseline ?? ac5eConfig?.frozenD20Baseline;
	if (!baseline) return false;
	const hasRoll0 = Array.isArray(config.rolls) && config.rolls[0] && typeof config.rolls[0] === 'object';
	const roll0 = hasRoll0 ? config.rolls[0] : { options: {} };
	if (hasRoll0 && (!roll0.options || typeof roll0.options !== 'object')) roll0.options = {};
	const baselineParts = Array.isArray(baseline?.parts) ? foundry.utils.duplicate(baseline.parts) : [];
	if (hasRoll0) roll0.parts = baselineParts;
	if (Array.isArray(config.parts) || baselineParts.length) config.parts = foundry.utils.duplicate(baselineParts);
	const buttons = baseline?.buttons ?? {};
	config.advantage = !!buttons.advantage;
	config.disadvantage = !!buttons.disadvantage;
	if (hasRoll0 && buttons.advantageMode !== undefined && buttons.advantageMode !== null) roll0.options.advantageMode = buttons.advantageMode;
	if (buttons.defaultButton !== undefined && buttons.defaultButton !== null) ac5eConfig.defaultButton = buttons.defaultButton;
	const target = baseline?.target ?? {};
	if (target.value !== undefined && target.value !== null) {
		config.target = target.value;
		if (hasRoll0) {
			roll0.target = target.value;
			roll0.options.target = target.value;
		}
	}
	if (hasRoll0 && target.criticalSuccess !== undefined && target.criticalSuccess !== null) roll0.options.criticalSuccess = target.criticalSuccess;
	if (hasRoll0 && target.criticalFailure !== undefined && target.criticalFailure !== null) roll0.options.criticalFailure = target.criticalFailure;
	if (hasRoll0 && target.maximum !== undefined && target.maximum !== null) roll0.options.maximum = target.maximum;
	else if (hasRoll0 && 'maximum' in roll0.options) delete roll0.options.maximum;
	if (hasRoll0 && target.minimum !== undefined && target.minimum !== null) roll0.options.minimum = target.minimum;
	else if (hasRoll0 && 'minimum' in roll0.options) delete roll0.options.minimum;
	if (hasRoll0) roll0.options[Constants.MODULE_ID] ??= {};
	if (hasRoll0) roll0.options[Constants.MODULE_ID].appliedParts = Array.isArray(baseline?.appliedParts) ? foundry.utils.duplicate(baseline.appliedParts) : [];
	preConfig.activeRollProfileKey = baseline.profileKey ?? profileKey;
	preConfig.frozenD20Baseline = baseline;
	ac5eConfig.preAC5eConfig = preConfig;
	ac5eConfig.frozenD20Baseline = baseline;
	return true;
}

function normalizeDamageTypesForBaseline(damageTypes) {
	const normalized = {};
	if (Array.isArray(damageTypes)) {
		for (const value of damageTypes) {
			const key = String(value ?? '')
				.trim()
				.toLowerCase();
			if (key) normalized[key] = true;
		}
		return normalized;
	}
	if (damageTypes && typeof damageTypes === 'object') {
		for (const [key, enabled] of Object.entries(damageTypes)) {
			if (!enabled) continue;
			const normalizedKey = String(key ?? '')
				.trim()
				.toLowerCase();
			if (normalizedKey) normalized[normalizedKey] = true;
		}
		return normalized;
	}
	const single = String(damageTypes ?? '')
		.trim()
		.toLowerCase();
	if (single) normalized[single] = true;
	return normalized;
}

function getDamageBaselineRollProfile(ac5eConfig, config) {
	const options = ac5eConfig?.options ?? {};
	const ammunitionId =
		typeof config?.ammunition === 'string' ? config.ammunition
		: config?.ammunition?.id ? config.ammunition.id
		: typeof options?.ammo === 'string' ? options.ammo
		: options?.ammunition?.id ? options.ammunition.id
		: null;
	const normalizedDamageTypes = normalizeDamageTypesForBaseline(options?.damageTypes);
	const rollTypes = Array.isArray(config?.rolls) ? config.rolls.map((roll) => roll?.options?.type ?? null) : [];
	return {
		hookType: ac5eConfig?.hookType,
		attackMode: config?.attackMode ?? options?.attackMode ?? null,
		mastery: config?.mastery ?? options?.mastery ?? null,
		ammunition: ammunitionId,
		defaultDamageType: options?.defaultDamageType ?? null,
		damageTypes: Object.keys(normalizedDamageTypes).sort(),
		rollTypes,
	};
}

function getDamageBaselineProfileKey(profile = {}) {
	return JSON.stringify(profile);
}

function freezeDamageRollSnapshot(profile = {}, config = {}, ac5eConfig = {}) {
	const frozenRolls = (Array.isArray(config?.rolls) ? config.rolls : []).map((roll) => {
		const parts = Array.isArray(roll?.parts) ? roll.parts : [];
		const formula =
			typeof roll?.formula === 'string' ? roll.formula
			: parts.length ? parts.join(' + ')
			: null;
		return Object.freeze({
			formula,
			parts: Object.freeze(foundry.utils.duplicate(parts)),
			type: roll?.options?.type ?? null,
			maximum: roll?.options?.maximum ?? null,
			minimum: roll?.options?.minimum ?? null,
			isCritical: roll?.options?.isCritical ?? null,
		});
	});
	return Object.freeze({
		profile: Object.freeze(foundry.utils.duplicate(profile)),
		profileKey: getDamageBaselineProfileKey(profile),
		isCritical: !!config?.isCritical,
		defaultButton: ac5eConfig?.defaultButton ?? null,
		parts: Object.freeze(foundry.utils.duplicate(Array.isArray(config?.parts) ? config.parts : [])),
		damageModifiers: Object.freeze(foundry.utils.duplicate(Array.isArray(ac5eConfig?.damageModifiers) ? ac5eConfig.damageModifiers : [])),
		rolls: Object.freeze(frozenRolls),
	});
}

export function _captureFrozenDamageBaseline(ac5eConfig, config) {
	if (!ac5eConfig || !config) return null;
	if (!DAMAGE_BASELINE_HOOKS.has(ac5eConfig.hookType)) return null;
	config.rolls ??= [];
	ac5eConfig.preAC5eConfig ??= {};
	const rollProfile = getDamageBaselineRollProfile(ac5eConfig, config);
	const profileKey = getDamageBaselineProfileKey(rollProfile);
	ac5eConfig.preAC5eConfig.frozenDamageBaselineByProfile ??= {};
	let baseline = ac5eConfig.preAC5eConfig.frozenDamageBaselineByProfile[profileKey];
	if (!baseline) {
		baseline = freezeDamageRollSnapshot(rollProfile, config, ac5eConfig);
		ac5eConfig.preAC5eConfig.frozenDamageBaselineByProfile[profileKey] = baseline;
	}
	ac5eConfig.preAC5eConfig.activeDamageRollProfileKey = profileKey;
	ac5eConfig.preAC5eConfig.frozenDamageBaseline = baseline;
	ac5eConfig.frozenDamageBaseline = baseline;
	return baseline;
}

export function _restoreDamageConfigFromFrozenBaseline(ac5eConfig, config) {
	if (!ac5eConfig || !config) return false;
	if (!DAMAGE_BASELINE_HOOKS.has(ac5eConfig.hookType)) return false;
	config.rolls ??= [];
	const preConfig = ac5eConfig.preAC5eConfig ?? {};
	const profile = getDamageBaselineRollProfile(ac5eConfig, config);
	const profileKey = getDamageBaselineProfileKey(profile);
	const baseline = preConfig?.frozenDamageBaselineByProfile?.[profileKey] ?? preConfig?.frozenDamageBaseline ?? ac5eConfig?.frozenDamageBaseline;
	if (!baseline) return false;
	const baselineRolls = Array.isArray(baseline?.rolls) ? baseline.rolls : [];
	for (let index = 0; index < baselineRolls.length; index++) {
		const rollBaseline = baselineRolls[index];
		if (!rollBaseline) continue;
		const roll = config.rolls[index] ?? (config.rolls[index] = {});
		roll.options ??= {};
		roll.parts = foundry.utils.duplicate(Array.isArray(rollBaseline.parts) ? rollBaseline.parts : []);
		if (typeof rollBaseline.formula === 'string') roll.formula = rollBaseline.formula;
		else if (Array.isArray(roll.parts) && roll.parts.length) roll.formula = roll.parts.join(' + ');
		if (rollBaseline.type !== undefined && rollBaseline.type !== null) roll.options.type = rollBaseline.type;
		if (rollBaseline.maximum !== undefined && rollBaseline.maximum !== null) roll.options.maximum = rollBaseline.maximum;
		else if ('maximum' in roll.options) delete roll.options.maximum;
		if (rollBaseline.minimum !== undefined && rollBaseline.minimum !== null) roll.options.minimum = rollBaseline.minimum;
		else if ('minimum' in roll.options) delete roll.options.minimum;
		if (rollBaseline.isCritical !== undefined && rollBaseline.isCritical !== null) roll.options.isCritical = rollBaseline.isCritical;
	}
	if (Array.isArray(config.parts) || (Array.isArray(baseline?.parts) && baseline.parts.length)) {
		config.parts = foundry.utils.duplicate(Array.isArray(baseline?.parts) ? baseline.parts : []);
	}
	if (baseline?.isCritical !== undefined) config.isCritical = !!baseline.isCritical;
	if (config?.midiOptions) config.midiOptions.isCritical = !!config.isCritical;
	if (baseline?.defaultButton !== undefined && baseline?.defaultButton !== null) ac5eConfig.defaultButton = baseline.defaultButton;
	preConfig.activeDamageRollProfileKey = baseline.profileKey ?? profileKey;
	preConfig.frozenDamageBaseline = baseline;
	ac5eConfig.preAC5eConfig = preConfig;
	ac5eConfig.frozenDamageBaseline = baseline;
	return true;
}

export function _calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties = false } = {}) {
	const { ADVANTAGE: ADV_MODE, DISADVANTAGE: DIS_MODE, NORMAL: NORM_MODE } = CONFIG.Dice.D20Roll.ADV_MODE;
	const isForcedSentinelAC = (value) => Number.isFinite(Number(value)) && Math.abs(Number(value)) === 999;
	const getTargetKey = (target, index = 0) => {
		if (!target || typeof target !== 'object') return `index:${index}`;
		const tokenUuid = target?.tokenUuid ?? target?.token?.uuid;
		if (tokenUuid) return `token:${tokenUuid}`;
		const actorUuid = target?.uuid;
		if (actorUuid) return `actor:${actorUuid}:index:${index}`;
		return `index:${index}`;
	};
	const getLiveTargetAC = (target = {}) => {
		const tokenUuid = target?.tokenUuid ?? target?.token?.uuid;
		if (tokenUuid) {
			const tokenDoc = fromUuidSync(tokenUuid);
			const tokenActor = tokenDoc?.actor ?? tokenDoc?.object?.actor;
			const tokenAC = tokenActor?.system?.attributes?.ac?.value;
			if (Number.isFinite(Number(tokenAC))) return Number(tokenAC);
		}
		const actorUuid = target?.uuid;
		if (actorUuid) {
			const actor = fromUuidSync(actorUuid);
			const actorAC = actor?.system?.attributes?.ac?.value;
			if (Number.isFinite(Number(actorAC))) return Number(actorAC);
		}
		const embeddedAC = target?.ac;
		if (Number.isFinite(Number(embeddedAC)) && !isForcedSentinelAC(embeddedAC)) return Number(embeddedAC);
		return null;
	};
	const hasRoll0 = Array.isArray(config.rolls) && config.rolls[0] && typeof config.rolls[0] === 'object';
	const roll0 = hasRoll0 ? config.rolls[0] : { options: {} };
	if (hasRoll0 && (!roll0.options || typeof roll0.options !== 'object')) roll0.options = {};
	const hook = ac5eConfig.hookType;
	const pickNonSentinelNumber = (...values) => {
		for (const value of values) {
			const numeric = Number(value);
			if (!Number.isFinite(numeric)) continue;
			if (isForcedSentinelAC(numeric)) continue;
			return numeric;
		}
		return undefined;
	};
	const getMutableAttackTargetCollections = () => {
		const collections = [];
		const ac5eTargets = Array.isArray(ac5eConfig?.options?.targets) ? ac5eConfig.options.targets : null;
		if (ac5eTargets) collections.push(ac5eTargets);
		return collections;
	};
	const getMessageAttackTargets = () => {
		const dnd5eFlags = _getMessageDnd5eFlags(message);
		const messageTargets = Array.isArray(dnd5eFlags?.targets) ? dnd5eFlags.targets : null;
		return messageTargets ?? [];
	};
	ac5eConfig.preAC5eConfig ??= {};
	if (!ac5eConfig.preAC5eConfig.baseRoll0Options) {
		const targetCollections = hook === 'attack' || hook === 'damage' ? getMutableAttackTargetCollections() : [];
		const liveTargetAcs = targetCollections[0]?.map((target) => getLiveTargetAC(target)).filter((ac) => ac !== null) ?? [];
		const baselineTarget = liveTargetAcs.length ? Math.min(...liveTargetAcs) : (roll0.options.target ?? config?.target);
		const currentTarget = roll0.options.target ?? config?.target;
		ac5eConfig.preAC5eConfig.baseRoll0Options = {
			criticalSuccess: roll0.options.criticalSuccess,
			criticalFailure: roll0.options.criticalFailure,
			target: isForcedSentinelAC(currentTarget) && Number.isFinite(Number(baselineTarget)) ? baselineTarget : currentTarget,
		};
	}
	if ((hook === 'attack' || hook === 'damage') && !ac5eConfig.preAC5eConfig.baseTargetAcByKey) {
		const baseTargets = getMutableAttackTargetCollections()[0] ?? getMessageAttackTargets();
		const byKey = {};
		baseTargets.forEach((target, index) => {
			const key = getTargetKey(target, index);
			byKey[key] = {
				key,
				hasAC: Object.hasOwn(target ?? {}, 'ac'),
				ac: getLiveTargetAC(target) ?? target?.ac,
				uuid: target?.uuid,
				tokenUuid: target?.tokenUuid ?? target?.token?.uuid,
				name: target?.name,
				img: target?.img,
			};
		});
		ac5eConfig.preAC5eConfig.baseTargetAcByKey = byKey;
	}
	const baseTargetAcByKey = ac5eConfig.preAC5eConfig.baseTargetAcByKey ?? {};
	const baseRoll0Options = ac5eConfig.preAC5eConfig.baseRoll0Options;
	if (Object.hasOwn(baseRoll0Options, 'criticalSuccess')) roll0.options.criticalSuccess = baseRoll0Options.criticalSuccess;
	if (Object.hasOwn(baseRoll0Options, 'criticalFailure')) roll0.options.criticalFailure = baseRoll0Options.criticalFailure;
	if (Object.hasOwn(baseRoll0Options, 'target')) {
		roll0.options.target = baseRoll0Options.target;
		roll0.target = baseRoll0Options.target;
		config.target = baseRoll0Options.target;
	}
	if (hook === 'attack' || hook === 'damage') {
		for (const targets of getMutableAttackTargetCollections()) {
			for (let i = 0; i < targets.length; i++) {
				const baseEntry = baseTargetAcByKey[getTargetKey(targets[i], i)];
				if (!baseEntry?.hasAC) continue;
				targets[i].ac = baseEntry.ac;
			}
		}
	}
	const localDialog = dialog ?? { options: {} };
	localDialog.options ??= {};
	const ac5eForcedRollTarget = 999;
	const getGlobalDamageCriticalEntries = (entries = []) =>
		(entries ?? []).filter((entry) => {
			if (!entry || typeof entry !== 'object') return true;
			const addTo = entry?.addTo;
			if (addTo?.mode === 'types' && Array.isArray(addTo.types) && addTo.types.length) return false;
			return true;
		});
	const subjectGlobalDamageCritical = hook === 'damage' ? getGlobalDamageCriticalEntries(_filterOptinEntries(ac5eConfig.subject.critical, ac5eConfig.optinSelected)) : [];
	const opponentGlobalDamageCritical = hook === 'damage' ? getGlobalDamageCriticalEntries(_filterOptinEntries(ac5eConfig.opponent.critical, ac5eConfig.optinSelected)) : [];
	if (hook === 'damage') {
		if (subjectGlobalDamageCritical.length || opponentGlobalDamageCritical.length) {
			ac5eConfig.isCritical = true;
			config.isCritical = true; // does this break something? added back to properly focus on button
			localDialog.options.defaultButton = 'critical';
		}
	} else {
		const subjectAdvantage = _filterOptinEntries(ac5eConfig.subject.advantage, ac5eConfig.optinSelected);
		const opponentAdvantage = _filterOptinEntries(ac5eConfig.opponent.advantage, ac5eConfig.optinSelected);
		const subjectDisadvantage = _filterOptinEntries(ac5eConfig.subject.disadvantage, ac5eConfig.optinSelected);
		const opponentDisadvantage = _filterOptinEntries(ac5eConfig.opponent.disadvantage, ac5eConfig.optinSelected);
		const subjectNoAdv = _filterOptinEntries(ac5eConfig.subject.noAdvantage, ac5eConfig.optinSelected);
		const opponentNoAdv = _filterOptinEntries(ac5eConfig.opponent.noAdvantage, ac5eConfig.optinSelected);
		const subjectNoDis = _filterOptinEntries(ac5eConfig.subject.noDisadvantage, ac5eConfig.optinSelected);
		const opponentNoDis = _filterOptinEntries(ac5eConfig.opponent.noDisadvantage, ac5eConfig.optinSelected);
		const subjectAdvantageNamesCount = _collectionCount(ac5eConfig.subject.advantageNames);
		const opponentAdvantageNamesCount = _collectionCount(ac5eConfig.opponent.advantageNames);
		const subjectDisadvantageNamesCount = _collectionCount(ac5eConfig.subject.disadvantageNames);
		const opponentDisadvantageNamesCount = _collectionCount(ac5eConfig.opponent.disadvantageNames);
		if (subjectAdvantage.length || opponentAdvantage.length || subjectAdvantageNamesCount || opponentAdvantageNamesCount) {
			config.advantage = true;
		}
		if (subjectNoAdv.length || opponentNoAdv.length) {
			config.advantage = false;
		}
		if (subjectDisadvantage.length || opponentDisadvantage.length || subjectDisadvantageNamesCount || opponentDisadvantageNamesCount) {
			config.disadvantage = true;
		}
		if (subjectNoDis.length || opponentNoDis.length) {
			config.disadvantage = false;
		}
		if (config.advantage && config.disadvantage) {
			config.advantage = true; // both true let system handle it
			config.disadvantage = true; // both true let system handle it
			localDialog.options.advantageMode = NORM_MODE;
			localDialog.options.defaultButton = 'normal';
		} else if (config.advantage && !config.disadvantage) {
			localDialog.options.advantageMode = ADV_MODE;
			localDialog.options.defaultButton = 'advantage';
		} else if (!config.advantage && config.disadvantage) {
			localDialog.options.advantageMode = DIS_MODE;
			localDialog.options.defaultButton = 'disadvantage';
		}
		if (hook === 'attack' || hook === 'damage') {
			ac5eConfig.initialTargetADCs = {};
			ac5eConfig.alteredTargetADCs = {};
			// need to allow damage hooks too for results shown?
			if (ac5eConfig.threshold?.length) {
				//for attack rolls
				const finalThreshold = getAlteredTargetValueOrThreshold(roll0.options.criticalSuccess, ac5eConfig.threshold, 'critThreshold');
				roll0.options.criticalSuccess = finalThreshold;
				ac5eConfig.alteredCritThreshold = finalThreshold;
			}
			if (ac5eConfig.fumbleThreshold?.length) {
				//for attack rolls
				const finalThreshold = getAlteredTargetValueOrThreshold(roll0.options.criticalFailure, ac5eConfig.fumbleThreshold, 'fumbleThreshold');
				roll0.options.criticalFailure = finalThreshold;
				ac5eConfig.alteredFumbleThreshold = finalThreshold;
			}
			if (ac5eConfig.targetADC?.length) {
				if (ac5e?.debugTargetADC) console.warn('AC5E targetADC: apply attack/damage', { hook, targetADC: ac5eConfig.targetADC, rollTarget: roll0?.options?.target, configTarget: config?.target });
				const targetCollections = getMutableAttackTargetCollections();
				const primaryTargets = targetCollections[0];
				const fallbackInitialTargetADC = pickNonSentinelNumber(primaryTargets?.[0]?.ac, ac5eConfig?.preAC5eConfig?.baseRoll0Options?.target, roll0?.options?.target, config?.target) ?? 10;
				const alteredTargetADCs = {};
				const initialTargetADCs = {};
				let initialTargetADC;
				let lowerTargetADC;
				if (!foundry.utils.isEmpty(primaryTargets)) {
					for (const targets of targetCollections) {
						targets.forEach((target, index) => {
							const key = getTargetKey(target, index);
							const baseEntry = baseTargetAcByKey[key];
							const sourceTarget = targets[index] ?? target ?? {};
							const initialPerTargetADC = pickNonSentinelNumber(baseEntry?.ac, getLiveTargetAC(sourceTarget), sourceTarget?.ac);
							if (!Number.isFinite(initialPerTargetADC)) return;
							const alteredTargetADC = getAlteredTargetValueOrThreshold(initialPerTargetADC, ac5eConfig.targetADC, 'acBonus');
							if (!isNaN(alteredTargetADC)) {
								targets[index].ac = alteredTargetADC;
								initialTargetADC = initialTargetADC === undefined || initialPerTargetADC < initialTargetADC ? initialPerTargetADC : initialTargetADC;
								if (!lowerTargetADC || alteredTargetADC < lowerTargetADC) lowerTargetADC = alteredTargetADC;
								initialTargetADCs[key] = {
									key,
									ac: initialPerTargetADC,
									uuid: sourceTarget?.uuid ?? baseEntry?.uuid,
									tokenUuid: sourceTarget?.tokenUuid ?? sourceTarget?.token?.uuid ?? baseEntry?.tokenUuid,
									name: sourceTarget?.name ?? baseEntry?.name,
									img: sourceTarget?.img ?? baseEntry?.img,
								};
								alteredTargetADCs[key] = {
									key,
									ac: alteredTargetADC,
									baseAC: initialPerTargetADC,
									uuid: sourceTarget?.uuid ?? baseEntry?.uuid,
									tokenUuid: sourceTarget?.tokenUuid ?? sourceTarget?.token?.uuid ?? baseEntry?.tokenUuid,
									name: sourceTarget?.name ?? baseEntry?.name,
									img: sourceTarget?.img ?? baseEntry?.img,
								};
							}
						});
					}
				} else {
					const alteredTargetADC = getAlteredTargetValueOrThreshold(fallbackInitialTargetADC, ac5eConfig.targetADC, 'acBonus');
					if (!isNaN(alteredTargetADC)) lowerTargetADC = alteredTargetADC;
					initialTargetADC = fallbackInitialTargetADC;
				}
				ac5eConfig.initialTargetADCs = initialTargetADCs;
				ac5eConfig.alteredTargetADCs = alteredTargetADCs;
				if (!isNaN(lowerTargetADC)) {
					if (roll0?.options) roll0.options.target = lowerTargetADC;
					if (roll0) roll0.target = lowerTargetADC;
					if (config) config.target = lowerTargetADC;
					ac5eConfig.alteredTargetADC = lowerTargetADC;
					ac5eConfig.initialTargetADC = initialTargetADC ?? fallbackInitialTargetADC;
				}
				if (ac5e?.debugTargetADC) console.warn('AC5E targetADC: result attack/damage', { initialTargetADC, alteredTargetADC: ac5eConfig.alteredTargetADC });
			} else {
				ac5eConfig.alteredTargetADC = undefined;
			}
		}
		if (ac5eConfig.targetADC?.length && hook !== 'attack' && hook !== 'damage') {
			//check, save, skill
			const initialTargetADC = pickNonSentinelNumber(ac5eConfig?.preAC5eConfig?.baseRoll0Options?.target, config?.target, roll0?.options?.target) ?? 10;
			const alteredTargetADC = getAlteredTargetValueOrThreshold(initialTargetADC, ac5eConfig.targetADC, 'dcBonus');
			if (!isNaN(alteredTargetADC)) {
				ac5eConfig.initialTargetADC = roll0.options.target;
				roll0.options.target = alteredTargetADC;
				if (roll0) roll0.target = alteredTargetADC;
				if (config) config.target = alteredTargetADC;
				ac5eConfig.alteredTargetADC = alteredTargetADC;
				ac5eConfig.initialTargetADC = initialTargetADC;
			}
			if (ac5e?.debugTargetADC) console.warn('AC5E targetADC: result non-attack', { hook, initialTargetADC, alteredTargetADC: ac5eConfig.alteredTargetADC });
		}
		const subjectFail = _filterOptinEntries(ac5eConfig.subject.fail, ac5eConfig.optinSelected);
		const opponentFail = _filterOptinEntries(ac5eConfig.opponent.fail, ac5eConfig.optinSelected);
		if (subjectFail.length || opponentFail.length) {
			if (roll0) {
				roll0.options.criticalSuccess = 21;
				roll0.options.target = ac5eForcedRollTarget;
				roll0.target = ac5eForcedRollTarget;
				if (config) config.target = ac5eForcedRollTarget;
				if (hook === 'attack') {
					if (_activeModule('midi-qol')) ac5eConfig.parts.push(-ac5eForcedRollTarget);
					for (const targets of getMutableAttackTargetCollections()) {
						if (!foundry.utils.isEmpty(targets)) targets.forEach((t, index) => (targets[index].ac = ac5eForcedRollTarget));
					}
				}
			}
		}
		const subjectSuccess = _filterOptinEntries(ac5eConfig.subject.success, ac5eConfig.optinSelected);
		const opponentSuccess = _filterOptinEntries(ac5eConfig.opponent.success, ac5eConfig.optinSelected);
		if (subjectSuccess.length || opponentSuccess.length) {
			if (roll0) {
				roll0.options.criticalFailure = 0;
				roll0.options.target = -ac5eForcedRollTarget;
				roll0.target = -ac5eForcedRollTarget;
				if (config) config.target = -ac5eForcedRollTarget;
				if (hook === 'attack') {
					if (_activeModule('midi-qol')) ac5eConfig.parts.push(ac5eForcedRollTarget);
					for (const targets of getMutableAttackTargetCollections()) {
						if (!foundry.utils.isEmpty(targets)) targets.forEach((t, index) => (targets[index].ac = -ac5eForcedRollTarget));
					}
				}
			}
		}
		const subjectFumble = _filterOptinEntries(ac5eConfig.subject.fumble, ac5eConfig.optinSelected);
		const opponentFumble = _filterOptinEntries(ac5eConfig.opponent.fumble, ac5eConfig.optinSelected);
		if (subjectFumble.length || opponentFumble.length) {
			ac5eConfig.isFumble = true;
			if (roll0) {
				roll0.options.criticalSuccess = 21;
				roll0.options.criticalFailure = 20;
				if (hook !== 'attack') roll0.options.target = ac5eForcedRollTarget;
			}
		}
		const hasDamageGlobalCritical = hook === 'damage' ? subjectGlobalDamageCritical.length || opponentGlobalDamageCritical.length : false;
		if ((hook === 'damage' && hasDamageGlobalCritical) || (hook !== 'damage' && (ac5eConfig.subject.critical.length || ac5eConfig.opponent.critical.length))) {
			ac5eConfig.isCritical = true;
			if (roll0) {
				roll0.options.criticalSuccess = 1;
				roll0.options.criticalFailure = 0;
				if (hook !== 'attack') roll0.options.target = -ac5eForcedRollTarget;
			}
		}
	}
	const subjectNoCritical = _filterOptinEntries(ac5eConfig.subject.noCritical, ac5eConfig.optinSelected);
	const opponentNoCritical = _filterOptinEntries(ac5eConfig.opponent.noCritical, ac5eConfig.optinSelected);
	if (subjectNoCritical.length || opponentNoCritical.length) {
		if (hook === 'attack') roll0.options.criticalSuccess = 21;
		if (hook === 'damage') localDialog.options.defaultButton = 'normal';
		ac5eConfig.isCritical = false;
		config.isCritical = false;
	}
	const stripTrailingInjectedParts = (parts = [], injected = []) => {
		if (!Array.isArray(parts)) return [];
		if (!Array.isArray(injected) || !injected.length) return [...parts];
		const next = [...parts];
		const injectedLength = injected.length;
		while (next.length >= injectedLength) {
			let matches = true;
			const offset = next.length - injectedLength;
			for (let i = 0; i < injectedLength; i++) {
				if (next[offset + i] !== injected[i]) {
					matches = false;
					break;
				}
			}
			if (!matches) break;
			next.splice(offset, injectedLength);
		}
		return next;
	};
	const nextInjectedParts = Array.isArray(ac5eConfig.parts) ? [...ac5eConfig.parts] : [];
	if (roll0) {
		roll0.options ??= {};
		roll0.options[Constants.MODULE_ID] ??= {};
		const ac5eRollOptions = roll0.options[Constants.MODULE_ID];
		const previousInjectedParts = Array.isArray(ac5eRollOptions.appliedParts) ? ac5eRollOptions.appliedParts : [];
		const currentParts = Array.isArray(roll0.parts) ? roll0.parts : [];
		const baseParts = stripTrailingInjectedParts(currentParts, previousInjectedParts);
		if (typeof roll0.parts !== 'undefined' || previousInjectedParts.length || nextInjectedParts.length) {
			roll0.parts = baseParts.concat(nextInjectedParts);
		}
		ac5eRollOptions.appliedParts = foundry.utils.duplicate(nextInjectedParts);
	} else if (typeof config?.parts !== 'undefined') {
		if (Object.isExtensible(config)) config[Constants.MODULE_ID] ??= {};
		const ac5eConfigOptions = config[Constants.MODULE_ID] ?? {};
		const previousInjectedParts = Array.isArray(ac5eConfigOptions.appliedParts) ? ac5eConfigOptions.appliedParts : [];
		const currentParts = Array.isArray(config.parts) ? config.parts : [];
		const baseParts = stripTrailingInjectedParts(currentParts, previousInjectedParts);
		config.parts = baseParts.concat(nextInjectedParts);
		if (Object.isExtensible(ac5eConfigOptions)) ac5eConfigOptions.appliedParts = foundry.utils.duplicate(nextInjectedParts);
	}
	const applyModifierConstraint = (modifierConfig, modifierValue) => {
		if (modifierValue === undefined || modifierValue === null) return;
		const cleaned = String(modifierValue).trim().toLowerCase().replace(/\s+/g, '');
		const maxMatch = cleaned.match(/^max(-?\d+)$/);
		if (maxMatch) {
			const maxValue = Number(maxMatch[1]);
			if (Number.isFinite(maxValue)) {
				const currentMax = modifierConfig.maximum;
				modifierConfig.maximum = !Number.isFinite(currentMax) || currentMax > maxValue ? maxValue : currentMax;
			}
			return;
		}
		const minMatch = cleaned.match(/^min(-?\d+)$/);
		if (minMatch) {
			const minValue = Number(minMatch[1]);
			if (Number.isFinite(minValue)) {
				const currentMin = modifierConfig.minimum;
				modifierConfig.minimum = !Number.isFinite(currentMin) || currentMin < minValue ? minValue : currentMin;
			}
		}
	};
	const effectiveModifiers = foundry.utils.duplicate(ac5eConfig.modifiers ?? {});
	for (const side of ['subject', 'opponent']) {
		const sideModifiers = _filterOptinEntries(ac5eConfig?.[side]?.modifiers ?? [], ac5eConfig.optinSelected);
		for (const entry of sideModifiers) {
			if (!entry || typeof entry !== 'object') continue;
			applyModifierConstraint(effectiveModifiers, entry.modifier);
		}
	}
	ac5eConfig.effectiveModifiers = effectiveModifiers;
	// Interim solution until system supports this
	if (roll0?.options) {
		const { maximum, minimum } = effectiveModifiers;
		if (Number.isFinite(maximum)) roll0.options.maximum = maximum;
		else if ('maximum' in roll0.options) delete roll0.options.maximum;
		if (Number.isFinite(minimum)) roll0.options.minimum = minimum;
		else if ('minimum' in roll0.options) delete roll0.options.minimum;
	}
	if (!localDialog.options?.defaultButton) localDialog.options.defaultButton = 'normal';
	ac5eConfig.advantageMode = localDialog.options.advantageMode;
	ac5eConfig.defaultButton = localDialog.options.defaultButton;
	if (hook === 'attack') _syncMidiAttackRollModifierTracker(ac5eConfig, config);
	else if (hook === 'check' || hook === 'save') _syncMidiAbilityRollModifierTracker(ac5eConfig, config, localDialog);
	_getTooltip(ac5eConfig);
	if (skipSetProperties) return ac5eConfig;
	return _setAC5eProperties(ac5eConfig, config, localDialog, message);
}

export function getAlteredTargetValueOrThreshold(initialValue = 0, ac5eValues, type) {
	const additiveValues = [];
	const staticValues = [];

	for (const item of ac5eValues) {
		if (item == null) continue;

		if (typeof item === 'number') {
			additiveValues.push(item);
			continue;
		}

		const cleaned = String(item).trim();
		if (/^[+-]\d+$/.test(cleaned)) {
			additiveValues.push(parseInt(cleaned, 10));
			continue;
		}
		if (/^\d+$/.test(cleaned)) {
			staticValues.push(parseInt(cleaned, 10));
			continue;
		}
	}
	const newStaticThreshold = staticValues.length > 0 ? staticValues[staticValues.length - 1] : initialValue;
	const totalModifier = additiveValues.reduce((sum, val) => sum + val, 0);
	const finalValue = newStaticThreshold + totalModifier;

	if (settings.debug) console.warn(`${Constants.MODULE_NAME_SHORT} - getAlteredTargetValueOrThreshold for ${type}:`, { initialValue, staticValues, additiveValues, finalValue });

	return finalValue;
}

/**
 * Check relative or exact disposition between two tokens.
 * @param {Token5e|TokenDocument5e} t1
 * @param {Token5e|TokenDocument5e} t2
 * @param {string|number|} check - Disposition type or constant
 * @returns {boolean}
 */
export function _dispositionCheck(t1, t2, check = 'all', mult) {
	if (!t1 || !t2) return false;
	if (check === 'all') return true;

	t1 = t1 instanceof TokenDocument ? t1 : t1.document;
	t2 = t2 instanceof TokenDocument ? t2 : t2.document;

	if (typeof check === 'number') return t2.disposition === check;

	let result;
	switch (check) {
		case 'different':
			result = t1.disposition !== t2.disposition;
			break;
		case 'opposite':
		case 'enemy':
			result = t1.disposition * t2.disposition === -1;
			break;
		case 'same':
		case 'ally':
			result = t1.disposition === t2.disposition;
			break;
		default: {
			const constVal = CONST.TOKEN_DISPOSITIONS[check.toUpperCase()];
			result = constVal !== undefined && t2.disposition === constVal;
			break;
		}
	}
	if (mult) return !result;
	return result;
}

export function _findNearby({
	token, // Token5e, TokenDocument5e, ID string, or UUID
	disposition = 'all', // 'same', 'different', 'opposite' or false === 'all'
	radius = 5, // Distance radius (default 5), 0 for full map
	lengthTest = false, // Number, true or false; if number, returns boolean test against that, if true returns Number of found tokens.
	hasStatuses = [], // Array of status effect IDs to filter by
	includeToken = false, // Include source token in results
	includeIncapacitated = false, // Include dead/incapacitated tokens, use 'only' to return ONLY incapacitated tokens
	partyMember = false, // Return only party members
}) {
	if (!canvas || !canvas.tokens?.placeables) return false;
	const tokenInstance = foundry.canvas.placeables.Token;
	if (token instanceof TokenDocument) {
		token = token.object;
	} else if (!(token instanceof tokenInstance)) {
		const resolved = fromUuidSync(token);
		token = resolved?.type === 'Token' ? resolved.object : canvas.tokens.get(token);
	}
	if (!token) return false;
	let mult;
	const foundryDispositionCONST = CONST.TOKEN_DISPOSITIONS;
	const usableUserProvidedDispositions = ['all', 'ally', 'different', 'enemy', 'friendly', 'neutral', 'opposite', 'same', 'secret'];
	if (typeof disposition === 'number') {
		if (!Object.values(foundryDispositionCONST).includes(disposition)) {
			ui.notifications.error(`AC5e disposition check error. User provided disposition: ${disposition} but Foundry available ones are -2, -1, 0, 1; returning all tokens instead`);
			disposition = 'all';
		}
	} else if (typeof disposition === 'string') {
		disposition = disposition.toLowerCase();
		if (disposition.startsWith('!')) {
			mult = true;
			disposition = disposition.slice(1);
		}
		if (!usableUserProvidedDispositions.includes(disposition)) {
			ui.notifications.error(`AC5e disposition check error. User provided disposition: "${disposition}". Use one of: "${usableUserProvidedDispositions.join('"/"')}"; returning all tokens instead`);
			disposition = 'all';
		}
	} else disposition = 'all';

	const nearbyTokens = canvas.tokens.placeables.filter((target) => {
		if (!includeToken && target === token) return false;
		if (partyMember && game.actors.party) {
			const {
				members: { ids },
			} = game.actors.party.system;
			if (!ids.has(target.actor?.id)) return false;
		}
		if (!includeIncapacitated && _hasStatuses(target.actor, ['dead', 'incapacitated'], true)) return false;
		if (includeIncapacitated === 'only' && !_hasStatuses(target.actor, ['dead', 'incapacitated'], true)) return false;
		if (!_dispositionCheck(token, target, disposition, mult)) return false;
		if (hasStatuses.length && !_hasStatuses(target.actor, hasStatuses, true)) return false;
		if (radius === 0) return true; // full map
		const distance = _getDistance(token, target);
		return distance <= radius;
	});
	if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - findNearby():`, nearbyTokens);
	if (lengthTest === true) return nearbyTokens.length;
	else if (typeof lengthTest === 'number') return nearbyTokens.length >= lengthTest;
	return nearbyTokens;
}

export function checkNearby(token, disposition, radius, { count = false, includeToken = false, includeIncapacitated = false, hasStatuses = [], partyMember = false } = {}) {
	return _findNearby({ token, disposition, radius, hasStatuses, includeToken, includeIncapacitated, lengthTest: count, partyMember });
}

export function _autoArmor(actor) {
	if (!actor) return {};
	const hasArmor = actor.armor;
	const hasShield = actor.shield;
	return {
		hasStealthDisadvantage:
			hasArmor?.system.properties.has('stealthDisadvantage') ? 'Armor'
			: hasShield?.system.properties.has('stealthDisadvantage') ? 'EquipmentShield'
			: actor.itemTypes.equipment.some((item) => item.system.equipped && item.system.properties.has('stealthDisadvantage')) ? 'AC5E.Equipment'
			: false,
		notProficient:
			!!hasArmor && !hasArmor.system.proficient && !hasArmor.system.prof.multiplier ? 'Armor'
			: !!hasShield && !hasShield.system.proficient && !hasShield.system.prof.multiplier ? 'EquipmentShield'
			: false,
	};
}

export function _autoEncumbrance(actor, abilityId) {
	if (!settings.autoEncumbrance) return null;
	return ['con', 'dex', 'str'].includes(abilityId) && _hasStatuses(actor, 'heavilyEncumbered').length;
}

export function _autoRanged(activity, token, target, options) {
	const distanceUnit = canvas.grid.distance;
	const modernRules = settings.dnd5eModernRules;
	const isSpell = activity.isSpell;
	const isAttack = activity.type === 'attack';
	const { checkRange: midiCheckRange, nearbyFoe: midiNearbyFoe } = _activeModule('midi-qol') && MidiQOL.configSettings().optionalRulesEnabled ? MidiQOL.configSettings().optionalRules : {};
	const { actionType, item, range } = activity || {};
	if (!range || !token) return {};
	let { value: short, long, reach } = range;
	const distance = options?.distance ?? (target ? _getDistance(token, target) : undefined);
	const normalizedDamageTypes =
		Array.isArray(options?.damageTypes) ? options.damageTypes
		: options?.damageTypes ? [options.damageTypes]
		: [];
	const selectedDamageTypes = new Set([options?.defaultDamageType ?? '', ...normalizedDamageTypes].map((t) => String(t ?? '').toLowerCase()).filter(Boolean));
	const rangeEntries = (() => {
		const ac5eConfig = options?.ac5eConfig;
		if (!ac5eConfig) return [];
		const subjectEntries = Array.isArray(ac5eConfig?.subject?.range) ? ac5eConfig.subject.range : [];
		const opponentEntries = Array.isArray(ac5eConfig?.opponent?.range) ? ac5eConfig.opponent.range : [];
		return _filterOptinEntries(subjectEntries.concat(opponentEntries), ac5eConfig?.optinSelected).filter((entry) => {
			if (!entry || typeof entry !== 'object' || entry.mode !== 'range') return false;
			if (entry.hook && entry.hook !== 'attack') return false;
			const required = Array.isArray(entry.requiredDamageTypes) ? entry.requiredDamageTypes.map((t) => String(t).toLowerCase()) : [];
			if (!required.length) return true;
			return required.some((t) => selectedDamageTypes.has(t));
		});
	})();
	const applyRangeComponent = (base, component) => {
		if (!component || typeof component !== 'object') return base;
		const value = Number(component.value);
		if (!Number.isFinite(value)) return base;
		const next = component.operation === 'delta' ? Number(base ?? 0) + value : value;
		return Math.max(0, next);
	};
	const getRangeEntryLabel = (entry) => {
		const label = entry?.label ?? entry?.name ?? entry?.id;
		const normalized = String(label ?? '').trim();
		return normalized || undefined;
	};
	let longDisadvantage = settings.autoRangeChecks.has('rangedLongDisadvantage');
	let nearbyFoeDisadvantage = settings.autoRangeChecks.has('rangedNearbyFoes');
	let outOfRangeFail = settings.autoRangeChecks.has('rangedOoR');
	let outOfRangeFailSourceLabel;
	let outOfRangeFailSourceMode;
	for (const entry of rangeEntries) {
		const rangeConfig = entry?.range ?? {};
		const entryLabel = getRangeEntryLabel(entry);
		short = applyRangeComponent(short, rangeConfig.short);
		long = applyRangeComponent(long, rangeConfig.long);
		reach = applyRangeComponent(reach, rangeConfig.reach);
		if (rangeConfig.bonus) {
			short = applyRangeComponent(short, rangeConfig.bonus);
			long = applyRangeComponent(long, rangeConfig.bonus);
			reach = applyRangeComponent(reach, rangeConfig.bonus);
		}
		if (typeof rangeConfig.longDisadvantage === 'boolean') longDisadvantage = rangeConfig.longDisadvantage;
		if (typeof rangeConfig.noLongDisadvantage === 'boolean') longDisadvantage = !rangeConfig.noLongDisadvantage;
		if (typeof rangeConfig.nearbyFoeDisadvantage === 'boolean') nearbyFoeDisadvantage = rangeConfig.nearbyFoeDisadvantage;
		if (typeof rangeConfig.nearbyFoes === 'boolean') nearbyFoeDisadvantage = rangeConfig.nearbyFoes;
		if (typeof rangeConfig.noNearbyFoeDisadvantage === 'boolean') nearbyFoeDisadvantage = !rangeConfig.noNearbyFoeDisadvantage;
		if (typeof rangeConfig.noNearbyFoes === 'boolean') nearbyFoeDisadvantage = !rangeConfig.noNearbyFoes;
		if (typeof rangeConfig.fail === 'boolean') {
			outOfRangeFail = rangeConfig.fail;
			outOfRangeFailSourceLabel = entryLabel;
			outOfRangeFailSourceMode = 'fail';
		}
		if (typeof rangeConfig.outOfRangeFail === 'boolean') {
			outOfRangeFail = rangeConfig.outOfRangeFail;
			outOfRangeFailSourceLabel = entryLabel;
			outOfRangeFailSourceMode = 'outOfRangeFail';
		}
		if (typeof rangeConfig.noFail === 'boolean') {
			outOfRangeFail = !rangeConfig.noFail;
			outOfRangeFailSourceLabel = entryLabel;
			outOfRangeFailSourceMode = 'noFail';
		}
		if (typeof rangeConfig.noOutOfRangeFail === 'boolean') {
			outOfRangeFail = !rangeConfig.noOutOfRangeFail;
			outOfRangeFailSourceLabel = entryLabel;
			outOfRangeFailSourceMode = 'noOutOfRangeFail';
		}
	}
	const noLongDisadvantage = !longDisadvantage;
	const flags = token.actor?.flags?.[Constants.MODULE_ID];
	const spellSniper = flags?.spellSniper || _hasItem(token.actor, 'AC5E.Feats.SpellSniper');
	if (spellSniper && isSpell && isAttack && !!short) {
		// if (modernRules && short >= 10) short += 60;
		if (modernRules && short >= 2 * distanceUnit) short += 12 * distanceUnit;
		else short *= 2;
	}
	if (settings.autoRangeChecks.has('meleeOoR') && reach && ['mwak', 'msak'].includes(actionType) && !options?.attackMode?.includes('thrown')) return { inRange: distance <= reach };
	const sharpShooter = flags?.sharpShooter || _hasItem(token.actor, 'AC5E.Feats.Sharpshooter');
	if (sharpShooter && long && actionType == 'rwak') short = long;
	const crossbowExpert = flags?.crossbowExpert || _hasItem(token.actor, 'AC5E.Feats.CrossbowExpert');

	const nearbyFoe =
		!midiNearbyFoe &&
		!['mwak', 'msak'].includes(actionType) &&
		nearbyFoeDisadvantage &&
		_findNearby({ token, disposition: 'opposite', radius: distanceUnit, lengthTest: 1 }) && //hostile vs friendly disposition only
		!crossbowExpert &&
		!(modernRules && ((isSpell && spellSniper) || (!isSpell && sharpShooter)));
	let isShort, isLong;
	const midiChecks = midiCheckRange && midiCheckRange !== 'none'; //give priority to midi checks as it will already by included in the workflow by midi.
	if (midiChecks || (!outOfRangeFail && !longDisadvantage) || (!short && !long) || distance <= short) isShort = true; //expect short and long being null for some items, and handle these cases as in short range.
	if (!isShort) {
		if (longDisadvantage || outOfRangeFail) isLong = distance <= long;
		if (!isLong && !outOfRangeFail) isLong = true;
	}
	const inRange =
		isShort ? 'short'
		: isLong ? 'long'
		: false;
	return {
		inRange: !!inRange,
		range: inRange,
		distance,
		nearbyFoe,
		noLongDisadvantage,
		longDisadvantage,
		outOfRangeFail,
		outOfRangeFailSourceLabel,
		outOfRangeFailSourceMode,
	};
}
/*
* Checks if an actor has an item by its identifier, name (case-insensitive), id, or uuid.
* @param {Actor} actor - The actor to check for the item.
* @param {string} itemIdentifier - The identifier, name, id, or uuid of the item to check for.
* @returns {boolean} - True if the actor has the item, false otherwise.
*/
export function _hasItem(actor, itemIdentifier) {
	if (!itemIdentifier) return false;
	return actor?.items?.some((item) =>
		item?.identifier === itemIdentifier ||
		String(item?.name ?? '').toLowerCase().includes(String(_localize(itemIdentifier).toLowerCase())) ||
		item?.id === itemIdentifier ||
		item?.uuid === itemIdentifier) ?? false;
}

export function _systemCheck(testVersion) {
	return foundry.utils.isNewerVersion(game.system.version, testVersion);
}

export function _getTooltip(ac5eConfig = {}) {
	const { hookType, subject, opponent, alteredCritThreshold, alteredFumbleThreshold, alteredTargetADC, initialTargetADC, tooltipObj } = ac5eConfig;
	let tooltip;
	const hasOptins = ac5eConfig?.optinSelected && Object.keys(ac5eConfig.optinSelected).length;
	if (tooltipObj?.[hookType] && !hasOptins) return tooltipObj[hookType];
	else tooltip = '<div class="ac5e-tooltip-content">';
	const optinSelected = ac5eConfig?.optinSelected ?? {};
	const filterOptinEntries = (entries = []) => _filterOptinEntries(entries, optinSelected);
	const getChanceTooltipSuffix = (chanceData = {}) => {
		if (!chanceData || typeof chanceData !== 'object') return '';
		if (!chanceData.enabled || !chanceData.triggered) return '';
		const roll = Number(chanceData.rolled);
		const text =
			Number.isFinite(roll) ?
				game?.i18n?.has?.('AC5E.Chance.TriggeredWithRoll') ?
					game.i18n.format('AC5E.Chance.TriggeredWithRoll', { roll: Math.trunc(roll) })
				:	`is triggered (rolled ${Math.trunc(roll)})`
			:	(_localize('AC5E.Chance.Triggered') ?? 'is triggered');
		return ` (${text})`;
	};
	const mapEntryLabels = (entries = []) =>
		entries
			.map((entry) => {
				if (typeof entry !== 'object') return entry;
				const label = entry?.label ?? entry?.name ?? entry?.id ?? entry?.bonus ?? entry?.modifier ?? entry?.set ?? entry?.threshold;
				if (label === undefined) return undefined;
				return `${String(label)}${getChanceTooltipSuffix(entry?.chance)}`;
			})
			.filter(Boolean);
	const normalizeTooltipLabel = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
	if (settings.showNameTooltips) tooltip += '<div style="text-align:center;"><strong>Automated Conditions 5e</strong></div><hr>';
	const addTooltip = (condition, text) => {
		if (condition) {
			if (tooltip.includes('span')) tooltip += '<br>';
			tooltip += text;
		}
	};
	if (subject) {
		const subjectSuppressedStatuses = [...new Set(mapEntryLabels(subject?.suppressedStatuses ?? []))];
		const subjectCritical = mapEntryLabels(filterOptinEntries(subject?.critical ?? []));
		const subjectNoCritical = mapEntryLabels(filterOptinEntries(subject?.noCritical ?? []));
		const subjectMidiAdvantage = [...new Set((subject?.midiAdvantage ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
		const subjectMidiDisadvantage = [...new Set((subject?.midiDisadvantage ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
		const midiAdvantageSet = new Set(subjectMidiAdvantage.map(normalizeTooltipLabel));
		const midiDisadvantageSet = new Set(subjectMidiDisadvantage.map(normalizeTooltipLabel));
		const subjectAdvantageModes = [...mapEntryLabels(filterOptinEntries(subject?.advantage ?? [])), ...([...subject?.advantageNames] ?? [])].filter(
			(label) => !midiAdvantageSet.has(normalizeTooltipLabel(label)),
		);
		const subjectDisadvantageModes = [...mapEntryLabels(filterOptinEntries(subject?.disadvantage ?? [])), ...([...subject?.disadvantageNames] ?? [])].filter(
			(label) => !midiDisadvantageSet.has(normalizeTooltipLabel(label)),
		);
		const subjectNoAdvantage = mapEntryLabels(filterOptinEntries(subject?.noAdvantage ?? []));
		const subjectNoDisadvantage = mapEntryLabels(filterOptinEntries(subject?.noDisadvantage ?? []));
		const subjectFail = mapEntryLabels(filterOptinEntries(subject?.fail ?? []));
		const subjectRangeNotes = [...new Set(mapEntryLabels(subject?.rangeNotes ?? []))];
		const subjectMidiFail = [...new Set((subject?.midiFail ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
		const subjectFumble = mapEntryLabels(filterOptinEntries(subject?.fumble ?? []));
		const subjectSuccess = mapEntryLabels(filterOptinEntries(subject?.success ?? []));
		const subjectMidiSuccess = [...new Set((subject?.midiSuccess ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
		addTooltip(subjectSuppressedStatuses.length, `<span style="display: block; text-align: left;">Suppressed Statuses: ${subjectSuppressedStatuses.join(', ')}</span>`);
		addTooltip(subjectCritical.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Critical')}: ${subjectCritical.join(', ')}</span>`);
		addTooltip(subjectNoCritical.length, `<span style="display: block; text-align: left;">${_localize('AC5E.NoCritical')}: ${subjectNoCritical.join(', ')}</span>`);
		addTooltip(subjectAdvantageModes.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Advantage')}: ${subjectAdvantageModes.join(', ')}</span>`);
		addTooltip(subjectMidiAdvantage.length, `<span style="display: block; text-align: left;">MidiQOL ${_localize('DND5E.Advantage')}: ${subjectMidiAdvantage.join(', ')}</span>`);
		addTooltip(subjectMidiDisadvantage.length, `<span style="display: block; text-align: left;">MidiQOL ${_localize('DND5E.Disadvantage')}: ${subjectMidiDisadvantage.join(', ')}</span>`);
		addTooltip(subjectNoAdvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.NoAdvantage')}: ${subjectNoAdvantage.join(', ')}</span>`);
		addTooltip(subjectRangeNotes.length, `<span style="display: block; text-align: left;">Range: ${subjectRangeNotes.join(', ')}</span>`);
		addTooltip(subjectFail.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Fail')}: ${subjectFail.join(', ')}</span>`);
		addTooltip(subjectMidiFail.length, `<span style="display: block; text-align: left;">MidiQOL ${_localize('AC5E.Fail')}: ${subjectMidiFail.join(', ')}</span>`);
		addTooltip(subjectFumble.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Fumble')}: ${subjectFumble.join(', ')}</span>`);
		addTooltip(subjectDisadvantageModes.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Disadvantage')}: ${subjectDisadvantageModes.join(', ')}</span>`);
		addTooltip(subjectNoDisadvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.NoDisadvantage')}: ${subjectNoDisadvantage.join(', ')}</span>`);
		addTooltip(subjectSuccess.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Success')}: ${subjectSuccess.join(', ')}</span>`);
		addTooltip(subjectMidiSuccess.length, `<span style="display: block; text-align: left;">MidiQOL ${_localize('AC5E.Success')}: ${subjectMidiSuccess.join(', ')}</span>`);
		const subjectBonusLabels = mapEntryLabels(filterOptinEntries(subject.bonus));
		addTooltip(subjectBonusLabels.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Bonus')}: ${subjectBonusLabels.join(', ')}</span>`);
		const subjectModifierLabels = mapEntryLabels(filterOptinEntries(subject.modifiers));
		addTooltip(subjectModifierLabels.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Modifier')}: ${subjectModifierLabels.join(', ')}</span>`);
		const subjectExtraDiceLabels = mapEntryLabels(filterOptinEntries(subject.extraDice));
		addTooltip(subjectExtraDiceLabels.length, `<span style="display: block; text-align: left;">${_localize('AC5E.ExtraDice')}: ${subjectExtraDiceLabels.join(', ')}</span>`);
	}
	if (opponent) {
		const opponentSuppressedStatuses = [...new Set(mapEntryLabels(opponent?.suppressedStatuses ?? []))];
		const opponentCritical = mapEntryLabels(filterOptinEntries(opponent?.critical ?? []));
		const opponentNoCritical = mapEntryLabels(filterOptinEntries(opponent?.noCritical ?? []));
		const opponentAdvantageModes = [...mapEntryLabels(filterOptinEntries(opponent?.advantage ?? [])), ...([...opponent?.advantageNames] ?? [])];
		const opponentDisadvantageModes = [...mapEntryLabels(filterOptinEntries(opponent?.disadvantage ?? [])), ...([...opponent?.disadvantageNames] ?? [])];
		const opponentNoAdvantage = mapEntryLabels(filterOptinEntries(opponent?.noAdvantage ?? []));
		const opponentNoDisadvantage = mapEntryLabels(filterOptinEntries(opponent?.noDisadvantage ?? []));
		const opponentFail = mapEntryLabels(filterOptinEntries(opponent?.fail ?? []));
		const opponentFumble = mapEntryLabels(filterOptinEntries(opponent?.fumble ?? []));
		const opponentSuccess = mapEntryLabels(filterOptinEntries(opponent?.success ?? []));
		addTooltip(opponentSuppressedStatuses.length, `<span style="display: block; text-align: left;">Suppressed Statuses: ${opponentSuppressedStatuses.join(', ')}</span>`);
		addTooltip(opponentCritical.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsCriticalAbbreviated')}: ${opponentCritical.join(', ')}</span>`);
		addTooltip(opponentNoCritical.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsNoCritical')}: ${opponentNoCritical.join(', ')}</span>`);
		addTooltip(opponentFail.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsFail')}: ${opponentFail.join(', ')}</span>`);
		addTooltip(opponentAdvantageModes.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsAdvantageAbbreviated')}: ${opponentAdvantageModes.join(', ')}</span>`);
		addTooltip(opponentNoAdvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsNoAdvantage')}: ${opponentNoAdvantage.join(', ')}</span>`);
		addTooltip(
			opponentDisadvantageModes.length,
			`<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsDisadvantageAbbreviated')}: ${opponentDisadvantageModes.join(', ')}</span>`,
		);
		addTooltip(opponentNoDisadvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsNoDisadvantage')}: ${opponentNoDisadvantage.join(', ')}</span>`);
		addTooltip(opponentSuccess.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsSuccess')}: ${opponentSuccess.join(', ')}</span>`);
		addTooltip(opponentFumble.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsFumble')}: ${opponentFumble.join(', ')}</span>`);
		const opponentBonusLabels = mapEntryLabels(filterOptinEntries(opponent.bonus));
		addTooltip(opponentBonusLabels.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsBonus')}: ${opponentBonusLabels.join(', ')}</span>`);
		const opponentModifierLabels = mapEntryLabels(filterOptinEntries(opponent.modifiers));
		addTooltip(opponentModifierLabels.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsModifier')}: ${opponentModifierLabels.join(', ')}</span>`);
		const opponentExtraDiceLabels = mapEntryLabels(filterOptinEntries(opponent.extraDice));
		addTooltip(opponentExtraDiceLabels.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsExtraDice')}: ${opponentExtraDiceLabels.join(', ')}</span>`);
	}
	//critical threshold
	if (subject?.criticalThreshold.length || opponent?.criticalThreshold.length) {
		const combinedEntries = filterOptinEntries([...(subject?.criticalThreshold ?? []), ...(opponent?.criticalThreshold ?? [])]);
		const combinedArray = mapEntryLabels(combinedEntries);
		const translationString = game.i18n.translations.DND5E.Critical + ' ' + game.i18n.translations.DND5E.Threshold + ' ' + alteredCritThreshold;
		addTooltip(combinedArray.length, `<span style="display: block; text-align: left;">${_localize(translationString)}: ${combinedArray.join(', ')}</span>`);
	}
	if (subject?.fumbleThreshold.length || opponent?.fumbleThreshold.length) {
		const combinedEntries = filterOptinEntries([...(subject?.fumbleThreshold ?? []), ...(opponent?.fumbleThreshold ?? [])]);
		const combinedArray = mapEntryLabels(combinedEntries);
		const translationString = game.i18n.translations.AC5E.Fumble + ' ' + game.i18n.translations.DND5E.Threshold + ' ' + alteredFumbleThreshold;
		addTooltip(combinedArray.length, `<span style="display: block; text-align: left;">${_localize(translationString)}: ${combinedArray.join(', ')}</span>`);
	}
	const combinedTargetEntries = filterOptinEntries([...(subject?.targetADC ?? []), ...(opponent?.targetADC ?? [])]);
	const combinedTargetADC = mapEntryLabels(combinedTargetEntries);
	if (combinedTargetADC.length) {
		let tooltipInitialTargetADC = initialTargetADC;
		let tooltipAlteredTargetADC = alteredTargetADC;
		if (tooltipInitialTargetADC === undefined) tooltipInitialTargetADC = 10;
		if (tooltipAlteredTargetADC === undefined) {
			const type = hookType === 'attack' ? 'acBonus' : 'dcBonus';
			const entryValues = combinedTargetEntries.flatMap((entry) => (Array.isArray(entry?.values) ? entry.values : []));
			const valuesForTooltip = entryValues.length ? entryValues : (ac5eConfig.targetADC ?? []);
			tooltipAlteredTargetADC = getAlteredTargetValueOrThreshold(tooltipInitialTargetADC, valuesForTooltip, type);
		}
		if (ac5e?.debugTargetADC)
			console.warn('AC5E targetADC: tooltip', {
				hookType,
				combinedTargetADC,
				initialTargetADC: tooltipInitialTargetADC,
				alteredTargetADC: tooltipAlteredTargetADC,
				rawTargetADC: ac5eConfig.targetADC,
			});
		let translationString = _localize(hookType === 'attack' ? 'AC5E.ModifyAC' : 'AC5E.ModifyDC');
		translationString += ` ${tooltipAlteredTargetADC} (${tooltipInitialTargetADC})`;
		addTooltip(true, `<span style="display: block; text-align: left;">${translationString}: ${combinedTargetADC.join(', ')}</span>`);
	}
	tooltip += tooltip.includes('span') ? '</div>' : `<div style="text-align:center;"><strong>${_localize('AC5E.NoChanges')}</strong></div></div>`;
	ac5eConfig.tooltipObj ||= {};
	ac5eConfig.tooltipObj[hookType] = tooltip;
	return tooltip;
}

function _getMidiAttackAttributionEntries(workflow, type) {
	if (!workflow || !type) return [];
	const isAc5eAttributionSource = (source) => {
		if (typeof source !== 'string') return false;
		const normalized = source.trim();
		return normalized.startsWith(`${Constants.MODULE_ID}:`) || /^ac5e(?:\b|[:\s-])/i.test(normalized);
	};
	const readStructuredAttribution = (source) => {
		const typeEntries = source?.attribution?.[type] ?? source?.[type];
		if (!typeEntries || typeof typeEntries !== 'object') return [];
		const filteredEntries = [];
		for (const [entrySource, value] of Object.entries(typeEntries)) {
			if (isAc5eAttributionSource(entrySource)) continue;
			const label = String(value ?? '').trim();
			if (label) filteredEntries.push(label);
		}
		return filteredEntries;
	};
	const trackerEntries = readStructuredAttribution(workflow?.attackRollModifierTracker);
	if (trackerEntries.length) return [...new Set(trackerEntries)];
	const structuredEntries = readStructuredAttribution(workflow?.attackAttribution);
	if (structuredEntries.length) return [...new Set(structuredEntries)];
	const legacyEntries = workflow?.attackAdvAttribution;
	if (!legacyEntries || typeof legacyEntries[Symbol.iterator] !== 'function') return [];
	const prefix = `${type}:`;
	const parsed = [];
	for (const entry of legacyEntries) {
		if (typeof entry !== 'string' || !entry.startsWith(prefix)) continue;
		const raw = entry.slice(prefix.length).trim();
		if (!raw) continue;
		if (raw.startsWith(`${Constants.MODULE_ID}:`) || /^ac5e(?:\b|[:\s-])/i.test(raw)) continue;
		if (raw.includes('.')) {
			const splitIndex = raw.indexOf(' ');
			parsed.push((splitIndex > -1 ? raw.slice(splitIndex + 1) : raw).trim());
		} else parsed.push(raw);
	}
	return [...new Set(parsed.filter(Boolean))];
}

function _localizeOrFallback(key, fallback) {
	const localized = _localize(key);
	return localized && localized !== key ? localized : fallback;
}

function _resolveMidiFlagSegmentLabel(segment) {
	const rawSegment = String(segment ?? '').trim();
	if (!rawSegment) return '';
	const normalized = rawSegment.toLowerCase();
	if (normalized === 'all') return _localizeOrFallback('DND5E.All', 'All');
	const abilityLabel = CONFIG?.DND5E?.abilities?.[normalized]?.label ?? CONFIG?.DND5E?.abilities?.[normalized];
	if (abilityLabel) return _localize(String(abilityLabel));
	const skillLabel = CONFIG?.DND5E?.skills?.[normalized]?.label;
	if (skillLabel) return _localize(String(skillLabel));
	const actionTypeLabel = CONFIG?.DND5E?.itemActionTypes?.[normalized];
	if (actionTypeLabel) return _localize(String(actionTypeLabel));
	const damageTypeLabel = CONFIG?.DND5E?.damageTypes?.[normalized]?.label;
	if (damageTypeLabel) return _localize(String(damageTypeLabel));
	if (normalized === 'ability') return _localizeOrFallback('DND5E.Ability', 'Ability');
	if (normalized === 'check') return _localizeOrFallback('DND5E.Check', 'Check');
	if (normalized === 'save') return _localizeOrFallback('DND5E.Save', 'Save');
	if (normalized === 'skill') return _localizeOrFallback('TYPES.Item.skill', 'Skill');
	if (normalized === 'tool') return _localizeOrFallback('TYPES.Item.tool', 'Tool');
	return rawSegment;
}

function _resolveMidiFlagDisplayName(value) {
	const rawValue = String(value ?? '').trim();
	if (!rawValue) return '';
	if (/\s/.test(rawValue) && !rawValue.startsWith('flags.midi-qol.')) return rawValue;
	if (rawValue.startsWith('midi-qol.')) {
		const localized = _localize(rawValue);
		return localized && localized !== rawValue ? localized : rawValue;
	}
	const midiFlag = rawValue.replace(/^flags\.midi-qol\./i, '');
	const daeName = globalThis?.DAE?.localizationMap?.[`flags.midi-qol.${midiFlag}`]?.name;
	if (daeName) return String(daeName).trim();
	const exactKey = `midi-qol.flagTemplate.${midiFlag}.name`;
	const exactResult = _localize(exactKey);
	if (exactResult && exactResult !== exactKey) {
		if (exactResult.includes('{label}')) return exactResult.replace(/\s*\(\{label\}\)/, '');
		return exactResult;
	}
	const lastDot = midiFlag.lastIndexOf('.');
	if (lastDot > 0) {
		const prefix = midiFlag.slice(0, lastDot);
		const lastElement = midiFlag.slice(lastDot + 1);
		const prefixKey = `midi-qol.flagTemplate.${prefix}.name`;
		const prefixResult = _localize(prefixKey);
		if (prefixResult && prefixResult !== prefixKey) {
			const label = _resolveMidiFlagSegmentLabel(lastElement);
			try {
				return game?.i18n?.format ? game.i18n.format(prefixKey, { label }) : prefixResult;
			} catch (_err) {
				return prefixResult;
			}
		}
	}
	if (!midiFlag.includes('.')) return rawValue;
	const parts = midiFlag.split('.').filter(Boolean);
	if (!parts.length) return rawValue;
	const modeTokens = new Set(['advantage', 'disadvantage', 'noadvantage', 'nodisadvantage', 'fail', 'success', 'critical', 'nocritical', 'fumble']);
	const coreParts = modeTokens.has(parts[0].toLowerCase()) ? parts.slice(1) : parts;
	if (!coreParts.length) return rawValue;
	const labels = coreParts.map((part) => _resolveMidiFlagSegmentLabel(part)).filter(Boolean);
	if (labels.length > 1 && labels.at(-1) === _localizeOrFallback('DND5E.All', 'All')) {
		const base = labels.slice(0, -1).join(' ').trim();
		return base ? `${base} (${_localizeOrFallback('DND5E.All', 'All')})` : _localizeOrFallback('DND5E.All', 'All');
	}
	return labels.join(' ').trim() || rawValue;
}

function _normalizeMidiAttributionLabel(value, source) {
	const rawValue = String(value ?? '').trim();
	if (!rawValue) return '';
	const fromValue = _resolveMidiFlagDisplayName(rawValue);
	if (fromValue) return fromValue;
	if (typeof source === 'string') {
		const fromSource = _resolveMidiFlagDisplayName(source);
		if (fromSource) return fromSource;
	}
	return rawValue;
}

function _syncMidiAttackRollModifierTracker(ac5eConfig, config) {
	if (!_activeModule('midi-qol')) return;
	if (ac5eConfig?.hookType !== 'attack') return;
	const tracker = config?.workflow?.attackRollModifierTracker;
	if (!tracker?.addAttribution || !tracker?.attribution) return;
	const trackedTypes = ['ADV', 'DIS', 'NOADV', 'NODIS', 'CRIT', 'NOCRIT'];
	const legacySourcePrefix = `${Constants.MODULE_ID}:`;
	const displaySourcePrefix = 'AC5E ';
	const toLabel = (entry) => {
		if (entry === undefined || entry === null) return '';
		if (typeof entry === 'string' || typeof entry === 'number') return String(entry).trim();
		if (typeof entry !== 'object') return '';
		const value = entry?.label ?? entry?.name ?? entry?.id ?? entry?.bonus ?? entry?.modifier ?? entry?.set ?? entry?.threshold;
		return value === undefined || value === null ? '' : String(value).trim();
	};
	const labelsFromEntries = (entries = []) => {
		const next = [];
		const source = Array.isArray(entries) ? entries : [entries];
		for (const entry of source) {
			const label = toLabel(entry);
			if (label) next.push(label);
		}
		return next;
	};
	const labelsFromCollection = (value) => {
		if (value instanceof Set) return labelsFromEntries([...value]);
		if (Array.isArray(value)) return labelsFromEntries(value);
		if (typeof value === 'string') return labelsFromEntries([value]);
		return [];
	};
	const dedupeLabels = (entries = []) => [...new Set(entries.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
	const normalizeLabel = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^ac5e[:\s-]*/i, '').toLowerCase();
	const withDisplayPrefix = (label) => {
		const cleaned = String(label ?? '').trim();
		if (!cleaned) return '';
		return /^ac5e(?:\b|[:\s-])/i.test(cleaned) ? cleaned : `${displaySourcePrefix}${cleaned}`;
	};
	const midiKeypressSources = new Set(['keyPress', 'forcedKeyPress']);
	const keypressLabelsByType = {
		ADV: new Set([_localize('AC5E.AdvantageKeypress'), _localize('AC5E.OverrideAdvantage')].map(normalizeLabel).filter(Boolean)),
		DIS: new Set([_localize('AC5E.DisadvantageKeypress'), _localize('AC5E.OverrideDisadvantage')].map(normalizeLabel).filter(Boolean)),
	};
	const configButtonSources = new Set(['config-buttons']);
	const hasMidiKeypressAttribution = (type) => {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') return false;
		return Object.keys(typed).some((source) => midiKeypressSources.has(source));
	};
	const hasEquivalentMidiAttribution = (type, label) => {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') return false;
		const normalizedLabel = normalizeLabel(label);
		if (!normalizedLabel) return false;
		return Object.entries(typed).some(([source, displayName]) => {
			if (typeof source !== 'string') return false;
			if (source.startsWith(legacySourcePrefix) || source.startsWith(displaySourcePrefix)) return false;
			return normalizeLabel(displayName) === normalizedLabel;
		});
	};
	const clearTrackedType = (type) => {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') return;
		for (const source of Object.keys(typed)) {
			if (!source.startsWith(legacySourcePrefix) && !source.startsWith(displaySourcePrefix)) continue;
			delete typed[source];
		}
		if (!Object.keys(typed).length) delete tracker.attribution[type];
	};
	const clearLegacySet = (setValue) => {
		if (!(setValue instanceof Set)) return;
		for (const value of [...setValue]) {
			if (typeof value !== 'string') continue;
			const split = value.indexOf(':');
			if (split <= 0) continue;
			const type = value.slice(0, split);
			const source = value.slice(split + 1);
			if (!trackedTypes.includes(type)) continue;
			if (!source.startsWith(legacySourcePrefix) && !source.startsWith(displaySourcePrefix)) continue;
			setValue.delete(value);
		}
	};
	const removeAttributionSource = (type, source) => {
		if (!type || !source) return;
		const typed = tracker?.attribution?.[type];
		if (typed && typeof typed === 'object' && Object.prototype.hasOwnProperty.call(typed, source)) {
			delete typed[source];
			if (!Object.keys(typed).length) delete tracker.attribution[type];
		}
		const legacyKey = `${type}:${source}`;
		if (tracker?.legacyAttribution instanceof Set) tracker.legacyAttribution.delete(legacyKey);
		if (tracker?.advReminderAttribution instanceof Set) tracker.advReminderAttribution.delete(legacyKey);
	};
	const dropConfigButtonsAttribution = (type, labels = []) => {
		if (!labels.length) return;
		for (const source of configButtonSources) removeAttributionSource(type, source);
	};
	for (const type of trackedTypes) clearTrackedType(type);
	clearLegacySet(tracker?.legacyAttribution);
	clearLegacySet(tracker?.advReminderAttribution);

	const selected = ac5eConfig?.optinSelected ?? {};
	const filterOptin = (entries = []) => _filterOptinEntries(entries, selected);
	const subject = ac5eConfig?.subject ?? {};
	const opponent = ac5eConfig?.opponent ?? {};

	const advantageLabels = dedupeLabels(
		labelsFromEntries(filterOptin(subject?.advantage ?? []))
			.concat(labelsFromEntries(filterOptin(opponent?.advantage ?? [])))
			.concat(labelsFromCollection(subject?.advantageNames))
			.concat(labelsFromCollection(opponent?.advantageNames)),
	);
	const disadvantageLabels = dedupeLabels(
		labelsFromEntries(filterOptin(subject?.disadvantage ?? []))
			.concat(labelsFromEntries(filterOptin(opponent?.disadvantage ?? [])))
			.concat(labelsFromCollection(subject?.disadvantageNames))
			.concat(labelsFromCollection(opponent?.disadvantageNames)),
	);
	const noAdvantageLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.noAdvantage ?? [])).concat(labelsFromEntries(filterOptin(opponent?.noAdvantage ?? []))));
	const noDisadvantageLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.noDisadvantage ?? [])).concat(labelsFromEntries(filterOptin(opponent?.noDisadvantage ?? []))));
	const criticalLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.critical ?? [])).concat(labelsFromEntries(filterOptin(opponent?.critical ?? []))));
	const noCriticalLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.noCritical ?? [])).concat(labelsFromEntries(filterOptin(opponent?.noCritical ?? []))));
	const addEntries = (type, labels = []) => {
		dropConfigButtonsAttribution(type, labels);
		const keypressLabels = keypressLabelsByType[type];
		for (const label of labels) {
			const normalizedLabel = normalizeLabel(label);
			if (!normalizedLabel) continue;
			if (keypressLabels?.has(normalizedLabel) && hasMidiKeypressAttribution(type)) continue;
			if (hasEquivalentMidiAttribution(type, label)) continue;
			const displayLabel = withDisplayPrefix(label);
			if (!displayLabel) continue;
			tracker.addAttribution(type, displayLabel, displayLabel);
		}
	};
	addEntries('ADV', advantageLabels);
	addEntries('DIS', disadvantageLabels);
	addEntries('NOADV', noAdvantageLabels);
	addEntries('NODIS', noDisadvantageLabels);
	addEntries('CRIT', criticalLabels);
	addEntries('NOCRIT', noCriticalLabels);
}

function _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, type) {
	if (!type) return [];
	const tracker = _resolveMidiAbilityRollModifierTracker(ac5eConfig, config, dialog, { requireWritable: false });
	const typeEntries = tracker?.attribution?.[type];
	if (!typeEntries || typeof typeEntries !== 'object') return [];
	const entries = [];
	for (const [source, value] of Object.entries(typeEntries)) {
		if (typeof source === 'string') {
			const normalized = source.trim();
			if (normalized.startsWith(`${Constants.MODULE_ID}:`) || /^ac5e(?:\b|[:\s-])/i.test(normalized)) continue;
		}
		const label = _normalizeMidiAttributionLabel(value, source);
		if (label) entries.push(label);
	}
	return [...new Set(entries)];
}

function _resolveMidiAbilityRollModifierTracker(ac5eConfig, config, dialog, { requireWritable = true } = {}) {
	const toTracker = (value) => {
		if (!value || typeof value !== 'object') return undefined;
		const tracker = value?.tracker ?? value;
		if (!tracker || typeof tracker !== 'object') return undefined;
		if (requireWritable && typeof tracker.addAttribution !== 'function') return undefined;
		if (!tracker.attribution || typeof tracker.attribution !== 'object') return undefined;
		return tracker;
	};
	const maps = [config?.midiOptions?.advantageByChoice, config?.options?.advantageByChoice, dialog?.options?.advantageByChoice].filter(
		(candidate) => candidate && typeof candidate === 'object',
	);
	const choiceKeys = [
		config?.skill,
		config?.tool,
		config?.ability,
		ac5eConfig?.options?.skill,
		ac5eConfig?.options?.tool,
		ac5eConfig?.options?.ability,
	]
		.map((value) => (typeof value === 'string' ? value.trim() : ''))
		.filter(Boolean);
	for (const map of maps) {
		for (const key of choiceKeys) {
			const tracker = toTracker(map?.[key]);
			if (tracker) return tracker;
		}
	}
	for (const map of maps) {
		const entries = Object.values(map ?? {});
		if (entries.length !== 1) continue;
		const tracker = toTracker(entries[0]);
		if (tracker) return tracker;
	}
	return toTracker(config?.midiOptions?.modifierTracker) ?? toTracker(config?.midiOptions?.tracker);
}

function _syncMidiAbilityRollModifierTracker(ac5eConfig, config, dialog) {
	if (!_activeModule('midi-qol')) return;
	if (!['check', 'save'].includes(ac5eConfig?.hookType)) return;
	const tracker = _resolveMidiAbilityRollModifierTracker(ac5eConfig, config, dialog);
	if (!tracker) return;
	const trackedTypes = ['ADV', 'DIS', 'NOADV', 'NODIS', 'FAIL', 'SUCCESS'];
	const legacySourcePrefix = `${Constants.MODULE_ID}:`;
	const displaySourcePrefix = 'AC5E ';
	const toLabel = (entry) => {
		if (entry === undefined || entry === null) return '';
		if (typeof entry === 'string' || typeof entry === 'number') return String(entry).trim();
		if (typeof entry !== 'object') return '';
		const value = entry?.label ?? entry?.name ?? entry?.id ?? entry?.bonus ?? entry?.modifier ?? entry?.set ?? entry?.threshold;
		return value === undefined || value === null ? '' : String(value).trim();
	};
	const labelsFromEntries = (entries = []) => {
		const next = [];
		const source = Array.isArray(entries) ? entries : [entries];
		for (const entry of source) {
			const label = toLabel(entry);
			if (label) next.push(label);
		}
		return next;
	};
	const labelsFromCollection = (value) => {
		if (value instanceof Set) return labelsFromEntries([...value]);
		if (Array.isArray(value)) return labelsFromEntries(value);
		if (typeof value === 'string') return labelsFromEntries([value]);
		return [];
	};
	const dedupeLabels = (entries = []) => [...new Set(entries.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
	const normalizeLabel = (value) => String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^ac5e[:\s-]*/i, '').toLowerCase();
	const withDisplayPrefix = (label) => {
		const cleaned = String(label ?? '').trim();
		if (!cleaned) return '';
		return /^ac5e(?:\b|[:\s-])/i.test(cleaned) ? cleaned : `${displaySourcePrefix}${cleaned}`;
	};
	const midiKeypressSources = new Set(['keyPress', 'forcedKeyPress']);
	const keypressLabelsByType = {
		ADV: new Set([_localize('AC5E.AdvantageKeypress'), _localize('AC5E.OverrideAdvantage')].map(normalizeLabel).filter(Boolean)),
		DIS: new Set([_localize('AC5E.DisadvantageKeypress'), _localize('AC5E.OverrideDisadvantage')].map(normalizeLabel).filter(Boolean)),
	};
	const configButtonSources = new Set(['config-buttons']);
	const hasMidiKeypressAttribution = (type) => {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') return false;
		return Object.keys(typed).some((source) => midiKeypressSources.has(source));
	};
	const hasEquivalentMidiAttribution = (type, label) => {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') return false;
		const normalizedLabel = normalizeLabel(label);
		if (!normalizedLabel) return false;
		return Object.entries(typed).some(([source, displayName]) => {
			if (typeof source !== 'string') return false;
			if (source.startsWith(legacySourcePrefix) || source.startsWith(displaySourcePrefix)) return false;
			return normalizeLabel(displayName) === normalizedLabel;
		});
	};
	const clearTrackedType = (type) => {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') return;
		for (const source of Object.keys(typed)) {
			if (!source.startsWith(legacySourcePrefix) && !source.startsWith(displaySourcePrefix)) continue;
			delete typed[source];
		}
		if (!Object.keys(typed).length) delete tracker.attribution[type];
	};
	const clearLegacySet = (setValue) => {
		if (!(setValue instanceof Set)) return;
		for (const value of [...setValue]) {
			if (typeof value !== 'string') continue;
			const split = value.indexOf(':');
			if (split <= 0) continue;
			const type = value.slice(0, split);
			const source = value.slice(split + 1);
			if (!trackedTypes.includes(type)) continue;
			if (!source.startsWith(legacySourcePrefix) && !source.startsWith(displaySourcePrefix)) continue;
			setValue.delete(value);
		}
	};
	const removeAttributionSource = (type, source) => {
		if (!type || !source) return;
		const typed = tracker?.attribution?.[type];
		if (typed && typeof typed === 'object' && Object.prototype.hasOwnProperty.call(typed, source)) {
			delete typed[source];
			if (!Object.keys(typed).length) delete tracker.attribution[type];
		}
		const legacyKey = `${type}:${source}`;
		if (tracker?.legacyAttribution instanceof Set) tracker.legacyAttribution.delete(legacyKey);
		if (tracker?.advReminderAttribution instanceof Set) tracker.advReminderAttribution.delete(legacyKey);
	};
	const dropConfigButtonsAttribution = (type, labels = []) => {
		if (!labels.length) return;
		for (const source of configButtonSources) removeAttributionSource(type, source);
	};
	for (const type of trackedTypes) clearTrackedType(type);
	clearLegacySet(tracker?.legacyAttribution);
	clearLegacySet(tracker?.advReminderAttribution);

	const selected = ac5eConfig?.optinSelected ?? {};
	const filterOptin = (entries = []) => _filterOptinEntries(entries, selected);
	const subject = ac5eConfig?.subject ?? {};
	const opponent = ac5eConfig?.opponent ?? {};

	const advantageLabels = dedupeLabels(
		labelsFromEntries(filterOptin(subject?.advantage ?? []))
			.concat(labelsFromEntries(filterOptin(opponent?.advantage ?? [])))
			.concat(labelsFromCollection(subject?.advantageNames))
			.concat(labelsFromCollection(opponent?.advantageNames)),
	);
	const disadvantageLabels = dedupeLabels(
		labelsFromEntries(filterOptin(subject?.disadvantage ?? []))
			.concat(labelsFromEntries(filterOptin(opponent?.disadvantage ?? [])))
			.concat(labelsFromCollection(subject?.disadvantageNames))
			.concat(labelsFromCollection(opponent?.disadvantageNames)),
	);
	const noAdvantageLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.noAdvantage ?? [])).concat(labelsFromEntries(filterOptin(opponent?.noAdvantage ?? []))));
	const noDisadvantageLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.noDisadvantage ?? [])).concat(labelsFromEntries(filterOptin(opponent?.noDisadvantage ?? []))));
	const failLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.fail ?? [])).concat(labelsFromEntries(filterOptin(opponent?.fail ?? []))));
	const successLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.success ?? [])).concat(labelsFromEntries(filterOptin(opponent?.success ?? []))));
	const addEntries = (type, labels = []) => {
		dropConfigButtonsAttribution(type, labels);
		const keypressLabels = keypressLabelsByType[type];
		for (const label of labels) {
			const normalizedLabel = normalizeLabel(label);
			if (!normalizedLabel) continue;
			if (keypressLabels?.has(normalizedLabel) && hasMidiKeypressAttribution(type)) continue;
			if (hasEquivalentMidiAttribution(type, label)) continue;
			const displayLabel = withDisplayPrefix(label);
			if (!displayLabel) continue;
			tracker.addAttribution(type, displayLabel, displayLabel);
		}
	};
	addEntries('ADV', advantageLabels);
	addEntries('DIS', disadvantageLabels);
	addEntries('NOADV', noAdvantageLabels);
	addEntries('NODIS', noDisadvantageLabels);
	addEntries('FAIL', failLabels);
	addEntries('SUCCESS', successLabels);
}

export function _getConfig(config, dialog, hookType, tokenId, targetId, options = {}, reEval = false) {
	// foundry.utils.mergeObject(options, { spellLevel: dialog?.data?.flags?.use?.spellLevel, attackMode: config?.attackMode });
	if (settings.debug || ac5e.debug_getConfig) console.warn('AC5E._getConfig:', { config });
	const existingAC5e = config?.[Constants.MODULE_ID]; //to-do: any need for that one?
	// if (!foundry.utils.isEmpty(existingAC5e) && !reEval) foundry.utils.mergeObject(options, existingAC5e.options);
	if (settings.debug) console.error('AC5E._getConfig', { mergedOptions: options });
	const useConfig = _getUseConfig({ options, config });
	if (useConfig?.options) {
		_mergeUseOptions(options, useConfig.options);
		options.originatingUseConfig = foundry.utils.duplicate(useConfig);
		if (options.originatingUseConfig?.options?.originatingUseConfig !== undefined) delete options.originatingUseConfig.options.originatingUseConfig;
		if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers')) console.warn('AC5E getConfig use options', { hookType, merged: useConfig.options });
	}
	const { ac5eConfig, actor, midiRoller, roller } = _buildBaseConfig(config, dialog, hookType, tokenId, targetId, options, reEval);
	const hookContext = _getHookConfig({ hookType, useConfig, config, dialog, tokenId, targetId, options, reEval });
	const dialogContext = _getDialogConfig({ hookType, useConfig, hookContext, config, dialog });
	ac5eConfig.useConfig = useConfig;
	ac5eConfig.useConfigBase = hookContext?.base ?? null;
	ac5eConfig.hookContext = hookContext;
	ac5eConfig.dialogContext = dialogContext;
	if (useConfig?.optionsSnapshot && hookContext?.reEval?.options?.length) {
		const snapshot = useConfig.optionsSnapshot;
		const currentOptions = pickOptions(options, hookContext.reEval.options);
		const changedKeys = hookContext.reEval.options.filter((key) => !foundry.utils.objectsEqual(currentOptions[key], snapshot[key]));
		const changed = _categorizeChangedOptionKeys(changedKeys);
		const flagReEvalOn = hookContext?.reEval?.flagReEvalOn ?? ['targeting', 'rollProfile', 'damageTyping', 'scaling', 'other'];
		const requiresFlagReEvaluation = changedKeys.length > 0 && flagReEvalOn.some((category) => changed?.[category]);
		ac5eConfig.reEval ??= {};
		ac5eConfig.reEval.useConfigSnapshot = snapshot;
		ac5eConfig.reEval.useConfigMatches = changedKeys.length === 0;
		ac5eConfig.reEval.useConfigChangedKeys = changedKeys;
		ac5eConfig.reEval.changed = changed;
		ac5eConfig.reEval.canReuseUseBaseline = !requiresFlagReEvaluation;
		ac5eConfig.reEval.requiresFlagReEvaluation = requiresFlagReEvaluation;
		if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers'))
			console.warn('AC5E getConfig use snapshot', {
				hookType,
				changedKeys,
				changed,
				flagReEvalOn,
				requiresFlagReEvaluation,
				useConfigMatches: ac5eConfig.reEval.useConfigMatches,
			});
		if (_debugFlagEnabled('checksReuse', 'debugChecksReuse'))
			console.warn('AC5E getConfig reEval decision', {
				hookType,
				policy: hookContext?.reEval?.policyName,
				phase: hookContext?.reEval?.phase,
				changedKeys,
				changed,
				requiresFlagReEvaluation,
				canReuseUseBaseline: ac5eConfig.reEval.canReuseUseBaseline,
			});
	}
	if (hookContext?.reEval?.options?.length) {
		const currentOptions = pickOptions(options, hookContext.reEval.options);
		ac5eConfig.reEval ??= {};
		ac5eConfig.reEval.currentOptions = currentOptions;
		ac5eConfig.reEval.optionKeys = hookContext.reEval.options;
		if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers')) console.warn('AC5E getConfig reEval options', { hookType, currentOptions });
		if (!foundry.utils.isEmpty(currentOptions)) {
			foundry.utils.mergeObject(options, currentOptions, { inplace: true });
			foundry.utils.mergeObject(ac5eConfig.options, currentOptions, { inplace: true });
			if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers')) console.warn('AC5E getConfig reEval applied', { hookType, currentOptions });
		}
	}
	if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers')) {
		console.warn('AC5E getConfig layers', {
			hookType,
			useConfig,
			hookContext,
			dialogContext,
			messageId: options?.messageId,
			originatingMessageId: options?.originatingMessageId,
		});
	}

	const { skipDialogAdvantage, skipDialogDisadvantage, skipDialogNormal } = ac5eConfig.preAC5eConfig;

	const returnEarly = skipDialogNormal && (skipDialogAdvantage || skipDialogDisadvantage);

	if (returnEarly) {
		ac5eConfig.returnEarly = true;
		if (skipDialogAdvantage) {
			if (hookType === 'damage') {
				config.isCritical = true;
				ac5eConfig.subject.critical.push(_localize('AC5E.OverrideCritical'));
			} else {
				config.advantage = true;
				ac5eConfig.subject.advantage.push(_localize('AC5E.OverrideAdvantage'));
				config.disadvantage = false;
			}
		}
		if (skipDialogDisadvantage) {
			if (hookType === 'damage') {
				config.isCritical = false;
				ac5eConfig.subject.noCritical.push(_localize('AC5E.OverrideNoCritical'));
			} else {
				config.disadvantage = true;
				ac5eConfig.subject.disadvantage.push(_localize('AC5E.OverrideDisadvantage'));
				config.advantage = false;
			}
		}
		if (settings.debug) console.warn('AC5E_getConfig returning early', { ac5eConfig });
		return ac5eConfig;
	} else {
		if (skipDialogAdvantage) {
			if (hookType === 'damage') ac5eConfig.subject.critical.push(_localize('AC5E.CriticalKeypress'));
			else ac5eConfig.subject.advantage.push(_localize('AC5E.AdvantageKeypress'));
		}
		if (skipDialogDisadvantage) {
			if (hookType === 'damage') ac5eConfig.subject.noCritical.push(_localize('AC5E.NoCriticalKeypress'));
			else ac5eConfig.subject.disadvantage.push(_localize('AC5E.DisadvantageKeypress'));
		}
	}

	// const actorSystemRollMode = [];
	const { adv, dis } = getSystemRollConfig({ actor, options, hookType, ac5eConfig });
	const midiAttackAdvAttribution = midiRoller ? _getMidiAttackAttributionEntries(config?.workflow, 'ADV') : [];
	const midiAttackDisAttribution = midiRoller ? _getMidiAttackAttributionEntries(config?.workflow, 'DIS') : [];
	const midiAbilityAdvAttribution = midiRoller && ['check', 'save'].includes(hookType) ? _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, 'ADV') : [];
	const midiAbilityDisAttribution = midiRoller && ['check', 'save'].includes(hookType) ? _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, 'DIS') : [];
	const midiAbilityFailAttribution = midiRoller && ['check', 'save'].includes(hookType) ? _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, 'FAIL') : [];
	const midiAbilitySuccessAttribution =
		midiRoller && ['check', 'save'].includes(hookType) ? _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, 'SUCCESS') : [];
	const hasMidiAttackAdvAttribution = midiAttackAdvAttribution.length > 0;
	const hasMidiAttackDisAttribution = midiAttackDisAttribution.length > 0;
	const hasMidiAbilityAdvAttribution = midiAbilityAdvAttribution.length > 0;
	const hasMidiAbilityDisAttribution = midiAbilityDisAttribution.length > 0;
	const hasMidiAdvAttribution = hookType === 'attack' ? hasMidiAttackAdvAttribution : ['check', 'save'].includes(hookType) ? hasMidiAbilityAdvAttribution : false;
	const hasMidiDisAttribution = hookType === 'attack' ? hasMidiAttackDisAttribution : ['check', 'save'].includes(hookType) ? hasMidiAbilityDisAttribution : false;
	const midiAdvAttribution = [...new Set((hookType === 'attack' ? midiAttackAdvAttribution : midiAbilityAdvAttribution).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
	const midiDisAttribution = [...new Set((hookType === 'attack' ? midiAttackDisAttribution : midiAbilityDisAttribution).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
	ac5eConfig.subject.midiAdvantage = midiAdvAttribution;
	ac5eConfig.subject.midiDisadvantage = midiDisAttribution;
	ac5eConfig.subject.midiFail = midiAbilityFailAttribution;
	ac5eConfig.subject.midiSuccess = midiAbilitySuccessAttribution;

	if (!options.preConfigInitiative) {
		if (
			hookType !== 'damage' &&
			!skipDialogAdvantage &&
			!adv &&
			((config.advantage && !midiRoller) || ac5eConfig.preAC5eConfig.midiOptions?.advantage || hasMidiAdvAttribution)
		) {
			if (midiRoller) {
				if (midiAdvAttribution.length) ac5eConfig.subject.advantage.push(...midiAdvAttribution);
				else ac5eConfig.subject.advantage.push(`${roller} ${_localize('AC5E.Flags')}`);
			} else ac5eConfig.subject.advantage.push(`${roller} ${_localize('AC5E.Flags')}`);
		}
		if (
			hookType !== 'damage' &&
			!skipDialogAdvantage &&
			!dis &&
			((config.disadvantage && !midiRoller) || ac5eConfig.preAC5eConfig.midiOptions?.disadvantage || hasMidiDisAttribution)
		) {
			if (midiRoller) {
				if (midiDisAttribution.length) ac5eConfig.subject.disadvantage.push(...midiDisAttribution);
				else ac5eConfig.subject.disadvantage.push(`${roller} ${_localize('AC5E.Flags')}`);
			} else ac5eConfig.subject.disadvantage.push(`${roller} ${_localize('AC5E.Flags')}`);
		}
		if (!skipDialogAdvantage && (config.isCritical || ac5eConfig.preAC5eConfig.midiOptions?.isCritical)) ac5eConfig.subject.critical.push(`${roller} ${_localize('AC5E.Flags')}`);
	}

	if (settings.debug || ac5e.debug_getConfig) console.warn('AC5E_getConfig', { ac5eConfig });
	return ac5eConfig;
}

export function _getUseConfig({ options, config } = {}) {
	let useConfig = options?.originatingUseConfig ?? config?.options?.originatingUseConfig ?? null;
	let debugMeta = { source: useConfig ? 'options' : 'unknown' };
	const messageId = options?.originatingMessageId ?? options?.messageId ?? config?.options?.messageId ?? config?.messageId;
	const context = _resolveUseMessageContext({ messageId, originatingMessageId: options?.originatingMessageId });
	const { triggerMessage, originatingMessageId, originatingMessage, usageMessage, registryMessages } = context;
	if (!useConfig) {
		useConfig = context.useConfig;
		debugMeta = {
			source: useConfig ? 'message' : 'none',
			messageId,
			originatingMessageId,
			hasMessage: !!triggerMessage,
			registryCount: _collectionCount(registryMessages),
		};
		if (!useConfig) {
			const cacheEntry = _getUseConfigInflightCacheEntry([originatingMessageId, messageId]);
			if (cacheEntry?.useConfig) {
				useConfig = foundry.utils.duplicate(cacheEntry.useConfig);
				debugMeta = {
					...debugMeta,
					source: 'inflight-cache',
					cacheExpiresAt: cacheEntry.expiresAt,
				};
			}
		}
	}
	if (useConfig) {
		const dnd5eUseFlag = _getMessageDnd5eFlags(usageMessage) ?? _getMessageDnd5eFlags(originatingMessage);
		useConfig = foundry.utils.duplicate(useConfig);
		if (useConfig?.options?.originatingUseConfig !== undefined) delete useConfig.options.originatingUseConfig;
		if (dnd5eUseFlag) {
			useConfig.options ??= {};
			if (dnd5eUseFlag.use?.spellLevel !== undefined) useConfig.options.spellLevel ??= dnd5eUseFlag.use.spellLevel;
			if (dnd5eUseFlag.scaling !== undefined) useConfig.options.scaling ??= dnd5eUseFlag.scaling;
			if (Array.isArray(dnd5eUseFlag.use?.effects)) useConfig.options.useEffects ??= foundry.utils.duplicate(dnd5eUseFlag.use.effects);
			if (Array.isArray(dnd5eUseFlag.targets)) useConfig.options.targets ??= foundry.utils.duplicate(dnd5eUseFlag.targets);
			if (dnd5eUseFlag.activity) useConfig.options.activity ??= foundry.utils.duplicate(dnd5eUseFlag.activity);
			if (dnd5eUseFlag.item) useConfig.options.item ??= foundry.utils.duplicate(dnd5eUseFlag.item);
		}
	}
	if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers')) console.warn('AC5E getUseConfig', { useConfig, debugMeta });
	return useConfig;
}

export function _getHookConfig({ hookType, useConfig }) {
	const base =
		useConfig ?
			{
				options: foundry.utils.duplicate(useConfig.options ?? {}),
				bonuses: foundry.utils.duplicate(useConfig.bonuses ?? {}),
				extraDice: foundry.utils.duplicate(useConfig.extraDice ?? []),
				damageModifiers: foundry.utils.duplicate(useConfig.damageModifiers ?? []),
				parts: foundry.utils.duplicate(useConfig.parts ?? []),
				threshold: foundry.utils.duplicate(useConfig.threshold ?? []),
				fumbleThreshold: foundry.utils.duplicate(useConfig.fumbleThreshold ?? []),
			}
		:	null;
	const reEval = _getReEvalPolicy({ hookType, phase: 'hook' });
	if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers')) console.warn('AC5E getHookConfig', { hookType, useConfig, base, reEval });
	return { hookType, useConfig, base, reEval };
}

export function _getDialogConfig({ hookType, useConfig, hookContext }) {
	const reEval = _getReEvalPolicy({ hookType, phase: 'dialog' });
	if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers')) console.warn('AC5E getDialogConfig', { hookType, useConfig, hookContext, reEval });
	return { hookType, useConfig, hookContext, reEval };
}

function collectRollMode({ actor, mode, max, min, hookType, typeLabel, ac5eConfig, systemMode, type, modeCounts }) {
	const capitalizeHook = hookType.capitalize();
	if (mode > 0) {
		if (modeCounts?.override > 0) {
			ac5eConfig.subject.forcedAdvantage = [_localize('AC5E.ForcedAdvantage')];
			systemMode.override = modeCounts.override;
		} else if (modeCounts?.disadvantages.suppressed) {
			ac5eConfig.subject.noDisadvantage = [_localize('AC5E.NoDisadvantage')];
			systemMode.suppressed = 'noDis';
		} else {
			systemMode.adv++;
			if (!actor.hasConditionEffect(`ability${capitalizeHook}Advantage`)) ac5eConfig.subject.advantageNames.add(_localize(typeLabel));
			if (type === 'init' && !actor.hasConditionEffect('initiativeAdvantage')) ac5eConfig.subject.advantageNames.add(_localize(typeLabel));
		}
	}
	if (mode < 0) {
		if (modeCounts?.override < 0) {
			ac5eConfig.subject.forcedDisadvantage = [_localize('AC5E.ForcedDisadvantage')];
			systemMode.override = modeCounts.override;
		} else if (modeCounts?.advantages.suppressed) {
			ac5eConfig.subject.noAdvantage = [_localize('AC5E.NoAdvantage')];
			systemMode.suppressed = 'noAdv';
		} else {
			systemMode.dis++;
			//Do not add System Mode for stealth disadvantage; already added by name
			if (!actor.hasConditionEffect(`ability${capitalizeHook}Disadvantage`) && ac5eConfig?.options?.skill !== 'ste') ac5eConfig.subject.disadvantageNames.add(_localize(typeLabel));
			if (type === 'init' && !actor.hasConditionEffect('initiativeDisadvantage')) ac5eConfig.subject.disadvantageNames.add(_localize(typeLabel));
		}
	}
	if (max) ac5eConfig.subject.modifiers.push(`${_localize('DND5E.ROLL.Range.Maximum')} (${max})`);
	if (min) ac5eConfig.subject.modifiers.push(`${_localize('DND5E.ROLL.Range.Minimum')} (${min})`);
	return systemMode;
}

function getSystemRollConfig({ actor, options, hookType, ac5eConfig }) {
	if (!actor || hookType === 'damage' || hookType === 'use') return {};
	const systemMode = { adv: 0, dis: 0 };
	const autoArmorChecks = _autoArmor(actor);
	const { ability, skill, tool } = options || {};
	if (hookType === 'check') {
		if (skill) {
			if (skill === 'ste' && autoArmorChecks.hasStealthDisadvantage)
				ac5eConfig.subject.disadvantageNames.add(`${_localize(autoArmorChecks.hasStealthDisadvantage)} (${_localize('ItemEquipmentStealthDisav')})`);
			const { mode, max, min, modeCounts } = getActorSkillRollObject({ actor, skill }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
		}
		if (tool) {
			const { mode, max, min, modeCounts } = getActorToolRollObject({ actor, tool }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
		}
		if (options.isInitiative) {
			const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'init' }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, type: 'init', modeCounts });
		}
	}
	if (ability && ['check', 'save'].includes(hookType)) {
		if (options.isConcentration) {
			if (_hasItem(actor, _localize('AC5E.WarCaster'))) {
				ac5eConfig.subject.advantage.push(_localize('AC5E.WarCaster'));
			}
			const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'concentration' }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
		} else {
			const { mode, max, min, modeCounts } = getActorAbilityRollObject({ actor, ability, hookType }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
		}
	}
	if (options.isDeathSave && hookType === 'save') {
		const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'death' }) || {};
		collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
	}
	if (autoArmorChecks.notProficient && ['dex', 'str'].includes(ability)) {
		ac5eConfig.subject.disadvantageNames.add(`${_localize(autoArmorChecks.notProficient)} (${_localize('NotProficient')})`);
		systemMode.dis++;
	}
	if (_autoEncumbrance(actor, ability)) {
		ac5eConfig.subject.disadvantage.push(_i18nConditions('HeavilyEncumbered'));
		systemMode.dis++;
	}
	if (settings.debug) console.warn('AC5E_getSystemRollConfig', { ac5eConfig });
	return systemMode;
}

export function getConcOrDeathOrInitRollObject({ actor, type }) {
	return actor?.system?.attributes?.[type]?.roll || {};
}

export function getActorAbilityRollObject({ actor, hookType, ability }) {
	return actor?.system?.abilities?.[ability]?.[hookType]?.roll;
}

export function getActorSkillRollObject({ actor, skill }) {
	return actor?.system?.skills?.[skill]?.roll;
}

export function getActorToolRollObject({ actor, tool }) {
	return actor?.system?.tools?.[tool]?.roll;
}

export function _setAC5eProperties(ac5eConfig, config, dialog, message) {
	if (globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.setAC5eProperties || settings.debug) console.warn('AC5e helpers._setAC5eProperties', { ac5eConfig, config, dialog, message });

	if (ac5eConfig.hookType === 'use') {
		const safeUseConfig = _getSafeUseConfig(ac5eConfig);
		const ac5eConfigDialog = { [Constants.MODULE_ID]: safeUseConfig };
		if (config) foundry.utils.mergeObject(config, ac5eConfigDialog);
		_setMessageFlagScope(message, Constants.MODULE_ID, safeUseConfig.options ?? {}, { merge: false });
		if (globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.setAC5eProperties || settings.debug) console.warn('AC5e post helpers._setAC5eProperties for preActivityUse', { ac5eConfig, config, dialog, message });
		return;
	}
	ac5eConfig.subject.advantageNames = [...ac5eConfig.subject.advantageNames];
	ac5eConfig.subject.disadvantageNames = [...ac5eConfig.subject.disadvantageNames];
	ac5eConfig.opponent.advantageNames = [...ac5eConfig.opponent.advantageNames];
	ac5eConfig.opponent.disadvantageNames = [...ac5eConfig.opponent.disadvantageNames];

	const safeDialogConfig = _getSafeDialogConfig(ac5eConfig);
	const ac5eConfigDialog = { [Constants.MODULE_ID]: safeDialogConfig };
	if (dialog?.options) dialog.options.classes = dialog.options.classes?.concat('ac5e') ?? ['ac5e'];
	// @to-do: re-evaluate if we need extra fields beyond system flags (e.g., targets already live under flags.dnd5e).
	// @todo: replace cached tooltip HTML with structured flag payload and regenerate tooltip content from message flags at render time.
	const optionsSnapshot = pickOptions(ac5eConfig.options ?? {}, ['ability', 'attackMode', 'skill', 'tool', 'defaultDamageType', 'damageTypes', 'distance']);
	const ac5eConfigMessage = {
		[Constants.MODULE_ID]: {
			tooltipObj: ac5eConfig.tooltipObj,
			hookType: ac5eConfig.hookType,
			tokenId: ac5eConfig.tokenId,
			targetId: ac5eConfig.targetId,
			optionsSnapshot,
		},
	};

	if (config?.rolls?.[0]?.options) foundry.utils.mergeObject(config.rolls[0].options, ac5eConfigDialog);
	else if (config) foundry.utils.mergeObject(config, ac5eConfigDialog);
	if (message && typeof message === 'object') _setMessageFlagScope(message, Constants.MODULE_ID, ac5eConfigMessage[Constants.MODULE_ID], { merge: true });
	if (globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.setAC5eProperties || settings.debug) console.warn('AC5e post helpers._setAC5eProperties', { ac5eConfig, config, dialog, message });
}

export function _getSafeUseConfig(ac5eConfig) {
	const options = foundry.utils.duplicate(ac5eConfig?.options ?? {});
	const toDocumentRef = (value) => {
		if (!value) return null;
		if (typeof value === 'string' && value.includes('.')) {
			return {
				id: value.split('.').at(-1),
				type: undefined,
				uuid: value,
			};
		}
		const uuid = value?.uuid;
		if (!uuid || typeof uuid !== 'string') return null;
		return {
			id: value?.id ?? value?._id ?? uuid.split('.').at(-1),
			type: value?.type,
			uuid,
		};
	};
	const activityRef = toDocumentRef(options.activity);
	const itemRef = toDocumentRef(options.item) ?? toDocumentRef(options.activity?.item);
	if (activityRef) options.activity = activityRef;
	else delete options.activity;
	if (itemRef) options.item = itemRef;
	else delete options.item;
	delete options.ammo;
	delete options.ammunition;
	delete options.originatingUseConfig;
	delete options._ac5eHookChecksCache;
	for (const key of Object.keys(options)) {
		if (key.startsWith('_')) delete options[key];
	}
	const optionsSnapshot = pickOptions(options, ['ability', 'attackMode', 'skill', 'tool', 'targets', 'distance', 'defaultDamageType', 'damageTypes', 'riderStatuses', 'scaling', 'spellLevel']);
	const sanitizeBonuses = (entries = []) =>
		Array.isArray(entries) ?
			entries.map((entry) => ({
				id: entry?.id,
				label: entry?.label ?? entry?.name,
				name: entry?.name,
				effectUuid: entry?.effectUuid,
				changeIndex: entry?.changeIndex,
				hook: entry?.hook,
				mode: entry?.mode,
				optin: !!entry?.optin,
				target: entry?.target,
				requiredDamageTypes: foundry.utils.duplicate(entry?.requiredDamageTypes ?? []),
				values: foundry.utils.duplicate(entry?.values ?? []),
			}))
		:	[];

	return {
		hookType: ac5eConfig?.hookType,
		tokenId: ac5eConfig?.tokenId,
		targetId: ac5eConfig?.targetId,
		isCritical: ac5eConfig?.isCritical ?? false,
		isFumble: ac5eConfig?.isFumble ?? false,
		options,
		optionsSnapshot,
		bonuses: {
			subject: sanitizeBonuses(ac5eConfig?.subject?.bonus),
			opponent: sanitizeBonuses(ac5eConfig?.opponent?.bonus),
		},
		parts: foundry.utils.duplicate(ac5eConfig?.parts ?? []),
		damageModifiers: foundry.utils.duplicate(ac5eConfig?.damageModifiers ?? []),
		extraDice: foundry.utils.duplicate(ac5eConfig?.extraDice ?? []),
		threshold: foundry.utils.duplicate(ac5eConfig?.threshold ?? []),
		fumbleThreshold: foundry.utils.duplicate(ac5eConfig?.fumbleThreshold ?? []),
		preAC5eConfig: {
			adv: ac5eConfig?.preAC5eConfig?.adv ?? null,
			dis: ac5eConfig?.preAC5eConfig?.dis ?? null,
			wasCritical: ac5eConfig?.preAC5eConfig?.wasCritical ?? null,
		},
	};
}

export function _getSafeDialogConfig(ac5eConfig) {
	const safe = foundry.utils.duplicate(ac5eConfig ?? {});
	if (safe?.options && typeof safe.options === 'object') {
		delete safe.options.activity;
		delete safe.options.ammo;
		delete safe.options.ammunition;
		delete safe.options.originatingUseConfig;
		delete safe.options._ac5eHookChecksCache;
		for (const key of Object.keys(safe.options)) {
			if (key.startsWith('_')) delete safe.options[key];
		}
	}
	delete safe.originatingUseConfig;
	delete safe.useConfig;
	delete safe.useConfigBase;
	delete safe.hookContext;
	delete safe.dialogContext;
	if (safe?.reEval && typeof safe.reEval === 'object') {
		delete safe.reEval.useConfigSnapshot;
		delete safe.reEval.currentOptions;
	}
	return safe;
}

export function _mergeUseOptions(targetOptions, useOptions) {
	if (!targetOptions || !useOptions) return;
	const allowlist = ['ability', 'attackMode', 'defaultDamageType', 'damageTypes', 'hook', 'mastery', 'riderStatuses', 'scaling', 'skill', 'spellLevel', 'tool', 'targets', 'useEffects'];
	const filtered = {};
	for (const key of allowlist) {
		if (useOptions[key] !== undefined) filtered[key] = useOptions[key];
	}
	if (!Object.keys(filtered).length) return;
	for (const [key, value] of Object.entries(filtered)) {
		if (!Array.isArray(value)) continue;
		const existing = targetOptions[key];
		if (!existing || (Array.isArray(existing) && existing.length === 0 && value.length)) {
			targetOptions[key] = foundry.utils.duplicate(value);
		}
	}
	for (const [key, value] of Object.entries(filtered)) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
		const existing = targetOptions[key];
		if (!existing || (typeof existing === 'object' && !Array.isArray(existing) && Object.keys(existing).length === 0 && Object.keys(value).length)) {
			targetOptions[key] = foundry.utils.duplicate(value);
		}
	}
	foundry.utils.mergeObject(targetOptions, filtered, { overwrite: false });
}

function pickOptions(source, keys) {
	if (!source || !Array.isArray(keys)) return {};
	const picked = {};
	for (const key of keys) {
		if (source[key] !== undefined) picked[key] = source[key];
	}
	return picked;
}

const REEVAL_POLICY_BY_HOOK = {
	attack: {
		options: ['targets', 'distance', 'ability', 'attackMode', 'defaultDamageType', 'damageTypes', 'riderStatuses', 'mastery'],
		flagReEvalOn: ['targeting', 'rollProfile', 'damageTyping', 'scaling', 'other'],
	},
	damage: {
		options: ['targets', 'distance', 'ability', 'attackMode', 'defaultDamageType', 'damageTypes', 'riderStatuses', 'mastery'],
		flagReEvalOn: ['targeting', 'rollProfile', 'damageTyping', 'scaling', 'other'],
	},
	save: {
		options: ['targets', 'distance', 'ability', 'defaultDamageType', 'damageTypes', 'riderStatuses'],
		flagReEvalOn: ['targeting', 'rollProfile', 'damageTyping', 'scaling', 'other'],
	},
	check: {
		options: ['targets', 'distance', 'ability', 'skill', 'tool'],
		flagReEvalOn: ['targeting', 'rollProfile', 'other'],
	},
	use: {
		options: ['targets', 'distance', 'ability', 'attackMode', 'skill', 'tool', 'defaultDamageType', 'damageTypes', 'riderStatuses', 'scaling', 'spellLevel'],
		flagReEvalOn: ['targeting', 'rollProfile', 'damageTyping', 'scaling', 'other'],
	},
	default: {
		options: ['targets', 'distance', 'ability', 'attackMode', 'skill', 'tool', 'defaultDamageType', 'damageTypes', 'riderStatuses'],
		flagReEvalOn: ['targeting', 'rollProfile', 'damageTyping', 'scaling', 'other'],
	},
};

function _getReEvalPolicy({ hookType, phase = 'hook' } = {}) {
	const base = REEVAL_POLICY_BY_HOOK[hookType] ?? REEVAL_POLICY_BY_HOOK.default;
	let options = [...base.options];
	if (phase === 'dialog') options = options.filter((key) => key !== 'riderStatuses');
	return {
		policyName: hookType in REEVAL_POLICY_BY_HOOK ? hookType : 'default',
		phase,
		options: [...new Set(options)],
		flagReEvalOn: [...base.flagReEvalOn],
	};
}

function _getReEvalOptionKeys({ hookType, phase = 'hook' } = {}) {
	return _getReEvalPolicy({ hookType, phase }).options;
}

function _categorizeChangedOptionKeys(changedKeys = []) {
	const keys = new Set(changedKeys);
	const known = new Set(['targets', 'distance', 'ability', 'attackMode', 'skill', 'tool', 'mastery', 'defaultDamageType', 'damageTypes', 'riderStatuses', 'spellLevel', 'scaling']);
	return {
		targeting: ['targets', 'distance'].some((key) => keys.has(key)),
		rollProfile: ['ability', 'attackMode', 'skill', 'tool', 'mastery'].some((key) => keys.has(key)),
		damageTyping: ['defaultDamageType', 'damageTypes', 'riderStatuses'].some((key) => keys.has(key)),
		scaling: ['spellLevel', 'scaling'].some((key) => keys.has(key)),
		other: changedKeys.some((key) => !known.has(key)),
	};
}

function _buildBaseConfig(config, dialog, hookType, tokenId, targetId, options, reEval) {
	const areKeysPressed = game.system.utils.areKeysPressed;
	const token = canvas.tokens.get(tokenId);
	const actor = token?.actor;
	const ac5eConfig = {
		hookType,
		tokenId,
		targetId,
		isOwner: token?.document.isOwner,
		hasPlayerOwner: token?.document.hasPlayerOwner, //check again if it needs token.actor.hasPlayerOwner; what happens for Wild Shape?
		ownership: actor?.ownership,
		subject: {
			advantage: [],
			advantageNames: new Set(),
			midiAdvantage: [],
			suppressedStatuses: [],
			noAdvantage: [],
			disadvantage: [],
			disadvantageNames: new Set(),
			midiDisadvantage: [],
			noDisadvantage: [],
			fail: [],
			midiFail: [],
			bonus: [],
			critical: [],
			noCritical: [],
			success: [],
			midiSuccess: [],
			fumble: [],
			modifiers: [],
			criticalThreshold: [],
			fumbleThreshold: [],
			targetADC: [],
			extraDice: [],
			diceUpgrade: [],
			diceDowngrade: [],
			range: [],
			rangeNotes: [],
		},
		opponent: {
			advantage: [],
			advantageNames: new Set(),
			suppressedStatuses: [],
			noAdvantage: [],
			disadvantage: [],
			disadvantageNames: new Set(),
			noDisadvantage: [],
			fail: [],
			bonus: [],
			critical: [],
			noCritical: [],
			success: [],
			fumble: [],
			modifiers: [],
			criticalThreshold: [],
			fumbleThreshold: [],
			targetADC: [],
			extraDice: [],
			diceUpgrade: [],
			diceDowngrade: [],
			range: [],
		},
		options,
		parts: [],
		targetADC: [],
		extraDice: [],
		threshold: [],
		fumbleThreshold: [],
		damageModifiers: [],
		modifiers: {},
		preAC5eConfig: {
			// fastForward: hookType !== 'damage' ? areKeysPressed(config.event, 'skipDialogNormal') : hookType === 'damage' ? areKeysPressed(config.event, 'skipDialogNormal') || areKeysPressed(config.event, 'skipDialogDisadvantage') : false,
			skipDialogAdvantage: areKeysPressed(config.event, 'skipDialogAdvantage'),
			skipDialogDisadvantage: areKeysPressed(config.event, 'skipDialogDisadvantage'),
			skipDialogNormal: areKeysPressed(config.event, 'skipDialogNormal'),
		},
		returnEarly: false,
	};
	const persistedOptins =
		config?.options?.[Constants.MODULE_ID]?.optinSelected ??
		config?.[Constants.MODULE_ID]?.optinSelected ??
		config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.optinSelected ??
		dialog?.config?.options?.[Constants.MODULE_ID]?.optinSelected ??
		dialog?.config?.[Constants.MODULE_ID]?.optinSelected ??
		dialog?.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.optinSelected;
	const persistedChanceRolls =
		config?.options?.[Constants.MODULE_ID]?.chanceRolls ??
		config?.[Constants.MODULE_ID]?.chanceRolls ??
		config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.chanceRolls ??
		dialog?.config?.options?.[Constants.MODULE_ID]?.chanceRolls ??
		dialog?.config?.[Constants.MODULE_ID]?.chanceRolls ??
		dialog?.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.chanceRolls;
	const parseOptinsFromFormObject = (formObject = {}) => {
		if (!formObject || typeof formObject !== 'object') return {};
		const parsed = {};
		const nested = formObject.ac5eOptins;
		if (nested && typeof nested === 'object') {
			for (const [id, value] of Object.entries(nested)) {
				if (value) parsed[id] = true;
			}
		}
		for (const [key, value] of Object.entries(formObject)) {
			if (!key.startsWith('ac5eOptins.')) continue;
			const id = key.slice('ac5eOptins.'.length);
			if (id && value) parsed[id] = true;
		}
		return parsed;
	};
	const formOptins = {
		...parseOptinsFromFormObject(config?.formData?.object),
		...parseOptinsFromFormObject(config?.options?.formData?.object),
		...parseOptinsFromFormObject(config?.options),
	};
	const resolvedOptins =
		persistedOptins && typeof persistedOptins === 'object' ? foundry.utils.duplicate(persistedOptins)
		: Object.keys(formOptins).length ? formOptins
		: null;
	if (resolvedOptins) ac5eConfig.optinSelected = resolvedOptins;
	if (persistedChanceRolls && typeof persistedChanceRolls === 'object') ac5eConfig.chanceRolls = foundry.utils.duplicate(persistedChanceRolls);
	ac5eConfig.originatingMessageId = options?.originatingMessageId;
	ac5eConfig.originatingUseConfig = undefined;
	if (reEval) ac5eConfig.reEval = reEval;
	const wasCritical = config.isCritical || ac5eConfig.preAC5eConfig.midiOptions?.isCritical || ac5eConfig.preAC5eConfig.critKey;
	ac5eConfig.preAC5eConfig.wasCritical = wasCritical;
	if (options.skill || options.tool) ac5eConfig.title = dialog?.options?.window?.title;
	const midiRoller = _activeModule('midi-qol');
	const rsrRoller = _activeModule('ready-set-roll-5e');
	const roller =
		midiRoller ? 'MidiQOL'
		: rsrRoller ? 'RSR'
		: 'Core';
	if (midiRoller) {
		const midiOptions = config.midiOptions ?? {};
		const { workflow, ...safeMidiOptions } = midiOptions; // strips workflow before any cloning; Issue https://github.com/thatlonelybugbear/automated-conditions-5e/issues/696
		ac5eConfig.preAC5eConfig.midiOptions = foundry.utils.duplicate(safeMidiOptions); //otherwise Error: Cannot set property isTrusted of #<PointerEvent> which has only a getter
	}
	ac5eConfig.roller = roller;
	ac5eConfig.preAC5eConfig.adv = config.advantage;
	ac5eConfig.preAC5eConfig.dis = config.disadvantage;
	return { ac5eConfig, token, actor, midiRoller, roller };
}

export function _activeModule(moduleID) {
	return game.modules.get(moduleID)?.active;
}

export function _canSee(source, target, status) {
	if (!source || !target) {
		if (settings.debug) console.warn('AC5e: No valid tokens for canSee check');
		return false;
	}
	if (source === target) {
		if (settings.debug) console.warn('AC5e: Source and target are the same');
		return true;
	}

	if (_activeModule('midi-qol')) return MidiQOL.canSee(source, target);

	const hasSight = source.document.sight.enabled; //source.hasSight
	const hasVision = source.vision; //can be undefined if the source isn't controlled at the time of the tests; can be the target of an attack etc, so won't be selected in this case or rolling without a token controlled.
	if (!hasSight || !hasVision) {
		_initializeVision(source);
		console.warn(`${Constants.MODULE_NAME_SHORT}._canSee(): Initializing vision as the source token has no visionSource available; `, {
			source: source?.id,
			target: target?.id,
			visionSourceId: source.sourceId,
		});
	}

	const NON_SIGHT_CONSIDERED_SIGHT = ['blindsight'];
	const detectionModes = CONFIG.Canvas.detectionModes;
	const DETECTION_TYPES = { SIGHT: 0, SOUND: 1, MOVE: 2, OTHER: 3 };
	const { BASIC_MODE_ID } = game.version > '13' ? foundry.canvas.perception.DetectionMode : new DetectionMode();
	const sightDetectionModes = Object.keys(detectionModes).filter((d) => detectionModes[d].type === DETECTION_TYPES.SIGHT || NON_SIGHT_CONSIDERED_SIGHT.includes(d));

	const matchedModes = new Set();
	const t = Math.min(target.w, target.h) / 4;
	const targetPoint = target.center;
	const offsets =
		t > 0 ?
			[
				[0, 0],
				[-t, -t],
				[-t, t],
				[t, t],
				[t, -t],
				[-t, 0],
				[t, 0],
				[0, -t],
				[0, t],
			]
		:	[[0, 0]];
	const tests = offsets.map((o) => ({
		point: new PIXI.Point(targetPoint.x + o[0], targetPoint.y + o[1]),
		elevation: target?.document.elevation ?? 0,
		los: new Map(),
	}));
	const config = { tests, object: target };

	const tokenDetectionModes = normalizeDetectionModes(source.detectionModes);
	let validModes = new Set();

	const sourceBlinded = source.actor?.statuses.has('blinded');
	const targetInvisible = target.actor?.statuses.has('invisible');
	const targetEthereal = target.actor?.statuses.has('ethereal');
	if (!status && !sourceBlinded && !targetInvisible && !targetEthereal) {
		validModes = new Set(sightDetectionModes);
		const lightSources = canvas?.effects?.lightSources;
		for (const lightSource of lightSources ?? []) {
			if (!lightSource.active || lightSource.data.disabled) continue;
			const result = lightSource.testVisibility?.(config);
			if (result === true) matchedModes.add(detectionModes.lightPerception?.id);
		}
	} else if (status === 'blinded' || sourceBlinded) {
		validModes = new Set(['blindsight', 'seeAll' /*'feelTremor'*/]);
	} else if (status === 'invisible' || status === 'ethereal' || targetInvisible || targetEthereal) {
		validModes = new Set(['seeAll', 'seeInvisibility']);
	}
	for (const detectionMode of tokenDetectionModes) {
		if (!detectionMode.enabled || !detectionMode.range) continue;
		if (!validModes.has(detectionMode.id)) continue;
		const mode = detectionModes[detectionMode.id];
		const result = mode ? mode.testVisibility(source.vision, detectionMode, config) : false;
		if (result === true) matchedModes.add(mode.id);
	}
	if (settings.debug)
		console.warn(`${Constants.MODULE_NAME_SHORT}._canSee()`, { source: source?.id, target: target?.id, result: matchedModes, visionInitialized: !hasSight, sourceId: source.sourceId });
	if (!hasSight) canvas.effects?.visionSources.delete(source.sourceId); //remove initialized vision source only if the source doesn't have sight enabled in the first place!
	return Array.from(matchedModes).length > 0;
}

function normalizeDetectionModes(modes) {
	if (!modes) return [];

	if (!Array.isArray(modes)) {
		return Object.entries(modes).map(([id, data]) => ({
			id,
			...data,
		}));
	}
	return modes;
}

function _initializeVision(token) {
	token.document.sight.enabled = true;
	token.document._prepareDetectionModes();
	const sourceId = token.sourceId;
	token.vision = new CONFIG.Canvas.visionSourceClass({ sourceId, object: token });

	token.vision.initialize({
		x: token.center.x,
		y: token.center.y,
		elevation: token.document.elevation,
		radius: Math.clamp(token.sightRange, 0, canvas?.dimensions?.maxR ?? 0),
		externalRadius: token.externalRadius,
		angle: token.document.sight.angle,
		contrast: token.document.sight.contrast,
		saturation: token.document.sight.saturation,
		brightness: token.document.sight.brightness,
		attenuation: token.document.sight.attenuation,
		rotation: token.document.rotation,
		visionMode: token.document.sight.visionMode,
		// preview: !!token._original,
		color: token.document.sight.color?.toNearest(),
		blinded: token.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND),
	});
	if (!token.vision.los) {
		token.vision.shape = token.vision._createRestrictedPolygon();
		token.vision.los = token.vision.shape;
	}
	if (token.vision.visionMode) token.vision.visionMode.animated = false;
	canvas?.effects?.visionSources.set(sourceId, token.vision);
	return true;
}

export function _staticID(id) {
	id = `dnd5e${id}`;
	if (id.length >= 16) return id.substring(0, 16);
	return id.padEnd(16, '0');
}

export function _getActionType(activity, returnClassifications = false) {
	if (['mwak', 'msak', 'rwak', 'rsak'].includes(activity?.actionType)) return activity.actionType;
	let actionType = activity?.attack?.type;
	if (!actionType) return null;
	if (returnClassifications) return actionType;
	if (actionType.value === 'melee') {
		if (actionType.classification === 'weapon' || actionType.classification === 'unarmed') actionType = 'mwak';
		else if (actionType.classification === 'spell') actionType = 'msak';
		// else if (actionType.classification === 'unarmed') actionType = 'muak'; //to-do: is there any need for this??
	} else if (actionType.value === 'ranged') {
		if (actionType.classification === 'weapon' || actionType.classification === 'unarmed') actionType = 'rwak';
		else if (actionType.classification === 'spell') actionType = 'rsak';
		// else if (actionType.classification === 'unarmed') actionType = 'ruak'; //to-do: is there any need for this??
	} else actionType = undefined;
	return actionType;
}

export function _getEffectOriginToken(effect /* ActiveEffect */, type = 'id' /* token, id, uuid */) {
	if (!effect?.origin) return undefined;

	let origin = fromUuidSync(effect.origin);
	let actor = _resolveActorFromOrigin(origin);

	// Check if origin itself has an origin (chained origin), resolve again
	if (!actor && origin?.origin) {
		const deeperOrigin = fromUuidSync(origin.origin);
		actor = _resolveActorFromOrigin(deeperOrigin);
	}

	if (!actor) return undefined;
	const token = actor.token?.object || actor.getActiveTokens()[0];
	if (!token) return undefined;

	switch (type) {
		case 'id':
			return token.id;
		case 'uuid':
			return token.document.uuid;
		case 'token':
			return token;
		default:
			return undefined;
	}
}

export function _resolveActorFromOrigin(origin) {
	if (!origin) return undefined;

	// If origin is an ActiveEffect on an Item or Actor
	if (origin instanceof CONFIG.ActiveEffect.documentClass) {
		const parent = origin.parent;
		if (parent instanceof CONFIG.Item.documentClass) return parent.actor;
		if (parent instanceof CONFIG.Actor.documentClass) return parent;
	}

	// If origin is an Item or directly embedded in Actor
	if (origin.parent instanceof CONFIG.Item.documentClass) return origin.parent.actor;
	if (origin.parent instanceof CONFIG.Actor.documentClass) return origin.parent;

	return undefined;
}

export function _hasValidTargets(activity, targetCount, setting) {
	//will return true if the Item has an attack roll and targets are correctly set and selected, or false otherwise.
	if (!activity?.parent?.hasAttack) return true;
	const { affects, template } = activity?.target || {};
	const requiresTargeting = affects?.type || (!affects?.type && !template?.type);
	// const override = game.keyboard?.downKeys?.has?.('KeyU');
	const invalidTargetCount = requiresTargeting && targetCount !== 1;
	if (invalidTargetCount /* && !override*/) {
		sizeWarnings(targetCount, setting);
		return false;
	}
	return true;
}

function sizeWarnings(targetCount, setting) {
	//targetCount, by this point, can be either false or >1 so no need for other checks
	//setting 'source', 'enforce', 'warn' and we need to notify for cancelled rolls only if 'warn'. The rest are logged in console only.
	const keySuffix = setting === 'source' ? 'Source' : 'Enforce';
	const keyPrefix = targetCount ? 'MultipleTargets' : 'NoTargets';
	const translationKey = `AC5E.Targeting.${keyPrefix}Attack.${keySuffix}`;
	const message = _localize(translationKey);

	if (setting === 'warn') ui.notifications.warn(message);
	else console.warn(message);
}

export function _raceOrType(actor, dataType = 'race') {
	const systemData = actor?.system;
	if (!systemData?.details?.type) return {}; //needed for 5.1.x and some type of actors that might be on the canvas?!
	let data;
	if (actor.type === 'character' || actor.type === 'npc') {
		data = foundry.utils.duplicate(systemData.details.type); //{value, subtype, swarm, custom}
		data.race = systemData.details.race?.identifier ?? data.value; //{value, subtype, swarm, custom, race: raceItem.identifier ?? value}
		data.type = actor.type;
	} else if (actor.type === 'group') data = { type: 'group', value: systemData.type.value };
	else if (actor.type === 'vehicle') data = { type: 'vehicle', value: systemData.vehicleType };
	if (dataType === 'all') return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.toLocaleLowerCase() : v]));
	else return data[dataType]?.toLocaleLowerCase();
}

export function _generateAC5eFlags() {
	const moduleFlagScope = `flags.${Constants.MODULE_ID}`;
	const statusFlagKeys = [...new Set([...Object.keys(CONFIG?.DND5E?.conditionTypes ?? {}), 'bloodied'])].map((statusId) => `no${statusId.charAt(0).toUpperCase()}${statusId.slice(1)}`);
	const moduleFlags = new Set([
		`${moduleFlagScope}.crossbowExpert`,
		`${moduleFlagScope}.sharpShooter`,
		`${moduleFlagScope}.attack.criticalThreshold`,
		`${moduleFlagScope}.grants.attack.criticalThreshold`,
		`${moduleFlagScope}.aura.attack.criticalThreshold`,
		`${moduleFlagScope}.attack.fumbleThreshold`,
		`${moduleFlagScope}.grants.attack.fumbleThreshold`,
		`${moduleFlagScope}.aura.attack.fumbleThreshold`,
		`${moduleFlagScope}.attack.range`,
		`${moduleFlagScope}.grants.attack.range`,
		`${moduleFlagScope}.aura.attack.range`,
		`${moduleFlagScope}.range`,
		`${moduleFlagScope}.grants.range`,
		`${moduleFlagScope}.aura.range`,
		`${moduleFlagScope}.range.short`,
		`${moduleFlagScope}.grants.range.short`,
		`${moduleFlagScope}.aura.range.short`,
		`${moduleFlagScope}.range.long`,
		`${moduleFlagScope}.grants.range.long`,
		`${moduleFlagScope}.aura.range.long`,
		`${moduleFlagScope}.range.reach`,
		`${moduleFlagScope}.grants.range.reach`,
		`${moduleFlagScope}.aura.range.reach`,
		`${moduleFlagScope}.range.noLongDisadvantage`,
		`${moduleFlagScope}.grants.range.noLongDisadvantage`,
		`${moduleFlagScope}.aura.range.noLongDisadvantage`,
		`${moduleFlagScope}.range.longDisadvantage`,
		`${moduleFlagScope}.grants.range.longDisadvantage`,
		`${moduleFlagScope}.aura.range.longDisadvantage`,
		`${moduleFlagScope}.range.nearbyFoeDisadvantage`,
		`${moduleFlagScope}.grants.range.nearbyFoeDisadvantage`,
		`${moduleFlagScope}.aura.range.nearbyFoeDisadvantage`,
		`${moduleFlagScope}.range.nearbyFoes`,
		`${moduleFlagScope}.grants.range.nearbyFoes`,
		`${moduleFlagScope}.aura.range.nearbyFoes`,
		`${moduleFlagScope}.range.noNearbyFoeDisadvantage`,
		`${moduleFlagScope}.grants.range.noNearbyFoeDisadvantage`,
		`${moduleFlagScope}.aura.range.noNearbyFoeDisadvantage`,
		`${moduleFlagScope}.range.noNearbyFoes`,
		`${moduleFlagScope}.grants.range.noNearbyFoes`,
		`${moduleFlagScope}.aura.range.noNearbyFoes`,
		`${moduleFlagScope}.range.fail`,
		`${moduleFlagScope}.grants.range.fail`,
		`${moduleFlagScope}.aura.range.fail`,
		`${moduleFlagScope}.range.outOfRangeFail`,
		`${moduleFlagScope}.grants.range.outOfRangeFail`,
		`${moduleFlagScope}.aura.range.outOfRangeFail`,
		`${moduleFlagScope}.range.noFail`,
		`${moduleFlagScope}.grants.range.noFail`,
		`${moduleFlagScope}.aura.range.noFail`,
		`${moduleFlagScope}.range.noOutOfRangeFail`,
		`${moduleFlagScope}.grants.range.noOutOfRangeFail`,
		`${moduleFlagScope}.aura.range.noOutOfRangeFail`,
		`${moduleFlagScope}.damage.extraDice`,
		`${moduleFlagScope}.grants.damage.extraDice`,
		`${moduleFlagScope}.aura.damage.extraDice`,
		`${moduleFlagScope}.damage.diceUpgrade`,
		`${moduleFlagScope}.grants.damage.diceUpgrade`,
		`${moduleFlagScope}.aura.damage.diceUpgrade`,
		`${moduleFlagScope}.damage.diceDowngrade`,
		`${moduleFlagScope}.grants.damage.diceDowngrade`,
		`${moduleFlagScope}.aura.damage.diceDowngrade`,
		`${moduleFlagScope}.modifyAC`,
		`${moduleFlagScope}.grants.modifyAC`,
		`${moduleFlagScope}.aura.modifyAC`,
	]);
	for (const statusFlagKey of statusFlagKeys) {
		moduleFlags.add(`${moduleFlagScope}.${statusFlagKey}`);
		moduleFlags.add(`${moduleFlagScope}.grants.${statusFlagKey}`);
		moduleFlags.add(`${moduleFlagScope}.aura.${statusFlagKey}`);
	}

	const allModesActionTypes = ['all', 'attack', 'check', 'concentration', 'damage', 'death', 'initiative', 'save', 'skill', 'tool'];
	const noDamageNoInitiativeActionTypes = ['all', 'attack', 'check', 'concentration', 'death', 'save', 'skill', 'tool'];
	const failActionTypes = [...noDamageNoInitiativeActionTypes, 'use'];
	const noDamageActionTypes = ['all', 'attack', 'check', 'concentration', 'death', 'initiative', 'save', 'skill', 'tool'];
	const modifierActionTypes = ['attack', 'check', 'concentration', 'damage', 'death', 'initiative', 'save', 'skill', 'tool'];
	const modifyDCActionTypes = ['save', 'concentration', 'death', 'check', 'skill', 'tool'];
	const noCriticalActionTypes = ['all', 'attack', 'damage'];
	const actionTypesByMode = {
		advantage: allModesActionTypes,
		bonus: allModesActionTypes,
		critical: allModesActionTypes,
		disadvantage: allModesActionTypes,
		modifier: modifierActionTypes,
		modifyDC: modifyDCActionTypes,
		noAdvantage: allModesActionTypes,
		noCritical: noCriticalActionTypes,
		noDisadvantage: allModesActionTypes,
		fail: failActionTypes,
		fumble: noDamageActionTypes,
		success: allModesActionTypes,
	};
	const actionTypesByModeNoDamageSuccess = {
		...actionTypesByMode,
		success: noDamageNoInitiativeActionTypes,
	};
	const scopes = [
		{ type: 'source', prefix: moduleFlagScope, actionTypes: actionTypesByMode },
		{ type: 'grants', prefix: `${moduleFlagScope}.grants`, actionTypes: actionTypesByModeNoDamageSuccess },
		{ type: 'aura', prefix: `${moduleFlagScope}.aura`, actionTypes: actionTypesByModeNoDamageSuccess },
	];

	for (const scope of scopes) {
		for (const [mode, actionTypes] of Object.entries(scope.actionTypes)) {
			for (const actionType of actionTypes) moduleFlags.add(`${scope.prefix}.${actionType}.${mode}`);
		}
	}

	// Keep ACTIONTYPE entries for backwards compatibility, but not for damage-only dice up/down modes.
	const genericActionTypeModes = ['advantage', 'bonus', 'critical', 'disadvantage', 'fail', 'fumble', 'modifier', 'modifyDC', 'noAdvantage', 'noCritical', 'noDisadvantage', 'success'];
	for (const scope of scopes) {
		for (const mode of genericActionTypeModes) moduleFlags.add(`${scope.prefix}.ACTIONTYPE.${mode}`);
	}

	// DAE autocomplete should only expose canonical long-scope keys.
	return Array.from(moduleFlags).filter((key) => key.startsWith(`${moduleFlagScope}.`));
}

let tempDiv = null;

export function _getValidColor(color, fallback, user) {
	if (!color) return fallback;
	const lower = color.trim().toLowerCase();

	if (['false', 'none', 'null', '0'].includes(lower)) return lower;
	else if (['user', 'game.user.color'].includes(lower)) return user?.color?.css || fallback;
	else if (lower === 'default') return fallback;

	// Accept valid hex format directly
	if (/^#[0-9a-f]{6}$/i.test(lower)) return lower;

	// Use hidden div to resolve computed color
	if (!tempDiv) {
		tempDiv = document.createElement('div');
		tempDiv.style.display = 'none';
		document.body.appendChild(tempDiv);
	}

	tempDiv.style.color = color;
	const computedColor = window.getComputedStyle(tempDiv).color;

	const match = computedColor.match(/\d+/g);
	if (match && match.length >= 3) {
		return `#${match
			.slice(0, 3)
			.map((n) => parseInt(n).toString(16).padStart(2, '0'))
			.join('')}`;
	}

	return fallback;
}

/**
 * Safely evaluate a string expression within a controlled sandbox.
 * Supports:
 *  - mode="condition": returns boolean
 *  - mode="formula": returns Foundry roll formula string
 *  - Resolve actor contexts: rollingActor, opponentActor, targetActor, auraActor, effectOriginActor
 *  - Math.* and shorthand helpers (min, max, floor, etc.)
 *  - Fails safely to false if evaluation breaks
 */
export function _ac5eSafeEval({ expression, sandbox = {}, mode = 'condition', debug }) {
	if (!expression || typeof expression !== 'string') return undefined;
	if (expression.includes('game') || expression.includes('canvas')) throw new Error(`Roll.safeEval expression cannot contain game/canvas.`);

	debug ??= {};
	const debugLoggingEnabled = Boolean(ac5e?.devModeEnabled || ac5e?.debug.evaluations);
	debug.log = debugLoggingEnabled ? console.warn : undefined;

	if (mode === 'condition') return evaluateCondition(expression, sandbox, debug);
	if (mode === 'formula') return prepareRollFormula(expression, sandbox, debug);
	throw new Error(`Invalid mode for _ac5eSafeEval: ${mode}`);
}

export function _ac5eActorRollData(token) {
	const actor = token?.actor;
	if (!(actor instanceof CONFIG.Actor.documentClass)) return {};
	const actorData = actor.getRollData();
	actorData.currencyWeight = actor.system.currencyWeight;
	actorData.effects = actor.appliedEffects;
	actorData.equippedItems = { names: [], identifiers: [] };
	actorData.items = actor.items?.map((i) => {
		if (i.system?.equipped) {
			actorData.equippedItems.names.push(i.name);
			actorData.equippedItems.identifiers.push(i.identifier);
		}
		return { name: i.name, uuid: i.uuid, id: i.id, identifier: i.identifier, type: i.type, uses: i.system?.uses || {}, equipped: i.system?.equipped };
	});
	actorData.level = actorData.details?.level || actorData.details?.cr;
	actorData.levelCr = actorData.level;
	actorData.hasArmor = !!actorData.attributes?.ac?.equippedArmor;
	if (actorData.hasArmor) actorData[`hasArmor${actorData.attributes.ac.equippedArmor.system.type.value.capitalize()}`] = true;
	actorData.hasShield = !!actorData.attributes?.ac?.equippedShield;
	actorData.statuses = Array.from(actor?.statuses ?? []);
	actorData.statusesMap = Object.fromEntries(actorData.statuses.map((status) => [status, true]));
	actorData.type = actor.type;
	actorData.canMove = Object.values(actor.system?.attributes?.movement || {}).some((v) => typeof v === 'number' && v);
	actorData.creatureType = Array.from(new Set(Object.values(_raceOrType(actor, 'all')).filter(Boolean)));
	actorData.token = token;
	actorData.tokenSize = token.document.width * token.document.height;
	actorData.tokenElevation = token.document.elevation;
	actorData.tokenSenses = token.document.detectionModes;
	actorData.tokenUuid = token.document.uuid;
	actorData.uuid = token.actor.uuid;
	const active = game.combat?.active;
	const currentCombatant = active ? game.combat.combatant?.tokenId : null;
	actorData.isTurn = active && currentCombatant === token.id;
	actorData.combatTurn = active ? game.combat.turns.findIndex((combatant) => combatant.tokenId === token.id) : undefined;
	actorData.movementLastSegment =
		active && token.document.movementHistory?.filter((m) => m.movementId === token.document.movementHistory.at(-1).movementId).reduce((acc, c) => (acc += c.cost ?? 0), 0);
	actorData.movementTurn = active && token.document.movementHistory?.reduce((acc, c) => (acc += c.cost ?? 0), 0);
	return actorData;
}

export function _createEvaluationSandbox({ subjectToken, opponentToken, options }) {
	const sandbox = {
		...lazySandbox,
		_flatConstants: { ...lazySandbox._flatConstants }, // shallow copy is enough for boolean flags
	};
	const { ability, activity, distance, skill, tool } = options;
	const item = activity?.item;
	sandbox.rollingActor = {};
	sandbox.opponentActor = {};

	sandbox.rollingActor = _ac5eActorRollData(subjectToken) || {};
	sandbox.tokenId = subjectToken?.id;
	sandbox.tokenUuid = subjectToken?.document?.uuid;
	sandbox.actorId = subjectToken?.actor?.id;
	sandbox.actorUuid = subjectToken?.actor?.uuid;
	sandbox.canMove = sandbox.rollingActor?.canMove;
	sandbox.canSee = _canSee(subjectToken, opponentToken);

	sandbox.opponentActor = _ac5eActorRollData(opponentToken) || {};
	sandbox.opponentAC = opponentToken?.actor?.system?.attributes?.ac?.value;
	sandbox.opponentId = opponentToken?.id;
	sandbox.opponentUuid = opponentToken?.document?.uuid;
	sandbox.opponentActorId = opponentToken?.actor?.id;
	sandbox.opponentActorUuid = opponentToken?.actor?.uuid;
	sandbox.isSeen = _canSee(opponentToken, subjectToken);
	/* backwards compatibility */
	sandbox.targetActor = sandbox.opponentActor;
	sandbox.targetId = opponentToken?.id;
	/* end of backwards compatibility */

	const activityData = activity?.getRollData?.()?.activity || {};
	sandbox.activity = activityData;
	sandbox.ammunition = options.ammunition;
	sandbox.ammunitionName = options.ammunition?.name;
	sandbox.consumptionItemName = {};
	sandbox.consumptionItemIdentifier = {};
	activity?.consumption?.targets?.forEach(({ target }) => {
		if (target) {
			const targetItem = activity?.actor?.items.get(target);
			if (targetItem) {
				sandbox.consumptionItemName[targetItem.name] = true;
				sandbox.consumptionItemIdentifier[targetItem.identifier] = true;
			}
		}
	});
	sandbox.activity.ability = activity?.ability;
	sandbox.riderStatuses = options.riderStatuses || _getActivityEffectsStatusRiders(activity) || {};
	sandbox.hasAttack = !foundry.utils.isEmpty(activity?.attack);
	sandbox.hasDamage = !foundry.utils.isEmpty(activity?.damage?.parts);
	sandbox.hasHealing = !foundry.utils.isEmpty(activity?.healing);
	sandbox.hasSave = !foundry.utils.isEmpty(activity?.save);
	sandbox.hasCheck = !foundry.utils.isEmpty(activity?.check);
	sandbox.isSpell = activity?.isSpell;
	sandbox.isScaledScroll = activity?.isScaledScroll;
	sandbox.requiresSpellSlot = activity?.requiresSpellSlot;
	sandbox.spellcastingAbility = activity?.spellcastingAbility;
	sandbox.messageFlags = activity?.messageFlags;
	sandbox.activityName = activity ? { [activity.name]: true } : {};
	const actionType = activity?.getActionType?.(options.attackMode);
	sandbox.actionType = actionType ? { [actionType]: true } : {};
	sandbox.attackMode = options.attackMode ? { [options.attackMode]: true } : {};
	if (options.attackMode) sandbox._flatConstants[options.attackMode] = true; //backwards compatibility for attack mode directly in the sandbox
	sandbox.mastery = options.mastery ? { [options.mastery]: true } : {};
	sandbox.damageTypes = options.damageTypes;
	sandbox.defaultDamageType = options.defaultDamageType;
	if (!foundry.utils.isEmpty(options.damageTypes)) foundry.utils.mergeObject(sandbox._flatConstants, options.damageTypes); //backwards compatibility for damagetypes directly in the sandbox
	sandbox.activity.damageTypes = options.damageTypes;
	sandbox.activity.defaultDamageType = options.defaultDamageType;
	sandbox.activity.attackMode = options.attackMode;
	sandbox.activity.mastery = options.mastery;
	if (actionType) {
		sandbox._flatConstants[actionType] = true;
		sandbox.activity.actionType = actionType;
	}
	if (activity?.attack?.type) {
		sandbox._flatConstants[activity.attack.type.value] = true;
		sandbox._flatConstants[activity.attack.type.classification] = true;
	}
	if (!!activityData.activation?.type) sandbox._flatConstants[activityData.activation.type] = true;
	if (activityData?.type) sandbox._flatConstants[activityData.type] = true;

	//item data
	const itemData = item?.getRollData?.()?.item || {};
	sandbox.item = itemData;
	sandbox.item.uuid = item?.uuid;
	sandbox.item.id = item?.id;
	sandbox.itemType = item?.type;
	sandbox.isCantrip = item?.labels?.level === 'Cantrip' ?? options?.spellLevel === 0 ?? itemData?.level === 0;
	sandbox.itemIdentifier = item ? { [itemData.identifier]: true } : {};
	sandbox.itemName = item ? { [itemData.name]: true } : {};
	sandbox.item.hasAttack = item?.hasAttack;
	sandbox.item.hasSave = item?.system?.hasSave;
	sandbox.item.hasSummoning = item?.system?.hasSummoning;
	sandbox.item.hasLimitedUses = item?.system?.hasLimitedUses;
	sandbox.item.isHealing = item?.system?.isHealing;
	sandbox.item.isEnchantment = item?.system?.isEnchantment;
	sandbox.item.transferredEffects = item?.transferredEffects;
	sandbox.itemProperties = {};
	if (item) {
		sandbox._flatConstants[item.type] = true; // this is under Item5e#system#type 'weapon'/'spell' etc
		if (!!itemData.type?.value) sandbox._flatConstants[itemData.type.value] = true;
		if (itemData.school) sandbox._flatConstants[itemData.school] = true;
		const ammoProperties = sandbox.ammunition?.system?.properties;
		if (ammoProperties?.length && itemData?.properties) ammoProperties.forEach((p) => itemData.properties.add(p));
		itemData.properties?.filter((p) => (sandbox.itemProperties[p] = true) && (sandbox._flatConstants[p] = true));
	}

	const combat = game.combat;
	sandbox.combat = { active: combat?.active, round: combat?.round, turn: combat?.turn, current: combat?.current, turns: combat?.turns };
	sandbox.isTurn = sandbox.rollingActor.isTurn;
	sandbox.isOpponentTurn = sandbox.opponentActor.isTurn;
	sandbox.isTargetTurn = sandbox.isOpponentTurn; //backwards compatibility for changing the target to opponent for clarity.
	sandbox.movementLastSegment = sandbox.rollingActor.movementLastSegment; //backwards compatibility. Moved into _ac5eActorRollData
	sandbox.movementTurn = sandbox.rollingActor.movementTurn;

	sandbox.worldTime = game.time?.worldTime;
	sandbox.options = options;
	sandbox.ability = options.ability ? { [options.ability]: true } : {};
	sandbox.skill = options.skill ? { [options.skill]: true } : {};
	sandbox.tool = options.tool ? { [options.tool]: true } : {};
	if (options?.ability) sandbox._flatConstants[options.ability] = true;
	if (options?.skill) sandbox._flatConstants[options.skill] = true;
	if (options?.tool) sandbox._flatConstants[options.tool] = true;
	// in options there are options.isDeathSave options.isInitiative options.isConcentration
	sandbox.isConcentration = options?.isConcentration;
	sandbox.isDeathSave = options?.isDeathSave;
	sandbox.isInitiative = options?.isInitiative;
	sandbox.distance = options?.distance;
	sandbox.hook = options?.hook;
	sandbox.targets = options?.targets ?? [];
	sandbox.singleTarget = options?.targets?.length === 1 && true;
	sandbox.castingLevel = options.spellLevel ?? itemData?.level ?? null;
	sandbox.spellLevel = sandbox.castingLevel;
	//@to-do: check if it's better to retrieve as baseSpellLevel + scaling
	sandbox.baseSpellLevel = fromUuidSync(item?.uuid)?.system?.level;
	sandbox.scaling = options?.scaling ?? item?.flags?.dnd5e?.scaling ?? 0;
	sandbox.attackRollTotal = options?.d20?.attackRollTotal;
	sandbox.attackRollD20 = options?.d20?.attackRollD20;
	const attackRollOverAC = sandbox.attackRollTotal - sandbox.opponentAC;
	sandbox.attackRollOverAC = !isNaN(attackRollOverAC) ? attackRollOverAC : undefined;
	sandbox.hasAdvantage = options?.d20?.hasAdvantage;
	sandbox.hasDisadvantage = options?.d20?.hasDisadvantage;
	sandbox.isCritical = options?.d20?.isCritical;
	sandbox.isFumble = options?.d20?.isFumble;
	globalThis?.[Constants.MODULE_NAME_SHORT]?.contextKeywords?.applyToSandbox?.(sandbox);
	globalThis?.[Constants.MODULE_NAME_SHORT]?.usageRules?.applyToSandbox?.(sandbox);
	sandbox._baseConstants = { ...sandbox._flatConstants };

	if (sandbox.undefined || sandbox['']) {
		delete sandbox.undefined; //guard against sandbox.undefined = true being present
		delete sandbox[''];
		console.warn('AC5E sandbox.undefined detected!!!');
	}
	if (settings.debug || ac5e.logEvaluationData) console.log(`AC5E._createEvaluationSandbox logging the available data for hook "${sandbox.hook}":`, { evaluationData: sandbox });
	return sandbox;
}

export function _collectActivityDamageTypes(activity, options) {
	//use for pre damageRolls tests. We won't know what bonus active effects could be added at any point.
	if (!activity || !['attack', 'damage', 'heal', 'save'].includes(activity.type)) {
		options.defaultDamageType = {};
		options.damageTypes = {};
		return;
	}
	const returnDamageTypes = {};
	let returnDefaultDamageType = undefined;

	const partTypes = (part) => {
		if (part.types.size > 1) {
			console.warn('AC5E: Multiple damage types available for selection; cannot properly evaluate; damageTypes will grab the first of multiple ones');
		}
		const type = part.types.first();
		if (type) {
			if (!returnDefaultDamageType) returnDefaultDamageType = { [type]: true };
			returnDamageTypes[type] = true;
		}
		const formula = part.custom?.formula;
		if (formula && formula !== '') {
			const match = [...formula.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase()); //returns an Array of inner type strings from each [type];
			for (const m of match) {
				if (!returnDefaultDamageType) returnDefaultDamageType = { [m]: true };
				returnDamageTypes[m] = true;
			}
		}
	};

	const activityType = activity.type === 'heal' ? 'healing' : 'damage';
	if (activityType === 'healing') {
		const part = activity[activityType];
		partTypes(part);
	} else {
		for (const part of activity[activityType].parts) partTypes(part);
	}
	options.defaultDamageType = returnDefaultDamageType || {};
	options.damageTypes = returnDamageTypes;
	return;
}

export function _collectRollDamageTypes(rolls, options) {
	const damageTypes = {};
	const selectedDamageTypes = [];
	let defaultType = undefined;

	for (const roll of rolls) {
		const type = roll.options?.type;
		if (type) {
			if (!defaultType) defaultType = type;
			selectedDamageTypes.push(type);
			damageTypes[type] = true;
		}

		for (const part of roll.parts ?? []) {
			if (!part?.length) continue;
			const match = [...part.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase()); //returns an Array of inner type strings from each [type]
			for (const partType of match) {
				if (!defaultType) defaultType = partType;
				damageTypes[partType] = true;
			}
		}
	}
	const defaultDamageType = defaultType ? { [defaultType]: true } : {};
	if (options) {
		options.damageTypes = damageTypes;
		options.selectedDamageTypes = selectedDamageTypes;
		if (!options.defaultDamageType) options.defaultDamageType = defaultDamageType;
	} else return { damageTypes, defaultDamageType, selectedDamageTypes };
}

export function _getActivityEffectsStatusRiders(activity) {
	const statuses = {};
	// const riders = {};
	activity?.applicableEffects?.forEach((effect) => {
		Array.from(effect?.statuses).forEach((status) => (statuses[status] = true));
		effect.flags?.dnd5e?.riders?.statuses?.forEach((rider) => (statuses[rider] = true));
	});
	if (settings.debug) console.log('AC5E._getActivityEffectsStatusRiders:', { statuses });
	return statuses;
}

/**
 * Retrieve an Item or one of its activities from an actor.
 * @function _getItemOrActivity
 * @param {string} itemID - Identifier of the item to find. Matches against `name`, `identifier`, `id`, or `uuid`.
 * @param {string} [activityID] - Optional identifier of the activity to find within the resolved item.
 *                                Matches against `name`, `type`, `identifier` (needs MidiQOL), `id`, or `uuid`.
 * @param {Actor|string} [actor] - Actor to search within. Can be:
 *   - An Actor document,
 *   - An actor name,
 *   - An actor ID,
 *   - Or a UUID string (use this for unlinked actors).
 *   If omitted, falls back to the bound Actor from _createEvaluationSandbox (subjectToken.actor).
 *
 * @returns {Item|object} - Returns the matching Item if `activityID` is not provided.
 *                          Returns the matching Activity object if `activityID` is provided.
 *                          Returns an empty object `{}` if no match is found.
 *
 * @example
 * // For evaluation of ac5e flags, adds a bonus based on uses left of the Attack activity
 * flags.automated-conditions-5e.damage.bonus | Override | bonus=getItemOrActivity("Empowered Longsword", "Attack").uses.value;
 *
 * @example
 * // Use in macros to find an activity within an item
 * const attackActivity = ac5e.getItemOrActivity("item-id", "attack-id", actor);
 *
 * @example
 * // Resolve actor by name
 * const shield = ac5e.getItemOrActivity("Shield", null, "Bob the Fighter");
 */
export function _getItemOrActivity(itemID, activityID, actor) {
	if (actor && !(actor instanceof Actor)) {
		if (game.actors.getName(actor) instanceof Actor) actor = game.actors.getName(actor);
		else if (actor.includes('.')) actor = fromUuidSync(actor);
		else actor = game.actors.get(actor);
		if (!(actor instanceof Actor)) {
			actor = undefined;
			ui.notifications.warn('ac5e.getItemOrActivity warning: actor parameter provided is not in the right format, which is for linked actors either the Name or the id, and for unlinked the UUID');
		}
	}
	const item =
		actor ?
			actor.items?.find((i) => i.name === itemID || i.identifier === itemID || i.id === itemID || i.uuid === itemID)
		:	this.items?.find((i) => i.name === itemID || i.identifier === itemID || i.id === itemID || i.uuid === itemID); //this will be the 'ac5e' object always

	if (!item) return {};
	if (!activityID) return item;

	return item.system?.activities?.find((a) => a.name === activityID || a.type === activityID || a.identifier === activityID || a.id === activityID || a.uuid === activityID) || {};
}

export function _getTokenFromActor(actor) {
	let token;
	const tokenId = ChatMessage.getSpeaker({ actor })?.token;
	if (tokenId) token = canvas.tokens.get(tokenId);
	else token = null;
	if (!token && settings.tokenlessActorWarn) ui.notifications.warn(_localize('AC5E.TokenlessActorWarning.Text'));
	return token;
}

export function _safeFromUuidSync(value, { collection } = {}) {
	if (!value) return null;

	// Already Document
	if (value instanceof foundry.abstract.Document) return value;

	// UUID
	if (typeof value === 'string' && value.includes('.')) {
		return fromUuidSync(value, { strict: false }) ?? null;
	}

	// Plain ID + collection provided
	if (typeof value === 'string' && collection?.get) {
		return collection.get(value) ?? null;
	}

	return null;
}

export function _resolveUuidString(value) {
	if (typeof value === 'string') {
		const trimmed = value.trim();
		return trimmed.length ? trimmed : null;
	}
	if (value && typeof value === 'object') {
		const nestedUuid = value.uuid ?? value.document?.uuid ?? value.context?.uuid;
		if (typeof nestedUuid === 'string') {
			const trimmedNested = nestedUuid.trim();
			return trimmedNested.length ? trimmedNested : null;
		}
	}
	return null;
}

export function _isUuidLike(value) {
	const uuid = _resolveUuidString(value);
	if (!uuid) return false;
	try {
		foundry.utils.parseUuid(uuid);
		return true;
	} catch (_err) {
		return false;
	}
}
