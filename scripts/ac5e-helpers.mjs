import Constants from './ac5e-constants.mjs';
import { lazySandbox } from './ac5e-main.mjs';
import { evaluateCondition, prepareRollFormula } from './ac5e-parser.mjs';
import { _ac5eChecks } from './ac5e-setpieces.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

/**
 * Foundry v12 updated.
 * Gets the minimum distance between two tokens,
 * evaluating perimeter grid spaces they occupy and checking for walls blocking.
 */
export function _getDistance(tokenA, tokenB, includeUnits = false, overrideMidi = true, checkCollision = false, includeHeight = true) {
	let totalDistance = Infinity;
	const meleeDiagonals = settings.autoRangeChecks.has('meleeDiagonals');
	let adjacent2D;

	const tokenInstance = foundry.canvas.placeables.Token;
	if (typeof tokenA === 'string') {
		if (tokenA.includes('.')) tokenA = fromUuidSync(tokenA)?.object;
		else tokenA = canvas.tokens.get(tokenA);
	}
	if (typeof tokenB === 'string') {
		if (tokenB.includes('.')) tokenB = fromUuidSync(tokenB)?.object;
		else tokenB = canvas.tokens.get(tokenB);
	}
	if (!(tokenA instanceof tokenInstance) || !(tokenB instanceof tokenInstance)) return totalDistance;

	const { grid } = canvas || {};
	if (foundry.utils.isEmpty(grid)) return totalDistance;
	const { size, sizeX, sizeY, diagonals: gridDiagonals, distance: gridDistance, units, isGridless, isHexagonal, isSquare } = grid;

	if (_activeModule('midi-qol') && !overrideMidi) {
		const result = MidiQOL.computeDistance(tokenA, tokenB);
		if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - Defer to MidiQOL.computeDistance():`, { sourceId: tokenA?.id, targetId: tokenB?.id, result, units });
		if (includeUnits) return result + (includeUnits ? units : '');
		if (result === -1) return totalDistance;
		return result;
	}

	let diagonals, spaces;

	if (isHexagonal) {
		const tokenAHexes = getHexesOnPerimeter(tokenA);
		if (settings.debug) tokenAHexes.forEach((e) => canvas.ping(e));
		const tokenBHexes = getHexesOnPerimeter(tokenB);
		if (settings.debug) tokenBHexes.forEach((e) => canvas.ping(e));

		outer:
		for (const pointA of tokenAHexes) {
			for (const pointB of tokenBHexes) {
				if (
					checkCollision &&
					CONFIG.Canvas.polygonBackends[checkCollision].testCollision(pointB, pointA, {
						source: tokenB.document,
						mode: 'any',
						type: checkCollision,
					})
				)
					continue;
				adjacent2D = testAdjacency(canvas.grid.getOffset(pointA), canvas.grid.getOffset(pointB));
				if (adjacent2D && meleeDiagonals) {
					totalDistance = gridDistance;
					diagonals = 0;
					spaces = 1;
					break outer;
				} else {
					const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
					if (distance2D < totalDistance) {
						totalDistance = distance2D;
						diagonals = pathDiagonals;
						spaces = pathSpaces;
					}
				}
			}
		}
	} else {
		const areTokensIntersencting = tokenA.bounds.intersects(tokenB.bounds);
		if (areTokensIntersencting) {
			totalDistance = 0;
			diagonals = 0;
			spaces = 0;
		} else if (isGridless) {
			const tokenASquares = getGridlessSquaresOnPerimeter(tokenA);
			if (settings.debug) tokenASquares.forEach((s) => canvas.ping(s));
			const tokenBSquares = getGridlessSquaresOnPerimeter(tokenB);
			if (settings.debug) tokenBSquares.forEach((s) => canvas.ping(s));
			for (const pointA of tokenASquares) {
				for (const pointB of tokenBSquares) {
					if (
						checkCollision &&
						CONFIG.Canvas.polygonBackends[checkCollision].testCollision(pointB, pointA, {
							source: tokenB.document,
							mode: 'any',
							type: checkCollision,
						})
					)
						continue;
					const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
					if (distance2D < totalDistance) {
						const leeway = settings.autoRangeChecks.has('meleeOoR') ? gridDistance * 2 : false; //@to-do: offer a setting to turn on and set to user choice.
						totalDistance = leeway && distance2D <= leeway ? gridDistance : distance2D;
						diagonals = pathDiagonals;
						spaces = pathSpaces;
					}
				}
			}
		} else if (isSquare) {
			//const tokensIntersection = tokenA.bounds.intersection(tokenB.bounds);
			const tokenASquares = getSquaresOnPerimeter(tokenA);
			if (settings.debug) tokenASquares.forEach((s) => canvas.ping(s));
			const tokenBSquares = getSquaresOnPerimeter(tokenB);
			if (settings.debug) tokenBSquares.forEach((s) => canvas.ping(s));

			outer:
			for (const pointA of tokenASquares) {
				for (const pointB of tokenBSquares) {
					if (
						checkCollision &&
						CONFIG.Canvas.polygonBackends[checkCollision].testCollision(pointB, pointA, {
							source: tokenB.document,
							mode: 'any',
							type: checkCollision,
						})
					)
						continue;
					adjacent2D = testAdjacency(canvas.grid.getOffset(pointA), canvas.grid.getOffset(pointB));
					if (adjacent2D && meleeDiagonals) {
						totalDistance = gridDistance;
						diagonals = 0;
						spaces = 1;
						break outer;
					} else {
						const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
						if (distance2D < totalDistance) {
							totalDistance = distance2D;
							diagonals = pathDiagonals;
							spaces = pathSpaces;
						}
					}
				}
			}
		}
	}

	if (includeHeight) totalDistance = heightDifference(tokenA, tokenB, totalDistance, diagonals, spaces, grid, adjacent2D);
	if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - getDistance():`, { sourceId: tokenA.id, opponentId: tokenB.id, result: totalDistance, units });
	if (includeUnits) return ((totalDistance * 100) | 0) / 100 + units;
	return ((totalDistance * 100) | 0) / 100;
}

// reworked canvas.grid.testAdjacency to not care about diagonals
function testAdjacency(coords1, coords2) {
	const { i: i1, j: j1, k: k1 } = canvas.grid.getOffset(coords1);
	const { i: i2, j: j2, k: k2 } = canvas.grid.getOffset(coords2);
	const di = Math.abs(i1 - i2);
	const dj = Math.abs(j1 - j2);
	// @to-do: use 3D foundry functions instead of heightdifference dz
	const dk = k1 !== undefined ? Math.abs(k1 - k2) : 0;
	return Math.max(di, dj, dk) === 1;
}

function heightDifference(tokenA, tokenB, totalDistance, diagonals, spaces, grid, adjacent2D) {
	tokenA.z0 = (tokenA.document.elevation / grid.distance) | 0;
	tokenA.z1 = tokenA.z0 + Math.max(1, Math.min(tokenA.document.width | 0, tokenA.document.height | 0));
	tokenB.z0 = (tokenB.document.elevation / grid.distance) | 0;
	tokenB.z1 = tokenB.z0 + Math.max(1, Math.min(tokenB.document.width | 0, tokenB.document.height | 0));
	const dz = tokenB.z0 >= tokenA.z1 ? tokenB.z0 - tokenA.z1 + 1 : tokenA.z0 >= tokenB.z1 ? tokenA.z0 - tokenB.z1 + 1 : 0;
	if (Math.abs(dz) <= 1 && adjacent2D) return totalDistance;
	if (grid.isGridless) {
		const verticalDistance = dz * grid.distance;
		totalDistance = dz ? Math.sqrt(totalDistance * totalDistance + verticalDistance * verticalDistance) : totalDistance;
	} else totalDistance = dz ? calculateDiagonalsZ(diagonals, dz, spaces, totalDistance, grid) : totalDistance;
	return totalDistance;
}

function getHexesOnPerimeter(t) {
	const perimeterPoints = getHexPerimeterPoints(t);
	if (!perimeterPoints || perimeterPoints.length === 0) {
		console.warn('No perimeter points found for the token.');
		return [];
	}

	const foundHexes = {};

	for (let i = 0; i < perimeterPoints.length; i += 1) {
		const p = perimeterPoints[i];
		const nudged = nudgeToward(p, t.center);
		const pointToCube = canvas.grid.pointToCube({ x: nudged[0], y: nudged[1] });
		const hex = canvas.grid.getCenterPoint(pointToCube);
		hex.id = hex.x + hex.y;
		if (!foundHexes[hex.id] && hex.x > t.bounds.left && hex.x < t.bounds.right && hex.y < t.bounds.bottom && hex.y > t.bounds.top) {
			foundHexes[hex.id] = hex;
		}
	}
	return Object.values(foundHexes);
}
function nudgeToward(point, center, distance = 0.2) {
	const dx = center.x - point.x;
	const dy = center.y - point.y;
	const radians = Math.atan2(dy, dx);
	const degrees = radians * (180 / Math.PI);
	const nudgedPoint = getHexTranslatedPoint(point, degrees, distance);
	return [nudgedPoint.x, nudgedPoint.y];
}

function getHexPerimeterPoints(t) {
	const clipperP = t.shape.toClipperPoints();

	const points = [];
	clipperP.forEach((r) => points.push({ x: t.x + r.X, y: t.y + r.Y }));
	return points;
}

function getHexTranslatedPoint(point, direction, distance) {
	direction = Math.toRadians(direction);
	const dx = Math.cos(direction);
	const dy = Math.sin(direction);
	let q;
	let r;
	if (canvas.grid.columns) {
		q = 2 * Math.SQRT1_3 * dx;
		r = -0.5 * q + dy;
	} else {
		r = 2 * Math.SQRT1_3 * dy;
		q = -0.5 * r + dx;
	}
	const s = ((distance / canvas.grid.distance) * canvas.grid.size) / ((Math.abs(r) + Math.abs(q) + Math.abs(q + r)) / 2);
	const newPoint = { x: point.x + dx * s, y: point.y + dy * s };
	return newPoint;
}

