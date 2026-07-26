import Constants from './ac5e-constants.mjs';

export function applyAc5eActiveEffectChange(targetDoc, change) {
	void targetDoc;
	const key = `${change?.key ?? ''}`.trim();
	if (!key.startsWith(`flags.${Constants.MODULE_ID}.`) && !key.startsWith('flags.ac5e.')) return;
}

export function registerAc5eActiveEffectChangeType() {
	if (!CONFIG?.ActiveEffect?.changeTypes) return;
	const dnd5eV6OrNewer = foundry.utils.isNewerVersion(game.system.version, 6);
	const config = {
		...(dnd5eV6OrNewer ? { group: "Bugbear's Den" } : {}),
		label: dnd5eV6OrNewer ? 'AC5E.ActiveEffect.ChangeTypes.AutomatedConditions5e' : 'AC5E',
		defaultPriority: 20,
		handler: applyAc5eActiveEffectChange,
		render: null,
	};
	CONFIG.ActiveEffect.changeTypes[Constants.ACTIVE_EFFECT_CHANGE_TYPE] = config;
}
