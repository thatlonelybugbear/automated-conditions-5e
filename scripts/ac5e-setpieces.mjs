import { _ac5eActorRollData, _ac5eSafeEval, _activeModule, _canSee, _calcAdvantageMode, _createEvaluationSandbox, _dispositionCheck, _getActionType, _getActivityEffectsStatusRiders, _getDistance, _getEffectOriginToken, _getItemOrActivity, _hasAppliedEffects, _hasStatuses, _localize, _i18nConditions, _autoArmor, _autoEncumbrance, _autoRanged, _raceOrType, _staticID } from './ac5e-helpers.mjs';
import { _doQueries } from './ac5e-queries.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();

export function _ac5eChecks({ ac5eConfig, subjectToken, opponentToken }) {
	//ac5eConfig.options {ability, activity, distance, hook, skill, tool, isConcentration, isDeathSave, isInitiative}
	if (!foundry.utils.isEmpty(ac5eConfig.subject.forcedAdvantage)) {
		ac5eConfig.subject.advantage = ac5eConfig.subject.forcedAdvantage;
		ac5eConfig.subject.disadvantage = [];
		ac5eConfig.subject.advantageNames = new Set();
		ac5eConfig.subject.disadvantageNames = new Set();
		return ac5eConfig;
	} else if (!foundry.utils.isEmpty(ac5eConfig.subject.forcedDisadvantage)) {
		ac5eConfig.subject.advantage = [];
		ac5eConfig.subject.disadvantage = ac5eConfig.subject.forcedDisadvantage;
		ac5eConfig.subject.advantageNames = new Set();
		ac5eConfig.subject.disadvantageNames = new Set();
		return ac5eConfig;
	}
	const { options } = ac5eConfig;
	const actorTokens = {
		subject: subjectToken?.actor,
		opponent: opponentToken?.actor,
	};

	if (settings.automateStatuses) {
		for (const [type, actor] of Object.entries(actorTokens)) {
			if (foundry.utils.isEmpty(actor)) continue;
			const isSubjectExhausted = settings.autoExhaustion && type === 'subject' && actor?.statuses.has('exhaustion');
			const exhaustionLvl = isSubjectExhausted && actor.system?.attributes.exhaustion >= 3 ? 3 : 1;
			const tables = testStatusEffectsTables({ ac5eConfig, subjectToken, opponentToken, exhaustionLvl, type });

			for (const status of actor.statuses) {
				const test = status === 'exhaustion' && isSubjectExhausted ? tables?.[status]?.[exhaustionLvl]?.[options.hook]?.[type] : tables?.[status]?.[options.hook]?.[type];

				if (!test) continue;
				if (settings.debug) console.log(type, test);
				const effectName = tables?.[status]?.name;
				if (effectName) {
					if (test.includes('advantageNames')) ac5eConfig[type][test].add(effectName);
					else ac5eConfig[type][test].push(effectName);
				}
			}
		}
	}

	ac5eConfig = ac5eFlags({ ac5eConfig, subjectToken, opponentToken });
	if (settings.debug) console.log('AC5E._ac5eChecks:', { ac5eConfig });
	return ac5eConfig;
}

