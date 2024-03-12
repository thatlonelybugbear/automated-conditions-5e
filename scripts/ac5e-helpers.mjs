/**
 * Gets the minimum distance between two tokens,
 * evaluating all grid spaces they occupy, by Zhell.
 */
export function _getMinimumDistanceBetweenTokens(tokenA, tokenB) {
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

export function _getConditionName(name) {
	return (
		eval(`game.i18n.translations.EFFECT.DND5E.Status${name}`) ??
		eval(`game.i18n.translations.DND5E.Con${name}`)
	);
}

export function _hasEffectsActive(actor, effectNames) {
	if (!actor) return false;
	if (typeof effectNames === 'string') effectNames = [effectNames];
	return effectNames.filter((n) =>
		actor.effects.some(
			(eff) => !eff.disabled && [_getConditionName(n), n].includes(eff.name)
		)
	);
}

export function _hasStatuses(actor, statuses /*, checked = undefined*/) {
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
				.map((el) => _getConditionName(el.capitalize()))
				.concat(
					`${_getConditionName('Exhaustion')} ${_getExhaustionLevel(actor)}`
				)
				.sort();
	}
	return [...actor.statuses]
		.filter((s) => statuses.includes(s))
		.map((el) => _getConditionName(el.capitalize()))
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
