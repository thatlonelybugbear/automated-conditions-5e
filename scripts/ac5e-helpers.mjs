import Constants from './ac5e-constants.mjs';
import { debugBenchmarkPerimeterGridSpaceCenters, getCachedDistanceCore, getPerimeterCenters } from './helpers/ac5e-helpers-distance.mjs';
import { evaluateCondition, prepareRollFormula } from './ac5e-parser.mjs';
import Settings from './ac5e-settings.mjs';

export const _sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function getResolvedD20BooleansFromMode(mode, fallback = {}) {
	const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE;
	if (typeof mode === 'number' && advModes) {
		if (mode === advModes.ADVANTAGE) return { advantage: true, disadvantage: false };
		if (mode === advModes.DISADVANTAGE) return { advantage: false, disadvantage: true };
		if (mode === advModes.NORMAL) return { advantage: true, disadvantage: true };
	}
	return {
		advantage: fallback?.advantage === undefined ? undefined : !!fallback.advantage,
		disadvantage: fallback?.disadvantage === undefined ? undefined : !!fallback.disadvantage,
	};
}

function _getUniquePointKey(point = {}) {
	return `${Math.round(Number(point?.x) || 0)}:${Math.round(Number(point?.y) || 0)}:${Math.round(Number(point?.elevation) || 0)}`;
}

export function _getTokenLightSamplePoints(token, { includeCenter = true } = {}) {
	if (!token) return [];
	const points = [];
	const center = token.center;
	const elevation = token.document?.elevation ?? token.elevation ?? 0;
	if (includeCenter && center) points.push({ x: center.x, y: center.y, elevation });
	for (const point of getPerimeterCenters(token) ?? []) {
		if (!point) continue;
		points.push({ x: point.x, y: point.y, elevation });
	}
	const unique = new Map();
	for (const point of points) unique.set(_getUniquePointKey(point), point);
	return Array.from(unique.values());
}

function _getSceneBaselineLightLevel(scene = canvas?.scene, { considerSceneDarkness = false } = {}) {
	if (!considerSceneDarkness) return 'darkness';
	const darkness = Number(scene?.environment?.darknessLevel ?? scene?.darkness ?? 1);
	if (darkness <= 0.25) return 'bright';
	if (darkness <= 0.75) return 'dim';
	return 'darkness';
}

function _classifyPointLightLevel({ point, token, baseline = _getSceneBaselineLightLevel() } = {}) {
	if (!point || !token) return baseline;
	let matchedLevel = baseline;
	for (const lightSource of canvas?.effects?.lightSources ?? []) {
		if (!lightSource?.active || lightSource?.data?.disabled) continue;
		const shapeContains = typeof lightSource.shape?.contains === 'function' ? lightSource.shape.contains(point.x, point.y) : false;
		const losContains = !shapeContains && typeof lightSource.los?.contains === 'function' ? lightSource.los.contains(point.x, point.y) : false;
		const config = {
			tests: [{
				point: { x: point.x, y: point.y },
				elevation: point.elevation ?? token.document?.elevation ?? token.elevation ?? 0,
				los: new Map(),
			}],
			object: token,
		};
		const lit = shapeContains || losContains || lightSource.testVisibility?.(config) === true;
		if (!lit) continue;
		const sourceX = Number(lightSource.x ?? lightSource.data?.x);
		const sourceY = Number(lightSource.y ?? lightSource.data?.y);
		const brightRadius = Number(lightSource.data?.bright ?? 0);
		const dimRadius = Number(lightSource.data?.dim ?? 0);
		const distance = Number.isFinite(sourceX) && Number.isFinite(sourceY) ? Math.hypot(point.x - sourceX, point.y - sourceY) : undefined;
		if (Number.isFinite(distance) && brightRadius > 0 && distance <= brightRadius) return 'bright';
		if (matchedLevel !== 'bright') matchedLevel = 'dim';
		if (Number.isFinite(distance) && dimRadius > 0 && distance <= dimRadius) matchedLevel = 'dim';
	}
	return matchedLevel;
}

export function _getTokenLightingState(token, options = {}) {
	if (!token) {
		return {
			level: 'darkness',
			baselineLevel: _getSceneBaselineLightLevel(options.scene, options),
			samplePoints: [],
			sampleLevels: [],
			brightSamples: 0,
			dimSamples: 0,
			darknessSamples: 0,
			inBrightLight: false,
			inDimLight: false,
			inDarkness: true,
		};
	}
	const baselineLevel = _getSceneBaselineLightLevel(options.scene, options);
	const samplePoints = _getTokenLightSamplePoints(token, options);
	const points = samplePoints.length ? samplePoints : [{ x: token.center?.x, y: token.center?.y, elevation: token.document?.elevation ?? token.elevation ?? 0 }];
	const sampleLevels = points.map((point) => _classifyPointLightLevel({ point, token, baseline: baselineLevel }));
	const brightSamples = sampleLevels.filter((level) => level === 'bright').length;
	const dimSamples = sampleLevels.filter((level) => level === 'dim').length;
	const darknessSamples = sampleLevels.filter((level) => level === 'darkness').length;
	const inBrightLight = brightSamples > 0;
	const inDimLight = !inBrightLight && dimSamples > 0;
	const inDarkness = darknessSamples === sampleLevels.length;
	const level = inBrightLight ? 'bright' : (inDimLight ? 'dim' : 'darkness');
	return {
		level,
		baselineLevel,
		samplePoints: points,
		sampleLevels,
		brightSamples,
		dimSamples,
		darknessSamples,
		inBrightLight,
		inDimLight,
		inDarkness,
	};
}

function _resolveTokenForLighting(token) {
	if (!token) return canvas?.tokens?.controlled?.[0] ?? null;
	let resolvedToken = token;
	if (typeof resolvedToken === 'string') {
		if (resolvedToken.includes('.')) {
			const resolved = fromUuidSync(resolvedToken, { strict: false });
			resolvedToken = resolved?.object ?? resolved ?? null;
		} else {
			resolvedToken = canvas?.tokens?.get?.(resolvedToken) ?? null;
		}
	}
	if (resolvedToken instanceof TokenDocument) resolvedToken = resolvedToken.object;
	if (resolvedToken instanceof Actor) resolvedToken = resolvedToken.getActiveTokens?.()[0] ?? _getTokenFromActor(resolvedToken) ?? null;
	if (resolvedToken?.document instanceof TokenDocument && resolvedToken?.center) return resolvedToken;
	return null;
}

export function _getLightLevel(token = null, options = {}) {
	const resolvedToken = _resolveTokenForLighting(token);
	return _getTokenLightingState(resolvedToken, options)?.level ?? 'darkness';
}

// Function adapted from @kgar's Tidy 5e Sheet utility.
function simplifyFormula(formula = '', removeFlavor = false, debug = {}) {
	try {
		if (removeFlavor) {
			formula = formula?.replace(foundry.dice.terms.RollTerm.FLAVOR_REGEXP, '')?.replace(foundry.dice.terms.RollTerm.FLAVOR_REGEXP_STRING, '')?.trim();
		}

		if (formula?.trim() === '') return '';

		const roll = Roll.create(formula);
		formula = roll.formula;
		roll.terms.map((t, index) => {
			if (t.isIntermediate && t.isDeterministic) {
				const inter = new foundry.dice.terms.NumericTerm({
					number: t.evaluate({ allowInteractive: false }).total,
					options: t.options,
				});
				const m = String(t.formula).match(/^([\s\S]*?)(\s*(\[[^\]]*\]\s*)*)$/);
				const trailingTags = (m && m[2]) || '';
				formula = formula.replace(t.formula, String(inter.number) + trailingTags);
			} else if (t.number === 0 && index) {
				const operator = roll.terms[index - 1]?.operator;
				if (operator) formula = formula.replace(`${operator} ${t.formula}`, '');
			}
			return t;
		});
		return new Roll(formula).formula;
	} catch (e) {
		console.warn('AC5E: Unable to simplify formula display, returning original formula.', { effect: debug?.effectUuid, change: debug?.changeKey }, e);
		return formula;
	}
}

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

const ROLL_STATE_MIGRATION_CAPTURE_LIMIT = 200;
const rollStateMigrationCapture = [];

function _cloneForDebug(value) {
	if (value == null) return value;
	try {
		return foundry.utils.duplicate(value);
	} catch (_error) {
		return value;
	}
}

function _buildRollStateMigrationSnapshot(stage, { hook, config, rolls, ac5eConfig, extra } = {}) {
	const configRoll0 = config?.rolls?.[0];
	const roll0 = Array.isArray(rolls) ? rolls[0] : configRoll0;
	const modeCounts = ac5eConfig?.modeCounts ?? getRollModeCounts(ac5eConfig, { persist: false });
	return {
		timestamp: new Date().toISOString(),
		stage,
		hook: hook ?? ac5eConfig?.hookType ?? null,
		advantageMode: ac5eConfig?.advantageMode ?? roll0?.options?.advantageMode ?? config?.options?.advantageMode ?? null,
		resolvedButtons: {
			advantage: roll0?.options?.advantage ?? config?.advantage ?? config?.options?.advantage ?? null,
			disadvantage: roll0?.options?.disadvantage ?? config?.disadvantage ?? config?.options?.disadvantage ?? null,
		},
		modeCounts: modeCounts && typeof modeCounts === 'object' ? _cloneForDebug(modeCounts) : modeCounts,
		roll0: roll0 ? {
			formula: roll0?.formula ?? null,
			parts: _cloneForDebug(Array.isArray(roll0?.parts) ? roll0.parts : []),
			options: {
				type: roll0?.options?.type ?? null,
				advantageMode: roll0?.options?.advantageMode ?? null,
				advantage: roll0?.options?.advantage ?? null,
				disadvantage: roll0?.options?.disadvantage ?? null,
				target: roll0?.options?.target ?? null,
			},
		} : null,
		configShape: {
			parts: _cloneForDebug(Array.isArray(config?.parts) ? config.parts : []),
			target: config?.target ?? config?.options?.target ?? null,
			isCritical: config?.isCritical ?? null,
			defaultButton: ac5eConfig?.defaultButton ?? config?.options?.defaultButton ?? null,
		},
		damageModifiers: _cloneForDebug(Array.isArray(ac5eConfig?.damageModifiers) ? ac5eConfig.damageModifiers : []),
		extra: _cloneForDebug(extra ?? null),
	};
}

function _captureRollStateMigrationSnapshot(snapshot) {
	rollStateMigrationCapture.push(snapshot);
	while (rollStateMigrationCapture.length > ROLL_STATE_MIGRATION_CAPTURE_LIMIT) rollStateMigrationCapture.shift();
}

export function clearRollStateMigrationCapture() {
	rollStateMigrationCapture.length = 0;
	return 0;
}

export function getRollStateMigrationCapture() {
	return _cloneForDebug(rollStateMigrationCapture);
}

export function exportRollStateMigrationCapture({ clear = false, space = 2 } = {}) {
	const payload = {
		generatedAt: new Date().toISOString(),
		moduleId: Constants.MODULE_ID,
		entryCount: rollStateMigrationCapture.length,
		entries: getRollStateMigrationCapture(),
	};
	const json = JSON.stringify(payload, null, Number.isFinite(space) ? space : 2);
	if (clear) clearRollStateMigrationCapture();
	return json;
}

