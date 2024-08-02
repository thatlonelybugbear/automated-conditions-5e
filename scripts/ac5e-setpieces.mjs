import {
	_autoArmor,
	_autoEncumbrance,
	_autoRanged,
	_calcAdvantageMode,
	_canSee,
	_getActiveToken,
	_getDistance,
	_hasAppliedEffects,
	_hasStatuses,
	_localize,
	_i18nConditions,
	/*_raceOrType,*/
	/*_staticID,*/
} from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

//for exhaustion I think it's better to pass to this function directly `Exhaustion X` where X is the relevant Exhaustion level.
export function ac5eStatusChecks({ actor, token, targetActor, targetToken, ac5eConfig, hook, statuses, actorType, abilityId, distance, item }) {
	if (!actor) actor = token?.actor;
	if (!targetActor) targetActor = targetToken?.actor;
	if (!token) token = _getActiveToken(actor);
	if (!targetToken) targetToken = _getActiveToken(targetActor);
	if (typeof statuses === 'string') statuses = [statuses];
	if (!distance) distance = _getDistance(targetToken, token);
	if (!settings.autoExhaustion) statuses = statuses.filter((status) => status != 'exhaustion');
	if (!settings.expandedConditions) statuses = statuses.filter((status) => !['dodging', 'hiding', 'raging', 'underwaterCombat'].includes(status));
	if (!settings.autoEncumbrance || !['con', 'dex', 'str'].includes(abilityId)) statuses = statuses.filter((status) => status != 'heavilyEncumbered'); //remove the status if either setting is OFF or not relevant abilityId.
	let exhaustionLevel, toCheckExhaustionLevel, test, change;
	if (settings.debug) console.warn('AC5E debug | statuses for ac5eStatusChecks |', statuses);
	if (statuses.includes('exhaustion') || actor.system.attributes.exhaustion)
		//to-do: might need to include logic for `exhaustion i` in the future
		exhaustionLevel = actor.system.attributes.exhaustion;
	const params = { actor, token, targetActor, targetToken, abilityId, distance, exhaustionLevel, item };
	const effectsTable = getStatusEffectTable({ ...params, statuses, actorType, hook });
	for (const status of statuses) {
		test = effectsTable[status]?.[hook]?.[actorType];
		if (settings.debug) console.warn({ status, test, ac5eConfig: ac5eConfig[actorType] });
		if (!test) continue;
		else change = true;
		ac5eConfig[actorType][test].push(effectsTable[status].name);
	}

	return change;
}

