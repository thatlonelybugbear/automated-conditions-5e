import { _renderHijack, _rollFunctions } from './ac5e-hooks.mjs';
import { _autoRanged, _autoArmor, _activeModule, _getDistance, _raceOrType, _canSee } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

Hooks.once('init', ac5eRegisterSettings);
Hooks.once('ready', ac5eReady);

/* SETUP FUNCTIONS */
function ac5eRegisterSettings() {
	return new Settings().registerSettings();
}

function ac5eReady() {
	if (_activeModule('midi-qol')) {
		Hooks.once('midi-qol.midiReady', ac5eSetup); //added midi-qol ready hook, so that ac5e registers hooks after MidiQOL.
	} else {
		ac5eSetup();
	}
	ac5eButtonListeners();
}

function ac5eSetup() {
	const settings = new Settings();
	const hooksRegistered = {};
	const actionHooks = [
		//abilityChecks
		{ id: 'dnd5e.preRollAbilityCheckV2', type: 'check' },
		{ id: 'dnd5e.preRollAttackV2', type: 'attack' },
		{ id: 'dnd5e.preRollDamageV2', type: 'damage' },
		// { id: 'dnd5e.preRollInitiative', type: 'init' }, //@to-do, double check if it is needed (using the actor.rollInitiative() probably)
		{ id: 'dnd5e.preRollSavingThrowV2', type: 'save' },
		{ id: 'dnd5e.preUseActivity', type: 'activity' },
	];
	const renderHooks = [
		//renders
		{ id: 'dnd5e.renderChatMessage', type: 'chat' },
		//'renderAttackRollConfigurationDialog',  //@to-do, double check if it is needed
		{ id: 'renderD20RollConfigurationDialog', type: 'd20Dialog' },
		{ id: 'renderDamageRollConfigurationDialog', type: 'damageDialog' },
	];
	for (const hook of actionHooks.concat(renderHooks)) {
		const hookId = Hooks.on(hook.id, (...args) => {
			if (renderHooks.some((h) => h.id === hook.id)) {
				const [render, element] = args;
				if (settings.debug) console.warn(hook.id, { render, element });
				return _renderHijack(hook.type, ...args);
			} else {
				if (hook.id === 'dnd5e.preUseActivity') {
					const [activity, config, dialog, message] = args;
					if (settings.debug) console.warn(hook.id, { activity, config, dialog, message });
				} else {
					const [config, dialog, message] = args;
					if (settings.debug) console.warn(hook.id, { config, dialog, message });
				}
				return _rollFunctions(hook.type, ...args);
			}
		});
		hooksRegistered[hook.id] = hookId;
	}
	console.warn('Automated Conditions 5e added the following (mainly) dnd5e hooks:', hooksRegistered);
	globalThis[Constants.MODULE_NAME_SHORT] = {};
	globalThis[Constants.MODULE_NAME_SHORT].info = { moduleName: Constants.MODULE_NAME, hooksRegistered };
	globalThis[Constants.MODULE_NAME_SHORT].checkArmor = _autoArmor;
	globalThis[Constants.MODULE_NAME_SHORT].checkCreatureType = _raceOrType;
	globalThis[Constants.MODULE_NAME_SHORT].checkDistance = _getDistance;
	globalThis[Constants.MODULE_NAME_SHORT].checkRanged = _autoRanged;
	globalThis[Constants.MODULE_NAME_SHORT].checkVisibility = _canSee;	
}

function ac5eButtonListeners() {
	const settings = new Settings();
	Hooks.on('renderSettingsConfig', (app, html, data) => {
		const settings = [
			{ key: 'buttonColorBackground', default: game?.user?.color?.css },
			{ key: 'buttonColorBorder', default: 'white' },
			{ key: 'buttonColorText', default: 'white' },
		];

		for (let { key, default: defaultValue } of settings) {
			const settingKey = `${Constants.MODULE_ID}.${key}`;
			const input = html.find(`[name="${settingKey}"]`);
			if (input.length) {
				const colorPicker = $(`<input type="color" class="color-picker">`);
				colorPicker.val(getValidColor(input.val(), defaultValue));
				colorPicker.on('input', function () {
					const color = $(this).val();
					input.val(color).trigger('change');
				});
				input.on('input', function () {
					const userColor = $(this).val().trim();
					const validColor = getValidColor(userColor, defaultValue);
					if (validColor) colorPicker.val(validColor);
				});
				// Reset to default when input is cleared
				input.on('blur', function () {
					if ($(this).val().trim() === '') {
						$(this).val(defaultValue).trigger('change');
						colorPicker.val(getValidColor(defaultValue, defaultValue));
					}
				});
				input.after(colorPicker);
			}
		}
	});
}

function getValidColor(color, fallback) {
    const temp = document.createElement("div");
    temp.style.color = color;
    document.body.appendChild(temp);
    const computedColor = window.getComputedStyle(temp).color;
    document.body.removeChild(temp);
    const match = computedColor.match(/\d+/g);
    if (match && match.length === 3) {
        return `#${match.map((n) => parseInt(n).toString(16).padStart(2, "0")).join("")}`;
    }
    return fallback; // If invalid, return the default color
}
