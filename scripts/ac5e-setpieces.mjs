import { _canSee, _calcAdvantageMode, _getActionType, _getDistance, _getEffectOriginToken, _hasAppliedEffects, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _raceOrType, _staticID } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

export function _ac5eChecks({ sourceActor, sourceToken, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options }) {
	const actorTypes = {};
	if (sourceActor) actorTypes.source = sourceActor;
	if (targetActor) actorTypes.target = targetActor;
	for (const actorType in actorTypes) {
		const actor = actorTypes[actorType];
		for (const status of actor.statuses) {
			let test, exhaustionLvl;
			if (status.includes('exhaustion') && settings.autoExhaustion) {
				exhaustionLvl = actor.system.attributes.exhaustion;
				const toCheckExhaustionLevel = exhaustionLvl >= 3 ? 3 : 1;
				test = testStatusEffectsTables({ sourceToken, sourceActor, targetToken, targetActor, distance, ability, options, skill, tool })?.[status][toCheckExhaustionLevel][hook]?.[actorType];
			} else if (!status.includes('exhaustion')) {
				test = testStatusEffectsTables({ sourceToken, sourceActor, targetToken, targetActor, distance, ability, options, skill, tool })?.[status]?.[hook]?.[actorType];
			}
			if (!test) continue;
			ac5eConfig[actorType][test].push(testStatusEffectsTables({ exhaustionLvl })?.[status].name);
		}
	}
	ac5eConfig = ac5eFlags({ sourceActor, sourceToken, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options });
	return ac5eConfig;
}

