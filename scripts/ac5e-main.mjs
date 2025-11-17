import { _autoRanged, _autoArmor, _activeModule, _createEvaluationSandbox, checkNearby, _generateAC5eFlags, _getDistance, _getItemOrActivity, _raceOrType, _canSee } from './ac5e-helpers.mjs';
import { _renderHijack, _renderSettings, _rollFunctions, _overtimeHazards } from './ac5e-hooks.mjs';
import { _migrate } from './ac5e-migrations.mjs';
import { _gmDocumentUpdates, _gmEffectDeletions } from './ac5e-queries.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
export let scopeUser, lazySandbox, ac5eQueue;
let daeFlags;

Hooks.once('init', ac5eRegisterOnInit);
Hooks.once('i18nInit', ac5ei18nInit);
Hooks.once('ready', ac5eReady);

/* SETUP FUNCTIONS */
function ac5eRegisterOnInit() {
	registerQueries();
	daeFlags = _generateAC5eFlags();
	Hooks.on('dae.setFieldData', (fieldData) => {
		fieldData['AC5E'] = daeFlags;
	});
	scopeUser = game.version > 13 ? 'user' : 'client';
	return new Settings().registerSettings();
}

function ac5ei18nInit() {
	const settings = new Settings();
	if (settings.displayOnly5eStatuses) {
		const basic = Object.values(CONFIG.DND5E.conditionTypes)
			.filter((e) => !e.pseudo)
			.map((e) => e.name.toLowerCase())
			.concat(['burning', 'suffocation']);
		CONFIG.statusEffects.forEach((effect) => {
			if (!basic.includes(effect.id)) effect.hud = false;
		});
	}
}

function ac5eReady() {
	ac5eQueue = new foundry.utils.Semaphore();
	if (_activeModule('midi-qol')) {
		Hooks.once('midi-qol.midiReady', ac5eSetup); //added midi-qol ready hook, so that ac5e registers hooks after MidiQOL.
	} else {
		ac5eSetup();
	}
	if (_activeModule('dae')) DAE.addAutoFields(daeFlags);
	_migrate();
}