export function downloadRollStateMigrationCapture(filename = null, { clear = false, space = 2 } = {}) {
	const json = exportRollStateMigrationCapture({ clear, space });
	const nextFilename = String(filename || `ac5e-roll-state-migration-${Date.now()}.json`).trim();
	if (typeof saveDataToFile === 'function') saveDataToFile(json, 'application/json', nextFilename);
	return json;
}

export function debugRollStateMigration(stage, { hook, config, rolls, ac5eConfig, extra } = {}) {
	const migrationDebugEnabled = _debugFlagEnabled('rollStateMigration');
	const shouldLog = Boolean(settings.debug || migrationDebugEnabled);
	const shouldCapture = Boolean(migrationDebugEnabled || _debugFlagEnabled('rollStateMigrationCapture'));
	if (!shouldLog && !shouldCapture) return;
	const snapshot = _buildRollStateMigrationSnapshot(stage, { hook, config, rolls, ac5eConfig, extra });
	if (shouldCapture) _captureRollStateMigrationSnapshot(snapshot);
	if (shouldLog) console.warn('AC5E rollStateMigration', snapshot);
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

function _getRelevantFlagRegistryEntries({ actor = null, item = null, effect = null, hookType = null, mode = null, targetScope = null } = {}) {
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

export function _getUseConfigInflightCacheEntry(ids = []) {
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
}

export function _getMessageDnd5eFlags(message) {
	return _getMessageFlagScope(message, 'dnd5e');
}

function _getMessageAc5eFlags(message) {
	return _getMessageFlagScope(message, Constants.MODULE_ID);
}

export function _resolveUseMessageContext({ message = null, messageId = null, originatingMessageId = null } = {}) {
	const triggerMessage = message ?? (messageId ? game.messages.get(messageId) : undefined);
	const triggerDnd5eFlags = _getMessageDnd5eFlags(triggerMessage);
	const resolvedOriginatingMessageId = originatingMessageId ?? triggerDnd5eFlags?.originatingMessage ?? triggerMessage?.id;
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

export function _getDistance(tokenA, tokenB, includeUnits = false, overrideMidi = true, checkCollision = false, includeHeight = true) {
	if (_activeModule('midi-qol') && !overrideMidi) {
		let resolvedTokenA = tokenA;
		let resolvedTokenB = tokenB;
		if (typeof resolvedTokenA === 'string') {
			if (resolvedTokenA.includes('.')) resolvedTokenA = _safeFromUuidSync(resolvedTokenA)?.object;
			else resolvedTokenA = canvas.tokens.get(resolvedTokenA);
		}
		if (typeof resolvedTokenB === 'string') {
			if (resolvedTokenB.includes('.')) resolvedTokenB = _safeFromUuidSync(resolvedTokenB)?.object;
			else resolvedTokenB = canvas.tokens.get(resolvedTokenB);
		}
		if (resolvedTokenA instanceof TokenDocument) resolvedTokenA = resolvedTokenA.object;
		if (resolvedTokenB instanceof TokenDocument) resolvedTokenB = resolvedTokenB.object;
		if (resolvedTokenA instanceof Actor) resolvedTokenA = resolvedTokenA.getActiveTokens()[0] ?? null;
		if (resolvedTokenB instanceof Actor) resolvedTokenB = resolvedTokenB.getActiveTokens()[0] ?? null;
		const result = MidiQOL.computeDistance(resolvedTokenA, resolvedTokenB);
		const units = canvas?.grid?.units ?? '';
		if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - Defer to MidiQOL.computeDistance():`, { sourceId: resolvedTokenA?.id, targetId: resolvedTokenB?.id, result, units });
		if (result === -1) return Infinity;
		if (includeUnits) return result + units;
		return result;
	}
	return _getCachedDistance(tokenA, tokenB, includeUnits, checkCollision, includeHeight);
}

export { debugBenchmarkPerimeterGridSpaceCenters as _debugBenchmarkPerimeterGridSpaceCenters };
function _getCachedDistance(tokenA, tokenB, includeUnits = false, checkCollision = false, includeHeight = true) {
	return getCachedDistanceCore(tokenA, tokenB, includeUnits, checkCollision, includeHeight);
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

const DAMAGE_BASELINE_HOOKS = new Set(['damage']);

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
			maximize: roll?.options?.maximize ?? null,
			minimize: roll?.options?.minimize ?? null,
			isCritical: roll?.options?.isCritical ?? null,
			criticalBonusDamage: roll?.options?.critical?.bonusDamage ?? null,
		});
	});
	return Object.freeze({
		profile: Object.freeze(foundry.utils.duplicate(profile)),
		profileKey: getDamageBaselineProfileKey(profile),
		isCritical: !!config?.isCritical,
		defaultButton: ac5eConfig?.defaultButton ?? null,
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
	if (config.rolls.length > baselineRolls.length) config.rolls.length = baselineRolls.length;
	for (let index = 0; index < baselineRolls.length; index++) {
		const rollBaseline = baselineRolls[index];
		if (!rollBaseline) continue;
		const roll = config.rolls[index] ?? (config.rolls[index] = {});
		roll.options ??= {};
		const existingCriticalBonusDamage = roll?.options?.critical?.bonusDamage;
		roll.parts = foundry.utils.duplicate(Array.isArray(rollBaseline.parts) ? rollBaseline.parts : []);
		if (typeof rollBaseline.formula === 'string') roll.formula = rollBaseline.formula;
		else if (Array.isArray(roll.parts) && roll.parts.length) roll.formula = roll.parts.join(' + ');
		if (rollBaseline.type !== undefined && rollBaseline.type !== null) roll.options.type = rollBaseline.type;
		if (rollBaseline.maximum !== undefined && rollBaseline.maximum !== null) roll.options.maximum = rollBaseline.maximum;
		else if ('maximum' in roll.options) delete roll.options.maximum;
		if (rollBaseline.minimum !== undefined && rollBaseline.minimum !== null) roll.options.minimum = rollBaseline.minimum;
		else if ('minimum' in roll.options) delete roll.options.minimum;
		if (rollBaseline.maximize !== undefined && rollBaseline.maximize !== null) roll.options.maximize = rollBaseline.maximize;
		else if ('maximize' in roll.options) delete roll.options.maximize;
		if (rollBaseline.minimize !== undefined && rollBaseline.minimize !== null) roll.options.minimize = rollBaseline.minimize;
		else if ('minimize' in roll.options) delete roll.options.minimize;
		if (rollBaseline.isCritical !== undefined && rollBaseline.isCritical !== null) roll.options.isCritical = rollBaseline.isCritical;
		const restoredCriticalBonusDamage = rollBaseline.criticalBonusDamage ?? existingCriticalBonusDamage;
		if (typeof restoredCriticalBonusDamage === 'string' && restoredCriticalBonusDamage.trim().length) {
			roll.options.critical ??= {};
			roll.options.critical.bonusDamage = restoredCriticalBonusDamage;
		} else if (roll.options.critical && typeof roll.options.critical === 'object' && Object.hasOwn(roll.options.critical, 'bonusDamage')) {
			delete roll.options.critical.bonusDamage;
		}
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

const _itemMatcherCache = new Map();

function _escapeRegExp(value) {
	const str = String(value ?? '');
	return typeof RegExp.escape === 'function' ? RegExp.escape(str) : str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function _normalizeItemIdentifierInput(itemIdentifier) {
	if (itemIdentifier == null) return [];
	const values = Array.isArray(itemIdentifier) ? itemIdentifier : [itemIdentifier];
	return values
		.map((value) => {
			if (typeof value === 'string') return value.trim();
			if (typeof value === 'object') {
				return String(value.identifier ?? value.system?.identifier ?? value.name ?? value.id ?? value.uuid ?? '').trim();
			}
			return String(value).trim();
		})
		.filter(Boolean);
}

function _getLocalizedItemQuery(query) {
	const localized = _localize(query);
	if (localized && localized !== query) return String(localized);
	if (game?.i18n?.has?.(query)) return String(game.i18n.localize(query));
	return String(query);
}

function _buildItemMatcher(queryRaw) {
	const query = String(queryRaw ?? '').trim();
	if (!query) return null;

	const SearchFilter = foundry?.applications?.ux?.SearchFilter;
	const localizedQuery = _getLocalizedItemQuery(query);

	if (!SearchFilter?.cleanQuery || !SearchFilter?.testQuery) {
		return {
			queryLower: localizedQuery.toLowerCase(),
			querySlug: localizedQuery.slugify(),
		};
	}

	const cacheKey = `${game?.i18n?.lang ?? 'en'}:${localizedQuery}`;
	const cached = _itemMatcherCache.get(cacheKey);
	if (cached) return cached;

	const cleanedQuery = SearchFilter.cleanQuery(localizedQuery);
	if (!cleanedQuery) return null;

	const cleanedSlug = cleanedQuery.slugify();
	const matcher = {
		SearchFilter,
		rgx: new RegExp(_escapeRegExp(cleanedQuery), 'i'),
		rgxSlug: cleanedSlug ? new RegExp(_escapeRegExp(cleanedSlug), 'i') : null,
		queryLower: cleanedQuery.toLowerCase(),
		querySlug: cleanedSlug,
	};
	_itemMatcherCache.set(cacheKey, matcher);
	return matcher;
}

function _normalizeItemLookupMatchOption(value) {
	const parsed = String(value ?? 'name')
		.trim()
		.toLowerCase();
	if (['name', 'identifier', 'id', 'uuid', 'any'].includes(parsed)) return parsed;
	return 'name';
}

function _normalizeItemLookupNameModeOption(value) {
	const parsed = String(value ?? 'exact')
		.trim()
		.toLowerCase();
	if (['exact', 'partial'].includes(parsed)) return parsed;
	return 'exact';
}

function _normalizeItemLookupOptions(options = {}) {
	const input = options && typeof options === 'object' ? options : {};
	const rawProperties =
		typeof input.properties === 'string' ? [input.properties]
		: Array.isArray(input.properties) ? input.properties
		: [];
	return {
		...input,
		match: _normalizeItemLookupMatchOption(input.match),
		nameMode: _normalizeItemLookupNameModeOption(input.nameMode),
		equipped: typeof input.equipped === 'boolean' ? input.equipped : undefined,
		attuned: typeof input.attuned === 'boolean' ? input.attuned : undefined,
		hasUses: typeof input.hasUses === 'boolean' ? input.hasUses : undefined,
		hasQuantity: typeof input.hasQuantity === 'boolean' ? input.hasQuantity : undefined,
		properties: [...new Set(rawProperties.map((value) => String(value ?? '').trim()).filter(Boolean))],
	};
}

function _itemNameMatches(item, identifier, matcher, options = {}) {
	const name = String(item?.name ?? '');
	if (!name) return false;
	const query = String(identifier ?? '').trim();
	if (!query) return false;

	const nameMode = _normalizeItemLookupNameModeOption(options.nameMode);
	const nameLower = name.toLowerCase();
	const queryLower = query.toLowerCase();
	if (nameMode === 'exact') return nameLower === queryLower;

	const slug = name.slugify();
	if (matcher?.SearchFilter?.testQuery) {
		return matcher.SearchFilter.testQuery(matcher.rgx, name) || Boolean(matcher.rgxSlug && matcher.SearchFilter.testQuery(matcher.rgxSlug, slug));
	}
	return nameLower.includes(matcher?.queryLower ?? '') || Boolean(matcher?.querySlug && slug.toLowerCase().includes(matcher.querySlug));
}

function _itemMatchesLookup(item, identifier, matcher, options = {}) {
	if (!item || !identifier) return false;
	const normalizedOptions = _normalizeItemLookupOptions(options);
	const match = normalizedOptions.match;
	const normalizedIdentifier = String(identifier ?? '').trim();
	const identifierSlug = normalizedIdentifier.slugify();
	const id = String(item.id ?? '');
	const uuid = String(item.uuid ?? '');
	const directIdentifier = String(item.identifier ?? item.system?.identifier ?? '');

	if (match === 'id') return id === normalizedIdentifier;
	if (match === 'uuid') return uuid === normalizedIdentifier;
	if (match === 'identifier') return directIdentifier === normalizedIdentifier;
	if (match === 'name') return _itemNameMatches(item, identifier, matcher, normalizedOptions);

	return (
		id === normalizedIdentifier ||
		uuid === normalizedIdentifier ||
		directIdentifier === normalizedIdentifier ||
		(identifierSlug && directIdentifier === identifierSlug) ||
		_itemNameMatches(item, identifier, matcher, normalizedOptions)
	);
}

function _itemIsAttuned(item) {
	return !!item?.system?.attuned;
}

function _itemHasUses(item) {
	return !!(item?.system?.uses?.max || item?.system?.uses?.value);
}

function _itemHasQuantity(item) {
	return !!item?.system?.quantity;
}

function _itemHasProperty(item, property) {
	const normalizedProperty = String(property ?? '').trim();
	if (!normalizedProperty) return false;
	const itemProperties = item?.system?.properties;
	if (!itemProperties) return false;
	if (typeof itemProperties.has === 'function') return itemProperties.has(normalizedProperty);
	return false;
}

function _itemMatchesLookupStateFilters(item, options = {}) {
	if (!item) return false;
	if (options.equipped !== undefined && Boolean(item?.system?.equipped) !== options.equipped) return false;
	if (options.attuned !== undefined && _itemIsAttuned(item) !== options.attuned) return false;
	if (options.hasUses !== undefined && _itemHasUses(item) !== options.hasUses) return false;
	if (options.hasQuantity !== undefined && _itemHasQuantity(item) !== options.hasQuantity) return false;
	if (Array.isArray(options.properties) && options.properties.some((property) => !_itemHasProperty(item, property))) return false;
	return true;
}

function _resolveActorForItemLookup(source) {
	if (!source) return null;

	// Actor-like
	if (source instanceof foundry.abstract.Document && source.documentName === 'Actor') return source;
	if (source?.document instanceof foundry.abstract.Document && source.document.documentName === 'Actor') return source.document;

	// Token-like
	if (source?.actor?.items) return source.actor;

	// Structured reference object
	if (typeof source === 'object') {
		const reference = source.tokenId ?? source.tokenUuid ?? source.actorId ?? source.actorUuid ?? source.uuid ?? null;
		if (typeof reference === 'string' && reference.trim()) return _resolveActorForItemLookup(reference.trim());
	}

	if (typeof source !== 'string') return null;
	const reference = source.trim();
	if (!reference) return null;

	// tokenId => canvas.scene.tokens.get(tokenId)?.actor
	const actorFromTokenId = canvas?.scene?.tokens?.get?.(reference)?.actor ?? canvas?.tokens?.get?.(reference)?.actor ?? null;
	if (actorFromTokenId?.items) return actorFromTokenId;

	// tokenUuid => fromUuidSync(tokenUuid)?.actor
	const tokenUuidLike = reference.startsWith('Token.') || reference.includes('.Token.');
	if (tokenUuidLike) {
		const tokenDocument = _safeFromUuidSync(reference);
		const actorFromTokenUuid = tokenDocument?.actor ?? null;
		if (actorFromTokenUuid?.items) return actorFromTokenUuid;
	}

	// actorId => game.actors.get(actorId)
	const actorFromId = game?.actors?.get?.(reference) ?? null;
	if (actorFromId?.items) return actorFromId;

	// actorUuid => fromUuidSync(actorUuid)
	const actorUuidLike = reference.startsWith('Actor.') || reference.includes('.Actor.');
	if (actorUuidLike || _isUuidLike(reference)) {
		const actorDocument = _safeFromUuidSync(reference);
		const actorFromUuid = actorDocument?.actor ?? actorDocument ?? null;
		if (actorFromUuid?.items) return actorFromUuid;
	}

	return null;
}

/*
 * Gets actor items filtered by identifier/name/id/uuid matching.
 * source supports Actor, Token, tokenId, tokenUuid, actorId, actorUuid, or {tokenId|tokenUuid|actorId|actorUuid}.
 * @param {Actor|Token|string|object} source - Source that resolves to an actor.
 * @param {string|string[]|object} [itemIdentifier] - Identifier/name/id/uuid query. If omitted, returns all actor items.
 * @param {object} [options]
 * @param {string} [options.type] - Optional item.type filter.
 * @param {string|string[]} [options.properties] - Optional item.system.properties filter; all requested properties must be present.
 * @param {boolean} [options.returnIds] - If true, returns matching item ids instead of documents.
 * @param {boolean} [options.returnUuids] - If true, returns matching item uuids instead of documents.
 * @param {boolean} [options.returnIdentifiers] - If true, returns matching item identifiers instead of documents.
 * @returns {Array} - Matching item documents.
 */
export function _getItems(source, itemIdentifier, options = {}) {
	const actor = _resolveActorForItemLookup(source);
	if (!actor?.items) return [];

	const actorItems = Array.from(actor.items ?? []);
	if (!actorItems.length) return [];

	const normalizedOptions = _normalizeItemLookupOptions(options);
	const itemType = typeof normalizedOptions?.type === 'string' ? normalizedOptions.type.trim() : '';
	const typeScopedItems = itemType ? actorItems.filter((item) => item?.type === itemType) : actorItems;
	const scopedItems = typeScopedItems.filter((item) => _itemMatchesLookupStateFilters(item, normalizedOptions));
	const identifiers = _normalizeItemIdentifierInput(itemIdentifier);
	if (!identifiers.length) return scopedItems;

	const matchers = new Map(identifiers.map((identifier) => [identifier, _buildItemMatcher(identifier)]));
	const seen = new Set();
	const matches = [];

	for (const item of scopedItems) {
		for (const identifier of identifiers) {
			const matcher = matchers.get(identifier);
			if (!_itemMatchesLookup(item, identifier, matcher, normalizedOptions)) continue;
			const itemKey = String(item?.uuid ?? item?.id ?? item?.name ?? '');
			if (!seen.has(itemKey)) {
				seen.add(itemKey);
				matches.push(item);
			}
			break;
		}
	}
	if (options.returnIdentifiers) return matches.map((item) => item.identifier);
	if (options.returnUuids) return matches.map((item) => item.uuid);
	if (options.returnIds) return matches.map((item) => item.id);
	return matches;
}

export function _getItem(source, itemIdentifier, options = {}) {
	return _getItems(source, itemIdentifier, options)[0] ?? null;
}

/*
 * Checks whether at least one item matches.
 * @param {Actor|Token|string|object} source
 * @param {string|string[]|object} itemIdentifier
 * @param {object} [options]
 * @returns {boolean}
 */
export function _hasItem(source, itemIdentifier, options = {}) {
	const identifiers = _normalizeItemIdentifierInput(itemIdentifier);
	if (!identifiers.length) return false;
	return _getItems(source, identifiers, options).length > 0;
}

function _getSelectedOptinIds(optinSelected = {}) {
	const selected = new Set();
	const visit = (value, key) => {
		if (!value || typeof value !== 'object') {
			if (value && key) selected.add(key);
			return;
		}
		for (const [nestedKey, nestedValue] of Object.entries(value)) {
			visit(nestedValue, nestedKey);
		}
	};
	visit(optinSelected, '');
	return selected;
}

export function _filterOptinEntries(entries = [], optinSelected = {}) {
	const selected = _getSelectedOptinIds(optinSelected);
	return (entries ?? []).filter((entry) => {
		if (!entry || typeof entry !== 'object') return true;
		if (!entry.optin) return true;
		return selected.has(entry.id);
	});
}


function _countModeCollectionEntries(value) {
	return (
		typeof value?.size === 'number' ? value.size
		: Array.isArray(value) ? value.length
		: typeof value === 'string' ?
			value.trim() ?
				1
			:	0
		:	0
	);
}

export function getRollModeCounts(ac5eConfig = {}, { optinSelected = ac5eConfig?.optinSelected ?? {}, filterOptin = true, persist = true } = {}) {
	const subject = ac5eConfig?.subject ?? {};
	const opponent = ac5eConfig?.opponent ?? {};
	const countEntries = (entries) => (filterOptin ? _filterOptinEntries(entries ?? [], optinSelected).length : _countModeCollectionEntries(entries));
	const summarizeMode = (entryKey, nameKey = null) => {
		const subjectEntries = countEntries(subject?.[entryKey] ?? []);
		const opponentEntries = countEntries(opponent?.[entryKey] ?? []);
		const subjectNames = nameKey ? _countModeCollectionEntries(subject?.[nameKey]) : 0;
		const opponentNames = nameKey ? _countModeCollectionEntries(opponent?.[nameKey]) : 0;
		const total = subjectEntries + opponentEntries + subjectNames + opponentNames;
		return {
			subject: subjectEntries + subjectNames,
			opponent: opponentEntries + opponentNames,
			subjectEntries,
			opponentEntries,
			subjectNames,
			opponentNames,
			total,
			present: total > 0,
		};
	};
	const advantages = summarizeMode('advantage', 'advantageNames');
	const disadvantages = summarizeMode('disadvantage', 'disadvantageNames');
	const noAdvantages = summarizeMode('noAdvantage');
	const noDisadvantages = summarizeMode('noDisadvantage');
	const counts = {
		advantages,
		disadvantages,
		noAdvantages,
		noDisadvantages,
		filterOptin,
		netMode: (advantages.present ? 1 : 0) - (disadvantages.present ? 1 : 0),
	};
	if (persist && ac5eConfig && typeof ac5eConfig === 'object') ac5eConfig.modeCounts = counts;
	return counts;
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

function _getActiveAbilityOverrideEntry(ac5eConfig = {}) {
	const selected = ac5eConfig?.optinSelected ?? {};
	const filterEntries = (entries = []) => _filterOptinEntries(entries, selected).filter((entry) => _entryMatchesTransientState(entry, ac5eConfig));
	const entries = [...filterEntries(ac5eConfig?.subject?.abilityOverride ?? []), ...filterEntries(ac5eConfig?.opponent?.abilityOverride ?? [])].filter(
		(entry) => typeof entry?.abilityOverride === 'string' && entry.abilityOverride.trim(),
	);
	return entries.length ? entries[entries.length - 1] : null;
}

export function _getActiveAbilityOverride(ac5eConfig = {}) {
	const entry = _getActiveAbilityOverrideEntry(ac5eConfig);
	return entry ? String(entry.abilityOverride).trim().toLowerCase() : '';
}

function _getTransientRollState(ac5eConfig = {}, fallback = {}) {
	const d20 = fallback?.d20 && typeof fallback.d20 === 'object' ? fallback.d20 : fallback;
	const explicitAdv = d20?.hasTransitAdvantage ?? ac5eConfig?.hasTransitAdvantage ?? ac5eConfig?.transientRollState?.hasTransitAdvantage;
	const explicitDis = d20?.hasTransitDisadvantage ?? ac5eConfig?.hasTransitDisadvantage ?? ac5eConfig?.transientRollState?.hasTransitDisadvantage;
	const advantageMode =
		typeof d20?.advantageMode === 'number' ? d20.advantageMode
		: typeof ac5eConfig?.advantageMode === 'number' ? ac5eConfig.advantageMode
		: ac5eConfig?.transientRollState?.advantageMode;
	const defaultButton =
		typeof d20?.defaultButton === 'string' ? d20.defaultButton
		: typeof ac5eConfig?.defaultButton === 'string' ? ac5eConfig.defaultButton
		: ac5eConfig?.transientRollState?.defaultButton;
	const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
	const inferredAdvantage =
		explicitAdv ??
		(typeof advantageMode === 'number' ? advantageMode === advModes.ADVANTAGE
		: defaultButton === 'advantage' ? true
		: false);
	const inferredDisadvantage =
		explicitDis ??
		(typeof advantageMode === 'number' ? advantageMode === advModes.DISADVANTAGE
		: defaultButton === 'disadvantage' ? true
		: false);
	return {
		hasTransitAdvantage: Boolean(inferredAdvantage),
		hasTransitDisadvantage: Boolean(inferredDisadvantage),
		advantageMode,
		defaultButton,
	};
}

export function _entryMatchesTransientState(entry, ac5eConfig = {}, fallback = {}) {
	if (!entry || typeof entry !== 'object') return true;
	const { hasTransitAdvantage, hasTransitDisadvantage } = _getTransientRollState(ac5eConfig, fallback);
	if (entry.requiresTransitAdvantage && !hasTransitAdvantage) return false;
	if (entry.requiresTransitDisadvantage && !hasTransitDisadvantage) return false;
	return true;
}

const D20_BASELINE_HOOKS = new Set(['attack', 'save', 'check']);

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
		maximize: roll0Options.maximize ?? null,
		minimize: roll0Options.minimize ?? null,
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
	if (hasRoll0) {
		if (typeof baseline?.formula === 'string') roll0.formula = baseline.formula;
		else if (baselineParts.length) roll0.formula = baselineParts.join(' + ');
		else if ('formula' in roll0) delete roll0.formula;
	}
	if (Array.isArray(config.parts) || baselineParts.length) config.parts = foundry.utils.duplicate(baselineParts);
	const buttons = baseline?.buttons ?? {};
	if (buttons.advantageMode !== undefined && buttons.advantageMode !== null) config.advantageMode = buttons.advantageMode;
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
	if (hasRoll0 && target.maximize !== undefined && target.maximize !== null) roll0.options.maximize = target.maximize;
	else if (hasRoll0 && 'maximize' in roll0.options) delete roll0.options.maximize;
	if (hasRoll0 && target.minimize !== undefined && target.minimize !== null) roll0.options.minimize = target.minimize;
	else if (hasRoll0 && 'minimize' in roll0.options) delete roll0.options.minimize;
	if (hasRoll0) roll0.options[Constants.MODULE_ID] ??= {};
	if (hasRoll0) roll0.options[Constants.MODULE_ID].appliedParts = Array.isArray(baseline?.appliedParts) ? foundry.utils.duplicate(baseline.appliedParts) : [];
	preConfig.activeRollProfileKey = baseline.profileKey ?? profileKey;
	preConfig.frozenD20Baseline = baseline;
	ac5eConfig.preAC5eConfig = preConfig;
	ac5eConfig.frozenD20Baseline = baseline;
	return true;
}

export function _getTooltip(ac5eConfig = {}) {
	const { hookType, subject, opponent, alteredCritThreshold, alteredFumbleThreshold, alteredTargetADC, initialTargetADC, tooltipObj } = ac5eConfig;
	let tooltip;
	const hasOptins = ac5eConfig?.optinSelected && Object.keys(ac5eConfig.optinSelected).length;
	const bypassTooltipCache = ['check', 'save'].includes(hookType) && !!ac5eConfig?.preAC5eConfig?.forceChatTooltip;
	if (tooltipObj?.[hookType] && !hasOptins && !bypassTooltipCache) return tooltipObj[hookType];
	else tooltip = '<div class="ac5e-tooltip-content">';
	const optinSelected = ac5eConfig?.optinSelected ?? {};
	const selectedDamageTypes = new Set(
		[
			...(Array.isArray(ac5eConfig?.options?.selectedDamageTypesByIndex) ? ac5eConfig.options.selectedDamageTypesByIndex : []),
			...(Array.isArray(ac5eConfig?.options?.selectedDamageTypes) ? ac5eConfig.options.selectedDamageTypes : []),
		]
			.filter((value) => typeof value === 'string' && value.trim())
			.map((value) => String(value).toLowerCase()),
	);
	const resolveTooltipEntryAddTo = (entry, defaultMode = 'base') => {
		if (entry?.addTo?.mode === 'all') return { mode: 'all', types: [] };
		if (entry?.addTo?.mode === 'base') return { mode: 'base', types: [] };
		if (entry?.addTo?.mode === 'global') return { mode: 'global', types: [] };
		if (entry?.addTo?.mode === 'types' && Array.isArray(entry?.addTo?.types) && entry.addTo.types.length)
			return { mode: 'types', types: entry.addTo.types.map((type) => String(type).toLowerCase()) };
		return { mode: defaultMode, types: [] };
	};
	const isDamageTooltipEntryVisible = (entry) => {
		if (hookType !== 'damage' || !entry || typeof entry !== 'object') return true;
		const requiredDamageTypes = Array.isArray(entry?.requiredDamageTypes) ? entry.requiredDamageTypes.map((type) => String(type).toLowerCase()) : [];
		if (requiredDamageTypes.length && (!selectedDamageTypes.size || !requiredDamageTypes.every((type) => selectedDamageTypes.has(type)))) return false;
		const addTo = resolveTooltipEntryAddTo(entry);
		if (addTo.mode !== 'types') return true;
		if (!selectedDamageTypes.size) return false;
		return addTo.types.some((type) => selectedDamageTypes.has(type));
	};
	const filterOptinEntries = (entries = []) =>
		_filterOptinEntries(entries, optinSelected)
			.filter((entry) => _entryMatchesTransientState(entry, ac5eConfig))
			.filter((entry) => isDamageTooltipEntryVisible(entry));
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
	const normalizeTooltipLabel = (value) =>
		String(value ?? '')
			.trim()
			.replace(/\s+/g, ' ')
			.toLowerCase();
	const activeAbilityOverrideEntry = _getActiveAbilityOverrideEntry(ac5eConfig);
	const baselineAbility = String(ac5eConfig?.preAC5eConfig?.baseAbility ?? ac5eConfig?.frozenD20Baseline?.profile?.ability ?? ac5eConfig?.preAC5eConfig?.frozenD20Baseline?.profile?.ability ?? '')
		.trim()
		.toUpperCase();
	const activeAbilityOverrideLabel =
		typeof activeAbilityOverrideEntry?.label === 'string' && activeAbilityOverrideEntry.label.trim() ? activeAbilityOverrideEntry.label.trim()
		: typeof activeAbilityOverrideEntry?.name === 'string' && activeAbilityOverrideEntry.name.trim() ? activeAbilityOverrideEntry.name.trim()
		: '';
	const activeAbilityOverrideValue = typeof activeAbilityOverrideEntry?.abilityOverride === 'string' ? activeAbilityOverrideEntry.abilityOverride.trim().toUpperCase() : '';
	const activeAbilityOverrideText =
		activeAbilityOverrideEntry && activeAbilityOverrideValue ?
			`Ability: ${baselineAbility || '?'} -> ${activeAbilityOverrideValue}${activeAbilityOverrideLabel ? ` (${activeAbilityOverrideLabel})` : ''}`
		:	'';
	if (settings.showNameTooltips) tooltip += '<div style="text-align:center;"><strong>Automated Conditions 5e</strong></div><hr>';
	const addTooltip = (condition, text) => {
		if (condition) {
			if (tooltip.includes('span')) tooltip += '<br>';
			tooltip += text;
		}
	};
	const getPreferredBaseTargetADC = () => {
		const numericInitialTargetAcs = Object.values(ac5eConfig?.initialTargetADCs ?? {})
			.map((entry) => Number(entry?.ac))
			.filter((value) => Number.isFinite(value));
		if (['attack', 'damage'].includes(hookType) && numericInitialTargetAcs.length) return Math.min(...numericInitialTargetAcs);
		const numericBaseTargetAcs = Object.values(ac5eConfig?.preAC5eConfig?.baseTargetAcByKey ?? {})
			.map((entry) => Number(entry?.ac))
			.filter((value) => Number.isFinite(value));
		if (['attack', 'damage'].includes(hookType) && numericBaseTargetAcs.length) return Math.min(...numericBaseTargetAcs);
		const numericOptinBaseTargetADC = Number(ac5eConfig?.optinBaseTargetADCValue);
		if (!['attack', 'damage'].includes(hookType) && Number.isFinite(numericOptinBaseTargetADC)) return numericOptinBaseTargetADC;
		const numericBaseRollTarget = Number(ac5eConfig?.preAC5eConfig?.baseRoll0Options?.target);
		if (!['attack', 'damage'].includes(hookType) && Number.isFinite(numericBaseRollTarget)) return numericBaseRollTarget;
		const numericInitialTargetADC = Number(initialTargetADC);
		if (Number.isFinite(numericInitialTargetADC)) return numericInitialTargetADC;
		return undefined;
	};
	const explicitOverride = ac5eConfig?.explicitModeOverride?.replacesCalculatedMode ? ac5eConfig.explicitModeOverride : null;
	const suppressD20Calculated = explicitOverride?.family === 'd20';
	const suppressDamageCalculated = explicitOverride?.family === 'damage';
	const enforcedD20Mode = ['advantage', 'disadvantage', 'normal'].includes(ac5eConfig?.enforcedD20Mode) ? ac5eConfig.enforcedD20Mode : null;
	const suppressResolvedD20Buckets = suppressD20Calculated || Boolean(enforcedD20Mode);
	const explicitOverrideBucketLabel =
		explicitOverride?.source === 'dialog' ? 'Roll dialog user input'
		: explicitOverride?.source === 'keypress' ? 'Override keypress'
		: '';
	let hiddenResolvedD20TooltipEntries = 0;
	if (subject) {
		const subjectSuppressedStatuses = [...new Set(mapEntryLabels(subject?.suppressedStatuses ?? []))];
		const subjectCritical =
			suppressDamageCalculated ?
				explicitOverride?.action === 'critical' && explicitOverrideBucketLabel ?
					[explicitOverrideBucketLabel]
				:	[]
			:	mapEntryLabels(filterOptinEntries(subject?.critical ?? []));
		const subjectNoCritical =
			suppressDamageCalculated ?
				explicitOverride?.action === 'normal' && explicitOverrideBucketLabel ?
					[explicitOverrideBucketLabel]
				:	[]
			:	mapEntryLabels(filterOptinEntries(subject?.noCritical ?? []));
		const suppressSeparateMidiAbilityTooltip = ['check', 'save'].includes(hookType) && !!ac5eConfig?.preAC5eConfig?.forceChatTooltip;
		const subjectMidiAdvantage = suppressSeparateMidiAbilityTooltip ? [] : [...new Set((subject?.midiAdvantage ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
		const subjectMidiDisadvantage = suppressSeparateMidiAbilityTooltip ? [] : [...new Set((subject?.midiDisadvantage ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
		const midiAdvantageSet = new Set(subjectMidiAdvantage.map(normalizeTooltipLabel));
		const midiDisadvantageSet = new Set(subjectMidiDisadvantage.map(normalizeTooltipLabel));
		const calculatedSubjectAdvantageModes = [...mapEntryLabels(filterOptinEntries(subject?.advantage ?? [])), ...([...subject?.advantageNames] ?? [])].filter((label) => !midiAdvantageSet.has(normalizeTooltipLabel(label)));
		const calculatedSubjectDisadvantageModes = [...mapEntryLabels(filterOptinEntries(subject?.disadvantage ?? [])), ...([...subject?.disadvantageNames] ?? [])].filter(
			(label) => !midiDisadvantageSet.has(normalizeTooltipLabel(label)),
		);
		const calculatedSubjectNoAdvantage = mapEntryLabels(filterOptinEntries(subject?.noAdvantage ?? []));
		const calculatedSubjectNoDisadvantage = mapEntryLabels(filterOptinEntries(subject?.noDisadvantage ?? []));
		if (enforcedD20Mode) {
			hiddenResolvedD20TooltipEntries +=
				calculatedSubjectAdvantageModes.length +
				calculatedSubjectDisadvantageModes.length +
				calculatedSubjectNoAdvantage.length +
				calculatedSubjectNoDisadvantage.length;
		}
		const subjectAdvantageModes =
			suppressResolvedD20Buckets ?
				explicitOverride?.action === 'advantage' && explicitOverrideBucketLabel ?
					[explicitOverrideBucketLabel]
				:	[]
			:	calculatedSubjectAdvantageModes;
		const subjectDisadvantageModes =
			suppressResolvedD20Buckets ?
				explicitOverride?.action === 'disadvantage' && explicitOverrideBucketLabel ?
					[explicitOverrideBucketLabel]
				:	[]
			:	calculatedSubjectDisadvantageModes;
		const subjectNormalModes =
			suppressResolvedD20Buckets ?
				explicitOverride?.action === 'normal' && explicitOverrideBucketLabel ?
					[explicitOverrideBucketLabel]
				:	[]
			:	[];
		const subjectNoAdvantage = suppressResolvedD20Buckets ? [] : calculatedSubjectNoAdvantage;
		const subjectNoDisadvantage = suppressResolvedD20Buckets ? [] : calculatedSubjectNoDisadvantage;
		const subjectFail = mapEntryLabels(filterOptinEntries(subject?.fail ?? []));
		const subjectRangeNotes = [...new Set(mapEntryLabels(subject?.rangeNotes ?? []))];
		const subjectMidiFail = suppressSeparateMidiAbilityTooltip ? [] : [...new Set((subject?.midiFail ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
		const subjectFumble = mapEntryLabels(filterOptinEntries(subject?.fumble ?? []));
		const subjectSuccess = mapEntryLabels(filterOptinEntries(subject?.success ?? []));
		const subjectMidiSuccess = suppressSeparateMidiAbilityTooltip ? [] : [...new Set((subject?.midiSuccess ?? []).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
		addTooltip(subjectSuppressedStatuses.length, `<span style="display: block; text-align: left;">Suppressed Statuses: ${subjectSuppressedStatuses.join(', ')}</span>`);
		addTooltip(subjectCritical.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Critical')}: ${subjectCritical.join(', ')}</span>`);
		addTooltip(subjectNoCritical.length, `<span style="display: block; text-align: left;">${_localize('AC5E.NoCritical')}: ${subjectNoCritical.join(', ')}</span>`);
		addTooltip(subjectAdvantageModes.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Advantage')}: ${subjectAdvantageModes.join(', ')}</span>`);
		addTooltip(subjectNormalModes.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Normal')}: ${subjectNormalModes.join(', ')}</span>`);
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
		addTooltip(Boolean(activeAbilityOverrideText), `<span style="display: block; text-align: left;">${activeAbilityOverrideText}</span>`);
		const subjectExtraDiceLabels = mapEntryLabels(filterOptinEntries(subject.extraDice));
		addTooltip(subjectExtraDiceLabels.length, `<span style="display: block; text-align: left;">${_localize('AC5E.ExtraDice')}: ${subjectExtraDiceLabels.join(', ')}</span>`);
	}
	if (opponent) {
		const opponentSuppressedStatuses = [...new Set(mapEntryLabels(opponent?.suppressedStatuses ?? []))];
		const opponentCritical = suppressDamageCalculated ? [] : mapEntryLabels(filterOptinEntries(opponent?.critical ?? []));
		const opponentNoCritical = suppressDamageCalculated ? [] : mapEntryLabels(filterOptinEntries(opponent?.noCritical ?? []));
		const calculatedOpponentAdvantageModes = [...mapEntryLabels(filterOptinEntries(opponent?.advantage ?? [])), ...([...opponent?.advantageNames] ?? [])];
		const calculatedOpponentDisadvantageModes = [...mapEntryLabels(filterOptinEntries(opponent?.disadvantage ?? [])), ...([...opponent?.disadvantageNames] ?? [])];
		const calculatedOpponentNoAdvantage = mapEntryLabels(filterOptinEntries(opponent?.noAdvantage ?? []));
		const calculatedOpponentNoDisadvantage = mapEntryLabels(filterOptinEntries(opponent?.noDisadvantage ?? []));
		if (enforcedD20Mode) {
			hiddenResolvedD20TooltipEntries +=
				calculatedOpponentAdvantageModes.length +
				calculatedOpponentDisadvantageModes.length +
				calculatedOpponentNoAdvantage.length +
				calculatedOpponentNoDisadvantage.length;
		}
		const opponentAdvantageModes = suppressResolvedD20Buckets ? [] : calculatedOpponentAdvantageModes;
		const opponentDisadvantageModes = suppressResolvedD20Buckets ? [] : calculatedOpponentDisadvantageModes;
		const opponentNoAdvantage = suppressResolvedD20Buckets ? [] : calculatedOpponentNoAdvantage;
		const opponentNoDisadvantage = suppressResolvedD20Buckets ? [] : calculatedOpponentNoDisadvantage;
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
	const infoEntries = filterOptinEntries([...(subject?.info ?? []), ...(opponent?.info ?? [])]);
	const enforcedModeEntries = enforcedD20Mode ? infoEntries.filter((entry) => entry?.enforceMode === enforcedD20Mode) : [];
	const enforcedModeLabels = [...new Set(mapEntryLabels(enforcedModeEntries))];
	const infoLabels = [
		...new Set(
			mapEntryLabels(
				infoEntries.filter((entry) => {
					if (!entry || typeof entry !== 'object') return true;
					return entry?.enforceMode !== enforcedD20Mode;
				}),
			),
		),
	];
	addTooltip(infoLabels.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Info')}: ${infoLabels.join(', ')}</span>`);
	const enforcedModeLabel =
		enforcedD20Mode === 'advantage' ? _localize('DND5E.Advantage')
		: enforcedD20Mode === 'disadvantage' ? _localize('DND5E.Disadvantage')
		: enforcedD20Mode === 'normal' ? _localize('DND5E.Normal')
		: '';
	addTooltip(
		enforcedModeLabels.length,
		`<span style="display: block; text-align: left;">Forced Roll Mode (${enforcedModeLabel}): ${enforcedModeLabels.join(', ')}</span>`,
	);
	if (enforcedD20Mode) {
		addTooltip(
			hiddenResolvedD20TooltipEntries > 0,
			'<span style="display: block; text-align: left;">Other roll-state modifiers were overridden.</span>',
		);
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
		let tooltipInitialTargetADC = getPreferredBaseTargetADC();
		const numericAlteredTargetAcs = Object.values(ac5eConfig?.alteredTargetADCs ?? {})
			.map((entry) => Number(entry?.ac))
			.filter((value) => Number.isFinite(value));
		let tooltipAlteredTargetADC = Number.isFinite(Number(alteredTargetADC)) ? Number(alteredTargetADC) : undefined;
		if (tooltipInitialTargetADC === undefined) tooltipInitialTargetADC = 10;
		if (tooltipAlteredTargetADC === undefined && ['attack', 'damage'].includes(hookType) && numericAlteredTargetAcs.length) {
			tooltipAlteredTargetADC = Math.min(...numericAlteredTargetAcs);
		}
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

export function _getMidiAttackAttributionEntries(workflow, type) {
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

function _setMidiTrackerAttribution(tracker, type, source, label) {
	if (!tracker || !type || !source) return;
	const nextLabel = String(label ?? '').trim();
	if (!nextLabel) return;
	if (typeof tracker?.addAttribution === 'function') {
		tracker.addAttribution(type, source, nextLabel);
		return;
	}
	tracker.attribution ??= {};
	if (!tracker.attribution[type] || typeof tracker.attribution[type] !== 'object') tracker.attribution[type] = {};
	if (!tracker.attribution[type][source]) tracker.attribution[type][source] = nextLabel;
}

const MIDI_TRACKER_DEBUG_MARKER = 'ac5e-midi-tracker-sync-2026-03-05-r1';

function _shouldLogMidiTrackerSync() {
	return Boolean(settings.debug || _debugFlagEnabled('midiTooltipSync') || _debugFlagEnabled('midiTrackerSync'));
}

function _logMidiTrackerBuildMarkerOnce(context = '') {
	if (!_shouldLogMidiTrackerSync()) return;
	if (globalThis.__ac5eMidiTrackerBuildMarkerLogged) return;
	globalThis.__ac5eMidiTrackerBuildMarkerLogged = true;
	console.warn('AC5E midiTrackerSync build marker', { marker: MIDI_TRACKER_DEBUG_MARKER, context });
}

function _logMidiTrackerSnapshot(phase, { hookType, tracker, ac5eConfig, extra = {} } = {}) {
	if (!_shouldLogMidiTrackerSync()) return;
	console.warn('AC5E midiTrackerSync snapshot', {
		marker: MIDI_TRACKER_DEBUG_MARKER,
		phase,
		hookType,
		defaultButton: ac5eConfig?.defaultButton,
		advantageMode: ac5eConfig?.advantageMode,
		trackerHasAddAttribution: typeof tracker?.addAttribution === 'function',
		trackerAttribution: foundry.utils.duplicate(tracker?.attribution ?? {}),
		...extra,
	});
}

function _createMidiTrackerSyncContext(tracker, trackedTypes = []) {
	const configButtonsFallbackLabel = String(tracker?.attribution?.ADV?.['config-buttons'] ?? tracker?.attribution?.DIS?.['config-buttons'] ?? 'Roll Dialog').trim() || 'Roll Dialog';
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
	const normalizeLabel = (value) =>
		String(value ?? '')
			.trim()
			.replace(/\s+/g, ' ')
			.replace(/^ac5e[:\s-]*/i, '')
			.toLowerCase();
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
		removeAttributionSource(type, 'config-buttons');
	};
	const hasAc5eAttribution = (type) => {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') return false;
		return Object.keys(typed).some((source) => typeof source === 'string' && (source.startsWith(legacySourcePrefix) || /^ac5e(?:\b|[:\s-])/i.test(source)));
	};
	const hasNonAc5eAttribution = (type) => {
		const typed = tracker?.attribution?.[type];
		if (!typed || typeof typed !== 'object') return false;
		return Object.keys(typed).some((source) => typeof source === 'string' && !source.startsWith(legacySourcePrefix) && !/^ac5e(?:\b|[:\s-])/i.test(source));
	};
	return {
		clearLegacySet,
		clearTrackedType,
		configButtonsFallbackLabel,
		dedupeLabels,
		dropConfigButtonsAttribution,
		hasAc5eAttribution,
		hasEquivalentMidiAttribution,
		hasMidiKeypressAttribution,
		hasNonAc5eAttribution,
		keypressLabelsByType,
		labelsFromCollection,
		labelsFromEntries,
		legacySourcePrefix,
		normalizeLabel,
		withDisplayPrefix,
	};
}

function _collectMidiTrackerCoreLabels(ac5eConfig) {
	const selected = ac5eConfig?.optinSelected ?? {};
	const enforcedD20Mode = ['advantage', 'disadvantage', 'normal'].includes(ac5eConfig?.enforcedD20Mode) ? ac5eConfig.enforcedD20Mode : null;
	const filterOptin = (entries = []) => _filterOptinEntries(entries, selected).filter((entry) => _entryMatchesTransientState(entry, ac5eConfig));
	const subject = ac5eConfig?.subject ?? {};
	const opponent = ac5eConfig?.opponent ?? {};
	const collectLabels = (subjectKey, opponentKey = subjectKey, includeNameCollections = false) => {
		const labels = _labelsFromMidiTrackerEntries(filterOptin(subject?.[subjectKey] ?? [])).concat(_labelsFromMidiTrackerEntries(filterOptin(opponent?.[opponentKey] ?? [])));
		if (includeNameCollections) {
			labels.push(..._labelsFromMidiTrackerCollection(subject?.[`${subjectKey}Names`]));
			labels.push(..._labelsFromMidiTrackerCollection(opponent?.[`${opponentKey}Names`]));
		}
		return _dedupeMidiTrackerLabels(labels);
	};
	const infoEntries = filterOptin([...(subject?.info ?? []), ...(opponent?.info ?? [])]);
	const enforcedModeEntries = enforcedD20Mode ? infoEntries.filter((entry) => entry?.enforceMode === enforcedD20Mode) : [];
	const enforcedModeLabels = _dedupeMidiTrackerLabels(_labelsFromMidiTrackerEntries(enforcedModeEntries));
	const infoLabels = _dedupeMidiTrackerLabels(
		_labelsFromMidiTrackerEntries(
			infoEntries.filter((entry) => {
				if (!entry || typeof entry !== 'object') return true;
				return entry?.enforceMode !== enforcedD20Mode;
			}),
		),
	);
	return {
		filterOptin,
		subject,
		opponent,
		enforcedD20Mode,
		enforcedModeLabels,
		advantageLabels: collectLabels('advantage', 'advantage', true),
		disadvantageLabels: collectLabels('disadvantage', 'disadvantage', true),
		noAdvantageLabels: collectLabels('noAdvantage'),
		noDisadvantageLabels: collectLabels('noDisadvantage'),
		infoLabels,
	};
}

function _labelsFromMidiTrackerEntries(entries = []) {
	const next = [];
	const source = Array.isArray(entries) ? entries : [entries];
	for (const entry of source) {
		if (entry === undefined || entry === null) continue;
		if (typeof entry === 'string' || typeof entry === 'number') {
			const label = String(entry).trim();
			if (label) next.push(label);
			continue;
		}
		if (typeof entry !== 'object') continue;
		const value = entry?.label ?? entry?.name ?? entry?.id ?? entry?.bonus ?? entry?.modifier ?? entry?.set ?? entry?.threshold;
		const label = value === undefined || value === null ? '' : String(value).trim();
		if (label) next.push(label);
	}
	return next;
}

function _labelsFromMidiTrackerCollection(value) {
	if (value instanceof Set) return _labelsFromMidiTrackerEntries([...value]);
	if (Array.isArray(value)) return _labelsFromMidiTrackerEntries(value);
	if (typeof value === 'string') return _labelsFromMidiTrackerEntries([value]);
	return [];
}

function _dedupeMidiTrackerLabels(entries = []) {
	return [...new Set(entries.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
}

function _addMidiTrackerEntries(tracker, trackerContext, type, labels = []) {
	trackerContext.dropConfigButtonsAttribution(type, labels);
	const keypressLabels = trackerContext.keypressLabelsByType[type];
	for (const label of labels) {
		const normalizedLabel = trackerContext.normalizeLabel(label);
		if (!normalizedLabel) continue;
		if (keypressLabels?.has(normalizedLabel) && trackerContext.hasMidiKeypressAttribution(type)) continue;
		if (trackerContext.hasEquivalentMidiAttribution(type, label)) continue;
		const displayLabel = trackerContext.withDisplayPrefix(label);
		if (!displayLabel) continue;
		_setMidiTrackerAttribution(tracker, type, displayLabel, displayLabel);
	}
}

function _addMidiTrackerCustomAttributionEntries(tracker, trackerContext, prefixLabel, labels = [], options = {}) {
	const prefix = String(prefixLabel ?? '').trim();
	const cleanedLabels = labels.map((label) => String(label ?? '').trim()).filter(Boolean);
	if (!prefix || !cleanedLabels.length) return;
	const { combineLabelList = false } = options ?? {};
	if (combineLabelList) {
		const displayLabel = `${prefix}: ${cleanedLabels.join(', ')}`;
		const sourceSuffix = trackerContext.normalizeLabel(displayLabel).replace(/[^a-z0-9_-]/g, '-') || 'entry';
		const source = `${trackerContext.legacySourcePrefix}tooltip:${sourceSuffix}:0`;
		_setMidiTrackerAttribution(tracker, 'AC5E', source, displayLabel);
		return;
	}
	for (const [index, label] of cleanedLabels.entries()) {
		const displayLabel = `${prefix}: ${label}`;
		const sourceSuffix = trackerContext.normalizeLabel(displayLabel).replace(/[^a-z0-9_-]/g, '-') || 'entry';
		const source = `${trackerContext.legacySourcePrefix}tooltip:${sourceSuffix}:${index}`;
		_setMidiTrackerAttribution(tracker, 'AC5E', source, displayLabel);
	}
}

function _addMidiTrackerStandaloneAttributionEntries(tracker, trackerContext, labels = []) {
	const cleanedLabels = labels.map((label) => String(label ?? '').trim()).filter(Boolean);
	if (!cleanedLabels.length) return;
	for (const [index, label] of cleanedLabels.entries()) {
		const sourceSuffix = trackerContext.normalizeLabel(label).replace(/[^a-z0-9_-]/g, '-') || 'entry';
		const source = `${trackerContext.legacySourcePrefix}tooltip:${sourceSuffix}:${index}`;
		_setMidiTrackerAttribution(tracker, 'AC5E', source, label);
	}
}

function _getMidiSelectedAdvantageType(ac5eConfig, config) {
	const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE;
	const selectedMode = ac5eConfig?.advantageMode ?? config?.rolls?.[0]?.options?.advantageMode ?? config?.options?.advantageMode;
	return (
		selectedMode === advModes?.ADVANTAGE ? 'ADV'
		: selectedMode === advModes?.DISADVANTAGE ? 'DIS'
		: ''
	);
}

function _syncMidiTrackerConfigButtonFallback(tracker, trackerContext, ac5eConfig, config) {
	const selectedType = _getMidiSelectedAdvantageType(ac5eConfig, config);
	if (!selectedType) return;
	const oppositeType = selectedType === 'ADV' ? 'DIS' : 'ADV';
	const hasOppositeAc5e = trackerContext.hasAc5eAttribution(oppositeType);
	const hasSelectedNonAc5e = trackerContext.hasNonAc5eAttribution(selectedType);
	const hasSelectedAc5e = trackerContext.hasAc5eAttribution(selectedType);
	const shouldAddConfigButtons = (hasOppositeAc5e || !hasSelectedAc5e) && !hasSelectedNonAc5e;
	if (shouldAddConfigButtons) _setMidiTrackerAttribution(tracker, selectedType, 'config-buttons', trackerContext.configButtonsFallbackLabel);
}

export function _syncMidiAttackRollModifierTracker(ac5eConfig, config) {
	if (!_activeModule('midi-qol')) return;
	if (ac5eConfig?.hookType !== 'attack') return;
	const tracker = config?.workflow?.attackRollModifierTracker;
	if (!tracker || typeof tracker !== 'object') return;
	tracker.attribution ??= {};
	if (typeof tracker.attribution !== 'object') return;
	_logMidiTrackerBuildMarkerOnce('helpers._syncMidiAttackRollModifierTracker');
	_logMidiTrackerSnapshot('attack.pre', { hookType: ac5eConfig?.hookType, tracker, ac5eConfig });
	const trackedTypes = ['ADV', 'DIS', 'NOADV', 'NODIS', 'CRIT', 'NOCRIT', 'AC5E'];
	const trackerContext = _createMidiTrackerSyncContext(tracker, trackedTypes);
	const { clearLegacySet, clearTrackedType, dedupeLabels, labelsFromEntries } = trackerContext;
	for (const type of trackedTypes) clearTrackedType(type);
	clearLegacySet(tracker?.legacyAttribution);
	clearLegacySet(tracker?.advReminderAttribution);

	const { filterOptin, subject, opponent, enforcedD20Mode, enforcedModeLabels, advantageLabels, disadvantageLabels, infoLabels, noAdvantageLabels, noDisadvantageLabels } =
		_collectMidiTrackerCoreLabels(ac5eConfig);
	const midiTrackerAdvantageLabels = enforcedD20Mode ? [] : advantageLabels;
	const midiTrackerDisadvantageLabels = enforcedD20Mode ? [] : disadvantageLabels;
	const midiTrackerNoAdvantageLabels = enforcedD20Mode ? [] : noAdvantageLabels;
	const midiTrackerNoDisadvantageLabels = enforcedD20Mode ? [] : noDisadvantageLabels;
	const hiddenResolvedD20AttributionEntries = enforcedD20Mode ? advantageLabels.length + disadvantageLabels.length + noAdvantageLabels.length + noDisadvantageLabels.length : 0;
	const criticalLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.critical ?? [])).concat(labelsFromEntries(filterOptin(opponent?.critical ?? []))));
	const noCriticalLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.noCritical ?? [])).concat(labelsFromEntries(filterOptin(opponent?.noCritical ?? []))));
	_addMidiTrackerEntries(tracker, trackerContext, 'ADV', midiTrackerAdvantageLabels);
	_addMidiTrackerEntries(tracker, trackerContext, 'DIS', midiTrackerDisadvantageLabels);
	_addMidiTrackerEntries(tracker, trackerContext, 'NOADV', midiTrackerNoAdvantageLabels);
	_addMidiTrackerEntries(tracker, trackerContext, 'NODIS', midiTrackerNoDisadvantageLabels);
	_addMidiTrackerEntries(tracker, trackerContext, 'CRIT', criticalLabels);
	_addMidiTrackerEntries(tracker, trackerContext, 'NOCRIT', noCriticalLabels);
	_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.Info'), infoLabels);
	const enforcedModeLabel =
		enforcedD20Mode === 'advantage' ? _localize('DND5E.Advantage')
		: enforcedD20Mode === 'disadvantage' ? _localize('DND5E.Disadvantage')
		: enforcedD20Mode === 'normal' ? _localize('DND5E.Normal')
		: '';
	if (enforcedModeLabels.length && enforcedModeLabel) {
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, `Forced Roll Mode (${enforcedModeLabel})`, enforcedModeLabels, { combineLabelList: true });
	}
	if (hiddenResolvedD20AttributionEntries > 0) {
		_addMidiTrackerStandaloneAttributionEntries(tracker, trackerContext, ['Other roll-state modifiers were overridden.']);
	}
	_syncMidiTrackerConfigButtonFallback(tracker, trackerContext, ac5eConfig, config);
	const subjectBonusLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.bonus ?? [])));
	const subjectModifierLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.modifiers ?? [])));
	const subjectExtraDiceLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.extraDice ?? [])));
	const opponentBonusLabels = dedupeLabels(labelsFromEntries(filterOptin(opponent?.bonus ?? [])));
	const opponentModifierLabels = dedupeLabels(labelsFromEntries(filterOptin(opponent?.modifiers ?? [])));
	const opponentExtraDiceLabels = dedupeLabels(labelsFromEntries(filterOptin(opponent?.extraDice ?? [])));
	const combinedTargetEntries = filterOptin([...(subject?.targetADC ?? []), ...(opponent?.targetADC ?? [])]);
	const targetADCLabels = dedupeLabels(labelsFromEntries(combinedTargetEntries));
	const getNumericTarget = (value) => {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : undefined;
	};
	const initialTargetAcs = Object.values(ac5eConfig?.initialTargetADCs ?? {})
		.map((entry) => getNumericTarget(entry?.ac))
		.filter((value) => value !== undefined);
	const alteredTargetAcs = Object.values(ac5eConfig?.alteredTargetADCs ?? {})
		.map((entry) => getNumericTarget(entry?.ac))
		.filter((value) => value !== undefined);
	const baseTargetAcs = Object.values(ac5eConfig?.preAC5eConfig?.baseTargetAcByKey ?? {})
		.map((entry) => getNumericTarget(entry?.ac))
		.filter((value) => value !== undefined);
	const baseTargetADC =
		(['attack', 'damage'].includes(ac5eConfig?.hookType) && initialTargetAcs.length ? Math.min(...initialTargetAcs) : undefined) ??
		(['attack', 'damage'].includes(ac5eConfig?.hookType) && baseTargetAcs.length ? Math.min(...baseTargetAcs) : undefined) ??
		(['attack', 'damage'].includes(ac5eConfig?.hookType) ? undefined : getNumericTarget(ac5eConfig?.optinBaseTargetADCValue)) ??
		(['attack', 'damage'].includes(ac5eConfig?.hookType) ? undefined : getNumericTarget(ac5eConfig?.preAC5eConfig?.baseRoll0Options?.target)) ??
		getNumericTarget(ac5eConfig?.initialTargetADC) ??
		getNumericTarget(config?.target) ??
		getNumericTarget(config?.rolls?.[0]?.options?.target) ??
		getNumericTarget(config?.rolls?.[0]?.target) ??
		10;
	const targetValues = combinedTargetEntries.flatMap((entry) => (Array.isArray(entry?.values) ? entry.values : []));
	const targetValuePool =
		targetValues.length ? targetValues
		: Array.isArray(ac5eConfig?.targetADC) ? ac5eConfig.targetADC
		: [];
	const alteredTargetADC =
		getNumericTarget(ac5eConfig?.alteredTargetADC) ??
		(['attack', 'damage'].includes(ac5eConfig?.hookType) && alteredTargetAcs.length ? Math.min(...alteredTargetAcs) : undefined) ??
		(targetValuePool.length ? getAlteredTargetValueOrThreshold(baseTargetADC, targetValuePool, 'acBonus') : undefined);
	const targetADCDisplayLabels = targetADCLabels.length ? targetADCLabels : dedupeLabels(targetValuePool.map((value) => String(value ?? '').trim()).filter(Boolean));
	const modifyACPrefix = targetADCDisplayLabels.length ? `${_localize('AC5E.ModifyAC')}${alteredTargetADC !== undefined ? ` ${alteredTargetADC} (${baseTargetADC})` : ''}` : '';
	_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.Bonus'), subjectBonusLabels);
	_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('DND5E.Modifier'), subjectModifierLabels);
	_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.ExtraDice'), subjectExtraDiceLabels);
	_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.TargetGrantsBonus'), opponentBonusLabels);
	_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.TargetGrantsModifier'), opponentModifierLabels);
	_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.TargetGrantsExtraDice'), opponentExtraDiceLabels);
	_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, modifyACPrefix, targetADCDisplayLabels);
	_logMidiTrackerSnapshot('attack.post', {
		hookType: ac5eConfig?.hookType,
		tracker,
		ac5eConfig,
		extra: {
			advantageLabels: midiTrackerAdvantageLabels,
			disadvantageLabels: midiTrackerDisadvantageLabels,
			noAdvantageLabels: midiTrackerNoAdvantageLabels,
			noDisadvantageLabels: midiTrackerNoDisadvantageLabels,
			enforcedD20Mode,
			enforcedModeLabels,
			targetADCDisplayLabels,
		},
	});
}

