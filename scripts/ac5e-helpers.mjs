import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
import { _ac5eChecks } from './ac5e-setpieces.mjs';

const settings = new Settings();

/**
 * Foundry v12 updated.
 * Gets the minimum distance between two tokens,
 * evaluating all grid spaces they occupy, based in Illandril's work
 * updated by thatlonelybugbear for 3D and tailored to AC5e needs!.
 */
export function _getDistance(tokenA, tokenB, includeUnits = false, overrideMidi = false) {
	if (_activeModule('midi-qol') && !overrideMidi) {
		const result = MidiQOL.computeDistance(tokenA, tokenB);
		if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - Defer to MidiQOL.computeDistance():`, { sourceId: tokenA?.id, targetId: tokenB?.id, result, units: canvas.scene.grid.units });
		if (includeUnits) return result + (includeUnits ? canvas.scene.grid.units : '');
		if (result === -1) return undefined;
		return result;
	}
	if (typeof tokenA === 'string' && !tokenA.includes('.')) tokenA = canvas.tokens.get(tokenA);
	else if (typeof tokenA === 'string' && tokenA.includes('.')) tokenA = fromUuidSync(tokenA)?.object;
	if (typeof tokenB === 'string' && !tokenB.includes('.')) tokenB = canvas.tokens.get(tokenB);
	else if (typeof tokenB === 'string' && tokenB.includes('.')) tokenB = fromUuidSync(tokenB)?.object;
	if (!tokenA || !tokenB) return undefined;
	const PointsAndCenter = {
		points: [],
		trueCenternt: {},
	};

	const getPolygon = (grid /*: foundry.grid.BaseGrid*/, token /*: Token*/) => {
		let poly; // PIXI.Polygon;
		if (token.shape instanceof PIXI.Circle) {
			poly = token.shape.toPolygon({ density: (token.shape.radius * 8) / grid.size });
		} else if (token.shape instanceof PIXI.Rectangle) {
			poly = token.shape.toPolygon();
		} else {
			poly = token.shape;
		}

		return new PIXI.Polygon(poly.points.map((point, i) => point + (i % 2 ? token.bounds.top : token.bounds.left)));
	};

	const getPointsAndCenter = (grid, shape) => {
		const points = [];
		for (let i = 0; i < shape.points.length; i += 2) {
			const x = shape.points[i];
			const y = shape.points[i + 1];
			points.push({ x, y });

			const nextX = shape.points[i + 2] ?? shape.points[0];
			const nextY = shape.points[i + 3] ?? shape.points[1];
			const d = Math.sqrt((x - nextX) ** 2 + (y - nextY) ** 2);
			const steps = Math.ceil((d * 2) / grid.size);

			for (let step = 1; step < steps; step++) {
				points.push({ x: ((nextX - x) / steps) * step + x, y: ((nextY - y) / steps) * step + y });
			}
		}

		return {
			points: points,
			trueCenter: shape.getBounds().center,
		};
	};

	const getPoints = (grid /*: foundry.grid.BaseGrid*/, poly /*: PIXI.Polygon*/) => {
		const bounds = poly.getBounds();
		const pointsToMeasure = [bounds.center];

		// If either dimension is one grid space long or less, just use the center point for measurements
		// Otherwise, we use the center of the grid spaces along the token's perimeter
		const forcedX = bounds.width <= grid.sizeX ? bounds.center.x : null;
		const forcedY = bounds.height <= grid.sizeY ? bounds.center.x : null;

		if (typeof forcedX !== 'number' || typeof forcedY !== 'number') {
			const { points, trueCenter } = getPointsAndCenter(grid, poly);
			for (const point of points) {
				const x = (point.x - trueCenter.x) * 0.99 + trueCenter.x;
				const y = (point.y - trueCenter.y) * 0.99 + trueCenter.y;
				const pointToMeasure = grid.getCenterPoint({ x, y });
				pointToMeasure.x = forcedX ?? pointToMeasure.x;
				pointToMeasure.y = forcedY ?? pointToMeasure.y;
				if (!pointsToMeasure.some((priorPoint) => priorPoint.x === pointToMeasure.x && priorPoint.y === pointToMeasure.y)) {
					pointsToMeasure.push(pointToMeasure);
				}
			}
		}
		return pointsToMeasure;
	};

	const squareDistance = (pointA /*: Point*/, pointB /*: Point*/) => (pointA.x - pointB.x) ** 2 + (pointA.y - pointB.y) ** 2;

	const getComparisonPoints = (grid /*: foundry.grid.BaseGrid*/, token /*: Token*/, other /*: Token*/) => {
		const polyA = getPolygon(grid, token);
		const polyB = getPolygon(grid, other);

		const pointsA = getPoints(grid, polyA);
		const pointsB = getPoints(grid, polyB);
		const containedPoint = pointsA.find((point) => polyB.contains(point.x, point.y)) ?? pointsB.find((point) => polyA.contains(point.x, point.y));
		if (containedPoint) {
			// A contains B or B contains A... so ensure the distance is 0
			return [containedPoint, containedPoint];
		}

		let closestPointA = token.center;
		let closestPointB = other.center;
		let closestD2 = squareDistance(closestPointA, closestPointB);
		for (const pointA of pointsA) {
			for (const pointB of pointsB) {
				const d2 = squareDistance(pointA, pointB);
				if (d2 < closestD2) {
					closestD2 = d2;
					closestPointA = pointA;
					closestPointB = pointB;
				}
			}
		}
		return [closestPointA, closestPointB];
	};
	const calculateDistanceWithUnits = (scene, grid, token, other) => {
		let totalDistance = 0;
		let { distance, diagonals, spaces } = grid.measurePath(getComparisonPoints(grid, token, other));

		if (canvas.grid.isSquare) {
			token.z0 = token.document.elevation / grid.distance;
			token.z1 = token.z0 + Math.min(token.document.width | 0, token.document.height | 0);
			other.z0 = other.document.elevation / grid.distance;
			other.z1 = other.z0 + Math.min(other.document.width | 0, other.document.height | 0);

			let dz = other.z0 >= token.z1 ? other.z0 - token.z1 + 1 : token.z0 >= other.z1 ? token.z0 - other.z1 + 1 : 0;

			if (!dz) {
				totalDistance = distance;
			} else {
				const XY = { diagonals, illegal: spaces };
				const Z = { illegal: dz, diagonals: Math.min(XY.illegal, dz) };
				Z.diagonalsXYZ = Math.min(XY.diagonals, Z.diagonals);
				Z.diagonalsXZ_YZ = Z.diagonals - Z.diagonalsXYZ;
				XY.moves = spaces - (XY.diagonals + Z.diagonalsXZ_YZ);
				Z.moves = dz - Z.diagonals;
				const overallDiagonals = Math.max(XY.diagonals, Z.diagonals);

				switch (grid.diagonals) {
					case CONST.GRID_DIAGONALS.EQUIDISTANT:
						totalDistance = XY.moves + Z.moves + overallDiagonals;
						break;

					case CONST.GRID_DIAGONALS.ALTERNATING_1:
						for (let i = 1; i <= overallDiagonals; i++) {
							totalDistance += i & 1 ? 1 : 2; // Odd/even check with bitwise
						}
						totalDistance += XY.moves + Z.moves;
						break;

					case CONST.GRID_DIAGONALS.ALTERNATING_2:
						for (let i = 1; i <= overallDiagonals; i++) {
							totalDistance += i & 1 ? 2 : 1; // Alternate between 2 and 1
						}
						totalDistance += XY.moves + Z.moves;
						break;

					case CONST.GRID_DIAGONALS.ILLEGAL:
						totalDistance = XY.illegal + Z.illegal;
						break;

					case CONST.GRID_DIAGONALS.EXACT:
						totalDistance = XY.moves + Z.moves + (overallDiagonals - Z.diagonalsXYZ) * Math.sqrt(2) + Z.diagonalsXYZ * Math.sqrt(3);
						break;

					case CONST.GRID_DIAGONALS.APPROXIMATE:
						totalDistance = XY.moves + Z.moves + overallDiagonals * 1.5;
						break;

					case CONST.GRID_DIAGONALS.RECTILINEAR:
						totalDistance = XY.moves + Z.moves + overallDiagonals * 2;
						break;

					default:
						throw new Error(`Unknown diagonal rule: ${grid.diagonals}`);
				}

				totalDistance *= grid.distance;
			}
		} else {
			token.z0 = token.document.elevation;
			token.z1 = token.z0 + Math.min(token.document.width * grid.distance, token.document.height * grid.distance);
			other.z0 = other.document.elevation;
			other.z1 = other.z0 + Math.min(other.document.width * grid.distance, other.document.height * grid.distance);
			let dz = other.z0 > token.z1 ? other.z0 - token.z1 + grid.distance : token.z0 > other.z1 ? token.z0 - other.z1 + grid.distance : 0;
			totalDistance = dz ? Math.sqrt(distance * distance + dz * dz) : distance;
		}

		return {
			value: totalDistance,
			units: scene.grid.units,
		};
	};
	const { value: result, units } = calculateDistanceWithUnits(canvas.scene, canvas.grid, tokenA, tokenB) || {};
	if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - getDistance():`, { sourceId: tokenA.id, opponentId: tokenB.id, result, units });
	if (includeUnits) return ((result * 100) | 0) / 100 + units;
	return ((result * 100) | 0) / 100;
}