function getStatusEffectTable({ actor, token, targetActor, targetToken, abilityId, distance, exhaustionLevel, item, statuses } = {}) {
	const statusEffectsTables = {};

	for (const status of statuses) {
		switch (status) {
			case 'blinded':
				statusEffectsTables.blinded = {
					_id: staticID('blinded'),
					name: _i18nConditions('Blinded'),
					attack: { source: 'disadvantage', target: 'advantage' },
				};
				break;
			case 'charmed':
				statusEffectsTables.charmed = {
					_id: staticID('charmed'),
					name: _i18nConditions('Charmed'),
				};
				break;
			case 'deafened':
				statusEffectsTables.deafened = {
					_id: staticID('deafened'),
					name: _i18nConditions('Deafened'),
				};
				break;
			case 'exhaustion':
				statusEffectsTables.exhaustion = {
					_id: staticID('exhaustion'),
					test: { source: 'disadvantage' },
					skill: { source: 'disadvantage' },
					attack: { source: exhaustionLevel >= 3 ? 'disadvantage' : '' },
					save: { source: exhaustionLevel >= 3 ? 'disadvantage' : '' },
					death: { source: exhaustionLevel >= 3 ? 'disadvantage' : '' },
					conc: { source: exhaustionLevel >= 3 ? 'disadvantage' : '' },
					name: `${_i18nConditions('Exhaustion')} ${exhaustionLevel}`,
				};
				break;
			case 'frightened':
				statusEffectsTables.frightened = {
					_id: staticID('frightened'),
					name: _i18nConditions('Frightened'),
					attack: { source: 'disadvantage' },
					test: { source: 'disadvantage' },
					skill: { source: 'disadvantage' },
				};
				break;
			case 'grappled':
				statusEffectsTables.grappled = {
					_id: staticID('grappled'),
					name: _i18nConditions('Grappled'),
				};
				break;
			case 'heavilyEncumbered':
				statusEffectsTables.heavilyEncumbered = {
					_id: staticID('heavilyEncumbered'),
					name: _i18nConditions('HeavilyEncumbered'),
					attack: { source: 'disadvantage' },
					conc: { source: 'disadvantage' },
					save: { source: 'disadvantage' },
					skill: { source: 'disadvantage' },
					test: { source: 'disadvantage' },
					use: { source: 'disadvantage' },
				};
				break;
			case 'incapacitated':
				statusEffectsTables.incapacitated = {
					_id: staticID('incapacitated'),
					name: _i18nConditions('Incapacitated'),
				};
				break;
			case 'invisible':
				statusEffectsTables.invisible = {
					_id: staticID('invisible'),
					name: _i18nConditions('Invisible'),
					attack: {
						source: 'advantage',
						target: 'disadvantage',
					},
				};
				break;
			case 'paralyzed':
				statusEffectsTables.paralyzed = {
					_id: staticID('paralyzed'),
					name: _i18nConditions('Paralyzed'),
					save: { source: ['str', 'dex'].includes(abilityId) ? 'fail' : '' },
					attack: { target: 'advantage' },
					damage: { target: !!distance && distance <= 5 ? 'critical' : '' },
				};
				break;
			case 'petrified':
				statusEffectsTables.petrified = {
					_id: staticID('petrified'),
					name: _i18nConditions('Petrified'),
					save: { source: ['str', 'dex'].includes(abilityId) ? 'fail' : '' },
					attack: { target: 'advantage' },
				};
				break;
			case 'poisoned':
				statusEffectsTables.poisoned = {
					_id: staticID('poisoned'),
					name: _i18nConditions('Poisoned'),
					attack: { source: 'disadvantage' },
					skill: { source: 'disadvantage' },
					test: { source: 'disadvantage' },
				};
				break;
			case 'prone':
				statusEffectsTables.prone = {
					_id: staticID('prone'),
					name: _i18nConditions('Prone'),
					attack: {
						source: 'disadvantage',
						target: !!distance && distance <= 5 ? 'advantage' : 'disadvantage',
					},
				};
				break;
			case 'restrained':
				statusEffectsTables.restrained = {
					_id: staticID('restrained'),
					name: _i18nConditions('Restrained'),
					attack: {
						source: 'disadvantage',
						target: 'advantage',
					},
					save: { source: abilityId == 'dex' ? 'disadvantage' : '' },
				};
				break;
			case 'silenced':
				statusEffectsTables.silenced = {
					_id: staticID('silenced'),
					name: _i18nConditions('Silenced'),
					use: { source: item?.system.properties.has('vocal') ? 'fail' : '' },
				};
				break;
			case 'stunned':
				statusEffectsTables.stunned = {
					_id: staticID('stunned'),
					name: _i18nConditions('Stunned'),
					attack: { target: 'advantage' },
					save: { source: ['dex', 'str'].includes(abilityId) ? 'fail' : '' },
				};
				break;
			case 'unconscious':
				statusEffectsTables.unconscious = {
					_id: staticID('unconscious'),
					name: _i18nConditions('Unconscious'),
					attack: { target: 'advantage' },
					damage: { target: !!distance && distance <= 5 ? 'critical' : '' },
					save: { source: ['dex', 'str'].includes(abilityId) ? 'fail' : '' },
				};
				break;
			case 'dodging':
				statusEffectsTables.dodging = {
					_id: staticID('dodging'),
					name: _i18nConditions('Dodging'),
					attack: {
						target:
							_canSee(targetToken, token) && !targetActor.statuses('incapacitated') && !!Object.values(targetActor.system.attributes.movement).find((value) => typeof value === 'number' && !!value)
								? 'disadvantage'
								: '',
					},
					save: {
						source:
							abilityId == 'dex' && !actor.statuses.has('incapacitated') && !!Object.values(targetActor.system.attributes.movement).find((value) => typeof value === 'number' && !!value)
								? 'advantage'
								: '',
					},
				};
				break;
			case 'hiding':
				statusEffectsTables.hiding = {
					_id: staticID('hiding'),
					name: _i18nConditions('Hiding'),
					attack: { source: 'advantage' },
				};
				break;
			case 'raging':
				statusEffectsTables.raging = {
					id: 'raging',
					_id: staticID('raging'),
					name: _localize('AC5E.Raging'),
					save: { source: abilityId === 'str' && actor.armor?.system.type.value !== 'heavy' ? 'advantage' : '' },
					test: { source: abilityId === 'str' && actor.armor?.system.type.value !== 'heavy' ? 'advantage' : '' },
					use: { source: item?.type === 'spell' ? 'fail' : '' },
				};
				break;
			case 'underWaterCombat':
				statusEffectsTables.underwaterCombat = {
					id: 'underwater',
					_id: staticID('underwater'),
					name: _localize('AC5E.UnderwaterCombat'),
					attack: {
						source:
							(item?.system.actionType === 'mwak' && !actor.system.attributes.movement.swim && !['dagger', 'javelin', 'shortsword', 'spear', 'trident'].includes(item?.baseItem)) ||
							(item?.system.actionType === 'rwak' &&
								!['lightcrossbow', 'handcrossbow', 'heavycrossbow', 'net'].includes(item?.baseItem) &&
								!item?.system.properties.thr &&
								distance <= item?.system.range.value)
								? 'disadvantage'
								: item?.system.actionType === 'rwak' && distance > item?.system.range.value
								? 'fail'
								: '',
					},
				};
				break;
			default:
				break;
		}
	}

	return statusEffectsTables;
}