export function _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, type) {
	if (!type) return [];
	const entries = [];
	const trackers = _collectMidiAbilityRollModifierTrackers(ac5eConfig, config, dialog, { requireWritable: false, includeAllChoices: true });
	for (const tracker of trackers) {
		const typeEntries = tracker?.attribution?.[type];
		if (!typeEntries || typeof typeEntries !== 'object') continue;
		for (const [source, value] of Object.entries(typeEntries)) {
			if (typeof source === 'string') {
				const normalized = source.trim();
				if (normalized.startsWith(`${Constants.MODULE_ID}:`) || /^ac5e(?:\b|[:\s-])/i.test(normalized)) continue;
			}
			const label = _normalizeMidiAttributionLabel(value, source);
			if (label) entries.push(label);
		}
	}
	return [...new Set(entries)];
}

function _resolveMidiAbilityWorkflow(config) {
	const directWorkflow = config?.midiOptions?.workflow;
	if (directWorkflow && typeof directWorkflow === 'object') return directWorkflow;
	const workflowId = config?.midiOptions?.workflowId;
	if (!workflowId) return undefined;
	return globalThis?.MidiQOL?.Workflow?.getWorkflow?.(workflowId);
}

function _matchingMidiAbilityWorkflowSaveDetails(ac5eConfig, config) {
	const workflow = _resolveMidiAbilityWorkflow(config);
	const targetSaveDetails = workflow?.targetSaveDetails;
	if (!targetSaveDetails || typeof targetSaveDetails !== 'object') return [];
	const token = canvas?.tokens?.get?.(ac5eConfig?.tokenId);
	const actorUuid = token?.actor?.uuid;
	const tokenDocUuid = token?.document?.uuid;
	const rollActorUuid = config?.rolls?.[0]?.options?.actorUuid ?? config?.rolls?.[0]?.data?.actorUuid;
	const candidateActorUuids = new Set([actorUuid, rollActorUuid].filter((value) => typeof value === 'string' && value.trim()));
	const candidateTokenDocUuids = new Set([tokenDocUuid].filter((value) => typeof value === 'string' && value.trim()));
	const entries = Object.entries(targetSaveDetails ?? {}).filter(([, saveDetails]) => saveDetails && typeof saveDetails === 'object');
	const hasActorCandidates = candidateActorUuids.size > 0;
	const hasTokenCandidates = candidateTokenDocUuids.size > 0;
	if (!hasActorCandidates && !hasTokenCandidates) return entries.length === 1 ? entries : [];
	const matches = entries.filter(([workflowTokenDocUuid, saveDetails]) => {
		const entryActorUuid = saveDetails?.actorUuid;
		const actorMatch = hasActorCandidates && typeof entryActorUuid === 'string' ? candidateActorUuids.has(entryActorUuid) : false;
		const tokenMatch = hasTokenCandidates ? candidateTokenDocUuids.has(workflowTokenDocUuid) : false;
		return actorMatch || tokenMatch;
	});
	if (matches.length) return matches;
	if (entries.length === 1) return entries;
	return [];
}

