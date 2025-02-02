import { _canSee, _calcAdvantageMode, _getActionType, _getDistance, _getEffectOriginToken, _hasAppliedEffects, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _raceOrType, _staticID } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

export function _ac5eChecks({ actor, token, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options, }) {
	const actorTypes = { source: actor };
	if (targetActor) actorTypes.target = targetActor;
	for (const actorType in actorTypes) {
		for (const status of actorTypes[actorType].statuses) {
			let test, exhaustionLvl;
			if (status.includes('exhaustion') && settings.autoExhaustion) {
				exhaustionLvl = actor.system.attributes.exhaustion;
				const toCheckExhaustionLevel = exhaustionLvl >= 3 ? 3 : 1;
				test = testStatusEffectsTables({ token, actor, targetToken, targetActor, distance, ability, options, skill, tool })?.[status][toCheckExhaustionLevel][hook]?.[actorType];
			} else if (!status.includes('exhaustion')) {
				test = testStatusEffectsTables({ token, actor, targetToken, targetActor, distance, ability, options, skill, tool })?.[status]?.[hook]?.[actorType];
			}
			if (!test) continue;
			ac5eConfig[actorType][test].push(testStatusEffectsTables({ exhaustionLvl })?.[status].name);
		}
	}
	ac5eConfig = ac5eFlags({ actor, token, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options, });
	return ac5eConfig;
}

function testStatusEffectsTables({ actor, token, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options, exhaustionLvl } = {}) {
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
		activity: { source: actor?.appliedEffects.some((effect) => effect.statuses.has('charmed') && effect.origin && _getEffectOriginToken(effect)?.actor.uuid === targetActor?.uuid) ? 'fail' : '' },
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
			// skill: { source: 'disadvantage' },
		},
		3: {
			check: { source: 'disadvantage' },
			save: { source: 'disadvantage' },
			attack: { source: 'disadvantage' },
			// death: { source: 'disadvantage' },
			// conc: { source: 'disadvantage' },
		},
		name: `${_i18nConditions('Exhaustion')} ${exhaustionLvl}`,
	};
	statusEffectsTables.frightened = {
		_id: _staticID('frightened'),
		name: _i18nConditions('Frightened'),
		attack: { source: actor?.appliedEffects.some((effect) => effect.statuses.has('frightened') && ((_getEffectOriginToken(effect) && _canSee(token, _getEffectOriginToken(effect))) || !effect.origin)) ? 'disadvantage' : '' },
		check: { source: actor?.appliedEffects.some((effect) => effect.statuses.has('frightened') && ((_getEffectOriginToken(effect) && _canSee(token, _getEffectOriginToken(effect))) || !effect.origin)) ? 'disadvantage' : '' },
		// skills: { source: actor?.appliedEffects.some((effect) => effect.statuses.has('frightened') && ((_getEffectOriginToken(effect) && _canSee(token, _getEffectOriginToken(effect))) || !effect.origin)) ? 'disadvantage' : '' },
	};
	statusEffectsTables.grappled = {
		_id: _staticID('grappled'),
		name: _i18nConditions('Grappled'),
		attack: { source: actor?.appliedEffects.some((effect) => effect.statuses.has('grappled') && (_getEffectOriginToken(effect) === targetToken || !effect.origin)) ? 'disadvantage' : '' },
	};
	statusEffectsTables.incapacitated = {
		_id: _staticID('incapacitated'),
		name: _i18nConditions('Incapacitated'),
		activity: { source: ['action', 'bonus', 'reaction'].includes(activity?.activation?.type) ? 'fail' : '' },
		check: { source: modernRules && options?.testInitiative ? 'disadvantage' : '' },
	};
	statusEffectsTables.invisible = {
		_id: _staticID('invisible'),
		name: _i18nConditions('Invisible'),
		attack: { source: 'advantage', target: 'disadvantage' },
		check: { source: modernRules && options?.testInitiative ? 'advantage' : '' },
	};
	statusEffectsTables.paralyzed = {
		_id: _staticID('paralyzed'),
		name: _i18nConditions('Paralyzed'),
		save: { source: ['str', 'dex'].includes(ability) ? 'fail' : '' },
		attack: { target: 'advantage' },
		damage: { target: !!distance && distance <= 5 ? 'critical' : '' },
	};
	statusEffectsTables.petrified = {
		_id: _staticID('petrified'),
		name: _i18nConditions('Petrified'),
		save: { source: ['str', 'dex'].includes(ability) ? 'fail' : '',	},
		attack: { target: 'advantage' },
	};
	statusEffectsTables.poisoned = {
		_id: _staticID('poisoned'),
		name: _i18nConditions('Poisoned'),
		attack: { source: 'disadvantage' },
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
		save: { source: ability == 'dex' ? 'disadvantage' : '' },
	};
	statusEffectsTables.silenced = {
		_id: _staticID('silenced'),
		name: _i18nConditions('Silenced'),
		activity: { source: item?.system.properties.has('vocal') ? 'fail' : '' },
	};
	statusEffectsTables.stunned = {
		_id: _staticID('stunned'),
		name: _i18nConditions('Stunned'),
		attack: { target: 'advantage' },
		save: { source: ['dex', 'str'].includes(ability) ? 'fail' : '' },
	};
	statusEffectsTables.unconscious = {
		_id: _staticID('unconscious'),
		name: _i18nConditions('Unconscious'),
		attack: { target: 'advantage' },
		damage: { target: !!distance && distance <= 5 ? 'critical' : '' },
		save: { source: ['dex', 'str'].includes(ability) ? 'fail' : '' },
	};

	if (settings.expandedConditions) {
		statusEffectsTables.dodging = {
			_id: _staticID('dodging'),
			name: _i18nConditions('Dodging'),
			attack: { target: targetToken && _canSee(targetToken, token) && !targetActor?.statuses.has('incapacitated') && !!Object.values(targetActor?.system.attributes.movement).find((value) => typeof value === 'number' && !!value) ? 'disadvantage' : '', },
			save: { source: ability == 'dex' && !actor?.statuses.has('incapacitated') && !!Object.values(actor?.system.attributes.movement).find((value) => typeof value === 'number' && !!value) ? 'advantage' : '', },
		};
		statusEffectsTables.hiding = {
			_id: _staticID('hiding'),
			name: _i18nConditions('Hiding'),
			attack: { source: 'advantage', target: 'disadvantage' },
			check: { source: modernRules && options?.testInitiative ? 'advantage' : '' },
		};
		statusEffectsTables.raging = {
			id: 'raging',
			_id: _staticID('raging'),
			name: _localize('AC5E.Raging'),
			save: { actor: ability === 'str' && actor.armor?.system.type.value !== 'heavy' ? 'advantage' : '', },
			check: { source: ability === 'str' && actor.armor?.system.type.value !== 'heavy' ? 'advantage' : '', },
			activity: { source: item?.type === 'spell' ? 'fail' : '', },
		};
		statusEffectsTables.underwaterCombat = {
			id: 'underwater',
			_id: _staticID('underwater'),
			name: _localize('AC5E.UnderwaterCombat'),
			attack: { source: (_getActionType(activity) === 'mwak' && !actor?.system.attributes.movement.swim && !['dagger', 'javelin', 'shortsword', 'spear', 'trident'].includes(item?.system.type.baseItem)) || (_getActionType(activity) === 'rwak' && !['lightcrossbow', 'handcrossbow', 'heavycrossbow', 'net'].includes(item?.system.type.baseItem) && !item?.system.properties.has('thr') && distance <= activity?.range.value) ? 'disadvantage' : _getActionType(activity) === 'rwak' && distance > activity?.range.value ? 'fail' : '', },
		};
	}
	return statusEffectsTables;
}

