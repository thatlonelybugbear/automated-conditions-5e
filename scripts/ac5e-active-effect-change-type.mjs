import Constants from './ac5e-constants.mjs';

export function applyAc5eActiveEffectChange(targetDoc, change) {
	void targetDoc;
	const key = `${change?.key ?? ''}`.trim();
	if (!key.startsWith(`flags.${Constants.MODULE_ID}.`) && !key.startsWith('flags.ac5e.')) return;
}

export function registerAc5eActiveEffectChangeType() {
	if (!CONFIG?.ActiveEffect?.changeTypes) return;
	const config = {
		label: 'AC5E.ActiveEffect.ChangeTypes.AC5E',
		defaultPriority: 20,
		handler: applyAc5eActiveEffectChange,
		render: null,
	};
	CONFIG.ActiveEffect.changeTypes[Constants.ACTIVE_EFFECT_CHANGE_TYPE] = config;
	CONFIG.ActiveEffect.documentClass?.CHANGE_TYPES && (CONFIG.ActiveEffect.documentClass.CHANGE_TYPES[Constants.ACTIVE_EFFECT_CHANGE_TYPE] = config);
	globalThis.ActiveEffect?.CHANGE_TYPES && (globalThis.ActiveEffect.CHANGE_TYPES[Constants.ACTIVE_EFFECT_CHANGE_TYPE] = config);
	foundry.documents?.ActiveEffect?.CHANGE_TYPES && (foundry.documents.ActiveEffect.CHANGE_TYPES[Constants.ACTIVE_EFFECT_CHANGE_TYPE] = config);
}