function testStatusEffectsTables({ sourceActor, sourceToken, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options, exhaustionLvl } = {}) {
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
		check: { source: targetActor?.appliedEffects.some((effect) => effect.statuses.has('charmed') && effect.origin && _getEffectOriginToken(effect)?.actor.uuid === sourceActor?.uuid) ? 'advantage' : '' },
		activity: { source: sourceActor?.appliedEffects.some((effect) => effect.statuses.has('charmed') && effect.origin && _getEffectOriginToken(effect)?.actor.uuid === targetActor?.uuid) ? 'fail' : '' },
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
				target: 'disadvantage',
			},
			// skill: { source: 'disadvantage' },
		},
		3: {
			check: { target: 'disadvantage' },
			save: { target: 'disadvantage' },
			attack: { source: 'disadvantage' },
			// death: { source: 'disadvantage' },
			// conc: { source: 'disadvantage' },
		},
		name: `${_i18nConditions('Exhaustion')} ${exhaustionLvl}`,
	};
	statusEffectsTables.frightened = {
		_id: _staticID('frightened'),
		name: _i18nConditions('Frightened'),
		attack: { source: sourceActor?.appliedEffects.some((effect) => effect.statuses.has('frightened') && ((_getEffectOriginToken(effect) && _canSee(targetToken, _getEffectOriginToken(effect))) || !effect.origin)) ? 'disadvantage' : '' },
		check: { target: targetActor?.appliedEffects.some((effect) => effect.statuses.has('frightened') && ((_getEffectOriginToken(effect) && _canSee(targetToken, _getEffectOriginToken(effect))) || !effect.origin)) ? 'disadvantage' : '' },
	};
	statusEffectsTables.grappled = {
		_id: _staticID('grappled'),
		name: _i18nConditions('Grappled'),
		attack: { source: sourceActor?.appliedEffects.some((effect) => effect.statuses.has('grappled') && (_getEffectOriginToken(effect) !== targetToken || !effect.origin)) ? 'disadvantage' : '' },
	};
	statusEffectsTables.incapacitated = {
		_id: _staticID('incapacitated'),
		name: _i18nConditions('Incapacitated'),
		activity: { source: ['action', 'bonus', 'reaction'].includes(activity?.activation?.type) ? 'fail' : '' },
		check: { target: modernRules && options?.testInitiative ? 'disadvantage' : '' },
	};
	statusEffectsTables.invisible = {
		_id: _staticID('invisible'),
		name: _i18nConditions('Invisible'),
		attack: { source: 'advantage', target: 'disadvantage' },
		check: { target: modernRules && options?.testInitiative ? 'advantage' : '' },
	};
	statusEffectsTables.paralyzed = {
		_id: _staticID('paralyzed'),
		name: _i18nConditions('Paralyzed'),
		save: { target: ['str', 'dex'].includes(ability) ? 'fail' : '' },
		attack: { target: 'advantage' },
		damage: { target: !!distance && distance <= 5 ? 'critical' : '' },
	};
	statusEffectsTables.petrified = {
		_id: _staticID('petrified'),
		name: _i18nConditions('Petrified'),
		save: { target: ['str', 'dex'].includes(ability) ? 'fail' : '' },
		attack: { target: 'advantage' },
	};
	statusEffectsTables.poisoned = {
		_id: _staticID('poisoned'),
		name: _i18nConditions('Poisoned'),
		attack: { source: 'disadvantage' },
		check: { target: 'disadvantage' },
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
		save: { target: ability == 'dex' ? 'disadvantage' : '' },
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
		save: { target: ['dex', 'str'].includes(ability) ? 'fail' : '' },
	};
	statusEffectsTables.unconscious = {
		_id: _staticID('unconscious'),
		name: _i18nConditions('Unconscious'),
		attack: { target: 'advantage' },
		damage: { target: !!distance && distance <= 5 ? 'critical' : '' },
		save: { target: ['dex', 'str'].includes(ability) ? 'fail' : '' },
	};

	if (settings.expandedConditions) {
		statusEffectsTables.dodging = {
			_id: _staticID('dodging'),
			name: _i18nConditions('Dodging'),
			attack: { target: targetToken && targetActor && _canSee(targetToken, sourceToken) && !targetActor?.statuses.has('incapacitated') && !!Object.values(targetActor?.system.attributes.movement).find((value) => typeof value === 'number' && !!value) ? 'disadvantage' : '' },
			save: { target: ability == 'dex' && targetActor && !targetActor?.statuses.has('incapacitated') && !!Object.values(targetActor?.system.attributes.movement).find((value) => typeof value === 'number' && !!value) ? 'advantage' : '' },
		};
		statusEffectsTables.hiding = {
			_id: _staticID('hiding'),
			name: _i18nConditions('Hiding'),
			attack: { source: 'advantage', target: 'disadvantage' },
			check: { target: modernRules && options?.testInitiative ? 'advantage' : '' },
		};
		statusEffectsTables.raging = {
			id: 'raging',
			_id: _staticID('raging'),
			name: _localize('AC5E.Raging'),
			save: { target: ability === 'str' && targetActor?.armor?.system.type.value !== 'heavy' ? 'advantage' : '' },
			check: { target: ability === 'str' && targetActor?.armor?.system.type.value !== 'heavy' ? 'advantage' : '' },
			activity: { source: item?.type === 'spell' ? 'fail' : '' },
		};
		statusEffectsTables.underwaterCombat = {
			id: 'underwater',
			_id: _staticID('underwater'),
			name: _localize('AC5E.UnderwaterCombat'),
			attack: { source: (_getActionType(activity) === 'mwak' && !sourceActor?.system.attributes.movement.swim && !['dagger', 'javelin', 'shortsword', 'spear', 'trident'].includes(item?.system.type.baseItem)) || (_getActionType(activity) === 'rwak' && !['lightcrossbow', 'handcrossbow', 'heavycrossbow', 'net'].includes(item?.system.type.baseItem) && !item?.system.properties.has('thr') && distance <= activity?.range.value) ? 'disadvantage' : _getActionType(activity) === 'rwak' && distance > activity?.range.value ? 'fail' : '' },
		};
	}
	return statusEffectsTables;
}

function automatedItemsTables({ sourceActor, sourceToken, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options } = {}) {
	const automatedItems = {};
}

function ac5eAutoSettingsTables({ sourceActor, sourceToken, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options }) {
	const ac5eAutoSettings = {};
	if (settings.autoRanged && ['rwak', 'rsak'].includes(item.system.actionType)) {
		const { nearbyFoe } = _autoRanged(item, sourceToken);
		if (nearbyFoe) {
			ac5eAutoSettings.nearbyFoe = {
				name: _localize('AC5E.NearbyFoe'),
				attack: { source: 'disadvantage' },
			};
		}
	}
}