function automatedItemsTables({ actor, token, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options, } = {}) {
	const automatedItems = {};
}

function ac5eAutoSettingsTables({ actor, token, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options, }) {
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

function ac5eFlags({ actor, token, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options, }) {
	//flags that affect actor (source)
	//flags that affect others (target)
	//flags that work like auras
	const item = activity?.item;
	function activityDamageTypes(a) {
		if (!a) return [];
		if (['attack', 'damage', 'save'].includes(a?.type)) return a.damage.parts.reduce((acc, d) => acc.concat([...d.types] ?? []), []);
	}

	const validFlags = {};
	actor.appliedEffects.filter((effect) =>
		effect.changes
			.filter((change) => ['ac5e', 'automated-conditions-5e'].some((t) => change.key.includes(t)) && (change.key.includes(hook) || (skill && change.key.includes('skill')) || tool && change.key.includes('tool')))
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
						token,
						targetToken,
						distance,
						ability,
						skill,
						tool,
						hook,
						activity,
						value: el.value,
						actorType,
						options
					}),
				};
			})
	);
	if (targetActor) 
		targetActor.appliedEffects.filter((effect) =>
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
							token,
							targetToken,
							distance,
							ability,
							skill,
							tool,
							hook,
							activity,
							value: el.value,
							actorType,
							options
						}),
					};
				})
		);
	if (foundry.utils.isEmpty(validFlags)) return ac5eConfig;
	for (const el in validFlags) {
		const { actorType, evaluation, mode, name } = validFlags[el];
		if (mode.includes('skill') || mode.includes('tool')) mode = 'check';
		if (evaluation) ac5eConfig[actorType][mode].push(el);
	}
	return ac5eConfig;

	//special functions\\
	function getMode({ actor, token, targetActor, targetToken, hook, ability, distance, activity, tool, skill, options, value, actorType }) {
		if (['1', 'true'].includes(value)) return true;
		if (['0', 'false'].includes(value)) return false;
		const {
			DND5E: { abilities, abilityActivationTypes, activityTypes, attackClassifications, attackModes, attackTypes, creatureTypes, damageTypes, healingTypes, itemProperties, skills, tools, spellSchools, spellcastingTypes, spellLevels, validProperties, weaponTypes },
			statusEffects,
		} = CONFIG || {};
		const deprecatedAttackTypes = { mwak: 'Melee weapon attack', msak: 'Melee spell attack', rwak: 'Ranged weapon attack', rsak: 'Ranged spell attack' };
		const spellLevel = options?.spellLevel;  //to-do: pass along somehow spellLevel cast
		const item = activity?.item;
		const values = value.split(';').map(v => v.trim()).filter(v => v !== "");
		const comparisonOps = {
			"=": (a, b) => a === b,
			">": (a, b) => a > b,
			"<": (a, b) => a < b,
			">=": (a, b) => a >= b,
			"<=": (a, b) => a <= b,
		};
		//if one is true
		return values.some((v) => {
			let mult = null;
			let comparison = '<=';
			let numericValue = null;
			let spellLevelMatch = false;
			if (v.includes('!')) {
			    v = v.split('!')[1]; // Remove '!'
			    mult = '!';
				comparison = null;
			}
			else {
				const match = v.match(/^(<=|>=|=|<|>)/);
				if (match) {
				    comparison = match[0]; // Extract comparison operator
				    v = v.substring(comparison.length).trim(); // Remove comparison from string
				}
			}
			const spellCheck = v.match(/^spell(\d+)$/);
			if (spellCheck) {
			    numericValue = Number(spellCheck[1]);
			    spellLevelMatch = true;
			} else {
			    numericValue = Number(v);
			    spellLevelMatch = false;
			}
			if (isNaN(numericValue)) {
			    numericValue = null;
			}
			const targetDocument = actorType === 'source' ? actor : targetActor;
			if (numericValue && distance && comparisonOps[comparison](distance, numericValue)) return true;
			if (!!abilities[v] && [ability, activity?.ability].includes(v)) return Roll.safeEval(mult + true);
			if (!!activityTypes[v] && activity?.type === v) return Roll.safeEval(mult + true);
			if (!!attackClassifications[v] && activity?.attack?.type?.classification === v) return Roll.safeEval(mult + true);
			if (!!attackModes[v] && activity?.attackMode === v) return Roll.safeEval(mult + true);
			if (!!attackTypes[v] && activity?.attack?.type?.value === v) return Roll.safeEval(mult + true);
			if (!!damageTypes[v] && activityDamageTypes(activity).includes(v)) return Roll.safeEval(mult + true);
			if (!!deprecatedAttackTypes[v] && _getActionType(activity) === v) return Roll.safeEval(mult + true);
			if (!!healingTypes[v] && activityDamageTypes(activity).includes(v)) return Roll.safeEval(mult + true);
			if (!!itemProperties[v] && item?.system.properties.has(v)) return Roll.safeEval(mult + true);
			if (!!skills[v] && skill === v) return Roll.safeEval(mult + true);
			if (!!spellSchools[v] && item?.system.school === v) return Roll.safeEval(mult + true);
			if (!!spellcastingTypes[v] && item?.system.school === v) return Roll.safeEval(mult + true);
			if (statusEffects.some((s) => s.id === v) && ((actorType == 'source' && actor.statuses.has(v)) || (actorType == 'target' && targetActor?.statuses.has(v)))) return Roll.safeEval(mult + true);
			//if (statusEffects.some((s) => s.name === v.capitalize()) && actorType === 'target') return Roll.safeEval(mult + true);  //incomplete
			if (!!targetDocument && Object.entries(_raceOrType(targetDocument, 'all')).includes(v)) return Roll.safeEval(mult + true);
			if (!!tools[v] && tool === v) return Roll.safeEval(mult + true);
			if (!!validProperties[v] && item?.type === v) return Roll.safeEval(mult + true);
			if (spellLevelMatch && spellLevel && comparison && numericValue) return comparisonOps[comparison](spellLevel, numericValue);
			else if (spellLevelMatch && spellLevel && !comparison && numericValue) return Roll.safeEval(mult + true);
			//to-do: check the default logic. Should be returning false if none found above.
			return false;
		});
	}
}

/*
flags.ac5e.save.source.advantage CUSTOM dex;poison;blinded       if the source makes a save, roll with advantage if that is a dex, or against poison or against blinded              
flags.ac5e.save.target.disadvantage CUSTOM dex;poison;blinded    if an item forces a target to make a save, roll with disadvantage if its a dex, or deals poison damage, or applied blinded effect.


flags.ac5e.damage.target.critical CUSTOM dragon;radiant;prone
flags.ac5e.damage.source.critical CUSTOM false
*/
