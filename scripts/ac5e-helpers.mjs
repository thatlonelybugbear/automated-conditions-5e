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

export function _calcAdvantageMode(ac5eConfig, config) {
	config.fastForward = config.fastForward
			? config.fastForward
			: ac5eConfig.roller == 'Core'
			? (config.event.shiftKey || config.event.altKey || config.event.metaKey || config.event.ctrlKey)
			: ac5eConfig.roller == 'RSR'
			? ac5eConfig.rsrOverrideFF
			: false;
	if (ac5eConfig.roller == 'Core') foundry.utils.mergeObject(config.event, { altKey: false, shiftKey: false, metaKey: false, ctrlKey: false });
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

export function _autoArmor(actor) {
	if (!actor) return undefined;
	const hasArmor = actor.armor;
	if (!hasArmor) return null;
	return {
		hasStealthDisadvantage: hasArmor.system.properties.has(
			'stealthDisadvantage'
		),
		notProficient:
			!hasArmor.system.proficient && !hasArmor.system.prof.multiplier,
	};
}

export function _autoEncumbrance(actor, abilityId) {
	if (!settings.autoEncumbrance) return null;
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
	if (ac5eConfig.critical.length)
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Critical'
			)}: ${ac5eConfig.critical.join(', ')}</span>`
		);
	if (ac5eConfig.advantage?.length) {
		if (ac5eConfig.critical.length) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Advantage'
			)}: ${ac5eConfig.advantage.join(', ')}</span>`
		);
	}
	if (ac5eConfig.disadvantage?.length) {
		if (ac5eConfig.advantage?.length) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Disadvantage'
			)}: ${ac5eConfig.disadvantage.join(', ')}</span>`
		);
	}
	if (ac5eConfig.fail?.length) {
		if (ac5eConfig.disadvantage?.length) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'AC5E.Fail'
			)}: ${ac5eConfig.fail.join(', ')}</span>`
		);
	}
	if (ac5eConfig.advantage?.source?.length) {
		if (ac5eConfig.fail?.length) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">Attacker ${_localize(
				'Advantage'
			)
				.substring(0, 3)
				.toLocaleLowerCase()}: ${ac5eConfig.advantage.source.join(', ')}</span>`
		);
	}
	if (ac5eConfig.advantage?.target?.length) {
		if (ac5eConfig.advantage?.source?.length) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Target'
			)} grants ${_localize('Advantage')
				.substring(0, 3)
				.toLocaleLowerCase()}: ${ac5eConfig.advantage.target.join(', ')}</span>`
		);
	}
	if (ac5eConfig.disadvantage?.source?.length) {
		if (ac5eConfig.advantage?.target?.length) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">Attacker ${_localize(
				'Disadvantage'
			)
				.substring(0, 3)
				.toLocaleLowerCase()}: ${ac5eConfig.disadvantage.source.join(
				', '
			)}</span>`
		);
	}
	if (ac5eConfig.disadvantage?.target?.length) {
		if (ac5eConfig.disadvantage?.source?.length) tooltip = tooltip.concat('<br>');
		tooltip = tooltip.concat(
			`<span style="display: block; text-align: left;">${_localize(
				'Target'
			)} grants ${_localize('Disadvantage')
				.substring(0, 3)
				.toLocaleLowerCase()}: ${ac5eConfig.disadvantage.target.join(
				', '
			)}</span>`
		);
	}
	if (
		tooltip === settings.showNameTooltips
			? '<center><strong>Automated Conditions 5e</strong></center>'
			: ''
	)
		return null;
	else return tooltip;
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
	//to-do: getSetting for event overriding pressedKeys overriding any calcs and add the result here. If that returns true, force adv/dis/crit pressed keys and no AC5e calcs.
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
		critical = [];
	if (activeModule('midi-qol')) {
		moduleID = 'MidiQOL';
		if (hookType !== 'damage' || hookType !== 'itemDamage') {
			config.critical = false;
			advKey = MidiKeyManager.pressedKeys.advantage;
			disKey = MidiKeyManager.pressedKeys.disadvantage;
		}
		else critKey = MidiKeyManager.pressedKeys.critical;
		if (settings.debug) console.warn(advKey, disKey, critKey, config);
	} else if (activeModule('ready-set-roll-5e')) {
		moduleID = 'ready-set-roll-5e';
		let getRsrSetting = (key) => game.settings.get(moduleID, key);
		let rsrHookType = hookType;
		if (rsrHookType !== 'damage') {
			if (rsrHookType == 'attack') rsrHookType = 'Item';
			if (rsrHookType == 'conc') hooktype = 'ability';
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
				: config.event.shiftKey || config.event.altKey || config.event.metaKey || config.event.ctrlKey			
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
		} /*else {
			if (hookType == 'conc') hooktype = 'ability';
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
				: config.event?.shiftKey;
		}*/
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
	if (critKey) critical = [`${moduleID} (keyPress)`];
	if (config.advantage && !settings.keypressOverrides)
		advantage = advantage.concat(`${moduleID} (flags)`);
	if (config.disadvantage && !settings.keypressOverrides)
		disadvantage = disadvantage.concat(`${moduleID} (flags)`);
	if (config.critical === true && !settings.keypressOverrides)
		critical = critical.concat(`${moduleID} (flags)`);
	if (settings.debug) {
		console.warn('_getConfig | advantage:',advantage, 'disadvantage:', disadvantage, 'critical:', critical, 'hookType:', hookType);
		console.warn('_getConfig keys | advKey:', advKey, 'disKey:', disKey, 'critKey:', critKey, 'rsrOverrideFF:', rsrOverrideFF);
	}
	return {
		hookType,
		roller: moduleID,
		tokenId,
		targetId,
		advantage,
		disadvantage,
		fail: false,
		critical,
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

export function _setAC5eProperties(ac5eConfig, where) {
	foundry.utils.setProperty(
		where,
		`dialogOptions.${Constants.MODULE_ID}`,
		ac5eConfig
	);
	foundry.utils.mergeObject(where.dialogOptions, { classes: ['ac5e dialog'] });
	foundry.utils.setProperty(
		where,
		`messageData.flags.${Constants.MODULE_ID}`,
		ac5eConfig
	);
}

function activeModule(moduleID) {
	return game.modules.get(moduleID)?.active;
}