function automatedItemsTables({ actor, token, targetActor, targetToken, abilityId, distance, exhaustionLevel, item } = {}) {
	const automatedItems = {};

	automatedItems.ass = [];
}

export function ac5eSettingsChecks({ actor, token, item, abilityId, hook, ac5eConfig, target, targetsSize }) {
	let change = undefined;
	const { inRange, range, nearbyFoe } = _autoRanged(item, token, target);
	const { hasStealthDisadvantage, notProficient } = _autoArmor(actor, abilityId);
	const heavilyEncumbered = _autoEncumbrance(actor, abilityId);
	if (['use', 'attack'].includes(hook)) {
		if (nearbyFoe == true) {
			ac5eConfig.source.disadvantage.push(_localize('AC5E.NearbyFoe'));
			change = true;
		}
		if (inRange == false && targetsSize == 1) {
			ac5eConfig.source.fail.push(_localize('AC5E.OutOfRange')); //to-do: clean that
			change = true;
		}
		if (range == 'long' && targetsSize == 1) {
			ac5eConfig.source.disadvantage.push(_localize('RangeLong'));
			change = true;
		}
	}
	if (['attack', 'use', 'save', 'skill', 'test'].includes(hook)) {
		if (hasStealthDisadvantage) {
			ac5eConfig.source.disadvantage.push(`${_localize(hasStealthDisadvantage)} (${_localize('ItemEquipmentStealthDisav')})`);
			change = true;
		}
		if (notProficient) {
			ac5eConfig.source.disadvantage.push(`${_localize(notProficient)} (${_localize('NotProficient')})`);
			change = true;
		}
	}
	if (['conc'].includes(hook)) {
	}
	return change;
}