function testStatusEffectsTables({ ac5eConfig, subjectToken, opponentToken, exhaustionLvl, type } = {}) {
	const { ability, activity, distance, hook, isConcentration, isDeathSave, isInitiative } = ac5eConfig.options;

	const subject = subjectToken?.actor;
	const opponent = opponentToken?.actor;
	const modernRules = settings.dnd5eModernRules;
	const item = activity?.item;
	if (activity && !_activeModule('midi-qol')) activity.hasDamage = !foundry.utils.isEmpty(activity?.damage?.parts); //Cannot set property hasDamage of #<MidiActivityMixin> which has only a getter
	const mkStatus = (id, name, data) => ({ _id: _staticID(id), name, ...data });

	const hasStatusFromOpponent = (actor, status, origin) => actor?.appliedEffects.some((effect) => effect.statuses.has(status) && effect.origin && _getEffectOriginToken(effect, 'token')?.actor.uuid === origin?.uuid);

	const checkEffect = (status, mode) => (hasStatusFromOpponent(subject, status, opponent) ? mode : '');

	const isFrightenedByVisibleSource = () => {
		if (type !== 'subject') return false;
		const frightenedEffects = subject?.appliedEffects.filter((effect) => effect.statuses.has('frightened') && effect.origin);
		if (subject?.statuses.has('frightened') && !frightenedEffects.length) return true; //if none of the effects that apply frightened status on the actor have an origin, force true
		return frightenedEffects.some((effect) => {
			const originToken = _getEffectOriginToken(effect, 'token'); //undefined if no effect.origin
			return originToken && _canSee(subjectToken, originToken);
		});
	};

	const subjectMove = Object.values(subject?.system.attributes.movement || {}).some((v) => typeof v === 'number' && v);
	const opponentMove = Object.values(opponent?.system.attributes.movement || {}).some((v) => typeof v === 'number' && v);
	const subjectAlert2014 = !modernRules && subject?.items.some((item) => item.name.includes(_localize('AC5E.Alert')));
	const opponentAlert2014 = !modernRules && opponent?.items.some((item) => item.name.includes(_localize('AC5E.Alert')));

	const tables = {
		blinded: mkStatus('blinded', _i18nConditions('Blinded'), {
			attack: {
				subject: !_canSee(subjectToken, opponentToken) ? 'disadvantage' : '',
				opponent: !_canSee(opponentToken, subjectToken) && !subjectAlert2014 ? 'advantage' : '',
			},
		}),

		charmed: mkStatus('charmed', _i18nConditions('Charmed'), {
			check: { subject: checkEffect('charmed', 'advantage') },
			use: { subject: checkEffect('charmed', 'fail') },
		}),

		deafened: mkStatus('deafened', _i18nConditions('Deafened'), {}),

		exhaustion: mkStatus('exhaustion', `${_i18nConditions('Exhaustion')} ${exhaustionLvl}`, {
			1: { check: { subject: 'disadvantageNames' } },
			3: {
				check: { subject: 'disadvantageNames' },
				save: { subject: 'disadvantageNames' },
				attack: { subject: 'disadvantage' },
			},
		}),

		frightened: mkStatus('frightened', _i18nConditions('Frightened'), {
			attack: { subject: isFrightenedByVisibleSource() ? 'disadvantage' : '' },
			check: { subject: isFrightenedByVisibleSource() ? 'disadvantage' : '' },
		}),

		incapacitated: mkStatus('incapacitated', _i18nConditions('Incapacitated'), {
			use: { subject: ['action', 'bonus', 'reaction'].includes(activity?.activation?.type) ? 'fail' : '' },
			check: { subject: modernRules && isInitiative ? 'disadvantage' : '' },
		}),

		invisible: mkStatus('invisible', _i18nConditions('Invisible'), {
			attack: {
				subject: !opponentAlert2014 && !_canSee(opponentToken, subjectToken) ? 'advantage' : '',
				opponent: !_canSee(subjectToken, opponentToken) ? 'disadvantage' : '',
			},
			check: { subject: modernRules && isInitiative ? 'advantage' : '' },
		}),

		paralyzed: mkStatus('paralyzed', _i18nConditions('Paralyzed'), {
			save: { subject: ['str', 'dex'].includes(ability) ? 'fail' : '' },
			attack: { opponent: 'advantage' },
			damage: { opponent: activity?.hasDamage && distance <= 5 ? 'critical' : '' },
		}),

		petrified: mkStatus('petrified', _i18nConditions('Petrified'), {
			save: { subject: ['str', 'dex'].includes(ability) ? 'fail' : '' },
			attack: { opponent: 'advantage' },
		}),

		poisoned: mkStatus('poisoned', _i18nConditions('Poisoned'), {
			attack: { subject: 'disadvantage' },
			check: { subject: 'disadvantageNames' },
		}),

		prone: mkStatus('prone', _i18nConditions('Prone'), {
			attack: {
				subject: 'disadvantage',
				opponent: distance <= 5 ? 'advantage' : 'disadvantage',
			},
		}),

		restrained: mkStatus('restrained', _i18nConditions('Restrained'), {
			attack: { subject: 'disadvantage', opponent: 'advantage' },
			save: { subject: ability === 'dex' ? 'disadvantageNames' : '' },
		}),

		silenced: mkStatus('silenced', _i18nConditions('Silenced'), {
			use: { subject: item?.system.properties.has('vocal') ? 'fail' : '' },
		}),

		stunned: mkStatus('stunned', _i18nConditions('Stunned'), {
			attack: { opponent: 'advantage' },
			save: { subject: ['dex', 'str'].includes(ability) ? 'fail' : '' },
		}),

		unconscious: mkStatus('unconscious', _i18nConditions('Unconscious'), {
			attack: { opponent: 'advantage' },
			damage: { opponent: activity?.hasDamage && distance <= 5 ? 'critical' : '' },
			save: { subject: ['dex', 'str'].includes(ability) ? 'fail' : '' },
		}),
	};

	if (modernRules) {
		tables.surprised = mkStatus('surprised', _i18nConditions('Surprised'), {
			check: { subject: isInitiative ? 'disadvantage' : '' },
		});
		tables.grappled = mkStatus('grappled', _i18nConditions('Grappled'), {
			attack: {
				subject: subject?.appliedEffects.some((e) => e.statuses.has('grappled') && (!e.origin || _getEffectOriginToken(e, 'token') !== opponentToken)) ? 'disadvantage' : '',
			},
		});
	}

	if (settings.expandedConditions) {
		tables.dodging = mkStatus('dodging', _i18nConditions('Dodging'), {
			attack: {
				opponent: opponentToken && subject && _canSee(opponentToken, subjectToken) && !opponent?.statuses.has('incapacitated') && opponentMove ? 'disadvantage' : '',
			},
			save: {
				subject: ability === 'dex' && subject && !subject?.statuses.has('incapacitated') && subjectMove ? 'advantage' : '',
			},
		});

		tables.hiding = mkStatus('hiding', _i18nConditions('Hiding'), {
			attack: { subject: !opponentAlert2014 ? 'advantage' : '', opponent: 'disadvantage' },
			check: { subject: modernRules && isInitiative ? 'advantage' : '' },
		});

		tables.raging = mkStatus('raging', _localize('AC5E.Raging'), {
			save: {
				subject: ability === 'str' && subject?.armor?.system.type.value !== 'heavy' ? 'advantage' : '',
			},
			check: {
				subject: ability === 'str' && subject?.armor?.system.type.value !== 'heavy' ? 'advantage' : '',
			},
			use: { subject: item?.type === 'spell' ? 'fail' : '' },
		});

		tables.underwaterCombat = mkStatus('underwater', _localize('AC5E.UnderwaterCombat'), {
			attack: {
				subject: (_getActionType(activity) === 'mwak' && !subject?.system.attributes.movement.swim && !['dagger', 'javelin', 'shortsword', 'spear', 'trident'].includes(item?.system.type.baseItem)) || (_getActionType(activity) === 'rwak' && !['lightcrossbow', 'handcrossbow', 'heavycrossbow', 'net'].includes(item?.system.type.baseItem) && !item?.system.properties.has('thr') && distance <= activity?.range.value) ? 'disadvantage' : _getActionType(activity) === 'rwak' && distance > activity?.range.value ? 'fail' : '',
			},
		});
	}

	return tables;
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
	const { ability, activity, distance, hook, skill, tool, isConcentration, isDeathSave, isInitiative } = options;
	const subject = subjectToken?.actor;
	const opponent = opponentToken?.actor;
	const item = activity?.item;

	//flags.ac5e.<actionType>.<mode>
	// actionType = all/attack/damage/check/conc/death/init/save/skill/tool
	// in options there are options.isDeathSave options.isInitiative options.isConcentration

	if (settings.debug) console.error('AC5E._ac5eFlags:', { subject, subjectToken, opponent, opponentToken, ac5eConfig, hook, ability, distance, activity, tool, skill, options });

	const distanceToSource = (token, wallsBlock) => _getDistance(token, subjectToken, false, true, wallsBlock, true);
	const distanceToTarget = (token, wallsBlock) => _getDistance(token, opponentToken, false, true, wallsBlock, true);

	const evaluationData = _createEvaluationSandbox({ subjectToken, opponentToken, options });

	const getActorAndModeType = (el, includeAuras = false) => {
		const key = el.key?.toLowerCase() ?? '';
		const isAll = key.includes('all');

		const actorType = key.includes('grants') ? 'opponent' : (includeAuras && key.includes('aura')) || (!key.includes('aura') && !key.includes('grants')) ? 'subject' : undefined;

		const modeMap = [
			['noadv', 'noAdvantage'],
			['nocrit', 'noCritical'],
			['nodis', 'noDisadvantage'],
			['dis', 'disadvantage'],
			['adv', 'advantage'],
			['thres', 'criticalThreshold'],
			['crit', 'critical'],
			['modifyac', 'targetADC'], //we cleared the conflict with "mod" mode by going first
			['modifydc', 'targetADC'],
			['mod', 'modifiers'],
			['bonus', 'bonus'],
			['fail', 'fail'],
			['fumble', 'fumble'],
			['success', 'success'],
			['extradice', 'extraDice'],
		];

		const mode = modeMap.find(([m]) => key.includes(m))?.[1];
		return { actorType, mode, isAll };
	};

	const validFlags = {};

	//Will return false only in case of both tokens being available AND the value includes allies OR enemies and the test of dispositionCheck returns false;
	const friendOrFoe = (tokenA, tokenB, value) => {
		if (!tokenA || !tokenB) return true;
		const alliesOrEnemies = value.includes('allies') ? 'allies' : value.includes('enemies') ? 'enemies' : null;
		if (!alliesOrEnemies) return true;
		return alliesOrEnemies === 'allies' ? _dispositionCheck(tokenA, tokenB, 'same') : !_dispositionCheck(tokenA, tokenB, 'same');
	};
	const effectChangesTest = ({ change, actorType, hook, effect, effectDeletions, effectUpdates, effectDeletionsGM, effectUpdatesGM, itemUpdatesGM, activityUpdatesGM, auraTokenEvaluationData, evaluationData }) => {
		const isAC5eFlag = ['ac5e', 'automated-conditions-5e'].some((scope) => change.key.includes(scope));
		if (!isAC5eFlag) return false;
		const isAll = change.key.includes('all');
		const isSkill = skill && change.key.includes('skill');
		const isTool = tool && change.key.includes('tool');
		const isConc = isConcentration && hook === 'save' && change.key.includes('conc');
		const isInit = isInitiative && hook === 'check' && change.key.includes('init');
		const isDeath = isDeathSave && hook === 'save' && change.key.includes('death');
		const isModifyAC = change.key.includes('modifyAC') && hook === 'attack';
		const isModifyDC = change.key.includes('modifyDC') && (hook === 'check' || hook === 'save' || isSkill || isTool);
		const modifyHooks = isModifyAC || isModifyDC;
		const hasHook = change.key.includes(hook) || isAll || isConc || isDeath || isInit || isSkill || isTool || modifyHooks;
		if (!hasHook) return false;
		const shouldProceedUses = handleUses({ actorType, change, effect, effectDeletions, effectUpdates, effectDeletionsGM, effectUpdatesGM, itemUpdatesGM, activityUpdatesGM });
		if (!shouldProceedUses) return false;
		if (change.value.toLowerCase().includes('itemlimited')) {
			if (evaluationData && evaluationData.item?.uuid === effect.origin) return true;
			else return false;
		}
		if (change.key.includes('aura') && auraTokenEvaluationData) {
			//isAura
			const auraToken = canvas.tokens.get(auraTokenEvaluationData.auraTokenId);
			if (auraTokenEvaluationData.auraTokenId === (isModifyAC ? opponentToken.id : subjectToken.id)) return change.value.toLowerCase().includes('includeself');
			if (!friendOrFoe(auraToken, isModifyAC ? opponentToken : subjectToken, change.value)) return false;
			let radius = getBlacklistedKeysValue('radius', change.value);
			if (!radius) return false;
			radius = bonusReplacements(radius, auraTokenEvaluationData, true, effect);
			if (!radius) return false;
			if (radius) radius = _ac5eSafeEval({ expression: radius, sandbox: auraTokenEvaluationData, mode: 'formula' });
			if (!radius) return false;
			const distanceTokenToAuraSource = !isModifyAC ? distanceToSource(auraToken, change.value.toLowerCase().includes('wallsblock') && 'sight') : distanceToTarget(auraToken, change.value.toLowerCase().includes('wallsblock') && 'sight');
			if (distanceTokenToAuraSource <= radius) {
				auraTokenEvaluationData.distanceTokenToAuraSource = distanceTokenToAuraSource;
				return true;
			} else return false;
		} else if (change.key.includes('grants')) {
			//isGrants
			if (actorType === 'aura') return false;
			else if (actorType === 'subject' && !(isModifyAC || isModifyDC)) return false;
			else if (actorType === 'opponent' && isModifyDC) return false;
			if (!friendOrFoe(opponentToken, subjectToken, change.value)) return false;
			return true;
		} else {
			//isSelf
			if (actorType === 'aura') return false;
			else if (actorType === 'opponent' && !(isModifyAC || isModifyDC)) return false;
			else if (actorType === 'subject' && isModifyAC) return false;
			if (!friendOrFoe(opponentToken, subjectToken, change.value)) return false;
			return true;
		}
	};

	const blacklist = new Set(['allies', 'bonus', 'enemies', 'includeself', 'itemlimited', 'modifier', 'once', 'radius', 'set', 'singleaura', 'threshold', 'usescount', 'wallsblock']);

	const effectDeletions = [];
	const effectUpdates = [];
	const effectDeletionsGM = [];
	const effectUpdatesGM = [];
	const itemUpdatesGM = [];
	const activityUpdatesGM = [];
	// const placeablesWithRelevantAuras = {};
	canvas.tokens.placeables.filter((token) => {
		if (!token.actor) return false;
		// if (token.actor.items.getName(_localize('AC5E.Items.AuraOfProtection'))) {
		// }
		//const distanceTokenToAuraSource = distanceToSource(token, false);
		const currentCombatant = game.combat?.active ? game.combat.combatant?.tokenId : null;
		let auraTokenEvaluationData;
		auraTokenEvaluationData = foundry.utils.mergeObject(evaluationData, { auraActor: _ac5eActorRollData(token), isAuraSourceTurn: currentCombatant === token?.id, auraTokenId: token.id }, { inplace: false });
		token.actor.appliedEffects.filter((effect) =>
			effect.changes
				.filter((change) => effectChangesTest({ change, actorType: 'aura', hook, effect, effectDeletions, effectUpdates, effectDeletionsGM, effectUpdatesGM, itemUpdatesGM, activityUpdatesGM, auraTokenEvaluationData }))
				.forEach((el) => {
					const { actorType, mode } = getActorAndModeType(el, true);
					if (!actorType || !mode) return;
					const { bonus, modifier, set, threshold } = preEvaluateExpression({ value: el.value, mode, hook, effect, evaluationData: auraTokenEvaluationData, isAura: true });
					const wallsBlock = el.value.toLowerCase().includes('wallsblock') && 'sight';
					const auraOnlyOne = el.value.toLowerCase().includes('singleaura');
					let valuesToEvaluate = el.value
						.split(';')
						.map((v) => v.trim())
						.filter((v) => {
							if (!v) return false;
							const [key] = v.split(/[:=]/).map((s) => s.trim());
							return !blacklist.has(key.toLowerCase());
						})
						.join(';');
					if (!valuesToEvaluate) valuesToEvaluate = mode === 'bonus' && !bonus ? 'false' : 'true';
					if (valuesToEvaluate.includes('effectOriginTokenId')) valuesToEvaluate = valuesToEvaluate.replaceAll('effectOriginTokenId', `"${_getEffectOriginToken(effect, 'id')}"`);

					const evaluation = getMode({ value: valuesToEvaluate, auraTokenEvaluationData });
					if (!evaluation) return;

					if (auraOnlyOne) {
						const sameAuras = Object.keys(validFlags).filter((key) => key.includes(effect.name));
						if (sameAuras.length) {
							for (const aura of sameAuras) {
								const auraBonus = validFlags[aura].bonus;
								// if ((!auraBonus.includes('d') && !bonus.includes('d') && auraBonus < bonus) || ((!auraBonus.includes('d') || !bonus.includes('d')) && validFlags[aura].distance > _getDistance(token, subjectToken, false, true, wallsBlock))) {
								if ((!isNaN(auraBonus) && !isNaN(bonus) && auraBonus < bonus) || ((!isNaN(auraBonus) || !isNaN(bonus)) && validFlags[aura].distance > _getDistance(token, subjectToken, false, true, wallsBlock))) {
									delete validFlags[aura];
								} else return true;
							}
						}
					}
					validFlags[`${effect.name} - Aura (${token.name})`] = { name: effect.name, actorType, mode, bonus, modifier, set, threshold, evaluation, isAura: true, auraUuid: effect.uuid, auraTokenUuid: token.document.uuid, distance: _getDistance(token, subjectToken) };
				})
		);
	});
	if (evaluationData.auraActor) {
		delete evaluationData.distanceTokenToAuraSource; //might be added in the data and we want it gone if not needed
	}
	subject?.appliedEffects.filter((effect) =>
		effect.changes
			.filter((change) => effectChangesTest({ token: subjectToken, change, actorType: 'subject', hook, effect, effectDeletions, effectUpdates, effectDeletionsGM, effectUpdatesGM, itemUpdatesGM, activityUpdatesGM, evaluationData }))
			.forEach((el) => {
				const { actorType, mode } = getActorAndModeType(el, false);
				if (!actorType || !mode) return;
				const { bonus, modifier, set, threshold } = preEvaluateExpression({ value: el.value, mode, hook, effect, evaluationData });
				let valuesToEvaluate = el.value
					.split(';')
					.map((v) => v.trim())
					.filter((v) => {
						if (!v) return false;
						const [key] = v.split(/[:=]/).map((s) => s.trim());
						return !blacklist.has(key.toLowerCase());
					})
					.join(';');
				if (!valuesToEvaluate) valuesToEvaluate = mode === 'bonus' && !bonus ? 'false' : 'true';
				if (valuesToEvaluate.includes('effectOriginTokenId')) valuesToEvaluate = valuesToEvaluate.replaceAll('effectOriginTokenId', `"${_getEffectOriginToken(effect, 'id')}"`);
				validFlags[effect.id] = {
					name: effect.name,
					actorType,
					mode,
					bonus,
					modifier,
					set,
					threshold,
					evaluation: getMode({ value: valuesToEvaluate }),
				};
			})
	);
	if (opponent) {
		opponent.appliedEffects.filter((effect) =>
			effect.changes
				.filter((change) => effectChangesTest({ token: opponentToken, change, actorType: 'opponent', hook, effect, effectDeletions, effectUpdates, effectDeletionsGM, effectUpdatesGM, itemUpdatesGM, activityUpdatesGM, evaluationData }))
				.forEach((el) => {
					const { actorType, mode } = getActorAndModeType(el, false);
					if (!actorType || !mode) return;
					const { bonus, modifier, set, threshold } = preEvaluateExpression({ value: el.value, mode, hook, effect, evaluationData });
					let valuesToEvaluate = el.value
						.split(';')
						.map((v) => v.trim())
						.filter((v) => {
							if (!v) return false;
							const [key] = v.split(/[:=]/).map((s) => s.trim());
							return !blacklist.has(key.toLowerCase());
						})
						.join(';');
					if (!valuesToEvaluate) valuesToEvaluate = mode === 'bonus' && !bonus ? 'false' : 'true';
					if (valuesToEvaluate.includes('effectOriginTokenId')) valuesToEvaluate = valuesToEvaluate.replaceAll('effectOriginTokenId', `"${_getEffectOriginToken(effect, 'id')}"`);
					validFlags[effect.id] = {
						name: effect.name,
						actorType,
						mode,
						bonus,
						modifier,
						set,
						threshold,
						evaluation: getMode({ value: valuesToEvaluate }),
					};
				})
		);
	}
	if (foundry.utils.isEmpty(validFlags)) return ac5eConfig;
	const validFlagsEffectUpdates = [];
	for (const el in validFlags) {
		let { actorType, evaluation, mode, name, bonus, modifier, set, threshold, isAura } = validFlags[el];
		if (mode.includes('skill') || mode.includes('tool')) mode = 'check';
		if (evaluation) {
			const hasEffectUpdate = effectUpdates.find((u) => u.name === name);
			if (hasEffectUpdate) validFlagsEffectUpdates.push(hasEffectUpdate.updates);
			if (!isAura) ac5eConfig[actorType][mode].push(name); //there can be active effects named the same so validFlags.name would disregard any other that the first
			else ac5eConfig[actorType][mode].push(el); //the auras have already the token name in the el passed, so is not an issue
			if (mode === 'bonus' || mode === 'targetADC' || mode === 'extraDice') {
				const configMode = mode === 'bonus' ? 'parts' : mode === 'targetADC' ? 'targetADC' : 'extraDice';
				if (bonus) {
					if (bonus.constructor?.metadata) bonus = String(bonus); // special case for rollingActor.scale.rogue['sneak-attack'] for example; returns the .formula
					if (typeof bonus === 'string' && !(bonus.includes('+') || bonus.includes('-'))) bonus = `+${bonus}`;
					ac5eConfig[configMode].push(bonus);
				}
				if (set) ac5eConfig[configMode].push(`${set}`);
			}
			if (modifier) {
				if (hook === 'damage') ac5eConfig.damageModifiers.push(modifier);
				else {
					let mod;
					if (modifier.includes('max')) {
						mod = Number(modifier.replace('max', ''));
						const inplaceMod = ac5eConfig.modifiers.maximum;
						if (mod) ac5eConfig.modifiers.maximum = !inplaceMod || inplaceMod > mod ? mod : inplaceMod;
					}
					if (modifier.includes('min')) {
						mod = Number(modifier.replace('min', ''));
						const inplaceMod = ac5eConfig.modifiers.minimum;
						if (mod) ac5eConfig.modifiers.minimum = !inplaceMod || inplaceMod < mod ? mod : inplaceMod;
					}
				}
			}
			if (mode === 'criticalThreshold') {
				if (threshold) {
					if (typeof threshold === 'string' && !(threshold.includes('+') || threshold.includes('-'))) threshold = `+${threshold}`;
					ac5eConfig.threshold.push(threshold);
				}
				if (set) ac5eConfig.threshold.push(`${set}`);
			}
		}
	}
	subject.deleteEmbeddedDocuments('ActiveEffect', effectDeletions);
	subject.updateEmbeddedDocuments('ActiveEffect', validFlagsEffectUpdates);
	_doQueries({ effectDeletionsGM, effectUpdatesGM, itemUpdatesGM, activityUpdatesGM });

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
			if (clause.startsWith('!') && !clause.includes('&') && !clause.includes('?') && !clause.includes('|')) {
				clause = clause.slice(1).trim();
				mult = '!';
			}
			const sandbox = auraTokenEvaluationData ? auraTokenEvaluationData : evaluationData;
			const result = _ac5eSafeEval({ expression: clause, sandbox, mode: 'condition' });
			return mult ? !result : result;
		});
	}
}

