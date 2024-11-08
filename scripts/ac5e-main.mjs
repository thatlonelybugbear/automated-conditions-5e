import {
	_preRollConcentration,
	_preRollAbilitySave,
	_preRollSkill,
	_preRollAbilityTest,
	_preRollAttack,
	_preRollDamage,
	_preRollAttackV2,
	_preRollDamageV2,
	_preRollDeathSave,
	_preUseItem,
	_preUseActivity,
	_renderHijack,
} from './ac5e-hooks.mjs';
import { _systemCheck } from './ac5e-helpers.mjs';
import Settings from './ac5e-settings.mjs';

export let rulesVersion;

Hooks.once('init', ac5eRegisterSettings);
Hooks.once('ready', ac5eReady);

/* SETUP FUNCTIONS */
function ac5eRegisterSettings() {
	if (_systemCheck(4)) rulesVersion = game.settings.get('dnd5e', 'rulesVersion') === 'modern' ? false : true;
	return new Settings().registerSettings();
};

function ac5eReady() {
	if (game.modules.get('midi-qol')?.active) {    
		Hooks.once('midi-qol.midiReady', ac5eSetup);  //added midi-qol ready hook, so that ac5e registers hooks after MidiQOL.
	} else {
		ac5eSetup();
	}
};

function ac5eSetup() {
	const v4 = _systemCheck(4);
	//const v4_1 = _systemCheck(4.1);
	const preRollConcentration = _systemCheck('3.0.4')
		? Hooks.on('dnd5e.preRollConcentration', _preRollConcentration)
		: 'This will only be added for users with dnd5e 3.1+';
	const preRollAbilitySave = Hooks.on('dnd5e.preRollAbilitySave',	_preRollAbilitySave);
	const preRollAbilityTest = Hooks.on('dnd5e.preRollAbilityTest',	_preRollAbilityTest);
	let preRollAttack, preRollDamage, preUseItem;
	if (v4) {
		preRollAttack = Hooks.on('dnd5e.preRollAttackV2', _preRollAttack);
		preRollDamage = Hooks.on('dnd5e.preRollDamageV2', _preRollDamage);
		preUseItem = Hooks.on('dnd5e.preUseActivity', _preUseItem);
	} else {
		preRollAttack =  Hooks.on('dnd5e.preRollAttack', _preRollAttack);
		preRollDamage = Hooks.on('dnd5e.preRollDamage', _preRollDamage);
		preUseItem = Hooks.on('dnd5e.preUseItem', _preUseItem);
	}
	const preRollDeathSave = Hooks.on('dnd5e.preRollDeathSave', _preRollDeathSave);
	const preRollSkill = Hooks.on('dnd5e.preRollSkill', _preRollSkill);
	const renderDialog = Hooks.on('renderDialog', _renderHijack);
	const renderChatMessage = Hooks.on('dnd5e.renderChatMessage', _renderHijack);
	//to-do: add rollAttack: ${rollAttack} when/if it is enabled
	console.warn("Bugbear's Automated Conditions for 5e added the following (mainly) dnd5e hooks:", {
		preRollConcentration,
		preRollAbilitySave,
		preRollAbilityTest,
		[v4 ? 'preRollAttackV2' : 'preRollAttack']: preRollAttack,
		[v4 ? 'preRollDamageV2' : 'preRollDamage']: preRollDamage,
		[v4 ? 'preUseActivity' : 'preUseItem']: preUseItem,
		preRollDeathSave,
		preRollSkill,
		renderDialog,
		renderChatMessage,
	});
}
