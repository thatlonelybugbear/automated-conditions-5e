import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

/**
 * Gets the minimum distance between two tokens,
 * evaluating all grid spaces they occupy, by Zhell.
 */
export function _getDistance(tokenA, tokenB) {
	const A = _getAllTokenGridSpaces(tokenA.document);
	const B = _getAllTokenGridSpaces(tokenB.document);
	const rays = A.flatMap((a) => {
		return B.map((b) => {
			return { ray: new Ray(a, b) };
		});
	});
	const dist = canvas.scene.grid.distance; // 5ft.
	const distances = canvas.grid
		.measureDistances(rays, {
			gridSpaces: true,
		})
		.map((d) => Math.round(d / dist) * dist);
	const eles = [tokenA, tokenB].map((t) => t.document.elevation);
	const elevationDiff = Math.abs(eles[0] - eles[1]);
	return Math.max(Math.min(...distances), elevationDiff);
}

/**
 * Get the upper left corners of all grid spaces a token document occupies.
 */
export function _getAllTokenGridSpaces(tokenDoc) {
	const { width, height, x, y } = tokenDoc;
	if (width <= 1 && height <= 1) return [{ x, y }];
	const centers = [];
	const grid = canvas.grid.size;
	for (let a = 0; a < width; a++) {
		for (let b = 0; b < height; b++) {
			centers.push({
				x: x + a * grid,
				y: y + b * grid,
			});
		}
	}
	return centers;
}

export function _i18nConditions(name) {
	return (
		eval(`game.i18n.translations.EFFECT.DND5E.Status${name}`) ??
		eval(`game.i18n.translations.DND5E.Con${name}`)
	);
}

export function _i18n5e(string) {
	return game.i18n.translations.DND5E[string];
}

export function _hasStatuses(actor, statuses) {
	if (!actor) return false;
	if (typeof statuses === 'string') statuses = [statuses];
	const endsWithNumber = (str) => /\d+$/.test(str);
	const exhaustionNumberedStatus = statuses.find((s) => endsWithNumber(s));
	if (exhaustionNumberedStatus) {
		statuses = statuses.filter((s) => !endsWithNumber(s));
		if (
			_getExhaustionLevel(
				actor,
				exhaustionNumberedStatus.split('exhaustion')[1]
			)
		)
			return [...actor.statuses]
				.filter((s) => statuses.includes(s))
				.map((el) => _i18nConditions(el.capitalize()))
				.concat(
					`${_i18nConditions('Exhaustion')} ${_getExhaustionLevel(actor)}`
				)
				.sort();
	}
	return [...actor.statuses]
		.filter((s) => statuses.includes(s))
		.map((el) => _i18nConditions(el.capitalize()))
		.sort();
}

export function _hasAppliedEffects(actor) {
	return !!actor?.appliedEffects.length;
}

export function _getExhaustionLevel(actor, min = undefined, max = undefined) {
	if (!actor) return false;
	let exhaustionLevel = '';
	const hasExhaustion =
		actor.statuses.has('exhaustion') ||
		actor.flags?.['automated-conditions-5e']?.statuses;
	if (hasExhaustion) exhaustionLevel = actor.system.attributes.exhaustion;
	return min ? min <= exhaustionLevel : exhaustionLevel;
}

export function _calcAdvantageMode(ac5eConfig, config) {
	if (
		ac5eConfig.advantage.source?.length ||
		ac5eConfig.advantage.target?.length
	)
		config.advantage = true;
	if (
		ac5eConfig.disadvantage.source?.length ||
		ac5eConfig.disadvantage.target?.length
	)
		config.disadvantage = true;
	if (ac5eConfig.advantage.length) config.advantage = true;
	if (ac5eConfig.disadvantage.length) config.disadvantage = true;
	if (config.advantage === true && config.disadvantage === true) {
		config.advantage = false;
		config.disadvantage = false;
	}
}

//check for 'same' 'different' or 'all' (=false) dispositions
//t1, t2 Token5e or Token5e#Document
export function _dispositionCheck(t1, t2, check = false) {
	if (!t1 || !t2) return false;
	t1 = t1 instanceof Object ? t1.document : t1;
	t2 = t2 instanceof Object ? t2.document : t2;
	if (check == 'different') return t1.disposition !== t2.disposition;
	if (check == 'same') return t1.disposition === t2.disposition;
	if (!check || check == 'all') return true;
	//to-do: 1. what about secret? 2. might need more granular checks in the future.
}

export function _findNearby(
	token, //Token5e or Token5e#Document to find nearby around.
	disposition = 'all', //'all', 'same', 'differemt'
	radius = 5, //default radius 5
	lengthTest = false, //false or integer which will test the length of the array against that number and return true/false.
	includeToken = true //includes or exclude source token
) {
	if (!canvas || !canvas.tokens?.placeables) return false;
	const validTokens = canvas.tokens.placeables.filter(
		(placeable) =>
			_dispositionCheck(token, placeable, disposition) &&
			_getDistance(token, placeable) <= radius
	);
	if (lengthTest && includeToken) return validTokens.length >= lengthTest;
	if (lengthTest && !includeToken) return validTokens.length > lengthTest;
	if (includeToken) return validTokens;
	return validTokens.filter((placeable) => placeable !== token);
}

export function _autoArmor(actor, test = 'both') {
	//'both','prof','stealth' : test for actor being proficient on the piece of armor and if it has stealth disadvantage property. returns rollAdvantageMode
	if (!actor) return undefined;
	const hasArmor = actor.armor;
	if (!hasArmor) return null;
	const stealth = hasArmor.system.properties.has('stealthDisadvantage');
	const prof = hasArmor.system.proficient ?? hasArmor.system.prof.multiplier;
	if (test === 'both')
		return { stealthDisadvantage: !!stealth, proficient: !!prof };
	if (test === 'prof') return !!prof;
	if (test === 'stealth') return !!stealth;
}

export function _autoEncumbrance(actor, abilityId) {
	if (
		game.settings.get('dnd5e', 'encumbrance') !== 'variant' ||
		!settings.autoEncumbrance
	)
		return null;
	return (
		['con', 'dex', 'str'].includes(abilityId) &&
		_hasStatuses(actor, 'heavilyEncumbered').length
	);
}

export function _autoRanged(item, token, target) {
	if (!item || !token) return undefined;
	let {
		actionType,
		range: { value: short, long },
	} = item.system;
	const flags = token.actor?.flags?.[Constants.MODULE_ID];
	const sharpShooter =
		flags?.sharpShooter || _hasItem(item.actor, 'sharpshooter');
	if (sharpShooter && long && actionType == 'rwak') short = long;
	const crossbowExpert =
		flags?.crossbowExpert || _hasItem(item.actor, 'crossbow expert');
	const distance = _getDistance(token, target);
	const nearbyFoe =
		actionType.includes('r') &&
		_findNearby(token, 'different', 5, 1) &&
		!crossbowExpert;
	const inRange =
		distance <= short ? 'short' : distance <= long ? 'long' : false;
	return { inRange: !!inRange, range: inRange, distance, nearbyFoe };
}

export function _hasItem(actor, itemName) {
	return actor?.items.some((item) =>
		item.name.toLocaleLowerCase().includes(itemName)
	);
}
