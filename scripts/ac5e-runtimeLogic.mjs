import Constants from './ac5e-constants.mjs';
import { _applyResolvedFastForwardMode, _ensureRoll0Options, _syncResolvedFastForwardD20Override } from './helpers/ac5e-helpers-fast-forward.mjs';
import { lazySandbox } from './ac5e-main.mjs';
import { canSee } from './ac5e-systemRules.mjs';
import Settings from './ac5e-settings.mjs';
import {
	_activeModule,
	_ac5eSafeEval,
	_entryMatchesTransientState,
	_filterOptinEntries,
	_getActivityEffectsStatusRiders,
	_getLightLevel,
	_getMessageDnd5eFlags,
	_getTooltip,
	_setMessageFlagScope,
	_safeFromUuidSync,
	_syncMidiAbilityRollModifierTracker,
	_syncMidiAttackRollModifierTracker,
	getAlteredTargetValueOrThreshold,
} from './ac5e-helpers.mjs';
import { _getSafeDialogConfig, _getSafeUseConfig } from './ac5e-config-logic.mjs';

const settings = new Settings();

function _duplicateEvaluationOptions(options) {
	return options && typeof options === 'object' ?
			{
				...options,
				targets: Array.isArray(options.targets) ? foundry.utils.duplicate(options.targets) : options?.targets,
			}
		:	{};
}

export function _buildRollEvaluationData({ subjectToken, opponentToken, options } = {}) {
	const normalizedOptions = _duplicateEvaluationOptions(options);
	const activity = normalizedOptions?.activity;
	const item = normalizedOptions?.item;
	const rollDataDocument = activity ?? item ?? subjectToken?.actor;
	const formulaData =
		normalizedOptions?.rollData && typeof normalizedOptions.rollData === 'object' ?
			normalizedOptions.rollData
		:	rollDataDocument?.getRollData?.() ?? {};
	const dataActor =
		subjectToken?.actor === (activity ?? item)?.actor ? 'rollingActor'
		: opponentToken?.actor === (activity ?? item)?.actor ? 'opponentActor'
		: null;
	const rollingActor = dataActor === 'rollingActor' ? _ac5eActorRollData(subjectToken, formulaData) : _ac5eActorRollData(subjectToken);
	const opponentActor = dataActor === 'opponentActor' ? _ac5eActorRollData(opponentToken, formulaData) : _ac5eActorRollData(opponentToken);
	return {
		rollingActor,
		opponentActor,
		activityData: formulaData.activity || {},
		itemData: formulaData.item || {},
		formulaData,
	};
}

function _collectionCount(collection) {
	if (!collection) return 0;
	if (typeof collection.size === 'number') return collection.size;
	if (Array.isArray(collection) || typeof collection === 'string') return collection.length;
	return 0;
}

function _resolveTransientBehaviorFormula(formula, transientRollState = {}) {
	const rawFormula = String(formula ?? '').trim();
	if (!rawFormula) return '';
	const preserveStandaloneSignedDiceFormula = (expression) => {
		if (typeof expression !== 'string') return null;
		const trimmed = expression.trim();
		if (!/^[+-]/.test(trimmed)) return null;
		if (/[()@]/.test(trimmed)) return null;
		const unsigned = trimmed.slice(1).trim();
		if (!unsigned) return null;
		const signedDicePattern = /^(?:(?:\d*)d(?:\d+|%)(?:r[<>=]?\d+)?(?:x\d+)?(?:kh\d+|kl\d+|k\d+|dh\d+|dl\d+|d\d+|min\d+|max\d+)?|(?:\d+))(?:\s*\[[^\]]*\])*(?:\s*[*/]\s*\d+(?:\.\d+)?)?$/i;
		return signedDicePattern.test(unsigned) ? `${trimmed[0]}${unsigned}` : null;
	};
	const normalizedFormula = rawFormula;
	const preservedSignedDiceFormula = preserveStandaloneSignedDiceFormula(normalizedFormula);
	if (preservedSignedDiceFormula) return preservedSignedDiceFormula;
	const sandbox = {
		hasTransitAdvantage: !!transientRollState?.hasTransitAdvantage,
		hasTransitDisadvantage: !!transientRollState?.hasTransitDisadvantage,
		hasAdvantage: !!transientRollState?.hasTransitAdvantage,
		hasDisadvantage: !!transientRollState?.hasTransitDisadvantage,
	};
	const prepared = _ac5eSafeEval({ expression: normalizedFormula, sandbox, mode: 'formula' });
	return typeof prepared === 'string' ? prepared.trim() : String(prepared ?? '').trim();
}

function _getSandboxTransientRollState(options = {}) {
	return {
		hasTransitAdvantage: !!(options?.d20?.hasTransitAdvantage ?? options?.hasTransitAdvantage ?? options?.[Constants.MODULE_ID]?.hasTransitAdvantage),
		hasTransitDisadvantage: !!(options?.d20?.hasTransitDisadvantage ?? options?.hasTransitDisadvantage ?? options?.[Constants.MODULE_ID]?.hasTransitDisadvantage),
	};
}