function getGridlessSquaresOnPerimeter(t) {
	const perimeterCenterPoints = {};
	if (t.bounds.width === canvas.grid.sizeX && t.bounds.height === canvas.grid.sizeY) perimeterCenterPoints['one'] = { x: t.x + Math.floor(canvas.grid.size / 2), y: t.y + Math.floor(canvas.grid.size / 2) };
	else {
		const bounds = t.bounds;
		for (let x = bounds.x; x < bounds.right; x += canvas.grid.size) {
			for (let y = bounds.y; y < bounds.bottom; y += canvas.grid.size) {
				if (x === bounds.x || x === bounds.right - canvas.grid.size || y === bounds.y || y === bounds.bottom - canvas.grid.size) {
					const newX = x;
					const newY = y;
					const centerPoint = { x: newX + Math.floor(canvas.grid.size / 2), y: newY + Math.floor(canvas.grid.size / 2) };
					const newID = `${centerPoint.x}_${centerPoint.y}`;
					if (!perimeterCenterPoints[newID]) perimeterCenterPoints[newID] = { x: centerPoint.x, y: centerPoint.y };
				}
			}
		}
	}
	return Object.values(perimeterCenterPoints);
}

function getSquaresOnPerimeter(t) {
	const perimeterCenterPoints = {};
	const clipperPoints = game.version < 13 ? t.shape.toPolygon().toClipperPoints() : t.shape.toClipperPoints();
	for (let x = clipperPoints[0].X; x < clipperPoints[1].X; x += canvas.grid.size) {
		for (let y = clipperPoints[0].Y; y < clipperPoints[3].Y; y += canvas.grid.size) {
			if (x === 0 || x === clipperPoints[1].X - canvas.grid.size || y === 0 || y === clipperPoints[3].Y - canvas.grid.size) {
				const newX = t.x + x;
				const newY = t.y + y;
				const centerPoint = canvas.grid.getCenterPoint({ i: Math.floor(newY / canvas.grid.size), j: Math.floor(newX / canvas.grid.size) });
				const newID = `${centerPoint.x}_${centerPoint.y}`;
				if (!perimeterCenterPoints[newID]) perimeterCenterPoints[newID] = { x: centerPoint.x, y: centerPoint.y };
			}
		}
	}
	return Object.values(perimeterCenterPoints);
}

function calculateDiagonalsZ(diagonals, dz, spaces, totalDistance, grid) {
	const XY = { diagonals, illegal: spaces, moves: 0 };
	const Z = { illegal: dz, diagonals: Math.min(XY.illegal, dz), diagonalsXYZ: 0, diagonalsXZ_YZ: 0, moves: 0 };
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
			throw new Error(`${Constants.MODULE_NAME_SHORT}: Unknown diagonal rule: ${grid.diagonals}`);
	}

	totalDistance *= grid.distance;
	return totalDistance;
}

export function _i18nConditions(name) {
	const str = `EFFECT.DND5E.Status${name}`;
	if (game.i18n.has(str)) return game.i18n.localize(str);
	return game.i18n.localize(`DND5E.Con${name}`);
}

export function _localize(string) {
	return game.i18n.translations.DND5E?.[string] ?? game.i18n.localize(string);
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
	config.rolls ??= [];
	config.rolls[0] ??= {};
	const roll0 = config.rolls[0];
	roll0.options ??= {};
	const hook = ac5eConfig.hookType;
	const ac5eForcedRollTarget = 999;
	if (hook === 'damage') {
		if (ac5eConfig.subject.critical.length || ac5eConfig.opponent.critical.length) {
			ac5eConfig.isCritical = true;
			config.isCritical = true; // does this break something? added back to properly focus on button
			dialog.options.defaultButton = 'critical';
		}
	} else {
		if (ac5eConfig.subject.advantage.length || ac5eConfig.opponent.advantage.length || ac5eConfig.subject.advantageNames.size || ac5eConfig.opponent.advantageNames.size) {
			config.advantage = true;
		}
		if (ac5eConfig.subject.noAdvantage.length || ac5eConfig.opponent.noAdvantage.length) {
			config.advantage = false;
		}
		if (ac5eConfig.subject.disadvantage.length || ac5eConfig.opponent.disadvantage.length || ac5eConfig.subject.disadvantageNames.size || ac5eConfig.opponent.disadvantageNames.size) {
			config.disadvantage = true;
		}
		if (ac5eConfig.subject.noDisadvantage.length || ac5eConfig.opponent.noDisadvantage.length) {
			config.disadvantage = false;
		}
		if (config.advantage && config.disadvantage) {
			config.advantage = true; // both true let system handle it
			config.disadvantage = true; // both true let system handle it
			dialog.options.advantageMode = NORM_MODE;
			dialog.options.defaultButton = 'normal';
		} else if (config.advantage && !config.disadvantage) {
			dialog.options.advantageMode = ADV_MODE;
			dialog.options.defaultButton = 'advantage';
		} else if (!config.advantage && config.disadvantage) {
			dialog.options.advantageMode = DIS_MODE;
			dialog.options.defaultButton = 'disadvantage';
		}
		if (hook === 'attack' || hook === 'damage') {
			// need to allow damage hooks too for results shown?
			if (ac5eConfig.threshold?.length) {
				//for attack rolls
				const finalThreshold = getAlteredTargetValueOrThreshold(roll0.options.criticalSuccess, ac5eConfig.threshold, 'critThreshold');
				roll0.options.criticalSuccess = finalThreshold;
				ac5eConfig.alteredCritThreshold = finalThreshold;
			}
			if (ac5eConfig.fumbleThreshold?.length) {
				//for attack rolls
				const finalThreshold = getAlteredTargetValueOrThreshold(roll0.options.criticalFailure, ac5eConfig.fumbleThreshold, 'fumbleThreshold');
				roll0.options.criticalFailure = finalThreshold;
				ac5eConfig.alteredFumbleThreshold = finalThreshold;
			}
			if (ac5eConfig.targetADC?.length) {
				const targets = message?.data?.flags?.dnd5e?.targets;
				const initialTargetADC = targets?.[0]?.ac ?? 10; // initialValue 10 for AC if no targets
				let lowerTargetADC;
				if (!foundry.utils.isEmpty(targets)) {
					targets.forEach((target, index) => {
						const alteredTargetADC = getAlteredTargetValueOrThreshold(targets[index].ac, ac5eConfig.targetADC, 'acBonus');
						if (!isNaN(alteredTargetADC)) {
							targets[index].ac = alteredTargetADC;
							if (!lowerTargetADC || alteredTargetADC < lowerTargetADC) lowerTargetADC = alteredTargetADC;
						}
					});
				}
				if (!isNaN(lowerTargetADC)) {
					roll0.options.target = lowerTargetADC;
					ac5eConfig.alteredTargetADC = lowerTargetADC;
					ac5eConfig.initialTargetADC = initialTargetADC; //might be discrepancies for multiple targets
				}
			}
		}
		if (ac5eConfig.targetADC?.length && hook !== 'attack' && hook !== 'damage') {
			//check, save, skill
			const initialTargetADC = config.target;
			const alteredTargetADC = getAlteredTargetValueOrThreshold(initialTargetADC, ac5eConfig.targetADC, 'dcBonus');
			if (!isNaN(alteredTargetADC)) {
				ac5eConfig.initialTargetADC = roll0.options.target;
				roll0.options.target = alteredTargetADC;
				ac5eConfig.alteredTargetADC = alteredTargetADC;
				ac5eConfig.initialTargetADC = initialTargetADC;
			}
		}
		if (ac5eConfig.subject.fail.length || ac5eConfig.opponent.fail.length) {
			if (roll0) {
				roll0.options.criticalSuccess = 21;
				roll0.options.target = ac5eForcedRollTarget;
				if (hook === 'attack') {
					if (_activeModule('midi-qol')) ac5eConfig.parts.push(-ac5eForcedRollTarget);
					const targets = message?.data?.flags?.dnd5e?.targets;
					if (!foundry.utils.isEmpty(targets)) targets.forEach((t, index) => (targets[index].ac = ac5eForcedRollTarget));
				}
			}
		}
		if (ac5eConfig.subject.success.length || ac5eConfig.opponent.success.length) {
			if (roll0) {
				roll0.options.criticalFailure = 0;
				roll0.options.target = -ac5eForcedRollTarget;
				if (hook === 'attack') {
					if (_activeModule('midi-qol')) ac5eConfig.parts.push(ac5eForcedRollTarget);
					const targets = message?.data?.flags?.dnd5e?.targets;
					if (!foundry.utils.isEmpty(targets)) targets.forEach((t, index) => (targets[index].ac = -ac5eForcedRollTarget));
				}
			}
		}
		if (ac5eConfig.subject.fumble.length || ac5eConfig.opponent.fumble.length) {
			ac5eConfig.isFumble = true;
			if (roll0) {
				roll0.options.criticalSuccess = 21;
				roll0.options.criticalFailure = 20;
				if (hook !== 'attack') roll0.options.target = ac5eForcedRollTarget;
			}
		}
		if (ac5eConfig.subject.critical.length || ac5eConfig.opponent.critical.length) {
			ac5eConfig.isCritical = true;
			if (roll0) {
				roll0.options.criticalSuccess = 1;
				roll0.options.criticalFailure = 0;
				if (hook !== 'attack') roll0.options.target = -ac5eForcedRollTarget;
			}
		}
	}
	if (ac5eConfig.subject.noCritical.length || ac5eConfig.opponent.noCritical.length) {
		if (hook === 'attack') roll0.options.criticalSuccess = 21;
		if (hook === 'damage') dialog.options.defaultButton = 'normal';
		ac5eConfig.isCritical = false;
		config.isCritical = false;
	}
	if (ac5eConfig.parts.length) {
		if (roll0) typeof roll0.parts !== 'undefined' ? (roll0.parts = roll0.parts.concat(ac5eConfig.parts)) : (roll0.parts = [...ac5eConfig.parts]);
		else if (config.parts) config.parts.push(ac5eConfig.parts);
	}
	//Interim solution until system supports this
	if (!foundry.utils.isEmpty(ac5eConfig.modifiers)) {
		const { maximum, minimum } = ac5eConfig.modifiers;
		if (maximum) roll0.options.maximum = maximum;
		if (minimum) roll0.options.minimum = minimum;
	}
	if (!dialog.options?.defaultButton) dialog.options.defaultButton = 'normal';
	ac5eConfig.advantageMode = dialog.options.advantageMode;
	ac5eConfig.defaultButton = dialog.options.defaultButton;
	_getTooltip(ac5eConfig);
	return _setAC5eProperties(ac5eConfig, config, dialog, message);
}

