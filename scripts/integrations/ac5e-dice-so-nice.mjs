import Constants from '../ac5e-constants.mjs';

// TO-DO: revisit when the system allows for generic maximize/minimize roll options
export function prepareDiceSoNiceDamageRoll(_messageId, context) {
	const source = context?.dsnRoll ?? context?.roll;
	if (!source?.dice?.some((die) => die.options?.[Constants.MODULE_ID]?.extremeModifier)) return;
	const display = source.constructor.fromData(foundry.utils.deepClone(source.toJSON()));
	display.ghost = source.ghost;
	display.secret = source.secret;
	let changed = false;
	for (const die of display.dice ?? []) {
		const modifier = die.options?.[Constants.MODULE_ID]?.extremeModifier;
		if (modifier !== `min${die.faces}` && modifier !== 'max1') continue;
		const value = modifier === 'max1' ? 1 : die.faces;
		for (const result of die.results ?? []) {
			if (result.active === false || result.discarded || result.hidden || result.count !== value) continue;
			result.result = value;
			result.rerolled = false;
			changed = true;
		}
	}
	if (changed) context.dsnRoll = display;
}
