import Constants from './ac5e-constants.mjs';

export default class Settings {
	// KEYS FOR WORLD CONFIG SETTINGS
	static SHOW_TOOLTIPS = 'showTooltips';
	static SHOW_MODULE_NAME_IN_TOOLTIPS = 'shownNameTooltip';
	static AUTOMATE_EXPANDED_CONDITIONS = 'expandedConditions';
	static AUTOMATE_ARMOR_PROF_STEALTH = 'autoArmor';
	static AUTOMATE_ARMOR_PROF_SPELL_USE = 'autoArmorSpellUse';
	static AUTOMATE_RANGED_ATTACKS_MENU = 'autoRangedAttacksMenu';
	static AUTOMATE_RANGED_ATTACKS = 'autoRangedAttacks';
	static AUTOMATE_RANGED_ATTACKS_NEARBYFOE = 'autoRangedNearbyFoe';
	static AUTOMATE_EXHAUSTION = 'autoExhaustion';
	static AUTOMATE_ENCUMBRANCE = 'autoEncumbrance';
	static TARGETING = 'targeting';
	static KEYPRESS_OVERRIDES = 'keypressOverrides';
	static DEBUG = 'debugging';
	static MIGRATION = 'lastMigratedPoint';
	static ColorPicker_Background = 'buttonColorBackground';
	static ColorPicker_Border = 'buttonColorBorder';
	static ColorPicker_Text = 'buttonColorText';

	registerSettings() {
		this._registerWorldSettings();
	}

	_registerWorldSettings() {
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
		game.settings.register(Constants.MODULE_ID, Settings.SHOW_MODULE_NAME_IN_TOOLTIPS, {
			name: 'AC5E.ShowModuleNameInTooltipsName',
			scope: 'client',
			config: true,
			default: true,
			type: Boolean,
		});

		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_EXPANDED_CONDITIONS, {
			name: 'AC5E.ExpandedConditionsName',
			hint: 'AC5E.ExpandedConditionsHint',
			scope: 'world',
			config: true,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_ARMOR_PROF_STEALTH, {
			name: 'AC5E.AutoArmorName',
			hint: 'AC5E.AutoArmorHint',
			scope: 'world',
			config: true,
			default: false,
			type: Boolean,
		}); //
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_ARMOR_PROF_SPELL_USE, {
			name: 'AC5E.AutoArmorSpellUseName',
			hint: 'AC5E.AutoArmorSpellUseHint',
			scope: 'world',
			config: true,
			default: 'off',
			type: String,
			choices: {
				off: 'AC5E.AutoArmorSpellUseChoicesOff',
				enforce: 'AC5E.AutoArmorSpellUseChoicesEnforce',
				warn: 'AC5E.AutoArmorSpellUseChoicesWarn',
			},
		});
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_RANGED_ATTACKS_MENU, {
			name: 'AC5E.AutoRangedAttacksName',
			hint: 'AC5E.AutoRangedAttacksHint',
			scope: 'world',
			config: true,
			default: 'off',
			type: String,
			choices: {
				off: 'AC5E.AutoRangedAttacksChoicesOff',
				ranged: 'AC5E.AutoRangedAttacksChoicesRangeOnly',
				nearby: 'AC5E.AutoRangedAttacksChoicesNearbyFoes',
			},
		});
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_RANGED_ATTACKS, {
			name: 'AC5E.AutoRangedAttacksName',
			hint: 'AC5E.AutoRangedAttacksHint',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_RANGED_ATTACKS_NEARBYFOE, {
			name: 'AC5E.AutoRangedNearbyFoeName',
			hint: 'AC5E.AutoRangedNearbyFoeHint',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
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
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.ColorPicker_Background, {
			name: 'AC5E.ButtonColorPicker.Background.Name',
			hint: 'AC5E.ButtonColorPicker.Background.Hint',
			scope: 'client',
			config: true,
			default: game?.user?.color?.css,
			type: String
		});
		game.settings.register(Constants.MODULE_ID, Settings.ColorPicker_Border, {
			name: 'AC5E.ButtonColorPicker.Border.Name',
			hint: 'AC5E.ButtonColorPicker.Border.Hint',
			scope: 'client',
			config: true,
			default: 'white',
			type: String
		});
		game.settings.register(Constants.MODULE_ID, Settings.ColorPicker_Text, {
			name: 'AC5E.ButtonColorPicker.Text.Name',
			hint: 'AC5E.ButtonColorPicker.Text.Hint',
			scope: 'client',
			config: true,
			default: 'white',
			type: String
		});
		game.settings.register(Constants.MODULE_ID, Settings.DEBUG, {
			name: 'DEBUG',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.MIGRATION, {
			name: 'Migration',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
	}
	get dnd5eModernRules() {
		return game.settings.get('dnd5e', 'rulesVersion') === 'modern';
	}
	get dnd5eEncumbranceRules() {
		return game.settings.get('dnd5e', 'encumbrance');
	}
	get showTooltips() {
		return game.settings.get(Constants.MODULE_ID, Settings.SHOW_TOOLTIPS);
	}
	get showNameTooltips() {
		return game.settings.get(Constants.MODULE_ID, Settings.SHOW_MODULE_NAME_IN_TOOLTIPS);
	}
	get expandedConditions() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_EXPANDED_CONDITIONS);
	}
	get autoArmor() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_ARMOR_PROF_STEALTH);
	}
	get autoArmorSpellUse() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_ARMOR_PROF_SPELL_USE);
	}
	get autoRanged() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_RANGED_ATTACKS);
	}
	get autoRangedNearbyFoe() {
		if (this.autoRanged) return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_RANGED_ATTACKS_NEARBYFOE);
		else return false;
	}
	get autoRangedCombined() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_RANGED_ATTACKS_MENU);
	}
	get autoExhaustion() {
		if (!this.dnd5eModernRules) return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_EXHAUSTION);
		else return false;
	}
	get autoEncumbrance() {
		return game.settings.get('dnd5e', 'encumbrance') == 'variant' && game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_ENCUMBRANCE);
	}
	get needsTarget() {
		return game.settings.get(Constants.MODULE_ID, Settings.TARGETING);
	}
	get keypressOverrides() {
		return game.settings.get(Constants.MODULE_ID, Settings.KEYPRESS_OVERRIDES);
	}
	get buttonColorBackground() {
		return game.settings.get(Constants.MODULE_ID, Settings.ColorPicker_Background);
	}
	get buttonColorBorder() {
		return game.settings.get(Constants.MODULE_ID, Settings.ColorPicker_Border);
	}
	get buttonColorText() {
		return game.settings.get(Constants.MODULE_ID, Settings.ColorPicker_Text);
	}
	get debug() {
		return game.settings.get(Constants.MODULE_ID, Settings.DEBUG);
	}
	get migrated() {
		return game.settings.get(Constants.MODULE_ID, Settings.MIGRATION);
	}
}