function getAlteredTargetValueOrThreshold(initialValue = 0, ac5eValues, type) {
	const additiveValues = [];
	const staticValues = [];

	for (const item of ac5eValues) {
		if (item == null) continue;

		if (typeof item === 'number') {
			additiveValues.push(item);
			continue;
		}

		const cleaned = String(item).trim();
		if (/^-?\d+$/.test(cleaned)) {
			staticValues.push(parseInt(cleaned, 10));
			continue;
		}
	}
	const newStaticThreshold = staticValues.length > 0 ? staticValues[staticValues.length - 1] : initialValue;
	const totalModifier = additiveValues.reduce((sum, val) => sum + val, 0);
	const finalValue = newStaticThreshold + totalModifier;

	if (settings.debug) console.warn(`${Constants.MODULE_NAME_SHORT} - getAlteredTargetValueOrThreshold for ${type}:`, { initialValue, staticValues, additiveValues, finalValue });

	return finalValue;
}

/**
 * Check relative or exact disposition between two tokens.
 * @param {Token5e|TokenDocument5e} t1
 * @param {Token5e|TokenDocument5e} t2
 * @param {string|number|} check - Disposition type or constant
 * @returns {boolean}
 */
export function _dispositionCheck(t1, t2, check = 'all', mult) {
	if (!t1 || !t2) return false;
	if (check === 'all') return true;

	t1 = t1 instanceof TokenDocument ? t1 : t1.document;
	t2 = t2 instanceof TokenDocument ? t2 : t2.document;

	if (typeof check === 'number') return t2.disposition === check;

	let result;
	switch (check) {
		case 'different':
			result = t1.disposition !== t2.disposition;
			break;
		case 'opposite':
		case 'enemy':
			result = t1.disposition * t2.disposition === -1;
			break;
		case 'same':
		case 'ally':
			result = t1.disposition === t2.disposition;
			break;
		default: {
			const constVal = CONST.TOKEN_DISPOSITIONS[check.toUpperCase()];
			result = constVal !== undefined && t2.disposition === constVal;
			break;
		}
	}
	if (mult) return !result;
	return result;
}

