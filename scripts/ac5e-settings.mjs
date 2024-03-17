import Constants from './ac5e-constants.mjs';

export default class Settings {
	// KEYS FOR WORLD CONFIG SETTINGS
	static SHOW_TOOLTIPS_ROLL_DIALOG = 'showDialogTooltips';
	static AUTOMATE_ARMOR_PROF_STEALTH = 'autoArmor';
	static AUTOMATE_RANGED_ATTACKS = 'autoRangedAttacks';
	static AUTOMATE_EXHAUSTION = 'autoExhaustion'; //to-do: add module solution for dndone exhaustion.
	static AUTOMATE_ENCUMBRANCE = 'autoEncumbrance';

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

		game.settings.register(
			Constants.MODULE_ID,
			Settings.SHOW_TOOLTIPS_ROLL_DIALOG,
			{
				name: 'AC5E.ShowDialogTooltipsName',
				hint: 'AC5E.ShowDialogTooltipsHint',
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
				config: true,
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
			default: true,
			type: Boolean,
		});
	}
	get dialogTooltips() {
		return game.settings.get(
			Constants.MODULE_ID,
			Settings.SHOW_TOOLTIPS_ROLL_DIALOG
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
}
