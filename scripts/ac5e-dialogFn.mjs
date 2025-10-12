import { _getRollAbilityCheck, _preRollAttack, _preRollDamage } from './ac5e-hooks.mjs';
import { _compareArrays } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings()l

export function _doDialogAttackRender(dialog, elem, getConfigAC5E) {
	const selectedAmmunition = elem.querySelector('select[name="ammunition"]')?.value;
	const selectedAttackMode = elem.querySelector('select[name="attackMode"]')?.value;
	const selectedMastery = elem.querySelector('select[name="mastery"]')?.value;
	const hasAmmunition = getConfigAC5E.options.ammo;
	const hasAttackMode = getConfigAC5E.options.attackMode;
	const hasMastery = getConfigAC5E.options.mastery;
	const change = hasAmmunition && selectedAmmunition && hasAmmunition !== selectedAmmunition ? 'ammunition' : hasAttackMode && selectedAttackMode && hasAttackMode !== selectedAttackMode ? 'attackMode' : hasMastery && selectedMastery && hasMastery !== selectedMastery ? 'mastery' : false;
	if (!change) {
		if (hasAmmunition && selectedAmmunition) dialog.config.rolls[0].options[Constants.MODULE_ID].usedPartsAmmunition ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
		if (hasAttackMode) dialog.config.rolls[0].options[Constants.MODULE_ID].usedPartsAttackMode ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
		if (hasMastery) dialog.config.rolls[0].options[Constants.MODULE_ID].usedPartsMastery ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
		return;
	}
	const newConfig = dialog.config;
	if (selectedAmmunition) newConfig.ammunition = selectedAmmunition;
	if (selectedAttackMode) newConfig.attackMode = selectedAttackMode;
	if (selectedMastery) newConfig.mastery = selectedMastery;
	if (change === 'ammunition') newConfig.rolls[0].parts = newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsAmmunition?.includes(part)) ?? [];
	if (change === 'attackMode') newConfig.rolls[0].parts = newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsAttackMode?.includes(part)) ?? [];
	if (change === 'mastery') newConfig.rolls[0].parts = newConfig.rolls[0].parts?.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.options?.[Constants.MODULE_ID]?.usedPartsMastery?.includes(part)) ?? [];
	newConfig.advantage = undefined;
	newConfig.disadvantage = undefined;
	newConfig.rolls[0].options.advantageMode = 0;
	if (newConfig.midiOptions) {
		newConfig.midiOptions.isCritical = false;
		newConfig.midiOptions.advantage = false;
		newConfig.midiOptions.disadvantage = false;
	}
	newConfig.rolls[0].options.maximum = null;
	newConfig.rolls[0].options.minimum = null;
	const newDialog = { options: { window: { title: dialog.message.flavor }, advantageMode: 0, defaultButton: 'normal' } };
	const newMessage = dialog.message;
	getConfigAC5E = _preRollAttack(newConfig, newDialog, newMessage, 'attack');
	dialog.rebuild();
	dialog.render();
}

export _function doDialogDamageRender(dialog, elem, getConfigAC5E) {
	const rollsLength = dialog.config.rolls.length;
	const selects = Array.fromRange(rollsLength)
		.map((el) => {
			const labelSpan = elem.querySelector(`select[name="roll.${el}.damageType"]`)?.value;
			if (labelSpan) return labelSpan;
			return dialog.config.rolls[el].options.type;
		})
		.filter(Boolean);
	const formulas = Array.from(elem.querySelectorAll('.formula'))
		.map((el) => el.textContent?.trim())
		.filter(Boolean);

	const changed = applyOrResetFormulaChanges(elem, getConfigAC5E);
	const effectiveFormulas = getConfigAC5E.preservedInitialData?.modified ?? formulas;

	for (let i = 0; i < rollsLength; i++) {
		if (effectiveFormulas[i]) {
			dialog.config.rolls[i].formula = effectiveFormulas[i];
			dialog.config.rolls[i].parts = effectiveFormulas[i]
				.split('+')
				.map((p) => p.trim())
				.filter(Boolean);
		}
	}

	// Compare damage types
	const damageTypesArray = getConfigAC5E.options.selectedDamageTypes;
	const compared = compareArrays(damageTypesArray, selects);
	const damageTypesChanged = !compared.equal;

	// Case 1: Only modifiers/extra dice changed
	if (!damageTypesChanged && changed) {
		dialog.rebuild();
		dialog.render();
		return;
	}

	// Case 2: Nothing changed
	if (!damageTypesChanged && !changed) {
		dialog.config.rolls[0].options[Constants.MODULE_ID].usedParts ??= dialog.config.rolls[0].options[Constants.MODULE_ID].parts;
		return;
	}

	// Case 3: Damage type changed
	const newConfig = dialog.config;
	getConfigAC5E.options.defaultDamageType = undefined;
	getConfigAC5E.options.damageTypes = undefined;
	getConfigAC5E.options.selectedDamageTypes = undefined;

	const reEval = getConfigAC5E.reEval ?? {};
	reEval.initialDamages = getConfigAC5E.reEval?.initialDamages ?? selects;
	reEval.initialRolls =
		getConfigAC5E.reEval?.initialRolls ??
		newConfig.rolls.map((roll) => ({
			parts: roll.parts,
			options: {
				maximum: roll.options.maximum,
				minimum: roll.options.minimum,
			},
		}));
	reEval.initialFormulas = getConfigAC5E.reEval?.initialFormulas ?? formulas;

	newConfig.rolls[compared.index].options.type = compared.selectedValue;
	const wasCritical = getConfigAC5E.preAC5eConfig.wasCritical;
	if (newConfig.midiOptions) newConfig.midiOptions.isCritical = wasCritical;

	for (let i = 0; i < rollsLength; i++) {
		newConfig.rolls[i].parts = reEval.initialRolls[i].parts;
		if (compared.index === i) newConfig.rolls[i].parts = newConfig.rolls[i].parts.filter((part) => !getConfigAC5E.parts.includes(part) && !dialog.config?.rolls?.[0]?.[Constants.MODULE_ID]?.usedParts?.includes(part));
		newConfig.rolls[i].options.maximum = reEval.initialRolls[i].options.maximum;
		newConfig.rolls[i].options.minimum = reEval.initialRolls[i].options.minimum;
		newConfig.rolls[i].options.isCritical = wasCritical;
	}

	const newDialog = {
		options: {
			window: { title: dialog.message.flavor },
			isCritical: wasCritical,
			defaultButton: wasCritical ? 'critical' : 'normal',
		},
	};
	const newMessage = dialog.message;

	getConfigAC5E = _preRollDamage(newConfig, newDialog, newMessage, 'damage', reEval);

	applyOrResetFormulaChanges(elem, getConfigAC5E);

	dialog.rebuild();
	dialog.render();
}

