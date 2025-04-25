import { _ac5eSafeEval, _activeModule, _canSee, _calcAdvantageMode, _createEvaluationSandbox, _dispositionCheck, _getActionType, _getActivityDamageTypes, _getActivityEffectsStatusRiders, _getDistance, _getEffectOriginToken, _hasAppliedEffects, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _raceOrType, _staticID } from './ac5e-helpers.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

export function _ac5eChecks({ ac5eConfig, subjectToken, opponentToken }) {
	//ac5eConfig.options {ability, activity, distance, hook, skill, tool, isConcentration, isDeathSave, isInitiative}
	const options = ac5eConfig.options;
	const { ability, activity, distance, hook, skill, tool, isConcentration, isDeathSave, isInitiative } = options;

	const actorTypes = {};
	if (subjectToken) actorTypes.subject = subjectToken.actor;
	if (opponentToken) actorTypes.opponent = opponentToken.actor;
	for (const actorType in actorTypes) {
		const actor = actorTypes[actorType];
		if (foundry.utils.isEmpty(actor)) continue;
		for (const status of actor.statuses) {
			let test, exhaustionLvl;
			if (status.includes('exhaustion') && settings.autoExhaustion) {
				exhaustionLvl = actor.system.attributes.exhaustion;
				const toCheckExhaustionLevel = exhaustionLvl >= 3 ? 3 : 1;
				test = testStatusEffectsTables({ subjectToken, opponentToken, ac5eConfig })?.[status][toCheckExhaustionLevel][hook]?.[actorType];
			} else if (!status.includes('exhaustion')) {
				test = testStatusEffectsTables({ subjectToken, opponentToken, ac5eConfig })?.[status]?.[hook]?.[actorType];
			}
			if (!test) continue;
			if (settings.debug) console.log(actorType, test);
			ac5eConfig[actorType][test].push(testStatusEffectsTables({ ac5eConfig, exhaustionLvl })?.[status].name);
		}
		// for (const item of actor.items) {
		// 	if (![_localize('AC5E.Items.DwarvenResilience'), _localize('AC5E.Items.AuraOfProtection')].includes(item.name)) continue;
		// 	if (hook === 'save' && activity?.type !== hook && _activeModule('midi-qol')) activity = activity.item.system.activities.getByType('save')[0];
		// 	//fromUuidSync(ac5eConfig?.preAC5eConfig?.midiOptions?.saveActivityUuid); doesn't work because MidiQOL:
		// 	// 1. doesn't pass a saveActivityUuid
		// 	// 2. when a save activity is triggered by as Use Other Activity, the associated activity is the initial one and not the Save activity.
		// 	const test = automatedItemsTables({ subjectToken, opponentToken, options })?.[item.name]?.[hook]?.[actorType];
		// 	if (settings.debug) console.log({ hook, test, actorType, activity });
		// 	if (!test) continue;

		// 	ac5eConfig[actorType][test].push(automatedItemsTables({})?.[item.name].name);
		// }
	}
	ac5eConfig = ac5eFlags({ ac5eConfig, subjectToken, opponentToken });
	if (settings.debug) console.log('AC5E._ac5eChecks:', { ac5eConfig });
	//	ac5eConfig = automatedItemsTables({ subject, subjectToken, opponent, opponentToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options });
	return ac5eConfig;
}

