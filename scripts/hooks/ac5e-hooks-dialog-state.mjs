import Constants from '../ac5e-constants.mjs';

export function getDialogAc5eConfig(dialog, fallbackConfig) {
	return dialog?.config?.options?.[Constants.MODULE_ID] ?? dialog?.config?.[Constants.MODULE_ID] ?? dialog?.config?.rolls?.[0]?.options?.[Constants.MODULE_ID] ?? fallbackConfig;
}

export function syncDialogAc5eState(dialog, ac5eConfig) {
	if (!dialog?.config || !ac5eConfig || typeof ac5eConfig !== 'object') return;
	const defaultButton = ac5eConfig.defaultButton ?? 'normal';
	const advantageMode = ac5eConfig.advantageMode ?? 0;
	const optinSelected = ac5eConfig.optinSelected ?? {};
	const roll0Options = dialog.config?.rolls?.[0]?.options;
	if (roll0Options && typeof roll0Options === 'object') {
		roll0Options[Constants.MODULE_ID] ??= {};
		roll0Options[Constants.MODULE_ID].defaultButton = defaultButton;
		roll0Options[Constants.MODULE_ID].advantageMode = advantageMode;
		roll0Options[Constants.MODULE_ID].optinSelected = optinSelected;
	}
	if (dialog.config?.options && typeof dialog.config.options === 'object') {
		dialog.config.options.defaultButton = defaultButton;
		dialog.config.options.advantageMode = advantageMode;
		dialog.config.options[Constants.MODULE_ID] ??= ac5eConfig;
		dialog.config.options[Constants.MODULE_ID].defaultButton = defaultButton;
		dialog.config.options[Constants.MODULE_ID].advantageMode = advantageMode;
		dialog.config.options[Constants.MODULE_ID].optinSelected = optinSelected;
	}
	dialog.config[Constants.MODULE_ID] ??= ac5eConfig;
	dialog.config[Constants.MODULE_ID].defaultButton = defaultButton;
	dialog.config[Constants.MODULE_ID].advantageMode = advantageMode;
	dialog.config[Constants.MODULE_ID].optinSelected = optinSelected;
}