export function _findNearby({
	token, // Token5e, TokenDocument5e, ID string, or UUID
	disposition = 'all', // 'same', 'different', 'opposite' or false === 'all'
	radius = 5, // Distance radius (default 5)
	lengthTest = false, // Number or false; if number, returns boolean test
	includeToken = false, // Include source token in results
	includeIncapacitated = false, // Include dead/incapacitated tokens, use 'only' to return ONLY incapacitated tokens
	partyMember = false, // Return only party members
}) {
	if (!canvas || !canvas.tokens?.placeables) return false;
	const tokenInstance = game.version > 13 ? foundry.canvas.placeables.Token : Token;
	if (token instanceof TokenDocument) {
		token = token.object;
	} else if (!(token instanceof tokenInstance)) {
		const resolved = fromUuidSync(token);
		token = resolved?.type === 'Token' ? resolved.object : canvas.tokens.get(token);
	}
	if (!token) return false;
	let mult;
	const foundryDispositionCONST = CONST.TOKEN_DISPOSITIONS;
	const usableUserProvidedDispositions = ['all', 'ally', 'different', 'enemy', 'friendly', 'neutral', 'opposite', 'same', 'secret'];
	if (typeof disposition === 'number') {
		if (!Object.values(foundryDispositionCONST).includes(disposition)) {
			ui.notifications.error(`AC5e disposition check error. User provided disposition: ${disposition} but Foundry available ones are -2, -1, 0, 1; returning all tokens instead`);
			disposition = 'all';
		}
	} else if (typeof disposition === 'string') {
		disposition = disposition.toLowerCase();
		if (disposition.startsWith('!')) {
			mult = true;
			disposition = disposition.slice(1);
		}
		if (!usableUserProvidedDispositions.includes(disposition)) {
			ui.notifications.error(`AC5e disposition check error. User provided disposition: "${disposition}". Use one of: "${usableUserProvidedDispositions.join('"/"')}"; returning all tokens instead`);
			disposition = 'all';
		}
	} else disposition = 'all';

	const nearbyTokens = canvas.tokens.placeables.filter((target) => {
		if (!includeToken && target === token) return false;
		if (partyMember && game.actors.party) {
			const { members: { ids } } = game.actors.party.system;
			if (!ids.has(target.actor?.id)) return false;
		}
		if (!includeIncapacitated && _hasStatuses(target.actor, ['dead', 'incapacitated'], true)) return false;
		if (includeIncapacitated === 'only' && !_hasStatuses(target.actor, ['dead', 'incapacitated'], true)) return false;
		if (!_dispositionCheck(token, target, disposition, mult)) return false;

		const distance = _getDistance(token, target);
		return distance <= radius;
	});
	if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - findNearby():`, nearbyTokens);
	if (lengthTest) return nearbyTokens.length >= lengthTest;
	return nearbyTokens;
}

export function checkNearby(token, disposition, radius, { count = false, includeToken = false, includeIncapacitated = false, partyMember = false } = {}) {
	return _findNearby({ token, disposition, radius, includeToken, includeIncapacitated, lengthTest: count, partyMember });
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

export function _autoRanged(activity, token, target, options) {
	const distanceUnit = canvas.grid.distance;
	const modernRules = settings.dnd5eModernRules;
	const isSpell = activity.isSpell;
	const isAttack = activity.type === 'attack';
	const { checkRange: midiCheckRange, nearbyFoe: midiNearbyFoe } = _activeModule('midi-qol') && MidiQOL.configSettings().optionalRulesEnabled ? MidiQOL.configSettings().optionalRules : {};
	const { actionType, item, range } = activity || {};
	if (!range || !token) return {};
	let { value: short, long, reach } = range;
	const distance = options?.distance ?? (target ? _getDistance(token, target) : undefined);
	const flags = token.actor?.flags?.[Constants.MODULE_ID];
	const spellSniper = flags?.spellSniper || _hasItem(token.actor, 'AC5E.Feats.SpellSniper');
	if (spellSniper && isSpell && isAttack && !!short) {
		// if (modernRules && short >= 10) short += 60;
		if (modernRules && short >= 2 * distanceUnit) short += 12 * distanceUnit;
		else short *= 2;
	}
	if (settings.autoRangeChecks.has('meleeOoR') && reach && ['mwak', 'msak'].includes(actionType) && !options?.attackMode?.includes('thrown')) return { inRange: distance <= reach };
	const sharpShooter = flags?.sharpShooter || _hasItem(token.actor, 'AC5E.Feats.Sharpshooter');
	if (sharpShooter && long && actionType == 'rwak') short = long;
	const crossbowExpert = flags?.crossbowExpert || _hasItem(token.actor, 'AC5E.Feats.CrossbowExpert');

	const nearbyFoe =
		!midiNearbyFoe &&
		!['mwak', 'msak'].includes(actionType) &&
		settings.autoRangeChecks.has('rangedNearbyFoes') &&
		_findNearby({ token, disposition: 'opposite', radius: distanceUnit, lengthTest: 1 }) && //hostile vs friendly disposition only
		!crossbowExpert &&
		!(modernRules && ((isSpell && spellSniper) || (!isSpell && sharpShooter)));
	let isShort, isLong, isOoR;
	const midiChecks = midiCheckRange && midiCheckRange !== 'none'; //give priority to midi checks as it will already by included in the workflow by midi.
	if (midiChecks || (!settings.autoRangeChecks.has('rangedOoR') && !settings.autoRangeChecks.has('rangedLongDisadvantage')) || (!short && !long) || distance <= short) isShort = true; //expect short and long being null for some items, and handle these cases as in short range.
	if (!isShort) {
		if (settings.autoRangeChecks.has('rangedLongDisadvantage')) isLong = distance <= long;
		if (!isLong && !settings.autoRangeChecks.has('rangedOoR')) isLong = true;
	}
	const inRange = isShort ? 'short' : isLong ? 'long' : false;
	return { inRange: !!inRange, range: inRange, distance, nearbyFoe };
}

export function _hasItem(actor, itemName) {
	return actor?.items.some((item) => item?.name.toLocaleLowerCase().includes(_localize(itemName).toLocaleLowerCase()));
}

export function _systemCheck(testVersion) {
	return foundry.utils.isNewerVersion(game.system.version, testVersion);
}

export function _getTooltip(ac5eConfig = {}) {
	const { hookType, subject, opponent, alteredCritThreshold, alteredFumbleThreshold, alteredTargetADC, initialTargetADC, tooltipObj } = ac5eConfig;
	let tooltip;
	if (tooltipObj?.[hookType]) return tooltipObj[hookType];
	else tooltip = '<div class="ac5e-tooltip-content">';
	if (settings.showNameTooltips) tooltip += '<div style="text-align:center;"><strong>Automated Conditions 5e</strong></div><hr>';
	const addTooltip = (condition, text) => {
		if (condition) {
			if (tooltip.includes('span')) tooltip += '<br>';
			tooltip += text;
		}
	};
	if (subject) {
		const subjectAdvantageModes = [...(subject?.advantage ?? []), ...([...subject?.advantageNames] ?? [])];
		const subjectDisadvantageModes = [...(subject?.disadvantage ?? []), ...([...subject?.disadvantageNames] ?? [])];
		addTooltip(subject.critical.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Critical')}: ${subject.critical.join(', ')}</span>`);
		addTooltip(subject.noCritical.length, `<span style="display: block; text-align: left;">${_localize('AC5E.NoCritical')}: ${subject.noCritical.join(', ')}</span>`);
		addTooltip(subjectAdvantageModes.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Advantage')}: ${subjectAdvantageModes.join(', ')}</span>`);
		addTooltip(subject.midiAdvantage.length, `<span style="display: block; text-align: left;">MidiQOL ${_localize('DND5E.Advantage')}: ${subject.midiAdvantage.join(', ')}</span>`);
		addTooltip(subject.midiDisadvantage.length, `<span style="display: block; text-align: left;">MidiQOL ${_localize('DND5E.Disadvantage')}: ${subject.midiDisadvantage.join(', ')}</span>`);
		addTooltip(subject.noAdvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.NoAdvantage')}: ${subject.noAdvantage.join(', ')}</span>`);
		addTooltip(subject.fail.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Fail')}: ${subject.fail.join(', ')}</span>`);
		addTooltip(subject.fumble.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Fumble')}: ${subject.fumble.join(', ')}</span>`);
		addTooltip(subjectDisadvantageModes.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Disadvantage')}: ${subjectDisadvantageModes.join(', ')}</span>`);
		addTooltip(subject.noDisadvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.NoDisadvantage')}: ${subject.noDisadvantage.join(', ')}</span>`);
		addTooltip(subject.success.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Success')}: ${subject.success.join(', ')}</span>`);
		addTooltip(subject.bonus.length, `<span style="display: block; text-align: left;">${_localize('AC5E.Bonus')}: ${subject.bonus.join(', ')}</span>`);
		addTooltip(subject.modifiers.length, `<span style="display: block; text-align: left;">${_localize('DND5E.Modifier')}: ${subject.modifiers.join(', ')}</span>`);
		addTooltip(subject.extraDice.length, `<span style="display: block; text-align: left;">${_localize('AC5E.ExtraDice')}: ${subject.extraDice.join(', ')}</span>`);
	}
	if (opponent) {
		const opponentAdvantageModes = [...(opponent?.advantage ?? []), ...([...opponent?.advantageNames] ?? [])];
		const opponentDisadvantageModes = [...(opponent?.disadvantage ?? []), ...([...opponent?.disadvantageNames] ?? [])];
		addTooltip(opponent.critical.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsCriticalAbbreviated')}: ${opponent.critical.join(', ')}</span>`);
		addTooltip(opponent.noCritical.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsNoCritical')}: ${opponent.noCritical.join(', ')}</span>`);
		addTooltip(opponent.fail.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsFail')}: ${opponent.fail.join(', ')}</span>`);
		addTooltip(opponentAdvantageModes.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsAdvantageAbbreviated')}: ${opponentAdvantageModes.join(', ')}</span>`);
		addTooltip(opponent.noAdvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsNoAdvantage')}: ${opponent.noAdvantage.join(', ')}</span>`);
		addTooltip(opponentDisadvantageModes.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsDisadvantageAbbreviated')}: ${opponentDisadvantageModes.join(', ')}</span>`);
		addTooltip(opponent.noDisadvantage.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsNoDisadvantage')}: ${opponent.noDisadvantage.join(', ')}</span>`);
		addTooltip(opponent.success.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsSuccess')}: ${opponent.success.join(', ')}</span>`);
		addTooltip(opponent.fumble.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsFumble')}: ${opponent.fumble.join(', ')}</span>`);
		addTooltip(opponent.bonus.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsBonus')}: ${opponent.bonus.join(', ')}</span>`);
		addTooltip(opponent.modifiers.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsModifier')}: ${opponent.modifiers.join(', ')}</span>`);
		addTooltip(opponent.extraDice.length, `<span style="display: block; text-align: left;">${_localize('AC5E.TargetGrantsExtraDice')}: ${opponent.extraDice.join(', ')}</span>`);
	}
	//critical threshold
	if (subject?.criticalThreshold.length || opponent?.criticalThreshold.length) {
		const combinedArray = [...(subject?.criticalThreshold ?? []), ...(opponent?.criticalThreshold ?? [])];
		const translationString = game.i18n.translations.DND5E.Critical + ' ' + game.i18n.translations.DND5E.Threshold + ' ' + alteredCritThreshold;
		addTooltip(true, `<span style="display: block; text-align: left;">${_localize(translationString)}: ${combinedArray.join(', ')}</span>`);
	}
	if (subject?.fumbleThreshold.length || opponent?.fumbleThreshold.length) {
		const combinedArray = [...(subject?.fumbleThreshold ?? []), ...(opponent?.fumbleThreshold ?? [])];
		const translationString = game.i18n.translations.AC5E.Fumble + ' ' + game.i18n.translations.DND5E.Threshold + ' ' + alteredFumbleThreshold;
		addTooltip(true, `<span style="display: block; text-align: left;">${_localize(translationString)}: ${combinedArray.join(', ')}</span>`);
	}
	if (subject?.targetADC.length || opponent?.targetADC.length) {
		const combinedArray = [...(subject?.targetADC ?? []), ...(opponent?.targetADC ?? [])];
		let translationString = _localize(hookType === 'attack' ? 'AC5E.ModifyAC' : 'AC5E.ModifyDC');
		translationString += ` ${alteredTargetADC} (${initialTargetADC})`;
		addTooltip(true, `<span style="display: block; text-align: left;">${translationString}: ${combinedArray.join(', ')}</span>`);
	}
	tooltip += tooltip.includes('span') ? '</div>' : `<div style="text-align:center;"><strong>${_localize('AC5E.NoChanges')}</strong></div></div>`;
	ac5eConfig.tooltipObj ||= {};
	ac5eConfig.tooltipObj[hookType] = tooltip;
	return tooltip;
}

export function _getConfig(config, dialog, hookType, tokenId, targetId, options = {}, reEval = false) {
	// foundry.utils.mergeObject(options, { spellLevel: dialog?.data?.flags?.use?.spellLevel, attackMode: config?.attackMode });
	if (settings.debug) console.warn('AC5E._getConfig:', { config });
	const existingAC5e = config?.[Constants.MODULE_ID]; //to-do: any need for that one?
	// if (!foundry.utils.isEmpty(existingAC5e) && !reEval) foundry.utils.mergeObject(options, existingAC5e.options);
	if (settings.debug) console.error('AC5E._getConfig', { mergedOptions: options });
	const areKeysPressed = game.system.utils.areKeysPressed;
	const token = canvas.tokens.get(tokenId);
	const actor = token?.actor;
	const ac5eConfig = {
		hookType,
		tokenId,
		targetId,
		isOwner: token?.document.isOwner,
		hasPlayerOwner: token?.document.hasPlayerOwner, //check again if it needs token.actor.hasPlayerOwner; what happens for Wild Shape?
		ownership: actor?.ownership,
		subject: {
			advantage: [],
			advantageNames: new Set(),
			midiAdvantage: [],
			noAdvantage: [],
			disadvantage: [],
			disadvantageNames: new Set(),
			midiDisadvantage: [],
			noDisadvantage: [],
			fail: [],
			bonus: [],
			critical: [],
			noCritical: [],
			success: [],
			fumble: [],
			modifiers: [],
			criticalThreshold: [],
			fumbleThreshold: [],
			targetADC: [],
			extraDice: [],
		},
		opponent: {
			advantage: [],
			advantageNames: new Set(),
			noAdvantage: [],
			disadvantage: [],
			disadvantageNames: new Set(),
			noDisadvantage: [],
			fail: [],
			bonus: [],
			critical: [],
			noCritical: [],
			success: [],
			fumble: [],
			modifiers: [],
			criticalThreshold: [],
			fumbleThreshold: [],
			targetADC: [],
			extraDice: [],
		},
		options,
		parts: [],
		targetADC: [],
		extraDice: [],
		threshold: [],
		fumbleThreshold: [],
		damageModifiers: [],
		modifiers: {},
		preAC5eConfig: {
			// fastForward: hookType !== 'damage' ? areKeysPressed(config.event, 'skipDialogNormal') : hookType === 'damage' ? areKeysPressed(config.event, 'skipDialogNormal') || areKeysPressed(config.event, 'skipDialogDisadvantage') : false,
			skipDialogAdvantage: areKeysPressed(config.event, 'skipDialogAdvantage'),
			skipDialogDisadvantage: areKeysPressed(config.event, 'skipDialogDisadvantage'),
			skipDialogNormal: areKeysPressed(config.event, 'skipDialogNormal'),
		},
		returnEarly: false,
	};
	if (reEval) ac5eConfig.reEval = reEval;
	const wasCritical = config.isCritical || ac5eConfig.preAC5eConfig.midiOptions?.isCritical || ac5eConfig.preAC5eConfig.critKey;
	ac5eConfig.preAC5eConfig.wasCritical = wasCritical;
	if (options.skill || options.tool) ac5eConfig.title = dialog?.options?.window?.title;
	const midiRoller = _activeModule('midi-qol');
	const rsrRoller = _activeModule('ready-set-roll-5e');
	const roller = midiRoller ? 'MidiQOL' : rsrRoller ? 'RSR' : 'Core';
	if (midiRoller) {
		const midiOptions = config.midiOptions ?? {};
		const { workflow, ...safeMidiOptions } = midiOptions; // strips workflow before any cloning; Issue https://github.com/thatlonelybugbear/automated-conditions-5e/issues/696
		ac5eConfig.preAC5eConfig.midiOptions = foundry.utils.duplicate(safeMidiOptions); //otherwise Error: Cannot set property isTrusted of #<PointerEvent> which has only a getter
	} 
	ac5eConfig.roller = roller;
	ac5eConfig.preAC5eConfig.adv = config.advantage;
	ac5eConfig.preAC5eConfig.dis = config.disadvantage;

	const { skipDialogAdvantage, skipDialogDisadvantage, skipDialogNormal } = ac5eConfig.preAC5eConfig;

	const returnEarly = skipDialogNormal && (skipDialogAdvantage || skipDialogDisadvantage);

	if (returnEarly) {
		ac5eConfig.returnEarly = true;
		if (skipDialogAdvantage) {
			if (hookType === 'damage') {
				config.isCritical = true;
				ac5eConfig.subject.critical.push(_localize('AC5E.OverrideCritical'));
			} else {
				config.advantage = true;
				ac5eConfig.subject.advantage.push(_localize('AC5E.OverrideAdvantage'));
				config.disadvantage = false;
			}
		}
		if (skipDialogDisadvantage) {
			if (hookType === 'damage') {
				config.isCritical = false;
				ac5eConfig.subject.noCritical.push(_localize('AC5E.OverrideNoCritical'));
			} else {
				config.disadvantage = true;
				ac5eConfig.subject.disadvantage.push(_localize('AC5E.OverrideDisadvantage'));
				config.advantage = false;
			}
		}
		if (settings.debug) console.warn('AC5E_getConfig returning early', { ac5eConfig });
		return ac5eConfig;
	} else {
		if (skipDialogAdvantage) {
			if (hookType === 'damage') ac5eConfig.subject.critical.push(_localize('AC5E.CriticalKeypress'));
			else ac5eConfig.subject.advantage.push(_localize('AC5E.AdvantageKeypress'));
		}
		if (skipDialogDisadvantage) {
			if (hookType === 'damage') ac5eConfig.subject.noCritical.push(_localize('AC5E.NoCriticalKeypress'));
			else ac5eConfig.subject.disadvantage.push(_localize('AC5E.DisadvantageKeypress'));
		}
	}

	// const actorSystemRollMode = [];
	const { adv, dis } = getSystemRollConfig({ actor, options, hookType, ac5eConfig });

	if (!options.preConfigInitiative) {
		if (hookType !== 'damage' && !skipDialogAdvantage && !adv && ((config.advantage && !midiRoller) || ac5eConfig.preAC5eConfig.midiOptions?.advantage || config?.workflow?.attackAdvAttribution?.size)) {
			if (midiRoller) {
				const attribution = Array.from(config.workflow?.attackAdvAttribution || {})
					?.filter((attr) => attr.includes('ADV:'))
					.map((attr) => {
						if (attr.includes('.')) return attr.slice(attr.indexOf(' ') + 1).trim(); //@to-do: doublecheck if midi always uses a whitespace btw the type of Advantage and the effect name
						else return attr.replace('ADV:', '').trim();
					});
				ac5eConfig.subject.advantage.push(...attribution);
			} else ac5eConfig.subject.advantage.push(`${roller} ${_localize('AC5E.Flags')}`);
		}
		if (hookType !== 'damage' && !skipDialogAdvantage && !dis && ((config.disadvantage && !midiRoller) || ac5eConfig.preAC5eConfig.midiOptions?.disadvantage || config?.workflow?.attackAdvAttribution?.size)) {
			if (midiRoller) {
				const attribution = Array.from(config.workflow?.attackAdvAttribution || {})
					?.filter?.((attr) => attr.includes('DIS:'))
					.map((attr) => {
						if (attr.includes('.')) return attr.slice(attr.indexOf(' ') + 1).trim(); //@to-do: doublecheck if midi always uses a whitespace btw the type of Advantage and the effect name
						else return attr.replace('DIS:', '').trim();
					});
				ac5eConfig.subject.disadvantage.push(...attribution);
			} else ac5eConfig.subject.disadvantage.push(`${roller} ${_localize('AC5E.Flags')}`);
		}
		if (!skipDialogAdvantage && (config.isCritical || ac5eConfig.preAC5eConfig.midiOptions?.isCritical)) ac5eConfig.subject.critical.push(`${roller} ${_localize('AC5E.Flags')}`);
	}

	if (settings.debug) console.warn('AC5E_getConfig', { ac5eConfig });
	return ac5eConfig;
}

function collectRollMode({ actor, mode, max, min, hookType, typeLabel, ac5eConfig, systemMode, type, modeCounts }) {
	const capitalizeHook = hookType.capitalize();
	if (mode > 0) {
		if (modeCounts?.override > 0) {
			ac5eConfig.subject.forcedAdvantage = [_localize('AC5E.ForcedAdvantage')];
			systemMode.override = modeCounts.override;
		} else if (modeCounts?.disadvantages.suppressed) {
			ac5eConfig.subject.noDisadvantage = [_localize('AC5E.NoDisadvantage')];
			systemMode.suppressed = 'noDis';
		} else {
			systemMode.adv++;
			if (!actor.hasConditionEffect(`ability${capitalizeHook}Advantage`)) ac5eConfig.subject.advantageNames.add(_localize(typeLabel));
			if (type === 'init' && !actor.hasConditionEffect('initiativeAdvantage')) ac5eConfig.subject.advantageNames.add(_localize(typeLabel));
		}
	}
	if (mode < 0) {
		if (modeCounts?.override < 0) {
			ac5eConfig.subject.forcedDisadvantage = [_localize('AC5E.ForcedDisadvantage')];
			systemMode.override = modeCounts.override;
		} else if (modeCounts?.advantages.suppressed) {
			ac5eConfig.subject.noAdvantage = [_localize('AC5E.NoAdvantage')];
			systemMode.suppressed = 'noAdv';
		} else {
			systemMode.dis++;
			//Do not add System Mode for stealth disadvantage; already added by name
			if (!actor.hasConditionEffect(`ability${capitalizeHook}Disadvantage`) && ac5eConfig?.options?.skill !== 'ste') ac5eConfig.subject.disadvantageNames.add(_localize(typeLabel));
			if (type === 'init' && !actor.hasConditionEffect('initiativeDisadvantage')) ac5eConfig.subject.disadvantageNames.add(_localize(typeLabel));
		}
	}
	if (max) ac5eConfig.subject.modifiers.push(`${_localize('DND5E.ROLL.Range.Maximum')} (${max})`);
	if (min) ac5eConfig.subject.modifiers.push(`${_localize('DND5E.ROLL.Range.Minimum')} (${min})`);
	return systemMode;
}

function getSystemRollConfig({ actor, options, hookType, ac5eConfig }) {
	if (!actor || hookType === 'damage' || hookType === 'use') return {};
	const systemMode = { adv: 0, dis: 0 };
	const autoArmorChecks = _autoArmor(actor);
	const { ability, skill, tool } = options || {};
	if (hookType === 'check') {
		if (skill) {
			if (skill === 'ste' && autoArmorChecks.hasStealthDisadvantage) ac5eConfig.subject.disadvantageNames.add(`${_localize(autoArmorChecks.hasStealthDisadvantage)} (${_localize('ItemEquipmentStealthDisav')})`);
			const { mode, max, min, modeCounts } = getActorSkillRollObject({ actor, skill }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
		}
		if (tool) {
			const { mode, max, min, modeCounts } = getActorToolRollObject({ actor, tool }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
		}
		if (options.isInitiative) {
			const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'init' }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, type: 'init', modeCounts });
		}
	}
	if (ability && ['check', 'save'].includes(hookType)) {
		if (options.isConcentration) {
			if (_hasItem(actor, _localize('AC5E.WarCaster'))) {
				ac5eConfig.subject.advantage.push(_localize('AC5E.WarCaster'));
			}
			const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'concentration' }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
		} else {
			const { mode, max, min, modeCounts } = getActorAbilityRollObject({ actor, ability, hookType }) || {};
			collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
		}
	}
	if (options.isDeathSave && hookType === 'save') {
		const { mode, max, min, modeCounts } = getConcOrDeathOrInitRollObject({ actor, type: 'death' }) || {};
		collectRollMode({ actor, mode, max, min, hookType, typeLabel: 'AC5E.SystemMode', ac5eConfig, systemMode, modeCounts });
	}
	if (autoArmorChecks.notProficient && ['dex', 'str'].includes(ability)) {
		ac5eConfig.subject.disadvantageNames.add(`${_localize(autoArmorChecks.notProficient)} (${_localize('NotProficient')})`);
		systemMode.dis++;
	}
	if (_autoEncumbrance(actor, ability)) {
		ac5eConfig.subject.disadvantage.push(_i18nConditions('HeavilyEncumbered'));
		systemMode.dis++;
	}
	if (settings.debug) console.warn('AC5E_getSystemRollConfig', { ac5eConfig });
	return systemMode;
}

export function getConcOrDeathOrInitRollObject({ actor, type }) {
	return actor?.system?.attributes?.[type]?.roll || {};
}

export function getActorAbilityRollObject({ actor, hookType, ability }) {
	return actor?.system?.abilities?.[ability]?.[hookType]?.roll;
}

export function getActorSkillRollObject({ actor, skill }) {
	return actor?.system?.skills?.[skill]?.roll;
}

export function getActorToolRollObject({ actor, tool }) {
	return actor?.system?.tools?.[tool]?.roll;
}

export function _setAC5eProperties(ac5eConfig, config, dialog, message) {
	if (settings.debug) console.warn('AC5e helpers._setAC5eProperties', { ac5eConfig, config, dialog, message });

	if (ac5eConfig.hookType === 'use') {
		foundry.utils.setProperty(message.data.flags, Constants.MODULE_ID, ac5eConfig.options);
		if (settings.debug) console.warn('AC5e post helpers._setAC5eProperties for preActivityUse', { ac5eConfig, config, dialog, message });
		return;
	}
	ac5eConfig.subject.advantageNames = [...ac5eConfig.subject.advantageNames];
	ac5eConfig.subject.disadvantageNames = [...ac5eConfig.subject.disadvantageNames];
	ac5eConfig.opponent.advantageNames = [...ac5eConfig.opponent.advantageNames];
	ac5eConfig.opponent.disadvantageNames = [...ac5eConfig.opponent.disadvantageNames];

	const ac5eConfigDialog = { [Constants.MODULE_ID]: ac5eConfig };
	if (dialog?.options) dialog.options.classes = dialog.options.classes?.concat('ac5e') ?? ['ac5e'];
	const ac5eConfigMessage = { [Constants.MODULE_ID]: { tooltipObj: ac5eConfig.tooltipObj, hookType: ac5eConfig.hookType } };

	if (config?.rolls?.[0]?.options) foundry.utils.mergeObject(config.rolls[0].options, ac5eConfigDialog);
	else if (config) foundry.utils.mergeObject(config, ac5eConfigDialog);
	if (message?.data?.flags) foundry.utils.mergeObject(message.data.flags, ac5eConfigMessage);
	else foundry.utils.setProperty(message, 'data.flags', ac5eConfigMessage);
	if (settings.debug) console.warn('AC5e post helpers._setAC5eProperties', { ac5eConfig, config, dialog, message });
}

export function _activeModule(moduleID) {
	return game.modules.get(moduleID)?.active;
}

export function _canSee(source, target, status) {
	if (!source || !target) {
		if (settings.debug) console.warn('AC5e: No valid tokens for canSee check');
		return false;
	}
	if (source === target) {
		if (settings.debug) console.warn('AC5e: Source and target are the same');
		return true;
	}

	if (_activeModule('midi-qol')) return MidiQOL.canSee(source, target);

	const hasSight = source.document.sight.enabled; //source.hasSight
	const hasVision = source.vision; //can be undefined if the source isn't controlled at the time of the tests; can be the target of an attack etc, so won't be selected in this case or rolling without a token controlled.
	if (!hasSight || !hasVision) {
		_initializeVision(source);
		console.warn(`${Constants.MODULE_NAME_SHORT}._canSee(): Initializing vision as the source token has no visionSource available; `, { source: source?.id, target: target?.id, visionSourceId: source.sourceId });
	}

	const NON_SIGHT_CONSIDERED_SIGHT = ['blindsight'];
	const detectionModes = CONFIG.Canvas.detectionModes;
	const DETECTION_TYPES = { SIGHT: 0, SOUND: 1, MOVE: 2, OTHER: 3 };
	const { BASIC_MODE_ID } = game.version > '13' ? foundry.canvas.perception.DetectionMode : new DetectionMode();
	const sightDetectionModes = Object.keys(detectionModes).filter((d) => detectionModes[d].type === DETECTION_TYPES.SIGHT || NON_SIGHT_CONSIDERED_SIGHT.includes(d));

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
		elevation: target?.document.elevation ?? 0,
		los: new Map(),
	}));
	const config = { tests, object: target };

	const tokenDetectionModes = normalizeDetectionModes(source.detectionModes);
	let validModes = new Set();

	const sourceBlinded = source.actor?.statuses.has('blinded');
	const targetInvisible = target.actor?.statuses.has('invisible');
	const targetEthereal = target.actor?.statuses.has('ethereal');
	if (!status && !sourceBlinded && !targetInvisible && !targetEthereal) {
		validModes = new Set(sightDetectionModes);
		const lightSources = canvas?.effects?.lightSources;
		for (const lightSource of lightSources ?? []) {
			if (!lightSource.active || lightSource.data.disabled) continue;
			const result = lightSource.testVisibility?.(config);
			if (result === true) matchedModes.add(detectionModes.lightPerception?.id);
		}
	} else if (status === 'blinded' || sourceBlinded) {
		validModes = new Set(['blindsight', 'seeAll' /*'feelTremor'*/]);
	} else if (status === 'invisible' || status === 'ethereal' || targetInvisible || targetEthereal) {
		validModes = new Set(['seeAll', 'seeInvisibility']);
	}
	for (const detectionMode of tokenDetectionModes) {
		if (!detectionMode.enabled || !detectionMode.range) continue;
		if (!validModes.has(detectionMode.id)) continue;
		const mode = detectionModes[detectionMode.id];
		const result = mode ? mode.testVisibility(source.vision, detectionMode, config) : false;
		if (result === true) matchedModes.add(mode.id);
	}
	if (settings.debug) console.warn(`${Constants.MODULE_NAME_SHORT}._canSee()`, { source: source?.id, target: target?.id, result: matchedModes, visionInitialized: !hasSight, sourceId: source.sourceId });
	if (!hasSight) canvas.effects?.visionSources.delete(source.sourceId); //remove initialized vision source only if the source doesn't have sight enabled in the first place!
	return Array.from(matchedModes).length > 0;
}

function normalizeDetectionModes(modes) {
	if (!modes) return [];

	if (!Array.isArray(modes)) {
		return Object.entries(modes).map(([id, data]) => ({
			id,
			...data
		}));
	}
	return modes;
}

function _initializeVision(token) {
	token.document.sight.enabled = true;
	token.document._prepareDetectionModes();
	const sourceId = token.sourceId;
	token.vision = new CONFIG.Canvas.visionSourceClass({ sourceId, object: token });

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
		// preview: !!token._original,
		color: token.document.sight.color?.toNearest(),
		blinded: token.document.hasStatusEffect(CONFIG.specialStatusEffects.BLIND),
	});
	if (!token.vision.los) {
		token.vision.shape = token.vision._createRestrictedPolygon();
		token.vision.los = token.vision.shape;
	}
	if (token.vision.visionMode) token.vision.visionMode.animated = false;
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
	const token = actor.token?.object || actor.getActiveTokens()[0];
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

export function _hasValidTargets(activity, targetCount, setting) {
	//will return true if the Item has an attack roll and targets are correctly set and selected, or false otherwise.
	if (!activity?.parent?.hasAttack) return true;
	const { affects, template } = activity?.target || {};
	const requiresTargeting = affects?.type || (!affects?.type && !template?.type);
	// const override = game.keyboard?.downKeys?.has?.('KeyU');
	const invalidTargetCount = requiresTargeting && targetCount !== 1;
	if (invalidTargetCount /* && !override*/) {
		sizeWarnings(targetCount, setting);
		return false;
	}
	return true;
}

function sizeWarnings(targetCount, setting) {
	//targetCount, by this point, can be either false or >1 so no need for other checks
	//setting 'source', 'enforce', 'warn' and we need to notify for cancelled rolls only if 'warn'. The rest are logged in console only.
	const keySuffix = setting === 'source' ? 'Source' : 'Enforce';
	const keyPrefix = targetCount ? 'MultipleTargets' : 'NoTargets';
	const translationKey = `AC5E.Targeting.${keyPrefix}Attack.${keySuffix}`;
	const message = _localize(translationKey);

	if (setting === 'warn') ui.notifications.warn(message);
	else console.warn(message);
}

export function _raceOrType(actor, dataType = 'race') {
	const systemData = actor?.system;
	if (!systemData?.details?.type) return {}; //needed for 5.1.x and some type of actors that might be on the canvas?!
	let data;
	if (actor.type === 'character' || actor.type === 'npc') {
		data = foundry.utils.duplicate(systemData.details.type); //{value, subtype, swarm, custom}
		data.race = systemData.details.race?.identifier ?? data.value; //{value, subtype, swarm, custom, race: raceItem.identifier ?? value}
		data.type = actor.type;
	} else if (actor.type === 'group') data = { type: 'group', value: systemData.type.value };
	else if (actor.type === 'vehicle') data = { type: 'vehicle', value: systemData.vehicleType };
	if (dataType === 'all') return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, typeof v === 'string' ? v.toLocaleLowerCase() : v]));
	else return data[dataType]?.toLocaleLowerCase();
}

export function _generateAC5eFlags() {
	const moduleFlagScope = `flags.${Constants.MODULE_ID}`;
	const moduleFlags = [`${moduleFlagScope}.crossbowExpert`, `${moduleFlagScope}.sharpShooter`, `${moduleFlagScope}.attack.criticalThreshold`, `${moduleFlagScope}.grants.attack.criticalThreshold`, `${moduleFlagScope}.aura.attack.criticalThreshold`, `${moduleFlagScope}.attack.fumbleThreshold`, `${moduleFlagScope}.grants.attack.fumbleThreshold`, `${moduleFlagScope}.aura.attack.fumbleThreshold`, `${moduleFlagScope}.damage.extraDice`, `${moduleFlagScope}.grants.damage.extraDice`, `${moduleFlagScope}.aura.damage.extraDice`, `${moduleFlagScope}.modifyAC`, `${moduleFlagScope}.grants.modifyAC`, `${moduleFlagScope}.aura.modifyAC`];
	// const actionTypes = ["ACTIONTYPE"];//["attack", "damage", "check", "concentration", "death", "initiative", "save", "skill", "tool"];
	const modes = ['advantage', 'bonus', 'critical', 'disadvantage', 'fail', 'fumble', 'modifier', 'modifyDC', 'noAdvantage', 'noCritical', 'noDisadvantage', 'success'];
	const types = ['source', 'grants', 'aura'];
	for (const type of types) {
		for (const mode of modes) {
			if (type === 'source') moduleFlags.push(`${moduleFlagScope}.ACTIONTYPE.${mode}`);
			else moduleFlags.push(`${moduleFlagScope}.${type}.ACTIONTYPE.${mode}`);
		}
	}
	return moduleFlags;
}

let tempDiv = null;

export function _getValidColor(color, fallback, user) {
	if (!color) return fallback;
	const lower = color.trim().toLowerCase();

	if (['false', 'none', 'null', '0'].includes(lower)) return lower;
	else if (['user', 'game.user.color'].includes(lower)) return user?.color?.css || fallback;
	else if (lower === 'default') return fallback;

	// Accept valid hex format directly
	if (/^#[0-9a-f]{6}$/i.test(lower)) return lower;

	// Use hidden div to resolve computed color
	if (!tempDiv) {
		tempDiv = document.createElement('div');
		tempDiv.style.display = 'none';
		document.body.appendChild(tempDiv);
	}

	tempDiv.style.color = color;
	const computedColor = window.getComputedStyle(tempDiv).color;

	const match = computedColor.match(/\d+/g);
	if (match && match.length >= 3) {
		return `#${match
			.slice(0, 3)
			.map((n) => parseInt(n).toString(16).padStart(2, '0'))
			.join('')}`;
	}

	return fallback;
}

/**
 * Safely evaluate a string expression within a controlled sandbox.
 * Supports:
 *  - mode="condition": returns boolean
 *  - mode="formula": returns Foundry roll formula string
 *  - Resolve actor contexts: rollingActor, opponentActor, targetActor, auraActor, effectOriginActor
 *  - Math.* and shorthand helpers (min, max, floor, etc.)
 *  - Fails safely to false if evaluation breaks
 */
export function _ac5eSafeEval({ expression, sandbox = {}, mode = 'condition', debug }) {
	if (!expression || typeof expression !== 'string') return undefined;
	if (expression.includes('game') || expression.includes('canvas')) throw new Error(`Roll.safeEval expression cannot contain game/canvas.`);

	const debugLog = settings?.debug || ac5e?.debugEvaluations ? console.warn : console.debug;
	debug.log = debugLog;

	if (mode === 'condition') return evaluateCondition(expression, sandbox, debug);
	if (mode === 'formula') return prepareRollFormula(expression, sandbox, debug);
	throw new Error(`Invalid mode for _ac5eSafeEval: ${mode}`);
}

export function _ac5eActorRollData(token) {
	const actor = token?.actor;
	if (!(actor instanceof CONFIG.Actor.documentClass)) return {};
	const actorData = actor.getRollData();
	actorData.currencyWeight = actor.system.currencyWeight;
	actorData.effects = actor.appliedEffects;
	actorData.equippedItems = { names: [], identifiers: [] };
	actorData.items = actor.items?.map((i) => {
		if (i.system?.equipped) {
			actorData.equippedItems.names.push(i.name);
			actorData.equippedItems.identifiers.push(i.identifier);
		}
		return { name: i.name, uuid: i.uuid, id: i.id, identifier: i.identifier, type: i.type, uses: i.system?.uses || {}, equipped: i.system?.equipped };
	});
	actorData.level = actorData.details?.level || actorData.details?.cr;
	actorData.levelCr = actorData.level;
	actorData.hasArmor = !!actorData.attributes?.ac?.equippedArmor;
	if (actorData.hasArmor) actorData[`hasArmor${actorData.attributes.ac.equippedArmor.system.type.value.capitalize()}`] = true;
	actorData.hasShield = !!actorData.attributes?.ac?.equippedShield;
	actorData.type = actor.type;
	actorData.canMove = Object.values(actor.system?.attributes?.movement || {}).some((v) => typeof v === 'number' && v);
	actorData.creatureType = Array.from(new Set(Object.values(_raceOrType(actor, 'all')).filter(Boolean)));
	actorData.token = token;
	actorData.tokenSize = token.document.width * token.document.height;
	actorData.tokenElevation = token.document.elevation;
	actorData.tokenSenses = token.document.detectionModes;
	actorData.tokenUuid = token.document.uuid;
	actorData.uuid = token.actor.uuid;
	const active = game.combat?.active;
	const currentCombatant = active ? game.combat.combatant?.tokenId : null;
	actorData.isTurn = active && currentCombatant === token.id;
	actorData.combatTurn = active ? game.combat.turns.findIndex((combatant) => combatant.tokenId === token.id) : undefined;
	actorData.movementLastSegment = active && token.document.movementHistory?.filter((m) => m.movementId === token.document.movementHistory.at(-1).movementId).reduce((acc, c) => (acc += c.cost ?? 0), 0);
	actorData.movementTurn = active && token.document.movementHistory?.reduce((acc, c) => (acc += c.cost ?? 0), 0);
	return actorData;
}

export function _createEvaluationSandbox({ subjectToken, opponentToken, options }) {
	const sandbox = {
		...lazySandbox,
		_flatConstants: { ...lazySandbox._flatConstants }  // shallow copy is enough for boolean flags
	};
	const { ability, activity, distance, skill, tool } = options;
	const item = activity?.item;
	sandbox.rollingActor = {};
	sandbox.opponentActor = {};

	sandbox.rollingActor = _ac5eActorRollData(subjectToken) || {};
	sandbox.tokenId = subjectToken?.id;
	sandbox.tokenUuid = subjectToken?.document?.uuid;
	sandbox.actorId = subjectToken?.actor?.id;
	sandbox.actorUuid = subjectToken?.actor?.uuid;
	sandbox.canMove = sandbox.rollingActor?.canMove;
	sandbox.canSee = _canSee(subjectToken, opponentToken);

	sandbox.opponentActor = _ac5eActorRollData(opponentToken) || {};
	sandbox.opponentAC = opponentToken?.actor?.system?.attributes?.ac?.value;
	sandbox.opponentId = opponentToken?.id;
	sandbox.opponentUuid = opponentToken?.document?.uuid;
	sandbox.opponentActorId = opponentToken?.actor?.id;
	sandbox.opponentActorUuid = opponentToken?.actor?.uuid;
	sandbox.isSeen = _canSee(opponentToken, subjectToken);
	/* backwards compatibility */
	sandbox.targetActor = sandbox.opponentActor;
	sandbox.targetId = opponentToken?.id;
	/* end of backwards compatibility */

	const activityData = activity?.getRollData?.()?.activity || {};
	sandbox.activity = activityData;
	sandbox.ammunition = options.ammunition;
	sandbox.ammunitionName = options.ammunition?.name;
	sandbox.consumptionItemName = {};
	sandbox.consumptionItemIdentifier = {};
	activity?.consumption?.targets?.forEach(({ target }) => {
		if (target) {
			const targetItem = activity?.actor?.items.get(target);
			if (targetItem) {
				sandbox.consumptionItemName[targetItem.name] = true;
				sandbox.consumptionItemIdentifier[targetItem.identifier] = true;
			}
		}
	});
	sandbox.activity.ability = activity?.ability;
	sandbox.riderStatuses = options.riderStatuses || _getActivityEffectsStatusRiders(activity) || {};
	sandbox.hasAttack = !foundry.utils.isEmpty(activity?.attack);
	sandbox.hasDamage = !foundry.utils.isEmpty(activity?.damage?.parts);
	sandbox.hasHealing = !foundry.utils.isEmpty(activity?.healing);
	sandbox.hasSave = !foundry.utils.isEmpty(activity?.save);
	sandbox.hasCheck = !foundry.utils.isEmpty(activity?.check);
	sandbox.isSpell = activity?.isSpell;
	sandbox.isScaledScroll = activity?.isScaledScroll;
	sandbox.requiresSpellSlot = activity?.requiresSpellSlot;
	sandbox.spellcastingAbility = activity?.spellcastingAbility;
	sandbox.messageFlags = activity?.messageFlags;
	sandbox.activityName = activity ? { [activity.name]: true } : {};
	const actionType = activity?.getActionType(options.attackMode);
	sandbox.actionType = actionType ? { [actionType]: true } : {};
	sandbox.attackMode = options.attackMode ? { [options.attackMode]: true } : {};
	if (options.attackMode) sandbox._flatConstants[options.attackMode] = true; //backwards compatibility for attack mode directly in the sandbox
	sandbox.mastery = options.mastery ? { [options.mastery]: true } : {};
	sandbox.damageTypes = options.damageTypes;
	sandbox.defaultDamageType = options.defaultDamageType;
	if (!foundry.utils.isEmpty(options.damageTypes)) foundry.utils.mergeObject(sandbox._flatConstants, options.damageTypes); //backwards compatibility for damagetypes directly in the sandbox
	sandbox.activity.damageTypes = options.damageTypes;
	sandbox.activity.defaultDamageType = options.defaultDamageType;
	sandbox.activity.attackMode = options.attackMode;
	sandbox.activity.mastery = options.mastery;
	if (actionType) {
		sandbox._flatConstants[actionType] = true;
		sandbox.activity.actionType = actionType;
	}
	if (activity?.attack?.type) {
		sandbox._flatConstants[activity.attack.type.value] = true;
		sandbox._flatConstants[activity.attack.type.classification] = true;
	}
	if (!!activityData.activation?.type) sandbox._flatConstants[activityData.activation.type] = true;
	if (activityData?.type) sandbox._flatConstants[activityData.type] = true;

	//item data
	const itemData = item?.getRollData?.()?.item || {};
	sandbox.item = itemData;
	sandbox.item.uuid = item?.uuid;
	sandbox.item.id = item?.id;
	sandbox.itemType = item?.type;
	sandbox.isCantrip = item?.labels?.level === 'Cantrip' ?? options?.spellLevel === 0 ?? itemData?.level === 0;
	sandbox.itemIdentifier = item ? { [itemData.identifier]: true } : {};
	sandbox.itemName = item ? { [itemData.name]: true } : {};
	sandbox.item.hasAttack = item?.hasAttack;
	sandbox.item.hasSave = item?.system?.hasSave;
	sandbox.item.hasSummoning = item?.system?.hasSummoning;
	sandbox.item.hasLimitedUses = item?.system?.hasLimitedUses;
	sandbox.item.isHealing = item?.system?.isHealing;
	sandbox.item.isEnchantment = item?.system?.isEnchantment;
	sandbox.item.transferredEffects = item?.transferredEffects;
	sandbox.itemProperties = {};
	if (item) {
		sandbox._flatConstants[item.type] = true; // this is under Item5e#system#type 'weapon'/'spell' etc
		if (!!itemData.type?.value) sandbox._flatConstants[itemData.type.value] = true;
		if (itemData.school) sandbox._flatConstants[itemData.school] = true;
		const ammoProperties = sandbox.ammunition?.system?.properties;
		if (ammoProperties?.length && itemData?.properties) ammoProperties.forEach((p) => itemData.properties.add(p));
		itemData.properties?.filter((p) => (sandbox.itemProperties[p] = true) && (sandbox._flatConstants[p] = true));
	}

	const combat = game.combat;
	sandbox.combat = { active: combat?.active, round: combat?.round, turn: combat?.turn, current: combat?.current, turns: combat?.turns };
	sandbox.isTurn = sandbox.rollingActor.isTurn;
	sandbox.isOpponentTurn = sandbox.opponentActor.isTurn;
	sandbox.isTargetTurn = sandbox.isOpponentTurn; //backwards compatibility for changing the target to opponent for clarity.
	sandbox.movementLastSegment = sandbox.rollingActor.movementLastSegment; //backwards compatibility. Moved into _ac5eActorRollData
	sandbox.movementTurn = sandbox.rollingActor.movementTurn;

	sandbox.worldTime = game.time?.worldTime;
	sandbox.options = options;
	sandbox.ability = options.ability ? { [options.ability]: true } : {};
	sandbox.skill = options.skill ? { [options.skill]: true } : {};
	sandbox.tool = options.tool ? { [options.tool]: true } : {};
	if (options?.ability) sandbox._flatConstants[options.ability] = true;
	if (options?.skill) sandbox._flatConstants[options.skill] = true;
	if (options?.tool) sandbox._flatConstants[options.tool] = true;
	// in options there are options.isDeathSave options.isInitiative options.isConcentration
	sandbox.isConcentration = options?.isConcentration;
	sandbox.isDeathSave = options?.isDeathSave;
	sandbox.isInitiative = options?.isInitiative;
	sandbox.distance = options?.distance;
	sandbox.hook = options?.hook;
	sandbox.targets = options?.targets ?? [];
	sandbox.singleTarget = options?.targets?.length === 1 && true;
	sandbox.castingLevel = options.spellLevel ?? itemData?.level ?? null;
	sandbox.spellLevel = sandbox.castingLevel;
	//@to-do: check if it's better to retrieve as baseSpellLevel + scaling
	sandbox.baseSpellLevel = fromUuidSync(item?.uuid)?.system?.level;
	sandbox.scaling = item?.flags?.dnd5e?.scaling || 0;
	sandbox.attackRollTotal = options?.d20?.attackRollTotal;
	sandbox.attackRollD20 = options?.d20?.attackRollD20;
	const attackRollOverAC = sandbox.attackRollTotal - sandbox.opponentAC;
	sandbox.attackRollOverAC = !isNaN(attackRollOverAC) ? attackRollOverAC : undefined;
	sandbox.hasAdvantage = options?.d20?.hasAdvantage;
	sandbox.hasDisadvantage = options?.d20?.hasDisadvantage;
	sandbox.isCritical = options?.d20?.isCritical;
	sandbox.isFumble = options?.d20?.isFumble;

	if (sandbox.undefined || sandbox['']) {
		delete sandbox.undefined; //guard against sandbox.undefined = true being present
		delete sandbox[''];
		console.warn('AC5E sandbox.undefined detected!!!');
	}
	if (settings.debug || ac5e.logEvaluationData) console.log(`AC5E._createEvaluationSandbox logging the available data for hook "${sandbox.hook}":`, { evaluationData: sandbox });
	return sandbox;
}

export function _collectActivityDamageTypes(activity, options) {
	//use for pre damageRolls tests. We won't know what bonus active effects could be added at any point.
	if (!activity || !['attack', 'damage', 'heal', 'save'].includes(activity.type)) {
		options.defaultDamageType = {};
		options.damageTypes = {};
		return;
	}
	const returnDamageTypes = {};
	let returnDefaultDamageType = undefined;

	const partTypes = (part) => {
		if (part.types.size > 1) {
			console.warn('AC5E: Multiple damage types available for selection; cannot properly evaluate; damageTypes will grab the first of multiple ones');
		}
		const type = part.types.first();
		if (type) {
			if (!returnDefaultDamageType) returnDefaultDamageType = { [type]: true };
			returnDamageTypes[type] = true;
		}
		const formula = part.custom?.formula;
		if (formula && formula !== '') {
			const match = [...formula.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase()); //returns an Array of inner type strings from each [type];
			for (const m of match) {
				if (!returnDefaultDamageType) returnDefaultDamageType = { [m]: true };
				returnDamageTypes[m] = true;
			}
		}
	};

	const activityType = activity.type === 'heal' ? 'healing' : 'damage';
	if (activityType === 'healing') {
		const part = activity[activityType];
		partTypes(part);
	} else {
		for (const part of activity[activityType].parts) partTypes(part);
	}
	options.defaultDamageType = returnDefaultDamageType || {};
	options.damageTypes = returnDamageTypes;
	return;
}

export function _collectRollDamageTypes(rolls, options) {
	const damageTypes = {};
	const selectedDamageTypes = [];
	let defaultType = undefined;

	for (const roll of rolls) {
		const type = roll.options?.type;
		if (type) {
			if (!defaultType) defaultType = type;
			selectedDamageTypes.push(type);
			damageTypes[type] = true;
		}

		for (const part of roll.parts ?? []) {
			if (!part?.length) continue;
			const match = [...part.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim().toLowerCase()); //returns an Array of inner type strings from each [type]
			for (const partType of match) {
				if (!defaultType) defaultType = partType;
				damageTypes[partType] = true;
			}
		}
	}
	const defaultDamageType = defaultType ? { [defaultType]: true } : {};
	if (options) {
		options.damageTypes = damageTypes;
		options.selectedDamageTypes = selectedDamageTypes;
		if (!options.defaultDamageType) options.defaultDamageType = defaultDamageType;
	} else return { damageTypes, defaultDamageType, selectedDamageTypes };
}

export function _getActivityEffectsStatusRiders(activity) {
	const statuses = {};
	// const riders = {};
	activity?.applicableEffects?.forEach((effect) => {
		Array.from(effect?.statuses).forEach((status) => (statuses[status] = true));
		effect.flags?.dnd5e?.riders?.statuses?.forEach((rider) => (statuses[rider] = true));
	});
	if (settings.debug) console.log('AC5E._getActivityEffectsStatusRiders:', { statuses });
	return statuses;
}

/**
 * Retrieve an Item or one of its activities from an actor.
 * @function _getItemOrActivity
 * @param {string} itemID - Identifier of the item to find. Matches against `name`, `identifier`, `id`, or `uuid`.
 * @param {string} [activityID] - Optional identifier of the activity to find within the resolved item.
 *                                Matches against `name`, `type`, `identifier` (needs MidiQOL), `id`, or `uuid`.
 * @param {Actor|string} [actor] - Actor to search within. Can be:
 *   - An Actor document,
 *   - An actor name,
 *   - An actor ID,
 *   - Or a UUID string (use this for unlinked actors).
 *   If omitted, falls back to the bound Actor from _createEvaluationSandbox (subjectToken.actor).
 *
 * @returns {Item|object} - Returns the matching Item if `activityID` is not provided.
 *                          Returns the matching Activity object if `activityID` is provided.
 *                          Returns an empty object `{}` if no match is found.
 *
 * @example
 * // For evaluation of ac5e flags, adds a bonus based on uses left of the Attack activity
 * flags.automated-conditions-5e.damage.bonus | Override | bonus=getItemOrActivity("Empowered Longsword", "Attack").uses.value;
 *
 * @example
 * // Use in macros to find an activity within an item
 * const attackActivity = ac5e.getItemOrActivity("item-id", "attack-id", actor);
 *
 * @example
 * // Resolve actor by name
 * const shield = ac5e.getItemOrActivity("Shield", null, "Bob the Fighter");
 */
export function _getItemOrActivity(itemID, activityID, actor) {
	if (actor && !(actor instanceof Actor)) {
		if (game.actors.getName(actor) instanceof Actor) actor = game.actors.getName(actor);
		else if (actor.includes('.')) actor = fromUuidSync(actor);
		else actor = game.actors.get(actor);
		if (!(actor instanceof Actor)) {
			actor = undefined;
			ui.notifications.warn('ac5e.getItemOrActivity warning: actor parameter provided is not in the right format, which is for linked actors either the Name or the id, and for unlinked the UUID');
		}
	}
	const item = actor ? actor.items?.find((i) => i.name === itemID || i.identifier === itemID || i.id === itemID || i.uuid === itemID) : this.items?.find((i) => i.name === itemID || i.identifier === itemID || i.id === itemID || i.uuid === itemID); //this will be the 'ac5e' object always

	if (!item) return {};
	if (!activityID) return item;

	return item.system?.activities?.find((a) => a.name === activityID || a.type === activityID || a.identifier === activityID || a.id === activityID || a.uuid === activityID) || {};
}

export function _getTokenFromActor(actor) {
	let token;
	const tokenId = ChatMessage.getSpeaker({ actor })?.token;
	if (tokenId) token = canvas.tokens.get(tokenId);
	else token = null;
	if (!token && settings.tokenlessActorWarn) ui.notifications.warn(_localize('AC5E.TokenlessActorWarning.Text'));
	return token;
}