function testStatusEffectsTables({ ac5eConfig, subjectToken, opponentToken, exhaustionLvl } = {}) {
	const statusEffectsTables = {};
	const { ability, activity, distance, hook, skill, tool, isConcentration, isDeathSave, isInitiative } = ac5eConfig.options;
	const subject = subjectToken?.actor;
	const opponent = opponentToken?.actor;
	const modernRules = settings.dnd5eModernRules;
	const item = activity?.item;
	statusEffectsTables.blinded = {
		_id: _staticID('blinded'),
		name: _i18nConditions('Blinded'),
		attack: { subject: !_canSee(subjectToken, opponentToken) ? 'disadvantage' : '', opponent: !_canSee(opponentToken, subjectToken) ? 'advantage' : '' },
		//no automation for fail for ability checks based on sight
	};
	statusEffectsTables.charmed = {
		_id: _staticID('charmed'),
		name: _i18nConditions('Charmed'),
		check: { subject: subject?.appliedEffects.some((effect) => effect.statuses.has('charmed') && effect.origin && _getEffectOriginToken(effect)?.actor.uuid === opponent?.uuid) ? 'advantage' : '' },
		use: { subject: subject?.appliedEffects.some((effect) => effect.statuses.has('charmed') && effect.origin && _getEffectOriginToken(effect)?.actor.uuid === opponent?.uuid) ? 'fail' : '' },
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
				subject: 'disadvantage',
			},
			// skill: { subject: 'disadvantage' },
		},
		3: {
			check: { subject: 'disadvantage' },
			save: { subject: 'disadvantage' },
			attack: { subject: 'disadvantage' },
			// death: { subject: 'disadvantage' },
			// conc: { subject: 'disadvantage' },
		},
		name: `${_i18nConditions('Exhaustion')} ${exhaustionLvl}`,
	};
	statusEffectsTables.frightened = {
		_id: _staticID('frightened'),
		name: _i18nConditions('Frightened'),
		attack: { subject: subject?.appliedEffects.some((effect) => effect.statuses.has('frightened') && ((_getEffectOriginToken(effect) && _canSee(subjectToken, _getEffectOriginToken(effect))) || !effect.origin)) ? 'disadvantage' : '' },
		check: { subject: subject?.appliedEffects.some((effect) => effect.statuses.has('frightened') && ((_getEffectOriginToken(effect) && _canSee(subjectToken, _getEffectOriginToken(effect))) || !effect.origin)) ? 'disadvantage' : '' },
	};
	statusEffectsTables.grappled = {
		_id: _staticID('grappled'),
		name: _i18nConditions('Grappled'),
		attack: { subject: subject?.appliedEffects.some((effect) => effect.statuses.has('grappled') && (_getEffectOriginToken(effect) !== opponentToken || !effect.origin)) ? 'disadvantage' : '' },
	};
	statusEffectsTables.incapacitated = {
		_id: _staticID('incapacitated'),
		name: _i18nConditions('Incapacitated'),
		use: { subject: ['action', 'bonus', 'reaction'].includes(activity?.activation?.type) ? 'fail' : '' },
		check: { subject: modernRules && isInitiative ? 'disadvantage' : '' },
	};
	statusEffectsTables.invisible = {
		_id: _staticID('invisible'),
		name: _i18nConditions('Invisible'),
		attack: { subject: !_canSee(opponentToken, subjectToken) ? 'advantage' : '', opponent: !_canSee(subjectToken, opponentToken) ? 'disadvantage' : '' },
		check: { subject: modernRules && isInitiative ? 'advantage' : '' },
	};
	statusEffectsTables.paralyzed = {
		_id: _staticID('paralyzed'),
		name: _i18nConditions('Paralyzed'),
		save: { subject: ['str', 'dex'].includes(ability) ? 'fail' : '' },
		attack: { opponent: 'advantage' },
		damage: { opponent: !!distance && distance <= 5 ? 'critical' : '' },
	};
	statusEffectsTables.petrified = {
		_id: _staticID('petrified'),
		name: _i18nConditions('Petrified'),
		save: { subject: ['str', 'dex'].includes(ability) ? 'fail' : '' },
		attack: { opponent: 'advantage' },
	};
	statusEffectsTables.poisoned = {
		_id: _staticID('poisoned'),
		name: _i18nConditions('Poisoned'),
		attack: { subject: 'disadvantage' },
		check: { subject: 'disadvantage' },
	};
	statusEffectsTables.prone = {
		_id: _staticID('prone'),
		name: _i18nConditions('Prone'),
		attack: {
			subject: 'disadvantage',
			opponent: !!distance && distance <= 5 ? 'advantage' : 'disadvantage',
		},
	};
	statusEffectsTables.restrained = {
		_id: _staticID('restrained'),
		name: _i18nConditions('Restrained'),
		attack: {
			subject: 'disadvantage',
			opponent: 'advantage',
		},
		save: { subject: ability == 'dex' ? 'disadvantage' : '' },
	};
	statusEffectsTables.silenced = {
		_id: _staticID('silenced'),
		name: _i18nConditions('Silenced'),
		use: { subject: item?.system.properties.has('vocal') ? 'fail' : '' },
	};
	statusEffectsTables.stunned = {
		_id: _staticID('stunned'),
		name: _i18nConditions('Stunned'),
		attack: { opponent: 'advantage' },
		save: { subject: ['dex', 'str'].includes(ability) ? 'fail' : '' },
	};
	if (modernRules)
		statusEffectsTables.surprised = {
			_id: _staticID('surprised'),
			name: _i18nConditions('Surprised'),
			check: { subject: modernRules && isInitiative ? 'disadvantage' : '' },
		};
	statusEffectsTables.unconscious = {
		_id: _staticID('unconscious'),
		name: _i18nConditions('Unconscious'),
		attack: { opponent: 'advantage' },
		damage: { opponent: !!distance && distance <= 5 ? 'critical' : '' },
		save: { subject: ['dex', 'str'].includes(ability) ? 'fail' : '' },
	};
	if (settings.expandedConditions) {
		statusEffectsTables.dodging = {
			_id: _staticID('dodging'),
			name: _i18nConditions('Dodging'),
			attack: { opponent: opponentToken && subject && _canSee(opponentToken, subjectToken) && !opponent?.statuses.has('incapacitated') && !!Object.values(opponent?.system.attributes.movement).find((value) => typeof value === 'number' && !!value) ? 'disadvantage' : '' },
			save: { subject: ability == 'dex' && subject && !subject?.statuses.has('incapacitated') && !!Object.values(subject?.system.attributes.movement).find((value) => typeof value === 'number' && !!value) ? 'advantage' : '' },
		};
		statusEffectsTables.hiding = {
			_id: _staticID('hiding'),
			name: _i18nConditions('Hiding'),
			attack: { subject: 'advantage', opponent: 'disadvantage' },
			check: { subject: modernRules && isInitiative ? 'advantage' : '' },
		};
		statusEffectsTables.raging = {
			id: 'raging',
			_id: _staticID('raging'),
			name: _localize('AC5E.Raging'),
			save: { subject: ability === 'str' && subject?.armor?.system.type.value !== 'heavy' ? 'advantage' : '' },
			check: { subject: ability === 'str' && subject?.armor?.system.type.value !== 'heavy' ? 'advantage' : '' },
			use: { subject: item?.type === 'spell' ? 'fail' : '' },
		};
		statusEffectsTables.underwaterCombat = {
			id: 'underwater',
			_id: _staticID('underwater'),
			name: _localize('AC5E.UnderwaterCombat'),
			attack: { subject: (_getActionType(activity) === 'mwak' && !subject?.system.attributes.movement.swim && !['dagger', 'javelin', 'shortsword', 'spear', 'trident'].includes(item?.system.type.baseItem)) || (_getActionType(activity) === 'rwak' && !['lightcrossbow', 'handcrossbow', 'heavycrossbow', 'net'].includes(item?.system.type.baseItem) && !item?.system.properties.has('thr') && distance <= activity?.range.value) ? 'disadvantage' : _getActionType(activity) === 'rwak' && distance > activity?.range.value ? 'fail' : '' },
		};
	}
	return statusEffectsTables;
}