function handleUses({ actorType, change, effect, effectDeletions, effectUpdates, effectDeletionsGM, effectUpdatesGM, itemUpdatesGM, activityUpdatesGM }) {
	const isOwner = effect.isOwner;
	const values = change.value.split(';');
	const hasCount = getBlacklistedKeysValue('usescount', change.value);
	const isOnce = values.find((use) => use.includes('once'));
	if (!hasCount && !isOnce) {
		return true;
	}
	const isTransfer = effect.transfer;
	if (isOnce && !isTransfer) {
		if (isOwner) effectDeletions.push(effect.id);
		else effectDeletionsGM.push(effect.uuid);
	} else if (isOnce && isTransfer) {
		if (isOwner) effect.update({ disabled: true });
		else effectUpdatesGM.push({ uuid: effect.uuid, updates: { disabled: true } });
	} else if (hasCount) {
		const isNumber = parseInt(hasCount, 10);
		const commaSeparated = hasCount.split(',');
		let itemActivityfromUuid = !!fromUuidSync(commaSeparated[0]) && fromUuidSync(commaSeparated[0]);
		const consumeMoreUses = parseInt(commaSeparated[1], 10); //consume more than one; usage: usesCount=5,2 meaning consume 2 uses per activation

		if (!isNaN(isNumber)) {
			if (isNumber === 0) {
				return false;
			}

			const newUses = isNaN(consumeMoreUses) ? isNumber - 1 : isNumber - consumeMoreUses;

			if (newUses < 0) return false; //if you need to consume more uses than available (can only happen if moreUses exists)

			if (newUses === 0 && !isTransfer) {
				if (isOwner) effectDeletions.push(effect.id);
				else effectDeletionsGM.push(effect.uuid);
			} else {
				let changes = foundry.utils.duplicate(effect.changes);
				const index = changes.findIndex((c) => c.key === change.key);

				if (index >= 0) {
					changes[index].value = changes[index].value.replace(/\busesCount\s*[:=]\s*\d+/i, `usesCount=${newUses}`);

					if (!isTransfer) {
						if (isOwner) effectUpdates.push({ name: effect.name, updates: { _id: effect.id, changes }, documentType: 'ActiveEffect' });
						else effectUpdatesGM.push({ uuid: effect.uuid, updates: { changes } });
					} else {
						const hasInitialUsesFlag = effect.getFlag('automated-conditions-5e', 'initialUses')?.[effect.id]?.initialUses;
						if (newUses === 0) {
							if (!hasInitialUsesFlag) {
								if (isOwner) effect.update({ disabled: true });
								else effectUpdatesGM.push({ uuid: effect.uuid, updates: { disabled: true } });
							} else {
								changes[index].value = changes[index].value.replace(/\busesCount\s*[:=]\s*\d+/i, `usesCount=${hasInitialUsesFlag}`);
								if (isOwner) {
									effect.update({ changes, disabled: true });
								} else effectUpdatesGM.push({ uuid: effect.uuid, updates: { changes, disabled: true } });
							}
						} else {
							if (!hasInitialUsesFlag) {
								if (isOwner) effect.update({ changes, 'flags.automated-conditions-5e': { initialUses: { [effect.id]: { initialUses: isNumber } } } });
								else effectUpdatesGM.push({ uuid: effect.uuid, updates: { changes, 'flags.automated-conditions-5e': { initialUses: { [effect.id]: { initialUses: isNumber } } } } });
							} else {
								if (isOwner) effect.update({ changes });
								else effectUpdatesGM.push({ uuid: effect.uuid, updates: { changes } });
							}
						}
					}
				}
			}
		} else {
			if (hasCount.toLowerCase().includes('origin')) {
				itemActivityfromUuid = fromUuidSync(effect.origin);
				if (itemActivityfromUuid instanceof Actor) {
					//to-do: Allow for consuming actor attributes etc directly and not only via activities, like consuming hp; probably not be needed, but could be done.
					ui.notifications.error(`You are using 'origin' in effect ${effect.name}, but you have created it directly on the actor and does not have an associated item or activity; Returning false in ac5e.handleUses;`);
					return false;
				}
			}
			if (itemActivityfromUuid) {
				const item = itemActivityfromUuid instanceof Item && itemActivityfromUuid;
				const activity = !item && itemActivityfromUuid.type !== 'undefined' && itemActivityfromUuid;
				const currentUses = item ? item.system.uses.value : activity ? activity.uses.value : false;
				if (!currentUses) return false;
				const newUses = isNaN(consumeMoreUses) ? currentUses - 1 : currentUses - consumeMoreUses;
				if (newUses < 0) return false;
				const spent = (item?.system?.uses?.max ?? activity?.uses?.max) - newUses;
				if (item?.isOwner) {
					if (item) item.update({ 'system.uses.spent': spent });
					else if (activity) activity.update({ 'uses.spent': spent });
				} else {
					if (item) itemUpdatesGM.push({ uuid: item.uuid, updates: { 'system.uses.spent': spent } });
					else if (activity) activityUpdatesGM.push({ uuid: activity.uuid, updates: { 'uses.spent': spent } });
				}
			} else if (commaSeparated[0].trim().startsWith('Item.')) {
				const actor = effect.target;
				if (actor instanceof Actor) {
					const str = commaSeparated[0].trim().replace(/[\s,]+$/, '');
					const match = str.match(/^Item\.([^,]+(?:,\s*[^,]+)*)(?:\.Activity\.([^,\s]+))?/);
					if (match) {
						const itemID = match[1];
						const activityID = match[2] ?? null;

						const document = _getItemOrActivity(itemID, activityID, actor);
						if (!document) return false;
						let item, activity;
						if (document instanceof Item) item = document;
						else {
							activity = document;
							item = activity.item;
						}
						const currentUses = item ? item.system.uses.value : activity ? activity.uses.value : false;
						if (!currentUses) return false;
						const newUses = isNaN(consumeMoreUses) ? currentUses - 1 : currentUses - consumeMoreUses;
						if (newUses < 0) return false;
						const spent = (item?.system?.uses?.max ?? activity?.uses?.max) - newUses;
						if (item?.isOwner) {
							if (item) item.update({ 'system.uses.spent': spent });
							else if (activity) activity.update({ 'uses.spent': spent });
						} else {
							if (item) itemUpdatesGM.push({ uuid: item.uuid, updates: { 'system.uses.spent': spent } });
							else if (activity) activityUpdatesGM.push({ uuid: activity.uuid, updates: { 'uses.spent': spent } });
						}
					} else return false;
				} else return false;
			}
		}
	}
	return true;
}

