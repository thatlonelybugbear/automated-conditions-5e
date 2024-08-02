 import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

/**
 * Gets the minimum distance between two tokens,
 * evaluating all grid spaces they occupy, by Zhell.
 */
/*export function _getDistance(tokenA, tokenB) {
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
*/
/**
 * Get the upper left corners of all grid spaces a token document occupies.
 */
/*export function _getAllTokenGridSpaces(tokenDoc) {
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
*/

export function _getActiveToken(actor) {
	const speaker = ChatMessage.getSpeaker({actor});
	if (!speaker.token) {
		return null;
	}
	return game.canvas.tokens?.get(speaker.token);
};


export function _getDistance(tokenA, tokenB) {

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

const calculateDistanceWithUnits = (scene /*: Scene*/, grid /*: foundry.grid.BaseGrid*/, token, other /*: Token*/) => {
	const { distance } = grid.measurePath(getComparisonPoints(grid, token, other));

	return {
		value: distance,
		units: scene.grid.units,
	};
};
console.log(calculateDistanceWithUnits(canvas.scene, canvas.grid, tokenA, tokenB).value)
return calculateDistanceWithUnits(canvas.scene, canvas.grid, tokenA, tokenB).value
}


export function _i18nConditions(name) {
	const str = `EFFECT.DND5E.Status${name}`;
	if (game.i18n.has(str)) return game.i18n.localize(str);
	return game.i18n.localize(`DND5E.Con${name}`);
}

export function _localize(string) {
	return game.i18n.translations.DND5E[string] ?? game.i18n.localize(string);
}

