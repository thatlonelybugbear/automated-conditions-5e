import { _activeModule, _getTooltip } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { mirrorD20ModeState } from './ac5e-hooks-roll-post.mjs';
import { applyResolvedAbilityOverrideToRollConfig } from './ac5e-hooks-roll-build.mjs';

export function preserveD20Mode(processConfig, config, index, { app } = {}) {
	if (app || index !== 0) return;
	const ac5eConfig = config?.options?.[Constants.MODULE_ID];
	if (!['attack', 'check', 'save', 'init'].includes(ac5eConfig?.hookType) || typeof ac5eConfig.advantageMode !== 'number') return;
	if (_activeModule('midi-qol') && ac5eConfig.hookType !== 'attack') return;
	// Native keybindings run after the pre-roll hooks; retain AC5E's resolved suppression and enforcement.
	const override = ac5eConfig.explicitModeOverride;
	const action = override?.family === 'd20' ? override.action : ac5eConfig.defaultButton;
	mirrorD20ModeState(ac5eConfig, config, { action, advantageMode: ac5eConfig.advantageMode, rollOptions: config.options });
}

export function postBuildRollConfig(processConfig, config, index, context) {
	if (!processConfig || !config || typeof config !== 'object') return true;
	preserveD20Mode(processConfig, config, index, context);
	moveAttackOptinPartsToEnd(config);
	preserveDamageFormulaFactors(processConfig, config);
	const sourceAc5eConfig =
		config?.rolls?.[index]?.options?.[Constants.MODULE_ID] ??
		config?.rolls?.[0]?.options?.[Constants.MODULE_ID] ??
		config?.options?.[Constants.MODULE_ID] ??
		config?.[Constants.MODULE_ID];
	if (sourceAc5eConfig?.hookType === 'attack') applyResolvedAbilityOverrideToRollConfig(sourceAc5eConfig, config, 'attack');
	if (!_activeModule('midi-qol')) return true;
	const processRollOptions = processConfig?.rolls?.[index]?.options ?? processConfig?.rolls?.[0]?.options;
	if (!processRollOptions || typeof processRollOptions !== 'object') return true;
	const ac5eConfig =
		processConfig?.rolls?.[index]?.options?.[Constants.MODULE_ID] ??
		processConfig?.rolls?.[0]?.options?.[Constants.MODULE_ID] ??
		processConfig?.options?.[Constants.MODULE_ID] ??
		processConfig?.[Constants.MODULE_ID];
	if (sourceAc5eConfig?.hookType === 'damage') {
		if (sourceAc5eConfig?.tooltipObj && typeof sourceAc5eConfig.tooltipObj === 'object') delete sourceAc5eConfig.tooltipObj.damage;
		processRollOptions[Constants.MODULE_ID] ??= {};
		processRollOptions[Constants.MODULE_ID].chatTooltip = _getTooltip(sourceAc5eConfig);
	}
	if (ac5eConfig?.hookType !== 'check' || !ac5eConfig?.options?.skill) return true;
	if (!ac5eConfig?.preAC5eConfig?.forceChatTooltip) return true;
	const explicitOverride = ac5eConfig?.explicitModeOverride;
	const ac5eMode =
		explicitOverride?.family === 'd20' ?
			explicitOverride.action === 'advantage' ? CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE
			: explicitOverride.action === 'disadvantage' ? CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE
			: CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL
		: typeof ac5eConfig?.advantageMode === 'number' ? ac5eConfig.advantageMode
		: typeof processRollOptions?.[Constants.MODULE_ID]?.advantageMode === 'number' ? processRollOptions[Constants.MODULE_ID].advantageMode
		: undefined;
	const normalizedAction =
		explicitOverride?.family === 'd20' ? explicitOverride.action
		: ac5eMode === CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ? 'advantage'
		: ac5eMode === CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ? 'disadvantage'
		: 'normal';
	mirrorD20ModeState(ac5eConfig, config, { action: normalizedAction, advantageMode: ac5eMode, defaultButton: normalizedAction, explicitOverride });
	return true;
}

function preserveDamageFormulaFactors(processConfig, config) {
	if (!config.parts?.some((part) => String(part).includes('[ac5eStaticFactor:'))) return;
	const roll = CONFIG.Dice.DamageRoll.fromConfig({ ...config, options: { ...config.options, configured: false } }, processConfig);
	const formula = roll.formula.replace(/-?\d+(?:\.\d+)?\[ac5eStaticFactor:([^\]]+)\]/g, (_, factor) => factor);
	config.parts = [formula];
	config.formula = formula;
	// Criticals have already been configured; keep the restored factors static.
	config.options = { ...roll.options, configured: true };
	if (config.options[Constants.MODULE_ID]) config.options[Constants.MODULE_ID].displayFormula = formula;
}

function moveAttackOptinPartsToEnd(config) {
	const order = config._ac5eOptinPartOrder;
	delete config._ac5eOptinPartOrder;
	if (!order || !Array.isArray(config.parts)) return;
	const { start, prefix } = order;
	if (config.parts.length <= prefix.length || !prefix.every((part, index) => config.parts[index] === part)) return;
	config.parts = [...config.parts.slice(0, start), ...config.parts.slice(prefix.length), ...prefix.slice(start)];
}
