import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { _syncResolvedFastForwardD20Override } from './helpers/ac5e-helpers-fast-forward.mjs';
import {
	_activeModule,
	_autoArmor,
	_autoEncumbrance,
	_getD20TooltipOwnership,
	_getMessageDnd5eFlags,
	_getMidiAbilityAttributionEntries,
	_getMidiAttackAttributionEntries,
	_getUseConfigInflightCacheEntry,
	_hasItem,
	_i18nConditions,
	_localize,
	_midiOwnsAbilityTooltipPipeline,
	_resolveUseMessageContext,
	getActorAbilityRollObject,
	getActorSkillRollObject,
	getActorToolRollObject,
	getConcOrDeathOrInitRollObject,
} from './ac5e-helpers.mjs';

const settings = new Settings();

function _debugFlagEnabled(flag, legacyRootFlag = null) {
	return Boolean(ac5e?.debug?.[flag] ?? (legacyRootFlag ? ac5e?.[legacyRootFlag] : false));
}

function _collectionCount(collection) {
	if (!collection) return 0;
	if (typeof collection.size === 'number') return collection.size;
	if (Array.isArray(collection) || typeof collection === 'string') return collection.length;
	return 0;
}

function _getResolvedAdvantageMode(config = {}) {
	const directMode = config?.advantageMode;
	if (typeof directMode === 'number') return directMode;
	const optionMode = config?.options?.advantageMode;
	if (typeof optionMode === 'number') return optionMode;
	const rollMode = config?.rolls?.[0]?.options?.advantageMode;
	if (typeof rollMode === 'number') return rollMode;
	const advantage = config?.advantage;
	const disadvantage = config?.disadvantage;
	if (advantage === true && disadvantage !== true) return CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? 1;
	if (disadvantage === true && advantage !== true) return CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? -1;
	if (advantage === true || disadvantage === true) return CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL ?? 0;
	return null;
}

function _modeHasAdvantage(mode) {
	if (typeof mode !== 'number') return false;
	return mode > 0;
}

function _modeHasDisadvantage(mode) {
	if (typeof mode !== 'number') return false;
	return mode < 0;
}