function getBlacklistedKeysValue(key, values) {
	const regex = new RegExp(`^\\s*${key}\\s*[:=]\\s*(.+)$`, 'i'); //matching usesCOunT: 6 or usesCount=6 and returning the value after the :=
	const parts = values
		.split(';')
		.map((e) => e.trim())
		.map((e) => regex.exec(e))
		.find(Boolean);
	return parts ? parts[1].trim() : '';
}

function bonusReplacements(expression, evalData, isAura, effect) {
	if (typeof expression !== 'string') return expression;
	// Short-circuit: skip if formula is just plain dice + numbers + brackets (no dynamic content)
	const isStaticFormula = /^[\d\s+\-*/().\[\]d]+$/i.test(expression) && !expression.includes('@') && !expression.includes('Actor') && !expression.includes('##');

	if (isStaticFormula) return expression;

	const staticMap = {
		'@scaling': evalData.scaling ?? 0,
		scaling: evalData.scaling ?? 0,
		'@spellLevel': evalData.castingLevel ?? 0,
		spellLevel: evalData.castingLevel ?? 0,
		'@castingLevel': evalData.castingLevel ?? 0,
		castingLevel: evalData.castingLevel ?? 0,
		'@baseSpellLevel': evalData.baseSpellLevel ?? 0,
		baseSpellLevel: evalData.baseSpellLevel ?? 0,
		effectStacks: effect.flags?.dae?.stacks ?? effect.flags?.statuscounter?.value ?? 1,
		stackCount: effect.flags?.dae?.stacks ?? effect.flags?.statuscounter?.value ?? 1,
	};

	const pattern = new RegExp(Object.keys(staticMap).join('|'), 'g');
	expression = expression.replace(pattern, (match) => staticMap[match]);
	if (expression.includes('@')) expression = isAura ? expression.replaceAll('@', 'auraActor.') : expression.replaceAll('@', 'rollingActor.');
	if (expression.includes('##')) expression = isAura ? expression.replaceAll('##', 'rollingActor.') : expression.replaceAll('##', 'opponentActor.');
	if (expression.includes('effectOriginActor')) {
		const tok = _getEffectOriginToken(effect, 'token');
		evalData.effectOriginActor = _ac5eActorRollData(tok);
	}
	return expression;
}

