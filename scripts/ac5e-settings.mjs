import Constants from './ac5e-constants.mjs';

export default class Settings {
	// KEYS FOR WORLD CONFIG SETTINGS
	static SHOW_TOOLTIPS = 'showTooltips';
	static SHOW_MODULE_NAME_IN_TOOLTIPS = 'shownNameTooltip';
	static AUTOMATE_ARMOR_PROF_STEALTH = 'autoArmor';
	static AUTOMATE_RANGED_ATTACKS = 'autoRangedAttacks';
	static AUTOMATE_EXHAUSTION = 'autoExhaustion'; //to-do: add module solution for dndone exhaustion.
	static AUTOMATE_ENCUMBRANCE = 'autoEncumbrance';
	static TARGETING = 'targeting';
	static KEYPRESS_OVERRIDES = 'keypressOverrides';
	static DEBUG = 'debugging';

	registerSettings() {
		this._registerWorldSettings();
	}

	_registerWorldSettings() {
		const userRoles = {};
		userRoles[CONST.USER_ROLES.PLAYER] = 'Player';
		userRoles[CONST.USER_ROLES.TRUSTED] = 'Trusted Player';
		userRoles[CONST.USER_ROLES.ASSISTANT] = 'Assistant GM';
		userRoles[CONST.USER_ROLES.GAMEMASTER] = 'Game Master';
		userRoles[5] = 'None';

		game.settings.register(Constants.MODULE_ID, Settings.SHOW_TOOLTIPS, {
			name: 'AC5E.ShowTooltipsName',
			hint: 'AC5E.ShowTooltipsHint',
			scope: 'client',
			config: true,
			default: 'both',
			type: String,
			choices: {
				both: 'AC5E.ShowToolTipsChoicesBoth',
				dialog: 'AC5E.ShowToolTipsChoicesDialog',
				chat: 'AC5E.ShowToolTipsChoicesChat',
				none: 'AC5E.ShowToolTipsChoicesNone',
			},
		});
		game.settings.register(
			Constants.MODULE_ID,
			SHOW_MODULE_NAME_IN_TOOLTIPS,
			{
				name: 'AC5E.ShowModuleNameInTooltipsName',
				scope: 'client',
				config: true,
				default: true,
				type: Boolean,
			}
		);
		game.settings.register(
			Constants.MODULE_ID,
			Settings.AUTOMATE_ARMOR_PROF_STEALTH,
			{
				name: 'AC5E.AutoArmorName',
				hint: 'AC5E.AutoArmorHint',
				scope: 'world',
				config: true,
				default: false,
				type: Boolean,
			}
		);
		game.settings.register(
			Constants.MODULE_ID,
			Settings.AUTOMATE_RANGED_ATTACKS,
			{
				name: 'AC5E.AutoRangedAttacksName',
				hint: 'AC5E.AutoRangedAttacksHint',
				scope: 'world',
				config: false,
				default: false,
				type: Boolean,
			}
		);
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_EXHAUSTION, {
			name: 'AC5E.AutoExhaustionName',
			hint: 'AC5E.AutoExhaustionHint',
			scope: 'world',
			config: true,
			default: true,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_ENCUMBRANCE, {
			name: 'AC5E.AutoEncumbranceName',
			hint: 'AC5E.AutoEncumbranceHint',
			scope: 'world',
			config: true,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.TARGETING, {
			name: 'AC5E.TargetingName',
			hint: 'AC5E.TargetingHint',
			scope: 'world',
			config: true,
			default: 'source',
			type: String,
			choices: {
				source: 'AC5E.TargetingChoicesSource',
				none: 'AC5E.TargetingChoicesNone',
				force: 'AC5E.TargetingChoicesForce',
			},
		});
		game.settings.register(Constants.MODULE_ID, Settings.KEYPRESS_OVERRIDES, {
			name: 'AC5E.KeypressOverrideName',
			hint: 'AC5E.KeypressOverrideHint',
			scope: 'world',
			config: true,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.DEBUG, {
			name: 'AC5E.DebuggingName',
			hint: 'AC5E.DebuggingHint',
			scope: 'world',
			config: true,
			default: false,
			type: Boolean,
		});
	}
	get showTooltips() {
		return game.settings.get(Constants.MODULE_ID, Settings.SHOW_TOOLTIPS);
	}
	get showNameTooltips() {
		return game.settings.get(
			Constants.MODULE_ID,
			Settings.SHOW_MODULE_NAME_IN_TOOLTIPS
		);
	}
	get autoArmor() {
		return game.settings.get(
			Constants.MODULE_ID,
			Settings.AUTOMATE_ARMOR_PROF_STEALTH
		);
	}
	get autoRanged() {
		return game.settings.get(
			Constants.MODULE_ID,
			Settings.AUTOMATE_RANGED_ATTACKS
		);
	}
	get autoExhaustion() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_EXHAUSTION);
	}
	get autoEncumbrance() {
		return (
			game.settings.get('dnd5e', 'encumbrance') == 'variant' &&
			game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_ENCUMBRANCE)
		);
	}
	get needsTarget() {
		return game.settings.get(Constants.MODULE_ID, Settings.TARGETING);
	}
	get keypressOverrides() {
		return game.settings.get(Constants.MODULE_ID, Settings.KEYPRESS_OVERRIDES)
	}
	get debug() {
		return game.settings.get(Constants.MODULE_ID, Settings.DEBUG);
	}
}