function _collectMidiAbilityRollModifierTrackers(ac5eConfig, config, dialog, { requireWritable = true, includeAllChoices = false } = {}) {
	const toTracker = (value) => {
		if (!value || typeof value !== 'object') return undefined;
		const tracker = value?.tracker ?? value;
		if (!tracker || typeof tracker !== 'object') return undefined;
		if (requireWritable && typeof tracker.addAttribution !== 'function') return undefined;
		return tracker;
	};
	const collected = [];
	const seen = new Set();
	const collect = (value) => {
		const tracker = toTracker(value);
		if (!tracker || seen.has(tracker)) return;
		seen.add(tracker);
		collected.push(tracker);
	};
	const maps = [config?.midiOptions?.advantageByChoice, config?.options?.advantageByChoice, dialog?.options?.advantageByChoice].filter((candidate) => candidate && typeof candidate === 'object');
	const choiceKeys = [
		config?.skill,
		config?.tool,
		config?.ability,
		config?.rolls?.[0]?.options?.midiChosenId,
		config?.rolls?.[0]?.options?.ability,
		config?.rolls?.[0]?.options?.skill,
		config?.rolls?.[0]?.options?.tool,
		ac5eConfig?.options?.skill,
		ac5eConfig?.options?.tool,
		ac5eConfig?.options?.ability,
	]
		.map((value) => (typeof value === 'string' ? value.trim() : ''))
		.filter(Boolean);
	for (const map of maps) {
		for (const key of choiceKeys) {
			collect(map?.[key]);
		}
	}
	if (includeAllChoices) {
		for (const map of maps) {
			for (const value of Object.values(map ?? {})) collect(value);
		}
	}
	const chosenId = config?.rolls?.[0]?.options?.midiChosenId;
	const workflowSaveDetailsMatches = _matchingMidiAbilityWorkflowSaveDetails(ac5eConfig, config);
	for (const [, saveDetails] of workflowSaveDetailsMatches) {
		collect(saveDetails?.modifierTracker);
		const choiceMap = saveDetails?.advantageByChoice;
		if (!choiceMap || typeof choiceMap !== 'object') continue;
		if (typeof chosenId === 'string' && chosenId.trim()) collect(choiceMap[chosenId.trim()]);
		if (includeAllChoices) {
			for (const value of Object.values(choiceMap ?? {})) collect(value);
		}
		const choiceEntries = Object.values(choiceMap ?? {});
		if (choiceEntries.length === 1) collect(choiceEntries[0]);
	}
	for (const map of maps) {
		const entries = Object.values(map ?? {});
		if (entries.length !== 1) continue;
		collect(entries[0]);
	}
	collect(config?.midiOptions?.modifierTracker);
	collect(config?.midiOptions?.tracker);
	return collected;
}

