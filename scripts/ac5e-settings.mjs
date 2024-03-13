import Constants from './ac5e-constants.mjs';

export default class Settings {
	// KEYS FOR WORLD CONFIG SETTINGS
	static SHOW_TOOLTIPS_ROLL_DIALOG = 'showDialogTooltips';

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
				name: 'Show AC5e tooltips on Roll Dialogs.',
				hint: 'When checked, AC5e will show a helpful tooltip when hovering over the suggested Roll button, summing up the reasons for that suggestion.',
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
}
