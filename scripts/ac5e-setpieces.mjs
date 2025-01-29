import { _calcAdvantageMode, _getDistance, _hasAppliedEffects, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _canSee, _raceOrType, _staticID } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

//for exhaustion I think it's better to pass to this function directly `Exhaustion X` where X is the relevant Exhaustion level.
export function _ac5eChecks({ actor, token, targetActor, targetToken, ac5eConfig, hook, abilityId, distance, activity }) {
	const actorTypes = { source: actor };
	if (targetActor) actorTypes.target = targetActor;
	for (const actorType in actorTypes) {
		for (const status of actorTypes[actorType].statuses) {
			let test, exhaustionLvl;
			if (status.includes('exhaustion') && settings.autoExhaustion) {
				exhaustionLvl = actor.system.attributes.exhaustion;
				const toCheckExhaustionLevel = exhaustionLvl >= 3 ? 3 : 1;
				test = testStatusEffectsTables({ token, actor, targetToken, targetActor, distance, abilityId })?.[status][toCheckExhaustionLevel][hook]?.[actorType];
			} else if (!status.includes('exhaustion')) {
				test = testStatusEffectsTables({ token, actor, targetToken, targetActor, distance, abilityId })?.[status]?.[hook]?.[actorType];
			}
			if (!test) continue;
			ac5eConfig[actorType][test].push(testStatusEffectsTables({ exhaustionLvl })?.[status].name);
		}
	}
	ac5eConfig = ac5eFlags({ actor, targetActor, ac5eConfig, hook, activity, abilityId, distance });
	return ac5eConfig;
}