function preEvaluateExpression({ value, mode, hook, effect, evaluationData, isAura }) {
	let bonus, set, modifier, threshold;
	const isBonus = value.includes('bonus') && (mode === 'bonus' || mode === 'targetADC' || mode === 'extraDice') ? getBlacklistedKeysValue('bonus', value) : false;
	if (isBonus) {
		const replacementBonus = bonusReplacements(isBonus, evaluationData, isAura, effect);
		bonus = _ac5eSafeEval({ expression: replacementBonus, sandbox: evaluationData, mode: 'formula' });
	}
	const isSet = value.includes('set') && (mode === 'bonus' || mode === 'targetADC' || (mode === 'criticalThreshold' && hook === 'attack')) ? getBlacklistedKeysValue('set', value) : false;
	if (isSet) {
		const replacementBonus = bonusReplacements(isSet, evaluationData, isAura, effect);
		set = _ac5eSafeEval({ expression: replacementBonus, sandbox: evaluationData, mode: 'formula' });
	}
	const isModifier = value.includes('modifier') && mode === 'modifiers' ? getBlacklistedKeysValue('modifier', value) : false;
	if (isModifier) {
		const replacementModifier = bonusReplacements(isModifier, evaluationData, isAura, effect);
		modifier = _ac5eSafeEval({ expression: replacementModifier, sandbox: evaluationData, mode: 'formula' });
	}
	const isThreshold = value.includes('threshold') && hook === 'attack' ? getBlacklistedKeysValue('threshold', value) : false;
	if (isThreshold) {
		const replacementThreshold = bonusReplacements(isThreshold, evaluationData, isAura, effect);
		threshold = _ac5eSafeEval({ expression: replacementThreshold, sandbox: evaluationData, mode: 'formula' });
	}
	if (threshold) threshold = Number(evalDiceExpression(threshold)); // we need Integers to differentiate from set
	if (bonus && mode !== 'bonus') bonus = Number(evalDiceExpression(bonus)); // we need Integers in everything except for actual bonuses which are formulas and will be evaluated as needed in ac5eSafeEval
	if (set) set = String(evalDiceExpression(set)); // we need Strings for set
	return { bonus, set, modifier, threshold };
}