export function _midiOwnsAbilityTooltipPipeline(ac5eConfig, config, dialog) {
	if (!_activeModule('midi-qol')) return false;
	if (!['check', 'save'].includes(ac5eConfig?.hookType)) return false;
	const hasWorkflowOptions = !foundry.utils.isEmpty(config?.workflowOptions ?? {});
	if (hasWorkflowOptions) return true;
	const trackers = _collectMidiAbilityRollModifierTrackers(ac5eConfig, config, dialog, { requireWritable: false, includeAllChoices: true });
	if (trackers.length) return true;
	const midiOptions = config?.midiOptions ?? {};
	return [midiOptions?.advantageByChoice, midiOptions?.modifierTracker, midiOptions?.tracker].some((value) => value && typeof value === 'object' && !foundry.utils.isEmpty(value));
}

export function _getD20TooltipOwnership(ac5eConfig, { midiRoller = _activeModule('midi-qol') } = {}) {
	const hookType = ac5eConfig?.hookType;
	const forceAc5eD20Tooltip = hookType !== 'attack' && hookType !== 'damage' && !!ac5eConfig?.preAC5eConfig?.forceChatTooltip;
	const midiOwnsD20Tooltip = !!midiRoller && !forceAc5eD20Tooltip && (hookType === 'attack' || (['check', 'save'].includes(hookType) && !!ac5eConfig?.preAC5eConfig?.midiOwnsAbilityTooltip));
	const deferD20KeypressToMidi = midiOwnsD20Tooltip && hookType !== 'damage';
	const useMidiD20Attribution = midiOwnsD20Tooltip && hookType !== 'damage';
	return {
		forceAc5eD20Tooltip,
		midiOwnsD20Tooltip,
		deferD20KeypressToMidi,
		useMidiD20Attribution,
	};
}