function testStatusEffectsTables({ actor, token, targetActor, targetToken, abilityId, distance, exhaustionLvl, activity } = {}) {
	const statusEffectsTables = {};
	const modernRules = settings.dnd5eModernRules;
	const item = activity?.item;
	statusEffectsTables.blinded = {
		_id: _staticID('blinded'),
		name: _i18nConditions('Blinded'),
		attack: { source: 'disadvantage', target: 'advantage' },
		//no automation for fail for ability checks based on sight
	};
	statusEffectsTables.charmed = {
		_id: _staticID('charmed'),
		name: _i18nConditions('Charmed'),
		check: { target: 'advantage' },
	};
	statusEffectsTables.deafened = {
		_id: _staticID('deafened'),
		name: _i18nConditions('Deafened'),
		//no automation for fail for ability checks based on hearing
	};
	statusEffectsTables.exhaustion = {
		_id: _staticID('exhaustion'),
		1: {
			check: {
				//ability checks and skills
				source: 'disadvantage',
			},
			skill: { source: 'disadvantage' },
		},
		3: {
			check: { source: 'disadvantage' },
			skill: { source: 'disadvantage' },
			attack: { source: 'disadvantage' },
			save: { source: 'disadvantage' },
			death: { source: 'disadvantage' },
			conc: { source: 'disadvantage' },
		},
		name: `${_i18nConditions('Exhaustion')} ${exhaustionLvl}`,
	};
	statusEffectsTables.frightened = {
		_id: _staticID('frightened'),
		name: _i18nConditions('Frightened'),
		attack: { source: 'disadvantage' },
		check: { source: 'disadvantage' },
		skills: { source: 'disadvantage' },
	};
	statusEffectsTables.grappled = {
		_id: _staticID('grappled'),
		name: _i18nConditions('Grappled'),
	};
	statusEffectsTables.incapacitated = {
		_id: _staticID('incapacitated'),
		name: _i18nConditions('Incapacitated'),
	};
	statusEffectsTables.invisible = {
		_id: _staticID('invisible'),
		name: _i18nConditions('Invisible'),
		attack: { source: 'advantage', target: 'disadvantage' },
	};
	statusEffectsTables.paralyzed = {
		_id: _staticID('paralyzed'),
		name: _i18nConditions('Paralyzed'),
		save: { source: ['str', 'dex'].includes(abilityId) ? 'fail' : '' },
		attack: { target: 'advantage' },
		damage: { target: !!distance && distance <= 5 ? 'critical' : '' },
	};
	statusEffectsTables.petrified = {
		_id: _staticID('petrified'),
		name: _i18nConditions('Petrified'),
		save: {
			source: ['str', 'dex'].includes(abilityId) ? 'fail' : '',
		},
		attack: { target: 'advantage' },
	};
	statusEffectsTables.poisoned = {
		_id: _staticID('poisoned'),
		name: _i18nConditions('Poisoned'),
		attack: { source: 'disadvantage' },
		skill: { source: 'disadvantage' },
		check: { source: 'disadvantage' },
	};
	statusEffectsTables.prone = {
		_id: _staticID('prone'),
		name: _i18nConditions('Prone'),
		attack: {
			source: 'disadvantage',
			target: !!distance && distance <= 5 ? 'advantage' : 'disadvantage',
		},
	};
	statusEffectsTables.restrained = {
		_id: _staticID('restrained'),
		name: _i18nConditions('Restrained'),
		attack: {
			source: 'disadvantage',
			target: 'advantage',
		},
		save: { source: abilityId == 'dex' ? 'disadvantage' : '' },
	};
	statusEffectsTables.silenced = {
		_id: _staticID('silenced'),
		name: _i18nConditions('Silenced'),
		use: { source: item?.system.properties.has('vocal') ? 'fail' : '' },
	};
	statusEffectsTables.stunned = {
		_id: _staticID('stunned'),
		name: _i18nConditions('Stunned'),
		attack: { target: 'advantage' },
		save: { source: ['dex', 'str'].includes(abilityId) ? 'fail' : '' },
	};
	statusEffectsTables.unconscious = {
		_id: _staticID('unconscious'),
		name: _i18nConditions('Unconscious'),
		attack: { target: 'advantage' },
		damage: { target: !!distance && distance <= 5 ? 'critical' : '' },
		save: { source: ['dex', 'str'].includes(abilityId) ? 'fail' : '' },
	};

	if (settings.expandedConditions) {
		statusEffectsTables.dodging = {
			_id: _staticID('dodging'),
			name: _i18nConditions('Dodging'),
			attack: {
				target: _canSee(targetToken, token) && !targetActor?.statuses.has('incapacitated') && !!Object.values(targetActor.system.attributes.movement).find((value) => typeof value === 'number' && !!value) ? 'disadvantage' : '',
			},
			save: {
				source: abilityId == 'dex' && !actor.statuses.has('incapacitated') && !!Object.values(actor.system.attributes.movement).find((value) => typeof value === 'number' && !!value) ? 'advantage' : '',
			},
		};
		statusEffectsTables.hiding = {
			_id: _staticID('hiding'),
			name: _i18nConditions('Hiding'),
			attack: { source: 'advantage' },
		};
		statusEffectsTables.raging = {
			id: 'raging',
			_id: _staticID('raging'),
			name: _localize('AC5E.Raging'),
			source: {
				save: abilityId === 'str' && actor.armor?.system.type.value !== 'heavy' ? 'advantage' : '',
				check: abilityId === 'str' && actor.armor?.system.type.value !== 'heavy' ? 'advantage' : '',
				use: item?.type === 'spell' ? 'fail' : '',
			},
		};
		statusEffectsTables.underwaterCombat = {
			id: 'underwater',
			_id: _staticID('underwater'),
			name: _localize('AC5E.UnderwaterCombat'),
			source: {
				attack: (item?.system.actionType === 'mwak' && !actor.system.attributes.movement.swim && !['dagger', 'javelin', 'shortsword', 'spear', 'trident'].includes(item?.baseItem)) || (item?.system.actionType === 'rwak' && !['lightcrossbow', 'handcrossbow', 'heavycrossbow', 'net'].includes(item?.baseItem) && !item?.system.properties.thr && distance <= item?.system.range.value) ? 'disadvantage' : item?.system.actionType === 'rwak' && distance > item?.system.range.value ? 'fail' : '',
			},
		};
	}
	return statusEffectsTables;
}

function automatedItemsTables({ actor, token, targetActor, targetToken, abilityId, distance, exhaustionLvl, item } = {}) {
	const automatedItems = {};
}