function _getConfiguredAdvantageBehavior(ac5eConfig = {}, source = {}) {
	const configured = source?.advantageBehavior ?? source?.[Constants.MODULE_ID]?.advantageBehavior ?? ac5eConfig?.advantageBehavior ?? settings.advantageBehavior;
	return {
		mode: configured?.mode === 'custom' ? 'custom' : 'native',
		advantageFormula: String(configured?.advantageFormula ?? ''),
		disadvantageFormula: String(configured?.disadvantageFormula ?? ''),
	};
}

export function _raceOrType(actor, dataType = 'race') {
	const systemData = actor?.system;
	if (!systemData?.details?.type) return {};
	let data;
	if (actor.type === 'character' || actor.type === 'npc') {
		data = foundry.utils.duplicate(systemData.details.type);
		data.race = systemData.details.race?.identifier ?? data.value;
		data.type = actor.type;
	} else if (actor.type === 'group') data = { type: 'group', value: systemData.type.value };
	else if (actor.type === 'vehicle') data = { type: 'vehicle', value: systemData.vehicleType };
	if (dataType === 'all') return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.toLocaleLowerCase() : v]));
	return data[dataType]?.toLocaleLowerCase();
}

export function _ac5eActorRollData(token, rollData) {
	let actorData;
	const actor = token?.actor; // to-do: handle non-token roll data in the future, currently only supports rolls with tokens (e.g. attacks, saves, checks, but not item uses or activities without rolls)
	if (!(actor instanceof CONFIG.Actor.documentClass)) return {};
	if (!rollData) actorData = actor.getRollData();
	else actorData = { ...rollData };
	actorData.flags ??= actor.flags ?? {};
	actorData.flags['midi-qol'] ??= actor.flags?.['midi-qol'] ?? {};
	actorData.midiFlags ??= actorData.flags['midi-qol'];
	actorData.currencyWeight = actor.system.currencyWeight;
	actorData.effects = actor.appliedEffects;
	actorData.level = actorData.details?.level || actorData.details?.cr;
	actorData.levelCr = actorData.level;
	actorData.hasArmor = !!actorData.attributes?.ac?.equippedArmor;
	if (actorData.hasArmor) actorData[`hasArmor${actorData.attributes.ac.equippedArmor.system.type.value.capitalize()}`] = true;
	actorData.hasShield = !!actorData.attributes?.ac?.equippedShield;
	actorData.type = actor.type;
	actorData.canMove = Object.values(actor.system?.attributes?.movement || {}).some((v) => typeof v === 'number' && v);
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
	defineLazyAc5eActorRollDataViews(actorData, actor, token, active);
	return actorData;
}