function _getModeCountValue(bucket) {
	if (typeof bucket === 'number') return Math.max(0, bucket);
	if (Array.isArray(bucket)) return bucket.length;
	if (!bucket || typeof bucket !== 'object') return 0;
	if (typeof bucket.count === 'number') return Math.max(0, bucket.count);
	if (typeof bucket.active === 'number') return Math.max(0, bucket.active);
	if (bucket.active === true) return 1;
	if (Array.isArray(bucket.active)) return bucket.active.length;
	if (typeof bucket.value === 'number') return Math.max(0, bucket.value);
	if (bucket.value === true) return 1;
	return 0;
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

function collectRollMode({ actor, mode, max, min, hookType, typeLabel, ac5eConfig, systemMode, type, modeCounts }) {
	const capitalizeHook = hookType.capitalize();
	const resolvedTypeLabel = String(typeLabel ?? '').trim() ? String(typeLabel).trim() : _localize('AC5E.SystemMode');
	if (modeCounts?.override === 0) {
		ac5eConfig.subject.noAdvantage = [_localize('AC5E.NoAdvantage')];
		ac5eConfig.subject.noDisadvantage = [_localize('AC5E.NoDisadvantage')];
		systemMode.override = 0;
	}
	if (mode === 0 && modeCounts?.override === undefined) {
		const advantageCount = _getModeCountValue(modeCounts?.advantages);
		const disadvantageCount = _getModeCountValue(modeCounts?.disadvantages);
		if (advantageCount > 0) {
			systemMode.adv += advantageCount;
			ac5eConfig.subject.advantageNames.add(resolvedTypeLabel);
		}
		if (disadvantageCount > 0) {
			systemMode.dis += disadvantageCount;
			ac5eConfig.subject.disadvantageNames.add(resolvedTypeLabel);
		}
	}
	if (mode > 0) {
		if (modeCounts?.override > 0) {
			ac5eConfig.subject.forcedAdvantage = [_localize('AC5E.ForcedAdvantage')];
			systemMode.override = modeCounts.override;
		} else if (modeCounts?.disadvantages.suppressed) {
			ac5eConfig.subject.noDisadvantage = [_localize('AC5E.NoDisadvantage')];
			systemMode.suppressed = 'noDis';
		} else {
			systemMode.adv++;
			if (!actor.hasConditionEffect(`ability${capitalizeHook}Advantage`)) ac5eConfig.subject.advantageNames.add(resolvedTypeLabel);
			if (type === 'init' && !actor.hasConditionEffect('initiativeAdvantage')) ac5eConfig.subject.advantageNames.add(resolvedTypeLabel);
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
			if (!actor.hasConditionEffect(`ability${capitalizeHook}Disadvantage`) && ac5eConfig?.options?.skill !== 'ste') ac5eConfig.subject.disadvantageNames.add(resolvedTypeLabel);
			if (type === 'init' && !actor.hasConditionEffect('initiativeDisadvantage')) ac5eConfig.subject.disadvantageNames.add(resolvedTypeLabel);
		}
	}
	if (max) ac5eConfig.subject.modifiers.push(`${_localize('DND5E.ROLL.Range.Maximum')} (${max})`);
	if (min) ac5eConfig.subject.modifiers.push(`${_localize('DND5E.ROLL.Range.Minimum')} (${min})`);
	return systemMode;
}

function _resolveSystemModeLabel(baseKey, detail) {
	const base = _localize(baseKey);
	const rawDetail = String(detail ?? '').trim();
	if (!rawDetail) return base;
	const detailLabel = game.i18n?.has?.(rawDetail) ? _localize(rawDetail) : rawDetail;
	return `${base} (${detailLabel})`;
}

function getSystemRollConfig({ actor, options, hookType, ac5eConfig }) {
	if (!actor || hookType === 'damage' || hookType === 'use') return {};
	const systemMode = { adv: 0, dis: 0 };
	const autoArmorChecks = _autoArmor(actor);
	const { ability, skill, tool } = options || {};
	if (hookType === 'check' || hookType === 'init') {
		if (skill) {
			if (skill === 'ste' && autoArmorChecks.hasStealthDisadvantage)
				ac5eConfig.subject.disadvantageNames.add(`${_localize(autoArmorChecks.hasStealthDisadvantage)} (${_localize('ItemEquipmentStealthDisav')})`);
			const { mode, max, min, modeCounts } = getActorSkillRollObject({ actor, skill }) || {};
			const skillLabel = actor?.system?.skills?.[skill]?.label ?? CONFIG?.DND5E?.skills?.[skill]?.label ?? skill;
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: _resolveSystemModeLabel('AC5E.SystemMode', skillLabel), ac5eConfig, systemMode, modeCounts });
		}
		if (tool) {
			const { mode, max, min, modeCounts } = getActorToolRollObject({ actor, tool }) || {};
			const toolLabel = actor?.system?.tools?.[tool]?.label ?? tool;
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: _resolveSystemModeLabel('AC5E.SystemMode', toolLabel), ac5eConfig, systemMode, modeCounts });
		}
		if (options.isInitiative || hookType === 'init') {
			const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'init' }) || {};
			collectRollMode({ actor, mode, max, min, hookType: 'check', typeLabel: _resolveSystemModeLabel('AC5E.SystemMode', _localize('DND5E.Initiative')), ac5eConfig, systemMode, type: 'init', modeCounts });
		}
	}
	if (ability && ['check', 'save'].includes(hookType)) {
		if (options.isConcentration) {
			if (_hasItem(actor, _localize('AC5E.WarCaster'))) ac5eConfig.subject.advantage.push(_localize('AC5E.WarCaster'));
			const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'concentration' }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: _resolveSystemModeLabel('AC5E.SystemMode', _localize('DND5E.Concentration')), ac5eConfig, systemMode, modeCounts });
		} else {
			const { mode, max, min, modeCounts } = getActorAbilityRollObject({ actor, ability, hookType }) || {};
			const abilityLabel = CONFIG?.DND5E?.abilities?.[ability]?.label ?? CONFIG?.DND5E?.abilities?.[ability] ?? ability;
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: _resolveSystemModeLabel('AC5E.SystemMode', abilityLabel), ac5eConfig, systemMode, modeCounts });
		}
	}
	if (options.isDeathSave && hookType === 'save') {
		const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'death' }) || {};
		collectRollMode({ actor, mode, max, min, hookType, typeLabel: _resolveSystemModeLabel('AC5E.SystemMode', _localize('DND5E.DeathSave')), ac5eConfig, systemMode, modeCounts });
	}
	if (autoArmorChecks.notProficient && ['dex', 'str'].includes(ability)) {
		ac5eConfig.subject.disadvantageNames.add(`${_localize(autoArmorChecks.notProficient)} (${_localize('NotProficient')})`);
		systemMode.dis++;
	}
	if (_autoEncumbrance(actor, ability)) {
		ac5eConfig.subject.disadvantage.push(_i18nConditions('HeavilyEncumbered'));
		systemMode.dis++;
	}
	ac5eConfig.systemRollMode = systemMode;
	if (settings.debug) console.warn('AC5E_getSystemRollConfig', { ac5eConfig });
	return systemMode;
}

