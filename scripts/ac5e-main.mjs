import { _autoArmor, _activeModule, _buildFlagRegistry, _generateAC5eFlags, _getDistance, _getItems, _getItemOrActivity, _hasItem, _reindexFlagRegistryActor } from './ac5e-helpers.mjs';
import { _createEvaluationSandbox, _raceOrType } from './ac5e-runtimeLogic.mjs';
import { _renderHijack, _renderSettings, _rollFunctions } from './ac5e-hooks.mjs';
import { _migrate } from './ac5e-migrations.mjs';
import { _gmCombatCadenceUpdate, _gmContextKeywordsUpdate, _gmDocumentUpdates, _gmEffectDeletions, _gmUsageRulesUpdate } from './ac5e-queries.mjs';
import { _initStatusEffectsTables, _syncCombatCadenceFlags } from './ac5e-setpieces.mjs';
import { autoRanged, canSee, checkNearby, overtimeHazards } from './ac5e-systemRules.mjs';
import {
	configureAc5eApiRuntime,
	createAc5eGlobalSpace,
	loadPersistentContextKeywords,
	loadPersistentUsageRules,
	onContextKeywordsRegistrySettingUpdate,
	onUsageRulesRegistrySettingUpdate,
} from './ac5e-api.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

export let scopeUser, lazySandbox, ac5eQueue, statusEffectsTables;
export { createTroubleshooterSnapshot, exportTroubleshooterSnapshot, importTroubleshooterSnapshot, lintAc5eFlags } from './ac5e-api.mjs';

let daeFlags;
const AC5E_LOCAL_BUILD_ID = 'local-delete-race-2026-02-19a';

Hooks.once('init', ac5eRegisterOnInit);
Hooks.once('i18nInit', ac5ei18nInit);
Hooks.once('ready', ac5eReady);

function ac5eRegisterOnInit() {
	registerQueries();
	daeFlags = _generateAC5eFlags();
	Hooks.on('dae.setFieldData', (fieldData) => {
		fieldData.AC5E = daeFlags;
	});
	scopeUser = game.version > 13 ? 'user' : 'client';
	patchApplyDamage();
	return new Settings().registerSettings();
}

function patchApplyDamage() {
	const proto = CONFIG.Actor?.documentClass?.prototype;

	function getMessageIdFromUI() {
		return (
			globalThis.event?.currentTarget?.closest?.('[data-message-id]')?.dataset?.messageId ??
			globalThis.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId ??
			document.activeElement?.closest?.('[data-message-id]')?.dataset?.messageId ??
			null
		);
	}

	function wrapper(wrapped, damages, options = {}, ...rest) {
		if (!options?.messageId) {
			const mid = getMessageIdFromUI();
			if (mid) options = { ...options, messageId: mid };
		}
		return wrapped(damages, options, ...rest);
	}

	if (globalThis.libWrapper) {
		try {
			libWrapper.register(Constants.MODULE_ID, 'CONFIG.Actor.documentClass.prototype.applyDamage', wrapper, 'WRAPPER');
			console.log(`${Constants.MODULE_NAME} | Wrapped Actor.applyDamage via libWrapper`);
			return;
		} catch (err) {
			console.warn(`${Constants.MODULE_NAME} | libWrapper failed, falling back to monkeypatch`, err);
		}
	}

	const original = proto.applyDamage;
	proto.applyDamage = function (damages, options = {}, ...rest) {
		if (!options?.messageId) {
			const mid = getMessageIdFromUI();
			if (mid) options = { ...options, messageId: mid };
		}
		return original.call(this, damages, options, ...rest);
	};
	proto.applyDamage.__ac5e_original__ = original;
	return console.log(`${Constants.MODULE_NAME} | Monkeypatched Actor.applyDamage (no libWrapper)`);
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
	const settings = new Settings();
	const moduleVersion = game.modules?.get(Constants.MODULE_ID)?.version ?? 'unknown';
	const systemVersion = game.system?.version ?? 'unknown';
	const foundryVersion = game.version ?? game.release?.version ?? 'unknown';
	const devModeEnabled = settings.devModeEnabled;
	const readyStamp = Date.now();
	const readyStateId = `${AC5E_LOCAL_BUILD_ID}:${readyStamp}`;
	console.warn(`AC5E LOADED | v${moduleVersion} | dnd5e ${systemVersion} | foundry ${foundryVersion}`);
	if (devModeEnabled) {
		console.warn('AC5E READY DEV STATE', {
			buildId: AC5E_LOCAL_BUILD_ID,
			readyStateId,
			moduleVersion,
			systemVersion,
			foundryVersion,
			userId: game.user?.id ?? null,
			isGM: Boolean(game.user?.isGM),
			isActiveGM: Boolean(game.user?.isActiveGM),
		});
	}
	if (_activeModule('midi-qol')) Hooks.once('midi-qol.midiReady', ac5eSetup);
	else ac5eSetup();
	if (_activeModule('dae')) DAE.addAutoFields(daeFlags);
	_migrate();
}