export function _hasStatuses(actor, statuses) {
	if (!actor) return [];
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
export function _getConfig(config, hookType, tokenId, targetId) {
	if (settings.debug) console.warn('helpers._getConfig:', config);
	const existingAC5e = config?.dialogOptions?.['automated-conditions-5e'];
	if (!!existingAC5e && existingAC5e.hookType == 'item') {
		existingAC5e.hookType = existingAC5e.hookType + hookType.capitalize();
		if (settings.debug)
			console.warn('ac5e helpers.getConfig preExistingAC5e:', preExistingAC5e);
		return existingAC5e;
	}
	if (settings.debug)
		console.log(
			config.advantage,
			config.disadvantage,
			config.critical,
			config.fastForward,
			hookType
		);
	let moduleID = 'Core';
	let advKey,
		disKey,
		critKey,
		rsrOverrideFF,
		advantage = [],
		disadvantage = [],
		critical = [],
		fail = [];
	if (activeModule('midi-qol')) {
		moduleID = 'MidiQOL';
		if (!['damage', 'itemDamage'].includes(hookType)) {
			advKey = MidiKeyManager.pressedKeys.advantage;
			disKey = MidiKeyManager.pressedKeys.disadvantage;
		} else critKey = MidiKeyManager.pressedKeys.critical;
		if (settings.debug) console.warn(advKey, disKey, critKey, config);
	} else if (activeModule('ready-set-roll-5e')) {
		moduleID = 'ready-set-roll-5e';
		let getRsrSetting = (key) => game.settings.get(moduleID, key);
		let rsrHookType = hookType;
		if (rsrHookType !== 'damage') {
			if (rsrHookType == 'attack') rsrHookType = 'item';
			if (rsrHookType == 'conc') rsrHookType = 'save';
			rsrHookType = rsrHookType.capitalize();
			advKey = !getRsrSetting(`enable${rsrHookType}QuickRoll`)
				? config.event?.altKey || config.event?.metaKey
				: getRsrSetting('rollModifierMode') == 0
				? config.event?.shiftKey
				: config.event?.ctrlKey || config.event?.metaKey;
			disKey = !getRsrSetting(`enable${rsrHookType}QuickRoll`)
				? config.event?.ctrlKey
				: getRsrSetting('rollModifierMode') == 0
				? config.event?.ctrlKey || config.event?.metaKey
				: config.event?.shiftKey;
			rsrOverrideFF = getRsrSetting(`enable${rsrHookType}QuickRoll`)
				? !config.event?.altKey
				: config.event.shiftKey ||
				  config.event.altKey ||
				  config.event.metaKey ||
				  config.event.ctrlKey;
		} else if (rsrHookType == 'damage') {
			//to-do:check this
			rsrHookType = 'Item';
			critKey = !getRsrSetting(`enable${rsrHookType}QuickRoll`)
				? config.event?.altKey || config.event?.metaKey
				: getRsrSetting('rollModifierMode') == 0
				? config.event?.shiftKey
				: config.event?.ctrlKey || config.event?.metaKey;
			rsrOverrideFF = getRsrSetting(`enable${rsrHookType}QuickRoll`)
				? !config.event?.altKey
				: config.event?.shiftKey;
		}
		moduleID = 'RSR';
	} else {
		//core system keys
		if (hookType != 'damage')
			advKey = config.event?.altKey || config.event?.metaKey;
		if (hookType != 'damage') disKey = config.event?.ctrlKey;
		if (hookType == 'damage')
			critKey = config.event?.altKey || config.event?.metaKey;
	}
	if (settings.debug)
		console.warn(
			'helpers check Keys || ',
			hookType,
			advKey,
			disKey,
			critKey,
			moduleID,
			'keypressOverrides:',
			settings.keypressOverrides
		);
	if (advKey) advantage = [`${moduleID} (keyPress)`];
	if (disKey) disadvantage = [`${moduleID} (keyPress)`];
	if (critKey && ['damage', 'itemDamage'].includes(hookType))
		critical = [`${moduleID} (keyPress)`];
	if (config.advantage /*&& !settings.keypressOverrides*/)  //to-do: why was that here in the first place? Changed when added multi rollers compat?
		advantage = advantage.concat(`${moduleID} (flags)`);
	if (config.disadvantage /*&& !settings.keypressOverrides*/)
		disadvantage = disadvantage.concat(`${moduleID} (flags)`);
	if (config.critical === true /*&& !settings.keypressOverrides*/)
		critical = critical.concat(`${moduleID} (flags)`);
	if (settings.debug) {
		console.warn(
			'_getConfig | advantage:',
			advantage,
			'disadvantage:',
			disadvantage,
			'critical:',
			critical,
			'hookType:',
			hookType
		);
		console.warn(
			'_getConfig keys | advKey:',
			advKey,
			'disKey:',
			disKey,
			'critKey:',
			critKey,
			'rsrOverrideFF:',
			rsrOverrideFF
		);
	}
	return {
		hookType,
		roller: moduleID,
		tokenId,
		targetId,
		source: { advantage, disadvantage, fail, critical },
		target: { advantage: [], disadvantage: [] },
		rsrOverrideFF,
		preAC5eConfig: settings.keypressOverrides
			? {
					advKey: advantage.some((el) => el.includes('keyPress')),
					disKey: disadvantage.some((el) => el.includes('keyPress')),
					critKey: critical.some((el) => el.includes('keyPress')),
			  }
			: false,
	};
}

export function _calcAdvantageMode(ac5eConfig, config) {
	console.log(config.event?.view?.keyboard.downKeys)
	console.log(game.keyboard.downKeys)
	config.fastForward = config.fastForward
		? config.fastForward
		: ac5eConfig.roller == 'Core'
		? config.event.shiftKey ||
		  config.event.altKey ||
		  config.event.metaKey ||
		  config.event.ctrlKey
		: ac5eConfig.roller == 'RSR'
		? ac5eConfig.rsrOverrideFF
		: false;
	if (ac5eConfig.roller == 'Core' && ac5eConfig.hookType != 'conc')
		foundry.utils.mergeObject(config.event, {
			altKey: false,
			shiftKey: false,
			metaKey: false,
			ctrlKey: false,
		});
	if (ac5eConfig.roller == 'RSR')
		foundry.utils.mergeObject(config.event || {}, {
			altKey: !ac5eConfig.rsrOverrideFF ? config.event.altKey : false,
		});
	if (settings.keypressOverrides) {
		if (ac5eConfig.preAC5eConfig.advKey) return (config.advantage = true);
		if (ac5eConfig.preAC5eConfig.disKey) return (config.disadvantage = true);
		if (ac5eConfig.preAC5eConfig.critKey) return (config.critical = true);
	}
	if (
		ac5eConfig.source.advantage.length ||
		ac5eConfig.target.advantage.length
	)
		config.advantage = true;
	if (
		ac5eConfig.source.disadvantage.length ||
		ac5eConfig.target.disadvantage.length
	)
		config.disadvantage = true;
	//if (ac5eConfig.advantage.length) config.advantage = true;
	//if (ac5eConfig.disadvantage.length) config.disadvantage = true;
	if (config.advantage === true && config.disadvantage === true) {
		config.advantage = false;
		config.disadvantage = false;
	}
	if (ac5eConfig.source.fail.length) {
		config.parts = config.parts.concat('-99');
		config.critical = 21; //make it not crit
	}
	if (ac5eConfig.source.critical.length) {
		config.critical = true;		
	}
	console.log({advantage:config.advantage, disadvantage: config.disadvantage})
}

//check for 'same' 'different' or 'all' (=false) dispositions
//t1, t2 Token5e or Token5e#Document
export function _dispositionCheck(t1, t2, check = false) {
	if (!t1 || !t2) return false;
	t1 = t1 instanceof Object ? t1.document : t1;
	t2 = t2 instanceof Object ? t2.document : t2;
	if (check == 'different') return t1.disposition !== t2.disposition;
	if (check == 'opposite') return t1.disposition * t2.disposition === -1;
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

export function _autoArmor(actor, abilityId) {
	if (!actor || !settings.autoArmor || !['str', 'dex'].includes(abilityId)) return {};
	const hasArmor = actor.armor;
	const hasShield = actor.shield;
	return {
		hasStealthDisadvantage: 
			hasArmor?.system.properties.has('stealthDisadvantage')
			? 'Armor'
			: hasShield?.system.properties.has('stealthDisadvantage')
			? 'EquipmentShield'
			: actor.itemTypes.equipment.some(
					(e) =>
						e.system.equipped &&
						e.system.properties.has('stealthDisadvantage')
			  )
			? 'AC5E.Equipment'
			: false,
		notProficient:
			!!hasArmor && !hasArmor.system.proficient && !hasArmor.system.prof.multiplier
			? 'Armor' 
			: !!hasShield && !hasShield.system.proficient && !hasShield.system.prof.multiplier
			? 'EquipmentShield'
			: false,
	};
}

export function _autoEncumbrance(actor, abilityId) {
	if (!settings.autoEncumbrance) return null;
	return ['con', 'dex', 'str'].includes(abilityId) && actor.statuses.has('heavilyEncumbered');
}

export function _autoRanged(item, token, target) {
	const autoRangedSettings = settings.autoRangedOptions;
	if (!item || !['rwak', 'rsak'].includes(item.system.actionType) || !token || autoRangedSettings == 'off') return { };
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
	const distance = target ? _getDistance(token, target) : undefined;
	const nearbyFoe =
		autoRangedSettings == 'nearby' &&
		_findNearby(token, 'opposite', 5, 1) &&  //hostile vs friendly disposition only
		!crossbowExpert;
	const inRange =
		distance <= short ? 'short' : distance <= long ? 'long' : false;
	return { inRange: !!inRange, range: inRange, distance, nearbyFoe };
}

export function _hasItem(actor, itemName) {
	return actor?.items.some((item) =>
		item?.name
			.toLocaleLowerCase()
			.includes(_localize(itemName).toLocaleLowerCase())
	);
}

export function _systemCheck(testVersion) {
	return foundry.utils.isNewerVersion(game.system.version, testVersion);
}

export function _getTooltip(ac5eConfig) {
	let tooltip = settings.showNameTooltips
		? '<center><strong>Automated Conditions 5e</strong></center><hr>'
		: '';
	if (ac5eConfig.source.critical.length)
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Critical'
			)}: ${ac5eConfig.source.critical.join(', ')}</span>`
		);
	if (ac5eConfig.source.advantage.length && !['attack', 'use'].includes(ac5eConfig.hookType)) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Advantage'
			)}: ${ac5eConfig.source.advantage.join(', ')}</span>`
		);
	}
	if (ac5eConfig.source.disadvantage.length && !['attack', 'use'].includes(ac5eConfig.hookType)) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Disadvantage'
			)}: ${ac5eConfig.source.disadvantage.join(', ')}</span>`
		);
	}
	if (ac5eConfig.source.fail.length) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'AC5E.Fail'
			)}: ${ac5eConfig.source.fail.join(', ')}</span>`
		);
	}
	if (ac5eConfig.source.advantage.length && ['attack', 'use'].includes(ac5eConfig.hookType)) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">Attacker ${_localize(
				'Advantage'
			)
				.substring(0, 3)
				.toLocaleLowerCase()}: ${ac5eConfig.source.advantage.join(', ')}</span>`
		);
	}
	if (ac5eConfig.target.advantage.length) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Target'
			)} grants ${_localize('Advantage')
				.substring(0, 3)
				.toLocaleLowerCase()}: ${ac5eConfig.target.advantage.join(', ')}</span>`
		);
	}
	if (ac5eConfig.source.disadvantage.length && ['attack', 'use'].includes(ac5eConfig.hookType)) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">Attacker ${_localize(
				'Disadvantage'
			)
				.substring(0, 3)
				.toLocaleLowerCase()}: ${ac5eConfig.source.disadvantage.join(
				', '
			)}</span>`
		);
	}
	if (ac5eConfig.target.disadvantage.length) {
		if (tooltip.includes(':')) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Target'
			)} grants ${_localize('Disadvantage')
				.substring(0, 3)
				.toLocaleLowerCase()}: ${ac5eConfig.target.disadvantage.join(
				', '
			)}</span>`
		);
	}
	if (!tooltip.includes(':')) return null;
	else return tooltip;
}



