import Constants from './ac5e-constants.mjs';
import { _activeModule, _dispositionCheck, _filterOptinEntries, _getDistance, _hasItem, _hasStatuses, _localize, _safeFromUuidSync } from './ac5e-helpers.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();
const _canSeeDebugEnabled = () => Boolean(settings.debug || globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.canSee);

export function findNearby({ token, disposition = 'all', radius = 5, lengthTest = false, hasEffects = [], hasStatuses = [], includeToken = false, includeIncapacitated = false, partyMember = false }) {
	if (!canvas || !canvas.tokens?.placeables) return false;
	const tokenInstance = foundry.canvas.placeables.Token;
	if (token instanceof TokenDocument) {
		token = token.object;
	} else if (!(token instanceof tokenInstance)) {
		const resolved = _safeFromUuidSync(token);
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
		if (hasEffects.length && !target.actor?.appliedEffects.some((e) => hasEffects.includes(e.name))) return false;
		if (hasStatuses.length && !_hasStatuses(target.actor, hasStatuses, true)) return false;
		if (radius === 0) return true;
		const distance = _getDistance(token, target);
		return distance <= radius;
	});
	if (settings.debug) console.log('AC5E - findNearby():', nearbyTokens);
	if (lengthTest === true) return nearbyTokens.length;
	if (typeof lengthTest === 'number') return nearbyTokens.length >= lengthTest;
	return nearbyTokens;
}

export function checkNearby(token, disposition, radius, { count = false, includeToken = false, includeIncapacitated = false, hasEffects = [], hasStatuses = [], partyMember = false } = {}) {
	return findNearby({ token, disposition, radius, hasEffects, hasStatuses, includeToken, includeIncapacitated, lengthTest: count, partyMember });
}

