import Constants from './ac5e-constants.mjs';
import { _activeModule, _dispositionCheck, _filterOptinEntries, _getDistance, _hasItem, _hasStatuses, _localize } from './ac5e-helpers.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();
const _canSeeDebugEnabled = () => Boolean(settings.debug || globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.canSee);

export function findNearby({ token, disposition = 'all', radius = 5, lengthTest = false, hasStatuses = [], includeToken = false, includeIncapacitated = false, partyMember = false }) {
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
		if (radius === 0) return true;
		const distance = _getDistance(token, target);
		return distance <= radius;
	});
	if (settings.debug) console.log('AC5E - findNearby():', nearbyTokens);
	if (lengthTest === true) return nearbyTokens.length;
	if (typeof lengthTest === 'number') return nearbyTokens.length >= lengthTest;
	return nearbyTokens;
}

export function checkNearby(token, disposition, radius, { count = false, includeToken = false, includeIncapacitated = false, hasStatuses = [], partyMember = false } = {}) {
	return findNearby({ token, disposition, radius, hasStatuses, includeToken, includeIncapacitated, lengthTest: count, partyMember });
}

export function autoRanged(activity, token, target, options) {
	const distanceUnit = canvas.grid.distance;
	const modernRules = settings.dnd5eModernRules;
	const isSpell = activity.isSpell;
	const isAttack = activity.type === 'attack';
	const hookType = options?.ac5eConfig?.hookType;
	const isAttackRangeContext = isAttack && (hookType === 'attack' || hookType === 'use' || !hookType);
	const { checkRange: midiCheckRange, nearbyFoe: midiNearbyFoe } = _activeModule('midi-qol') && MidiQOL.configSettings().optionalRulesEnabled ? MidiQOL.configSettings().optionalRules : {};
	const midiChecks = midiCheckRange && midiCheckRange !== 'none';
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
		if (midiChecks) return [];
		const ac5eConfig = options?.ac5eConfig;
		if (!ac5eConfig) return [];
		const subjectEntries = Array.isArray(ac5eConfig?.subject?.range) ? ac5eConfig.subject.range : [];
		const opponentEntries = Array.isArray(ac5eConfig?.opponent?.range) ? ac5eConfig.opponent.range : [];
		return _filterOptinEntries(subjectEntries.concat(opponentEntries), ac5eConfig?.optinSelected).filter((entry) => {
			if (!entry || typeof entry !== 'object' || entry.mode !== 'range') return false;
			if (!isAttackRangeContext) return false;
			if (entry.hook) {
				const allowedHooks = hookType === 'use' ? new Set(['attack', 'use']) : new Set(['attack']);
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
	let longDisadvantage = midiChecks ? false : settings.autoRangeChecks.has('rangedLongDisadvantage');
	let nearbyFoeDisadvantage = settings.autoRangeChecks.has('rangedNearbyFoes');
	let outOfRangeFail = midiChecks ? false : settings.autoRangeChecks.has('rangedOoR');
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
		};
	}
	const sharpShooter = flags?.sharpShooter || _hasItem(token.actor, 'AC5E.Feats.Sharpshooter');
	if (sharpShooter && long && actionType == 'rwak') short = long;
	const crossbowExpert = flags?.crossbowExpert || _hasItem(token.actor, 'AC5E.Feats.CrossbowExpert');

	const nearbyFoe =
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
		longDisadvantage,
		outOfRangeFail,
		outOfRangeFailSourceLabel,
		outOfRangeFailSourceMode,
	};
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
	const { visionSource, temporaryVision } = _getVisionSourceForCanSee(source);
	if (!visionSource) {
		if (_canSeeDebugEnabled()) console.warn('AC5e: No valid vision source for canSee check', { source: source?.id, target: target?.id });
		return false;
	}
	const { tests, level } = _createVisibilityTests(target, visionSource);
	const config = { tests, object: target, level };

	const tokenDetectionModes = normalizeDetectionModes(source.document?.detectionModes ?? source.detectionModes);
	let validModes = new Set();

	const sourceBlinded = source.actor?.statuses.has('blinded');
	const targetInvisible = target.actor?.statuses.has('invisible');
	const sourceEthereal = source.actor?.statuses.has('ethereal');
	const targetEthereal = target.actor?.statuses.has('ethereal');
	const crossPlanarEthereal = (status === 'ethereal' || sourceEthereal || targetEthereal) && !(sourceEthereal && targetEthereal);
	if (!status && !sourceBlinded && !targetInvisible && !crossPlanarEthereal) {
		validModes = new Set(['basicSight', 'lightPerception']);
	} else {
		validModes = new Set(['basicSight', 'lightPerception', 'blindsight', 'seeAll', 'seeInvisibility']);
		if (status === 'blinded' || sourceBlinded) {
			validModes = new Set([...validModes].filter((mode) => ['blindsight'].includes(mode)));
		}
		if (crossPlanarEthereal) {
			validModes = new Set([...validModes].filter((mode) => ['seeAll'].includes(mode)));
		}
		if (status === 'invisible' || targetInvisible) {
			validModes = new Set([...validModes].filter((mode) => ['blindsight', 'seeAll', 'seeInvisibility'].includes(mode)));
		}
	}
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
		const resolved = fromUuidSync(token);
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
		}
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
	if (token?.vision?.los) return { visionSource: token.vision, temporaryVision: false };
	const sourceId = `${token?.sourceId ?? token?.id ?? 'ac5e-vision'}-ac5e-cansee`;
	const visionSource = new CONFIG.Canvas.visionSourceClass({ sourceId, object: token });
	visionSource.initialize({
		x: token.center.x,
		y: token.center.y,
		elevation: token.document?.elevation ?? token.elevation ?? 0,
		radius: Math.clamp(token.sightRange ?? 0, 0, canvas?.dimensions?.maxR ?? 0),
		lightRadius: token.lightPerceptionRange ?? 0,
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
	return { visionSource, temporaryVision: true };
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

	const TextEditorFn = game.version > '13' ? foundry.applications.ux.TextEditor.implementation : TextEditor;

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
