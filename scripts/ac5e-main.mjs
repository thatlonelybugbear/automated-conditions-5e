import { _renderHijack, _renderSettings, _rollFunctions, _overtimeHazards } from './ac5e-hooks.mjs';
import { _autoRanged, _autoArmor, _activeModule, _createEvaluationSandbox, checkNearby, _generateAC5eFlags, _getDistance, _getItemOrActivity, _raceOrType, _canSee } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
export let scopeUser;
let daeFlags;

Hooks.once('init', ac5eRegisterOnInit);
Hooks.once('i18nInit', ac5ei18nInit);
Hooks.once('ready', ac5eReady);

/* SETUP FUNCTIONS */
function ac5eRegisterOnInit() {
	daeFlags = _generateAC5eFlags();
	Hooks.on('dae.setFieldData', (fieldData) => {
		fieldData['AC5E'] = daeFlags;
	});
	scopeUser = game.version > 13 ? 'user' : 'client';
	return new Settings().registerSettings();
}

function ac5ei18nInit() {
	const settings = new Settings();
	if (settings.removeNon5eStatuses) {
		const basic = Object.values(CONFIG.DND5E.conditionTypes).filter(e=>!e.pseudo).map(e=>e.name.toLowerCase()).concat(['burning', 'suffocation']);
		CONFIG.statusEffects.forEach((effect) => {
			if (!basic.includes(effect.id)) effect.hud = false;
		});
	}
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
		// { id: 'dnd5e.activityConsumption', type: 'consumptionHook' }, //@to-do: validate that there isn't an actual need for this
		{ id: 'dnd5e.preConfigureInitiative', type: 'init' }, //needed for Combat Carousel at least, when using the actor.rollInitiative()
		{ id: 'dnd5e.preRollAbilityCheck', type: 'check' },
		{ id: 'dnd5e.preRollAttack', type: 'attack' },
		{ id: 'dnd5e.preRollDamage', type: 'damage' },
		{ id: 'dnd5e.preRollSavingThrow', type: 'save' },
		{ id: 'dnd5e.preUseActivity', type: 'use' },
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
	globalThis[Constants.MODULE_NAME_SHORT].checkNearby = checkNearby;
	globalThis[Constants.MODULE_NAME_SHORT].checkRanged = _autoRanged;
	globalThis[Constants.MODULE_NAME_SHORT].checkVisibility = _canSee;
	globalThis[Constants.MODULE_NAME_SHORT].evaluationData = _createEvaluationSandbox;
	globalThis[Constants.MODULE_NAME_SHORT].getItemOrActivity = _getItemOrActivity;
	globalThis[Constants.MODULE_NAME_SHORT].logEvaluationData = false;
	Object.defineProperty(globalThis[Constants.MODULE_NAME_SHORT], '_target', {
		get() {
			return game?.user?.targets?.first();
		},
		configurable: true
	});
}
