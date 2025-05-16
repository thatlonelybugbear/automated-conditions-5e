import { _renderHijack, _renderSettings, _rollFunctions, _overtimeHazards } from './ac5e-hooks.mjs';
import { _autoRanged, _autoArmor, _activeModule, _createEvaluationSandbox, _generateAC5eFlags, _getDistance, _raceOrType, _canSee } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
let daeFlags;

Hooks.once('init', ac5eRegisterOnInit);
Hooks.once('ready', ac5eReady);

/* SETUP FUNCTIONS */
function ac5eRegisterOnInit() {
	daeFlags = _generateAC5eFlags();
	Hooks.on('dae.setFieldData', (fieldData) => {
		fieldData['AC5E'] = daeFlags;
	});
	return new Settings().registerSettings();
}

function ac5eReady() {
	if (_activeModule('midi-qol')) {
		Hooks.once('midi-qol.midiReady', ac5eSetup); //added midi-qol ready hook, so that ac5e registers hooks after MidiQOL.
	} else {
		ac5eSetup();
	}
	if (_activeModule('dae')) DAE.addAutoFields(daeFlags);
}

function ac5eSetup() {
	const settings = new Settings();
	const hooksRegistered = {};
	const actionHooks = [
		//abilityChecks
		{ id: 'dnd5e.preRollAbilityCheckV2', type: 'check' },
		{ id: 'dnd5e.preRollAttackV2', type: 'attack' },
		{ id: 'dnd5e.preRollDamageV2', type: 'damage' },
		{ id: 'dnd5e.preConfigureInitiative', type: 'init' }, //@to-do, double check if it is needed (using the actor.rollInitiative() probably) //needed for Combat Carousel at least
		{ id: 'dnd5e.preRollSavingThrowV2', type: 'save' },
		{ id: 'dnd5e.preUseActivity', type: 'use' },
		{ id: 'dnd5e.activityConsumption', type: 'consumptionHook' },
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
				if (hook.id === 'dnd5e.preUseActivity' || hook.id === 'dnd5e.activityConsumption') {
					const [activity, config, dialog, message] = args;
					if (settings.debug) console.warn(hook.id, { activity, config, dialog, message });
				} else if (hook.id === 'dnd5e.preConfigureInitiative') {
					const [actor, rollConfig] = args;
					if (settings.debug) console.warn(hook.id, { actor, rollConfig });
				} else {
					const [config, dialog, message] = args;
					if (settings.debug) console.warn(hook.id, { config, dialog, message });
				}
				return _rollFunctions(hook.type, ...args);
			}
		});
		hooksRegistered[hook.id] = hookId;
	}
	const renderSettingsConfigID = Hooks.on('renderSettingsConfig', _renderSettings);
	hooksRegistered['renderSettingsConfig'] = renderSettingsConfigID;
	const combatUpdateHookID = Hooks.on('updateCombat', _overtimeHazards);
	hooksRegistered['updateCombat'] = combatUpdateHookID;

	console.warn('Automated Conditions 5e added the following (mainly) dnd5e hooks:', hooksRegistered);
	globalThis[Constants.MODULE_NAME_SHORT] = {};
	globalThis[Constants.MODULE_NAME_SHORT].info = { moduleName: Constants.MODULE_NAME, hooksRegistered };
	globalThis[Constants.MODULE_NAME_SHORT].checkArmor = _autoArmor;
	globalThis[Constants.MODULE_NAME_SHORT].checkCreatureType = _raceOrType;
	globalThis[Constants.MODULE_NAME_SHORT].checkDistance = _getDistance;
	globalThis[Constants.MODULE_NAME_SHORT].checkRanged = _autoRanged;
	globalThis[Constants.MODULE_NAME_SHORT].checkVisibility = _canSee;
	globalThis[Constants.MODULE_NAME_SHORT].conditionData = _createEvaluationSandbox;
}
