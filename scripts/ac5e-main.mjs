import {
	_preRollConcentration,
	_preRollAbilitySave,
	_preRollSkill,
	_preRollAbilityTest,
	_preRollAttack,
	_preRollDamage,
	_preRollDeathSave,
	_preUseItem,
	_renderDialog,
	/*_rollAttack*/
} from './ac5e-hooks.mjs';
import Settings from './ac5e-settings.mjs';

Hooks.once('init', () => {
	new Settings().registerSettings();
	const preRollConcentration = Hooks.on('dnd5e.preRollConcentration', _preRollConcentration);
	const preRollAbilitySave = Hooks.on('dnd5e.preRollAbilitySave',	_preRollAbilitySave);
	const preRollAbilityTest = Hooks.on('dnd5e.preRollAbilityTest',	_preRollAbilityTest);
	const preRollAttack = Hooks.on('dnd5e.preRollAttack', _preRollAttack);
	//const rollAttack = Hooks.on('dnd5e.rollAttack', _rollAttack);
	const preRollDamage = Hooks.on('dnd5e.preRollDamage', _preRollDamage);
	const preRollDeathSave = Hooks.on('dnd5e.preRollDeathSave',	_preRollDeathSave);
	const preRollSkill = Hooks.on('dnd5e.preRollSkill', _preRollSkill);
	const preUseItem = Hooks.on('dnd5e.preUseItem', _preUseItem);
	const renderDialog = Hooks.on('renderDialog', _renderDialog);
	console.warn(  //to-do: add rollAttack: ${rollAttack} when/if it is enabled
		`Bugbear's Automated Conditions for 5e added the following dnd5e hooks:
  		preRollConcentration: ${preRollConcentration}
		preRollAbilitySave: ${preRollAbilitySave}
		preRollAbilityTest: ${preRollAbilityTest}
		preRollAttack: ${preRollAttack}
		preRollDamage: ${preRollDamage}
		preRollDeathSave: ${preRollDeathSave}
		preRollSkill: ${preRollSkill}
  		preUseItem: ${preUseItem}
		renderDialog: ${renderDialog}`
	);
});