function ac5eAutoSettingsTables({ actor, token, item, abilityId, skillId }) {
	const ac5eAutoSettings = {};
	if (settings.autoRanged && ['rwak', 'rsak'].includes(item.system.actionType)) {
		const { nearbyFoe } = _autoRanged(item, token);
		if (nearbyFoe) {
			ac5eAutoSettings.nearbyFoe = {
				name: _localize('AC5E.NearbyFoe'),
				attack: { source: 'disadvantage' },
			};
		}
	}
}

function ac5eFlags({ actor, targetActor, ac5eConfig, hook, activity, abilityId, skillId /*distance*/ }) {
	//flags that affect actor (source)
	//flags that affect others (target)
	//flags that work like auras
	const item = activity?.item;

	function activityDamageTypes(a) {
		if (['attack', 'damage', 'save'].includes(a?.type)) return a.damage.parts.reduce((acc, d) => acc.concat([...d.types] ?? []), []);
	}

	const validFlags = {};

	actor.appliedEffects.filter((effect) =>
		effect.changes
			.filter((change) => ['ac5e', 'automated-conditions-5e'].some((t) => change.key.includes(t)) && change.key.includes(hook))
			.forEach((el) => {
				const mode = el.key.split('.').at(-1);
				const actorType = el.key.split('.').at(-2);
				validFlags[effect.name] = {
					//name: effect.name,
					actorType,
					mode,
					evaluation: getMode({
						actor,
						targetActor,
						abilityId,
						skillId,
						hook,
						activity,
						value: el.value,
						actorType,
					}),
				};
			})
	);
	if (foundry.utils.isEmpty(validFlags)) return ac5eConfig;
	for (const el in validFlags) {
		console.log(el);
		const { actorType, evaluation, mode, name } = validFlags[el];
		if (evaluation) ac5eConfig[actorType][mode].push(el);
	}
	return ac5eConfig;

	//special functions\\
	function getMode({ actor, targetActor, abilityId, skillId, hook, activity, value, actorType }) {
		if (['1', true].includes(value)) return true;
		if (['0', false].includes(value)) return false;
		const {
			DND5E: { abilities, damageTypes, healingTypes, creatureTypes, itemProperties, skills, validProperties, weaponTypes },
			statusEffects,
		} = CONFIG || {};

		const values = value.split(';');
		const isOneTrue = values.some((v) => {
			let mult = null;
			if (v.includes('!')) {
				v = v.split('!')[1];
				mult = '!';
			}
			if (!!abilities[v] && [abilityId, activity.ability].includes(abilities[v])) return Roll.safeEval(mult + true);
			if (!!damageTypes[v] && activityDamageTypes(activity).includes(damageTypes[v])) return Roll.safeEval(mult + true);
			if (!!healingTypes[v] && activityDamageTypes(activity).includes(healingTypes[v])) return Roll.safeEval(mult + true);
			if (!!creatureTypes[v] && ((actorType == 'source' && _raceOrType(actor) === creatureTypes[v]) || (actorType == 'target' && _raceOrType(targetActor) === creatureTypes[v]))) return Roll.safeEval(mult + true);
			if (!!itemProperties[v] && item.system.properties.has(itemProperties[v])) return Roll.safeEval(mult + true);
			if (!!skills[v] && skillId === skills[v]) return Roll.safeEval(mult + true);
			if (statusEffects.some((s) => s.id === v) && ((actorType == 'source' && actor.statuses.has(v)) || (actorType == 'target' && targetActor?.statuses.has(v)))) return Roll.safeEval(mult + true);
			if (statusEffects.some((s) => s.name === v.capitalize()) && actorType === 'target') return Roll.safeEval(mult + true);
			return Roll.safeEval(mult + true);
		});
		return isOneTrue;
	}
}

/*
flags.ac5e.save.source.advantage CUSTOM dex;poison;blinded       if the source makes a save, roll with advantage if that is a dex, or against poison or against blinded              
flags.ac5e.save.target.disadvantage CUSTOM dex;poison;blinded    if an item forces a target to make a save, roll with disadvantage if its a dex, or deals poison damage, or applied blinded effect.


flags.ac5e.damage.target.critical CUSTOM dragon;radiant;prone
flags.ac5e.damage.source.critical CUSTOM false
flags.ac5e.conc.target.disadvantage  CUSTOM  force the target to make concentration with disadvantage.
*/
