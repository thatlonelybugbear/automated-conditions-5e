import Constants from './ac5e-constants.mjs';
import { _activeModule, _dispositionCheck, _filterOptinEntries, _getDistance, _hasItem, _hasStatuses, _localize } from './ac5e-helpers.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

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
	const midiChecks = midiCheckRange && midiCheckRange !== 'none';
	if (midiChecks || (!outOfRangeFail && !longDisadvantage) || (!short && !long) || distance <= short) isShort = true;
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

export function canSee(source, target, status) {
	if (!source || !target) {
		if (settings.debug) console.warn('AC5e: No valid tokens for canSee check');
		return false;
	}
	const detectionModes = CONFIG.Canvas?.detectionModes ?? {};
	const sightDetectionModes = ['basicSight', 'lightPerception'];
	const matchedModes = new Set();
	const tests = [
		{
			point: target.center,
			elevation: target.document?.elevation ?? target.elevation ?? 0,
			los: new Map(),
		},
	];
	const hasSight = !!source.document?.sight?.enabled;
	if (!source.vision) initializeVision(source);
	else if (!hasSight && !canvas.effects?.visionSources?.has?.(source.sourceId)) initializeVision(source);
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
			if (!lightSource?.active || lightSource?.data?.disabled) continue;
			const result = lightSource.testVisibility?.(config);
			if (result === true) matchedModes.add(detectionModes.lightPerception?.id);
		}
	} else if (status === 'blinded' || sourceBlinded) {
		validModes = new Set(['blindsight', 'seeAll']);
	} else if (status === 'invisible' || status === 'ethereal' || targetInvisible || targetEthereal) {
		validModes = new Set(['seeAll', 'seeInvisibility']);
	}
	for (const detectionMode of tokenDetectionModes) {
		if (!detectionMode?.enabled || !detectionMode?.range) continue;
		if (!validModes.has(detectionMode.id)) continue;
		const mode = detectionModes[detectionMode.id];
		const result = mode ? mode.testVisibility(source.vision, detectionMode, config) : false;
		if (result === true && mode?.id) matchedModes.add(mode.id);
	}
	if (settings.debug) {
		console.warn(`${Constants.MODULE_NAME_SHORT}.canSee()`, { source: source?.id, target: target?.id, result: matchedModes, visionInitialized: !hasSight, sourceId: source.sourceId });
	}
	if (!hasSight) canvas.effects?.visionSources.delete(source.sourceId);
	return matchedModes.size > 0;
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

function initializeVision(token) {
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

export async function overtimeHazards(combat, update, options, user) {
	if (!settings.autoHazards /*|| !game.user.isGM*/ || game.users.find((u) => u.isGM && u.active)?.id !== user) return true;

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
