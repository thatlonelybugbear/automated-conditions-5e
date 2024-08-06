import {
	_preRollConcentration,
	_preRollAbilitySave,
	_preRollSkill,
	_preRollAbilityTest,
	_preRollAttack,
	_preRollDamage,
	_preRollDeathSave,
	_preUseItem,
	_renderHijack,
} from './ac5e-hooks.mjs';
import { _systemCheck } from './ac5e-helpers.mjs';
import Settings from './ac5e-settings.mjs';
import { migrate } from './ac5e-migrations.mjs';

Hooks.once('init', () => {
	new Settings().registerSettings();
	const preRollConcentration = _systemCheck('3.0.4')
		? Hooks.on('dnd5e.preRollConcentration', _preRollConcentration)
		: 'This will only be added for users with dnd5e 3.1+';
	const preRollAbilitySave = Hooks.on(
		'dnd5e.preRollAbilitySave',
		_preRollAbilitySave
	);
	const preRollAbilityTest = Hooks.on(
		'dnd5e.preRollAbilityTest',
		_preRollAbilityTest
	);
	const preRollAttack = Hooks.on('dnd5e.preRollAttack', _preRollAttack);
	const preRollDamage = Hooks.on('dnd5e.preRollDamage', _preRollDamage);
	const preRollDeathSave = Hooks.on(
		'dnd5e.preRollDeathSave',
		_preRollDeathSave
	);
	const preRollSkill = Hooks.on('dnd5e.preRollSkill', _preRollSkill);
	const preUseItem = Hooks.on('dnd5e.preUseItem', _preUseItem);
	const renderDialog = Hooks.on('renderDialog', _renderHijack);
	const renderChatMessage = Hooks.on('dnd5e.renderChatMessage', _renderHijack);
	//to-do: add rollAttack: ${rollAttack} when/if it is enabled
	console.warn(
		`Bugbear's Automated Conditions for 5e added the following (mainly) dnd5e hooks:
  		preRollConcentration: ${preRollConcentration}
		preRollAbilitySave: ${preRollAbilitySave}
		preRollAbilityTest: ${preRollAbilityTest}
		preRollAttack: ${preRollAttack}
		preRollDamage: ${preRollDamage}
		preRollDeathSave: ${preRollDeathSave}
		preRollSkill: ${preRollSkill}
  		preUseItem: ${preUseItem}
		renderDialog: ${renderDialog}
		renderChatMessage: ${renderChatMessage}`
	);
});

Hooks.once('ready', migrate);