function evalDiceExpression(expr, { maxDice = 100, maxSides = 1000, debug = false } = {}) {
	if (typeof expr !== 'string') throw new TypeError('Expression must be a string');

	const tokenRe = /([+-])?\s*(\d*d\d+|\d+)/gi;
	let m,
		total = 0;
	const logs = [];

	// sanity: ensure we only have digits, d, +, -, and whitespace
	const invalid = expr.replace(tokenRe, '').replace(/\s+/g, '');
	if (invalid.length) throw new Error(`Invalid token(s) in expression: "${invalid}"`);

	while ((m = tokenRe.exec(expr)) !== null) {
		const sign = m[1] === '-' ? -1 : 1; // default positive when missing
		const term = m[2].toLowerCase();

		if (term.includes('d')) {
			// dice term
			const [countStr, sidesStr] = term.split('d');
			const count = Math.min(Math.max(parseInt(countStr || '1', 10), 0), maxDice);
			const sides = Math.min(Math.max(parseInt(sidesStr, 10), 1), maxSides);

			let sum = 0;
			const rolls = [];
			for (let i = 0; i < count; i++) {
				const r = Math.floor(Math.random() * sides) + 1;
				rolls.push(r);
				sum += r;
			}
			total += sign * sum;
			if (settings.debug) logs.push(`${sign < 0 ? '-' : '+'}${count}d${sides} → [${rolls.join(', ')}] = ${sign * sum}`);
		} else {
			// static integer
			const value = parseInt(term, 10);
			total += sign * value;
			if (settings.debug) logs.push(`${sign < 0 ? '-' : '+'}${value}`);
		}
	}

	if (settings.debug) console.warn(`evalDiceExpression("${expr}") -> ${total}`, logs);

	return total;
}