function ac5eFlags({ sourceActor, sourceToken, targetActor, targetToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options }) {
	//flags that affect actor (source)
	//flags that affect others (target)
	//flags that work like auras
	const item = activity?.item;
	const activityAttackMode = ac5eConfig?.attackMode;
	function activityDamageTypes(a) {
		if (!a) return [];
		if (['attack', 'damage', 'save'].includes(a?.type)) return a.damage.parts.reduce((acc, d) => acc.concat([...d.types] ?? []), []);
	}

	const validFlags = {};
	sourceActor?.appliedEffects.filter((effect) =>
		effect.changes
			.filter((change) => ['ac5e', 'automated-conditions-5e'].some((t) => change.key.includes(t)) && (change.key.includes(hook) || (skill && change.key.includes('skill')) || (tool && change.key.includes('tool'))))
			.forEach((el) => {
				const mode = el.key.split('.').at(-1);
				const actorType = el.key.split('.').at(-2);
				validFlags[effect.name] = {
					//name: effect.name,
					actorType,
					mode,
					evaluation: getMode({
						sourceActor,
						targetActor,
						sourceToken,
						targetToken,
						distance,
						ability,
						skill,
						tool,
						hook,
						activity,
						value: el.value,
						actorType,
						options,
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
							sourceActor,
							targetActor,
							sourceToken,
							targetToken,
							distance,
							ability,
							skill,
							tool,
							hook,
							activity,
							value: el.value,
							actorType,
							options,
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
	function getMode({ sourceActor, sourceToken, targetActor, targetToken, hook, ability, distance, activity, tool, skill, options, value, actorType }) {
		if (['1', 'true'].includes(value)) return true;
		if (['0', 'false'].includes(value)) return false;
		const {
			DND5E: { abilities, abilityActivationTypes, activityTypes, attackClassifications, attackModes, attackTypes, creatureTypes, damageTypes, healingTypes, itemProperties, skills, tools, spellSchools, spellcastingTypes, spellLevels, validProperties, weaponTypes },
			statusEffects,
		} = CONFIG || {};
		const deprecatedAttackTypes = { mwak: 'Melee weapon attack', msak: 'Melee spell attack', rwak: 'Ranged weapon attack', rsak: 'Ranged spell attack' };
		const spellLevel = options?.spellLevel; //to-do: pass along somehow spellLevel cast
		const item = activity?.item;
		const values = value
			.split(';')
			.map((v) => v.trim())
			.filter((v) => v !== '');
		const comparisonOps = {
			'=': (a, b) => a === b,
			'>': (a, b) => a > b,
			'<': (a, b) => a < b,
			'>=': (a, b) => a >= b,
			'<=': (a, b) => a <= b,
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
			} else {
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
			console.log(value);
			const raceTargetDocument = actorType === 'source' ? targetActor : sourceActor;
			const getActivityEffectsStatusRiders = (activity) => {
				const statuses = {};
				// const riders = {};
				activity?.applicableEffects.forEach(effect=>{
					console.log(effect)
					Array.from(effect.statuses).forEach(status=>statuses[status]=true);
					effect.flags?.dnd5e?.riders?.statuses?.forEach(rider=>statuses[rider]=true);
				});
				return statuses;
			};
			if (numericValue && distance && comparisonOps[comparison](distance, numericValue)) return true;
			if (!!abilities[v] && [ability, activity?.ability].includes(v)) return Roll.safeEval(mult + true);
			if (!!activityTypes[v] && activity?.type === v) return Roll.safeEval(mult + true);
			if (!!attackClassifications[v] && activity?.attack?.type?.classification === v) return Roll.safeEval(mult + true);
			if (!!attackModes[v] && activityAttackMode === v) return Roll.safeEval(mult + true);
			if (!!attackTypes[v] && (activity?.attack?.type?.value === v || item?.system?.actionType === v)) return Roll.safeEval(mult + true);
			if (!!damageTypes[v] && activityDamageTypes(activity).includes(v)) return Roll.safeEval(mult + true);
			if (!!deprecatedAttackTypes[v] && _getActionType(activity) === v) return Roll.safeEval(mult + true);
			if (!!healingTypes[v] && activityDamageTypes(activity).includes(v)) return Roll.safeEval(mult + true);
			if (!!itemProperties[v] && item?.system.properties.has(v)) return Roll.safeEval(mult + true);
			if (!!skills[v] && skill === v) return Roll.safeEval(mult + true);
			if (!!spellSchools[v] && item?.system.school === v) return Roll.safeEval(mult + true);
			if (!!spellcastingTypes[v] && item?.system.school === v) return Roll.safeEval(mult + true);
			if (actorType === 'target' && getActivityEffectsStatusRiders(activity)[v]) return Roll.safeEval(mult + true);
			if (statusEffects.some((s) => s.id === v) && ((actorType == 'source' && sourceActor?.statuses.has(v)) || (actorType == 'target' && targetActor?.statuses.has(v)))) return Roll.safeEval(mult + true);
			if (!!raceTargetDocument && Object.values(_raceOrType(raceTargetDocument, 'all')).includes(v)) return Roll.safeEval(mult + true);
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