export function _setAC5eProperties(ac5eConfig, where) {
	console.log(ac5eConfig)
	console.log(where)
	if (where.dialogOptions)
		foundry.utils.mergeObject(where.dialogOptions, {
			[`${Constants.MODULE_ID}`]: ac5eConfig,
		});
	else
		foundry.utils.setProperty(
			where,
			`dialogOptions.${Constants.MODULE_ID}`,
			ac5eConfig
		);
	foundry.utils.mergeObject(where.dialogOptions, { classes: ['ac5e dialog'] });
	if (where.messageData)
		foundry.utils.mergeObject(where.messageData, {
			[`flags.${Constants.MODULE_ID}`]: ac5eConfig,
		});
	else
		foundry.utils.setProperty(
			where,
			`messageData.flags.${Constants.MODULE_ID}`,
			ac5eConfig
		);
}

export function activeModule(moduleID) {
	return game.modules.get(moduleID)?.active;
}


export function _canSee(source, target) {
	if (game.modules.get('midi - qol')?.active) return MidiQOL.canSee(source, target);
	if (!source || !target) {
		if (settings.debug) console.warn('AC5e: No valid tokens for canSee test');
		return false;
	}
	const NON_SIGHT_CONSIDERED_SIGHT = ['blindsight'];
	const detectionModes = CONFIG.Canvas.detectionModes;
	const DetectionModeCONST = DetectionMode;
	const sightDetectionModes = new Set(Object.keys(detectionModes).filter((d) => detectionModes[d].type === DetectionMode.DETECTION_TYPES.SIGHT || NON_SIGHT_CONSIDERED_SIGHT.includes[d])); // ['basicSight', 'seeInvisibility', 'seeAll']
	if (source instanceof TokenDocument) source = source.object;
	if (target instanceof TokenDocument) target = target.object;
	if (target.document?.hidden) return false;
	if (!source.hasSight) return true; //if no sight is enabled on the source, it can always see.

	const matchedModes = new Set();
	// Determine the array of offset points to test
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
		los: new Map(),
	}));
	const config = { tests, object: target };
	const tokenDetectionModes = source.detectionModes;
	// First test basic detection for light sources which specifically provide vision
	const lightSources = foundry.utils.isNewerVersion(game.system.version, '12.0') ? canvas?.effects?.lightSources : canvas?.effects?.lightSources.values();
	for (const lightSource of lightSources ?? []) {
		if ( !lightSource.active || lightSource.disabled) continue;
		if (!lightSource.data.visibility) continue;
		const result = lightSource.testVisibility(config);
		if (result === true) matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
	}
	const basic = tokenDetectionModes.find((m) => m.id === DetectionModeCONST.BASIC_MODE_ID);
	if (basic) {
		if (['basicSight', 'lightPerception', 'all'].some((mode) => sightDetectionModes.has(mode))) {
			const result = detectionModes.basicSight.testVisibility(source.vision, basic, config);
			if (result === true) matchedModes.add(detectionModes.lightPerception?.id ?? DetectionModeCONST.BASIC_MODE_ID);
		}
	}
	for (const detectionMode of tokenDetectionModes) {
		if (detectionMode.id === DetectionModeCONST.BASIC_MODE_ID) continue;
		if (!detectionMode.enabled) continue;
		const dm = sightDetectionModes[detectionMode.id];
		if (sightDetectionModes.has('all') || sightDetectionModes.has(detectionMode.id)) {
			const result = dm?.testVisibility(source.vision, detectionMode, config);
			if (result === true) {
				matchedModes.add(detectionMode.id);
			}
		}
	}
	return !!matchedModes.size;
}
