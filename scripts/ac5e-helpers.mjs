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
export function _getDistance(tokenA, tokenB) {
	if (typeof tokenA === 'string' && !tokenA.includes('.')) tokenA = canvas.tokens.get(tokenA);
	else if (typeof tokenA === 'string' && tokenA.includes('.')) tokenA = fromUuidSync(tokenA)?.object;
	if (typeof tokenB === 'string' && !tokenB.includes('.')) tokenB = canvas.tokens.get(tokenB);
	else if (typeof tokenB === 'string' && tokenB.includes('.')) tokenB = fromUuidSync(tokenB)?.object;
	if (!tokenA || !tokenB) return false;
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
	const result = calculateDistanceWithUnits(canvas.scene, canvas.grid, tokenA, tokenB).value;
	if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - getDistance():`, { sourceId: tokenA.id, targetId: tokenB.id, result });
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

export function _calcAdvantageMode(ac5eConfig, config, dialog) {
	const options = config.rolls?.[0]?.options;
	if (ac5eConfig.source.advantage.length || ac5eConfig.target.advantage.length) options.advantage = true;
	if (ac5eConfig.source.disadvantage.length || ac5eConfig.target.disadvantage.length) options.disadvantage = true;
	if (options.advantage === true && options.disadvantage === true) {
		options.advantage = false;
		options.disadvantage = false;
	}
	if (ac5eConfig.source.fail.length || ac5eConfig.target.fail.length) {
		config.target = 10000;
		if (_activeModule('midi-qol') && config?.rolls?.[0]?.parts instanceof Array) config.rolls[0].parts.push(-999);
		options.criticalSuccess = 21;
	}
}

//check for 'same' 'different' or 'all' (=false) dispositions
//t1, t2 Token5e or Token5e#Document
export function _dispositionCheck(t1, t2, check = false) {
	if (!t1 || !t2) return false;
	t1 = t1 instanceof Object ? t1.document : t1;
	t2 = t2 instanceof Object ? t2.document : t2;
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
		settings.autoRangedCombined === 'nearby' &&
		_findNearby({ token, disposition: 'opposite', radius: 5, lengthTest: 1 }) && //hostile vs friendly disposition only
		!crossbowExpert;
	const inRange = (!short && !long) || distance <= short ? 'short' : distance <= long ? 'long' : false; //expect short and long being null for some items, and handle these cases as in short range.
	return { inRange: !!inRange, range: inRange, distance, nearbyFoe };
}

export function _hasItem(actor, itemName) {
	return actor?.items.some((item) => item?.name.toLocaleLowerCase().includes(_localize(itemName).toLocaleLowerCase()));
}

export function _systemCheck(testVersion) {
	return foundry.utils.isNewerVersion(game.system.version, testVersion);
}

export function _getTooltip(ac5eConfig) {
	if (!ac5eConfig) return null;
	let tooltip = settings.showNameTooltips ? '<center><strong>Automated Conditions 5e</strong></center><hr>' : '';
	if (ac5eConfig.source?.critical?.length) tooltip = tooltip.concat(`<span style="display: block; text-align: left;">${_localize('Critical')}: ${ac5eConfig.source.critical.join(', ')}</span>`);
	if (ac5eConfig.target?.critical?.length) tooltip = tooltip.concat(`<span style="display: block; text-align: left;">${_localize('Critical')}: ${ac5eConfig.target.critical.join(', ')}</span>`);
	if (ac5eConfig.source?.fail.length) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(`<span style="display: block; text-align: left;">${_localize('AC5E.Fail')}: ${ac5eConfig.source.fail.join(', ')}</span>`);
	}
	if (ac5eConfig.source?.advantage.length) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		if (!['attack', 'damage'].includes(ac5eConfig.hookType)) tooltip = tooltip.concat(`<span style="display: block; text-align: left;">${_localize('Advantage')}: ${ac5eConfig.source.advantage.join(', ')}</span>`);
		else tooltip = tooltip.concat(`<span style="display: block; text-align: left;">Attacker ${_localize('Advantage').substring(0, 3).toLocaleLowerCase()}: ${ac5eConfig.source.advantage.join(', ')}</span>`);
	}
	if (ac5eConfig.target?.advantage.length) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(`<span style="display: block; text-align: left;">${_localize('DND5E.Target')} grants ${_localize('Advantage').substring(0, 3).toLocaleLowerCase()}: ${ac5eConfig.target.advantage.join(', ')}</span>`);
	}
	if (ac5eConfig.source?.disadvantage.length) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		if (!['attack', 'damage'].includes(ac5eConfig.hookType)) tooltip = tooltip.concat(`<span style="display: block; text-align: left;">${_localize('Disadvantage')}: ${ac5eConfig.source.disadvantage.join(', ')}</span>`);
		else tooltip = tooltip.concat(`<span style="display: block; text-align: left;">Attacker ${_localize('Disadvantage').substring(0, 3).toLocaleLowerCase()}: ${ac5eConfig.source.disadvantage.join(', ')}</span>`);
	}
	if (ac5eConfig.target?.disadvantage.length) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(`<span style="display: block; text-align: left;">${_localize('DND5E.Target')} grants ${_localize('Disadvantage').substring(0, 3).toLocaleLowerCase()}: ${ac5eConfig.target.disadvantage.join(', ')}</span>`);
	}
	if (!tooltip.includes(':')) return ''; //tooltip.concat(`<center><strong>No Changes</strong></center>`);//null;
	else return tooltip;
}

export function _getConfig(config, hookType, tokenId, targetId, options = {}) {
	if (settings.debug) console.warn('helpers._getConfig:', config);
	// const existingAC5e = config?.[Constants.MODULE_ID];
	const areKeysPressed = game.system.utils.areKeysPressed;
	const ac5eConfig = {
		hookType,
		tokenId,
		targetId,
		source: {
			advantage: [],
			disadvantage: [],
			fail: [],
			parts: [],
			critical: [],
		},
		target: {
			advantage: [],
			disadvantage: [],
			fail: [],
			parts: [],
			critical: [],
		},
		options,
		preAC5eConfig: {
			advKey: hookType !== 'damage' ? areKeysPressed(config.event, 'skipDialogAdvantage') : false,
			disKey: hookType !== 'damage' ? areKeysPressed(config.event, 'skipDialogDisadvantage') : false,
			critKey: hookType === 'damage' ? areKeysPressed(config.event, 'skipDialogAdvantage') : false,
			fastForward: hookType !== 'damage' ? areKeysPressed(config.event, 'skipDialogNormal') : hookType === 'damage' ? areKeysPressed(config.event, 'skipDialogNormal') || areKeysPressed(config.event, 'skipDialogDisadvantage') : false,
		},
		returnEarly: false,
	};

	const roller = _activeModule('midi-qol') ? 'MidiQOL' : _activeModule('ready-set-roll-5e') ? 'RSR' : 'Core';
	ac5eConfig.roller = roller;

	if (ac5eConfig.preAC5eConfig.advKey) {
		ac5eConfig.source.advantage = [`${roller} (keyPress)`];
		ac5eConfig.returnEarly = true;
	} else if (ac5eConfig.preAC5eConfig.disKey) {
		ac5eConfig.source.disadvantage = [`${roller} (keyPress)`];
		ac5eConfig.returnEarly = true;
	} else if (ac5eConfig.preAC5eConfig.critKey) {
		ac5eConfig.source.critical = [`${roller} (keyPress)`];
		ac5eConfig.returnEarly = true;
	}
	if (settings.debug) {
		console.warn('AC5E_getConfig', { ac5eConfig });
		//debugger;
	}
	return ac5eConfig;
}

export function _setAC5eProperties(ac5eConfig, config, dialog, message) {
	if (settings.debug) console.warn('AC5e helpers._setAC5eProperties', { ac5eConfig, config, dialog, message });

	const ac5eConfigObject = { [Constants.MODULE_ID]: ac5eConfig, classes: ['ac5e'] };

	if (config) foundry.utils.mergeObject(config, ac5eConfigObject);
	if (config.rolls?.[0]?.data?.flags) foundry.utils.mergeObject(config.rolls[0].data.flags, ac5eConfigObject);
	foundry.utils.mergeObject(config.rolls[0].options, ac5eConfigObject);
	if (settings.debug) console.warn('AC5e post helpers._setAC5eProperties', { ac5eConfig, config, dialog, message });
}

export function _activeModule(moduleID) {
	return game.modules.get(moduleID)?.active;
}

export function _canSee(source, target) {
	if (_activeModule('midi-qol')) return MidiQOL.canSee(source, target);
	const NON_SIGHT_CONSIDERED_SIGHT = ['blindsight'];
	//@ts-expect-error
	const detectionModes = CONFIG.Canvas.detectionModes;
	const sightDetectionModes = Object.keys(detectionModes).filter(
		(d) =>
			//@ts-expect-error DetectionMode
			detectionModes[d].type === DetectionMode.DETECTION_TYPES.SIGHT || NON_SIGHT_CONSIDERED_SIGHT.includes(d)
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
	const DetectionModeCONST = DetectionMode;
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
	for (let tk of [token]) {
		if (!tk.document.sight.enabled) {
			const sourceId = tk.sourceId;
			//@ts-expect-error
			canvas?.effects?.visionSources.delete(sourceId);
		}
	}
	if (settings.debug) console.warn(`${Constants.MODULE_SHORT_NAME} - _canSee()`, { sourceId: source?.id, targetId: target?.id, result: matchedModes });
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
export function _getActionType(activity) {
	let actionType = activity?.attack?.type;
	if (!actionType) return null;
	if (actionType.value === 'melee') {
		if (actionType.classification === 'weapon') actionType = 'mwak';
		else if (actionType.classification === 'spell') actionType = 'msak';
	} else if (actionType.value === 'ranged') {
		if (actionType.classification === 'weapon') actionType = 'rwak';
		else if (actionType.classification === 'spell') actionType = 'rsak';
	} else undefined;
	return actionType;
}
export function _getEffectOriginToken(effect /* ActiveEffect */) {
	let effectOriginActor;
	if (effect.parent instanceof CONFIG.Item.documentClass && effect.parent.isEmbedded) effectOriginActor = effect.parent.actor;
	if (!effect.origin) return undefined;
	const origin = fromUuidSync(effect.origin);
	if (origin instanceof CONFIG.ActiveEffect.documentClass) {
		if (origin.parent instanceof CONFIG.Item.documentClass) effectOriginActor = origin.parent.actor;
		if (origin.parent instanceof CONFIG.Actor.documentClass) effectOriginActor = origin.panent;
	}
	return effectOriginActor.getActiveTokens()[0];
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
	const data = foundry.utils.duplicate(systemData.details.type);
	data.race = systemData.details.race?.identifier ?? data.type;
	if (dataType === 'all') return data;
	else return data[dataType];
}