function ac5eFlagsChecks({ actor, targetActor, ac5eConfig, hook, actorType, item, abilityId, skillId /*distance*/ }) {
	//flags that affect actor (source)
	//flags that affect others (target)
	//flags that work like auras

	if (foundry.utils.isEmpty(ac5eConfig))
		ac5eConfig = {
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
		};
	const validFlags = {};
	actor.appliedEffects.filter((effect) =>
		effect.changes
			.filter((change) => ['ac5e', 'automated-conditions-5e'].some((t) => change.key.includes(t)) && change.key.includes(hook))
			.forEach((el) => {
				const mode = el.key.split('.').at(-1);
				const actorType = el.key.split('.').at(-2);
				validFlags[effect.name] = {
					name: effect.name,
					[actorType]: {
						[mode]: getMode({
							actor,
							targetActor,
							abilityId,
							skillId,
							hook,
							item,
							value: el.value,
							actorType,
						}),
					},
				};
			})
	);

	console.log(validFlags.size, validFlags);

	if (foundry.utils.isEmpty(validFlags)) return false;
	for (const el in validFlags) {
		console.log(el);
		ac5eConfig[actorType][el[actorType]?.critical ? 'critical' : el[actorType]?.advantage ? 'advantage' : 'disadvantage'].push(el);
	}
	return ac5eConfig;

	//special functions\\
	function getMode() {
		if (['1', true].includes(value)) return true;
		if (['0', false].includes(value)) return false;
		const {
			DND5E: { abilities, damageTypes, healingTypes, creatureTypes, itemProperties, skills, validProperties, weaponTypes },
			statusEffects,
		} = CONFIG || {};

		const values = value.split(';');
		const isOneTrue = values.some((v) => {
			let mult;
			if (v.includes('!')) {
				v = v.split('!')[1];
				mult = '!';
			}
			if (!!abilities[v] && [abilityId, item.system.abilityMod].includes(abilities[v])) return Roll.safeEval(mult + true);
			if (!!damageTypes[v] && item.getDerivedDamageLabel().some((dl) => dl.damageType == damageTypes[v])) return Roll.safeEval(mult + true);
			if (!!healingTypes[v] && item.getDerivedDamageLabel().some((dl) => dl.damageType == healingTypes[v])) return Roll.safeEval(mult + true);
			if (!!creatureTypes[v] && ((actorType == 'source' && raceOrType(actor) === creatureTypes[v]) || (actorType == 'target' && raceOrType(targetActor) === creatureTypes[v])))
				return Roll.safeEval(mult + true);
			if (!!itemProperties[v] && item.system.properties.has(itemProperties[v])) return Roll.safeEval(mult + true);
			if (!!skills[v] && skillId === skills[v]) return Roll.safeEval(mult + true);
			if (statusEffects.some((s) => s.id === v) && ((actorType == 'source' && actor.statuses.has(v)) || (actorType == 'target' && targetActor.statuses.has(v)))) return Roll.safeEval(mult + true);
			return Roll.safeEval(mult + true);
		});
		return isOneTrue;
	}
}

function raceOrType(actor) {
	const systemData = actor?.system;
	if (!systemData) return '';
	if (systemData.details.race) return (systemData.details?.race?.name ?? systemData.details?.race)?.toLocaleLowerCase() ?? '';
	return systemData.details.type?.value?.toLocaleLowerCase() ?? '';
}

function staticID(id) {
	id = `dnd5e${id}`;
	if (id.length >= 16) return id.substring(0, 16);
	return id.padEnd(16, '0');
}

//function _i18nConditions(name) {
//	const str = `EFFECT.DND5E.Status${name}`;
//	if (game.i18n.has(str)) return game.i18n.localize(str);
//	return game.i18n.localize(`DND5E.Con${name}`);
//}

//function _localize(string) {
//	return game.i18n.translations.DND5E[string] ?? game.i18n.localize(string);
//}

/*
*/
/*
flags.ac5e.save.source.advantage CUSTOM dex;poison;blinded       if the source makes a save, roll with advantage if that is a dex, or against poison or against blinded              
flags.ac5e.save.target.disadvantage CUSTOM dex;poison;blinded    if an item forces a target to make a save, roll with disadvantage if its a dex, or deals poison damage, or applied blinded effect.


flags.ac5e.damage.target.critical CUSTOM dragon;radiant;prone
flags.ac5e.damage.source.critical CUSTOM false
flags.ac5e.conc.target.disadvantage  CUSTOM  force the target to make concentration with disadvantage.
*/