export function autoRanged(activity, token, target, options = {}) {
	if (typeof activity === 'string') activity = fromUuidSync(activity);
	const distanceUnit = canvas.grid.distance;
	const distanceLabelUnit = canvas.grid.units || '';
	const modernRules = settings.dnd5eModernRules;
	const isSpell = activity.isSpell;
	const isAttack = activity.type === 'attack';
	const hookType = options.ac5eConfig?.hookType ?? options?.hook;
	const isRangeProfileContext = hookType === 'attack' || hookType === 'use' || !hookType;
	const isAttackRangeContext = isAttack && isRangeProfileContext;
	const { checkRange: midiCheckRange, nearbyFoe: midiNearbyFoe } = _activeModule('midi-qol') && MidiQOL.configSettings().optionalRulesEnabled ? MidiQOL.configSettings().optionalRules : {};
	const allowMidiRangeOverride = options?.allowMidiRangeOverride !== false;
	const midiChecks = allowMidiRangeOverride && midiCheckRange && midiCheckRange !== 'none';
	const actionType = options.actionType ?? activity?.getActionType?.(options?.attackMode) ?? activity?.actionType;
	const item =
		activity?.item ??
		(typeof options?.item === 'string' ? fromUuidSync(options.item)
		: options?.item instanceof Item ? options.item
		: null);
	if (!token) return {};
	const resolveBaseRange = () => {
		const activityRange = activity?.range;
		if (activityRange?.override !== false) return activityRange;
		const itemRange = item?.system?.range;
		return itemRange ?? activityRange;
	};
	const range = resolveBaseRange();
	if (!range) return {};
	const baseShort = Number.isFinite(Number(range?.value)) ? Number(range.value) : undefined;
	const baseLong = Number.isFinite(Number(range?.long)) ? Number(range.long) : undefined;
	const baseReach = Number.isFinite(Number(range?.reach)) ? Number(range.reach) : undefined;
	let short = baseShort;
	let long = baseLong;
	let reach = baseReach;
	const distance = options?.distance ?? (target ? _getDistance(token, target) : undefined);
	const normalizedDamageTypes =
		Array.isArray(options?.damageTypes) ? options.damageTypes
		: options?.damageTypes ? [options.damageTypes]
		: [];
	const selectedDamageTypes = new Set([options?.defaultDamageType ?? '', ...normalizedDamageTypes].map((t) => String(t ?? '').toLowerCase()).filter(Boolean));
	const rangeEntries = (() => {
		if (midiChecks) return [];
		const ac5eConfig = options?.ac5eConfig;
		if (!ac5eConfig) return [];
		const subjectEntries = Array.isArray(ac5eConfig?.subject?.range) ? ac5eConfig.subject.range : [];
		const opponentEntries = Array.isArray(ac5eConfig?.opponent?.range) ? ac5eConfig.opponent.range : [];
		return _filterOptinEntries(subjectEntries.concat(opponentEntries), ac5eConfig?.optinSelected).filter((entry) => {
			if (!entry || typeof entry !== 'object' || entry.mode !== 'range') return false;
			if (!isRangeProfileContext) return false;
			if (entry.hook) {
				const allowedHooks =
					hookType === 'use' ? new Set(['use'])
					: hookType === 'attack' ? new Set(['attack'])
					: new Set(['attack', 'use']);
				if (!allowedHooks.has(entry.hook)) return false;
			}
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
	const formatDistance = (value) => {
		const numericValue = Number(value);
		if (!Number.isFinite(numericValue)) return null;
		return distanceLabelUnit ? `${numericValue} ${distanceLabelUnit}` : String(numericValue);
	};
	const formatRangeProfile = ({ short: shortValue, long: longValue, reach: reachValue }) => {
		const parts = [];
		const formattedShort = formatDistance(shortValue);
		const formattedLong = formatDistance(longValue);
		const formattedReach = formatDistance(reachValue);
		if (formattedShort && formattedLong) parts.push(`${formattedShort}/${formattedLong}`);
		else if (formattedShort) parts.push(formattedShort);
		else if (formattedLong) parts.push(`long ${formattedLong}`);
		if (formattedReach) parts.push(`reach ${formattedReach}`);
		return parts.join(', ');
	};
	const buildRangeNotes = () => {
		const notes = [];
		const baseProfile = formatRangeProfile({ short: baseShort, long: baseLong, reach: baseReach });
		const resolvedProfile = formatRangeProfile({ short, long, reach });
		if (resolvedProfile && resolvedProfile !== baseProfile) {
			const rangeOverrideLabel = profileSourceLabels.size ? [...profileSourceLabels].join(', ') : 'Override';
			notes.push(baseProfile ? `${rangeOverrideLabel} ${resolvedProfile} (${baseProfile})` : `${rangeOverrideLabel} ${resolvedProfile}`);
		}
		if (noLongDisadvantageSourceLabel) notes.push(`Long-range disadvantage disabled: ${noLongDisadvantageSourceLabel}`);
		if (outOfRangeFailSourceLabel) {
			if (outOfRangeFail) notes.push(`Out-of-range fail enabled: ${outOfRangeFailSourceLabel}`);
			else notes.push(`Out-of-range fail disabled: ${outOfRangeFailSourceLabel}`);
		}
		return [...new Set(notes)];
	};
	let longDisadvantage = midiChecks ? false : settings.autoRangeChecks.has('rangedLongDisadvantage');
	let nearbyFoeDisadvantage = settings.autoRangeChecks.has('rangedNearbyFoes');
	let outOfRangeFail = midiChecks ? false : settings.autoRangeChecks.has('rangedOoR');
	let noLongDisadvantageSourceLabel;
	let noLongDisadvantageSourceMode;
	let outOfRangeFailSourceLabel;
	let outOfRangeFailSourceMode;
	const profileSourceLabels = new Set();
	const supportsAttackOnlyRangeEffects = isAttackRangeContext && ['mwak', 'msak', 'rwak', 'rsak'].includes(actionType);
	for (const entry of rangeEntries) {
		const rangeConfig = entry?.range ?? {};
		const entryLabel = getRangeEntryLabel(entry);
		if ((rangeConfig.short || rangeConfig.long || rangeConfig.reach || rangeConfig.bonus) && entryLabel) profileSourceLabels.add(entryLabel);
		short = applyRangeComponent(short, rangeConfig.short);
		long = applyRangeComponent(long, rangeConfig.long);
		reach = applyRangeComponent(reach, rangeConfig.reach);
		if (rangeConfig.bonus) {
			short = applyRangeComponent(short, rangeConfig.bonus);
			long = applyRangeComponent(long, rangeConfig.bonus);
			reach = applyRangeComponent(reach, rangeConfig.bonus);
		}
		if (supportsAttackOnlyRangeEffects) {
			if (typeof rangeConfig.longDisadvantage === 'boolean') longDisadvantage = rangeConfig.longDisadvantage;
			if (typeof rangeConfig.noLongDisadvantage === 'boolean') {
				longDisadvantage = !rangeConfig.noLongDisadvantage;
				noLongDisadvantageSourceLabel = entryLabel;
				noLongDisadvantageSourceMode = 'noLongDisadvantage';
			}
			if (typeof rangeConfig.nearbyFoeDisadvantage === 'boolean') nearbyFoeDisadvantage = rangeConfig.nearbyFoeDisadvantage;
			if (typeof rangeConfig.nearbyFoes === 'boolean') nearbyFoeDisadvantage = rangeConfig.nearbyFoes;
			if (typeof rangeConfig.noNearbyFoeDisadvantage === 'boolean') nearbyFoeDisadvantage = !rangeConfig.noNearbyFoeDisadvantage;
			if (typeof rangeConfig.noNearbyFoes === 'boolean') nearbyFoeDisadvantage = !rangeConfig.noNearbyFoes;
		}
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
	if (ac5e?.debug?.range && rangeEntries.length) {
		console.log(
			'AC5E range.autoRanged',
			JSON.stringify({
				activity: activity?.name ?? item?.name ?? activity?.id,
				actionType,
				attackMode: options?.attackMode,
				hookType,
				distance,
				baseRange: {
					short: range?.value,
					long: range?.long,
					reach: range?.reach,
				},
				entries: rangeEntries.map((entry) => ({
					label: getRangeEntryLabel(entry),
					hook: entry?.hook,
					range: entry?.range ?? {},
				})),
				resolvedRange: {
					short,
					long,
					reach,
					noLongDisadvantageSourceLabel,
					noLongDisadvantageSourceMode,
					longDisadvantage,
					nearbyFoeDisadvantage,
					outOfRangeFail,
					outOfRangeFailSourceLabel,
					outOfRangeFailSourceMode,
				},
			}),
		);
	}
	const noLongDisadvantage = !longDisadvantage;
	const flags = token.actor?.flags?.[Constants.MODULE_ID];
	const spellSniper = flags?.spellSniper || _hasItem(token.actor, 'AC5E.Feats.SpellSniper');
	if (spellSniper && isSpell && isAttack && !!short) {
		if (modernRules && short >= 2 * distanceUnit) short += 12 * distanceUnit;
		else short *= 2;
	}
	if (settings.autoRangeChecks.has('meleeOoR') && reach && ['mwak', 'msak'].includes(actionType) && !options?.attackMode?.includes('thrown')) {
		const inReach = distance <= reach;
		const meleeOutOfRangeFail = inReach ? false : outOfRangeFail;
		return {
			nearbyFoe: false,
			inRange: inReach,
			range: 'normal',
			longDisadvantage: false,
			outOfRangeFail: meleeOutOfRangeFail,
			outOfRangeFailSourceLabel: !inReach && outOfRangeFailSourceLabel ? outOfRangeFailSourceLabel : 'meleeOoR',
			outOfRangeFailSourceMode: !inReach && outOfRangeFailSourceMode ? outOfRangeFailSourceMode : 'meleeOoR',
			distance,
			rangeNotes: buildRangeNotes(),
		};
	}
	const sharpShooter = flags?.sharpShooter || _hasItem(token.actor, 'AC5E.Feats.Sharpshooter');
	if (sharpShooter && long && actionType == 'rwak') short = long;
	const crossbowExpert = flags?.crossbowExpert || _hasItem(token.actor, 'AC5E.Feats.CrossbowExpert');

	const nearbyFoe =
		supportsAttackOnlyRangeEffects &&
		!midiNearbyFoe &&
		!['mwak', 'msak'].includes(actionType) &&
		nearbyFoeDisadvantage &&
		findNearby({ token, disposition: 'opposite', radius: distanceUnit, lengthTest: 1 }) &&
		!crossbowExpert &&
		!(modernRules && ((isSpell && spellSniper) || (!isSpell && sharpShooter)));
	let isShort, isLong;
	if (midiChecks || (!outOfRangeFail && !longDisadvantage) || (!short && !long) || distance <= short) isShort = true;
	if (!isShort) {
		if (longDisadvantage || outOfRangeFail) isLong = distance <= long;
		if (!isLong && !outOfRangeFail) isLong = true;
	}
	const inRange =
		isShort ? 'short'
		: isLong ? 'long'
		: false;
	if (ac5e?.debug?.range && rangeEntries.length) {
		console.log(
			'AC5E range.result',
			JSON.stringify({
				activity: activity?.name ?? item?.name ?? activity?.id,
				actionType,
				attackMode: options?.attackMode,
				distance,
				short,
				long,
				reach,
				inRange,
				nearbyFoe,
				noLongDisadvantageSourceLabel,
				noLongDisadvantageSourceMode,
				longDisadvantage,
				outOfRangeFail,
				outOfRangeFailSourceLabel,
				outOfRangeFailSourceMode,
			}),
		);
	}
	return {
		inRange: !!inRange,
		range: inRange,
		distance,
		nearbyFoe,
		noLongDisadvantage,
		noLongDisadvantageSourceLabel,
		noLongDisadvantageSourceMode,
		longDisadvantage,
		outOfRangeFail,
		outOfRangeFailSourceLabel,
		outOfRangeFailSourceMode,
		rangeNotes: buildRangeNotes(),
	};
}

export function checkRanged(activity, token, target, options = {}) {
	return autoRanged(activity, token, target, { ...options, allowMidiRangeOverride: false });
}

export function canSee(source, target, status) {
	const resolvedSource = _resolveVisibilityToken(source);
	const resolvedTarget = _resolveVisibilityToken(target);
	source = resolvedSource;
	target = resolvedTarget;
	if (!source || !target) {
		if (_canSeeDebugEnabled()) console.warn('AC5e: No valid tokens for canSee check');
		return false;
	}
	const detectionModes = CONFIG.Canvas?.detectionModes ?? {};
	const matchedModes = new Set();
	const { visionSource, temporaryVision, detectionModes: tokenDetectionModes } = _getVisionSourceForCanSee(source);
	if (!visionSource) {
		if (_canSeeDebugEnabled()) console.warn('AC5e: No valid vision source for canSee check', { source: source?.id, target: target?.id });
		return false;
	}
	const { tests, level } = _createVisibilityTests(target, visionSource);
	const config = { tests, object: target, level };
	const availableModeIds = new Set(tokenDetectionModes.map((mode) => mode?.id).filter(Boolean));
	let validModes = ['basicSight', 'lightPerception', 'blindsight', 'seeAll', 'seeInvisibility'];

	const sourceBlinded = source.actor?.statuses.has('blinded');
	const targetInvisible = target.actor?.statuses.has('invisible');
	const sourceEthereal = source.actor?.statuses.has('ethereal');
	const targetEthereal = target.actor?.statuses.has('ethereal');
	const crossPlanarEthereal = (status === 'ethereal' || sourceEthereal || targetEthereal) && !(sourceEthereal && targetEthereal);
	if (status === 'blinded' || sourceBlinded) validModes = ['blindsight'];
	else if (crossPlanarEthereal) validModes = ['seeAll'];
	else if (status === 'invisible' || targetInvisible) validModes = ['blindsight', 'seeAll', 'seeInvisibility'];
	validModes = new Set(availableModeIds.size ? validModes.filter((mode) => availableModeIds.has(mode)) : validModes);
	try {
		for (const detectionMode of tokenDetectionModes) {
			if (!detectionMode?.enabled || (!detectionMode?.range && detectionMode?.range !== 0)) continue;
			if (!validModes.has(detectionMode.id)) continue;
			const mode = detectionModes[detectionMode.id];
			const result = mode ? mode.testVisibility(visionSource, detectionMode, config) : false;
			if (result === true && mode?.id) matchedModes.add(mode.id);
		}
		if (_canSeeDebugEnabled()) {
			console.warn(`${Constants.MODULE_NAME_SHORT}.canSee()`, {
				source: source?.id,
				target: target?.id,
				status,
				validModes: Array.from(validModes),
				result: matchedModes,
				tests: tests.map((test) => ({ x: test.point.x, y: test.point.y, elevation: test.elevation })),
				temporaryVision,
				sourceId: source.sourceId,
			});
		}
		return matchedModes.size > 0;
	} finally {
		_destroyTemporaryVisionSource(visionSource, temporaryVision);
	}
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

function _resolveVisibilityToken(token) {
	const tokenInstance = foundry.canvas.placeables.Token;
	if (token instanceof TokenDocument) return token.object;
	if (token instanceof tokenInstance) return token;
	if (typeof token === 'string') {
		const resolved = _safeFromUuidSync(token);
		if (resolved?.type === 'Token') return resolved.object;
		if (resolved instanceof TokenDocument) return resolved.object;
		return canvas?.tokens?.get?.(token) ?? null;
	}
	return token ?? null;
}

function _createVisibilityTests(target, visionSource) {
	const targetPoint = target.center;
	const t = Math.min(target.w ?? 0, target.h ?? 0) / 4;
	const t2 = Math.max(0, Math.min(target.w ?? 0, target.h ?? 0) / 2 - 2);
	const offsets = t > 0
		? [[0, 0], [-t, -t], [-t, t], [t, t], [t, -t], [-t, 0], [t, 0], [0, -t], [0, t], [-t2, -t2], [-t2, t2], [t2, t2], [t2, -t2], [-t2, 0], [t2, 0], [0, -t2], [0, t2]]
		: [[0, 0]];
	const elevation = target.document?.elevation ?? target.elevation ?? 0;
	const tokenInstance = foundry.canvas.placeables.Token;
	const level = target instanceof tokenInstance ? canvas.scene?.levels?.get(target.document?.level) ?? canvas.level : canvas.level;
	const tests = offsets.map(([dx, dy]) => {
		const test = {
			point:  { x: targetPoint.x + dx, y: targetPoint.y + dy, elevation },
			level,
			los: new Map(),
		};
		return Object.defineProperty(test, 'elevation', {
			get() {
				return this.point.elevation;
			},
			set(value) {
				this.point.elevation = value;
			},
		});
	});
	if (visionSource) _populateVisibilityLOS(tests, visionSource);
	return { tests, level };
}

function _populateVisibilityLOS(tests, visionSource) {
	const sightBackend = CONFIG.Canvas?.polygonBackends?.sight;
	if (!visionSource || !sightBackend?.testCollision) return;
	const origin = { x: visionSource.x, y: visionSource.y };
	for (const test of tests) {
		const collision = sightBackend.testCollision(origin, test.point, {
			type: 'sight',
			mode: 'any',
			source: visionSource,
			useThreshold: true,
			priority: visionSource.priority,
		});
		test.los.set(visionSource, !collision);
	}
}

function _getVisionSourceForCanSee(token) {
	const effectiveDetectionModes = _getEffectiveVisibilityDetectionModes(token);
	if (token?.vision?.los) return { visionSource: token.vision, temporaryVision: false, detectionModes: effectiveDetectionModes };
	const visionRanges = _getVisibilityRanges(token, effectiveDetectionModes);
	const sourceId = `${token?.sourceId ?? token?.id ?? 'ac5e-vision'}-ac5e-cansee`;
	const visionSource = new CONFIG.Canvas.visionSourceClass({ sourceId, object: token });
	visionSource.initialize({
		x: token.center.x,
		y: token.center.y,
		elevation: token.document?.elevation ?? token.elevation ?? 0,
		radius: Math.clamp(visionRanges.visionRadius, 0, canvas?.dimensions?.maxR ?? 0),
		lightRadius: visionRanges.lightPerceptionRadius,
		externalRadius: token.externalRadius,
		angle: token.document?.sight?.angle ?? 360,
		contrast: token.document?.sight?.contrast ?? 0,
		saturation: token.document?.sight?.saturation ?? 0,
		brightness: token.document?.sight?.brightness ?? 0,
		attenuation: token.document?.sight?.attenuation ?? 0,
		rotation: token.document?.rotation ?? token.rotation ?? 0,
		visionMode: token.document?.sight?.visionMode,
		color: token.document?.sight?.color?.toNearest?.() ?? token.document?.sight?.color,
		blinded: token.document?.hasStatusEffect?.(CONFIG.specialStatusEffects.BLIND) ?? token.actor?.statuses?.has('blinded') ?? false,
		disabled: false,
	});
	if (!visionSource.los) {
		visionSource.shape = visionSource._createRestrictedPolygon();
		visionSource.los = visionSource.shape;
	}
	if (visionSource.visionMode) visionSource.visionMode.animated = false;
	return { visionSource, temporaryVision: true, detectionModes: effectiveDetectionModes };
}

function _getEffectiveVisibilityDetectionModes(token) {
	const tokenDetectionModes = normalizeDetectionModes(token?.document?.detectionModes ?? token?.detectionModes);
	const actorSenseRanges = _getActorSenseRanges(token?.actor);
	const mergedModes = new Map();

	for (const mode of tokenDetectionModes) {
		if (!mode?.id) continue;
		mergedModes.set(mode.id, { ...mode });
	}

	const senseModeRanges = new Map([
		['basicSight', Math.max(actorSenseRanges.darkvision ?? 0, actorSenseRanges.truesight ?? 0)],
		['blindsight', actorSenseRanges.blindsight ?? 0],
		['feelTremor', actorSenseRanges.tremorsense ?? 0],
		['seeInvisibility', Math.max(actorSenseRanges.seeInvisibility ?? 0, actorSenseRanges.truesight ?? 0)],
		['seeAll', actorSenseRanges.truesight ?? 0],
	]);

	for (const [id, range] of senseModeRanges) {
		if (!(range > 0)) continue;
		const existing = mergedModes.get(id);
		mergedModes.set(id, {
			...(existing ?? {}),
			id,
			enabled: existing?.enabled ?? true,
			range: Math.max(Number(existing?.range) || 0, range),
		});
	}

	return Array.from(mergedModes.values());
}

function _getActorSenseRanges(actor) {
	const senses = actor?.system?.attributes?.senses;
	const ranges = senses?.ranges ?? senses ?? {};
	const readRange = (...keys) => {
		for (const key of keys) {
			const value = ranges?.[key] ?? senses?.[key];
			if (Number.isFinite(Number(value))) return Number(value);
		}
		return 0;
	};

	return {
		blindsight: readRange('blindsight'),
		darkvision: readRange('darkvision'),
		tremorsense: readRange('tremorsense'),
		truesight: readRange('truesight'),
		seeInvisibility: readRange('seeInvisibility', 'seeinvisibility'),
	};
}

function _getVisibilityRanges(token, detectionModes) {
	const actorSenseRanges = _getActorSenseRanges(token?.actor);
	const modeRanges = new Map(detectionModes.map((mode) => [mode?.id, Number(mode?.range) || 0]));
	const visionCandidates = [
		token?.sightRange ?? 0,
		modeRanges.get('basicSight') ?? 0,
		modeRanges.get('seeAll') ?? 0,
		actorSenseRanges.darkvision ?? 0,
		actorSenseRanges.truesight ?? 0,
	];
	const lightPerceptionCandidates = [
		token?.lightPerceptionRange ?? 0,
		modeRanges.get('lightPerception') ?? 0,
	];

	return {
		visionRadius: Math.max(...visionCandidates),
		lightPerceptionRadius: Math.max(...lightPerceptionCandidates),
	};
}

function _destroyTemporaryVisionSource(visionSource, temporaryVision) {
	if (!temporaryVision || !visionSource) return;
	visionSource.visionMode?.deactivate?.(visionSource);
	visionSource.destroy?.();
}

export async function overtimeHazards(combat, update, options, user) {
	if (!settings.autoHazards || !game.user?.isActiveGM) return true;
	const advancedTurn = Object.hasOwn(update ?? {}, 'round') || Object.hasOwn(update ?? {}, 'turn');
	const forwardTurnAdvance = options?.direction === 1;
	if (options?.ac5eCadenceSync || !advancedTurn || !forwardTurnAdvance) return true;
	const currentCombatantId = combat.combatant?.id;
	if (!currentCombatantId) return true;

	const hasPHB = game.modules.get('dnd-players-handbook')?.active;
	const token = combat.combatant?.token?.object;
	const actor = combat.combatant?.token?.actor;
	const previousCombatantId = combat.previous?.tokenId;
	const previousToken = previousCombatantId ? canvas.tokens.get(previousCombatantId) : null;
	const previousActor = previousToken?.actor;

	const SUFFOCATION_UUID = 'Compendium.dnd-players-handbook.content.JournalEntry.phbAppendixCRule.JournalEntryPage.gAvV8TLyS8UGq00x';
	const BURNING_UUID = 'Compendium.dnd-players-handbook.content.JournalEntry.phbAppendixCRule.JournalEntryPage.mPBGM1vguT5IPzxT';
	const PRONE_UUID = 'Compendium.dnd5e.rules.JournalEntry.w7eitkpD7QQTB6j0.JournalEntryPage.y0TkcdyoZlOTmAFT';

	const TextEditorFn = foundry.applications.ux.TextEditor.implementation;

	if (previousActor?.statuses.has('suffocation')) {
		const maxExhaustion = CONFIG.DND5E.conditionTypes?.exhaustion?.levels ?? 0;
		const exhaustionLevel = previousActor.system.attributes.exhaustion ?? 0;
		if (maxExhaustion && exhaustionLevel < maxExhaustion) {
			await previousActor.update({
				'system.attributes.exhaustion': exhaustionLevel + 1,
			});

			let flavor = _localize('AC5E.EnvironmentalHazards.Suffocating');
			if (hasPHB) {
				const suffocationEntry = await fromUuid(SUFFOCATION_UUID);
				flavor = `<div align-text="center">${_localize('AC5E.EnvironmentalHazards.SettingsName')}</div>${suffocationEntry?.text?.content ?? flavor}`;
			}

			const enrichedHTML = (await TextEditorFn.enrichHTML(flavor)).replace(/<a[^>]*data-action="apply"[^>]*>.*?<\/a>/g, '');

			await ChatMessage.create({
				content: enrichedHTML,
				speaker: ChatMessage.getSpeaker({ token: previousToken }),
			});
		}
	}

	if (actor?.statuses.has('burning')) {
		let flavor = _localize('AC5E.EnvironmentalHazards.BurningHazard');
		if (hasPHB) {
			const burningEntry = await fromUuid(BURNING_UUID);
			flavor = `<div align-text="center">${_localize('AC5E.EnvironmentalHazards.SettingsName')}</div>${burningEntry?.text?.content ?? flavor}`;
		}

		flavor = flavor.replace(/@UUID\[\.QxCrRcgMdUd3gfzz\]\{Prone\}/g, `@UUID[${PRONE_UUID}]{Prone}`);

		const enrichedHTML = await TextEditorFn.enrichHTML(flavor);
		const type = 'fire';
		const rollData = actor?.getRollData();

		if (!_activeModule('midi-qol')) {
			token.control();
			return new CONFIG.Dice.DamageRoll('1d4', rollData, {
				type,
				appearance: { colorset: type },
			}).toMessage({ flavor: enrichedHTML });
		}

		const damageRoll = await new Roll('1d4', rollData, {
			type,
			appearance: { colorset: type },
		}).toMessage({ flavor: enrichedHTML });
		const damage = damageRoll.rolls[0].total;

		const forceApply = MidiQOL.configSettings()?.autoApplyDamage?.includes('yes') ?? false;

		return MidiQOL.applyTokenDamage([{ type, damage }], damage, new Set([token]), null, null, { forceApply });
	}

	return true;
}