function _buildBaseConfig(config, dialog, hookType, tokenId, targetId, options, reEval) {
	const areKeysPressed = game.system.utils.areKeysPressed;
	const event = config?.event;
	const getPersistedHookConfig = (source, desiredHookType) => {
		if (!source || typeof source !== 'object') return undefined;
		const direct = source?.options?.[Constants.MODULE_ID] ?? source?.[Constants.MODULE_ID];
		if (direct?.hookType === desiredHookType || !desiredHookType) return direct;
		const rollConfigs = Array.isArray(source?.rolls) ? source.rolls.map((roll) => roll?.options?.[Constants.MODULE_ID]).filter(Boolean) : [];
		return rollConfigs.find((entry) => entry?.hookType === desiredHookType) ?? rollConfigs[0];
	};
	const isPressed = (name) => {
		const viaSystem = areKeysPressed instanceof Function ? areKeysPressed(event, name) : false;
		if (viaSystem) return true;
		switch (name) {
			case 'skipDialogAdvantage':
				return !!event?.altKey;
			case 'skipDialogDisadvantage':
				return !!event?.ctrlKey;
			case 'skipDialogNormal':
				return !!event?.shiftKey;
			default:
				return false;
		}
	};
	const token = canvas.tokens.get(tokenId);
	const actor = token?.actor;
	const persistedAc5eConfig = getPersistedHookConfig(config, hookType) ?? getPersistedHookConfig(dialog?.config, hookType);
	const originatingUseConfig = options?.originatingUseConfig;
	const ac5eConfig = {
		hookType,
		tokenId,
		targetId,
		isOwner: token?.document.isOwner,
		hasPlayerOwner: token?.document.hasPlayerOwner,
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
			info: [],
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
			abilityOverride: [],
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
			info: [],
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
			abilityOverride: [],
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
		preAC5eConfig: { skipDialogAdvantage: isPressed('skipDialogAdvantage'), skipDialogDisadvantage: isPressed('skipDialogDisadvantage'), skipDialogNormal: isPressed('skipDialogNormal') },
		returnEarly: false,
	};
	if (Array.isArray(originatingUseConfig?.subject?.fail)) ac5eConfig.subject.fail.push(...foundry.utils.duplicate(originatingUseConfig.subject.fail));
	if (Array.isArray(originatingUseConfig?.subject?.info)) ac5eConfig.subject.info.push(...foundry.utils.duplicate(originatingUseConfig.subject.info));
	if (Array.isArray(originatingUseConfig?.subject?.rangeNotes)) ac5eConfig.subject.rangeNotes.push(...foundry.utils.duplicate(originatingUseConfig.subject.rangeNotes));
	if (Array.isArray(originatingUseConfig?.opponent?.fail)) ac5eConfig.opponent.fail.push(...foundry.utils.duplicate(originatingUseConfig.opponent.fail));
	if (Array.isArray(originatingUseConfig?.opponent?.info)) ac5eConfig.opponent.info.push(...foundry.utils.duplicate(originatingUseConfig.opponent.info));
	const persistedBaseRoll0Options = persistedAc5eConfig?.preAC5eConfig?.baseRoll0Options;
	if (persistedBaseRoll0Options && typeof persistedBaseRoll0Options === 'object') ac5eConfig.preAC5eConfig.baseRoll0Options = foundry.utils.duplicate(persistedBaseRoll0Options);
	const persistedOptinBaseTargetADC = persistedAc5eConfig?.optinBaseTargetADC;
	if (Array.isArray(persistedOptinBaseTargetADC)) ac5eConfig.optinBaseTargetADC = foundry.utils.duplicate(persistedOptinBaseTargetADC);
	if (persistedAc5eConfig?.optinBaseTargetADCValue !== undefined) ac5eConfig.optinBaseTargetADCValue = persistedAc5eConfig.optinBaseTargetADCValue;
	if (persistedAc5eConfig?.initialTargetADC !== undefined) ac5eConfig.initialTargetADC = persistedAc5eConfig.initialTargetADC;
	if (persistedAc5eConfig?.alteredTargetADC !== undefined) ac5eConfig.alteredTargetADC = persistedAc5eConfig.alteredTargetADC;
	const persistedOptins = getPersistedHookConfig(config, hookType)?.optinSelected ?? getPersistedHookConfig(dialog?.config, hookType)?.optinSelected;
	const persistedChanceRolls = getPersistedHookConfig(config, hookType)?.chanceRolls ?? getPersistedHookConfig(dialog?.config, hookType)?.chanceRolls;
	const parseOptinsFromFormObject = (formObject = {}) => {
		if (!formObject || typeof formObject !== 'object') return null;
		const parsed = {};
		let sawOptinKey = false;
		const nested = formObject.ac5eOptins;
		if (nested && typeof nested === 'object') {
			sawOptinKey = true;
			for (const [id, value] of Object.entries(nested)) parsed[id] = !!value;
		}
		for (const [key, value] of Object.entries(formObject)) {
			if (!key.startsWith('ac5eOptins.')) continue;
			sawOptinKey = true;
			const id = key.slice('ac5eOptins.'.length);
			if (id) parsed[id] = !!value;
		}
		return sawOptinKey ? parsed : null;
	};
	const parsedFormOptins = [parseOptinsFromFormObject(config?.formData?.object), parseOptinsFromFormObject(config?.options?.formData?.object), parseOptinsFromFormObject(config?.options)];
	const hasFormOptins = parsedFormOptins.some((entry) => entry !== null);
	const formOptins = Object.assign({}, ...parsedFormOptins.filter((entry) => entry && typeof entry === 'object'));
	const resolvedOptins =
		hasFormOptins ? formOptins
		: persistedOptins && typeof persistedOptins === 'object' ? foundry.utils.duplicate(persistedOptins)
		: null;
	if (resolvedOptins) ac5eConfig.optinSelected = resolvedOptins;
	if (persistedChanceRolls && typeof persistedChanceRolls === 'object') ac5eConfig.chanceRolls = foundry.utils.duplicate(persistedChanceRolls);
	ac5eConfig.originatingMessageId = options?.originatingMessageId;
	ac5eConfig.originatingUseConfig = undefined;
	if (reEval) ac5eConfig.reEval = reEval;
	ac5eConfig.preAC5eConfig.wasCritical = config.isCritical || ac5eConfig.preAC5eConfig.midiOptions?.isCritical || ac5eConfig.preAC5eConfig.critKey;
	if (options.skill || options.tool) ac5eConfig.title = dialog?.options?.window?.title;
	const midiRoller = _activeModule('midi-qol');
	const rsrRoller = _activeModule('ready-set-roll-5e');
	const roller =
		midiRoller ? 'MidiQOL'
		: rsrRoller ? 'RSR'
		: 'Core';
	ac5eConfig.preAC5eConfig.hasWorkflowOptions = false;
	ac5eConfig.preAC5eConfig.forceChatTooltip = false;
	if (midiRoller) {
		const midiOptions = config.midiOptions ?? {};
		const { workflow, ...safeMidiOptions } = midiOptions;
		ac5eConfig.preAC5eConfig.midiOptions = foundry.utils.duplicate(safeMidiOptions);
		const hasWorkflowOptions = !foundry.utils.isEmpty(config?.workflowOptions ?? {});
		const midiOwnsAbilityTooltip = _midiOwnsAbilityTooltipPipeline(ac5eConfig, config, dialog);
		const needsAbilityTooltipFallback = ['check', 'save'].includes(ac5eConfig?.hookType) && (foundry.utils.isEmpty(safeMidiOptions) || !midiOwnsAbilityTooltip);
		ac5eConfig.preAC5eConfig.hasWorkflowOptions = hasWorkflowOptions;
		ac5eConfig.preAC5eConfig.midiOwnsAbilityTooltip = midiOwnsAbilityTooltip;
		ac5eConfig.preAC5eConfig.forceChatTooltip = needsAbilityTooltipFallback;
	}
	ac5eConfig.roller = roller;
	ac5eConfig.preAC5eConfig.adv = config.advantage;
	ac5eConfig.preAC5eConfig.dis = config.disadvantage;
	ac5eConfig.preAC5eConfig.advantageMode = _getResolvedAdvantageMode(config);
	return { ac5eConfig, actor, midiRoller, roller };
}

