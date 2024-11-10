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
	const v4_1 = _systemCheck(4.1);
	
	const preRollConcentration = v4_1 
		? Hooks.on('dnd5e.preRollConcentrationV2', _preRollConcentration)
		: _systemCheck('3.0.4')
			? Hooks.on('dnd5e.preRollConcentration', _preRollConcentration)
			: 'This will only be added for users with dnd5e 3.1+';
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
	let preRollAbilitySave, preRollAbilityTest, preRollDeathSave, preRollInitiativeDialog, preRollSkill, preRollToolCheckV2;
	if (v4_1) {
		preRollAbilitySave = Hooks.on('dnd5e.preRollAbilitySaveV2', _preRollAbilitySave);
		preRollAbilityTest = Hooks.on('dnd5e.preRollAbilityTestV2', _preRollAbilityTest);
		preRollDeathSave = Hooks.on('dnd5e.preRollDeathSaveV2', _preRollDeathSave);
		preRollInitiativeDialog = Hooks.on('dnd5e.preRollInitiativeDialog', _preRollInitiativeDialog);
		preRollSkill = Hooks.on('dnd5e.preRollSkillV2', _preRollSkill);
		preRollToolCheckV2 = Hooks.on('preRollToolCheckV2', _preRollToolCheckV2);
	} else {
		preRollAbilitySave = Hooks.on('dnd5e.preRollAbilitySave', _preRollAbilitySave);
		preRollAbilityTest = Hooks.on('dnd5e.preRollAbilityTest', _preRollAbilityTest);
		preRollDeathSave = Hooks.on('dnd5e.preRollDeathSave', _preRollDeathSave);
		preRollInitiativeDialog = 'This will only be added for users with dnd5e 4.1+';
		preRollSkill = Hooks.on('dnd5e.preRollSkill', _preRollSkill);
		preRollToolCheck = 'This will only be added for users with dnd5e 4.1+';
	}
	const renderDialog = Hooks.on('renderDialog', _renderHijack);
	const renderChatMessage = Hooks.on('dnd5e.renderChatMessage', _renderHijack);
	//to-do: add rollAttack: ${rollAttack} when/if it is enabled
	console.warn("Automated Conditions 5e added the following (mainly) dnd5e hooks:", {
		preRollConcentration,
		preRollInitiativeDialog,
		[v4 ? 'preRollAttackV2' : 'preRollAttack']: preRollAttack,
		[v4 ? 'preRollDamageV2' : 'preRollDamage']: preRollDamage,
		[v4 ? 'preUseActivity' : 'preUseItem']: preUseItem,
		[v4_1 ? 'preRollAbilitySaveV2' : 'preRollAbilitySave']: preRollAbilitySave,
		[v4_1 ? 'preRollAbilityTestV2' : 'preRollAbilityTest']: preRollAbilityTest,
		[v4_1 ? 'preRollDeathSaveV2' : 'preRollDeathSave']: preRollDeathSave,
		[v4_1 ? 'preRollSkillV2' : 'preRollSkill']: preRollSkill,
		[v4_1 ? 'preRollToolCheckV2' : 'preRollToolCheck']: preRollToolCheck,
		preRollToolCheckV2,
		renderDialog,
		renderChatMessage
	});
}
