import Constants from './ac5e-constants.mjs';
import { scopeUser } from './ac5e-main.mjs';
import { _getValidColor } from './ac5e-helpers.mjs';

export default class Settings {
	// KEYS FOR WORLD CONFIG SETTINGS
	static SHOW_TOOLTIPS = 'showTooltips';
	static SHOW_MODULE_NAME_IN_TOOLTIPS = 'showNameTooltips';
	static SHOW_CHAT_TOOLTIPS = 'showChatTooltips';
	static AUTOMATE_EXPANDED_CONDITIONS = 'expandedConditions';
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
	static ColorPicker_Enabled = 'buttonColorEnabled';
	static ColorPicker_Background = 'buttonColorBackground';
	static ColorPicker_Border = 'buttonColorBorder';
	static ColorPicker_Text = 'buttonColorText';
	static AUTOMATE_ENVIRONMENTAL_HAZARDS = 'autoHazards';
	static AUTOMATE_HEAVY = 'automateHeavy';
	static AUTOMATE_STATUSES = 'automateStatuses';
	static REMOVE_NON5E_STATUSES = 'displayOnly5eStatuses';

	registerSettings() {
		this._registerWorldSettings();
	}

	_registerWorldSettings() {
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_STATUSES, {
			name: 'AC5E.AutomateStatuses.Name',
			hint: 'AC5E.AutomateStatuses.Hint',
			scope: 'world',
			config: true,
			default: true,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.SHOW_TOOLTIPS, {
			name: 'AC5E.ShowTooltipsName',
			hint: 'AC5E.ShowTooltipsHint',
			scope: scopeUser,
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
			scope: scopeUser,
			config: true,
			default: true,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.SHOW_CHAT_TOOLTIPS, {
			name: 'AC5E.ShowTooltipChatVisibility.Name',
			hint: 'AC5E.ShowTooltipChatVisibility.Hint',
			scope: 'world',
			config: true,
			default: 'all',
			type: String,
			choices: {
				all: 'AC5E.ShowTooltipChatVisibility.All',
				none: 'AC5E.ShowTooltipChatVisibility.None',
				owned: 'AC5E.ShowTooltipChatVisibility.Owned',
				players: 'AC5E.ShowTooltipChatVisibility.Players',
			},
		});
		game.settings.register(Constants.MODULE_ID, Settings.ColorPicker_Enabled, {
			name: 'AC5E.ButtonColorPicker.Enabled.Name',
			hint: 'AC5E.ButtonColorPicker.Enabled.Hint',
			scope: scopeUser,
			config: true,
			default: true,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.ColorPicker_Background, {
			name: 'AC5E.ButtonColorPicker.Background.Name',
			hint: 'AC5E.ButtonColorPicker.Background.Hint',
			scope: scopeUser,
			config: true,
			default: '#288bcc',
			type: String,
		});
		game.settings.register(Constants.MODULE_ID, Settings.ColorPicker_Border, {
			name: 'AC5E.ButtonColorPicker.Border.Name',
			hint: 'AC5E.ButtonColorPicker.Border.Hint',
			scope: scopeUser,
			config: true,
			default: 'white',
			type: String,
		});
		game.settings.register(Constants.MODULE_ID, Settings.ColorPicker_Text, {
			name: 'AC5E.ButtonColorPicker.Text.Name',
			hint: 'AC5E.ButtonColorPicker.Text.Hint',
			scope: scopeUser,
			config: true,
			default: 'white',
			type: String,
		});
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_EXPANDED_CONDITIONS, {
			name: 'AC5E.ExpandedConditionsName',
			hint: 'AC5E.ExpandedConditionsHint',
			scope: 'world',
			config: true,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_ENVIRONMENTAL_HAZARDS, {
			name: 'AC5E.EnvironmentalHazards.SettingsName',
			hint: 'AC5E.EnvironmentalHazards.SettingsHint',
			scope: 'world',
			config: true,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_ARMOR_PROF_SPELL_USE, {
			name: 'AC5E.ActivityUse.Name',
			hint: 'AC5E.ActivityUse.Hint',
			scope: 'world',
			config: true,
			default: 'off',
			type: String,
			choices: {
				off: 'AC5E.ActivityUse.Choices.Off',
				enforce: 'AC5E.ActivityUse.Choices.Enforce',
				warn: 'AC5E.ActivityUse.Choices.Warn',
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
			config: !this.dnd5eModernRules,
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
			name: 'AC5E.Targeting.Name',
			hint: 'AC5E.Targeting.Hint',
			scope: 'world',
			config: true,
			default: 'source',
			type: String,
			choices: {
				source: 'AC5E.Targeting.Choices.Source',
				force: 'AC5E.Targeting.Choices.Enforce',
				warn: 'AC5E.Targeting.Choices.Warn',
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
		game.settings.register(Constants.MODULE_ID, Settings.AUTOMATE_HEAVY, {
			name: 'Heavy property',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
		game.settings.register(Constants.MODULE_ID, Settings.REMOVE_NON5E_STATUSES, {
			name: 'Remove non 5e statuses',
			scope: 'world',
			config: false,
			default: false,
			type: Boolean,
		});
	}
	get automateStatuses() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_STATUSES);
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
	get showChatTooltips() {
		if (['both', 'chat'].includes(this.showTooltips)) return game.settings.get(Constants.MODULE_ID, Settings.SHOW_CHAT_TOOLTIPS);
		else return 'none';
	}
	get expandedConditions() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_EXPANDED_CONDITIONS);
	}
	get autoHazards() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_ENVIRONMENTAL_HAZARDS);
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
	get buttonColorEnabled() {
		return game.settings.get(Constants.MODULE_ID, Settings.ColorPicker_Enabled);
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
	get automateHeavy() {
		return game.settings.get(Constants.MODULE_ID, Settings.AUTOMATE_HEAVY);
	}
	get displayOnly5eStatuses() {
		return game.settings.get(Constants.MODULE_ID, Settings.REMOVE_NON5E_STATUSES);
	}
}

function renderColoredButtonSettings(html) {
	const colorSettings = [
		{ key: 'buttonColorBackground', default: '#288bcc' },
		{ key: 'buttonColorBorder', default: '#f8f8ff' }, //using 'white' would trigger a console warning for not conforming to the required format, until you click out of the field.
		{ key: 'buttonColorText', default: '#f8f8ff' }, //this is Ghost White
	];
	for (let { key, default: defaultValue } of colorSettings) {
		const settingKey = `${Constants.MODULE_ID}.${key}`;
		const input = html.querySelector(`[name="${settingKey}"]`);
		if (!input) continue;

		const colorPicker = document.createElement('input');
		colorPicker.type = 'color';
		colorPicker.classList.add('color-picker');

		const updateColorPicker = () => {
			const val = input.value.trim().toLowerCase();
			const resolved = _getValidColor(val, defaultValue, game.user);
			if (['false', 'none', 'null', '0'].includes(resolved)) {
				colorPicker.style.display = 'none';
			} else {
				if (resolved !== val) {
					input.value = resolved;
					input.dispatchEvent(new Event('change'));
				}
				colorPicker.value = resolved;
				colorPicker.style.display = '';
			}
		};

		colorPicker.addEventListener('input', () => {
			input.value = colorPicker.value;
			input.dispatchEvent(new Event('change'));
		});

		input.addEventListener('input', () => {
			const val = input.value.trim().toLowerCase();
			const resolved = _getValidColor(val, defaultValue, game.user);

			if (['false', 'none', 'null', '0'].includes(resolved)) {
				colorPicker.style.display = 'none';
			} else {
				colorPicker.value = resolved;
				colorPicker.style.display = '';
			}
		});

		input.addEventListener('blur', () => {
			const raw = input.value.trim().toLowerCase();
			const resolved = _getValidColor(raw, defaultValue, game.user);

			if (['false', 'none', 'null', '0'].includes(resolved)) {
				colorPicker.style.display = 'none';

				input.value = resolved; // Normalize input display here
				game.settings.set(Constants.MODULE_ID, key, resolved);
			} else {
				input.value = resolved;
				colorPicker.value = resolved;
				colorPicker.style.display = '';
				game.settings.set(Constants.MODULE_ID, key, resolved);
			}
		});

		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') input.blur(); // triggers blur logic
		});

		input.insertAdjacentElement('afterend', colorPicker);
		updateColorPicker();
	}

	// Visibility toggle
	const toggle = html.querySelector(`[name="${Constants.MODULE_ID}.buttonColorEnabled"]`);
	if (toggle) {
		const updateVisibility = () => {
			const visible = toggle.checked;
			const keysToToggle = ['buttonColorBackground', 'buttonColorBorder', 'buttonColorText'];
			for (let key of keysToToggle) {
				const input = html.querySelector(`[name="${Constants.MODULE_ID}.${key}"]`);
				if (input) {
					const container = input.closest('.form-group') || input.parentElement;
					if (container) container.style.display = visible ? 'flex' : 'none';
				}
			}
		};
		toggle.addEventListener('change', updateVisibility);
		updateVisibility();
	}
}

function renderChatTooltipsSettings(html) {
	const tooltipSelect = html.querySelector(`[name="${Constants.MODULE_ID}.showTooltips"]`);
	const chatTooltipSelect = html.querySelector(`select[name="${Constants.MODULE_ID}.showChatTooltips"]`);
	const showNameTooltip = html.querySelector(`[name="${Constants.MODULE_ID}.showNameTooltips"]`);

	if (!tooltipSelect || !chatTooltipSelect || !showNameTooltip) return;

	function updateChatTooltipVisibility() {
		const val = tooltipSelect.value;
		const shouldShowChatTooltip = val === 'both' || val === 'chat';
		const shouldShowTooltip = val !== 'none';
		const containerChat = chatTooltipSelect.closest('.form-group') || chatTooltipSelect.parentElement;
		if (containerChat) containerChat.style.display = shouldShowChatTooltip ? 'flex' : 'none';
		const containerName = showNameTooltip.closest('.form-group') || showNameTooltip.parentElement;
		if (containerName) containerName.style.display = shouldShowTooltip ? 'flex' : 'none';
	}

	tooltipSelect.addEventListener('change', updateChatTooltipVisibility);
	updateChatTooltipVisibility();
}