export function _getConfig(config, dialog, hookType, tokenId, targetId, options = {}, reEval = false) {
	if (settings.debug || ac5e.debug_getConfig) console.warn('AC5E._getConfig:', { config });
	if (settings.debug) console.error('AC5E._getConfig', { mergedOptions: options });
	const useConfig = _getUseConfig({ options, config });
	if (useConfig?.options) {
		_mergeUseOptions(options, useConfig.options);
		options.originatingUseConfig = foundry.utils.duplicate(useConfig);
		if (options.originatingUseConfig?.options?.originatingUseConfig !== undefined) delete options.originatingUseConfig.options.originatingUseConfig;
		if (_debugFlagEnabled('getConfigLayers', 'debugGetConfigLayers')) console.warn('AC5E getConfig use options', { hookType, merged: useConfig.options });
	}
	const { ac5eConfig, actor, midiRoller, roller } = _buildBaseConfig(config, dialog, hookType, tokenId, targetId, options, reEval);
	const hookContext = _getHookConfig({ hookType, useConfig });
	const dialogContext = _getDialogConfig({ hookType, useConfig, hookContext });
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
	}
	if (hookContext?.reEval?.options?.length) {
		const currentOptions = pickOptions(options, hookContext.reEval.options);
		ac5eConfig.reEval ??= {};
		ac5eConfig.reEval.currentOptions = currentOptions;
		ac5eConfig.reEval.optionKeys = hookContext.reEval.options;
		if (!foundry.utils.isEmpty(currentOptions)) {
			foundry.utils.mergeObject(options, currentOptions, { inplace: true });
			foundry.utils.mergeObject(ac5eConfig.options, currentOptions, { inplace: true });
		}
	}
	const { skipDialogAdvantage, skipDialogDisadvantage, skipDialogNormal } = ac5eConfig.preAC5eConfig;
	const { deferD20KeypressToMidi, useMidiD20Attribution } = _getD20TooltipOwnership(ac5eConfig, { midiRoller });
	ac5eConfig.preAC5eConfig.deferD20KeypressToMidi = deferD20KeypressToMidi;
	const d20RollerLabel = useMidiD20Attribution ? roller : 'Core';
	const returnEarly = !deferD20KeypressToMidi && skipDialogNormal && (skipDialogAdvantage || skipDialogDisadvantage);
	const keypressAdvantageSource = !deferD20KeypressToMidi && skipDialogAdvantage && !returnEarly;
	const keypressDisadvantageSource = !deferD20KeypressToMidi && skipDialogDisadvantage && !returnEarly;
	if (returnEarly) {
		const explicitKeypressAction =
			skipDialogAdvantage ?
				hookType === 'damage' ?
					'critical'
				:	'advantage'
			: skipDialogDisadvantage ?
				hookType === 'damage' ?
					'normal'
				:	'disadvantage'
			:	'';
		if (explicitKeypressAction) {
			ac5eConfig.explicitModeOverride = {
				action: explicitKeypressAction,
				source: 'keypress',
				family: hookType === 'damage' ? 'damage' : 'd20',
				proposedAction: String(ac5eConfig?.proposedButton ?? ac5eConfig?.defaultButton ?? '')
					.trim()
					.toLowerCase(),
				replacesCalculatedMode: true,
			};
		}
		ac5eConfig.returnEarly = true;
		if (skipDialogAdvantage) {
			if (hookType === 'damage') {
				config.isCritical = true;
				ac5eConfig.subject.critical.push('Override keypress');
			} else ac5eConfig.subject.advantage.push('Override keypress');
		}
		if (skipDialogDisadvantage) {
			if (hookType === 'damage') {
				config.isCritical = false;
				ac5eConfig.subject.noCritical.push('Override keypress');
			} else ac5eConfig.subject.disadvantage.push('Override keypress');
		}
		if (hookType !== 'damage' && explicitKeypressAction) _syncResolvedFastForwardD20Override(ac5eConfig, config, explicitKeypressAction);
		if (settings.debug) console.warn('AC5E_getConfig returning early', { ac5eConfig });
		return ac5eConfig;
	}
	if (skipDialogAdvantage && !deferD20KeypressToMidi) {
		if (hookType === 'damage') ac5eConfig.subject.critical.push('Keypress');
		else ac5eConfig.subject.advantage.push('Keypress');
	}
	if (skipDialogDisadvantage && !deferD20KeypressToMidi) {
		if (hookType === 'damage') ac5eConfig.subject.noCritical.push('Keypress');
		else ac5eConfig.subject.disadvantage.push('Keypress');
	}
	const { adv, dis } = getSystemRollConfig({ actor, options, hookType, ac5eConfig });
	const midiAttackAdvAttribution = midiRoller ? _getMidiAttackAttributionEntries(config?.workflow, 'ADV') : [];
	const midiAttackDisAttribution = midiRoller ? _getMidiAttackAttributionEntries(config?.workflow, 'DIS') : [];
	const midiAbilityAdvAttribution = midiRoller && ['check', 'save'].includes(hookType) ? _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, 'ADV') : [];
	const midiAbilityDisAttribution = midiRoller && ['check', 'save'].includes(hookType) ? _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, 'DIS') : [];
	const midiAbilityFailAttribution = midiRoller && ['check', 'save'].includes(hookType) ? _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, 'FAIL') : [];
	const midiAbilitySuccessAttribution = midiRoller && ['check', 'save'].includes(hookType) ? _getMidiAbilityAttributionEntries(ac5eConfig, config, dialog, 'SUCCESS') : [];
	const hasMidiAdvAttribution =
		hookType === 'attack' ? midiAttackAdvAttribution.length > 0
		: ['check', 'save'].includes(hookType) ? midiAbilityAdvAttribution.length > 0
		: false;
	const hasMidiDisAttribution =
		hookType === 'attack' ? midiAttackDisAttribution.length > 0
		: ['check', 'save'].includes(hookType) ? midiAbilityDisAttribution.length > 0
		: false;
	const midiAdvAttribution = [...new Set((hookType === 'attack' ? midiAttackAdvAttribution : midiAbilityAdvAttribution).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
	const midiDisAttribution = [...new Set((hookType === 'attack' ? midiAttackDisAttribution : midiAbilityDisAttribution).map((entry) => String(entry ?? '').trim()).filter(Boolean))];
	ac5eConfig.subject.midiAdvantage = midiAdvAttribution;
	ac5eConfig.subject.midiDisadvantage = midiDisAttribution;
	ac5eConfig.subject.midiFail = midiAbilityFailAttribution;
	ac5eConfig.subject.midiSuccess = midiAbilitySuccessAttribution;
	const incomingAdvantageMode = ac5eConfig.preAC5eConfig?.advantageMode;
	const incomingAdvantage = _modeHasAdvantage(incomingAdvantageMode) || (incomingAdvantageMode === null && config.advantage === true && config.disadvantage !== true);
	const incomingDisadvantage = _modeHasDisadvantage(incomingAdvantageMode) || (incomingAdvantageMode === null && config.disadvantage === true && config.advantage !== true);
	if (!options.preConfigInitiative) {
		if (
			hookType !== 'damage' &&
			!returnEarly &&
			!adv &&
			((incomingAdvantage && !deferD20KeypressToMidi && !keypressAdvantageSource) || ac5eConfig.preAC5eConfig.midiOptions?.advantage || hasMidiAdvAttribution)
		) {
			if (useMidiD20Attribution) {
				if (midiAdvAttribution.length) ac5eConfig.subject.advantage.push(...midiAdvAttribution);
				else ac5eConfig.subject.advantage.push(`${d20RollerLabel} ${_localize('AC5E.Flags')}`);
			} else ac5eConfig.subject.advantage.push(`${d20RollerLabel} ${_localize('AC5E.Flags')}`);
		}
		if (
			hookType !== 'damage' &&
			!returnEarly &&
			!dis &&
			((incomingDisadvantage && !deferD20KeypressToMidi && !keypressDisadvantageSource) || ac5eConfig.preAC5eConfig.midiOptions?.disadvantage || hasMidiDisAttribution)
		) {
			if (useMidiD20Attribution) {
				if (midiDisAttribution.length) ac5eConfig.subject.disadvantage.push(...midiDisAttribution);
				else ac5eConfig.subject.disadvantage.push(`${d20RollerLabel} ${_localize('AC5E.Flags')}`);
			} else ac5eConfig.subject.disadvantage.push(`${d20RollerLabel} ${_localize('AC5E.Flags')}`);
		}
		if (!returnEarly && ((config.isCritical && !keypressAdvantageSource) || ac5eConfig.preAC5eConfig.midiOptions?.isCritical)) ac5eConfig.subject.critical.push(`${roller} ${_localize('AC5E.Flags')}`);
	}
	if (settings.debug || ac5e.debug_getConfig) console.warn('AC5E_getConfig', { ac5eConfig });
	return ac5eConfig;
}

export function _getUseConfig({ options, config } = {}) {
	let useConfig = options?.originatingUseConfig ?? config?.options?.originatingUseConfig ?? null;
	let debugMeta = { source: useConfig ? 'options' : 'unknown' };
	const originatingMessageId = options?.originatingMessageId;
	const messageId = originatingMessageId ?? options?.messageId;
	const context = _resolveUseMessageContext({ messageId, originatingMessageId });
	const { triggerMessage, originatingMessageId: resolvedOriginatingMessageId, originatingMessage, usageMessage, registryMessages } = context;
	if (!useConfig) {
		useConfig = context.useConfig;
		debugMeta = {
			source: useConfig ? 'message' : 'none',
			messageId,
			originatingMessageId: resolvedOriginatingMessageId,
			hasMessage: !!triggerMessage,
			registryCount: _collectionCount(registryMessages),
		};
		if (!useConfig) {
			const cacheEntry = _getUseConfigInflightCacheEntry([resolvedOriginatingMessageId, messageId]);
			if (cacheEntry?.useConfig) {
				useConfig = foundry.utils.duplicate(cacheEntry.useConfig);
				debugMeta = { ...debugMeta, source: 'inflight-cache', cacheExpiresAt: cacheEntry.expiresAt };
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

export function _getSafeUseConfig(ac5eConfig) {
	const options = foundry.utils.duplicate(ac5eConfig?.options ?? {});
	const toDocumentRef = (value) => {
		if (!value) return null;
		if (typeof value === 'string' && value.includes('.')) return { id: value.split('.').at(-1), type: undefined, uuid: value };
		const uuid = value?.uuid;
		if (!uuid || typeof uuid !== 'string') return null;
		return { id: value?.id ?? value?._id ?? uuid.split('.').at(-1), type: value?.type, uuid };
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
	for (const key of Object.keys(options)) if (key.startsWith('_')) delete options[key];
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
		advantageMode: ac5eConfig?.advantageMode ?? null,
		advantage: ac5eConfig?.advantageMode > 0,
		disadvantage: ac5eConfig?.advantageMode < 0,
		isCritical: ac5eConfig?.isCritical ?? false,
		isFumble: ac5eConfig?.isFumble ?? false,
		options,
		optionsSnapshot,
		subject: {
			fail: foundry.utils.duplicate(ac5eConfig?.subject?.fail ?? []),
			info: foundry.utils.duplicate(ac5eConfig?.subject?.info ?? []),
			rangeNotes: foundry.utils.duplicate(ac5eConfig?.subject?.rangeNotes ?? []),
		},
		opponent: { fail: foundry.utils.duplicate(ac5eConfig?.opponent?.fail ?? []), info: foundry.utils.duplicate(ac5eConfig?.opponent?.info ?? []) },
		bonuses: { subject: sanitizeBonuses(ac5eConfig?.subject?.bonus), opponent: sanitizeBonuses(ac5eConfig?.opponent?.bonus) },
		parts: foundry.utils.duplicate(ac5eConfig?.parts ?? []),
		damageModifiers: foundry.utils.duplicate(ac5eConfig?.damageModifiers ?? []),
		extraDice: foundry.utils.duplicate(ac5eConfig?.extraDice ?? []),
		threshold: foundry.utils.duplicate(ac5eConfig?.threshold ?? []),
		fumbleThreshold: foundry.utils.duplicate(ac5eConfig?.fumbleThreshold ?? []),
		pendingUses: foundry.utils.duplicate(ac5eConfig?.pendingUses ?? []),
		pendingUsesApplied: !!ac5eConfig?.pendingUsesApplied,
		preAC5eConfig: { adv: ac5eConfig?.preAC5eConfig?.adv ?? null, dis: ac5eConfig?.preAC5eConfig?.dis ?? null, wasCritical: ac5eConfig?.preAC5eConfig?.wasCritical ?? null },
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
		for (const key of Object.keys(safe.options)) if (key.startsWith('_')) delete safe.options[key];
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
	for (const key of allowlist) if (useOptions[key] !== undefined) filtered[key] = useOptions[key];
	if (!Object.keys(filtered).length) return;
	for (const [key, value] of Object.entries(filtered)) {
		if (!Array.isArray(value)) continue;
		const existing = targetOptions[key];
		if (!existing || (Array.isArray(existing) && existing.length === 0 && value.length)) targetOptions[key] = foundry.utils.duplicate(value);
	}
	for (const [key, value] of Object.entries(filtered)) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
		const existing = targetOptions[key];
		if (!existing || (typeof existing === 'object' && !Array.isArray(existing) && Object.keys(existing).length === 0 && Object.keys(value).length)) targetOptions[key] = foundry.utils.duplicate(value);
	}
	foundry.utils.mergeObject(targetOptions, filtered, { overwrite: false });
}
