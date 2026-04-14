import { _activeModule, _getTooltip } from '../ac5e-helpers.mjs';
import Constants from '../ac5e-constants.mjs';
import { mirrorD20ModeState } from './ac5e-hooks-roll-post.mjs';

export function postBuildRollConfig(processConfig, config, index) {
	if (!_activeModule('midi-qol')) return true;
	if (!processConfig || !config || typeof config !== 'object') return true;
	const processRollOptions = processConfig?.rolls?.[index]?.options ?? processConfig?.rolls?.[0]?.options;
	if (!processRollOptions || typeof processRollOptions !== 'object') return true;
	const ac5eConfig =
		processConfig?.rolls?.[index]?.options?.[Constants.MODULE_ID] ??
		processConfig?.rolls?.[0]?.options?.[Constants.MODULE_ID] ??
		processConfig?.options?.[Constants.MODULE_ID] ??
		processConfig?.[Constants.MODULE_ID];
	const sourceAc5eConfig =
		config?.rolls?.[index]?.options?.[Constants.MODULE_ID] ?? config?.rolls?.[0]?.options?.[Constants.MODULE_ID] ?? config?.options?.[Constants.MODULE_ID] ?? config?.[Constants.MODULE_ID];
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