function ac5eSetup() {
	const settings = new Settings();
	initializeSandbox();
	configureAc5eApiRuntime({
		getLazySandbox: () => lazySandbox,
		getStatusEffectsTables: () => statusEffectsTables,
		buildId: AC5E_LOCAL_BUILD_ID,
	});
	loadPersistentContextKeywords();
	loadPersistentUsageRules();
	statusEffectsTables = _initStatusEffectsTables();
	const hooksRegistered = registerHooks(settings);
	createAc5eGlobalSpace({ hooksRegistered, buildId: AC5E_LOCAL_BUILD_ID });
}

function registerHooks(settings) {
	const hooksRegistered = {};
	const actionHooks = [
		{ id: 'dnd5e.preConfigureInitiative', type: 'init' },
		{ id: 'dnd5e.preRollAbilityCheck', type: 'check' },
		{ id: 'dnd5e.preRollAttack', type: 'attack' },
		{ id: 'dnd5e.preRollDamage', type: 'damage' },
		{ id: 'dnd5e.preRollSavingThrow', type: 'save' },
		{ id: 'dnd5e.preUseActivity', type: 'use' },
		{ id: 'dnd5e.postUseActivity', type: 'postUse' },
	];
	const buildHooks = [
		{ id: 'dnd5e.buildRollConfig', type: 'buildRoll' },
		{ id: 'dnd5e.postBuildRollConfig', type: 'postBuildRoll' },
		{ id: 'dnd5e.postRollConfiguration', type: 'postRollConfig' },
	];
	const foundryHooks = [{ id: 'preCreateItem', type: 'preCreateItem' }];
	const renderHooks = [
		{ id: 'renderChatMessageHTML', type: 'chat' },
		{ id: 'renderD20RollConfigurationDialog', type: 'd20Dialog' },
		{ id: 'renderDamageRollConfigurationDialog', type: 'damageDialog' },
	];

	for (const hook of actionHooks.concat(renderHooks).concat(foundryHooks).concat(buildHooks)) {
		const hookId = Hooks.on(hook.id, (...args) => {
			if (renderHooks.some((candidate) => candidate.id === hook.id)) {
				const [render, element] = args;
				if (settings.debug) console.warn(hook.id, { render, element });
				return _renderHijack(hook.type, ...args);
			}
			if (hook.id === 'dnd5e.preUseActivity') {
				const [activity, config, dialog, message] = args;
				if (settings.debug) console.warn(hook.id, { activity, config, dialog, message });
			} else if (hook.id === 'dnd5e.postUseActivity') {
				const [activity, usageConfig, results] = args;
				if (settings.debug) console.warn(hook.id, { activity, usageConfig, results });
			} else if (hook.id === 'dnd5e.preConfigureInitiative') {
				const [actor, rollConfig] = args;
				if (settings.debug) console.warn(hook.id, { actor, rollConfig });
			} else if (hook.id === 'dnd5e.postRollConfiguration') {
				const [rolls, config, dialog, message] = args;
				if (settings.debug) console.warn(hook.id, { rolls, config, dialog, message });
			} else if (hook.id.startsWith('dnd5e.build')) {
				const [app, config, formData, index] = args;
				if (settings.debug) console.warn(hook.id, { app, config, formData, index });
			} else if (hook.id === 'preCreateItem') {
				const [item, updates] = args;
				if (settings.debug) console.warn(hook.id, { item, updates });
			} else {
				const [config, dialog, message] = args;
				if (settings.debug) console.warn(hook.id, { config, dialog, message });
			}
			return _rollFunctions(hook.type, ...args);
		});
		hooksRegistered[hook.id] = hookId;
	}

	hooksRegistered.renderSettingsConfig = Hooks.on('renderSettingsConfig', _renderSettings);
	hooksRegistered['updateCombat.cadence'] = Hooks.on('updateCombat', _syncCombatCadenceFlags);
	hooksRegistered['updateCombat.hazards'] = Hooks.on('updateCombat', overtimeHazards);
	hooksRegistered['updateSetting.contextKeywords'] = Hooks.on('updateSetting', onContextKeywordsRegistrySettingUpdate);
	hooksRegistered['updateSetting.usageRules'] = Hooks.on('updateSetting', onUsageRulesRegistrySettingUpdate);
	for (const hookName of ['createActor', 'updateActor', 'deleteActor', 'createItem', 'updateItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) {
		hooksRegistered[hookName] = Hooks.on(hookName, (document) => _reindexFlagRegistryActor(document));
	}
	_buildFlagRegistry();
	console.warn('Automated Conditions 5e added the following (mainly) dnd5e hooks:', hooksRegistered);
	return hooksRegistered;
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
				.map((k) => [k, false]),
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
		checkVisibility: canSee,
		checkDistance: _getDistance,
		checkCreatureType: _raceOrType,
		getItemOrActivity: _getItemOrActivity,
		getItems: _getItems,
		checkArmor: _autoArmor,
		checkRanged: autoRanged,
		hasItem: _hasItem,
	});
	lazySandbox = foundry.utils.deepFreeze({
		CONSTANTS: safeConstants,
		_evalConstants: flatConstants,
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
	CONFIG.queries[Constants.GM_COMBAT_CADENCE_UPDATE] = _gmCombatCadenceUpdate;
	CONFIG.queries[Constants.GM_CONTEXT_KEYWORDS_UPDATE] = _gmContextKeywordsUpdate;
	CONFIG.queries[Constants.GM_USAGE_RULES_UPDATE] = _gmUsageRulesUpdate;
}
