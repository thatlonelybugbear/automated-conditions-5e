export function _ensureRoll0Options(config, roll0) {
	if (!config) return roll0?.options ?? null;
	if (!Array.isArray(config.rolls)) config.rolls = [];
	if (!config.rolls[0] || typeof config.rolls[0] !== 'object') config.rolls[0] = { options: {} };
	const rollEntry = config.rolls[0];
	if (!rollEntry.options || typeof rollEntry.options !== 'object') rollEntry.options = {};
	if (roll0 && roll0 !== rollEntry) roll0.options = rollEntry.options;
	return rollEntry.options;
}

function _writeFastForwardMode(ac5eConfig, config, roll0) {
	if (!ac5eConfig || !config) return;
	const rollOptions = _ensureRoll0Options(config, roll0);
	if (!rollOptions) return;
	const advModes = CONFIG?.Dice?.D20Roll?.ADV_MODE ?? {};
	const explicitAdvantage = config.advantage === true && config.disadvantage !== true;
	const explicitDisadvantage = config.disadvantage === true && config.advantage !== true;
	const resolvedMode =
		explicitAdvantage ? advModes.ADVANTAGE
		: explicitDisadvantage ? advModes.DISADVANTAGE
		: typeof ac5eConfig?.advantageMode === 'number' ? ac5eConfig.advantageMode
		: typeof rollOptions?.advantageMode === 'number' ? rollOptions.advantageMode
		: typeof config?.advantageMode === 'number' ? config.advantageMode
		: null;
	const resolvedAdvantage =
		typeof resolvedMode === 'number' ?
			resolvedMode === advModes.ADVANTAGE ? true
			: resolvedMode === advModes.DISADVANTAGE ? false
			: true
		: config.advantage;
	const resolvedDisadvantage =
		typeof resolvedMode === 'number' ?
			resolvedMode === advModes.DISADVANTAGE ? true
			: resolvedMode === advModes.ADVANTAGE ? false
			: true
		: config.disadvantage;
	const applyResolvedMode = (target) => {
		if (!target || typeof target !== 'object') return;
		if (ac5eConfig.defaultButton !== undefined) target.defaultButton = ac5eConfig.defaultButton;
		if (ac5eConfig.advantageMode !== undefined) target.advantageMode = ac5eConfig.advantageMode;
		if (resolvedAdvantage !== undefined) target.advantage = !!resolvedAdvantage;
		if (resolvedDisadvantage !== undefined) target.disadvantage = !!resolvedDisadvantage;
	};
	applyResolvedMode(rollOptions);
	applyResolvedMode(config);
}

export function _syncResolvedFastForwardD20Override(ac5eConfig, config, action) {
	if (!ac5eConfig || !config) return;
	const rollOptions = _ensureRoll0Options(config);
	const normalizedAction = String(action ?? 'normal')
		.trim()
		.toLowerCase();
	let advantage = true;
	let disadvantage = true;
	let advantageMode = CONFIG?.Dice?.D20Roll?.ADV_MODE?.NORMAL ?? 0;
	if (normalizedAction === 'advantage') {
		advantage = true;
		disadvantage = false;
		advantageMode = CONFIG?.Dice?.D20Roll?.ADV_MODE?.ADVANTAGE ?? advantageMode;
	} else if (normalizedAction === 'disadvantage') {
		advantage = false;
		disadvantage = true;
		advantageMode = CONFIG?.Dice?.D20Roll?.ADV_MODE?.DISADVANTAGE ?? advantageMode;
	}
	ac5eConfig.advantageMode = advantageMode;
	ac5eConfig.defaultButton = normalizedAction;
	config.advantageMode = advantageMode;
	config.advantage = advantage;
	config.disadvantage = disadvantage;
	if (rollOptions && typeof rollOptions === 'object') {
		rollOptions.advantage = advantage;
		rollOptions.disadvantage = disadvantage;
		rollOptions.advantageMode = advantageMode;
		rollOptions.defaultButton = normalizedAction;
	}
}

export function _applyResolvedFastForwardMode(ac5eConfig, config, roll0) {
	_writeFastForwardMode(ac5eConfig, config, roll0);
}