function ac5eSetup() {
	const settings = new Settings();
	initializeSandbox();
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
	const foundryHooks = [
		{ id: 'preCreateItem', type: 'preCreateItem' },
	]
	const renderHooks = [
		//renders
		{ id: 'dnd5e.renderChatMessage', type: 'chat' },
		//'renderAttackRollConfigurationDialog',  //@to-do, double check if it is needed
		{ id: 'renderD20RollConfigurationDialog', type: 'd20Dialog' },
		{ id: 'renderDamageRollConfigurationDialog', type: 'damageDialog' },
	];
	for (const hook of actionHooks.concat(renderHooks).concat(foundryHooks)) {
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
				} else if (hook.id === 'preCreateItem') {
					const [item, updates] = args;
					if (settings.debug) console.warn(hook.id, { item, updates });
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
	globalThis[Constants.MODULE_NAME_SHORT].info = { moduleName: Constants.MODULE_NAME, hooksRegistered, version: game.modules.get(Constants.MODULE_ID).version };
	globalThis[Constants.MODULE_NAME_SHORT].checkArmor = _autoArmor;
	globalThis[Constants.MODULE_NAME_SHORT].checkCreatureType = _raceOrType;
	globalThis[Constants.MODULE_NAME_SHORT].checkDistance = _getDistance;
	globalThis[Constants.MODULE_NAME_SHORT].checkNearby = checkNearby;
	globalThis[Constants.MODULE_NAME_SHORT].checkRanged = _autoRanged;
	globalThis[Constants.MODULE_NAME_SHORT].checkVisibility = _canSee;
	globalThis[Constants.MODULE_NAME_SHORT].evaluationData = _createEvaluationSandbox;
	globalThis[Constants.MODULE_NAME_SHORT].getItemOrActivity = _getItemOrActivity;
	globalThis[Constants.MODULE_NAME_SHORT].logEvaluationData = false;
	globalThis[Constants.MODULE_NAME_SHORT].debugEvaluations = false;
	Object.defineProperty(globalThis[Constants.MODULE_NAME_SHORT], '_target', {
		get() {
			return game?.user?.targets?.first();
		},
		configurable: true,
	});
}

function initializeSandbox() {
	const { DND5E } = CONFIG;

	const safeConstants = foundry.utils.deepFreeze({
		abilities: Object.fromEntries(Object.keys(DND5E.abilities).map((k) => [k, false])),
		abilityConsumptionTypes: Object.fromEntries(Object.keys(DND5E.abilityConsumptionTypes).map((k) => [k, false])),
		activityActivationTypes: Object.fromEntries(Object.keys(DND5E.activityActivationTypes).map((k) => [k, false])),
		activityConsumptionTypes: Object.fromEntries(Object.keys(DND5E.activityConsumptionTypes).map((k) => [k, false])),
		activityTypes: Object.fromEntries(Object.keys(DND5E.activityTypes).map((k) => [k, false])),
		actorSizes: Object.fromEntries(Object.keys(DND5E.actorSizes).map((k) => [k, false])),
		alignments: Object.fromEntries(Object.keys(DND5E.alignments).map((k) => [k, false])),
		ammoIds: Object.fromEntries(Object.keys(DND5E.ammoIds).map((k) => [k, false])),
		areaTargetTypes: Object.fromEntries(Object.keys(DND5E.areaTargetTypes).map((k) => [k, false])),
		armorIds: Object.fromEntries(Object.keys(DND5E.armorIds).map((k) => [k, false])),
		armorProficiencies: Object.fromEntries(Object.keys(DND5E.armorProficiencies).map((k) => [k, false])),
		armorTypes: Object.fromEntries(Object.keys(DND5E.armorTypes).map((k) => [k, false])),
		attackClassifications: Object.fromEntries(Object.keys(DND5E.attackClassifications).map((k) => [k, false])),
		attackModes: Object.fromEntries(Object.keys(DND5E.attackModes).map((k) => [k, false])),
		attackTypes: Object.fromEntries(Object.keys(DND5E.attackTypes).map((k) => [k, false])),
		conditionTypes: Object.fromEntries(
			Object.keys(DND5E.conditionTypes)
				.concat('bloodied')
				.map((k) => [k, false])
		),
		creatureTypes: Object.fromEntries(Object.keys(DND5E.creatureTypes).map((k) => [k, false])),
		damageTypes: Object.fromEntries(Object.keys(DND5E.damageTypes).map((k) => [k, false])),
		healingTypes: Object.fromEntries(Object.keys(DND5E.healingTypes).map((k) => [k, false])),
		itemActionTypes: Object.fromEntries(Object.keys(DND5E.itemActionTypes).map((k) => [k, false])),
		itemProperties: Object.fromEntries(Object.keys(DND5E.itemProperties).map((k) => [k, false])),
		skills: Object.fromEntries(Object.keys(DND5E.skills).map((k) => [k, false])),
		toolIds: Object.fromEntries(Object.keys(DND5E.toolIds).map((k) => [k, false])),
		toolProficiencies: Object.fromEntries(Object.keys(DND5E.toolProficiencies).map((k) => [k, false])),
		tools: Object.fromEntries(Object.keys(DND5E.tools).map((k) => [k, false])),
		spellSchools: Object.fromEntries(Object.keys(DND5E.spellSchools).map((k) => [k, false])),
		statusEffects: Object.fromEntries(Object.keys(DND5E.statusEffects).map((k) => [k, false])),
		weaponMasteries: Object.fromEntries(Object.keys(DND5E.weaponMasteries).map((k) => [k, false])),
		weaponIds: Object.fromEntries(Object.keys(DND5E.weaponIds).map((k) => [k, false])),
	});

	const flatConstants = Object.assign({}, ...Object.values(safeConstants).filter((v) => typeof v === 'object'));
	foundry.utils.deepFreeze(flatConstants);
	const safeHelpers = Object.freeze({
		checkNearby,
		checkVisibility: _canSee,
		checkDistance: _getDistance,
		checkCreatureType: _raceOrType,
		getItemOrActivity: _getItemOrActivity,
		checkArmor: _autoArmor,
		checkRanged: _autoRanged,
	});

	lazySandbox = foundry.utils.deepFreeze({
		CONSTANTS: safeConstants,
		_flatConstants: flatConstants,
		...safeHelpers,
		Math,
		Number,
		String,
		Boolean,
		Array,
		Object,
		JSON,
		Date,
	});

	console.log('AC5E Base sandbox initialized', lazySandbox);
}

function registerQueries() {
	CONFIG.queries[Constants.MODULE_ID] = {};
	CONFIG.queries[Constants.GM_DOCUMENT_UPDATES] = _gmDocumentUpdates;
	CONFIG.queries[Constants.GM_EFFECT_DELETIONS] = _gmEffectDeletions;
}