function automatedItemsTables({ ac5eConfig, subjectToken, opponentToken }) {
	const automatedItems = {};
	const { activity } = ac5eConfig.options;
	automatedItems[_localize('AC5E.Items.DwarvenResilience')] = {
		name: _localize('AC5E.Items.DwarvenResilience'),
		save: { subject: _getActivityEffectsStatusRiders(activity)['poisoned'] ? 'advantage' : '' },
	};
	return automatedItems;
}

// function ac5eAutoSettingsTables({ ac5eConfig, subjectToken, opponent, opponentToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options }) {
// 	const ac5eAutoSettings = {};
// 	if (settings.autoRanged && ['rwak', 'rsak'].includes(item.system.actionType)) {
// 		const { nearbyFoe } = _autoRanged(item, subjectToken);
// 		if (nearbyFoe) {
// 			ac5eAutoSettings.nearbyFoe = {
// 				name: _localize('AC5E.NearbyFoe'),
// 				attack: { subject: 'disadvantage' },
// 			};
// 		}
// 	}
// }

function ac5eFlags({ ac5eConfig, subjectToken, opponentToken }) {
	const options = ac5eConfig.options;
	const { ability, activity, distance, hook, skill, tool, isConcentration, isDeathSave, isInitiative } = ac5eConfig;
	const subject = subjectToken?.actor;
	const opponent = opponentToken?.actor;
	const item = activity?.item;
	options.activityDamageTypes = _getActivityDamageTypes(activity);
	options.activityEffectsStatusRiders = _getActivityEffectsStatusRiders(activity);

	//flags.ac5e.<actionType>.<mode>
	// actionType = all/attack/damage/check/conc/death/init/save/skill/tool
	// in options there are options.isDeathSave options.isInitiative options.isConcentration

	if (settings.debug) console.error('AC5E._ac5eFlags:', { subject, subjectToken, opponent, opponentToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options });

	const distanceToSource = (token) => _getDistance(token, subjectToken);
	// const distanceToTarget = (token) => _getDistance(token, opponentToken);

	const evaluationData = _createEvaluationSandbox({ subjectToken, opponentToken, options });

	const getActorAndModeType = (el, includeAuras = false) => {
		let actorType, mode; //actorType designates which actor's rollData should this be evaluated upon; subject, opponent, aura
		const testTypes = el.key?.toLocaleLowerCase();
		if (testTypes.includes('grants')) actorType = 'opponent';
		else if (includeAuras && testTypes.includes('aura')) actorType = 'subject';
		else if (!testTypes.includes('aura') && !testTypes.includes('grants')) actorType = 'subject';
		if (testTypes.includes('dis')) mode = 'disadvantage';
		else if (testTypes.includes('adv')) mode = 'advantage';
		else if (testTypes.includes('crit')) mode = 'critical';
		else if (testTypes.includes('fail')) mode = 'fail';
		else if (testTypes.includes('bonus')) mode = 'bonus';
		else if (testTypes.includes('success')) mode = 'success';
		else if (testTypes.includes('fumble')) mode = 'fumble';
		return { actorType, mode, isAll: el.key.includes('all') };
	};
	const validFlags = {};
	const inAuraRadius = (token, radius) => {
		radius = radius?.match(/\d+$/)?.[0];
		if (!radius) return false;
		return distanceToSource(token) <= radius;
	};
	const effectChangesTest = ({ token = undefined, change, actorType, hook }) => {
		const isAC5eFlag = ['ac5e', 'automated-conditions-5e'].some((scope) => change.key.includes(scope));
		if (!isAC5eFlag) return false;
		const hasHook = change.key.includes('all') || change.key.includes(hook) || (skill && change.key.includes('skill')) || (tool && change.key.includes('tool'));
		if (!hasHook) return false;
		if (change.value.includes('allies') && !_dispositionCheck(token, subjectToken, 'same')) return false;
		if (change.value.includes('enemies') && _dispositionCheck(token, subjectToken, 'same')) return false;
		if (actorType !== 'aura') return true;
		const isAura = change.key.includes('aura');
		if (!isAura) return false;
		if (!change.value.includes('includeSelf') && token === subjectToken) return false;
		const radius = change.value.split(';')?.find((e) => e.includes('radius')) || undefined;
		if (inAuraRadius(token, radius)) return true;
		else return false;
	};
	// const placeablesWithRelevantAuras = {};
	canvas.tokens.placeables.filter((token) => {
		if (token.actor.items.getName(_localize('AC5E.Items.AuraOfProtection'))) {
		}
		const distanceTokenToAuraSource = distanceToSource(token);
		const currentCombatant = game.combat?.active ? game.combat.combatant?.tokenId : null;
		const auraTokenEvaluationData = foundry.utils.mergeObject(
			evaluationData,
			{
				auraActor: token.actor.getRollData(),
				['auraActor.creatureType']: Object.values(_raceOrType(token.actor, 'all')),
				['auraActor.token']: token,
				['auraActor.tokenSize']: token.document.width * token.document.height,
				['auraActor.tokenElevation']: token.document.elevation,
				['auraActor.tokenSenses']: token.document.detectionModes,
				['auraActor.tokenUuid']: token.document.uuid,
				isAuraSourceTurn: currentCombatant === token?.id,
			},
			{ inplace: false }
		);
		token.actor.appliedEffects.filter((effect) =>
			effect.changes
				.filter((change) => effectChangesTest({ token, change, actorType: 'aura', hook }))
				.forEach((el) => {
					const { actorType, mode } = getActorAndModeType(el, true);
					if (!actorType || !mode) return;
					let bonus =
						mode === 'bonus'
							? el.value
								.split(';')
								?.find((e) => e.includes('bonus='))
								.split('bonus=')?.[1]
							: '';
					const auraOnlyOne = el.value.includes('singleAura');
					const blacklist = ['radius', 'bonus', 'singleAura', 'includeSelf', 'allies', 'enemies'];
					let valuesToEvaluate = el.value
						.split(';')
						.reduce((acc, v) => {
							const trimmed = v.trim();
							if (trimmed && !blacklist.some((q) => trimmed.includes(q))) {
								acc.push(trimmed);
							}
							return acc;
						}, [])
						.join(';');
					if (!valuesToEvaluate) valuesToEvaluate = 'true';
					if  (valuesToEvaluate.includes('effectOriginTokenId')) valuesToEvaluate.replaceAll('effectOriginTokenId', _getEffectOriginToken(effect, 'id'));
					if (bonus.includes('@')) bonus = Roll.fromTerms(Roll.parse(bonus, subject.getRollData())).formula;
					if (bonus.includes('rollingActor')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('rollingActor.', '@'), subject.getRollData())).formula;
					if (bonus.includes('auraActor')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('auraActor.', '@'), token.actor.getRollData())).formula;
					if (bonus.includes('##')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('##', '@'), opponent.getRollData())).formula;
					if (bonus.includes('targetActor')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('targetActor.', '@'), opponent.getRollData())).formula;
					const evaluation = getMode({ value: valuesToEvaluate, auraTokenEvaluationData });
					if (!evaluation) return;

					if (auraOnlyOne) {
						const sameAuras = Object.keys(validFlags).filter((key) => key.includes(effect.name));
						if (sameAuras.length) {
							for (const aura of sameAuras) {
								const auraBonus = validFlags[aura].bonus;
								if ((!auraBonus.includes('d') && !bonus.includes('d') && auraBonus < bonus) || ((!auraBonus.includes('d') || !bonus.includes('d')) && validFlags[aura].distance > _getDistance(token, subjectToken))) {
									delete validFlags[aura];
								} else return true;
							}
						}
					}
					validFlags[`${effect.name} - Aura (${token.name})`] = { name: effect.name, actorType, mode, bonus, evaluation, isAura: true, auraUuid: effect.uuid, auraTokenUuid: token.document.uuid, distance: _getDistance(token, subjectToken) };
				})
		);
	});

	subject?.appliedEffects.filter((effect) =>
		effect.changes
			.filter((change) => effectChangesTest({ token: subjectToken, change, actorType: 'subject', hook }))
			.forEach((el) => {
				const { actorType, mode } = getActorAndModeType(el, false);
				if (!actorType || !mode) return;
				let bonus =
					mode === 'bonus'
						? el.value
							.split(';')
							?.find((e) => e.includes('bonus='))
							.split('bonus=')?.[1]
						: '';
				if (bonus.includes('@')) bonus = Roll.fromTerms(Roll.parse(bonus, subject.getRollData())).formula;
				if (bonus.includes('rollingActor')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('rollingActor.', '@'), subject.getRollData())).formula;
				// if (bonus.includes('auraActor')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('auraActor', '@'), token.actor.getRollData())).formula;
				if (bonus.includes('##')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('##', '@'), opponent.getRollData())).formula;
				if (bonus.includes('targetActor')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('targetActor.', '@'), opponent.getRollData())).formula;
				const blacklist = ['radius', 'bonus', 'singleAura', 'includeSelf', 'allies', 'enemies'];
				let valuesToEvaluate = el.value
					.split(';')
					.reduce((acc, v) => {
						const trimmed = v.trim();
						if (trimmed && !blacklist.some((q) => trimmed.includes(q))) {
							acc.push(trimmed);
						}
						return acc;
					}, [])
					.join(';');
				if (!valuesToEvaluate) valuesToEvaluate = 'true';
				if (valuesToEvaluate.includes('effectOriginTokenId')) valuesToEvaluate.replaceAll('effectOriginTokenId', _getEffectOriginToken(effect, 'id'));
				validFlags[effect.id] = {
					name: effect.name,
					actorType,
					mode,
					bonus,
					evaluation: getMode({ value: valuesToEvaluate }),
				};
			})
	);
	if (opponent)
		opponent.appliedEffects.filter((effect) =>
			effect.changes
				.filter((change) => effectChangesTest({ opponentToken, change, actorType: 'opponent', hook }))
				.forEach((el) => {
					const { actorType, mode } = getActorAndModeType(el, false);
					if (!actorType || !mode) return;
					let bonus =
						mode === 'bonus'
							? el.value
								.split(';')
								?.find((e) => e.includes('bonus='))
								.split('bonus=')?.[1]
							: '';
					if (bonus.includes('@')) bonus = Roll.fromTerms(Roll.parse(bonus, subject.getRollData())).formula;
					if (bonus.includes('rollingActor')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('rollingActor.', '@'), subject.getRollData())).formula;
					// if (bonus.includes('auraActor') bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('auraActor', '@'), token.actor.getRollData())).formula;
					if (bonus.includes('##')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('##', '@'), opponent.getRollData())).formula;
					if (bonus.includes('targetActor')) bonus = Roll.fromTerms(Roll.parse(bonus.replaceAll('targetActor.', '@'), opponent.getRollData())).formula;
					const blacklist = ['radius', 'bonus', 'singleAura', 'includeSelf', 'allies', 'enemies'];
					let valuesToEvaluate = el.value
						.split(';')
						.reduce((acc, v) => {
							const trimmed = v.trim();
							if (trimmed && !blacklist.some((q) => trimmed.includes(q))) {
								acc.push(trimmed);
							}
							return acc;
						}, [])
						.join(';');
					if (!valuesToEvaluate) valuesToEvaluate = 'true';
					if (valuesToEvaluate.includes('effectOriginTokenId')) valuesToEvaluate.replaceAll('effectOriginTokenId', _getEffectOriginToken(effect, 'id'));
					validFlags[effect.id] = {
						name: effect.name,
						actorType,
						mode,
						bonus,
						evaluation: getMode({ value: valuesToEvaluate }),
					};
				})
		);
	if (foundry.utils.isEmpty(validFlags)) return ac5eConfig;
	for (const el in validFlags) {
		let { actorType, evaluation, mode, name, bonus, isAura } = validFlags[el];
		if (mode.includes('skill') || mode.includes('tool')) mode = 'check';
		if (evaluation) {
			if (!isAura) ac5eConfig[actorType][mode].push(name); //there can be active effects named the same so validFlags.name would disregard any other that the first
			else ac5eConfig[actorType][mode].push(el); //the auras have already the token name in the el passed, so is not an issue
			if (bonus) ac5eConfig.parts = ac5eConfig.parts.concat(bonus);
		}
	}
	return ac5eConfig;

	//special functions\\
	function getMode({ value, auraTokenEvaluationData }) {
		if (['1', 'true'].includes(value)) return true;
		if (['0', 'false'].includes(value)) return false;
		const clauses = value
			.split(';')
			.map((v) => v.trim())
			.filter(Boolean);
		if (settings.debug) console.log('AC5E._getMode:', { clauses });

		return clauses.some((clause) => {
			let mult = null;
			if (clause.startsWith('!')) {
				clause = clause.slice(1).trim();
				mult = '!';
			}
			const sandbox = auraTokenEvaluationData ? auraTokenEvaluationData : evaluationData;
			return mult ? !_ac5eSafeEval({ expression: clause, sandbox }) : _ac5eSafeEval({ expression: clause, sandbox });
		});
	}
}