export function _syncMidiAbilityRollModifierTracker(ac5eConfig, config, dialog) {
	if (!_activeModule('midi-qol')) return;
	if (!['check', 'save'].includes(ac5eConfig?.hookType)) return;
	const trackers = _collectMidiAbilityRollModifierTrackers(ac5eConfig, config, dialog, { requireWritable: false, includeAllChoices: true });
	if (!trackers.length) return;
	_logMidiTrackerBuildMarkerOnce('helpers._syncMidiAbilityRollModifierTracker');
	for (const [trackerIndex, tracker] of trackers.entries()) {
		tracker.attribution ??= {};
		if (typeof tracker.attribution !== 'object') continue;
		_logMidiTrackerSnapshot('ability.pre', { hookType: ac5eConfig?.hookType, tracker, ac5eConfig, extra: { trackerIndex, trackerCount: trackers.length } });
		const trackedTypes = ['ADV', 'DIS', 'NOADV', 'NODIS', 'FAIL', 'SUCCESS', 'AC5E'];
		const trackerContext = _createMidiTrackerSyncContext(tracker, trackedTypes);
		const { clearLegacySet, clearTrackedType, dedupeLabels, labelsFromEntries } = trackerContext;
		for (const type of trackedTypes) clearTrackedType(type);
		clearLegacySet(tracker?.legacyAttribution);
		clearLegacySet(tracker?.advReminderAttribution);

		const { filterOptin, subject, opponent, enforcedD20Mode, enforcedModeLabels, advantageLabels, disadvantageLabels, infoLabels, noAdvantageLabels, noDisadvantageLabels } =
			_collectMidiTrackerCoreLabels(ac5eConfig);
		const midiTrackerAdvantageLabels = enforcedD20Mode ? [] : advantageLabels;
		const midiTrackerDisadvantageLabels = enforcedD20Mode ? [] : disadvantageLabels;
		const midiTrackerNoAdvantageLabels = enforcedD20Mode ? [] : noAdvantageLabels;
		const midiTrackerNoDisadvantageLabels = enforcedD20Mode ? [] : noDisadvantageLabels;
		const hiddenResolvedD20AttributionEntries = enforcedD20Mode ? advantageLabels.length + disadvantageLabels.length + noAdvantageLabels.length + noDisadvantageLabels.length : 0;
		const failLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.fail ?? [])).concat(labelsFromEntries(filterOptin(opponent?.fail ?? []))));
		const successLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.success ?? [])).concat(labelsFromEntries(filterOptin(opponent?.success ?? []))));
		const combinedTargetEntries = filterOptin([...(subject?.targetADC ?? []), ...(opponent?.targetADC ?? [])]);
		const targetADCLabels = dedupeLabels(labelsFromEntries(combinedTargetEntries));
		_addMidiTrackerEntries(tracker, trackerContext, 'ADV', midiTrackerAdvantageLabels);
		_addMidiTrackerEntries(tracker, trackerContext, 'DIS', midiTrackerDisadvantageLabels);
		_addMidiTrackerEntries(tracker, trackerContext, 'NOADV', midiTrackerNoAdvantageLabels);
		_addMidiTrackerEntries(tracker, trackerContext, 'NODIS', midiTrackerNoDisadvantageLabels);
		_addMidiTrackerEntries(tracker, trackerContext, 'FAIL', failLabels);
		_addMidiTrackerEntries(tracker, trackerContext, 'SUCCESS', successLabels);
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.Info'), infoLabels, { combineLabelList: true });
		const enforcedModeLabel =
			enforcedD20Mode === 'advantage' ? _localize('DND5E.Advantage')
			: enforcedD20Mode === 'disadvantage' ? _localize('DND5E.Disadvantage')
			: enforcedD20Mode === 'normal' ? _localize('DND5E.Normal')
			: '';
		if (enforcedModeLabels.length && enforcedModeLabel) {
			_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, `Forced Roll Mode (${enforcedModeLabel})`, enforcedModeLabels, { combineLabelList: true });
		}
		if (hiddenResolvedD20AttributionEntries > 0) {
			_addMidiTrackerStandaloneAttributionEntries(tracker, trackerContext, ['Other roll-state modifiers were overridden.']);
		}
		_syncMidiTrackerConfigButtonFallback(tracker, trackerContext, ac5eConfig, config);
		const subjectBonusLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.bonus ?? [])));
		const subjectModifierLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.modifiers ?? [])));
		const subjectExtraDiceLabels = dedupeLabels(labelsFromEntries(filterOptin(subject?.extraDice ?? [])));
		const opponentBonusLabels = dedupeLabels(labelsFromEntries(filterOptin(opponent?.bonus ?? [])));
		const opponentModifierLabels = dedupeLabels(labelsFromEntries(filterOptin(opponent?.modifiers ?? [])));
		const opponentExtraDiceLabels = dedupeLabels(labelsFromEntries(filterOptin(opponent?.extraDice ?? [])));
		const getNumericTarget = (value) => {
			const numeric = Number(value);
			return Number.isFinite(numeric) ? numeric : undefined;
		};
		const baseTargetADC =
			(['attack', 'damage'].includes(ac5eConfig?.hookType) ? undefined : getNumericTarget(ac5eConfig?.optinBaseTargetADCValue)) ??
			(['attack', 'damage'].includes(ac5eConfig?.hookType) ? undefined : getNumericTarget(ac5eConfig?.preAC5eConfig?.baseRoll0Options?.target)) ??
			getNumericTarget(ac5eConfig?.initialTargetADC) ??
			getNumericTarget(config?.target) ??
			getNumericTarget(config?.rolls?.[0]?.options?.target) ??
			getNumericTarget(config?.rolls?.[0]?.target) ??
			10;
		const targetValues = combinedTargetEntries.flatMap((entry) => (Array.isArray(entry?.values) ? entry.values : []));
		const targetValuePool =
			targetValues.length ? targetValues
			: Array.isArray(ac5eConfig?.targetADC) ? ac5eConfig.targetADC
			: [];
		const alteredTargetADC = getNumericTarget(ac5eConfig?.alteredTargetADC) ?? (targetValuePool.length ? getAlteredTargetValueOrThreshold(baseTargetADC, targetValuePool, 'dcBonus') : undefined);
		const targetADCDisplayLabels = targetADCLabels.length ? targetADCLabels : dedupeLabels(targetValuePool.map((value) => String(value ?? '').trim()).filter(Boolean));
		const modifyDCPrefix = targetADCDisplayLabels.length ? `${_localize('AC5E.ModifyDC')}${alteredTargetADC !== undefined ? ` ${alteredTargetADC} (${baseTargetADC})` : ''}` : '';
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.Bonus'), subjectBonusLabels);
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('DND5E.Modifier'), subjectModifierLabels);
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.ExtraDice'), subjectExtraDiceLabels);
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.TargetGrantsBonus'), opponentBonusLabels);
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.TargetGrantsModifier'), opponentModifierLabels);
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, _localize('AC5E.TargetGrantsExtraDice'), opponentExtraDiceLabels);
		_addMidiTrackerCustomAttributionEntries(tracker, trackerContext, modifyDCPrefix, targetADCDisplayLabels, { combineLabelList: true });
		_logMidiTrackerSnapshot('ability.post', {
			hookType: ac5eConfig?.hookType,
			tracker,
			ac5eConfig,
			extra: {
				trackerIndex,
				trackerCount: trackers.length,
				advantageLabels,
				disadvantageLabels,
				failLabels,
				successLabels,
				modifyDCPrefix,
				targetADCDisplayLabels,
			},
		});
	}
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

