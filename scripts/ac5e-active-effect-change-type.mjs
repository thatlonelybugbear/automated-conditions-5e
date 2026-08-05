import Constants from './ac5e-constants.mjs';

export function applyAc5eActiveEffectChange(targetDoc, change) {
	void targetDoc;
	const key = `${change?.key ?? ''}`.trim();
	if (!key.startsWith(`flags.${Constants.MODULE_ID}.`) && !key.startsWith('flags.ac5e.')) return;
}

export function registerAc5eActiveEffectChangeType() {
	if (!CONFIG?.ActiveEffect?.changeTypes) return;
	const config = {
		group: "Bugbear's Den",
		label: 'Automated Conditions 5e',
		defaultPriority: 20,
		handler: applyAc5eActiveEffectChange,
		render: null,
	};
	CONFIG.ActiveEffect.changeTypes[Constants.ACTIVE_EFFECT_CHANGE_TYPE] = config;
}