function defineLazyAc5eActorRollDataViews(actorData, actor, token, active) {
	let itemViewsCache;
	const defineCachedValue = (key, resolver) => {
		Object.defineProperty(actorData, key, {
			configurable: true,
			enumerable: true,
			get() {
				const value = resolver();
				Object.defineProperty(actorData, key, {
					value,
					configurable: true,
					enumerable: true,
					writable: true,
				});
				return value;
			},
		});
	};
	const getItemViews = () => {
		if (itemViewsCache) return itemViewsCache;
		const items = [];
		const equippedItems = { names: [], identifiers: [] };
		for (const item of actor.items ?? []) {
			const identifier = item.identifier;
			const equipped = !!item.system?.equipped;
			if (equipped) {
				equippedItems.names.push(item.name);
				equippedItems.identifiers.push(identifier);
			}
			items.push({
				name: item.name,
				uuid: item.uuid,
				id: item.id,
				identifier,
				type: item.type,
				uses: item.system?.uses || {},
				equipped,
				attuned: !!item.system?.attuned,
			});
		}
		itemViewsCache = { items, equippedItems };
		return itemViewsCache;
	};
	defineCachedValue('items', () => getItemViews().items);
	defineCachedValue('equippedItems', () => getItemViews().equippedItems);
	defineCachedValue('creatureType', () => Array.from(new Set(Object.values(_raceOrType(actor, 'all')).filter(Boolean))));
	defineCachedValue('movementLastSegment', () => {
		if (!active) return active;
		const history = token.document.movementHistory;
		const movementId = history?.at(-1)?.movementId;
		if (!movementId) return false;
		return history.filter((entry) => entry.movementId === movementId).reduce((acc, entry) => (acc += entry.cost ?? 0), 0);
	});
	defineCachedValue('movementTurn', () => {
		if (!active) return active;
		return token.document.movementHistory?.reduce((acc, entry) => (acc += entry.cost ?? 0), 0);
	});
	defineCachedValue('lightLevel', () => ({ [_getLightLevel(token)]: true }));
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
			const tokenDoc = _safeFromUuidSync(tokenUuid);
			const tokenActor = tokenDoc?.actor ?? tokenDoc?.object?.actor;
			const tokenAC = tokenActor?.system?.attributes?.ac?.value;
			if (Number.isFinite(Number(tokenAC))) return Number(tokenAC);
		}
		const actorUuid = target?.uuid;
		if (actorUuid) {
			const actor = _safeFromUuidSync(actorUuid);
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
	const defaultCriticalSuccess = Number(CONFIG?.Dice?.D20Die?.CRITICAL_SUCCESS_TOTAL ?? 20);
	const defaultCriticalFailure = Number(CONFIG?.Dice?.D20Die?.CRITICAL_FAILURE_TOTAL ?? 1);
	const getNumericOrFallback = (value, fallback) => {
		const numeric = Number(value);
		return Number.isFinite(numeric) ? numeric : fallback;
	};
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
			criticalSuccess: getNumericOrFallback(roll0.options.criticalSuccess, defaultCriticalSuccess),
			criticalFailure: getNumericOrFallback(roll0.options.criticalFailure, defaultCriticalFailure),
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
	ac5eConfig.transientBehaviorParts = [];
	const ac5eForcedRollTarget = 999;
	const getGlobalDamageCriticalEntries = (entries = []) =>
		(entries ?? []).filter((entry) => {
			if (!entry || typeof entry !== 'object') return true;
			const addTo = entry?.addTo;
			if (addTo?.mode === 'types' && Array.isArray(addTo.types) && addTo.types.length) return false;
			return true;
		});
	const resolveForcedD20Mode = (entries = []) => {
		const normalizedEntries = Array.isArray(entries) ? entries : [];
		let winner = null;
		for (const entry of normalizedEntries) {
			const enforceMode = entry?.enforceMode;
			if (!enforceMode) continue;
			const priority = Number(entry?.priority);
			const sortPriority = Number.isFinite(priority) ? priority : 0;
			if (!winner || sortPriority >= winner.priority) winner = { mode: enforceMode, priority: sortPriority };
		}
		return winner?.mode;
	};
	const subjectGlobalDamageCritical = hook === 'damage' ? getGlobalDamageCriticalEntries(_filterOptinEntries(ac5eConfig.subject.critical, ac5eConfig.optinSelected)) : [];
	const opponentGlobalDamageCritical = hook === 'damage' ? getGlobalDamageCriticalEntries(_filterOptinEntries(ac5eConfig.opponent.critical, ac5eConfig.optinSelected)) : [];
	if (hook === 'damage') {
		if (subjectGlobalDamageCritical.length || opponentGlobalDamageCritical.length) {
			ac5eConfig.isCritical = true;
			config.isCritical = true;
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
		const subjectInfo = _filterOptinEntries(ac5eConfig.subject.info, ac5eConfig.optinSelected);
		const opponentInfo = _filterOptinEntries(ac5eConfig.opponent.info, ac5eConfig.optinSelected);
		const subjectAdvantageNamesCount = _collectionCount(ac5eConfig.subject.advantageNames);
		const opponentAdvantageNamesCount = _collectionCount(ac5eConfig.opponent.advantageNames);
		const subjectDisadvantageNamesCount = _collectionCount(ac5eConfig.subject.disadvantageNames);
		const opponentDisadvantageNamesCount = _collectionCount(ac5eConfig.opponent.disadvantageNames);
		const hasAdvantageSources = Boolean(subjectAdvantage.length || opponentAdvantage.length || subjectAdvantageNamesCount || opponentAdvantageNamesCount);
		const hasDisadvantageSources = Boolean(subjectDisadvantage.length || opponentDisadvantage.length || subjectDisadvantageNamesCount || opponentDisadvantageNamesCount);
		const transientRollState = {
			hasTransitAdvantage: hasAdvantageSources,
			hasTransitDisadvantage: hasDisadvantageSources,
			advantageMode:
				hasAdvantageSources && hasDisadvantageSources ? NORM_MODE
				: hasAdvantageSources ? ADV_MODE
				: hasDisadvantageSources ? DIS_MODE
				: NORM_MODE,
			defaultButton:
				hasAdvantageSources && hasDisadvantageSources ? 'normal'
				: hasAdvantageSources ? 'advantage'
				: hasDisadvantageSources ? 'disadvantage'
				: 'normal',
		};
		ac5eConfig.transientRollState = transientRollState;
		ac5eConfig.hasTransitAdvantage = transientRollState.hasTransitAdvantage;
		ac5eConfig.hasTransitDisadvantage = transientRollState.hasTransitDisadvantage;
		ac5eConfig.advantageBehavior = _getConfiguredAdvantageBehavior(ac5eConfig, config);
		config.advantage = hasAdvantageSources;
		config.disadvantage = hasDisadvantageSources;
		if (subjectNoAdv.length || opponentNoAdv.length) config.advantage = false;
		if (subjectNoDis.length || opponentNoDis.length) config.disadvantage = false;
		const enforcedD20Mode = resolveForcedD20Mode(
			[...subjectInfo, ...opponentInfo].filter((entry) => entry && typeof entry === 'object' && _entryMatchesTransientState(entry, ac5eConfig, transientRollState)),
		);
		ac5eConfig.enforcedD20Mode = enforcedD20Mode ?? null;
		if (enforcedD20Mode === 'advantage') {
			config.advantage = true;
			config.disadvantage = false;
		} else if (enforcedD20Mode === 'disadvantage') {
			config.advantage = false;
			config.disadvantage = true;
		} else if (enforcedD20Mode === 'normal') {
			config.advantage = false;
			config.disadvantage = false;
		}
		const allTransitEntries = [ac5eConfig?.subject, ac5eConfig?.opponent]
			.flatMap((side) => (side && typeof side === 'object' ? Object.values(side) : []))
			.flatMap((entries) => (Array.isArray(entries) ? entries : []))
			.filter((entry) => entry && typeof entry === 'object');
		const filteredTransitEntries = _filterOptinEntries(allTransitEntries, ac5eConfig.optinSelected).filter((entry) => _entryMatchesTransientState(entry, ac5eConfig, transientRollState));
		const transitConversionEntries = filteredTransitEntries.filter((entry) => entry?.requiresTransitAdvantage || entry?.requiresTransitDisadvantage);
		const transientBehaviorParts = [];
		if (ac5eConfig.advantageBehavior?.mode === 'custom') {
			const advantageFormula = String(ac5eConfig.advantageBehavior.advantageFormula ?? '').trim();
			const disadvantageFormula = String(ac5eConfig.advantageBehavior.disadvantageFormula ?? '').trim();
			const resolvedAdvantageFormula = transientRollState.hasTransitAdvantage ? _resolveTransientBehaviorFormula(advantageFormula, transientRollState) : '';
			const resolvedDisadvantageFormula = transientRollState.hasTransitDisadvantage ? _resolveTransientBehaviorFormula(disadvantageFormula, transientRollState) : '';
			const shouldConvertAdvantage = transientRollState.hasTransitAdvantage && !!resolvedAdvantageFormula;
			const shouldConvertDisadvantage = transientRollState.hasTransitDisadvantage && !!resolvedDisadvantageFormula;
			if (shouldConvertAdvantage) transientBehaviorParts.push(resolvedAdvantageFormula);
			if (shouldConvertDisadvantage) transientBehaviorParts.push(resolvedDisadvantageFormula);
			if (shouldConvertAdvantage) config.advantage = false;
			if (shouldConvertDisadvantage) config.disadvantage = false;
		} else {
			if (config.advantage && transitConversionEntries.some((entry) => entry?.requiresTransitAdvantage)) config.advantage = false;
			if (config.disadvantage && transitConversionEntries.some((entry) => entry?.requiresTransitDisadvantage)) config.disadvantage = false;
		}
		ac5eConfig.transientBehaviorParts = transientBehaviorParts;
		if (config.advantage && config.disadvantage) {
			config.advantage = true;
			config.disadvantage = true;
			localDialog.options.advantageMode = NORM_MODE;
			localDialog.options.defaultButton = 'normal';
		} else if (config.advantage && !config.disadvantage) {
			localDialog.options.advantageMode = ADV_MODE;
			localDialog.options.defaultButton = 'advantage';
		} else if (!config.advantage && config.disadvantage) {
			localDialog.options.advantageMode = DIS_MODE;
			localDialog.options.defaultButton = 'disadvantage';
		} else {
			localDialog.options.advantageMode = NORM_MODE;
			localDialog.options.defaultButton = 'normal';
		}
		if (hook === 'attack' || hook === 'damage') {
			ac5eConfig.initialTargetADCs = {};
			ac5eConfig.alteredTargetADCs = {};
			if (ac5eConfig.threshold?.length) {
				const finalThreshold = getAlteredTargetValueOrThreshold(
					getNumericOrFallback(roll0.options.criticalSuccess, defaultCriticalSuccess),
					ac5eConfig.threshold,
					'critThreshold',
				);
				roll0.options.criticalSuccess = finalThreshold;
				ac5eConfig.alteredCritThreshold = finalThreshold;
			}
			if (ac5eConfig.fumbleThreshold?.length) {
				const finalThreshold = getAlteredTargetValueOrThreshold(
					getNumericOrFallback(roll0.options.criticalFailure, defaultCriticalFailure),
					ac5eConfig.fumbleThreshold,
					'fumbleThreshold',
				);
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
	for (const part of ac5eConfig.transientBehaviorParts ?? []) {
		if (typeof part === 'string' && part.trim()) nextInjectedParts.push(part.trim());
	}
	if (hook !== 'damage') {
		const deferredTransitBonusEntries = _filterOptinEntries([...(ac5eConfig?.subject?.bonus ?? []), ...(ac5eConfig?.opponent?.bonus ?? [])], ac5eConfig.optinSelected).filter(
			(entry) => entry && typeof entry === 'object' && !entry.optin && (entry.requiresTransitAdvantage || entry.requiresTransitDisadvantage) && _entryMatchesTransientState(entry, ac5eConfig),
		);
		for (const entry of deferredTransitBonusEntries) {
			for (const value of entry.values ?? []) nextInjectedParts.push(value);
		}
	}
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
	const isLiteralDieModifier = (value) => {
		const cleaned = typeof value === 'string' ? value.trim().toLowerCase().replace(/\s+/g, '') : '';
		if (!cleaned || /^(?:maximize|minimize)$/i.test(cleaned)) return false;
		if (globalThis.dnd5e?.utils?.isValidDieModifier?.(cleaned)) return true;
		return /^(?:min|max)-?\d+$/i.test(cleaned);
	};
	const applyModifierConstraint = (modifierConfig, modifierValue) => {
		if (modifierValue === undefined || modifierValue === null) return;
		const cleaned = String(modifierValue).trim().toLowerCase().replace(/\s+/g, '');
		if (cleaned === 'maximize') {
			modifierConfig.maximize = true;
			return;
		}
		if (cleaned === 'minimize') {
			modifierConfig.minimize = true;
			return;
		}
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
			return;
		}
		if (!isLiteralDieModifier(cleaned)) return;
		modifierConfig.literals ??= [];
		if (!modifierConfig.literals.includes(cleaned)) modifierConfig.literals.push(cleaned);
	};
	const effectiveModifiers = foundry.utils.duplicate(ac5eConfig.modifiers ?? {});
	for (const side of ['subject', 'opponent']) {
		const sideModifiers = _filterOptinEntries(ac5eConfig?.[side]?.modifiers ?? [], ac5eConfig.optinSelected).filter((entry) => _entryMatchesTransientState(entry, ac5eConfig));
		for (const entry of sideModifiers) {
			if (!entry || typeof entry !== 'object') continue;
			applyModifierConstraint(effectiveModifiers, entry.modifier);
		}
	}
	ac5eConfig.effectiveModifiers = effectiveModifiers;
	if (Array.isArray(effectiveModifiers?.literals) && effectiveModifiers.literals.length) {
		console.warn('AC5E unsupported literal die modifiers on d20 roll ignored', {
			hook,
			modifiers: [...effectiveModifiers.literals],
			id: ac5eConfig?.id,
			itemUuid: ac5eConfig?.item?.uuid ?? ac5eConfig?.itemUuid,
		});
	}
	if (roll0?.options) {
		const { maximum, minimum, maximize, minimize } = effectiveModifiers;
		if (Number.isFinite(maximum)) roll0.options.maximum = maximum;
		else if ('maximum' in roll0.options) delete roll0.options.maximum;
		if (Number.isFinite(minimum)) roll0.options.minimum = minimum;
		else if ('minimum' in roll0.options) delete roll0.options.minimum;
		if (maximize) roll0.options.maximize = true;
		else if ('maximize' in roll0.options) delete roll0.options.maximize;
		if (minimize) roll0.options.minimize = true;
		else if ('minimize' in roll0.options) delete roll0.options.minimize;
	}
	if (!localDialog.options?.defaultButton) localDialog.options.defaultButton = 'normal';
	ac5eConfig.advantageMode = localDialog.options.advantageMode;
	ac5eConfig.proposedButton = localDialog.options.defaultButton;
	ac5eConfig.calculatedDefaultButton = localDialog.options.defaultButton;
	ac5eConfig.defaultButton = localDialog.options.defaultButton;
	if (!dialog?.configure) _applyResolvedFastForwardMode(ac5eConfig, config, roll0);
	if (hook === 'attack') _syncMidiAttackRollModifierTracker(ac5eConfig, config);
	else if (hook === 'check' || hook === 'save') _syncMidiAbilityRollModifierTracker(ac5eConfig, config, localDialog);
	if (ac5eConfig?.tooltipObj && hook) delete ac5eConfig.tooltipObj[hook];
	_getTooltip(ac5eConfig);
	if (skipSetProperties) return ac5eConfig;
	return _setAC5eProperties(ac5eConfig, config, localDialog, message);
}

function pickOptions(source, keys) {
	const result = {};
	if (!source || typeof source !== 'object') return result;
	for (const key of keys) {
		if (!Object.hasOwn(source, key)) continue;
		const value = source[key];
		if (value === undefined) continue;
		result[key] = foundry.utils.duplicate(value);
	}
	return result;
}

export function _setAC5eProperties(ac5eConfig, config, dialog, message) {
	if (globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.setAC5eProperties || settings.debug) console.warn('AC5e runtime._setAC5eProperties', { ac5eConfig, config, dialog, message });

	if (ac5eConfig.hookType === 'use') {
		const safeUseConfig = _getSafeUseConfig(ac5eConfig);
		const ac5eConfigDialog = { [Constants.MODULE_ID]: safeUseConfig };
		if (config) foundry.utils.mergeObject(config, ac5eConfigDialog);
		_setMessageFlagScope(message, Constants.MODULE_ID, safeUseConfig.options ?? {}, { merge: false });
		if (globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.setAC5eProperties || settings.debug) {
			console.warn('AC5e post runtime._setAC5eProperties for preActivityUse', { ac5eConfig, config, dialog, message });
		}
		return;
	}
	ac5eConfig.subject.advantageNames = [...ac5eConfig.subject.advantageNames];
	ac5eConfig.subject.disadvantageNames = [...ac5eConfig.subject.disadvantageNames];
	ac5eConfig.opponent.advantageNames = [...ac5eConfig.opponent.advantageNames];
	ac5eConfig.opponent.disadvantageNames = [...ac5eConfig.opponent.disadvantageNames];

	const safeDialogConfig = _getSafeDialogConfig(ac5eConfig);
	const ac5eConfigDialog = { [Constants.MODULE_ID]: safeDialogConfig };
	if (dialog?.options) dialog.options.classes = dialog.options.classes?.concat('ac5e') ?? ['ac5e'];
	const optionSnapshotKeys = ['ability', 'attackMode', 'skill', 'tool', 'targets', 'target', 'defaultDamageType', 'damageTypes', 'distance'];
	if (!['attack', 'damage'].includes(ac5eConfig.hookType)) optionSnapshotKeys.splice(6, 0, 'initialTargetADC', 'alteredTargetADC');
	const optionsSnapshot = pickOptions(ac5eConfig.options ?? {}, optionSnapshotKeys);
	const ac5eConfigMessage = {
		[Constants.MODULE_ID]: {
			tooltipObj: ac5eConfig.tooltipObj,
			hookType: ac5eConfig.hookType,
			roller: ac5eConfig.roller,
			tokenId: ac5eConfig.tokenId,
			targetId: ac5eConfig.targetId,
			hasTransitAdvantage: !!ac5eConfig.hasTransitAdvantage,
			hasTransitDisadvantage: !!ac5eConfig.hasTransitDisadvantage,
			hasPlayerOwner: ac5eConfig.hasPlayerOwner,
			ownership: ac5eConfig.ownership,
			optionsSnapshot,
		},
	};

	const rollOptionsTarget = _ensureRoll0Options(config);
	const mergeTarget = rollOptionsTarget ?? config;
	if (mergeTarget) mergeTarget[Constants.MODULE_ID] = { ...(mergeTarget[Constants.MODULE_ID] ?? {}), ...safeDialogConfig };
	if (message && typeof message === 'object') _setMessageFlagScope(message, Constants.MODULE_ID, ac5eConfigMessage[Constants.MODULE_ID], { merge: true });
	if (globalThis?.[Constants.MODULE_NAME_SHORT]?.debug?.setAC5eProperties || settings.debug) console.warn('AC5e post runtime._setAC5eProperties', { ac5eConfig, config, dialog, message });
}

export function _createEvaluationSandbox({ subjectToken, opponentToken, options }) {
	const { rollingActor, opponentActor, activityData, itemData, formulaData } = _buildRollEvaluationData({ subjectToken, opponentToken, options });
	const sandbox = {
		...lazySandbox,
		_evalConstants: { ...lazySandbox._evalConstants },
	};
	const sandboxOptions = options;
	const activity = options.activity;
	const item = activity?.item;
	sandbox.rollingActor = rollingActor || {};
	sandbox.opponentActor = opponentActor || {};
	sandbox.tokenId = subjectToken?.id;
	sandbox.tokenUuid = subjectToken?.document?.uuid;
	sandbox.actorId = subjectToken?.actor?.id;
	sandbox.actorUuid = subjectToken?.actor?.uuid;
	sandbox.canMove = sandbox.rollingActor?.canMove;
	sandbox.canSee = canSee(subjectToken, opponentToken);
	const hookType = sandboxOptions?.hook;
	const hookUsesTargetAC = hookType === 'attack' || hookType === 'damage';
	sandbox.opponentAC =
		hookUsesTargetAC ?
			(sandboxOptions?.targets?.find?.((t) => t.uuid === opponentToken?.actor?.uuid)?.ac ?? opponentToken?.actor?.system?.attributes?.ac?.value)
		:	opponentToken?.actor?.system?.attributes?.ac?.value;
	sandbox.opponentId = opponentToken?.id;
	sandbox.opponentUuid = opponentToken?.document?.uuid;
	sandbox.opponentActorId = opponentToken?.actor?.id;
	sandbox.opponentActorUuid = opponentToken?.actor?.uuid;
	sandbox.isSeen = canSee(opponentToken, subjectToken);
	sandbox.targetActor = sandbox.opponentActor;
	sandbox.targetId = opponentToken?.id;

	sandbox.activity = activityData;
	if (activity) {
		if (!sandbox.activity.id) sandbox.activity.id = activity.id;
		if (!sandbox.activity.uuid) sandbox.activity.uuid = activity.uuid;
		if (!sandbox.activity.identifier) sandbox.activity.identifier = activity.identifier;
	}
	sandbox.ammunition = sandboxOptions.ammunition;
	sandbox.ammunitionName = sandboxOptions.ammunition?.name;
	sandbox.consumptionItemName = {};
	sandbox.consumptionItemIdentifier = {};
	activity?.consumption?.targets?.forEach(({ target }) => {
		if (!target) return;
		const targetItem = activity?.actor?.items.get(target);
		if (!targetItem) return;
		sandbox.consumptionItemName[targetItem.name] = true;
		sandbox.consumptionItemIdentifier[targetItem.identifier] = true;
	});
	sandbox.activity.ability = activity?.ability;
	sandbox.riderStatuses = sandboxOptions.riderStatuses || _getActivityEffectsStatusRiders(activity) || {};
	sandbox.hasAttack = !foundry.utils.isEmpty(activity?.attack);
	sandbox.hasDamage = !foundry.utils.isEmpty(activity?.damage?.parts);
	sandbox.hasHealing = !foundry.utils.isEmpty(activity?.healing);
	sandbox.hasSave = !foundry.utils.isEmpty(activity?.save);
	sandbox.hasCheck = !foundry.utils.isEmpty(activity?.check);
	sandbox.isSpell = activity?.isSpell;
	sandbox.isAoE = activity?.target?.template?.type in CONFIG.DND5E.areaTargetTypes;
	sandbox.isScaledScroll = activity?.isScaledScroll;
	sandbox.requiresSpellSlot = activity?.requiresSpellSlot;
	sandbox.spellcastingAbility = activity?.spellcastingAbility;
	sandbox.messageFlags = activity?.messageFlags;
	sandbox.activityName = activity ? { [activity.name]: true } : {};
	const actionType = activity?.getActionType?.(sandboxOptions.attackMode);
	sandbox.actionType = actionType ? { [actionType]: true } : {};
	sandbox.attackMode = sandboxOptions.attackMode ? { [sandboxOptions.attackMode]: true } : {};
	if (sandboxOptions.attackMode) sandbox._evalConstants[sandboxOptions.attackMode] = true;
	sandbox.mastery = sandboxOptions.mastery ? { [sandboxOptions.mastery]: true } : {};
	sandbox.damageTypes = sandboxOptions.damageTypes;
	sandbox.defaultDamageType = sandboxOptions.defaultDamageType;
	if (!foundry.utils.isEmpty(sandboxOptions.damageTypes)) foundry.utils.mergeObject(sandbox._evalConstants, sandboxOptions.damageTypes);
	sandbox.activity.damageTypes = sandboxOptions.damageTypes;
	sandbox.activity.defaultDamageType = sandboxOptions.defaultDamageType;
	sandbox.activity.attackMode = sandboxOptions.attackMode;
	sandbox.activity.mastery = sandboxOptions.mastery;
	if (actionType) {
		sandbox._evalConstants[actionType] = true;
		sandbox.activity.actionType = actionType;
	}
	if (activity?.attack?.type) {
		sandbox._evalConstants[activity.attack.type.value] = true;
		sandbox._evalConstants[activity.attack.type.classification] = true;
	}
	if (activityData?.activation?.type) sandbox._evalConstants[activityData.activation.type] = true;
	if (activityData?.type) sandbox._evalConstants[activityData.type] = true;

	sandbox.item = itemData;
	sandbox.item.uuid = item?.uuid;
	sandbox.item.id = item?.id;
	sandbox.item.flags ??= item?.flags ?? {};
	sandbox.item.flags['midi-qol'] ??= item?.flags?.['midi-qol'] ?? {};
	sandbox.item.midiFlags ??= sandbox.item.flags['midi-qol'];
	sandbox.item.classIdentifier = item?.system?.classIdentifier;
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
		sandbox._evalConstants[item.type] = true;
		if (itemData?.type?.value) sandbox._evalConstants[itemData.type.value] = true;
		if (itemData.school) sandbox._evalConstants[itemData.school] = true;
		const ammoProperties = sandbox.ammunition?.system?.properties;
		const itemProperties = item?.system?.properties instanceof Set ? new Set(item.system.properties) : new Set();
		if (ammoProperties?.length) ammoProperties.forEach((p) => itemProperties.add(p));
		for (const property of itemProperties) {
			sandbox.itemProperties[property] = true;
			sandbox._evalConstants[property] = true;
		}
	}

	const combat = game.combat;
	sandbox.combat = { active: combat?.active, round: combat?.round, turn: combat?.turn, current: combat?.current, turns: combat?.turns };
	sandbox.isTurn = sandbox.rollingActor.isTurn;
	sandbox.isOpponentTurn = sandbox.opponentActor.isTurn;
	sandbox.isTargetTurn = sandbox.isOpponentTurn;
	sandbox.movementLastSegment = sandbox.rollingActor.movementLastSegment;
	sandbox.movementTurn = sandbox.rollingActor.movementTurn;

	sandbox.worldTime = game.time?.worldTime;
	sandbox.options = sandboxOptions;
	sandbox.ability = sandboxOptions.ability ? { [sandboxOptions.ability]: true } : {};
	sandbox.abilityOverride = sandboxOptions.ability ?? '';
	sandbox.skill = sandboxOptions.skill ? { [sandboxOptions.skill]: true } : {};
	sandbox.tool = sandboxOptions.tool ? { [sandboxOptions.tool]: true } : {};
	if (sandboxOptions?.ability) sandbox._evalConstants[sandboxOptions.ability] = true;
	if (sandboxOptions?.skill) sandbox._evalConstants[sandboxOptions.skill] = true;
	if (sandboxOptions?.tool) sandbox._evalConstants[sandboxOptions.tool] = true;
	sandbox.isConcentration = sandboxOptions?.isConcentration;
	sandbox.isDeathSave = sandboxOptions?.isDeathSave;
	sandbox.isInitiative = sandboxOptions?.isInitiative;
	sandbox.distance = sandboxOptions?.distance;
	sandbox.hook = sandboxOptions?.hook;
	sandbox.targets = sandboxOptions?.targets ?? [];
	sandbox.singleTarget = sandboxOptions?.targets?.length === 1 && true;
	sandbox.castingLevel = sandboxOptions.spellLevel ?? itemData?.level ?? null;
	sandbox.spellLevel = sandbox.castingLevel;
	sandbox.baseSpellLevel = item?.system?.level;
	sandbox.scaling = formulaData?.scaling ?? sandboxOptions?.scaling ?? 0;
	sandbox.d20Total = sandboxOptions?.d20?.d20Total ?? sandboxOptions?.d20?.attackRollTotal;
	sandbox.d20Result = sandboxOptions?.d20?.d20Result ?? sandboxOptions?.d20?.attackRollD20;
	sandbox.targetValue = hookUsesTargetAC && Number.isFinite(sandbox.opponentAC) ? sandbox.opponentAC : sandboxOptions?.target;
	const d20ResultOverTarget = sandbox.d20Total - sandbox.targetValue;
	sandbox.d20ResultOverTarget = !isNaN(d20ResultOverTarget) ? d20ResultOverTarget : undefined;
	sandbox.attackRollTotal = sandbox.d20Total;
	sandbox.attackRollD20 = sandbox.d20Result;
	sandbox.attackRollOverAC = sandbox.d20ResultOverTarget;
	const resolvedD20Mode = sandboxOptions?.d20?.advantageMode ?? sandboxOptions?.advantageMode ?? sandboxOptions?.[Constants.MODULE_ID]?.advantageMode;
	const transientRollState = _getSandboxTransientRollState(sandboxOptions);
	sandbox.hasTransitAdvantage = transientRollState.hasTransitAdvantage;
	sandbox.hasTransitDisadvantage = transientRollState.hasTransitDisadvantage;
	sandbox.advantageBehavior = _getConfiguredAdvantageBehavior({}, sandboxOptions);
	if (typeof resolvedD20Mode === 'number') {
		sandbox.hasAdvantage = resolvedD20Mode > 0;
		sandbox.hasDisadvantage = resolvedD20Mode < 0;
	} else {
		sandbox.hasAdvantage = sandboxOptions?.d20?.hasAdvantage ?? sandboxOptions?.advantage;
		sandbox.hasDisadvantage = sandboxOptions?.d20?.hasDisadvantage ?? sandboxOptions?.disadvantage;
	}
	sandbox.hasAdvantage = Boolean(sandbox.hasAdvantage || sandbox.hasTransitAdvantage);
	sandbox.hasDisadvantage = Boolean(sandbox.hasDisadvantage || sandbox.hasTransitDisadvantage);
	sandbox.isCritical = sandboxOptions?.d20?.isCritical;
	sandbox.isFumble = sandboxOptions?.d20?.isFumble;
	globalThis?.[Constants.MODULE_NAME_SHORT]?.contextKeywords?.applyToSandbox?.(sandbox);
	globalThis?.[Constants.MODULE_NAME_SHORT]?.usageRules?.applyToSandbox?.(sandbox);

	if (sandbox.undefined || sandbox['']) {
		delete sandbox.undefined;
		delete sandbox[''];
		console.warn('AC5E sandbox.undefined detected!!!');
	}
	if (settings.debug || ac5e.logEvaluationData) console.log(`AC5E._createEvaluationSandbox logging the available data for hook "${sandbox.hook}":`, { evaluationData: sandbox });
	return sandbox;
}