export function _i18nConditions(name) {
	const str = `EFFECT.DND5E.Status${name}`;
	if (game.i18n.has(str)) return game.i18n.localize(str);
	return game.i18n.localize(`DND5E.Con${name}`);
}

export function _localize(string) {
	return game.i18n.translations.DND5E[string] ?? game.i18n.localize(string);
}

export function _hasStatuses(actor, statuses, quick = false) {
	if (!actor) return [];
	if (typeof statuses === 'string') statuses = [statuses];
	if (quick) return statuses.some((status) => actor.statuses.has(status));
	const endsWithNumber = (str) => /\d+$/.test(str);
	const exhaustionNumberedStatus = statuses.find((s) => endsWithNumber(s));
	if (exhaustionNumberedStatus) {
		statuses = statuses.filter((s) => !endsWithNumber(s));
		if (_getExhaustionLevel(actor, exhaustionNumberedStatus.split('exhaustion')[1]))
			return [...actor.statuses]
				.filter((s) => statuses.includes(s))
				.map((el) => _i18nConditions(el.capitalize()))
				.concat(`${_i18nConditions('Exhaustion')} ${_getExhaustionLevel(actor)}`)
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
	const hasExhaustion = actor.statuses.has('exhaustion') || actor.flags?.['automated-conditions-5e']?.statuses;
	if (hasExhaustion) exhaustionLevel = actor.system.attributes.exhaustion;
	return min ? min <= exhaustionLevel : exhaustionLevel;
}

export function _calcAdvantageMode(ac5eConfig, config, dialog, message) {
	const { ADVANTAGE: ADV_MODE, DISADVANTAGE: DIS_MODE, NORMAL: NORM_MODE } = CONFIG.Dice.D20Roll.ADV_MODE;
	const roll0 = config.rolls?.[0];
	if (ac5eConfig.subject.advantage.length || ac5eConfig.opponent.advantage.length) {
		config.advantage = true;
		dialog.options.advantageMode = ADV_MODE;
		dialog.options.defaultButton = 'advantage';
	}
	if (ac5eConfig.subject.disadvantage.length || ac5eConfig.opponent.disadvantage.length) {
		config.disadvantage = true;
		dialog.options.advantageMode = DIS_MODE;
		dialog.options.defaultButton = 'disadvantage';
	}
	if (config.advantage === config.disadvantage) {
		config.advantage = false;
		config.disadvantage = false;
		dialog.options.advantageMode = NORM_MODE;
		dialog.options.defaultButton = 'normal';
	}
	if (ac5eConfig.subject.fail.length || ac5eConfig.opponent.fail.length) {
		// config.target = 1000;
		if (_activeModule('midi-qol')) {
			ac5eConfig.parts.push(-999);
			if (config.workflow) {
				config.workflow._isCritical = false;
				config.workflow.isCritical = false;
			}
			if (config.midiOptions) {
				config.midiOptions.isCritical = false;
				if (config.midiOptions.workflowOptions) config.midiOptions.workflowOptions.isCritical = false;
			}
		}
		if (roll0) {
			roll0.options.criticalSuccess = 21;
			roll0.options.target = 1000;
		}
	}
	if (ac5eConfig.subject.success.length || ac5eConfig.opponent.success.length) {
		// config.target = -1000;
		if (_activeModule('midi-qol')) {
			ac5eConfig.parts.push(+999);
			if (config.workflow) {
				config.workflow._isFumble = false;
				config.workflow.isFumble = false;
			}
			if (config.midiOptions) {
				config.midiOptions.isFumble = false;
				if (config.midiOptions.workflowOptions) config.midiOptions.workflowOptions.isFumble = false;
			}
		}

		if (roll0) {
			roll0.options.criticalFailure = 0;
			roll0.options.target = -1000;
		}
	}
	if (ac5eConfig.subject.fumble.length || ac5eConfig.opponent.fumble.length) {
		// config.target = 1000;
		if (config.workflow) {
			config.workflow._isFumble = true;
			config.workflow.isFumble = true;
		}
		if (config.midiOptions) {
			config.midiOptions.isFumble = true;
			if (config.midiOptions.workflowOptions) config.midiOptions.workflowOptions.isFumble = true;
		}
		if (roll0) {
			roll0.options.criticalSuccess = 21;
			roll0.options.criticalFailure = 20;
			roll0.options.isFumble = true;
			roll0.options.target = 1000;
		}
	}
	if (ac5eConfig.subject.critical.length || ac5eConfig.opponent.critical.length) {
		ac5eConfig.isCritical = true;
		// config.target = -1000;
		if (roll0) roll0.options.target = -Infinity;
		if (config.workflow) {
			config.workflow._isCritical = true;
			config.workflow.isCritical = true;
		}
		if (config.midiOptions) {
			config.midiOptions.isCritical = true;
			if (config.midiOptions.workflowOptions) config.midiOptions.workflowOptions.isCritical = true;
		}
		if (roll0) {
			roll0.options.criticalSuccess = 1;
			roll0.options.criticalFailure = 0;
			roll0.options.isCritical = true;
			roll0.options.target = -1000;
		}
		if (ac5eConfig.hookType === 'damage') dialog.options.defaultButton = 'critical';
	}
	if (ac5eConfig.parts.length) {
		if (roll0) typeof roll0.parts !== 'undefined' ? (roll0.parts = roll0.parts.concat(ac5eConfig.parts)) : (roll0.parts = [ac5eConfig.parts]);
		else if (config.parts) config.parts.push(ac5eConfig.parts);
	}
	ac5eConfig.advantageMode = dialog.options.advantageMode;
	ac5eConfig.defaultButton = dialog.options.defaultButton;
	return _setAC5eProperties(ac5eConfig, config, dialog, message);
}

//check for 'same' 'different' or 'all' (=false) dispositions
//t1, t2 Token5e or Token5e#Document
export function _dispositionCheck(t1, t2, check = false) {
	if (!t1 || !t2) return false;
	t1 = t1 instanceof TokenDocument ? t1 : t1.document;
	t2 = t2 instanceof TokenDocument ? t2 : t2.document;
	if (check === 'different') return t1.disposition !== t2.disposition;
	if (check === 'opposite') return t1.disposition * t2.disposition === -1;
	if (check === 'same') return t1.disposition === t2.disposition;
	if (!check || check === 'all') return true;
	//to-do: 1. what about secret? 2. might need more granular checks in the future.
}

export function _findNearby({
	token, //Token5e or Token5e#Document to find nearby around.
	disposition = 'all', //'all', 'same', 'different', false
	radius = 5, //default radius 5
	lengthTest = false, //false or integer which will test the length of the array against that number and return true/false.
	includeToken = false, //includes or exclude source token
	includeIncapacitated = false,
}) {
	if (!canvas || !canvas.tokens?.placeables) return false;
	const validTokens = canvas.tokens.placeables.filter((placeable) => placeable !== token && (!includeIncapacitated ? !_hasStatuses(placeable.actor, ['dead', 'incapacitated'], true) : true) && _dispositionCheck(token, placeable, disposition) && _getDistance(token, placeable) <= radius);
	if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - findNearby():`, validTokens);
	if (lengthTest) return validTokens.length >= lengthTest;
	if (includeToken) return validTokens.concat(token);
	return validTokens;
}

export function _autoArmor(actor) {
	if (!actor) return {};
	const hasArmor = actor.armor;
	const hasShield = actor.shield;
	return {
		hasStealthDisadvantage: hasArmor?.system.properties.has('stealthDisadvantage') ? 'Armor' : hasShield?.system.properties.has('stealthDisadvantage') ? 'EquipmentShield' : actor.itemTypes.equipment.some((item) => item.system.equipped && item.system.properties.has('stealthDisadvantage')) ? 'AC5E.Equipment' : false,
		notProficient: !!hasArmor && !hasArmor.system.proficient && !hasArmor.system.prof.multiplier ? 'Armor' : !!hasShield && !hasShield.system.proficient && !hasShield.system.prof.multiplier ? 'EquipmentShield' : false,
	};
}

export function _autoEncumbrance(actor, abilityId) {
	if (!settings.autoEncumbrance) return null;
	return ['con', 'dex', 'str'].includes(abilityId) && _hasStatuses(actor, 'heavilyEncumbered').length;
}

export function _autoRanged(activity, token, target) {
	const { checkRange: midiCheckRange, nearbyFoe: midiNearbyFoe } = _activeModule('midi-qol') && MidiQOL.configSettings().optionalRulesEnabled ? MidiQOL.configSettings().optionalRules : {};
	const actionType = _getActionType(activity);
	const { range, item } = activity || {};
	if (!range || !token) return {};
	let { value: short, long, reach } = range;
	const distance = target ? _getDistance(token, target) : undefined;
	if (reach && ['mwak', 'msak'].includes(actionType) && !item.system.properties.has('thr')) return { inRange: distance <= reach };
	const flags = token.actor?.flags?.[Constants.MODULE_ID];
	const sharpShooter = flags?.sharpShooter || _hasItem(token.actor, 'sharpshooter');
	if (sharpShooter && long && actionType == 'rwak') short = long;
	const crossbowExpert = flags?.crossbowExpert || _hasItem(token.actor, 'crossbow expert');
	const nearbyFoe =
		!midiNearbyFoe &&
		!['mwak', 'msak'].includes(actionType) &&
		settings.autoRangedCombined === 'nearby' &&
		_findNearby({ token, disposition: 'opposite', radius: 5, lengthTest: 1 }) && //hostile vs friendly disposition only
		!crossbowExpert;
	const inRange = midiCheckRange !== 'none' || (!short && !long) || distance <= short ? 'short' : distance <= long ? 'long' : false; //expect short and long being null for some items, and handle these cases as in short range.
	return { inRange: !!inRange, range: inRange, distance, nearbyFoe };
}

export function _hasItem(actor, itemName) {
	return actor?.items.some((item) => item?.name.toLocaleLowerCase().includes(_localize(itemName).toLocaleLowerCase()));
}

export function _systemCheck(testVersion) {
	return foundry.utils.isNewerVersion(game.system.version, testVersion);
}

export function _getTooltip(ac5eConfig = {}) {
	const { hookType, subject, opponent } = ac5eConfig;
	let tooltip = settings.showNameTooltips ? '<center><strong>Automated Conditions 5e<hr></strong></center>' : '';
	const addTooltip = (condition, text) => {
		if (condition) {
			if (tooltip.includes(':')) tooltip += '<br>';
			tooltip += text;
		}
	};
	if (subject) {
		addTooltip(subject.critical.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Critical')}: ${subject.critical.join(', ')}</span>`);
		addTooltip(subject.advantage.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Advantage')}: ${subject.advantage.join(', ')}</span>`);
		addTooltip(subject.fail.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Fail')}: ${subject.fail.join(', ')}</span>`);
		addTooltip(subject.fumble.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Fumble')}: ${subject.fumble.join(', ')}</span>`);
		addTooltip(subject.disadvantage.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Disadvantage')}: ${subject.disadvantage.join(', ')}</span>`);
		addTooltip(subject.success.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Success')}: ${subject.success.join(', ')}</span>`);
		addTooltip(subject.bonus.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Bonus')}: ${subject.bonus.join(', ')}</span>`);
	}
	if (opponent) {
		addTooltip(opponent.critical.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsCriticalAbbreviated')}: ${opponent.critical.join(', ')}</span>`);
		addTooltip(opponent.fail.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsFail')}: ${opponent.fail.join(', ')}</span>`);
		addTooltip(opponent.advantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsAdvantageAbbreviated')}: ${opponent.advantage.join(', ')}</span>`);
		addTooltip(opponent.disadvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsDisadvantageAbbreviated')}: ${opponent.disadvantage.join(', ')}</span>`);
		addTooltip(opponent.success.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsSuccess')}: ${opponent.success.join(', ')}</span>`);
		addTooltip(opponent.fumble.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsFumble')}: ${opponent.fumble.join(', ')}</span>`);
		addTooltip(opponent.bonus.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsBonus')}: ${opponent.bonus.join(', ')}</span>`);
	}
	return tooltip.includes(':') ? tooltip : (tooltip += `<center><strong>${_localize('AC5E.NoChanges')}</strong></center>`);
}

export function _getConfig(config, dialog, hookType, tokenId, targetId, options = {}, reEval = false) {
	// foundry.utils.mergeObject(options, { spellLevel: dialog?.data?.flags?.use?.spellLevel, attackMode: config?.attackMode });
	if (settings.debug) console.warn('AC5E._getConfig:', { config });
	const existingAC5e = config?.[Constants.MODULE_ID]; //to-do: any need for that one?
	// if (!foundry.utils.isEmpty(existingAC5e) && !reEval) foundry.utils.mergeObject(options, existingAC5e.options);
	if (settings.debug) console.error('AC5E._getConfig', { mergedOptions: options });
	const areKeysPressed = game.system.utils.areKeysPressed;
	const ac5eConfig = {
		hookType,
		tokenId,
		targetId,
		subject: {
			advantage: [],
			disadvantage: [],
			fail: [],
			bonus: [],
			critical: [],
			success: [],
			fumble: [],
		},
		opponent: {
			advantage: [],
			disadvantage: [],
			fail: [],
			bonus: [],
			critical: [],
			success: [],
			fumble: [],
		},
		options,
		parts: [],
		preAC5eConfig: {
			advKey: hookType !== 'damage' ? areKeysPressed(config.event, 'skipDialogAdvantage') : false,
			disKey: hookType !== 'damage' ? areKeysPressed(config.event, 'skipDialogDisadvantage') : false,
			critKey: hookType === 'damage' ? areKeysPressed(config.event, 'skipDialogAdvantage') : false,
			fastForward: hookType !== 'damage' ? areKeysPressed(config.event, 'skipDialogNormal') : hookType === 'damage' ? areKeysPressed(config.event, 'skipDialogNormal') || areKeysPressed(config.event, 'skipDialogDisadvantage') : false,
		},
		returnEarly: false,
	};
	if (options.skill || options.tool) ac5eConfig.title = dialog?.options?.window?.title;
	const roller = _activeModule('midi-qol') ? 'MidiQOL' : _activeModule('ready-set-roll-5e') ? 'RSR' : 'Core';
	if (_activeModule('midi-qol')) ac5eConfig.preAC5eConfig.midiOptions = foundry.utils.duplicate(config.midiOptions || {});
	ac5eConfig.roller = roller;

	//const actorType = hookType === 'attack' ? 'subject' : 'opponent';

	if (ac5eConfig.preAC5eConfig.advKey) {
		ac5eConfig.subject.advantage = [`${roller} (keyPress)`];
		ac5eConfig.returnEarly = settings.keypressOverrides;
		if (ac5eConfig.returnEarly) {
			config.advantage = true;
			config.disadvantage = false;
		}
	} else if (ac5eConfig.preAC5eConfig.disKey) {
		ac5eConfig.subject.disadvantage = [`${roller} (keyPress)`];
		ac5eConfig.returnEarly = settings.keypressOverrides;
		if (ac5eConfig.returnEarly) {
			config.advantage = false;
			config.disadvantage = true;
		}
	} else if (ac5eConfig.preAC5eConfig.critKey) {
		ac5eConfig.subject.critical = [`${roller} (keyPress)`];
		ac5eConfig.returnEarly = settings.keypressOverrides;
	}

	if (ac5eConfig.returnEarly) {
		if (settings.debug) console.warn('AC5E_getConfig', { ac5eConfig });
		return ac5eConfig;
	}
	if ((config.advantage || ac5eConfig.preAC5eConfig.midiOptions?.advantage) && !ac5eConfig.preAC5eConfig.advKey) ac5eConfig.subject.advantage.push(`${roller} (flags)`);
	if ((config.disadvantage || ac5eConfig.preAC5eConfig.midiOptions?.disadvantage) && !ac5eConfig.preAC5eConfig.disKey) ac5eConfig.subject.disadvantage.push(`${roller} (flags)`);
	if ((config.isCritical || ac5eConfig.preAC5eConfig.midiOptions?.isCritical) && !ac5eConfig.preAC5eConfig.critKey) ac5eConfig.subject.critical.push(`${roller} (flags)`);

	const actor = canvas.tokens.get(tokenId)?.actor;
	const actorSystemRollMode = [];
	if (options.skill && hookType === 'check') {
		// actorSystemRollMode.push(getActorSkillRollModes({actor, skill: options.skill}));
		const result = getActorSkillRollModes({ actor, skill: options.skill });
		if (result > 0) ac5eConfig.subject.advantage.push(_localize('AC5E.SystemMode'));
		if (result < 0) ac5eConfig.subject.disadvantage.push(_localize('AC5E.SystemMode'));
	}
	if (options.tool && hookType === 'check') {
		// actorSystemRollMode.push(getActorToolRollModes({actor, tool: options.tool}));
		const result = getActorToolRollModes({ actor, tool: options.tool });
		if (result > 0) ac5eConfig.subject.advantage.push(_localize('AC5E.SystemMode'));
		if (result < 0) ac5eConfig.subject.disadvantage.push(_localize('AC5E.SystemMode'));
	}
	if (options.ability && (hookType === 'check' || hookType === 'save')) {
		// actorSystemRollMode.push(getActorAbilityRollModes({ability, actor, hook}));
		const result = getActorAbilityRollModes({ ability: options.ability, actor, hookType });
		if (result > 0) ac5eConfig.subject.advantage.push(_localize('AC5E.SystemMode'));
		if (result < 0) ac5eConfig.subject.disadvantage.push(_localize('AC5E.SystemMode'));
	}
	//for now we don't care about mutliple different sources, but instead a total result for each (counts not implemented yet by the system)
	// const arrayLength = actorSystemRollMode.filter(Boolean).length;
	// let result;
	// if (arrayLength > 1)
	if (settings.debug) console.warn('AC5E_getConfig', { ac5eConfig });
	return ac5eConfig;
}

export function getActorAbilityRollModes({ actor, hookType, ability }) {
	return actor.system.abilities[ability]?.[hookType]?.roll.mode;
}

export function getActorSkillRollModes({ actor, skill }) {
	return actor.system.skills[skill]?.roll.mode;
}

export function getActorToolRollModes({ actor, tool }) {
	return actor.system.tools[tool]?.roll.mode;
}

export function _setAC5eProperties(ac5eConfig, config, dialog, message) {
	if (settings.debug) console.warn('AC5e helpers._setAC5eProperties', { ac5eConfig, config, dialog, message });

	const ac5eConfigObject = { [Constants.MODULE_ID]: ac5eConfig, classes: ['ac5e'] };

	if (config) foundry.utils.mergeObject(config, ac5eConfigObject);
	if (config.rolls?.[0]?.data?.flags) foundry.utils.mergeObject(config.rolls[0].data.flags, ac5eConfigObject);
	if (config.rolls?.[0]?.options) foundry.utils.mergeObject(config.rolls[0].options, ac5eConfigObject);
	if (message?.data?.flags) foundry.utils.mergeObject(message?.data.flags, ac5eConfigObject);
	else foundry.utils.setProperty(message, 'data.flags', ac5eConfigObject);
	if (settings.debug) console.warn('AC5e post helpers._setAC5eProperties', { ac5eConfig, config, dialog, message });
}

export function _activeModule(moduleID) {
	return game.modules.get(moduleID)?.active;
}

export function _canSee(source, target) {
	if (_activeModule('midi-qol')) return MidiQOL.canSee(source, target);
	const NON_SIGHT_CONSIDERED_SIGHT = ['blindsight'];
	const detectionModes = CONFIG.Canvas.detectionModes;
	const DetectionModeCONST = game.version > '13' ? foundry.canvas.perception.DetectionMode : DetectionMode;
	const sightDetectionModes = Object.keys(detectionModes).filter(
		(d) =>
			detectionModes[d].type === DetectionModeCONST.DETECTION_TYPES.SIGHT || NON_SIGHT_CONSIDERED_SIGHT.includes(d)
	);
	return canSense(source, target, sightDetectionModes);
}

function canSense(source, target, validModes = ['all']) {
	return canSenseModes(source, target, validModes).length > 0;
}

function canSenseModes(token, target, validModesParam = ['all']) {
	if (!token || !target) {
		if (settings.debug) console.warn('AC5e: No valid tokens for canSee check');
		return ['noToken'];
	}
	const detectionModes = CONFIG.Canvas.detectionModes;
	const DetectionModeCONST = game.version > '13' ? foundry.canvas.perception.DetectionMode : DetectionMode;
	//any non-owned, non-selected tokens will have their vision not initialized.
	if (target.document?.hidden || token.document?.hidden) return [];
	if (!token.hasSight) return ['senseAll'];
	if ((!token.vision || !token.vision.los) && !_initializeVision(token)) return ['noSight'];
	const matchedModes = new Set();
	const t = Math.min(target.w, target.h) / 4;
	const targetPoint = target.center;
	const offsets =
		t > 0
			? [
					[0, 0],
					[-t, -t],
					[-t, t],
					[t, t],
					[t, -t],
					[-t, 0],
					[t, 0],
					[0, -t],
					[0, t],
			  ]
			: [[0, 0]];
	const tests = offsets.map((o) => ({
		point: new PIXI.Point(targetPoint.x + o[0], targetPoint.y + o[1]),
		elevation: target.document.elevation,
		los: new Map(),
	}));
	const config = { tests, object: target };
	const tokenDetectionModes = token.detectionModes;
	const modes = CONFIG.Canvas.detectionModes;
	let validModes = new Set(validModesParam);

	// First test basic detection for light sources which specifically provide vision
	const lightSources = canvas?.effects?.lightSources;
	for (const lightSource of lightSources ?? []) {
		if (!lightSource.active || lightSource.data.disabled) continue;
		if (!validModes.has(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID) && !validModes.has('all')) continue;
		const result = lightSource.testVisibility && lightSource.testVisibility(config);
		if (result === true) matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
	}
	const lightPerception = tokenDetectionModes.find((m) => m.id === modes.lightPerception?.id);
	if (lightPerception && ['lightPerception', 'all'].some((mode) => validModes.has(mode))) {
		const result = lightPerception ? modes.lightPerception.testVisibility(token.vision, lightPerception, config) : false;
		if (result === true) matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
	}
	const basic = tokenDetectionModes.find((m) => m.id === DetectionModeCONST.BASIC_MODE_ID);
	if (basic && ['basicSight', 'all'].some((mode) => validModes.has(mode))) {
		const result = modes.basicSight.testVisibility(token.vision, basic, config);
		if (result === true) matchedModes.add(detectionModes.basicSight?.id ?? DetectionModeCONST.BASIC_MODE_ID);
	}

	for (const detectionMode of tokenDetectionModes) {
		if (detectionMode.id === DetectionModeCONST.BASIC_MODE_ID) continue;
		if (!detectionMode.enabled) continue;
		const dm = modes[detectionMode.id];
		if (validModes.has('all') || validModes.has(detectionMode.id)) {
			const result = dm?.testVisibility(token.vision, detectionMode, config);
			if (result === true) {
				matchedModes.add(detectionMode.id);
			}
		}
	}
	for (let tk of [token, target]) {
		if (!tk.document.sight.enabled) {
			const sourceId = tk.sourceId;
			canvas?.effects?.visionSources.delete(sourceId);
		}
	}
	if (settings.debug) console.warn(`${Constants.MODULE_SHORT_NAME} - _canSee()`, { sourceId: token?.id, targetId: target?.id, result: matchedModes });
	return Array.from(matchedModes);
}

function _initializeVision(token) {
	let sightEnabled = token.document.sight.enabled;
	sightEnabled = true;
	token.document._prepareDetectionModes();
	const sourceId = token.sourceId;
	token.vision = new CONFIG.Canvas.visionSourceClass({ sourceId, object: token }); //v12 only
	token.vision.initialize({
		x: token.center.x,
		y: token.center.y,
		elevation: token.document.elevation,
		radius: Math.clamp(token.sightRange, 0, canvas?.dimensions?.maxR ?? 0),
		externalRadius: token.externalRadius,
		angle: token.document.sight.angle,
		contrast: token.document.sight.contrast,
		saturation: token.document.sight.saturation,
		brightness: token.document.sight.brightness,
		attenuation: token.document.sight.attenuation,
		rotation: token.document.rotation,
		visionMode: token.document.sight.visionMode,
		color: globalThis.Color.from(token.document.sight.color),
		isPreview: !!token._original,
		blinded: token.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND),
	});
	if (!token.vision.los) {
		token.vision.shape = token.vision._createRestrictedPolygon();
		token.vision.los = token.vision.shape;
	}
	token.vision.animated = false;
	canvas?.effects?.visionSources.set(sourceId, token.vision);
	return true;
}

export function _staticID(id) {
	id = `dnd5e${id}`;
	if (id.length >= 16) return id.substring(0, 16);
	return id.padEnd(16, '0');
}

export function _getActionType(activity, returnClassifications = false) {
	if (['mwak', 'msak', 'rwak', 'rsak'].includes(activity?.actionType)) return activity.actionType;
	let actionType = activity?.attack?.type;
	if (!actionType) return null;
	if (returnClassifications) return actionType;
	if (actionType.value === 'melee') {
		if (actionType.classification === 'weapon' || actionType.classification === 'unarmed') actionType = 'mwak';
		else if (actionType.classification === 'spell') actionType = 'msak';
		// else if (actionType.classification === 'unarmed') actionType = 'muak'; //to-do: is there any need for this??
	} else if (actionType.value === 'ranged') {
		if (actionType.classification === 'weapon' || actionType.classification === 'unarmed') actionType = 'rwak';
		else if (actionType.classification === 'spell') actionType = 'rsak';
		// else if (actionType.classification === 'unarmed') actionType = 'ruak'; //to-do: is there any need for this??
	} else actionType = undefined;
	return actionType;
}

export function _getEffectOriginToken(effect /* ActiveEffect */, type = 'id' /* token, id, uuid */) {
	if (!effect?.origin) return undefined;

	let origin = fromUuidSync(effect.origin);
	let actor = _resolveActorFromOrigin(origin);

	// Check if origin itself has an origin (chained origin), resolve again
	if (!actor && origin?.origin) {
		const deeperOrigin = fromUuidSync(origin.origin);
		actor = _resolveActorFromOrigin(deeperOrigin);
	}

	if (!actor) return undefined;
	const token = actor.getActiveTokens()[0];
	if (!token) return undefined;

	switch (type) {
		case 'id':
			return token.id;
		case 'uuid':
			return token.document.uuid;
		case 'token':
			return token;
		default:
			return undefined;
	}
}

export function _resolveActorFromOrigin(origin) {
	if (!origin) return undefined;

	// If origin is an ActiveEffect on an Item or Actor
	if (origin instanceof CONFIG.ActiveEffect.documentClass) {
		const parent = origin.parent;
		if (parent instanceof CONFIG.Item.documentClass) return parent.actor;
		if (parent instanceof CONFIG.Actor.documentClass) return parent;
	}

	// If origin is an Item or directly embedded in Actor
	if (origin.parent instanceof CONFIG.Item.documentClass) return origin.parent.actor;
	if (origin.parent instanceof CONFIG.Actor.documentClass) return origin.parent;

	return undefined;
}

export function _hasValidTargets(activity, size, type = 'attack', warn = false) {
	//will return true if the Item has an attack roll and targets are correctly set and selected, or false otherwise.
	//type of hook, 'attack', 'roll'  ; seems that there is no need for a 'pre'
	if (
		activity.parent.hasAttack &&
		(activity.target.affects?.type || (!activity.target.affects?.type && !(activity.target.template?.type || activity.target.affects?.type))) &&
		size != 1 /*&&
		!keyboard.downKeys.has('KeyU')*/
	) {
		sizeWarnings(size, type, warn);
		return false;
	} else return true;
}

function sizeWarnings(size, type, warn = false) {
	//size, by this point, can be either false or >1 so no need for other checks
	//type for now can be 'damage' or 'attack'/'pre'
	const translationString = type == 'damage' ? (size ? _localize('AC5E.MultipleTargetsDamageWarn') : _localize('AC5E.NoTargetsDamageWarn')) : size ? _localize('AC5E.MultipleTargetsAttackWarn') : _localize('AC5E.NoTargetsAttackWarn');
	if (warn === 'enforce') ui.notifications.warn(translationString);
	else if (warn === 'console') console.warn(translationString);
}

export function _raceOrType(actor, dataType = 'race') {
	const systemData = actor?.system;
	if (!systemData) return {};
	const data = foundry.utils.duplicate(systemData.details.type); //{value, subtype, swarm, custom}
	data.race = systemData.details.race?.identifier ?? data.value; //{value, subtype, swarm, custom, race: raceItem.identifier ?? value}
	if (dataType === 'all') return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.toLocaleLowerCase() : v]));
	else return data[dataType]?.toLocaleLowerCase();
}

export function _generateAC5eFlags() {
	const daeFlags = ['flags.automated-condition-5e.crossbowExpert', 'flags.automated-condition-5e.sharpShooter'];
	// const actionTypes = ["ACTIONTYPE"];//["attack", "damage", "check", "concentration", "death", "initiative", "save", "skill", "tool"];
	const modes = ['advantage', 'bonus', 'critical', 'disadvantage', 'fail', 'fumble', 'success'];
	const types = ['source', 'grants', 'aura'];
	for (const type of types) {
		for (const mode of modes) {
			if (type === 'source') daeFlags.push(`flags.${Constants.MODULE_ID}.ACTIONTYPE.${mode}`);
			else daeFlags.push(`flags.${Constants.MODULE_ID}.${type}.ACTIONTYPE.${mode}`);
		}
	}
	return daeFlags;
}

let tempDiv = null;

export function _getValidColor(color, fallback, game) {
	if (!color) return fallback;

	const lower = color.trim().toLowerCase();
	if (['false', 'none', 'null', '0'].includes(lower)) return false;
	if (lower === 'user') return game && game.user && game.user.color && game.user.color.css ? game.user.color.css : fallback;

	// Create a hidden element once and reuse it
	if (!tempDiv) {
		tempDiv = document.createElement('div');
		tempDiv.style.display = 'none';
		document.body.appendChild(tempDiv);
	}

	tempDiv.style.color = color;
	const computedColor = window.getComputedStyle(tempDiv).color;

	// Convert RGB to hex if valid
	const match = computedColor.match(/\d+/g);
	if (match && match.length >= 3) {
		return `#${match
			.slice(0, 3)
			.map((n) => parseInt(n).toString(16).padStart(2, '0'))
			.join('')}`;
	}
	return fallback;
}

export function _ac5eSafeEval({ expression, sandbox }) {
	if (!expression) return undefined;
	if (typeof expression !== 'string') {
		throw new Error(`Roll.safeEval expected a string expression, got ${typeof expression}`);
	}
	if (expression.includes('game')) {
		throw new Error(`Roll.safeEval expression cannot contain game.`);
	}
	if (expression.includes('canvas')) {
		throw new Error(`Roll.safeEval expression cannot contain canvas.`);
	}
	let result;
	try {
		result = new Function('sandbox', `with (sandbox) { return ${expression}}`)(sandbox);
	} catch (err) {
		result = undefined;
	}
	if (settings.debug) console.log('AC5E._ac5eSafeEval:', { expression, result });
	return result;
}

export function _ac5eActorRollData(actor) {
	if (!(actor instanceof CONFIG.Actor.documentClass)) return {};
	const actorData = actor.system.toObject();
	actorData.currencyWeight = actor.system.currencyWeight;
	actorData.effects = actor.appliedEffects;
	actorData.equippedItems = actor.items.filter((item) => item?.system?.equipped).map((item) => item.name);
	actorData.flags = actor.flags;
	actorData.name = actor.name;
	actorData.statuses = actor.statuses;
	actorData.type = actor.type;
	return actorData;
}

export function _createEvaluationSandbox({ subjectToken, opponentToken, options }) {
	const sandbox = {};
	const { ability, activity, distance, skill, tool } = options;
	const item = activity?.item;

	if (subjectToken) {
		sandbox.rollingActor = _ac5eActorRollData(subjectToken.actor); //subjectToken.actor.getRollData();
		sandbox.rollingActor.creatureType = Object.values(_raceOrType(subjectToken.actor, 'all'));
		if (subjectToken) {
			sandbox.rollingActor.token = subjectToken;
			sandbox.rollingActor.tokenSize = subjectToken.document.width * subjectToken.document.height;
			sandbox.rollingActor.tokenElevation = subjectToken.document.elevation;
			sandbox.rollingActor.tokenSenses = subjectToken.document.detectionModes;
			sandbox.rollingActor.tokenUuid = subjectToken.document.uuid;
			sandbox.tokenId = subjectToken.id;
		}
	}
	if (opponentToken) {
		sandbox.targetActor = _ac5eActorRollData(opponentToken.actor) //.getRollData();
		sandbox.targetActor.creatureType = Object.values(_raceOrType(opponentToken.actor, 'all'));
		if (opponentToken) {
			sandbox.targetActor.token = opponentToken;
			sandbox.targetActor.tokenSize = opponentToken.document.width * opponentToken.document.height;
			sandbox.targetActor.tokenElevation = opponentToken.document.elevation;
			sandbox.targetActor.tokenSenses = opponentToken.document.detectionModes;
			sandbox.targetActor.tokenUuid = opponentToken.document.uuid;
			sandbox.targetId = opponentToken.id;
		}
	}

	sandbox.activity = activity?.getRollData().activity || {};
	sandbox.riderStatuses = options.activityEffectsStatusRiders;
	if (activity) {
		const activityData = sandbox.activity;
		activityData.damageTypes = options.activityDamageTypes;
		if (!foundry.utils.isEmpty(activityData.damageTypes)) activityData.damageTypes.filter((d) => (sandbox[d] = true));
		activityData.attackMode = options?.attackMode;
		if (options?.attackMode) sandbox[options.attackMode] = true;
		if (activity.actionType) sandbox[activity.actionType] = true;
		sandbox[activityData.name] = true;
		sandbox[activityData.activation.type] = true;
		sandbox[activityData.type] = true;
	}

	sandbox.item = item?.getRollData().item || {};
	if (item) {
		const itemData = sandbox.item;
		sandbox.itemType = item.type;
		if (itemData.school) sandbox[itemData.school] = true;
		if (itemData.identifier) sandbox[itemData.identifier] = true;
		sandbox[itemData.name] = true;
		itemData.properties.filter((p) => (sandbox[p] = true));
	}

	const active = game.combat?.active;
	const currentCombatant = active ? game.combat.combatant?.tokenId : null;
	sandbox.combat = { active, round: game.combat?.round, turn: game.combat?.turn, current: game.combat?.current, turns: game.combat?.turns };
	sandbox.isTurn = currentCombatant === subjectToken?.id;
	sandbox.isTargetTurn = currentCombatant === opponentToken?.id;

	sandbox.worldTime = game.time?.worldTime;
	sandbox.options = options;
	// in options there are options.isDeathSave options.isInitiative options.isConcentration
	sandbox.isConcentration = options?.isConcentration;
	sandbox.isDeathSave = options?.isDeathSave;
	sandbox.isInitiative = options?.isInitiative;
	sandbox.distance = options?.distance;
	sandbox.hook = options?.hook;
	sandbox.spellLevel = options?.spellLevel;
	if (options?.ability) sandbox[options.ability] = true;
	if (options?.skill) sandbox[options.skill] = true;
	if (options?.tool) sandbox[options.tool] = true;
	sandbox.canSee = _canSee(subjectToken, opponentToken);
	sandbox.isSeen = _canSee(opponentToken, subjectToken);

	const {
		DND5E: { abilities, abilityActivationTypes, activityTypes, attackClassifications, attackModes, attackTypes, creatureTypes, damageTypes, healingTypes, itemProperties, skills, tools, spellSchools, spellcastingTypes, spellLevels, validProperties, weaponTypes },
		/*statusEffects,*/
	} = CONFIG || {};
	const statusEffects = CONFIG.statusEffects.map((e) => e.id).concat('bloodied');
	foundry.utils.mergeObject(sandbox, { CONFIG: { abilities, abilityActivationTypes, activityTypes, attackClassifications, attackModes, attackTypes, creatureTypes, damageTypes, healingTypes, itemProperties, skills, tools, spellSchools, spellcastingTypes, spellLevels, validProperties, weaponTypes, statusEffects } });
	foundry.utils.mergeObject(sandbox, { ac5e: { checkVisibility: ac5e.checkVisibility, checkRanged: ac5e.checkRanged, checkDistance: ac5e.checkDistance, checkCreatureType: ac5e.checkCreatureType, checkArmor: ac5e.checkArmor } });
	if (settings.debug) console.log('AC5E._createEvaluationSandbox:', { sandbox });
	if (sandbox.undefined) {
		delete sandbox.undefined; //guard against sandbox.undefined = true being present
		console.warn('AC5E sandbox.undefined detected!!!');
	} 
	return sandbox;
}

export function _getActivityDamageTypes(activity) {
	if (!activity) return [];
	if (['attack', 'damage', 'save'].includes(activity?.type)) return activity.damage.parts.reduce((acc, d) => acc.concat([...d.types] ?? []), []);
	if (activity?.type === 'heal') return [...activity.healing.types]; //parts.reduce((acc, d) => acc.concat([...d.types] ?? []), []);
}

export function _getActivityEffectsStatusRiders(activity) {
	const statuses = {};
	// const riders = {};
	activity?.applicableEffects.forEach((effect) => {
		Array.from(effect?.statuses).forEach((status) => (statuses[status] = true));
		effect.flags?.dnd5e?.riders?.statuses?.forEach((rider) => (statuses[rider] = true));
	});
	if (settings.debug) console.log('AC5E._getActivityEffectsStatusRiders:', { statuses });
	return statuses;
}
