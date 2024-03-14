import Constants from './ac5e-constants.mjs';

export default class Settings {
	// KEYS FOR WORLD CONFIG SETTINGS
	static SHOW_TOOLTIPS_ROLL_DIALOG = 'showDialogTooltips';
	static AUTOMATE_ARMOR_PROF_STEALTH = 'autoArmor';
	static AUTOMATE_RANGED_ATTACKS = 'autoRangedAttacks';
	static AUTOMATE_EXHAUSTION = 'autoExhaustion';    //to-do: add module solution for dndone exhaustion.
	
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
				name: 'AC5e tooltips on Roll Dialogs.',
				hint: 'When checked, AC5e will show a helpful tooltip when hovering over the suggested Roll button, summing up the reasons for that suggestion.',
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
				name: 'AC5e armor automation.',
				hint: 'When checked, AC5e will automatically process proficiency in the equipped piece of armor for ability, skills and save rolls (STR || DEX) and stealth disadvantage property.',
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
				name: 'AC5e ranged attacks automation.',
				hint: 'When checked, AC5e will automatically process distance disadvantage/fail based on target distance and range values of item used to attack.',
				scope: 'world',
				config: true,
				default: false,
				type: Boolean,
			}
		);
		game.settings.register(
			Constants.MODULE_ID,
			Settings.AUTOMATE_EXHAUSTION,
			{
				name: 'AC5e exhaustion automation.',
				hint: 'When checked, AC5e will automatically process the normal 5e Exhaustion condition rules. Disable if you don`t want compatibility with other exhaustion modules or your own rules (dnd-1 rules will be added in a future update).',
				scope: 'world',
				config: true,
				default: true,
				type: Boolean,
			}
		);
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
		return game.settings.get(
			Constants.MODULE_ID,
			Settings.AUTOMATE_EXHAUSTION
		);
	}
}