export function _activeModule(moduleID) {
	return game.modules.get(moduleID)?.active;
}

export function _staticID(id) {
	id = `dnd5e${id}`;
	if (id.length >= 16) return id.substring(0, 16);
	return id.padEnd(16, '0');
}

function _getActionType(activity, returnClassifications = false) {
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

	let origin = _safeFromUuidSync(effect.origin);
	let actor = _resolveActorFromOrigin(origin);

	// Check if origin itself has an origin (chained origin), resolve again
	if (!actor && origin?.origin) {
		const deeperOrigin = _safeFromUuidSync(origin.origin);
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

function _resolveActorFromOrigin(origin) {
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
		`${moduleFlagScope}.range.noNearbyFoeDisadvantage`,
		`${moduleFlagScope}.grants.range.noNearbyFoeDisadvantage`,
		`${moduleFlagScope}.aura.range.noNearbyFoeDisadvantage`,
		`${moduleFlagScope}.range.outOfRangeFail`,
		`${moduleFlagScope}.grants.range.outOfRangeFail`,
		`${moduleFlagScope}.aura.range.outOfRangeFail`,
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
		abilityOverride: ['attack'],
		bonus: allModesActionTypes,
		critical: allModesActionTypes,
		disadvantage: allModesActionTypes,
		info: [...allModesActionTypes, 'use'],
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
	const genericActionTypeModes = ['advantage', 'bonus', 'critical', 'disadvantage', 'fail', 'fumble', 'info', 'modifier', 'modifyDC', 'noAdvantage', 'noCritical', 'noDisadvantage', 'success'];
	for (const scope of scopes) {
		for (const mode of genericActionTypeModes) moduleFlags.add(`${scope.prefix}.ACTIONTYPE.${mode}`);
	}

	// DAE autocomplete should only expose canonical long-scope keys.
	return Array.from(moduleFlags).filter((key) => key.startsWith(`${moduleFlagScope}.`)); //to-do: clean up (probably not needed anymore)
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
		else if (actor.includes('.')) actor = _safeFromUuidSync(actor);
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
		try {
			return fromUuidSync(value, { strict: false }) ?? null;
		} catch (_err) {
			return null;
		}
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
