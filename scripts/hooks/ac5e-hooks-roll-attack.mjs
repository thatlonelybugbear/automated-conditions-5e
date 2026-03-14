import { _getDistance, _hasValidTargets, _localize } from '../ac5e-helpers.mjs';
import { autoRanged } from '../ac5e-systemRules.mjs';

export function preRollAttack(config, dialog, message, hook, reEval, deps) {
	if (deps.hookDebugEnabled('preRollAttackHook')) console.error('AC5e _preRollAttack', hook, { config, dialog, message });
	const { subject: { actor: sourceActor, ability } = {}, subject: configActivity, ammunition, attackMode, mastery } = config || {};
	const { messageForTargets, activity: messageActivity, messageTargets, options } = deps.getHookMessageData(config, hook, message, deps);
	const activity = messageActivity || configActivity;
	options.ability = ability;
	options.ammo = ammunition;
	options.ammunition = sourceActor.items.get(ammunition)?.toObject();
	options.attackMode = attackMode;
	const actionType = activity?.getActionType(attackMode);
	options.actionType = actionType;
	options.mastery = mastery;
	deps.prepareHookTargetsAndDamage({ options, hook, activity, messageForTargets, messageTargets, damageSource: 'activity' }, deps);
	const item = activity?.item;
	const needsTarget = deps.settings.needsTarget;
	const { invalidTargets, sourceToken, singleTargetToken } = resolveAttackRollTargetContext({
		hook,
		config,
		messageForTargets,
		activity,
		options,
		sourceActor,
		needsTarget,
		getSubjectTokenForHook: (hookType, messageData, actor) => deps.getSubjectTokenForHook(hookType, messageData, actor, deps),
		getSingleTargetToken: deps.getSingleTargetToken,
		logResolvedTargets: deps.logResolvedTargets,
	});
	if (invalidTargets && needsTarget !== 'source') return false;
	let ac5eConfig = deps.getConfig(config, dialog, hook, sourceToken?.id, singleTargetToken?.id, options, reEval);
	if (ac5eConfig.returnEarly) {
		deps.applyExplicitModeOverride(ac5eConfig, config);
		return deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	}
	ac5eConfig = deps.ac5eChecks({ ac5eConfig, subjectToken: sourceToken, opponentToken: singleTargetToken });
	deps.syncD20AbilityOverrideState(config, ac5eConfig, { activity, options });
	applyAttackRangeState({ ac5eConfig, activity, sourceToken, singleTargetToken, options, config });
	applyAttackHeavyState({
		ac5eConfig,
		item,
		actionType,
		sourceActor,
		sourceToken,
		modernRules: deps.settings.dnd5eModernRules,
		automateHeavy: deps.settings.automateHeavy,
	});
	if (deps.hookDebugEnabled('preRollAttackHook')) console.warn('AC5E._preRollAttack:', { ac5eConfig });
	deps.captureFrozenD20Baseline(ac5eConfig, config);
	deps.calcAdvantageMode(ac5eConfig, config, dialog, message, { skipSetProperties: true });
	deps.applyExplicitModeOverride(ac5eConfig, config);
	deps.setAC5eProperties(ac5eConfig, config, dialog, message);
	deps.syncTargetsToConfigAndMessage(ac5eConfig, options.targets ?? [], message, deps);
	return ac5eConfig;
}

export function resolveAttackRollTargetContext({ hook, config, messageForTargets, activity, options, sourceActor, needsTarget, getSubjectTokenForHook, getSingleTargetToken, logResolvedTargets }) {
	const sourceToken = getSubjectTokenForHook(hook, messageForTargets, sourceActor);
	const isTargetSelf = activity?.target?.affects?.type === 'self';
	let singleTargetToken = getSingleTargetToken(options.targets) ?? (isTargetSelf ? sourceToken : game.user?.targets?.first());
	const invalidTargets = !_hasValidTargets(activity, options.targets?.length ?? game.user?.targets?.size, needsTarget);
	if (invalidTargets) {
		if (needsTarget !== 'source') return { invalidTargets, sourceToken, singleTargetToken };
		singleTargetToken = undefined;
	}
	if (singleTargetToken) options.distance = _getDistance(sourceToken, singleTargetToken);
	logResolvedTargets('attack', sourceToken, singleTargetToken, options);
	return { invalidTargets, sourceToken, singleTargetToken };
}

export function applyAttackRangeState({ ac5eConfig, activity, sourceToken, singleTargetToken, options, config }) {
	if (!singleTargetToken) return;
	ac5eConfig.subject.rangeNotes = [];
	const failLabel = _localize('AC5E.OutOfRange');
	ac5eConfig.subject.fail = (ac5eConfig.subject.fail ?? []).filter((entry) => {
		if (entry === failLabel) return false;
		if (!entry || typeof entry !== 'object') return true;
		const label = String(entry.label ?? entry.name ?? entry.id ?? '').trim();
		return label !== failLabel;
	});
	const { nearbyFoe, inRange, range, longDisadvantage, outOfRangeFail, outOfRangeFailSourceLabel } = autoRanged(activity, sourceToken, singleTargetToken, { ...options, ac5eConfig });
	if (nearbyFoe) ac5eConfig.subject.disadvantage.push(_localize('AC5E.NearbyFoe'));
	if (!outOfRangeFail && !inRange && outOfRangeFailSourceLabel) {
		ac5eConfig.subject.rangeNotes.push(`${failLabel} fail suppressed: ${outOfRangeFailSourceLabel}`);
	}
	if (outOfRangeFail && !config.workflow?.AoO && !inRange && !ac5eConfig.subject.fail.includes(failLabel)) {
		ac5eConfig.subject.fail.push(failLabel);
	}
	if (range === 'long' && longDisadvantage) {
		ac5eConfig.subject.disadvantage.push(_localize('RangeLong'));
	}
}

export function applyAttackHeavyState({ ac5eConfig, item, actionType, sourceActor, sourceToken, modernRules, automateHeavy }) {
	if (!automateHeavy) return;
	if (!item?.system?.properties?.has('hvy')) return;
	const isSmall =
		modernRules ?
			(actionType === 'mwak' && sourceActor.system.abilities.str.value < 13) || (actionType === 'rwak' && sourceActor.system.abilities.dex.value < 13)
		:	sourceToken.document.width * sourceToken.document.height * sourceToken.document.texture.scaleX * sourceToken.document.texture.scaleY < 1;
	if (!isSmall) return;
	const localizationStr = 'DND5E.ITEM.Property.Heavy';
	ac5eConfig.subject.disadvantage = ac5eConfig.subject.disadvantage.concat(`${_localize('DND5E.ItemWeaponProperties')}: ${_localize(localizationStr)}`);
}