function applyOrResetFormulaChanges(elem, getConfigAC5E, mode = 'apply') {
	const formulas = Array.from(elem.querySelectorAll('.formula'))
		.map((el) => el.textContent?.trim())
		.filter(Boolean);

	const modifiers = getConfigAC5E.damageModifiers ?? [];
	const suffixModifiers = modifiers.filter((m) => m !== 'adv' && m !== 'dis');
	const suffix = suffixModifiers.join('');
	const hasAdv = modifiers.includes('adv');
	const hasDis = modifiers.includes('dis');

	const isCritical = getConfigAC5E.preAC5eConfig?.wasCritical ?? false;
	const extraDiceTotal = (getConfigAC5E.extraDice ?? []).reduce((a, b) => a + b, 0) * (isCritical ? 2 : 1);

	if (!getConfigAC5E.preservedInitialData) {
		getConfigAC5E.preservedInitialData = {
			formulas: [...formulas],
			modified: [...formulas],
			activeModifiers: '',
			activeExtraDice: 0,
			activeAdvDis: '',
		};
	}

	const { formulas: originals, activeModifiers, activeExtraDice, activeAdvDis } = getConfigAC5E.preservedInitialData;

	const diceRegex = /(\d+)d(\d+)([a-z0-9]*)?/gi;
	const suffixChanged = activeModifiers !== suffix;
	const diceChanged = activeExtraDice !== extraDiceTotal;
	const advDis = hasAdv ? 'adv' : hasDis ? 'dis' : '';
	const advDisChanged = advDis !== activeAdvDis;

	if (mode === 'apply' && !suffixChanged && !diceChanged && !advDisChanged) return false; // no changes

	if (mode === 'reset' || (!suffixModifiers.length && extraDiceTotal === 0 && !advDis)) {
		getConfigAC5E.preservedInitialData.modified = [...originals];
		getConfigAC5E.preservedInitialData.activeModifiers = '';
		getConfigAC5E.preservedInitialData.activeExtraDice = 0;
		getConfigAC5E.preservedInitialData.activeAdvDis = '';
		return true;
	}

	getConfigAC5E.preservedInitialData.modified = originals.map((formula) => {
		return formula.replace(diceRegex, (match, count, sides, existing = '') => {
			const newCount = parseInt(count, 10) + extraDiceTotal;
			if (newCount <= 0) return `0d${sides}${existing}`;

			// Dice base with suffix (applied inside the roll)
			const diceTerm = `${newCount}d${sides}${suffix}`;

			let term;
			if (advDis === 'adv') term = `{${diceTerm},${diceTerm}}kh`;
			else if (advDis === 'dis') term = `{${diceTerm},${diceTerm}}kl`;
			else term = diceTerm;

			// Preserve any existing [tag]
			return `${term}${existing}`;
		});
	});

	getConfigAC5E.preservedInitialData.activeModifiers = suffix;
	getConfigAC5E.preservedInitialData.activeExtraDice = extraDiceTotal;
	getConfigAC5E.preservedInitialData.activeAdvDis = advDis;
	return true;
}

export function _doDialogSkillOrToolRender(dialog, elem, getConfigAC5E, selectedAbility) {
	const newConfig = dialog.config;
	newConfig.ability = selectedAbility;
	newConfig.advantage = undefined;
	newConfig.disadvantage = undefined;
	newConfig.rolls[0].options.advantageMode = 0;
	newConfig.rolls[0].parts = [];
	newConfig.rolls[0].options.maximum = null;
	newConfig.rolls[0].options.minimum = null;

	const newDialog = { options: { window: { title: dialog.message.flavor }, advantageMode: 0, defaultButton: 'normal' } };
	const newMessage = dialog.message;
	const reEval = getConfigAC5E.reEval ?? {};

	getConfigAC5E = _preRollAbilityCheck(newConfig, newDialog, newMessage, 'check', reEval);
	dialog.rebuild();
	dialog.render();
}
