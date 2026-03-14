import {
	_ac5eSafeEval,
	_activeModule,
	_dispositionCheck,
	_getActivityEffectsStatusRiders,
	_getDistance,
	_getEffectOriginToken,
	_getItemOrActivity,
	_hasAppliedEffects,
	_hasStatuses,
	_localize,
	_i18nConditions,
	_autoArmor,
	_autoEncumbrance,
	_staticID,
	_sleep,
	_safeFromUuidSync,
} from './ac5e-helpers.mjs';
import { _ac5eActorRollData, _calcAdvantageMode, _createEvaluationSandbox, _raceOrType } from './ac5e-runtimeLogic.mjs';
import { autoRanged, canSee } from './ac5e-systemRules.mjs';
import { _doQueries, _setCombatCadenceFlag } from './ac5e-queries.mjs';
import { ac5eQueue, statusEffectsTables } from './ac5e-main.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

const settings = new Settings();
const statusEffectsOverrideState = {
	list: [],
	seq: 1,
};
const CADENCE_FLAG_KEY = 'cadence';

function _preserveStandaloneSignedDiceFormula(expression) {
	if (typeof expression !== 'string') return null;
	const trimmed = expression.trim();
	if (!/^[+-]/.test(trimmed)) return null;
	if (/[()@]/.test(trimmed)) return null;
	const unsigned = trimmed.slice(1).trim();
	if (!unsigned) return null;
	const signedDicePattern = /^(?:(?:\d*)d(?:\d+|%)(?:r[<>=]?\d+)?(?:x\d+)?(?:kh\d+|kl\d+|k\d+|dh\d+|dl\d+|d\d+|min\d+|max\d+)?|(?:\d+))(?:\s*\[[^\]]*\])*(?:\s*[*/]\s*\d+(?:\.\d+)?)?$/i;
	return signedDicePattern.test(unsigned) ? `${trimmed[0]}${unsigned}` : null;
}

function _normalizeCadenceKey(value) {
	if (value == null) return null;
	const token = String(value).trim().toLowerCase();
	if (!token) return null;
	if (token === 'onceperturn' || token === 'turn') return 'oncePerTurn';
	if (token === 'onceperround' || token === 'round') return 'oncePerRound';
	if (token === 'oncepercombat' || token === 'combat' || token === 'encounter') return 'oncePerCombat';
	return null;
}

function _extractCadenceFromValue(value) {
	if (typeof value !== 'string') return null;
	const fragments = value
		.split(/[;|]/)
		.map((part) => part.trim())
		.filter(Boolean);
	for (const fragment of fragments) {
		const normalized = _normalizeCadenceKey(fragment);
		if (normalized) return normalized;
		const [rawKey, ...rest] = fragment.split('=');
		if (!rawKey || !rest.length) continue;
		if (rawKey.trim().toLowerCase() !== 'cadence') continue;
		const parsed = _normalizeCadenceKey(rest.join('=').trim());
		if (parsed) return parsed;
	}
	return null;
}

function _getCadenceState(combat) {
	const state = foundry.utils.duplicate(combat?.getFlag(Constants.MODULE_ID, CADENCE_FLAG_KEY) ?? {});
	state.schema ??= 1;
	state.last ??= {};
	state.used ??= {};
	state.used.oncePerTurn ??= {};
	state.used.oncePerRound ??= {};
	state.used.oncePerCombat ??= {};
	return state;
}

function _toFiniteNumberOrNull(value) {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function _isMissingDocumentError(err) {
	const message = String(err?.message ?? err ?? '').toLowerCase();
	return message.includes('does not exist') || message.includes('not found');
}

function _createDeleteTraceTag(source, uuid) {
	const stamp = Date.now();
	return `ac5e-delete:${source}:${uuid}:${stamp}`;
}

function _logDeleteTrace(stage, payload = {}) {
	if (ac5e.debugQueries || settings.debug) console.warn('AC5E delete trace', { stage, ...payload });
}

function _usesCountDebugEnabled() {
	return Boolean(settings.debug || ac5e?.debug?.usesCount);
}

function _logUsesCount(stage, payload = {}) {
	if (!_usesCountDebugEnabled()) return;
	console.warn('AC5E usesCount', { stage, ...payload });
}

async function _safeDeleteByUuid(uuid, { source = 'local' } = {}) {
	const doc = _safeFromUuidSync(uuid);
	const traceTag = _createDeleteTraceTag(source, uuid);
	if (!doc) {
		_logDeleteTrace('skip-missing-local-doc', { uuid, source, traceTag });
		return null;
	}
	try {
		_logDeleteTrace('dispatch-delete', { uuid, source, traceTag, docUuid: doc.uuid });
		const result = await doc.delete({ strict: false, ac5eDeleteTraceTag: traceTag, ac5eDeleteSource: source });
		_logDeleteTrace('delete-ok', { uuid, source, traceTag });
		return result;
	} catch (err) {
		if (_isMissingDocumentError(err)) {
			_logDeleteTrace('delete-noop-missing', { uuid, source, traceTag, message: err?.message });
			return null;
		}
		_logDeleteTrace('delete-error', { uuid, source, traceTag, message: err?.message, err });
		throw err;
	}
}

async function _waitForCadenceUpdate(combat, updatedAt, { timeoutMs = 1500, intervalMs = 75 } = {}) {
	if (!combat?.uuid) return false;
	const targetUpdatedAt = _toFiniteNumberOrNull(updatedAt);
	if (targetUpdatedAt === null) return false;
	const started = Date.now();
	while (Date.now() - started <= timeoutMs) {
		const currentUpdatedAt = _toFiniteNumberOrNull(combat.getFlag(Constants.MODULE_ID, CADENCE_FLAG_KEY)?.updatedAt);
		if (currentUpdatedAt !== null && currentUpdatedAt >= targetUpdatedAt) return true;
		await _sleep(intervalMs);
	}
	return false;
}

function _getCadenceBucketEntry(bucket, id) {
	if (!bucket || !id) return null;
	return bucket[id] ?? foundry.utils.getProperty(bucket, id) ?? null;
}

function _setCadenceBucketEntry(bucket, id, value) {
	if (!bucket || !id) return;
	foundry.utils.setProperty(bucket, id, value);
}

function _isOncePerRoundBlocked(entry, combat) {
	if (!entry || !combat) return false;
	const usedRound = _toFiniteNumberOrNull(entry.usedRound ?? entry.round);
	const usedAtTurn = _toFiniteNumberOrNull(entry.usedTurn);
	const currentRound = _toFiniteNumberOrNull(combat.round);
	const currentTurn = _toFiniteNumberOrNull(combat.turn);
	if (usedRound === null || currentRound === null) return Boolean(entry);
	let unlockTurn = _toFiniteNumberOrNull(entry.turn);
	const unlockCombatantId = entry?.combatantId ?? null;
	if (unlockCombatantId) {
		const turns = Array.isArray(combat.turns) ? combat.turns : [];
		const combatantTurn = turns.findIndex((candidate) => candidate?.id === unlockCombatantId);
		if (combatantTurn >= 0) unlockTurn = combatantTurn;
	}
	const anchorTurn = unlockTurn;
	if (anchorTurn === null || currentTurn === null) return false;
	// oncePerRound refreshes on the owner's next turn:
	// - used before owner's turn => same round at owner's turn
	// - used on/after owner's turn => next round at owner's turn
	let unlockRound = usedRound + 1;
	if (usedAtTurn !== null && usedAtTurn < anchorTurn) unlockRound = usedRound;
	if (currentRound < unlockRound) return true;
	if (currentRound > unlockRound) return false;
	return currentTurn < anchorTurn;
}

function _resolveCadenceAnchor(combat, evalData = {}) {
	const fallbackTurn = _toFiniteNumberOrNull(combat?.turn);
	const fallbackCombatantId = combat?.combatant?.id ?? null;
	if (!combat) return { turn: fallbackTurn, combatantId: fallbackCombatantId };
	const turns = Array.isArray(combat.turns) ? combat.turns : [];
	const resolveBy = (predicate) => {
		const index = turns.findIndex(predicate);
		if (index < 0) return null;
		return { turn: index, combatantId: turns[index]?.id ?? null };
	};
	const tokenId = evalData?.tokenId ?? evalData?.rollingActor?.token?.id ?? null;
	if (tokenId) {
		const byToken = resolveBy((combatant) => (combatant?.tokenId ?? combatant?.token?.id) === tokenId);
		if (byToken) return byToken;
	}
	const actorId = evalData?.actorId ?? evalData?.rollingActor?.id ?? null;
	if (actorId) {
		const byActor = resolveBy((combatant) => (combatant?.actor?.id ?? combatant?.actorId) === actorId);
		if (byActor) return byActor;
	}
	const explicitTurn = _toFiniteNumberOrNull(evalData?.rollingActor?.combatTurn);
	if (explicitTurn !== null) return { turn: explicitTurn, combatantId: turns[explicitTurn]?.id ?? null };
	return { turn: fallbackTurn, combatantId: fallbackCombatantId };
}

function _isCadenceUseBlocked({ cadence, id, pendingUses = [] } = {}) {
	const cadenceKey = _normalizeCadenceKey(cadence);
	if (!cadenceKey || !id) return false;
	const combat = game.combat;
	if (!combat?.active) return cadenceKey === 'oncePerCombat';
	if (Array.isArray(pendingUses) && pendingUses.some((entry) => entry?.id === id && _normalizeCadenceKey(entry?.cadence) === cadenceKey)) return true;
	const state = _getCadenceState(combat);
	const bucket = state?.used?.[cadenceKey];
	if (!bucket || typeof bucket !== 'object') return false;
	const entry = _getCadenceBucketEntry(bucket, id);
	if (!entry) return false;
	if (cadenceKey === 'oncePerRound') return _isOncePerRoundBlocked(entry, combat);
	return true;
}

async function _recordCadencePendingUses(pendingUses = []) {
	if (!Array.isArray(pendingUses) || !pendingUses.length) return;
	const combat = game.combat;
	if (!combat?.active) return;
	const cadenceEntries = pendingUses.filter((entry) => entry?.cadence && entry?.id);
	if (!cadenceEntries.length) return;
	const state = _getCadenceState(combat);
	const now = Date.now();
	const round = _toFiniteNumberOrNull(combat.round);
	const turn = _toFiniteNumberOrNull(combat.turn);
	const combatantId = combat.combatant?.id ?? null;
	let changed = false;
	for (const entry of cadenceEntries) {
		const cadence = _normalizeCadenceKey(entry.cadence);
		if (!cadence) continue;
		const bucket = state.used[cadence] ?? (state.used[cadence] = {});
		const cadenceTurn = _toFiniteNumberOrNull(entry?.cadenceTurn);
		const cadenceCombatantId = entry?.cadenceCombatantId ?? null;
		_setCadenceBucketEntry(bucket, entry.id, {
			id: entry.id,
			name: entry.name ?? entry.id,
			round,
			usedRound: round,
			usedTurn: turn,
			turn: cadenceTurn ?? turn,
			combatantId: cadenceCombatantId ?? combatantId,
			timestamp: now,
		});
		changed = true;
	}
	if (!changed) return;
	state.last = { round, turn, combatantId };
	state.updatedAt = now;
	await _setCombatCadenceFlag({ combatUuid: combat.uuid, state });
}

export async function _syncCombatCadenceFlags(combat, _update, _options) {
	if (!combat) return true;
	if (!game.user?.isActiveGM) return true;
	const state = _getCadenceState(combat);
	const nextRound = _toFiniteNumberOrNull(combat.round);
	const nextTurn = _toFiniteNumberOrNull(combat.turn);
	const nextCombatantId = combat.combatant?.id ?? null;
	const previousRound = _toFiniteNumberOrNull(state?.last?.round);
	const previousTurn = _toFiniteNumberOrNull(state?.last?.turn);
	const previousCombatantId = state?.last?.combatantId ?? null;
	const roundChanged = nextRound !== previousRound;
	const turnChanged = nextTurn !== previousTurn;
	const combatantChanged = nextCombatantId !== previousCombatantId;
	if (!roundChanged && !turnChanged && !combatantChanged) return true;
	if (roundChanged || turnChanged || combatantChanged) state.used.oncePerTurn = {};
	state.last = { round: nextRound, turn: nextTurn, combatantId: nextCombatantId };
	state.updatedAt = Date.now();
	try {
		await _setCombatCadenceFlag({ combatUuid: combat.uuid, state });
	} catch (err) {
		console.warn('AC5E combat cadence sync failed', { combatUuid: combat.uuid, err });
	}
	return true;
}

export async function resetCadenceFlags({ combat = game.combat, combatUuid } = {}) {
	let targetCombat = combat;
	if (!targetCombat && combatUuid) targetCombat = _safeFromUuidSync(combatUuid);
	if (typeof targetCombat === 'string') targetCombat = _safeFromUuidSync(targetCombat);
	if (!targetCombat?.uuid) return false;
	const state = _getCadenceState(targetCombat);
	state.used = {
		oncePerTurn: {},
		oncePerRound: {},
		oncePerCombat: {},
	};
	state.last = {
		round: _toFiniteNumberOrNull(targetCombat.round),
		turn: _toFiniteNumberOrNull(targetCombat.turn),
		combatantId: targetCombat.combatant?.id ?? null,
	};
	state.updatedAt = Date.now();
	const applied = await _setCombatCadenceFlag({ combatUuid: targetCombat.uuid, state });
	if (!applied) return false;
	await _waitForCadenceUpdate(targetCombat, state.updatedAt);
	return true;
}

export function inspectCadenceFlags({ combat = game.combat, combatUuid } = {}) {
	let targetCombat = combat;
	if (!targetCombat && combatUuid) targetCombat = _safeFromUuidSync(combatUuid);
	if (typeof targetCombat === 'string') targetCombat = _safeFromUuidSync(targetCombat);
	if (!targetCombat?.uuid) return null;
	const cadence = foundry.utils.duplicate(targetCombat.getFlag(Constants.MODULE_ID, CADENCE_FLAG_KEY) ?? {});
	return {
		combatUuid: targetCombat.uuid,
		round: _toFiniteNumberOrNull(targetCombat.round),
		turn: _toFiniteNumberOrNull(targetCombat.turn),
		combatantId: targetCombat.combatant?.id ?? null,
		cadence,
	};
}

export function _initStatusEffectsTables() {
	return buildStatusEffectsTables();
}

export function registerStatusEffectOverride(override = {}) {
	// Example:
	// const id = ac5e.statusEffectsOverrides.register({
	//   name: "Minotaur ignores prone melee disadvantage",
	//   status: "prone",
	//   hook: "attack",
	//   type: "subject",
	//   priority: 10,
	//   when: ({ context }) => context.subject?.name === "Minotaur",
	//   apply: ({ result }) => (result === "disadvantage" ? "" : result),
	// });
	// ac5e.statusEffectsOverrides.remove(id);
	const entry = {
		id: override.id ?? `ac5e-status-override-${statusEffectsOverrideState.seq++}`,
		name: override.name ?? undefined,
		priority: Number.isFinite(override.priority) ? override.priority : 0,
		status: override.status ?? '*',
		hook: override.hook ?? '*',
		type: override.type ?? '*',
		when: override.when,
		apply: override.apply,
		result: override.result,
	};
	statusEffectsOverrideState.list.push(entry);
	return entry.id;
}

export function removeStatusEffectOverride(id) {
	const index = statusEffectsOverrideState.list.findIndex((entry) => entry.id === id);
	if (index >= 0) statusEffectsOverrideState.list.splice(index, 1);
	return index >= 0;
}

export function clearStatusEffectOverrides() {
	statusEffectsOverrideState.list.length = 0;
}

export function listStatusEffectOverrides() {
	return statusEffectsOverrideState.list.slice();
}

export function _ac5eChecks({ ac5eConfig, subjectToken, opponentToken }) {
	//ac5eConfig.options {ability, activity, distance, hook, skill, tool, isConcentration, isDeathSave, isInitiative}
	const checksCache = ac5eConfig.options._ac5eHookChecksCache ?? (ac5eConfig.options._ac5eHookChecksCache = {});
	const cacheKey = getChecksCacheKey({ ac5eConfig, subjectToken, opponentToken });
	const canReuseChecks = ac5eConfig?.reEval?.requiresFlagReEvaluation === false;
	if (canReuseChecks && cacheKey && checksCache[cacheKey]) {
		recordChecksReuseStat('hit');
		applyChecksSnapshot(ac5eConfig, checksCache[cacheKey]);
		if (ac5e?.debug?.getConfigLayers || ac5e?.debug?.checksReuse) {
			console.warn('AC5E checks: reusing cached evaluation', {
				cacheKey,
				hookType: ac5eConfig?.hookType,
				subjectTokenId: subjectToken?.id,
				opponentTokenId: opponentToken?.id,
				stats: ac5e?._checksReuseStats,
			});
		}
		return ac5eConfig;
	}
	if (canReuseChecks) recordChecksReuseStat('miss');
	else recordChecksReuseStat('skip');
	if (ac5e?.debug?.checksReuse) {
		console.warn('AC5E checks: evaluating fresh', {
			cacheKey,
			hookType: ac5eConfig?.hookType,
			subjectTokenId: subjectToken?.id,
			opponentTokenId: opponentToken?.id,
			canReuseChecks,
			stats: ac5e?._checksReuseStats,
		});
	}
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
		const tables = statusEffectsTables;
		if (!tables) {
			console.warn('AC5E status effects tables unavailable during check evaluation; skipping status automation for this roll.');
		}
		for (const [type, actor] of Object.entries(actorTokens)) {
			if (!tables) break;
			if (foundry.utils.isEmpty(actor)) continue;
			const isSubjectExhausted = settings.autoExhaustion && type === 'subject' && actor?.statuses.has('exhaustion');
			const exhaustionLvl = isSubjectExhausted && actor.system?.attributes.exhaustion >= 3 ? 3 : 1;
			const context = buildStatusEffectsContext({ ac5eConfig, subjectToken, opponentToken, exhaustionLvl, type });
			const actorStatuses = Array.from(actor.statuses ?? []);
			if (actor.appliedEffects.some((effect) => effect?.parent?.identifier?.includes('rage'))) actorStatuses.push('raging');
			if (actor.appliedEffects.some((effect) => effect?.name.includes(_localize('AC5E.Statuses.UnderwaterCombat')))) actorStatuses.push('underwaterCombat');

			for (const status of actorStatuses) {
				const suppressedStatus = getSuppressedStatusData({ actor, statusId: status, type, subjectToken, opponentToken });
				if (suppressedStatus.suppressed) {
					ac5eConfig[type].suppressedStatuses ??= [];
					ac5eConfig[type].suppressedStatuses.push(...suppressedStatus.labels);
					continue;
				}
				const statusOutcome = getStatusEffectResult({
					status,
					statusEntry: tables?.[status],
					hook: options.hook,
					type,
					context,
					exhaustionLvl,
					isSubjectExhausted,
				});
				const test = statusOutcome?.result ?? '';

				if (!test) continue;
				if (settings.debug) console.log(type, test);
				const effectName = withStatusOverrideLabel(tables?.[status]?.name, statusOutcome?.overrideName);
				if (effectName) {
					if (test.includes('advantageNames')) ac5eConfig[type][test].add(effectName);
					else ac5eConfig[type][test].push(effectName);
				}
			}
		}
	}

	ac5eConfig = ac5eFlags({ ac5eConfig, subjectToken, opponentToken });
	if (cacheKey) checksCache[cacheKey] = createChecksSnapshot(ac5eConfig);
	if (settings.debug) console.log('AC5E._ac5eChecks:', { ac5eConfig });
	return ac5eConfig;
}

function recordChecksReuseStat(type) {
	if (!ac5e) return;
	ac5e._checksReuseStats ??= { hits: 0, misses: 0, skips: 0, last: null };
	if (type === 'hit') ac5e._checksReuseStats.hits++;
	if (type === 'miss') ac5e._checksReuseStats.misses++;
	if (type === 'skip') ac5e._checksReuseStats.skips++;
	ac5e._checksReuseStats.last = type;
}

function getChecksCacheKey({ ac5eConfig, subjectToken, opponentToken }) {
	const hookType = ac5eConfig?.hookType ?? ac5eConfig?.options?.hook;
	if (!hookType) return null;
	const subjectTokenId = subjectToken?.id ?? ac5eConfig?.tokenId ?? 'none';
	const opponentTokenId = opponentToken?.id ?? ac5eConfig?.targetId ?? 'none';
	const subjectSignature = getActorContextSignature(subjectToken);
	const opponentSignature = getActorContextSignature(opponentToken);
	const targetsSignature = getTargetsSignature(ac5eConfig?.options?.targets);
	const distance = ac5eConfig?.options?.distance ?? 'none';
	const rollProfileSignature = getRollProfileSignature(ac5eConfig?.options ?? {});
	return `${hookType}:${subjectTokenId}:${opponentTokenId}:${distance}:${targetsSignature}:${subjectSignature}:${opponentSignature}:${rollProfileSignature}`;
}

function getActorContextSignature(token) {
	const actor = token?.actor;
	if (!actor) return 'none';
	const statuses = Array.from(actor.statuses ?? [])
		.sort()
		.join('|');
	const hpValue = actor.system?.attributes?.hp?.value ?? 'na';
	const hpTemp = actor.system?.attributes?.hp?.temp ?? 'na';
	const hpTempMax = actor.system?.attributes?.hp?.tempmax ?? 'na';
	const effects = (actor.appliedEffects ?? [])
		.map(
			(effect) =>
				`${effect?.uuid ?? effect?.id ?? 'effect'}:${Array.from(effect?.statuses ?? [])
					.sort()
					.join(',')}`,
		)
		.sort()
		.join('|');
	return `${actor.uuid ?? actor.id}:${statuses}:${hpValue}:${hpTemp}:${hpTempMax}:${effects}`;
}

function getTargetsSignature(targets) {
	if (!Array.isArray(targets) || !targets.length) return 'none';
	return targets
		.map((target) => target?.tokenUuid ?? target?.uuid ?? target?.id ?? target?.name ?? 'target')
		.sort()
		.join('|');
}

function getRollProfileSignature(options = {}) {
	const profile = {
		ability: options.ability,
		skill: options.skill,
		tool: options.tool,
		attackMode: options.attackMode,
		isCritical: options.isCritical,
		isConcentration: options.isConcentration,
		isDeathSave: options.isDeathSave,
		isInitiative: options.isInitiative,
		damageTypes: options.damageTypes,
		defaultDamageType: options.defaultDamageType,
	};
	try {
		return JSON.stringify(profile);
	} catch {
		return String(profile?.ability ?? '');
	}
}

function createChecksSnapshot(ac5eConfig) {
	return {
		subject: cloneCheckSide(ac5eConfig.subject),
		opponent: cloneCheckSide(ac5eConfig.opponent),
		parts: foundry.utils.duplicate(ac5eConfig.parts ?? []),
		targetADC: foundry.utils.duplicate(ac5eConfig.targetADC ?? []),
		extraDice: foundry.utils.duplicate(ac5eConfig.extraDice ?? []),
		diceUpgrade: foundry.utils.duplicate(ac5eConfig.diceUpgrade ?? []),
		diceDowngrade: foundry.utils.duplicate(ac5eConfig.diceDowngrade ?? []),
		threshold: foundry.utils.duplicate(ac5eConfig.threshold ?? []),
		fumbleThreshold: foundry.utils.duplicate(ac5eConfig.fumbleThreshold ?? []),
		damageModifiers: foundry.utils.duplicate(ac5eConfig.damageModifiers ?? []),
		modifiers: foundry.utils.duplicate(ac5eConfig.modifiers ?? {}),
		pendingUses: foundry.utils.duplicate(ac5eConfig.pendingUses ?? []),
	};
}

function applyChecksSnapshot(ac5eConfig, snapshot) {
	if (!snapshot) return;
	ac5eConfig.subject = cloneCheckSide(snapshot.subject ?? {});
	ac5eConfig.opponent = cloneCheckSide(snapshot.opponent ?? {});
	ac5eConfig.parts = foundry.utils.duplicate(snapshot.parts ?? []);
	ac5eConfig.targetADC = foundry.utils.duplicate(snapshot.targetADC ?? []);
	ac5eConfig.extraDice = foundry.utils.duplicate(snapshot.extraDice ?? []);
	ac5eConfig.diceUpgrade = foundry.utils.duplicate(snapshot.diceUpgrade ?? []);
	ac5eConfig.diceDowngrade = foundry.utils.duplicate(snapshot.diceDowngrade ?? []);
	ac5eConfig.threshold = foundry.utils.duplicate(snapshot.threshold ?? []);
	ac5eConfig.fumbleThreshold = foundry.utils.duplicate(snapshot.fumbleThreshold ?? []);
	ac5eConfig.damageModifiers = foundry.utils.duplicate(snapshot.damageModifiers ?? []);
	ac5eConfig.modifiers = foundry.utils.duplicate(snapshot.modifiers ?? {});
	ac5eConfig.pendingUses = foundry.utils.duplicate(snapshot.pendingUses ?? []);
}

function cloneCheckSide(side = {}) {
	const clone = {};
	for (const [key, value] of Object.entries(side ?? {})) {
		if (value instanceof Set) clone[key] = new Set(value);
		else if (Array.isArray(value)) clone[key] = foundry.utils.duplicate(value);
		else if (value && typeof value === 'object') clone[key] = foundry.utils.duplicate(value);
		else clone[key] = value;
	}
	return clone;
}

function buildStatusEffectsContext({ ac5eConfig, subjectToken, opponentToken, exhaustionLvl, type } = {}) {
	const { ability, activity, attackMode, distance, hook, isConcentration, isDeathSave, isInitiative } = ac5eConfig.options;
	const distanceUnit = canvas.grid.distance;
	const subject = subjectToken?.actor;
	const opponent = opponentToken?.actor;
	const modernRules = settings.dnd5eModernRules;
	const item = activity?.item;
	if (activity && !_activeModule('midi-qol')) activity.hasDamage = !foundry.utils.isEmpty(activity?.damage?.parts); //Cannot set property hasDamage of #<MidiActivityMixin> which has only a getter
	const subjectMove = Object.values(subject?.system.attributes.movement || {}).some((v) => typeof v === 'number' && v);
	const opponentMove = Object.values(opponent?.system.attributes.movement || {}).some((v) => typeof v === 'number' && v);
	const subjectAlert2014 = !modernRules && subject?.items.some((item) => item.name.includes(_localize('AC5E.Alert')));
	const opponentAlert2014 = !modernRules && opponent?.items.some((item) => item.name.includes(_localize('AC5E.Alert')));

	return {
		ability,
		activity,
		attackMode,
		distance,
		distanceUnit,
		exhaustionLvl,
		hook,
		isConcentration,
		isDeathSave,
		isInitiative,
		item,
		modernRules,
		opponent,
		opponentAlert2014,
		opponentMove,
		opponentToken,
		subject,
		subjectAlert2014,
		subjectMove,
		subjectToken,
		type,
	};
}

function buildStatusEffectsTables() {
	const mkStatus = (id, name, rules) => ({ _id: _staticID(id), name, rules });

	const tables = {
		blinded: mkStatus('blinded', _i18nConditions('Blinded'), {
			attack: {
				subject: (ctx) => (!canSee(ctx.subjectToken, ctx.opponentToken) ? 'disadvantage' : ''),
				opponent: (ctx) => (!canSee(ctx.opponentToken, ctx.subjectToken) && !ctx.subjectAlert2014 ? 'advantage' : ''),
			},
		}),

		charmed: mkStatus('charmed', _i18nConditions('Charmed'), {
			check: { subject: (ctx) => (hasStatusFromOpponent(ctx.subject, 'charmed', ctx.opponent) ? 'advantage' : '') },
			use: { subject: (ctx) => (hasStatusFromOpponent(ctx.subject, 'charmed', ctx.opponent) ? 'fail' : '') },
		}),

		deafened: mkStatus('deafened', _i18nConditions('Deafened'), {}),

		exhaustion: mkStatus('exhaustion', _i18nConditions('Exhaustion'), {
			levels: {
				1: { check: { subject: () => 'disadvantageNames' } },
				3: {
					check: { subject: () => 'disadvantageNames' },
					save: { subject: () => 'disadvantageNames' },
					attack: { subject: () => 'disadvantage' },
				},
			},
		}),

		frightened: mkStatus('frightened', _i18nConditions('Frightened'), {
			attack: { subject: (ctx) => (isFrightenedByVisibleSource(ctx) ? 'disadvantage' : '') },
			check: { subject: (ctx) => (isFrightenedByVisibleSource(ctx) ? 'disadvantage' : '') },
		}),

		incapacitated: mkStatus('incapacitated', _i18nConditions('Incapacitated'), {
			use: { subject: (ctx) => (['action', 'bonus', 'reaction'].includes(ctx.activity?.activation?.type) ? 'fail' : '') },
			check: { subject: (ctx) => (ctx.modernRules && ctx.isInitiative ? 'disadvantage' : '') },
		}),

		invisible: mkStatus('invisible', _i18nConditions('Invisible'), {
			attack: {
				subject: (ctx) => (!ctx.opponentAlert2014 && !canSee(ctx.opponentToken, ctx.subjectToken) ? 'advantage' : ''),
				opponent: (ctx) => (!canSee(ctx.subjectToken, ctx.opponentToken) ? 'disadvantage' : ''),
			},
			check: { subject: (ctx) => (ctx.modernRules && ctx.isInitiative ? 'advantage' : '') },
		}),

		paralyzed: mkStatus('paralyzed', _i18nConditions('Paralyzed'), {
			save: { subject: (ctx) => (['str', 'dex'].includes(ctx.ability) ? 'fail' : '') },
			attack: { opponent: () => 'advantage' },
			damage: { opponent: (ctx) => (ctx.activity?.hasDamage && ctx.distance <= ctx.distanceUnit ? 'critical' : '') },
		}),

		petrified: mkStatus('petrified', _i18nConditions('Petrified'), {
			save: { subject: (ctx) => (['str', 'dex'].includes(ctx.ability) ? 'fail' : '') },
			attack: { opponent: () => 'advantage' },
		}),

		poisoned: mkStatus('poisoned', _i18nConditions('Poisoned'), {
			attack: { subject: () => 'disadvantage' },
			check: { subject: () => 'disadvantageNames' },
		}),

		prone: mkStatus('prone', _i18nConditions('Prone'), {
			attack: {
				subject: () => 'disadvantage',
				opponent: (ctx) => (ctx.distance <= ctx.distanceUnit ? 'advantage' : 'disadvantage'),
			},
		}),

		restrained: mkStatus('restrained', _i18nConditions('Restrained'), {
			attack: { subject: () => 'disadvantage', opponent: () => 'advantage' },
			save: { subject: (ctx) => (ctx.ability === 'dex' ? 'disadvantageNames' : '') },
		}),

		silenced: mkStatus('silenced', _i18nConditions('Silenced'), {
			use: { subject: (ctx) => (ctx.item?.system.properties.has('vocal') ? 'fail' : '') },
		}),

		stunned: mkStatus('stunned', _i18nConditions('Stunned'), {
			attack: { opponent: () => 'advantage' },
			save: { subject: (ctx) => (['dex', 'str'].includes(ctx.ability) ? 'fail' : '') },
		}),

		unconscious: mkStatus('unconscious', _i18nConditions('Unconscious'), {
			attack: { opponent: () => 'advantage' },
			damage: { opponent: (ctx) => (ctx.activity?.hasDamage && ctx.distance <= ctx.distanceUnit ? 'critical' : '') },
			save: { subject: (ctx) => (['dex', 'str'].includes(ctx.ability) ? 'fail' : '') },
		}),

		surprised: mkStatus('surprised', _i18nConditions('Surprised'), {
			check: { subject: (ctx) => (ctx.modernRules && ctx.isInitiative ? 'disadvantage' : '') },
		}),

		grappled: mkStatus('grappled', _i18nConditions('Grappled'), {
			attack: {
				subject: (ctx) => (ctx.modernRules && hasGrappledFromOther(ctx) ? 'disadvantage' : ''),
			},
		}),

		dodging: mkStatus('dodging', _i18nConditions('Dodging'), {
			attack: {
				opponent: (ctx) =>
					settings.expandedConditions && ctx.opponentToken && ctx.subject && canSee(ctx.opponentToken, ctx.subjectToken) && !ctx.opponent?.statuses.has('incapacitated') && ctx.opponentMove ?
						'disadvantage'
					:	'',
			},
			save: {
				subject: (ctx) => (settings.expandedConditions && ctx.ability === 'dex' && ctx.subject && !ctx.subject?.statuses.has('incapacitated') && ctx.subjectMove ? 'advantage' : ''),
			},
		}),

		hiding: mkStatus('hiding', _i18nConditions('Hiding'), {
			attack: {
				subject: (ctx) =>
					!settings.expandedConditions ? ''
					: !ctx.opponentAlert2014 ? 'advantage'
					: '',
				opponent: () => (!settings.expandedConditions ? '' : 'disadvantage'),
			},
			check: { subject: (ctx) => (settings.expandedConditions && ctx.modernRules && ctx.isInitiative ? 'advantage' : '') },
		}),

		raging: mkStatus('raging', _localize('AC5E.Raging'), {
			// save: {
			// 	subject: (ctx) => (settings.expandedConditions && ctx.ability === 'str' && ctx.subject?.armor?.system.type.value !== 'heavy' ? 'advantage' : ''),
			// },
			// check: {
			// 	subject: (ctx) => (settings.expandedConditions && ctx.ability === 'str' && ctx.subject?.armor?.system.type.value !== 'heavy' ? 'advantage' : ''),
			// },
			use: { subject: (ctx) => (settings.expandedConditions && ctx.item?.type === 'spell' ? 'fail' : '') },
		}),

		underwaterCombat: mkStatus('underwater', _localize('AC5E.Statuses.UnderwaterCombat'), {
			attack: {
				subject: (ctx) => {
					if (!settings.expandedConditions) return '';
					const isMelee =
						ctx.activity?.getActionType(ctx.attackMode) === 'mwak' &&
						!ctx.subject?.system.attributes.movement.swim &&
						!['dagger', 'javelin', 'shortsword', 'spear', 'trident'].includes(ctx.item?.system.type.baseItem);
					const isRanged =
						ctx.activity?.getActionType(ctx.attackMode) === 'rwak' &&
						!['lightcrossbow', 'handcrossbow', 'heavycrossbow', 'net'].includes(ctx.item?.system.type.baseItem) &&
						!ctx.item?.system.properties.has('thr') &&
						ctx.distance <= ctx.activity?.range.value;
					if (isMelee || isRanged) return 'disadvantage';
					if (ctx.activity?.getActionType(ctx.attackMode) === 'rwak' && ctx.distance > ctx.activity?.range.value) return 'fail';
					return '';
				},
			},
		}),
	};

	return tables;
}

function hasStatusFromOpponent(actor, status, origin) {
	return actor?.appliedEffects.some((effect) => effect.statuses.has(status) && effect.origin && _getEffectOriginToken(effect, 'token')?.actor.uuid === origin?.uuid);
}

function hasGrappledFromOther(ctx) {
	return ctx.subject?.appliedEffects.some((e) => e.statuses.has('grappled') && e.origin && _getEffectOriginToken(e, 'token') !== ctx.opponentToken);
}

function isFrightenedByVisibleSource(ctx) {
	if (ctx.type !== 'subject') return false;
	const frightenedEffects = ctx.subject?.appliedEffects.filter((effect) => effect.statuses.has('frightened') && effect.origin);
	if (ctx.subject?.statuses.has('frightened') && !frightenedEffects.length) return true; //if none of the effects that apply frightened status on the actor have an origin, force true
	return frightenedEffects.some((effect) => {
		const originToken = _getEffectOriginToken(effect, 'token'); //undefined if no effect.origin
		return originToken && canSee(ctx.subjectToken, originToken);
	});
}

function getStatusEffectResult({ status, statusEntry, hook, type, context, exhaustionLvl, isSubjectExhausted }) {
	if (!statusEntry) return { result: '', overrideName: undefined };
	if (status === 'exhaustion' && isSubjectExhausted) {
		const levelRules = statusEntry.rules?.levels?.[exhaustionLvl];
		const result = evaluateStatusRule(levelRules?.[hook]?.[type], context);
		return applyStatusEffectOverrides({ status, hook, type, context, result });
	}
	const result = evaluateStatusRule(statusEntry.rules?.[hook]?.[type], context);
	return applyStatusEffectOverrides({ status, hook, type, context, result });
}

function evaluateStatusRule(rule, context) {
	if (!rule) return '';
	return typeof rule === 'function' ? rule(context) : rule;
}

function withStatusOverrideLabel(baseName, overrideName) {
	if (!baseName && !overrideName) return '';
	const base = String(baseName ?? '').trim();
	const override = String(overrideName ?? '').trim();
	if (!override) return base;
	if (!base) return override;
	return `${base} (${override})`;
}

function applyStatusEffectOverrides({ status, hook, type, context, result }) {
	if (!statusEffectsOverrideState.list.length) return { result, overrideName: undefined };
	const matches = statusEffectsOverrideState.list.filter((entry) => matchesStatusEffectOverride(entry, status, hook, type)).sort((a, b) => (a.priority || 0) - (b.priority || 0));
	if (!matches.length) return { result, overrideName: undefined };
	let nextResult = result;
	let overrideName;
	for (const entry of matches) {
		if (typeof entry.when === 'function') {
			if (!entry.when({ status, hook, type, context, result: nextResult })) continue;
		} else if (entry.when === false) {
			continue;
		}
		const namedOverride = typeof entry.name === 'string' ? entry.name.trim() : '';
		if (namedOverride) overrideName = namedOverride;
		if (typeof entry.apply === 'function') {
			const updated = entry.apply({ status, hook, type, context, result: nextResult });
			if (updated !== undefined) nextResult = updated;
			continue;
		}
		if (entry.result !== undefined) nextResult = entry.result;
	}
	return { result: nextResult, overrideName };
}

function matchesStatusEffectOverride(entry, status, hook, type) {
	const statusMatch = matchesOverrideField(entry.status, status);
	const hookMatch = matchesOverrideField(entry.hook, hook);
	const typeMatch = matchesOverrideField(entry.type, type);
	return statusMatch && hookMatch && typeMatch;
}

function matchesOverrideField(field, value) {
	if (!field || field === '*' || field === 'all') return true;
	if (Array.isArray(field)) return field.includes(value);
	return field === value;
}

function _parseFlagBoolean(value) {
	if (value === undefined || value === null) return false;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (!normalized.length) return false;
		if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
		if (['false', '0', 'no', 'off'].includes(normalized)) return false;
	}
	return Boolean(value);
}

function _parseFlagBooleanStrict(value) {
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'boolean') return value;
	if (typeof value === 'number') return value !== 0;
	if (typeof value !== 'string') return undefined;
	const normalized = value.trim().toLowerCase();
	if (!normalized.length) return undefined;
	if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
	if (['false', '0', 'no', 'off'].includes(normalized)) return false;
	const parts = normalized
		.split(';')
		.map((part) => part.trim())
		.filter(Boolean);
	for (const part of parts) {
		if (part.includes('=') || part.includes(':')) continue;
		if (['true', '1', 'yes', 'on'].includes(part)) return true;
		if (['false', '0', 'no', 'off'].includes(part)) return false;
	}
	return undefined;
}

function _passesFriendOrFoeFilter({ sourceToken, targetToken, rawValue }) {
	if (typeof rawValue !== 'string') return true;
	const normalized = rawValue.toLowerCase();
	const hasAllies = normalized.includes('allies');
	const hasEnemies = normalized.includes('enemies');
	if (!hasAllies && !hasEnemies) return true;
	if (!sourceToken || !targetToken) return true;
	const sameDisposition = _dispositionCheck(sourceToken, targetToken, 'same');
	if (hasAllies && !sameDisposition) return false;
	if (hasEnemies && sameDisposition) return false;
	return true;
}

function _evaluateSuppressedStatusFlagValue({ rawValue, scope, targetToken, sourceToken, auraToken }) {
	if (_parseFlagBooleanStrict(rawValue) !== true) return false;
	if (scope === 'grants') return _passesFriendOrFoeFilter({ sourceToken, targetToken, rawValue });
	if (scope !== 'aura') return true;
	if (!_passesFriendOrFoeFilter({ sourceToken: auraToken ?? sourceToken, targetToken, rawValue })) return false;
	const normalized = typeof rawValue === 'string' ? rawValue.toLowerCase() : '';
	if (auraToken?.id && targetToken?.id && auraToken.id === targetToken.id && !normalized.includes('includeself')) return false;
	if (typeof rawValue !== 'string') return true;
	const radiusRaw = getBlacklistedKeysValue('radius', rawValue);
	if (!radiusRaw) return true;
	const radius = Number(radiusRaw);
	if (!Number.isFinite(radius)) return false;
	const wallsBlock = normalized.includes('wallsblock') ? 'sight' : false;
	const distance = _getDistance(auraToken, targetToken, false, true, wallsBlock, true);
	return Number.isFinite(distance) && distance <= radius;
}

function getSuppressedStatusData({ actor, statusId, type, subjectToken, opponentToken }) {
	if (!actor || !statusId) return { suppressed: false, labels: [] };
	const statusKey = statusId.capitalize();
	const flagName = `no${statusKey}`;
	const targetToken = type === 'opponent' ? opponentToken : subjectToken;
	const relatedToken = type === 'opponent' ? subjectToken : opponentToken;
	const sourceFlagPaths = [`flags.${Constants.MODULE_ID}.${flagName}`, `flags.ac5e.${flagName}`];
	const grantsFlagPaths = [`flags.${Constants.MODULE_ID}.grants.${flagName}`, `flags.ac5e.grants.${flagName}`];
	const auraFlagPaths = [`flags.${Constants.MODULE_ID}.aura.${flagName}`, `flags.ac5e.aura.${flagName}`];
	const labels = new Set();
	let suppressed = false;

	const evaluateActorFlags = ({ actorDocument, flagPaths, scope, sourceToken, auraToken }) => {
		if (!actorDocument) return;
		for (const path of flagPaths) {
			const rawValue = foundry.utils.getProperty(actorDocument, path);
			if (_evaluateSuppressedStatusFlagValue({ rawValue, scope, targetToken, sourceToken, auraToken })) {
				suppressed = true;
				return;
			}
		}
	};

	const evaluateEffects = ({ effects, flagPaths, scope, sourceToken, auraToken, buildLabel }) => {
		for (const effect of effects ?? []) {
			const changes = Array.isArray(effect?.changes) ? effect.changes : [];
			let matched = false;
			for (const change of changes) {
				if (!flagPaths.includes(change?.key)) continue;
				if (!_evaluateSuppressedStatusFlagValue({ rawValue: change?.value, scope, targetToken, sourceToken, auraToken })) continue;
				matched = true;
				break;
			}
			if (!matched) continue;
			suppressed = true;
			if (!effect?.name) continue;
			const nextLabel = typeof buildLabel === 'function' ? buildLabel(effect) : `${effect.name} (${flagName})`;
			if (nextLabel) labels.add(nextLabel);
		}
	};

	evaluateActorFlags({ actorDocument: actor, flagPaths: sourceFlagPaths, scope: 'source', sourceToken: targetToken });
	evaluateEffects({ effects: actor.appliedEffects, flagPaths: sourceFlagPaths, scope: 'source', sourceToken: targetToken, buildLabel: (effect) => `${effect.name} (${flagName})` });

	const relatedActor = relatedToken?.actor;
	evaluateActorFlags({ actorDocument: relatedActor, flagPaths: grantsFlagPaths, scope: 'grants', sourceToken: relatedToken });
	evaluateEffects({ effects: relatedActor?.appliedEffects, flagPaths: grantsFlagPaths, scope: 'grants', sourceToken: relatedToken, buildLabel: (effect) => `${effect.name} (grants.${flagName})` });

	for (const auraToken of canvas?.tokens?.placeables ?? []) {
		const auraActor = auraToken?.actor;
		if (!auraActor) continue;
		evaluateActorFlags({ actorDocument: auraActor, flagPaths: auraFlagPaths, scope: 'aura', sourceToken: auraToken, auraToken });
		evaluateEffects({
			effects: auraActor.appliedEffects,
			flagPaths: auraFlagPaths,
			scope: 'aura',
			sourceToken: auraToken,
			auraToken,
			buildLabel: (effect) => (auraToken?.name ? `${effect.name} - Aura (${auraToken.name}) (${flagName})` : `${effect.name} (aura.${flagName})`),
		});
	}

	if (!suppressed) return { suppressed: false, labels: [] };
	if (!labels.size) labels.add(`${_i18nConditions(statusKey) || statusKey} (${flagName})`);
	return { suppressed: true, labels: [...labels] };
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

		const actorType =
			key.includes('grants') ? 'opponent'
			: (includeAuras && key.includes('aura')) || (!key.includes('aura') && !key.includes('grants')) ? 'subject'
			: undefined;

		const modeMap = [
			['noadv', 'noAdvantage'],
			['nocrit', 'noCritical'],
			['nodis', 'noDisadvantage'],
			['diceupgrade', 'diceUpgrade'],
			['dicedowngrade', 'diceDowngrade'],
			['abilityoverride', 'abilityOverride'],
			['info', 'info'],
			['dis', 'disadvantage'],
			['adv', 'advantage'],
			['criticalthres', 'criticalThreshold'],
			['fumblethres', 'fumbleThreshold'],
			['crit', 'critical'],
			['modifyac', 'targetADC'], //we cleared the conflict with "mod" mode by going first
			['modifydc', 'targetADC'],
			['mod', 'modifiers'],
			['bonus', 'bonus'],
			['fail', 'fail'],
			['fumble', 'fumble'],
			['success', 'success'],
			['extradice', 'extraDice'],
			['range', 'range'],
		];

		// Range keys can contain substrings like "bonus" or "fail"; force range mode first.
		const mode = key.includes('.range.') ? 'range' : modeMap.find(([m]) => key.includes(m))?.[1];
		return { actorType, mode, isAll };
	};

	const validFlags = [];
	const pushUniqueValidFlag = (entry) => {
		if (!entry?.id) {
			validFlags.push(entry);
			return;
		}
		if (validFlags.some((existing) => existing?.id === entry.id)) {
			if (ac5e?.debug.optins) console.warn('AC5E optins: duplicate entry id skipped', { id: entry.id, entry });
			return;
		}
		validFlags.push(entry);
	};

	//Will return false only in case of both tokens being available AND the value includes allies OR enemies and the test of dispositionCheck returns false;
	const friendOrFoe = (tokenA, tokenB, value) => {
		if (!tokenA || !tokenB) return true;
		const normalizedValue = String(value ?? '').toLowerCase();
		const alliesOrEnemies =
			normalizedValue.includes('allies') ? 'allies'
			: normalizedValue.includes('enemies') ? 'enemies'
			: null;
		if (!alliesOrEnemies) return true;
		return alliesOrEnemies === 'allies' ? _dispositionCheck(tokenA, tokenB, 'same') : !_dispositionCheck(tokenA, tokenB, 'same');
	};

	const blacklist = new Set([
		'addto',
		'ability',
		'abilityoverride',
		'allies',
		'bonus',
		'cadence',
		'chance',
		'convertadvantage',
		'convertdisadvantage',
		'criticalstatic',
		'description',
		'enemies',
		'fail',
		'hastransitadvantage',
		'hastransitdisadvantage',
		'includeself',
		'itemlimited',
		'long',
		'longdisadvantage',
		'modifier',
		'name',
		'noconc',
		'noconcentration',
		'noconcentrationcheck',
		'nearbyfoes',
		'nearbyfoedisadvantage',
		'nonearbyfoes',
		'nonearbyfoedisadvantage',
		'nofail',
		'nolongdisadvantage',
		'nooutofrangefail',
		'once',
		'onceperturn',
		'onceperround',
		'oncepercombat',
		'optin',
		'outofrangefail',
		'override',
		'partialconsume',
		'radius',
		'reach',
		'set',
		'short',
		'singleaura',
		'threshold',
		'update',
		'usescount',
		'wallsblock',
	]);
	const knownKeyedKeywords = new Set([...blacklist, 'condition', 'priority']);
	const knownBooleanKeywords = new Set(['true', 'false', '0', '1']);
	const knownStandaloneKeywords = new Set([...blacklist, ...knownBooleanKeywords, 'turn', 'round', 'combat', 'encounter']);
	const damageTypeKeys = Object.keys(CONFIG?.DND5E?.damageTypes ?? {}).map((k) => k.toLowerCase());
	const damageTypeSet = new Set(damageTypeKeys);
	const contextKeywordList = globalThis?.[Constants.MODULE_NAME_SHORT]?.contextKeywords?.list?.();
	const contextKeywords = Array.isArray(contextKeywordList) ? new Set(contextKeywordList.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean)) : null;
	const keywordWarnings = new Set();
	const usageRuleEntries = globalThis?.[Constants.MODULE_NAME_SHORT]?.usageRules?.list?.();
	const usageRules = Array.isArray(usageRuleEntries) ? usageRuleEntries : [];
	const isTokenLikeKeyword = (token) => /^[a-z][a-z0-9_]*$/i.test(token);
	const parseKeywordFragment = (fragment) => {
		if (typeof fragment !== 'string') return null;
		const trimmed = fragment.trim();
		if (!trimmed) return null;
		const match = trimmed.match(/^([a-z][a-z0-9_]*)\s*([:=])\s*(.*)$/i);
		if (!match) return null;
		const keyword = match[1]?.trim().toLowerCase();
		const separator = match[2];
		const rawValue = match[3] ?? '';
		// Guard against treating comparison/assignment expressions as keyword fragments.
		if (separator === '=' && /^\s*[=<>!]/.test(rawValue)) return null;
		return { keyword, keywordValue: rawValue.trim() };
	};
	const warnKeywordIssue = ({ token, reason, actorName, effect, change, changeIndex }) => {
		const normalizedToken = String(token ?? '').trim();
		if (!normalizedToken) return;
		const warningKey = `${effect?.uuid ?? effect?.id}:${changeIndex}:${change?.key}:${normalizedToken.toLowerCase()}:${reason}`;
		if (keywordWarnings.has(warningKey)) return;
		keywordWarnings.add(warningKey);
		console.warn(`AC5E flag keyword warning: ${reason} "${normalizedToken}"`, {
			actorName: actorName ?? effect?.parent?.name ?? null,
			effectName: effect?.name ?? null,
			effectUuid: effect?.uuid ?? effect?.id ?? null,
			changeIndex,
			changeKey: change?.key ?? null,
		});
	};
	const validateFlagKeywords = ({ rawValue, actorName, effect, change, changeIndex, sandbox }) => {
		if (typeof rawValue !== 'string' || !rawValue.trim()) return;
		const sandboxIdentifierSet = new Set(
			Object.keys(sandbox ?? {})
				.map((entry) => String(entry).trim().toLowerCase())
				.filter(Boolean),
		);
		const sandboxFlatConstantSet = new Set(
			Object.keys(sandbox?._evalConstants ?? {})
				.map((entry) => String(entry).trim().toLowerCase())
				.filter(Boolean),
		);
		const fragments = rawValue
			.split(';')
			.map((part) => part.trim())
			.filter(Boolean);
		for (const fragment of fragments) {
			const parsedFragment = parseKeywordFragment(fragment);
			if (parsedFragment) {
				const { keyword, keywordValue } = parsedFragment;
				if (!keyword) continue;
				if (!knownKeyedKeywords.has(keyword) && isTokenLikeKeyword(keyword)) {
					if (contextKeywords?.has(keyword) || sandboxIdentifierSet.has(keyword) || sandboxFlatConstantSet.has(keyword)) continue;
					warnKeywordIssue({ token: keyword, reason: 'unknown keyword', actorName, effect, change, changeIndex });
					continue;
				}
				if (keyword === 'cadence') {
					const normalizedCadence = _normalizeCadenceKey(keywordValue);
					if (!normalizedCadence) warnKeywordIssue({ token: keywordValue || keyword, reason: 'invalid cadence value', actorName, effect, change, changeIndex });
				}
				if (keyword === 'chance') {
					const chanceNumber = Number(keywordValue);
					if (Number.isFinite(chanceNumber) && (chanceNumber < 1 || chanceNumber > 100)) {
						warnKeywordIssue({ token: keywordValue, reason: 'chance outside 1-100', actorName, effect, change, changeIndex });
					}
				}
				continue;
			}
			const normalizedFragment = fragment.toLowerCase();
			if (contextKeywords?.has(normalizedFragment)) continue;
			if (sandboxIdentifierSet.has(normalizedFragment) || sandboxFlatConstantSet.has(normalizedFragment)) continue;
			if (knownStandaloneKeywords.has(normalizedFragment) || damageTypeSet.has(normalizedFragment)) continue;
			// Standalone camelCase / mixed-case tokens are usually sandbox identifiers (e.g. isSpell).
			if (fragment.trim() !== normalizedFragment) continue;
			if (!isTokenLikeKeyword(normalizedFragment)) continue;
			warnKeywordIssue({ token: fragment, reason: 'unknown keyword', actorName, effect, change, changeIndex });
		}
	};

	const effectChangesTest = ({ change, actorType, hook, effect, updateArrays, auraTokenEvaluationData, evaluationData, changeIndex, auraTokenUuid }) => {
		const evalData = auraTokenEvaluationData ?? evaluationData ?? {};
		const debug = { effectUuid: effect.uuid, changeKey: change.key };
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
		const isRange = change.key.toLowerCase().includes('.range');
		const isAttackRangeHook = isRange && (hook === 'attack' || (hook === 'use' && activity?.type === 'attack'));
		const hasHook = change.key.includes(hook) || isAll || isConc || isDeath || isInit || isSkill || isTool || modifyHooks || isAttackRangeHook;
		if (!hasHook) return false;
		validateFlagKeywords({ rawValue: change.value, actorName: evalData?.effectActor?.name ?? evalData?.rollingActor?.name, effect, change, changeIndex, sandbox: evalData });
		const { actorType: resolvedActorType } = getActorAndModeType(change, Boolean(auraTokenEvaluationData));
		const cadenceActorType = resolvedActorType ?? actorType;
		if (change.value.toLowerCase().includes('itemlimited') && !effect.origin?.includes(evalData.item?.id)) return false;
		if (change.key.includes('aura') && auraTokenEvaluationData) {
			//isAura
			const auraToken = canvas.tokens.get(auraTokenEvaluationData.auraTokenId);
			if (auraTokenEvaluationData.auraTokenId === (isModifyAC ? opponentToken.id : subjectToken.id) && !change.value.toLowerCase().includes('includeself')) return false;
			if (!friendOrFoe(auraToken, isModifyAC ? opponentToken : subjectToken, change.value)) return false;
			let radius = getBlacklistedKeysValue('radius', change.value);
			if (radius) {
				radius = bonusReplacements(radius, auraTokenEvaluationData, true, effect);
				if (!radius) return false;
				radius = _ac5eSafeEval({ expression: radius, sandbox: auraTokenEvaluationData, mode: 'formula', debug });
				if (!radius) return false;
				const distanceTokenToAuraSource =
					!isModifyAC ?
						distanceToSource(auraToken, change.value.toLowerCase().includes('wallsblock') && 'sight')
					:	distanceToTarget(auraToken, change.value.toLowerCase().includes('wallsblock') && 'sight');
				if (distanceTokenToAuraSource <= radius) auraTokenEvaluationData.distanceTokenToAuraSource = distanceTokenToAuraSource;
				else return false;
			}
		} else if (change.key.includes('grants')) {
			//isGrants
			if (actorType === 'aura') return false;
			if (isModifyAC && actorType !== 'subject') return false;
			else if (actorType === 'subject' && !(isModifyAC || isModifyDC)) return false;
			else if (actorType === 'opponent' && isModifyDC) return false;
			if (!friendOrFoe(opponentToken, subjectToken, change.value)) return false;
		} else {
			//isSelf
			if (actorType === 'aura') return false;
			else if (actorType === 'opponent' && !(isModifyAC || isModifyDC)) return false;
			else if (actorType === 'subject' && isModifyAC) return false;
			if (!friendOrFoe(opponentToken, subjectToken, change.value)) return false;
		}
		const shouldProceedUses = handleUses({ actorType: cadenceActorType, change, effect, evalData, updateArrays, debug, hook, changeIndex, auraTokenUuid });
		if (!shouldProceedUses) return false;
		return true;
	};
	const getRequiredDamageTypes = (value) => {
		if (!value) return [];
		return value
			.split(';')
			.map((v) => v.trim().toLowerCase())
			.filter((v) => v && !v.includes('=') && !v.includes(':') && !blacklist.has(v) && damageTypeSet.has(v));
	};
	const getCustomName = (value) => {
		if (!value) return undefined;
		const match = value.match(/(?:^|;)\s*name\s*[:=]\s*([^;]+)/i);
		const name = match?.[1]?.trim();
		return name || undefined;
	};
	const getAddTo = (value) => {
		if (!value) return undefined;
		const match = value.match(/(?:^|;)\s*addto\s*[:=]\s*([^;]+)/i);
		const raw = match?.[1]?.trim()?.toLowerCase();
		if (!raw) return undefined;
		if (raw === 'all') return { mode: 'all', types: [] };
		if (raw === 'base') return { mode: 'base', types: [] };
		if (raw === 'global') return { mode: 'global', types: [] };
		const types = raw
			.split(/[,|]/)
			.map((v) => v.trim())
			.filter(Boolean);
		return types.length ? { mode: 'types', types } : undefined;
	};
	const getDescription = (value) => {
		if (!value) return undefined;
		const match = value.match(/(?:^|;)\s*description\s*[:=]\s*(?:"([^"]*)"|'([^']*)'|([^;]*))/i);
		const raw = match?.[1] ?? match?.[2] ?? match?.[3];
		const description = raw?.trim();
		return description || undefined;
	};
	const getUsesCountTarget = (value) => {
		const usesRaw = getBlacklistedKeysValue('usescount', value);
		if (usesRaw) {
			const { target } = _parseUsesCountSpec(usesRaw);
			return _normalizeUsesCountTarget(target)?.toLowerCase() || undefined;
		}
		const updateRaw = getBlacklistedKeysValue('update', value);
		if (!updateRaw) return undefined;
		const { target } = _parseUpdateSpec(updateRaw);
		return _normalizeUsesCountTarget(target)?.toLowerCase() || undefined;
	};
	const hasTransitAdvantageKeyword = (value) => {
		if (!value) return false;
		return /(?:^|;)\s*(?:hastransitadvantage|convertadvantage)\s*(?:;|$)/i.test(String(value));
	};
	const hasTransitDisadvantageKeyword = (value) => {
		if (!value) return false;
		return /(?:^|;)\s*(?:hastransitdisadvantage|convertdisadvantage)\s*(?:;|$)/i.test(String(value));
	};
	const hasCriticalStaticKeyword = (value) => {
		if (!value) return false;
		return /(?:^|;)\s*criticalstatic\s*(?:;|$)/i.test(String(value));
	};
	const isHpUsesTarget = (target) => {
		if (!target) return false;
		return target === 'hp' || target.endsWith('.hp') || target.endsWith('attributes.hp.value') || target.endsWith('system.attributes.hp.value');
	};
	ac5eConfig.chanceRolls ??= {};
	const chanceRollCache = ac5eConfig.chanceRolls;
	const localizeText = (key, fallback) => {
		const localized = _localize(key);
		return localized === key ? fallback : localized;
	};
	const localizeTemplate = (key, data, fallback) => {
		if (game?.i18n?.has?.(key)) return game.i18n.format(key, data ?? {});
		return fallback;
	};
	const hookLabel = (hookType) => {
		if (hookType === 'attack') return localizeText('AC5E.OptinDescription.Roll.Attack', 'attack rolls');
		if (hookType === 'damage') return localizeText('AC5E.OptinDescription.Roll.Damage', 'damage rolls');
		if (hookType === 'check') return localizeText('AC5E.OptinDescription.Roll.Check', 'checks');
		if (hookType === 'save') return localizeText('AC5E.OptinDescription.Roll.Save', 'saving throws');
		return localizeText('AC5E.OptinDescription.Roll.Generic', 'rolls');
	};
	const formatSignedNumber = (value) => {
		const num = Number(value);
		if (Number.isFinite(num)) return num >= 0 ? `+${num}` : `${num}`;
		return String(value ?? '').trim();
	};
	const buildAutoDescription = ({ mode, hook, bonus, modifier, set, threshold }) => {
		const roll = hookLabel(hook);
		switch (mode) {
			case 'advantage':
				return localizeTemplate('AC5E.OptinDescription.GrantsAdvantage', { roll }, `Grants advantage on ${roll}`);
			case 'disadvantage':
				return localizeTemplate('AC5E.OptinDescription.ImposesDisadvantage', { roll }, `Imposes disadvantage on ${roll}`);
			case 'noAdvantage':
				return localizeTemplate('AC5E.OptinDescription.RemovesAdvantage', { roll }, `Removes advantage on ${roll}`);
			case 'noDisadvantage':
				return localizeTemplate('AC5E.OptinDescription.RemovesDisadvantage', { roll }, `Removes disadvantage on ${roll}`);
			case 'critical':
				return localizeText('AC5E.OptinDescription.ForcesCritical', 'Forces a critical hit');
			case 'noCritical':
				return localizeText('AC5E.OptinDescription.PreventsCritical', 'Prevents critical hits');
			case 'fail':
				return localizeTemplate('AC5E.OptinDescription.ForcesFailure', { roll }, `Forces automatic failure on ${roll}`);
			case 'fumble':
				return localizeText('AC5E.OptinDescription.ForcesFumble', 'Forces a fumble');
			case 'success':
				return localizeTemplate('AC5E.OptinDescription.ForcesSuccess', { roll }, `Forces automatic success on ${roll}`);
			case 'info':
				return localizeTemplate('AC5E.OptinDescription.AppliesNonRollEffect', { roll }, `Applies a non-roll effect on ${roll}`);
			case 'bonus':
				if (set !== undefined) return localizeTemplate('AC5E.OptinDescription.SetsRollBonus', { roll, value: set }, `Sets ${roll} bonus to ${set}`);
				if (bonus !== undefined && bonus !== '')
					return localizeTemplate('AC5E.OptinDescription.AppliesRollBonus', { roll, value: formatSignedNumber(bonus) }, `Applies ${formatSignedNumber(bonus)} to ${roll}`);
				return localizeTemplate('AC5E.OptinDescription.ModifiesRollBonus', { roll }, `Modifies ${roll} bonus`);
			case 'targetADC':
				if (set !== undefined) return localizeTemplate('AC5E.OptinDescription.SetsTargetAC', { value: set }, `Sets target AC to ${set}`);
				if (bonus !== undefined && bonus !== '')
					return localizeTemplate('AC5E.OptinDescription.ModifiesTargetACBy', { value: formatSignedNumber(bonus) }, `Modifies target AC by ${formatSignedNumber(bonus)}`);
				return localizeText('AC5E.OptinDescription.ModifiesTargetAC', 'Modifies target AC');
			case 'modifiers':
				if (typeof modifier === 'string') {
					const minMatch = modifier.match(/^min\s*(-?\d+(?:\.\d+)?)$/i);
					if (minMatch) return localizeTemplate('AC5E.OptinDescription.SetsMinimumD20', { value: minMatch[1] }, `Sets minimum d20 result to ${minMatch[1]}`);
					const maxMatch = modifier.match(/^max\s*(-?\d+(?:\.\d+)?)$/i);
					if (maxMatch) return localizeTemplate('AC5E.OptinDescription.SetsMaximumD20', { value: maxMatch[1] }, `Sets maximum d20 result to ${maxMatch[1]}`);
					return localizeTemplate('AC5E.OptinDescription.AppliesRollModifierWithValue', { value: modifier }, `Applies roll modifier (${modifier})`);
				}
				return localizeText('AC5E.OptinDescription.AppliesRollModifier', 'Applies roll modifier');
			case 'criticalThreshold':
				if (threshold !== undefined) return localizeTemplate('AC5E.OptinDescription.SetsCriticalThreshold', { value: threshold }, `Sets critical threshold to ${threshold}`);
				if (set !== undefined) return localizeTemplate('AC5E.OptinDescription.SetsCriticalThreshold', { value: set }, `Sets critical threshold to ${set}`);
				return localizeText('AC5E.OptinDescription.ModifiesCriticalThreshold', 'Modifies critical threshold');
			case 'fumbleThreshold':
				if (threshold !== undefined) return localizeTemplate('AC5E.OptinDescription.SetsFumbleThreshold', { value: threshold }, `Sets fumble threshold to ${threshold}`);
				if (set !== undefined) return localizeTemplate('AC5E.OptinDescription.SetsFumbleThreshold', { value: set }, `Sets fumble threshold to ${set}`);
				return localizeText('AC5E.OptinDescription.ModifiesFumbleThreshold', 'Modifies fumble threshold');
			case 'extraDice':
				if (bonus !== undefined && bonus !== '') return localizeTemplate('AC5E.OptinDescription.AddsExtraDamageDiceWithValue', { value: bonus }, `Adds extra damage dice (${bonus})`);
				return localizeText('AC5E.OptinDescription.AddsExtraDamageDice', 'Adds extra damage dice');
			case 'diceUpgrade':
				if (bonus !== undefined && bonus !== '') return localizeTemplate('AC5E.OptinDescription.UpgradesDamageDiceWithValue', { value: bonus }, `Upgrades damage dice (${bonus})`);
				return localizeText('AC5E.OptinDescription.UpgradesDamageDice', 'Upgrades damage dice');
			case 'diceDowngrade':
				if (bonus !== undefined && bonus !== '') return localizeTemplate('AC5E.OptinDescription.DowngradesDamageDiceWithValue', { value: bonus }, `Downgrades damage dice (${bonus})`);
				return localizeText('AC5E.OptinDescription.DowngradesDamageDice', 'Downgrades damage dice');
			case 'range':
				return localizeText('AC5E.OptinDescription.ModifiesAttackRange', 'Modifies attack range behavior');
			case 'abilityOverride':
				if (hook !== 'attack') return undefined;
				if (typeof bonus === 'string' && bonus.trim()) return `Uses ${bonus.trim().toUpperCase()} for ${roll}`;
				return `Overrides the ability used for ${roll}`;
			default:
				return undefined;
		}
	};
	const parseAbilityOverride = (rawValue) => {
		const direct = getBlacklistedKeysValue('abilityoverride', rawValue) || getBlacklistedKeysValue('override', rawValue) || '';
		const normalizedDirect = String(direct ?? '')
			.trim()
			.toLowerCase();
		if (['str', 'dex', 'con', 'int', 'wis', 'cha'].includes(normalizedDirect)) return normalizedDirect;
		return '';
	};
	const parseBooleanValue = (raw) => {
		if (raw === undefined || raw === null) return undefined;
		const normalized = String(raw).trim().toLowerCase();
		if (!normalized.length) return true;
		if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
		if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
		return undefined;
	};
	const parseRangeComponent = ({ expression, evaluationData, effect, isAura, debug }) => {
		if (expression === undefined || expression === null) return undefined;
		const raw = String(expression).trim();
		if (!raw.length) return undefined;
		const operation = /^[+-]/.test(raw) ? 'delta' : 'set';
		const replacement = bonusReplacements(raw, evaluationData, isAura, effect);
		let evaluated = _ac5eSafeEval({ expression: replacement, sandbox: evaluationData, mode: 'formula', debug });
		if (!Number.isFinite(Number(evaluated))) evaluated = evalDiceExpression(evaluated);
		const value = Number(evaluated);
		if (!Number.isFinite(value)) return undefined;
		return { operation, value };
	};
	const parseRangeToggle = ({ expression, evaluationData, effect, isAura, debug }) => {
		if (expression === undefined || expression === null) return undefined;
		const raw = String(expression).trim();
		if (!raw.length) return true;
		const direct = parseBooleanValue(raw);
		if (direct !== undefined) return direct;
		const replacement = bonusReplacements(raw, evaluationData, isAura, effect);
		let evaluated = _ac5eSafeEval({ expression: replacement, sandbox: evaluationData, mode: 'formula', debug });
		if (!Number.isFinite(Number(evaluated))) {
			evaluated = evalDiceExpression(evaluated);
		}
		const numeric = Number(evaluated);
		if (Number.isFinite(numeric)) return numeric !== 0;
		const parsedEvaluated = parseBooleanValue(evaluated);
		if (parsedEvaluated !== undefined) return parsedEvaluated;
		evaluated = _ac5eSafeEval({ expression: replacement, sandbox: evaluationData, mode: 'condition', debug });
		return parseBooleanValue(evaluated);
	};
	const getRangeKeyedValue = (value, ...keys) => {
		for (const key of keys) {
			const match = getBlacklistedKeysValue(key, value);
			if (match) return match;
		}
		return '';
	};
	const hasStandaloneRangeKeyword = (value, keyword) => new RegExp(`(?:^|;)\\s*${keyword}\\s*(?:;|$)`, 'i').test(String(value ?? ''));
	const parseRangeData = ({ key, value, evaluationData, effect, isAura, debug }) => {
		const lowerKey = String(key ?? '').toLowerCase();
		const explicitMatch = lowerKey.match(
			/\.range\.(short|long|reach|bonus|longdisadvantage|nolongdisadvantage|nearbyfoes|nonearbyfoes|nearbyfoedisadvantage|nonearbyfoedisadvantage|fail|outofrangefail|nofail|nooutofrangefail)$/i,
		);
		const explicitValue =
			String(value ?? '')
				.split(';')
				.map((v) => v.trim())
				.find((v) => v && !v.includes('=') && !v.includes(':')) ??
			String(value ?? '')
				.split(';')[0]
				?.trim() ??
			'';
		const rangeData = {};
		const explicitKey = explicitMatch?.[1] ?? '';
		const shortRaw = explicitKey === 'short' ? explicitValue : getRangeKeyedValue(value, 'short');
		const longRaw = explicitKey === 'long' ? explicitValue : getRangeKeyedValue(value, 'long');
		const reachRaw = explicitKey === 'reach' ? explicitValue : getRangeKeyedValue(value, 'reach');
		const bonusRaw = explicitKey === 'bonus' ? explicitValue : getRangeKeyedValue(value, 'bonus');
		const longDisRaw = explicitKey === 'longdisadvantage' ? explicitValue : getRangeKeyedValue(value, 'longDisadvantage');
		const noLongRaw = explicitKey === 'nolongdisadvantage' ? explicitValue : getRangeKeyedValue(value, 'noLongDisadvantage');
		const nearbyDisRaw = explicitKey === 'nearbyfoedisadvantage' || explicitKey === 'nearbyfoes' ? explicitValue : getRangeKeyedValue(value, 'nearbyFoeDisadvantage', 'nearbyFoes');
		const noNearbyDisRaw = explicitKey === 'nonearbyfoedisadvantage' || explicitKey === 'nonearbyfoes' ? explicitValue : getRangeKeyedValue(value, 'noNearbyFoeDisadvantage', 'noNearbyFoes');
		const failRaw = explicitKey === 'fail' || explicitKey === 'outofrangefail' ? explicitValue : getRangeKeyedValue(value, 'fail', 'outOfRangeFail');
		const noFailRaw = explicitKey === 'nofail' || explicitKey === 'nooutofrangefail' ? explicitValue : getRangeKeyedValue(value, 'noFail', 'noOutOfRangeFail');
		if (shortRaw) rangeData.short = parseRangeComponent({ expression: shortRaw, evaluationData, effect, isAura, debug });
		if (longRaw) rangeData.long = parseRangeComponent({ expression: longRaw, evaluationData, effect, isAura, debug });
		if (reachRaw) rangeData.reach = parseRangeComponent({ expression: reachRaw, evaluationData, effect, isAura, debug });
		if (bonusRaw) rangeData.bonus = parseRangeComponent({ expression: bonusRaw, evaluationData, effect, isAura, debug });
		let longDisadvantage = parseRangeToggle({ expression: longDisRaw, evaluationData, effect, isAura, debug });
		let noLongDisadvantage = parseRangeToggle({ expression: noLongRaw, evaluationData, effect, isAura, debug });
		if (longDisadvantage === undefined && explicitKey === 'longdisadvantage') longDisadvantage = true;
		if (noLongDisadvantage === undefined && explicitKey === 'nolongdisadvantage') noLongDisadvantage = true;
		if (noLongDisadvantage === undefined && hasStandaloneRangeKeyword(value, 'nolongdisadvantage')) noLongDisadvantage = true;
		if (longDisadvantage === undefined && typeof noLongDisadvantage === 'boolean') longDisadvantage = !noLongDisadvantage;
		if (typeof noLongDisadvantage === 'boolean') rangeData.noLongDisadvantage = noLongDisadvantage;
		if (typeof longDisadvantage === 'boolean') rangeData.longDisadvantage = longDisadvantage;

		let nearbyFoeDisadvantage = parseRangeToggle({ expression: nearbyDisRaw, evaluationData, effect, isAura, debug });
		let noNearbyFoeDisadvantage = parseRangeToggle({ expression: noNearbyDisRaw, evaluationData, effect, isAura, debug });
		if (nearbyFoeDisadvantage === undefined && (explicitKey === 'nearbyfoedisadvantage' || explicitKey === 'nearbyfoes')) nearbyFoeDisadvantage = true;
		if (noNearbyFoeDisadvantage === undefined && (explicitKey === 'nonearbyfoedisadvantage' || explicitKey === 'nonearbyfoes')) noNearbyFoeDisadvantage = true;
		if (noNearbyFoeDisadvantage === undefined && (hasStandaloneRangeKeyword(value, 'nonearbyfoedisadvantage') || hasStandaloneRangeKeyword(value, 'nonearbyfoes'))) noNearbyFoeDisadvantage = true;
		if (nearbyFoeDisadvantage === undefined && typeof noNearbyFoeDisadvantage === 'boolean') nearbyFoeDisadvantage = !noNearbyFoeDisadvantage;
		if (typeof nearbyFoeDisadvantage === 'boolean') rangeData.nearbyFoeDisadvantage = nearbyFoeDisadvantage;
		if (typeof nearbyFoeDisadvantage === 'boolean') rangeData.nearbyFoes = nearbyFoeDisadvantage;
		if (typeof noNearbyFoeDisadvantage === 'boolean') rangeData.noNearbyFoeDisadvantage = noNearbyFoeDisadvantage;
		if (typeof noNearbyFoeDisadvantage === 'boolean') rangeData.noNearbyFoes = noNearbyFoeDisadvantage;

		let fail = parseRangeToggle({ expression: failRaw, evaluationData, effect, isAura, debug });
		let noFail = parseRangeToggle({ expression: noFailRaw, evaluationData, effect, isAura, debug });
		if (fail === undefined && (explicitKey === 'fail' || explicitKey === 'outofrangefail')) fail = true;
		if (noFail === undefined && (explicitKey === 'nofail' || explicitKey === 'nooutofrangefail')) noFail = true;
		if (noFail === undefined && (hasStandaloneRangeKeyword(value, 'nofail') || hasStandaloneRangeKeyword(value, 'nooutofrangefail'))) noFail = true;
		if (fail === undefined && typeof noFail === 'boolean') fail = !noFail;
		if (typeof fail === 'boolean') rangeData.fail = fail;
		if (typeof fail === 'boolean') rangeData.outOfRangeFail = fail;
		if (typeof noFail === 'boolean') rangeData.noFail = noFail;
		if (typeof noFail === 'boolean') rangeData.noOutOfRangeFail = noFail;
		return rangeData;
	};
	const buildEntryLabel = (baseLabel, customName) => {
		if (customName) return `${baseLabel} (${customName})`;
		return baseLabel;
	};
	const buildResolvedEntryLabel = ({ effectName, customName, usesOverride, auraName } = {}) => {
		const overrideLabelName = typeof usesOverride?.labelName === 'string' ? usesOverride.labelName.trim() : '';
		const preferCustomName = Boolean(usesOverride?.preferCustomName && customName);
		const baseName = preferCustomName ? customName : overrideLabelName || effectName;
		const auraBase = auraName ? `${baseName} - Aura (${auraName})` : baseName;
		const inlineCustom = preferCustomName ? undefined : customName;
		return appendLabelSuffix(buildEntryLabel(auraBase, inlineCustom), usesOverride?.labelSuffix);
	};
	const applyIndexLabels = (entry, existing) => {
		if (entry.customName) return;
		const sameUnnamed = existing.filter((e) => !e.customName);
		if (!sameUnnamed.length) return;
		const updateIndexLabel = (target) => {
			if (target.customName) return;
			if (target.label?.includes('#')) return;
			const indexValue = Number.isInteger(target.changeIndex) ? target.changeIndex : undefined;
			if (indexValue === undefined) return;
			target.label = `${target.label} #${indexValue}`;
			target.index = indexValue;
		};
		sameUnnamed.forEach((e) => updateIndexLabel(e));
		updateIndexLabel(entry);
	};

	const updateArrays = {
		activityUpdates: [],
		activityUpdatesGM: [],
		actorUpdates: [],
		actorUpdatesGM: [],
		effectDeletions: [],
		effectDeletionsGM: [],
		effectUpdates: [],
		effectUpdatesGM: [],
		itemUpdates: [],
		itemUpdatesGM: [],
		pendingUses: [],
		usesOverrides: {},
	};
	const resolveDescription = (baseDescription, overrideDescription) => {
		if (baseDescription) return baseDescription;
		return overrideDescription;
	};
	const appendLabelSuffix = (baseLabel, suffix) => {
		if (typeof suffix !== 'string') return baseLabel;
		const trimmed = suffix.trim();
		if (!trimmed) return baseLabel;
		return `${baseLabel}: ${trimmed}`;
	};
	const getUsesOverride = ({ entryId, effect, changeIndex, hookType }) => {
		const overrides = updateArrays.usesOverrides ?? {};
		const baseId = `${effect.uuid ?? effect.id}:${changeIndex}:${hookType}`;
		return overrides[entryId] ?? overrides[baseId] ?? null;
	};
	const getValuesToEvaluate = ({ value, mode, bonus, effect }) => {
		let valuesToEvaluate = value
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
		return valuesToEvaluate;
	};
	const buildValidFlagEntry = ({ change, changeIndex, effect, hook, sandbox, isAura = false, auraToken = null, sourceActor = null, sourceNameFallback = '' }) => {
		const { actorType, mode } = getActorAndModeType(change, isAura);
		if (!actorType || !mode) return null;
		if (mode === 'abilityOverride' && hook !== 'attack') return null;
		const debug = { effectUuid: effect.uuid, changeKey: change.key };
		const entryId =
			isAura && auraToken?.document?.uuid ? `${effect.uuid ?? effect.id}:${changeIndex}:${hook}:aura:${auraToken.document.uuid}` : `${effect.uuid ?? effect.id}:${changeIndex}:${hook}:${actorType}`;
		const usesOverride = getUsesOverride({ entryId, effect, changeIndex, hookType: hook });
		const { bonus, modifier, set, threshold, chance } = preEvaluateExpression({
			value: change.value,
			mode,
			hook,
			effect,
			evaluationData: sandbox,
			isAura,
			debug,
			chanceCache: chanceRollCache,
			chanceKey: entryId,
		});
		const forceOptin = Boolean(usesOverride?.forceOptin);
		const optin = change.value.toLowerCase().includes('optin') || forceOptin;
		const cadence = _extractCadenceFromValue(change.value);
		const customName = getCustomName(change.value);
		const requiredDamageTypes = getRequiredDamageTypes(change.value);
		const addTo = getAddTo(change.value);
		const usesCountTarget = getUsesCountTarget(change.value);
		const requiresTransitAdvantage = hasTransitAdvantageKeyword(change.value);
		const requiresTransitDisadvantage = hasTransitDisadvantageKeyword(change.value);
		const criticalStatic = mode === 'extraDice' && hasCriticalStaticKeyword(change.value);
		const abilityOverride = mode === 'abilityOverride' ? parseAbilityOverride(change.value) : '';
		const description = resolveDescription(getDescription(change.value), usesOverride?.description);
		const autoDescription =
			!description && (optin || usesOverride?.forceDescription) ?
				buildAutoDescription({ mode, hook, bonus: mode === 'abilityOverride' ? abilityOverride : bonus, modifier, set, threshold })
			:	undefined;
		const valuesToEvaluate = getValuesToEvaluate({ value: change.value, mode, bonus, effect });
		const evaluation = getMode({ value: valuesToEvaluate, sandbox, debug }) && (!chance?.enabled || chance.triggered);
		const label = buildResolvedEntryLabel({ effectName: effect.name, customName, usesOverride, auraName: isAura ? auraToken?.name : undefined });
		const entry = {
			id: entryId,
			name: effect.name,
			label,
			customName,
			description,
			autoDescription,
			actorType,
			target: actorType,
			hook,
			mode,
			bonus,
			modifier,
			set,
			threshold,
			chance,
			evaluation,
			optin,
			forceOptin,
			cadence,
			criticalStatic,
			abilityOverride,
			requiredDamageTypes,
			addTo,
			usesCountTarget,
			usesCountHp: isHpUsesTarget(usesCountTarget),
			requiresTransitAdvantage,
			requiresTransitDisadvantage,
			changeIndex,
			effectUuid: effect.uuid,
			changeKey: change.key,
			sourceActorId: sourceActor?.id ?? null,
			sourceActorName: sourceActor?.name ?? sourceNameFallback,
			permissionSourceActorId: typeof usesOverride?.permissionSourceActorId === 'string' ? usesOverride.permissionSourceActorId : null,
			permissionSourceActorName: typeof usesOverride?.permissionSourceActorName === 'string' ? usesOverride.permissionSourceActorName : '',
		};
		if (isAura) {
			entry.isAura = true;
			entry.auraUuid = effect.uuid;
			entry.auraTokenUuid = auraToken?.document?.uuid;
			entry.distance = _getDistance(auraToken, subjectToken);
		}
		if (mode === 'range') entry.range = parseRangeData({ key: change.key, value: change.value, evaluationData: sandbox, effect, isAura, debug });
		return entry;
	};
	const processEffectChange = ({ change, changeIndex, effect, hook, sandbox, actorType, token = null, isAura = false, auraToken = null, sourceActor = null, sourceNameFallback = '' }) => {
		if (
			!effectChangesTest({
				token,
				change,
				actorType,
				hook,
				effect,
				updateArrays,
				evaluationData: isAura ? undefined : sandbox,
				auraTokenEvaluationData: isAura ? sandbox : undefined,
				changeIndex,
				auraTokenUuid: auraToken?.document?.uuid,
			})
		)
			return;
		const entry = buildValidFlagEntry({ change, changeIndex, effect, hook, sandbox, isAura, auraToken, sourceActor, sourceNameFallback });
		if (!entry?.evaluation) return;
		if (isAura && change.value.toLowerCase().includes('singleaura')) {
			const wallsBlock = change.value.toLowerCase().includes('wallsblock') && 'sight';
			const sameAuras = validFlags.filter((existing) => existing.isAura && existing.name === effect.name);
			if (sameAuras.length) {
				let shouldAdd = true;
				for (const aura of sameAuras) {
					const auraBonus = aura.bonus;
					const replaceAura =
						(!isNaN(auraBonus) && !isNaN(entry.bonus) && auraBonus < entry.bonus) ||
						((!isNaN(auraBonus) || !isNaN(entry.bonus)) && aura.distance > _getDistance(auraToken, subjectToken, false, true, wallsBlock));
					if (replaceAura) {
						const idx = validFlags.indexOf(aura);
						if (idx >= 0) validFlags.splice(idx, 1);
					} else {
						shouldAdd = false;
						break;
					}
				}
				if (!shouldAdd) return;
			}
		}
		const sameType = validFlags.filter((existing) => existing.effectUuid === effect.uuid && existing.hook === hook);
		applyIndexLabels(entry, sameType);
		pushUniqueValidFlag(entry);
	};
	const processAppliedEffects = ({ effects, hook, sandbox, actorType, token = null, isAura = false, auraToken = null, sourceActor = null, sourceNameFallback = '' }) => {
		effects?.forEach((effect) => {
			effect.changes.forEach((change, changeIndex) => {
				processEffectChange({ change, changeIndex, effect, hook, sandbox, actorType, token, isAura, auraToken, sourceActor, sourceNameFallback });
			});
		});
	};
	// const placeablesWithRelevantAuras = {};
	canvas.tokens.placeables.filter((token) => {
		if (!token.actor) return false;
		// if (token.actor.items.getName(_localize('AC5E.Items.AuraOfProtection'))) {
		// }
		//const distanceTokenToAuraSource = distanceToSource(token, false);
		const currentCombatant = game.combat?.active ? game.combat.combatant?.tokenId : null;
		const auraTokenEvaluationData = foundry.utils.mergeObject(
			evaluationData,
			{ auraActor: _ac5eActorRollData(token), isAuraSourceTurn: currentCombatant === token?.id, auraTokenId: token.id },
			{ inplace: false },
		);
		auraTokenEvaluationData.effectActor = auraTokenEvaluationData.auraActor;
		processAppliedEffects({
			effects: token.actor.appliedEffects,
			hook,
			sandbox: auraTokenEvaluationData,
			actorType: 'aura',
			isAura: true,
			auraToken: token,
			sourceActor: token.actor,
			sourceNameFallback: token?.name ?? '',
		});
	});
	if (evaluationData.auraActor) delete evaluationData.distanceTokenToAuraSource; //might be added in the data and we want it gone if not needed
	if (evaluationData.effectActor) delete evaluationData.effectActor;
	evaluationData.effectActor = evaluationData.rollingActor;
	evaluationData.nonEffectActor = evaluationData.opponentActor;
	processAppliedEffects({
		effects: subject?.appliedEffects,
		hook,
		sandbox: evaluationData,
		actorType: 'subject',
		token: subjectToken,
		sourceActor: subject,
	});
	if (evaluationData.effectActor) delete evaluationData.effectActor;
	if (evaluationData.nonEffectActor) delete evaluationData.nonEffectActor;
	if (opponent) {
		evaluationData.effectActor = evaluationData.opponentActor;
		evaluationData.nonEffectActor = evaluationData.rollingActor;
		processAppliedEffects({
			effects: opponent.appliedEffects,
			hook,
			sandbox: evaluationData,
			actorType: 'opponent',
			token: opponentToken,
			sourceActor: opponent,
		});
	}

	for (const rule of usageRules) {
		const ruleScope = String(rule?.scope ?? 'effect')
			.trim()
			.toLowerCase();
		if (ruleScope !== 'universal') continue;
		const sourceUuid =
			typeof rule?.effectUuid === 'string' ? rule.effectUuid.trim()
			: typeof rule?.sourceUuid === 'string' ? rule.sourceUuid.trim()
			: '';
		const sourceDoc = sourceUuid ? _safeFromUuidSync(sourceUuid) : null;
		if (sourceDoc?.documentName === 'Scene') {
			const currentSceneId = subjectToken?.scene?.id ?? opponentToken?.scene?.id ?? game?.combat?.scene?.id ?? canvas?.scene?.id ?? null;
			if (!currentSceneId || sourceDoc.id !== currentSceneId) continue;
		}
		const ruleHook = String(rule?.hook ?? '*')
			.trim()
			.toLowerCase();
		const hookMatches = (() => {
			if (!ruleHook || ruleHook === '*' || ruleHook === 'all') return true;
			if (ruleHook === hook) return true;
			if (ruleHook === 'checks' || ruleHook === 'check') return hook === 'check';
			if (ruleHook === 'saves' || ruleHook === 'save') return hook === 'save';
			if (ruleHook === 'skills' || ruleHook === 'skill') return hook === 'check' && Boolean(skill);
			if (ruleHook === 'tools' || ruleHook === 'tool') return hook === 'check' && Boolean(tool);
			if (ruleHook === 'concentration' || ruleHook === 'conc') return hook === 'save' && Boolean(isConcentration);
			if (ruleHook === 'death' || ruleHook === 'deathsave' || ruleHook === 'death-save') return hook === 'save' && Boolean(isDeathSave);
			if (ruleHook === 'initiative' || ruleHook === 'init') return hook === 'check' && Boolean(isInitiative);
			if (ruleHook === 'bonus') {
				const activationType = String(activity?.activation?.type ?? activity?.system?.activation?.type ?? '')
					.trim()
					.toLowerCase();
				return activationType === 'bonus';
			}
			return false;
		})();
		if (!hookMatches) continue;
		const mode = String(rule?.mode ?? '').trim();
		if (!mode) continue;
		if (mode === 'abilityOverride' && hook !== 'attack') continue;
		const targetType = String(rule?.target ?? 'subject')
			.trim()
			.toLowerCase();
		const cadenceActorType =
			targetType === 'aura' ? 'aura'
			: targetType === 'opponent' ? 'opponent'
			: 'subject';
		const actorType = cadenceActorType === 'aura' ? 'subject' : cadenceActorType;
		const ruleFallbackName = (() => {
			const directEffectName = typeof rule?.effectName === 'string' ? rule.effectName.trim() : '';
			if (directEffectName) return directEffectName;
			const sourceName = typeof sourceDoc?.name === 'string' ? sourceDoc.name.trim() : '';
			if (sourceName) return sourceName;
			const keyName = typeof rule?.key === 'string' ? rule.key.trim() : '';
			return keyName || 'Usage Rule';
		})();
		const registeredName = typeof rule?.name === 'string' ? rule.name.trim() : '';
		const rulePrimaryName = registeredName || ruleFallbackName;
		const fragments = [];
		if (rule?.bonus !== undefined && rule?.bonus !== null && String(rule.bonus).trim() !== '') fragments.push(`bonus=${rule.bonus}`);
		if (rule?.set !== undefined && rule?.set !== null && String(rule.set).trim() !== '') fragments.push(`set=${rule.set}`);
		if (rule?.modifier !== undefined && rule?.modifier !== null && String(rule.modifier).trim() !== '') fragments.push(`modifier=${rule.modifier}`);
		if (rule?.threshold !== undefined && rule?.threshold !== null && String(rule.threshold).trim() !== '') fragments.push(`threshold=${rule.threshold}`);
		if (rule?.chance !== undefined && rule?.chance !== null && String(rule.chance).trim() !== '') fragments.push(`chance=${rule.chance}`);
		if (rule?.addTo !== undefined && rule?.addTo !== null) {
			if (Array.isArray(rule.addTo)) fragments.push(`addTo=${rule.addTo.join(',')}`);
			else fragments.push(`addTo=${rule.addTo}`);
		}
		if (rule?.usesCount !== undefined && rule?.usesCount !== null && String(rule.usesCount).trim() !== '') fragments.push(`usesCount=${rule.usesCount}`);
		if (rule?.update !== undefined && rule?.update !== null && String(rule.update).trim() !== '') fragments.push(`update=${rule.update}`);
		if (rule?.abilityOverride !== undefined && rule?.abilityOverride !== null && String(rule.abilityOverride).trim() !== '') fragments.push(`abilityOverride=${rule.abilityOverride}`);
		if (rule?.itemLimited) fragments.push('itemLimited');
		if (rule?.description) fragments.push(`description=${rule.description}`);
		if (rule?.optin) fragments.push('optin');
		if (rule?.convertAdvantage || rule?.hasTransitAdvantage) fragments.push('convertAdvantage');
		if (rule?.convertDisadvantage || rule?.hasTransitDisadvantage) fragments.push('convertDisadvantage');
		if (rule?.criticalStatic) fragments.push('criticalStatic');
		if (rule?.partialConsume) fragments.push('partialConsume');
		if (rule?.cadence) fragments.push(rule.cadence);
		if (typeof rule?.condition === 'string' && rule.condition.trim()) fragments.push(rule.condition.trim());

		let runtimeConditionOk = true;
		if (typeof rule?.evaluate === 'function') {
			try {
				runtimeConditionOk = Boolean(rule.evaluate(evaluationData, { ac5eConfig, rule, subjectToken, opponentToken }));
			} catch (err) {
				runtimeConditionOk = false;
				console.warn(`AC5E usage rule "${rule?.key ?? rulePrimaryName}" evaluate() failed`, err);
			}
		}
		if (!runtimeConditionOk) continue;

		const ruleValue = fragments.join(';');
		const pseudoEffect = {
			id: `usage-rule-${rule.key}`,
			uuid: `UsageRule.${rule.key}`,
			name: rulePrimaryName,
			isOwner: true,
			transfer: false,
			target:
				cadenceActorType === 'opponent' ? opponent
				: cadenceActorType === 'aura' ? (evaluationData?.auraActor ?? subject)
				: subject,
			changes: [
				{
					key: `flags.${Constants.MODULE_ID}.${hook}.${mode}`,
					value: ruleValue,
				},
			],
		};
		const pseudoChange = pseudoEffect.changes[0];
		// Keep usage-rule entry ids aligned with handleUses cadence ids.
		const ruleId = `${pseudoEffect.uuid}:0:${hook}:${cadenceActorType}`;
		if (!handleUses({ actorType: cadenceActorType, change: pseudoChange, effect: pseudoEffect, evalData: evaluationData, updateArrays, debug: { usageRuleKey: rule.key }, hook, changeIndex: 0 }))
			continue;

		const { bonus, modifier, set, threshold, chance } = preEvaluateExpression({
			value: ruleValue,
			mode,
			hook,
			effect: pseudoEffect,
			evaluationData,
			debug: { usageRuleKey: rule.key },
			chanceCache: chanceRollCache,
			chanceKey: ruleId,
		});
		const optin = Boolean(rule?.optin);
		const cadence = _extractCadenceFromValue(ruleValue);
		const valueCustomName = getCustomName(ruleValue);
		const customName = valueCustomName;
		const resolvedCustomName = customName && customName !== rulePrimaryName ? customName : undefined;
		const requiredDamageTypes = getRequiredDamageTypes(ruleValue);
		const addTo = getAddTo(ruleValue);
		const usesCountTarget = getUsesCountTarget(ruleValue);
		const requiresTransitAdvantage = hasTransitAdvantageKeyword(ruleValue);
		const requiresTransitDisadvantage = hasTransitDisadvantageKeyword(ruleValue);
		const criticalStatic = mode === 'extraDice' && hasCriticalStaticKeyword(ruleValue);
		const abilityOverride = mode === 'abilityOverride' ? parseAbilityOverride(ruleValue) : '';
		const description = getDescription(ruleValue);
		const autoDescription = !description && optin ? buildAutoDescription({ mode, hook, bonus: mode === 'abilityOverride' ? abilityOverride : bonus, modifier, set, threshold }) : undefined;
		let valuesToEvaluate = ruleValue
			.split(';')
			.map((v) => v.trim())
			.filter((v) => {
				if (!v) return false;
				const [key] = v.split(/[:=]/).map((s) => s.trim());
				return !blacklist.has(key.toLowerCase());
			})
			.join(';');
		if (!valuesToEvaluate) valuesToEvaluate = mode === 'bonus' && !bonus ? 'false' : 'true';
		const evaluation = getMode({ value: valuesToEvaluate, sandbox: evaluationData, debug: { usageRuleKey: rule.key } }) && (!chance?.enabled || chance.triggered);
		const label = buildResolvedEntryLabel({ effectName: rulePrimaryName, customName: resolvedCustomName, usesOverride: null });
		const entry = {
			id: ruleId,
			name: rulePrimaryName,
			label,
			customName: resolvedCustomName,
			description,
			autoDescription,
			actorType,
			target: actorType,
			hook,
			mode,
			bonus,
			modifier,
			set,
			threshold,
			chance,
			evaluation,
			optin,
			forceOptin: false,
			cadence,
			criticalStatic,
			abilityOverride,
			requiredDamageTypes,
			addTo,
			usesCountTarget,
			usesCountHp: isHpUsesTarget(usesCountTarget),
			requiresTransitAdvantage,
			requiresTransitDisadvantage,
			changeIndex: 0,
			effectUuid: pseudoEffect.uuid,
			changeKey: pseudoChange.key,
			sourceActorId: null,
			sourceActorName: '',
		};
		if (mode === 'range') entry.range = parseRangeData({ key: pseudoChange.key, value: ruleValue, evaluationData, effect: pseudoEffect, isAura: false, debug: { usageRuleKey: rule.key } });
		pushUniqueValidFlag(entry);
	}
	if (foundry.utils.isEmpty(validFlags)) return ac5eConfig;

	const validActivityUpdates = [];
	const validActivityUpdatesGM = [];
	const validActorUpdates = [];
	const validActorUpdatesGM = [];
	const validEffectDeletions = [];
	const validEffectDeletionsGM = [];
	const validEffectUpdates = [];
	const validEffectUpdatesGM = [];
	const validItemUpdates = [];
	const validItemUpdatesGM = [];

	for (const entry of validFlags) {
		let { actorType, evaluation, mode, name, bonus, modifier, set, threshold, isAura, optin } = entry;
		if (mode.includes('skill') || mode.includes('tool')) mode = 'check';
		if (evaluation) {
			const entryBaseId = `${entry.effectUuid ?? ''}:${entry.changeIndex}:${hook}`;
			const matchesQueuedUpdate = (queued) => queued?.id === entry.id || (queued?.baseId && queued.baseId === entryBaseId);
			const pendingForEntry = updateArrays.pendingUses?.filter(matchesQueuedUpdate);
			const pendingModeFamily = _getPendingUseModeFamily(mode, hook);
			if (pendingForEntry?.length) {
				ac5eConfig.pendingUses ??= [];
				for (const pending of pendingForEntry) {
					ac5eConfig.pendingUses.push({
						...pending,
						id: entry.id,
						modeFamily: pendingModeFamily || pending?.modeFamily,
						modeKey: mode ?? pending?.modeKey,
					});
				}
			}
			for (const queued of updateArrays.activityUpdates.filter(matchesQueuedUpdate)) validActivityUpdates.push(queued.context ?? queued);
			for (const queued of updateArrays.activityUpdatesGM.filter(matchesQueuedUpdate)) validActivityUpdatesGM.push(queued.context ?? queued);
			for (const queued of updateArrays.actorUpdates.filter(matchesQueuedUpdate)) validActorUpdates.push(queued.context ?? queued);
			for (const queued of updateArrays.actorUpdatesGM.filter(matchesQueuedUpdate)) validActorUpdatesGM.push(queued.context ?? queued);
			for (const queued of updateArrays.effectDeletions.filter(matchesQueuedUpdate)) {
				const uuid = queued?.uuid ?? queued?.context?.uuid;
				if (typeof uuid === 'string' && uuid.length) validEffectDeletions.push(uuid);
			}
			for (const queued of updateArrays.effectDeletionsGM.filter(matchesQueuedUpdate)) {
				const uuid = queued?.uuid ?? queued?.context?.uuid;
				if (typeof uuid === 'string' && uuid.length) validEffectDeletionsGM.push(uuid);
			}
			for (const queued of updateArrays.effectUpdates.filter(matchesQueuedUpdate)) validEffectUpdates.push(queued.context ?? queued);
			for (const queued of updateArrays.effectUpdatesGM.filter(matchesQueuedUpdate)) validEffectUpdatesGM.push(queued.context ?? queued);
			for (const queued of updateArrays.itemUpdates.filter(matchesQueuedUpdate)) validItemUpdates.push(queued.context ?? queued);
			for (const queued of updateArrays.itemUpdatesGM.filter(matchesQueuedUpdate)) validItemUpdatesGM.push(queued.context ?? queued);
			if (['bonus', 'extraDice', 'diceUpgrade', 'diceDowngrade', 'range', 'abilityOverride'].includes(mode)) ac5eConfig[actorType][mode].push(entry);
			else if (optin) ac5eConfig[actorType][mode].push(entry);
			else {
				const hasDecoratedLabel = Boolean(entry?.label && entry.label !== name);
				const preserveEntryObject = (mode === 'fail' && Boolean(entry?.description)) || Boolean(entry?.chance?.enabled);
				ac5eConfig[actorType][mode].push(
					preserveEntryObject ? entry
					: isAura || hasDecoratedLabel ? entry.label
					: name,
				); // preserve index/custom labels
			}
			if (mode === 'bonus' || mode === 'targetADC' || mode === 'extraDice' || mode === 'diceUpgrade' || mode === 'diceDowngrade') {
				const configMode =
					mode === 'bonus' ? 'parts'
					: mode === 'targetADC' ? 'targetADC'
					: mode === 'extraDice' ? 'extraDice'
					: null;
				const entryValues = [];
				if (bonus) {
					if (bonus === 'info') continue; // special case for alterNERDtive
					if (hook === 'damage' && bonus.includes?.('[random]')) {
						const damageTypes = Object.keys(CONFIG.DND5E.damageTypes);
						const randomDamageType = damageTypes[Math.floor(Math.random() * damageTypes.length)];
						bonus = bonus.replaceAll('[random]', `[${randomDamageType}]`);
					}
					if (bonus.constructor?.metadata) bonus = String(bonus); // special case for rollingActor.scale.rogue['sneak-attack'] for example; returns the .formula
					if (typeof bonus === 'string') {
						const trimmedBonus = bonus.trim();
						const isDiceMultiplier = /^\+?\s*(?:x|\^)\s*-?\d+\s*$/i.test(trimmedBonus);
						if (!isDiceMultiplier && !(trimmedBonus.includes('+') || trimmedBonus.includes('-'))) bonus = `+${bonus}`;
					}
					entryValues.push(bonus);
				}
				if (set) entryValues.push(`${set}`);
				entry.values = entryValues;
				const deferTransitBonus = mode === 'bonus' && !optin && (entry.requiresTransitAdvantage || entry.requiresTransitDisadvantage);
				if (!deferTransitBonus && !optin && configMode) ac5eConfig[configMode].push(...entryValues);
			}
			if (modifier) {
				if (hook === 'damage') {
					ac5eConfig.damageModifiers.push({
						id: entry.id,
						value: modifier,
						optin: !!entry.optin,
						addTo: entry.addTo ? foundry.utils.duplicate(entry.addTo) : undefined,
						requiredDamageTypes: foundry.utils.duplicate(entry.requiredDamageTypes ?? []),
					});
				} else if (!optin) {
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
			if (mode === 'fumbleThreshold') {
				if (threshold) {
					if (typeof threshold === 'string' && !(threshold.includes('+') || threshold.includes('-'))) threshold = `+${threshold}`;
					ac5eConfig.fumbleThreshold.push(threshold);
				}
				if (set) ac5eConfig.fumbleThreshold.push(`${set}`);
			}
		}
	}
	ac5eQueue
		.add(async () => {
			try {
				const allPromises = [];
				const uniqueEffectDeletionUuids = Array.from(new Set(validEffectDeletions.filter((uuid) => typeof uuid === 'string' && uuid.length)));

				allPromises.push(...uniqueEffectDeletionUuids.map((uuid) => _safeDeleteByUuid(uuid, { source: 'queue-validFlags' })));
				allPromises.push(
					...validEffectUpdates.map((v) => {
						const doc = _safeFromUuidSync(v.uuid);
						return doc ? doc.update(v.updates) : Promise.resolve(null);
					}),
				);
				allPromises.push(
					...validItemUpdates.map((v) => {
						const doc = _safeFromUuidSync(v.uuid);
						return doc ? doc.update(v.updates) : Promise.resolve(null);
					}),
				);
				allPromises.push(
					...validActorUpdates.map((v) => {
						const doc = _safeFromUuidSync(v.uuid);
						return doc ? doc.update(v.updates, v.options) : Promise.resolve(null);
					}),
				);
				allPromises.push(
					...validActivityUpdates.map((v) => {
						const act = _safeFromUuidSync(v.uuid);
						return act ? act.update(v.updates) : Promise.resolve(null);
					}),
				);
				const settled = await Promise.allSettled(allPromises);

				const errors = settled
					.map((r, i) => ({ r, i }))
					.filter((x) => x.r.status === 'rejected')
					.map((x) => ({ index: x.i, reason: x.r.reason }));

				if (errors.length) {
					console.error('Some queued updates failed:', errors);
				}
			} catch (err) {
				console.error('Queued job error:', err);
				throw err; // rethrow so the queue's catch handler sees it
			}
		})
		.catch((err) => console.error('Queued job failed', err));

	const uniqueEffectDeletionsGM = Array.from(new Set(validEffectDeletionsGM.filter((uuid) => typeof uuid === 'string' && uuid.length)));
	_doQueries({ validActivityUpdatesGM, validActorUpdatesGM, validEffectDeletionsGM: uniqueEffectDeletionsGM, validEffectUpdatesGM, validItemUpdatesGM });

	return ac5eConfig;

	//special functions\\
	function getMode({ value, sandbox, debug }) {
		const rawValue = typeof value === 'string' ? value : String(value ?? '');
		const normalizedLiteral = rawValue.trim().toLowerCase();
		if (['1', 'true'].includes(normalizedLiteral)) return true;
		if (['0', 'false'].includes(normalizedLiteral)) return false;
		const clauses = rawValue
			.split(';')
			.map((v) => v.trim())
			.filter(Boolean);
		if (settings.debug) console.log('AC5E._getMode:', { clauses });
		const statuses = sandbox?.effectActor?.statuses;
		const statusConstants = Object.fromEntries(Object.keys(statuses ?? {}).map((status) => [status, true]));
		const baseConstants = sandbox?._evalConstants ?? {};
		const mergedConstants = { ...baseConstants, ...statusConstants };

		return clauses.some((clause) => {
			let mult = null;
			if (clause.startsWith('!') && !clause.includes('&') && !clause.includes('?') && !clause.includes('|')) {
				clause = clause.slice(1).trim();
				mult = '!';
			}
			const clauseSandbox = { ...sandbox, _evalConstants: { ...mergedConstants } };
			const result = _ac5eSafeEval({ expression: clause, sandbox: clauseSandbox, mode: 'condition', debug });
			return mult ? !result : result;
		});
	}
}

function _buildFinalStandDescription(finalValue) {
	const numeric = Number(finalValue);
	const value = Number.isFinite(numeric) ? numeric : finalValue;
	if (game?.i18n?.has?.('AC5E.OptinDescription.FinalStandDropsTo')) return game.i18n.format('AC5E.OptinDescription.FinalStandDropsTo', { value });
	return `Final stand (drops to ${value})`;
}

function _extractCustomNameFromValue(value) {
	if (!value || typeof value !== 'string') return undefined;
	const match = value.match(/(?:^|;)\s*name\s*[:=]\s*([^;]+)/i);
	const parsed = match?.[1]?.trim();
	return parsed || undefined;
}

function _registerUsesOverride(updateArrays, id, baseId, override = {}) {
	if (!updateArrays) return;
	updateArrays.usesOverrides ??= {};
	const currentId = updateArrays.usesOverrides[id] ?? {};
	updateArrays.usesOverrides[id] = { ...currentId, ...override };
	if (!baseId) return;
	const currentBase = updateArrays.usesOverrides[baseId] ?? {};
	updateArrays.usesOverrides[baseId] = { ...currentBase, ...override };
}

function _splitTopLevelCsv(input) {
	if (typeof input !== 'string') return [];
	const parts = [];
	let current = '';
	let depth = 0;
	let quote = null;
	let escaped = false;
	for (const char of input) {
		if (escaped) {
			current += char;
			escaped = false;
			continue;
		}
		if (quote) {
			current += char;
			if (char === '\\') escaped = true;
			else if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			quote = char;
			current += char;
			continue;
		}
		if (char === '(' || char === '[' || char === '{') {
			depth += 1;
			current += char;
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			depth = Math.max(0, depth - 1);
			current += char;
			continue;
		}
		if (char === ',' && depth === 0) {
			parts.push(current.trim());
			current = '';
			continue;
		}
		current += char;
	}
	parts.push(current.trim());
	return parts;
}

function _parseUsesCountSpec(rawValue) {
	const [target = '', ...consumeParts] = _splitTopLevelCsv(String(rawValue ?? ''));
	const consumeRaw = consumeParts.join(',').trim();
	return {
		target: target.trim(),
		consume: _repairLegacyUsesCountConsume(consumeRaw),
	};
}

function _parseUpdateSpec(rawValue) {
	const [target = '', ...valueParts] = _splitTopLevelCsv(String(rawValue ?? ''));
	const updateRaw = valueParts.join(',').trim();
	if (!updateRaw) return { target: target.trim(), op: 'delta', value: '' };
	if (updateRaw.startsWith('=')) return { target: target.trim(), op: 'set', value: updateRaw.slice(1).trim() };
	return { target: target.trim(), op: 'delta', value: updateRaw };
}

function _repairLegacyUsesCountConsume(consume) {
	if (typeof consume !== 'string') return consume;
	const trimmed = consume.trim();
	if (!trimmed) return '';
	const openCount = (trimmed.match(/[\(\[\{]/g) ?? []).length;
	const closeCount = (trimmed.match(/[\)\]\}]/g) ?? []).length;
	if (closeCount <= openCount) return trimmed;
	const parts = _splitTopLevelCsv(trimmed).filter(Boolean);
	if (parts.length <= 1) return trimmed;
	const candidate = parts[parts.length - 1]?.trim();
	return Number.isFinite(Number(candidate)) ? candidate : trimmed;
}

function _normalizeUsesCountTarget(target) {
	if (target == null) return '';
	const raw = String(target).trim();
	if (!raw) return '';
	const lower = raw.toLowerCase();
	if (['deathsuccess', 'death.success', 'death_success', 'attributes.death.success'].includes(lower)) return 'death.success';
	if (['deathfail', 'deathfailure', 'death.failure', 'death_fail', 'attributes.death.failure'].includes(lower)) return 'death.fail';
	return raw;
}

function _looksLikeFormulaExpression(value) {
	if (typeof value !== 'string') return false;
	return /[@0-9()+\-*/]/.test(value);
}

function _evaluateCounterExpression(rawValue, evalData, debug, fallback = null) {
	const trimmed = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
	const directNumber = Number(trimmed);
	if (Number.isFinite(directNumber)) return directNumber;
	if (!_looksLikeFormulaExpression(String(trimmed ?? ''))) return fallback;
	let evaluated = evalDiceExpression(String(trimmed ?? ''));
	if (!isNaN(evaluated)) return evaluated;
	evaluated = _ac5eSafeEval({ expression: trimmed, sandbox: evalData, mode: 'formula', debug });
	const evaluatedNumber = Number(evaluated);
	if (Number.isFinite(evaluatedNumber)) return evaluatedNumber;
	evaluated = evalDiceExpression(String(evaluated ?? ''));
	return !isNaN(evaluated) ? evaluated : fallback;
}

function _applyUpdateOperation(currentValue, amount, mode = 'delta') {
	if (!Number.isFinite(Number(currentValue)) || !Number.isFinite(Number(amount))) return null;
	const current = Number(currentValue);
	const numericAmount = Number(amount);
	return mode === 'set' ? numericAmount : current + numericAmount;
}

function _getPendingUseModeFamily(mode, hook = '') {
	const normalizedMode = String(mode ?? '')
		.trim()
		.toLowerCase();
	if (['advantage', 'disadvantage', 'noadvantage', 'nodisadvantage'].includes(normalizedMode)) return hook === 'damage' ? 'damage' : 'd20';
	if (['critical', 'nocritical'].includes(normalizedMode)) return 'damage';
	return '';
}

function handleUses({ actorType, change, effect, evalData, updateArrays, debug, hook, changeIndex, auraTokenUuid }) {
	const pendingUpdates = {
		activityUpdates: [],
		activityUpdatesGM: [],
		actorUpdates: [],
		actorUpdatesGM: [],
		effectDeletions: [],
		effectDeletionsGM: [],
		effectUpdates: [],
		effectUpdatesGM: [],
		itemUpdates: [],
		itemUpdatesGM: [],
	};
	const { activityUpdates, activityUpdatesGM, actorUpdates, actorUpdatesGM, effectDeletions, effectDeletionsGM, effectUpdates, effectUpdatesGM, itemUpdates, itemUpdatesGM } = pendingUpdates;
	const isOwner = effect.isOwner;
	const rawValues = String(change.value ?? '')
		.split(';')
		.filter(Boolean)
		.map((v) => v.trim());
	const keywordValues = rawValues.map((v) => v.toLowerCase());
	const hasCount = getBlacklistedKeysValue('usescount', change.value);
	const hasUpdate = getBlacklistedKeysValue('update', change.value);
	const cadence = _extractCadenceFromValue(change.value);
	const hasCadence = Boolean(cadence);
	const isOnce = keywordValues.some((use) => use === 'once');
	let isOptin = keywordValues.some((use) => use === 'optin');
	const partialConsume = keywordValues.some((use) => use === 'partialconsume');
	if (!hasCount && !hasUpdate && !isOnce && !hasCadence) {
		return true;
	}
	const effectId = effect.uuid ?? effect.id;
	const baseId = `${effectId}:${changeIndex}:${hook}`;
	const id = actorType === 'aura' && auraTokenUuid ? `${effectId}:${changeIndex}:${hook}:aura:${auraTokenUuid}` : `${effectId}:${changeIndex}:${hook}:${actorType}`;
	if (_isCadenceUseBlocked({ cadence, id, pendingUses: updateArrays?.pendingUses })) return false;
	const isTransfer = effect.transfer;
	if (isOnce && !isTransfer) {
		if (isOwner) effectDeletions.push({ name: effect.name, uuid: effect.uuid });
		else effectDeletionsGM.push({ name: effect.name, uuid: effect.uuid });
	} else if (isOnce && isTransfer) {
		if (isOwner) effectUpdates.push({ name: effect.name, context: { uuid: effect.uuid, updates: { disabled: true } } });
		else effectUpdatesGM.push({ name: effect.name, context: { uuid: effect.uuid, updates: { disabled: true } } });
	} else if (hasUpdate) {
		const parsedUpdate = _parseUpdateSpec(hasUpdate);
		const consumptionTarget = _normalizeUsesCountTarget(parsedUpdate.target);
		if (!consumptionTarget) return false;
		const lowerConsumptionTarget = consumptionTarget.toLowerCase();
		if (lowerConsumptionTarget.includes('flag') || lowerConsumptionTarget.startsWith('item.') || lowerConsumptionTarget === 'origin' || lowerConsumptionTarget.startsWith('origin.')) return false;
		const consume = _evaluateCounterExpression(parsedUpdate.value, evalData, debug, null);
		if (!Number.isFinite(Number(consume))) return false;
		const actor = effect.target;
		if (!(actor instanceof Actor)) return false;
		const consumptionActor =
			lowerConsumptionTarget.startsWith('opponentactor') || lowerConsumptionTarget.startsWith('targetactor') ? evalData.opponentActor
			: lowerConsumptionTarget.startsWith('auraactor') ? evalData.auraActor
			: lowerConsumptionTarget.startsWith('rollingactor') ? evalData.rollingActor
			: actor.getRollData();
		const uuid = consumptionActor?.uuid ?? actor.uuid;
		const attr = consumptionTarget.toLowerCase();
		const customName = _extractCustomNameFromValue(change.value);
		const applyFinalStandOverride = (finalStandLabel) => {
			if (!finalStandLabel) return;
			_registerUsesOverride(updateArrays, id, baseId, {
				forceOptin: true,
				forceDescription: true,
				labelSuffix: finalStandLabel,
				labelName: customName ?? undefined,
				preferCustomName: Boolean(customName),
			});
			isOptin = true;
		};
		const queueActorUpdate = (updates, options) => {
			const context = options ? { uuid, updates, options } : { uuid, updates };
			if (isOwner) actorUpdates.push({ name: effect.name, context });
			else actorUpdatesGM.push({ name: effect.name, context });
		};
		_logUsesCount('parsed', {
			effect: effect?.name,
			hook,
			actorType,
			id,
			target: consumptionTarget,
			consume,
			raw: hasUpdate,
			kind: 'update',
			updateMode: parsedUpdate.op,
		});

		if (attr.includes('death')) {
			const type = attr.includes('fail') ? 'attributes.death.failure' : 'attributes.death.success';
			const valueRaw = foundry.utils.getProperty(consumptionActor, `system.${type}`) ?? foundry.utils.getProperty(consumptionActor, type);
			const value = Number(valueRaw);
			const newValue = _applyUpdateOperation(value, consume, parsedUpdate.op);
			if (!Number.isFinite(newValue) || newValue < 0 || newValue > 3) return false;
			queueActorUpdate({ [`system.${type}`]: newValue });
		} else if (attr.includes('hpmax')) {
			const { tempmax, max, value } = consumptionActor?.attributes?.hp ?? {};
			if (![tempmax, max, value].every((v) => Number.isFinite(Number(v)))) return false;
			const effectiveMax = Number(max) + Number(tempmax);
			const newMax = _applyUpdateOperation(effectiveMax, consume, parsedUpdate.op);
			if (!Number.isFinite(newMax) || newMax < 0) return false;
			const newTempmax = newMax - Number(max);
			if ((parsedUpdate.op === 'set' || Number(consume) < 0) && newMax <= 0) applyFinalStandOverride(_buildFinalStandDescription(newMax));
			const noConcentration = !(newMax >= Number(value) || change.value.toLowerCase().includes('noconc'));
			queueActorUpdate({ 'system.attributes.hp.tempmax': newTempmax }, { dnd5e: { concentrationCheck: noConcentration } });
		} else if (attr.includes('hptemp')) {
			const current = Number(consumptionActor?.attributes?.hp?.temp);
			const newTemp = _applyUpdateOperation(current, consume, parsedUpdate.op);
			if (!Number.isFinite(newTemp) || newTemp < 0) return false;
			const noConcentration = !(newTemp >= current || change.value.toLowerCase().includes('noconc'));
			queueActorUpdate({ 'system.attributes.hp.temp': newTemp }, { dnd5e: { concentrationCheck: noConcentration } });
		} else if (attr.includes('hp')) {
			const current = Number(consumptionActor?.attributes?.hp?.value);
			const newValue = _applyUpdateOperation(current, consume, parsedUpdate.op);
			if (!Number.isFinite(newValue)) return false;
			if ((parsedUpdate.op === 'set' || Number(consume) < 0) && newValue <= 0) applyFinalStandOverride(_buildFinalStandDescription(newValue));
			const noConcentration = !(newValue >= current || change.value.toLowerCase().includes('noconc'));
			queueActorUpdate({ 'system.attributes.hp.value': newValue }, { dnd5e: { concentrationCheck: noConcentration } });
		} else if (attr.includes('exhaustion')) {
			const current = Number(consumptionActor?.attributes?.exhaustion);
			const max = CONFIG?.DND5E?.conditionTypes?.exhaustion?.levels ?? 6;
			const newValue = _applyUpdateOperation(current, consume, parsedUpdate.op);
			if (!Number.isFinite(newValue) || newValue < 0 || newValue > max) return false;
			if ((parsedUpdate.op === 'set' || Number(consume) > 0) && Number.isFinite(max) && newValue >= max) applyFinalStandOverride(_buildFinalStandDescription(newValue));
			queueActorUpdate({ 'system.attributes.exhaustion': newValue });
		} else if (attr.includes('inspiration')) {
			const current = consumptionActor?.attributes?.inspiration ? 1 : 0;
			const newValue = _applyUpdateOperation(current, consume, parsedUpdate.op);
			if (!Number.isFinite(newValue) || newValue < 0 || newValue > 1) return false;
			queueActorUpdate({ 'system.attributes.inspiration': !!newValue });
		} else if (attr.includes('abilities.') && attr.endsWith('.value')) {
			const abilityMatch = attr.match(/(?:^|\.)(?:system\.)?abilities\.([a-z0-9]+)\.value$/);
			const abilityId = abilityMatch?.[1];
			if (!abilityId) return false;
			const valueRaw = foundry.utils.getProperty(consumptionActor, `abilities.${abilityId}.value`) ?? foundry.utils.getProperty(consumptionActor, `system.abilities.${abilityId}.value`);
			const value = Number(valueRaw);
			const newValue = _applyUpdateOperation(value, consume, parsedUpdate.op);
			if (!Number.isFinite(newValue) || newValue < 0) return false;
			if ((parsedUpdate.op === 'set' || Number(consume) < 0) && newValue <= 0) applyFinalStandOverride(_buildFinalStandDescription(newValue));
			queueActorUpdate({ [`system.abilities.${abilityId}.value`]: newValue });
		} else {
			return false;
		}
	} else if (hasCount) {
		const parsedCount = _parseUsesCountSpec(hasCount);
		const consumptionTarget = _normalizeUsesCountTarget(parsedCount.target);
		const consumptionValue = parsedCount.consume;
		const lowerConsumptionTarget = consumptionTarget.toLowerCase();
		const hasOrigin = lowerConsumptionTarget === 'origin' || lowerConsumptionTarget.startsWith('origin.') || lowerConsumptionTarget.endsWith('.origin') || lowerConsumptionTarget.includes('.origin.');
		let isNumber;
		if (!hasOrigin) {
			const directTargetNumber = Number(consumptionTarget);
			if (Number.isFinite(directTargetNumber)) isNumber = directTargetNumber;
			else if (_looksLikeFormulaExpression(consumptionTarget)) {
				isNumber = evalDiceExpression(consumptionTarget);
				if (isNaN(isNumber)) {
					let evaluatedTarget = _ac5eSafeEval({ expression: consumptionTarget, sandbox: evalData, mode: 'formula', debug });
					const evaluatedTargetNumber = Number(evaluatedTarget);
					if (Number.isFinite(evaluatedTargetNumber)) isNumber = evaluatedTargetNumber;
					else {
						evaluatedTarget = evalDiceExpression(String(evaluatedTarget ?? ''));
						if (!isNaN(evaluatedTarget)) isNumber = evaluatedTarget;
					}
				}
			}
		}
		let consume = 1; //consume Integer or 1; usage: usesCount=5,2 meaning consume 2 uses per activation. Can be negative, giving back.
		if (consumptionValue) {
			const trimmedConsumption = typeof consumptionValue === 'string' ? consumptionValue.trim() : consumptionValue;
			const directNumber = Number(trimmedConsumption);
			if (Number.isFinite(directNumber)) consume = directNumber;
			else if (_looksLikeFormulaExpression(String(trimmedConsumption ?? ''))) {
				let evaluated = evalDiceExpression(consumptionValue);
				if (!isNaN(evaluated)) consume = evaluated;
				else {
					evaluated = _ac5eSafeEval({ expression: consumptionValue, sandbox: evalData, mode: 'formula', debug });
					if (!isNaN(evaluated)) consume = evaluated;
					else {
						evaluated = evalDiceExpression(evaluated);
						if (!isNaN(evaluated)) consume = evaluated;
						else consume = 1;
					}
				}
			}
		}
		_logUsesCount('parsed', {
			effect: effect?.name,
			hook,
			actorType,
			id,
			target: consumptionTarget,
			consume,
			partialConsume,
			raw: hasCount,
		});

		if (!isNaN(isNumber)) {
			if (isNumber === 0) {
				_logUsesCount('blocked', { effect: effect?.name, id, reason: 'counter-is-zero', target: consumptionTarget });
				return false;
			}

			const appliedConsume = partialConsume && consume > 0 ? Math.min(consume, isNumber) : consume;
			const newUses = isNumber - appliedConsume;

			if (newUses < 0) {
				_logUsesCount('blocked', {
					effect: effect?.name,
					id,
					reason: 'counter-below-zero',
					target: consumptionTarget,
					current: isNumber,
					consume,
					appliedConsume,
					next: newUses,
				});
				return false; //if you need to consume more uses than available (can only happen if moreUses exists)
			}

			if (newUses === 0 && !isTransfer) {
				if (isOwner) effectDeletions.push({ name: effect.name, uuid: effect.uuid });
				else effectDeletionsGM.push({ name: effect.name, uuid: effect.uuid });
			} else {
				let changes = foundry.utils.duplicate(effect.changes);
				const index = changeIndex >= 0 && changeIndex < changes.length && changes[changeIndex]?.key === change.key ? changeIndex : changes.findIndex((c) => c.key === change.key);

				if (index >= 0) {
					changes[index].value = _replaceUsesCountLiteral(changes[index].value, newUses);

					if (!isTransfer) {
						if (isOwner) effectUpdates.push({ name: effect.name, context: { uuid: effect.uuid, updates: { changes } } });
						else effectUpdatesGM.push({ name: effect.name, context: { uuid: effect.uuid, updates: { changes } } });
					} else {
						const hasInitialUsesFlag = effect.getFlag('automated-conditions-5e', 'initialUses')?.[effect.id]?.initialUses;
						if (newUses === 0) {
							if (!hasInitialUsesFlag) {
								if (isOwner) effectUpdates.push({ name: effect.name, context: { uuid: effect.uuid, updates: { disabled: true } } });
								else effectUpdatesGM.push({ name: effect.name, context: { uuid: effect.uuid, updates: { disabled: true } } });
							} else {
								changes[index].value = _replaceUsesCountLiteral(changes[index].value, hasInitialUsesFlag);
								if (isOwner) effectUpdates.push({ name: effect.name, context: { uuid: effect.uuid, updates: { changes, disabled: true } } });
								else effectUpdatesGM.push({ name: effect.name, context: { uuid: effect.uuid, updates: { changes, disabled: true } } });
							}
						} else {
							if (!hasInitialUsesFlag) {
								if (isOwner)
									effectUpdates.push({
										name: effect.name,
										context: { uuid: effect.uuid, updates: { changes, 'flags.automated-conditions-5e': { initialUses: { [effect.id]: { initialUses: isNumber } } } } },
									});
								else
									effectUpdatesGM.push({
										name: effect.name,
										context: { uuid: effect.uuid, updates: { changes, 'flags.automated-conditions-5e': { initialUses: { [effect.id]: { initialUses: isNumber } } } } },
									});
							} else {
								if (isOwner) effectUpdates.push({ name: effect.name, context: { uuid: effect.uuid, updates: { changes } } });
								else effectUpdatesGM.push({ name: effect.name, context: { uuid: effect.uuid, updates: { changes } } });
							}
						}
					}
				}
			}
		} else {
			let itemActivityfromUuid = _safeFromUuidSync(consumptionTarget);
			if (hasOrigin) {
				if (!effect.origin) {
					ui.notifications.error(
						`You are using 'origin' in effect ${effect.name}, but you have created it directly on the actor and does not have an associated item or activity; Returning false in ac5e.handleUses;`,
					);
					return false;
				} else {
					const parsed = foundry.utils.parseUuid(effect.origin);
					if (parsed.type === 'ActiveEffect') {
						// most of the time that will be an appliedEffect and the origin should be correct and not pointing to game.actors.
						itemActivityfromUuid = _safeFromUuidSync(effect.origin)?.parent;
					} else if (parsed.type === 'Item') {
						const i = _safeFromUuidSync(effect.origin);
						const actorLinked = i?.parent?.protoTypeToken?.actorLink; //when can "i" be undefined? Origin can be null
						if (actorLinked) itemActivityfromUuid = i;
						else itemActivityfromUuid = _safeFromUuidSync(effect.parent.uuid);
					}
				}
			}
			if (itemActivityfromUuid) {
				const item = itemActivityfromUuid instanceof Item && itemActivityfromUuid;
				const activity = !item && itemActivityfromUuid.type !== 'undefined' && itemActivityfromUuid;
				_logUsesCount('resolve-document', {
					effect: effect?.name,
					id,
					target: consumptionTarget,
					documentType:
						activity ? 'activity'
						: item ? 'item'
						: 'unknown',
					documentUuid: activity?.uuid ?? item?.uuid ?? null,
				});
				if (hasOrigin) {
					const ownerActor = _resolveUsesCountOwnerActor(itemActivityfromUuid);
					_registerOriginUsesPermissionOverride({ updateArrays, id, baseId, ownerActor, evalData });
				}
				const { currentUses, currentQuantity, usesMax, usesSource } = _getUsesState({ item, activity });
				if (currentUses === false && currentQuantity === false) return false;
				const updated = updateUsesCount({
					effect,
					item,
					activity,
					currentUses,
					currentQuantity,
					usesMax,
					usesSource,
					consume,
					partialConsume,
					id,
					baseId,
					activityUpdates,
					activityUpdatesGM,
					itemUpdates,
					itemUpdatesGM,
				});
				if (!updated) return false;
			} else {
				const actor = effect.target;
				if (!(actor instanceof Actor)) return false;
				if (consumptionTarget.startsWith('Item.')) {
					const str = consumptionTarget.replace(/[\s,]+$/, '');
					const activitySeparatorIndex = str.indexOf('.Activity.');
					const itemID = (activitySeparatorIndex >= 0 ? str.slice(5, activitySeparatorIndex) : str.slice(5)).trim();
					const activityID = activitySeparatorIndex >= 0 ? str.slice(activitySeparatorIndex + 10).trim() || null : null;
					if (!itemID) return false;
					const document = _getItemOrActivity(itemID, activityID, actor);
					if (!document) return false;
					let item, activity;
					if (document instanceof Item) item = document;
					else {
						activity = document;
						item = activity.item;
					}
					const { currentUses, currentQuantity, usesMax, usesSource } = _getUsesState({ item, activity });
					if (currentUses === false && currentQuantity === false) return false;
					const updated = updateUsesCount({
						effect,
						item,
						activity,
						currentUses,
						currentQuantity,
						usesMax,
						usesSource,
						consume,
						partialConsume,
						id,
						baseId,
						activityUpdates,
						activityUpdatesGM,
						itemUpdates,
						itemUpdatesGM,
					});
					if (!updated) return false;
				} else {
					/*if (['hp', 'hd', 'exhaustion', 'inspiration', 'death', 'currency', 'spell', 'resources', 'walk'].includes(commaSeparated[0].toLowerCase()))*/
					const consumptionActor =
						lowerConsumptionTarget.startsWith('opponentactor') || lowerConsumptionTarget.startsWith('targetactor') ? evalData.opponentActor
						: lowerConsumptionTarget.startsWith('auraactor') ? evalData.auraActor
						: lowerConsumptionTarget.startsWith('rollingactor') ? evalData.rollingActor
						: actor.getRollData(); // actor is the effectActor
					const uuid = consumptionActor?.uuid ?? actor.uuid;
					_logUsesCount('resolve-actor-attr', {
						effect: effect?.name,
						id,
						target: consumptionTarget,
						actorUuid: uuid,
					});
					if (lowerConsumptionTarget.includes('flag')) {
						let value = lowerConsumptionTarget.startsWith('flag') ? foundry.utils.getProperty(consumptionActor, consumptionTarget) : foundry.utils.getProperty(evalData, consumptionTarget);
						if (!Number(value)) value = 0;
						const newValue = value - consume;
						if (newValue < 0) return false;
						if (isOwner) actorUpdates.push({ name: effect.name, context: { uuid, updates: { [`${consumptionTarget}`]: newValue } } });
						else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { [`${consumptionTarget}`]: newValue } } });
					} else {
						const attr = consumptionTarget.toLowerCase();
						const numericConsume = Number(consume);
						const hasNumericConsume = Number.isFinite(numericConsume);
						const customName = _extractCustomNameFromValue(change.value);
						const applyFinalStandOverride = (finalStandLabel) => {
							if (!finalStandLabel) return;
							_registerUsesOverride(updateArrays, id, baseId, {
								forceOptin: true,
								forceDescription: true,
								labelSuffix: finalStandLabel,
								labelName: customName ?? undefined,
								preferCustomName: Boolean(customName),
							});
							isOptin = true;
						};
						if (attr.includes('death')) {
							if (!hasNumericConsume) return false;
							const type = attr.includes('fail') ? 'attributes.death.failure' : 'attributes.death.success';
							const valueRaw = foundry.utils.getProperty(actor, `system.${type}`) ?? foundry.utils.getProperty(actor, type);
							const value = Number(valueRaw);
							if (!Number.isFinite(value)) return false;
							let appliedConsume = numericConsume;
							if (partialConsume && numericConsume > 0) {
								const remaining = Math.max(0, 3 - value);
								if (remaining <= 0) return false;
								appliedConsume = Math.min(numericConsume, remaining);
							}
							const newValue = value + appliedConsume;
							if (newValue < 0 || newValue > 3) return false;
							if (isOwner) actorUpdates.push({ name: effect.name, context: { uuid, updates: { [`system.${type}`]: newValue } } });
							else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { [`system.${type}`]: newValue } } });
						} else if (attr.includes('hpmax')) {
							const { tempmax, max, value } = consumptionActor?.attributes?.hp ?? {};
							if (![tempmax, max, value].every((v) => Number.isFinite(Number(v)))) return false;
							const hpTempmax = Number(tempmax);
							const hpMax = Number(max);
							const hpValue = Number(value);
							const newTempmax = hpTempmax - consume;
							const newMax = hpMax + newTempmax;
							if (newMax < 0) return false;
							if (hasNumericConsume && numericConsume > 0 && newMax <= 0) applyFinalStandOverride(_buildFinalStandDescription(newMax));
							const noConcentration = !(newMax >= hpValue || change.value.toLowerCase().includes('noconc')); //shouldn't trigger concentration check if it wouldn't lead to hp drop or user indicated
							if (isOwner)
								actorUpdates.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.hp.tempmax': newTempmax }, options: { dnd5e: { concentrationCheck: noConcentration } } } });
							else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.hp.tempmax': newTempmax }, options: { dnd5e: { concentrationCheck: noConcentration } } } });
						} else if (attr.includes('hptemp')) {
							const { temp } = consumptionActor?.attributes?.hp ?? {};
							if (!Number.isFinite(Number(temp))) return false;
							const hpTemp = Number(temp);
							const newTemp = hpTemp - consume;
							if (newTemp < 0) return false;
							const noConcentration = !(newTemp >= hpTemp || change.value.toLowerCase().includes('noconc')); //shouldn't trigger concentration check if it wouldn't lead to temphp drop or user indicated
							if (isOwner) actorUpdates.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.hp.temp': newTemp }, options: { dnd5e: { concentrationCheck: noConcentration } } } });
							else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.hp.temp': newTemp }, options: { dnd5e: { concentrationCheck: noConcentration } } } });
						} else if (attr.includes('hp')) {
							const { value } = consumptionActor?.attributes?.hp ?? {};
							if (!Number.isFinite(Number(value))) return false;
							const hpValue = Number(value);
							const newValue = hpValue - consume;
							if (hasNumericConsume && numericConsume > 0 && newValue <= 0) applyFinalStandOverride(_buildFinalStandDescription(newValue));
							const noConcentration = !(newValue >= hpValue || change.value.toLowerCase().includes('noconc')); //shouldn't trigger concentration check if it wouldn't lead to hp drop or user indicated
							if (isOwner)
								actorUpdates.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.hp.value': newValue }, options: { dnd5e: { concentrationCheck: noConcentration } } } });
							else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.hp.value': newValue }, options: { dnd5e: { concentrationCheck: noConcentration } } } });
						} else if (attr.includes('exhaustion')) {
							const value = Number(consumptionActor?.attributes?.exhaustion);
							if (!Number.isFinite(value)) return false;
							const newValue = value - consume;
							const max = CONFIG?.DND5E?.conditionTypes?.exhaustion?.levels ?? 6;
							if (newValue < 0 || newValue > max) return false; //@to-do, allow when opt-ins are implemented (with an asterisk that it would drop the user unconscious if used)!
							if (hasNumericConsume && numericConsume < 0 && Number.isFinite(max) && newValue >= max) applyFinalStandOverride(_buildFinalStandDescription(newValue));
							if (isOwner) actorUpdates.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.exhaustion': newValue } } });
							else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.exhaustion': newValue } } });
						} else if (attr.includes('inspiration')) {
							const value = consumptionActor?.attributes?.inspiration ? 1 : 0;
							const newValue = value - consume;
							if (newValue < 0 || newValue > 1) return false; //@to-do: double check logic
							if (isOwner) actorUpdates.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.inspiration': !!newValue } } });
							else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { 'system.attributes.inspiration': !!newValue } } });
						} else if (attr.includes('abilities.') && attr.endsWith('.value')) {
							const abilityMatch = attr.match(/(?:^|\.)(?:system\.)?abilities\.([a-z0-9]+)\.value$/);
							const abilityId = abilityMatch?.[1];
							if (!abilityId) return false;
							const valueRaw = foundry.utils.getProperty(consumptionActor, `abilities.${abilityId}.value`) ?? foundry.utils.getProperty(consumptionActor, `system.abilities.${abilityId}.value`);
							const value = Number(valueRaw);
							if (!Number.isFinite(value)) return false;
							const newValue = value - consume;
							if (newValue < 0) return false;
							if (hasNumericConsume && numericConsume > 0 && newValue <= 0) applyFinalStandOverride(_buildFinalStandDescription(newValue));
							if (isOwner) actorUpdates.push({ name: effect.name, context: { uuid, updates: { [`system.abilities.${abilityId}.value`]: newValue } } });
							else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { [`system.abilities.${abilityId}.value`]: newValue } } });
						} else if (attr.includes('hd')) {
							if (!(consumptionActor instanceof Actor)) return false;
							const { max, value, classes } = consumptionActor.attributes.hd;
							if (value - consume < 0 || value - consume > max) return false;

							const hdClasses = Array.from(classes)
								.sort((a, b) => Number(a.system.hd.denomination.split('d')[1]) - Number(b.system.hd.denomination.split('d')[1]))
								.map((item) => ({ uuid: item.uuid, hd: item.system.hd }));

							const consumeLargest = attr.includes('large');
							const consumeSmallest = attr.includes('small');

							const type =
								consumeSmallest ? 'smallest'
								: consumeLargest ? 'largest'
								: consume > 0 ? 'smallest'
								: 'largest';
							let remaining = consume; // positive = consume, negative = give back

							const pushUpdate = (uuid, newSpent) => {
								const entry = { id, baseId, name: effect.name, context: { uuid, updates: { 'system.hd.spent': newSpent } } };
								if (isOwner) itemUpdates.push(entry);
								else itemUpdatesGM.push(entry);
							};

							if (type === 'smallest') {
								if (remaining > 0) {
									// consume from available value
									let toConsume = remaining;
									for (let i = 0; i < hdClasses.length && toConsume > 0; i++) {
										const {
											uuid,
											hd: { max, value: val, spent },
										} = hdClasses[i];
										if (!val) continue;
										const take = Math.min(toConsume, val);
										const newSpent = spent + take;
										pushUpdate(uuid, newSpent);
										toConsume -= take;
									}
									remaining = toConsume;
								} else if (remaining < 0) {
									// give back (restore spent)
									let toRestore = Math.abs(remaining);
									for (let i = 0; i < hdClasses.length && toRestore > 0; i++) {
										const {
											uuid,
											hd: { spent },
										} = hdClasses[i];
										if (!spent) continue;
										const give = Math.min(toRestore, spent);
										const newSpent = spent - give;
										pushUpdate(uuid, newSpent);
										toRestore -= give;
									}
									remaining = -toRestore; // remaining negative if still need to restore
								}
							} else if (type === 'largest') {
								if (remaining > 0) {
									let toConsume = remaining;
									for (let i = hdClasses.length - 1; i >= 0 && toConsume > 0; i--) {
										const {
											uuid,
											hd: { max, value: val, spent },
										} = hdClasses[i];
										if (!val) continue;
										const take = Math.min(toConsume, val);
										const newSpent = spent + take;
										pushUpdate(uuid, newSpent);
										toConsume -= take;
									}
									remaining = toConsume;
								} else if (remaining < 0) {
									let toRestore = Math.abs(remaining);
									for (let i = hdClasses.length - 1; i >= 0 && toRestore > 0; i--) {
										const {
											uuid,
											hd: { spent },
										} = hdClasses[i];
										if (!spent) continue;
										const give = Math.min(toRestore, spent);
										const newSpent = spent - give;
										pushUpdate(uuid, newSpent);
										toRestore -= give;
									}
									remaining = -toRestore;
								}
							} else return false;
						} else {
							const availableResources = CONFIG.DND5E.consumableResources;
							const type = availableResources.find((r) => r.includes(attr));
							if (!type) return false;
							const resource = foundry.utils.getProperty(consumptionActor, type);
							let newValue;
							if (!resource) return false;
							else if (resource instanceof Object) {
								const { max, value } = resource;
								newValue = value - consume;
								if (newValue < 0 || newValue > max) return false;
							} else if (typeof resource === 'number') {
								newValue = resource - consume;
								if (newValue < 0) return false;
							}
							if (isOwner) actorUpdates.push({ name: effect.name, context: { uuid, updates: { [`system.${type}`]: newValue } } });
							else actorUpdatesGM.push({ name: effect.name, context: { uuid, updates: { [`system.${type}`]: newValue } } });
						}
					}
				}
			}
		}
	}
	const annotatePendingEntry = (entry) => {
		if (!entry || typeof entry !== 'object') return entry;
		entry.id ??= id;
		entry.baseId ??= baseId;
		return entry;
	};
	for (const updates of Object.values(pendingUpdates)) {
		if (!Array.isArray(updates)) continue;
		for (const updateEntry of updates) annotatePendingEntry(updateEntry);
	}
	const hasPendingUpdates = Object.values(pendingUpdates).some((updates) => updates.length);
	if (hasPendingUpdates || hasCadence) {
		const cadenceAnchor = _resolveCadenceAnchor(game.combat, evalData);
		updateArrays.pendingUses.push({
			id,
			baseId,
			name: effect.name,
			cadence,
			cadenceTurn: cadenceAnchor.turn,
			cadenceCombatantId: cadenceAnchor.combatantId,
			optin: isOptin,
			...pendingUpdates,
		});
	}
	return true;
}

export function _applyPendingUses(pendingUses = []) {
	if (!pendingUses?.length) return Promise.resolve();
	const validActivityUpdates = [];
	const validActivityUpdatesGM = [];
	const validActorUpdates = [];
	const validActorUpdatesGM = [];
	const validEffectDeletions = [];
	const validEffectDeletionsGM = [];
	const validEffectUpdates = [];
	const validEffectUpdatesGM = [];
	const validItemUpdates = [];
	const validItemUpdatesGM = [];
	const getUuid = (entry) => {
		if (typeof entry === 'string') return entry;
		if (entry && typeof entry === 'object') return entry.uuid ?? entry.context?.uuid;
		return undefined;
	};
	const getUpdates = (entry) => entry?.updates ?? entry?.context?.updates;
	const getOptions = (entry) => entry?.options ?? entry?.context?.options;
	const pushContexts = (entries, target) => {
		for (const entry of entries ?? []) {
			const context = entry?.context ?? entry;
			if (!context) continue;
			if (Array.isArray(context)) {
				for (const nested of context) {
					if (nested) target.push(nested);
				}
				continue;
			}
			target.push(context);
		}
	};

	for (const pending of pendingUses) {
		pushContexts(pending.activityUpdates, validActivityUpdates);
		pushContexts(pending.activityUpdatesGM, validActivityUpdatesGM);
		pushContexts(pending.actorUpdates, validActorUpdates);
		pushContexts(pending.actorUpdatesGM, validActorUpdatesGM);
		for (const entry of pending.effectDeletions ?? []) {
			const uuid = getUuid(entry);
			if (typeof uuid === 'string' && uuid.length) validEffectDeletions.push(uuid);
		}
		for (const entry of pending.effectDeletionsGM ?? []) {
			const uuid = getUuid(entry);
			if (typeof uuid === 'string' && uuid.length) validEffectDeletionsGM.push(uuid);
		}
		pushContexts(pending.effectUpdates, validEffectUpdates);
		pushContexts(pending.effectUpdatesGM, validEffectUpdatesGM);
		pushContexts(pending.itemUpdates, validItemUpdates);
		pushContexts(pending.itemUpdatesGM, validItemUpdatesGM);
	}
	_recordCadencePendingUses(pendingUses).catch((err) => console.warn('AC5E cadence tracking failed', err));

	const queuePromise = ac5eQueue
		.add(async () => {
			try {
				const allPromises = [];
				const uniqueEffectDeletionUuids = Array.from(new Set(validEffectDeletions.filter((uuid) => typeof uuid === 'string' && uuid.length)));

				allPromises.push(...uniqueEffectDeletionUuids.map((uuid) => _safeDeleteByUuid(uuid, { source: 'queue-pendingUses' })));
				allPromises.push(
					...validEffectUpdates.map((v) => {
						const uuid = getUuid(v);
						const updates = getUpdates(v);
						if (typeof uuid !== 'string' || !updates) return Promise.resolve(null);
						const doc = _safeFromUuidSync(uuid);
						return doc ? doc.update(updates) : Promise.resolve(null);
					}),
				);
				allPromises.push(
					...validItemUpdates.map((v) => {
						const uuid = getUuid(v);
						const updates = getUpdates(v);
						if (typeof uuid !== 'string' || !updates) return Promise.resolve(null);
						const doc = _safeFromUuidSync(uuid);
						return doc ? doc.update(updates) : Promise.resolve(null);
					}),
				);
				allPromises.push(
					...validActorUpdates.map((v) => {
						const uuid = getUuid(v);
						const updates = getUpdates(v);
						if (typeof uuid !== 'string' || !updates) return Promise.resolve(null);
						const doc = _safeFromUuidSync(uuid);
						return doc ? doc.update(updates, getOptions(v)) : Promise.resolve(null);
					}),
				);
				allPromises.push(
					...validActivityUpdates.map((v) => {
						const uuid = getUuid(v);
						const updates = getUpdates(v);
						if (typeof uuid !== 'string' || !updates) return Promise.resolve(null);
						const act = _safeFromUuidSync(uuid);
						return act ? act.update(updates) : Promise.resolve(null);
					}),
				);
				const settled = await Promise.allSettled(allPromises);

				const errors = settled
					.map((r, i) => ({ r, i }))
					.filter((x) => x.r.status === 'rejected')
					.map((x) => ({ index: x.i, reason: x.r.reason }));

				if (errors.length) {
					console.error('Some queued updates failed:', errors);
				}
			} catch (err) {
				console.error('Queued job error:', err);
				throw err;
			}
		})
		.catch((err) => console.error('Queued job failed', err));

	const uniqueEffectDeletionsGM = Array.from(new Set(validEffectDeletionsGM.filter((uuid) => typeof uuid === 'string' && uuid.length)));
	_doQueries({ validActivityUpdatesGM, validActorUpdatesGM, validEffectDeletionsGM: uniqueEffectDeletionsGM, validEffectUpdatesGM, validItemUpdatesGM });
	return queuePromise;
}

function _asFiniteNumber(value) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function _getUsesState({ item, activity }) {
	const itemUsesMax = item ? _asFiniteNumber(item?.system?.uses?.max) : null;
	const activityUsesMax = activity ? _asFiniteNumber(activity?.uses?.max) : null;
	const hasItemUses = Boolean(item) && itemUsesMax !== null && itemUsesMax > 0;
	const hasActivityUses = Boolean(activity) && activityUsesMax !== null && activityUsesMax > 0;
	let currentUses = false;
	let usesSource = null;
	if (hasActivityUses) {
		const value = _asFiniteNumber(activity?.uses?.value);
		if (value !== null) currentUses = value;
		else {
			const spent = _asFiniteNumber(activity?.uses?.spent) ?? 0;
			currentUses = Math.max(0, activityUsesMax - spent);
		}
		usesSource = 'activity';
	} else if (hasItemUses) {
		const value = _asFiniteNumber(item?.system?.uses?.value);
		if (value !== null) currentUses = value;
		else {
			const spent = _asFiniteNumber(item?.system?.uses?.spent) ?? 0;
			currentUses = Math.max(0, itemUsesMax - spent);
		}
		usesSource = 'item';
	}
	let currentQuantity = false;
	if (item && !hasActivityUses && !hasItemUses) {
		const quantity = _asFiniteNumber(item?.system?.quantity);
		if (quantity !== null) currentQuantity = quantity;
	}
	return {
		currentUses,
		currentQuantity,
		usesMax:
			hasActivityUses ? activityUsesMax
			: hasItemUses ? itemUsesMax
			: null,
		usesSource,
	};
}

function _replaceUsesCountLiteral(changeValue, nextUses) {
	if (typeof changeValue !== 'string') return changeValue;
	let replaced = false;
	const nextValue = String(nextUses);
	const nextParts = changeValue.split(';').map((part) => {
		if (replaced) return part;
		const match = part.match(/^(\s*usescount\s*[:=]\s*)(.+?)(\s*)$/i);
		if (!match) return part;
		const rhs = match[2]?.trim() ?? '';
		const parsed = _parseUsesCountSpec(rhs);
		const suffix = parsed.consume ? `,${parsed.consume}` : '';
		replaced = true;
		return `${match[1]}${nextValue}${suffix}${match[3] ?? ''}`;
	});
	if (replaced) return nextParts.join(';');
	return changeValue.replace(/\busesCount\s*[:=]\s*[^;]+/i, `usesCount=${nextValue}`);
}

function _resolveUsesCountOwnerActor(document) {
	if (!document) return null;
	if (document instanceof Item) return document.actor ?? null;
	const activityActor = document?.actor ?? document?.item?.actor ?? document?.parent?.actor;
	if (activityActor instanceof Actor) return activityActor;
	if (document?.parent instanceof Actor) return document.parent;
	return null;
}

function _registerOriginUsesPermissionOverride({ updateArrays, id, baseId, ownerActor, evalData }) {
	if (!(ownerActor instanceof Actor)) return;
	const rollingActorId = evalData?.rollingActor?.id ?? evalData?.effectActor?.id ?? null;
	if (rollingActorId && ownerActor.id === rollingActorId) return;
	_registerUsesOverride(updateArrays, id, baseId, {
		permissionSourceActorId: ownerActor.id ?? null,
		permissionSourceActorName: ownerActor.name ?? '',
	});
}

function updateUsesCount({
	effect,
	item,
	activity,
	currentUses,
	currentQuantity,
	usesMax,
	usesSource,
	consume,
	partialConsume = false,
	id,
	baseId,
	activityUpdates,
	activityUpdatesGM,
	itemUpdates,
	itemUpdatesGM,
}) {
	const hasUses = currentUses !== false;
	const hasQuantity = currentQuantity !== false;
	const usesDocumentOwner =
		usesSource === 'activity' ? Boolean(activity?.isOwner)
		: usesSource === 'item' ? Boolean(item?.isOwner)
		: false;
	const quantityDocumentOwner = Boolean(item?.isOwner);
	const appliedUsesConsume = hasUses && partialConsume && consume > 0 ? Math.min(consume, currentUses) : consume;
	const appliedQuantityConsume = hasQuantity && partialConsume && consume > 0 ? Math.min(consume, currentQuantity) : consume;
	const newUses = hasUses ? currentUses - appliedUsesConsume : null;
	const newQuantity = hasQuantity ? currentQuantity - appliedQuantityConsume : null;
	_logUsesCount('evaluate-update', {
		effect: effect?.name,
		id,
		usesSource,
		targetUuid: activity?.uuid ?? item?.uuid ?? null,
		currentUses: hasUses ? currentUses : null,
		currentQuantity: hasQuantity ? currentQuantity : null,
		consume,
		partialConsume,
		appliedUsesConsume: hasUses ? appliedUsesConsume : null,
		appliedQuantityConsume: hasQuantity ? appliedQuantityConsume : null,
		newUses,
		newQuantity,
	});
	if (hasUses && newUses < 0) {
		_logUsesCount('blocked', { effect: effect?.name, id, reason: 'uses-below-zero', usesSource, currentUses, consume, newUses });
		return false;
	}
	if (hasQuantity && newQuantity < 0) {
		_logUsesCount('blocked', { effect: effect?.name, id, reason: 'quantity-below-zero', currentQuantity, consume, newQuantity });
		return false;
	}
	if (newUses !== null) {
		const max = _asFiniteNumber(usesMax);
		const boundedUses = max !== null ? Math.min(newUses, max) : newUses;
		const spent = max !== null ? Math.max(0, max - boundedUses) : 0;
		if (usesSource === 'activity' && activity) {
			_logUsesCount('queue-update', { effect: effect?.name, id, usesSource: 'activity', targetUuid: activity.uuid, spent, max, boundedUses, owner: usesDocumentOwner });
			if (usesDocumentOwner) activityUpdates.push({ id, baseId, name: effect.name, context: { uuid: activity.uuid, updates: { 'uses.spent': spent } } });
			else activityUpdatesGM.push({ id, baseId, name: effect.name, context: { uuid: activity.uuid, updates: { 'uses.spent': spent } } });
		} else if (usesSource === 'item' && item) {
			_logUsesCount('queue-update', { effect: effect?.name, id, usesSource: 'item', targetUuid: item.uuid, spent, max, boundedUses, owner: usesDocumentOwner });
			if (usesDocumentOwner) itemUpdates.push({ id, baseId, name: effect.name, context: { uuid: item.uuid, updates: { 'system.uses.spent': spent } } });
			else itemUpdatesGM.push({ id, baseId, name: effect.name, context: { uuid: item.uuid, updates: { 'system.uses.spent': spent } } });
		} else {
			_logUsesCount('blocked', { effect: effect?.name, id, reason: 'missing-uses-document', usesSource });
			return false;
		}
	} else if (newQuantity !== null) {
		if (!item) return false;
		_logUsesCount('queue-update', { effect: effect?.name, id, usesSource: 'quantity', targetUuid: item.uuid, newQuantity, owner: quantityDocumentOwner });
		if (quantityDocumentOwner) itemUpdates.push({ id, baseId, name: effect.name, context: { uuid: item.uuid, updates: { 'system.quantity': newQuantity } } });
		else itemUpdatesGM.push({ id, baseId, name: effect.name, context: { uuid: item.uuid, updates: { 'system.quantity': newQuantity } } });
	}
	return true;
}

function getBlacklistedKeysValue(key, values) {
	if (typeof values !== 'string') return '';
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
	const effectSpellLevel = Number(foundry.utils.getProperty(effect, 'flags.dnd5e.spellLevel'));
	const effectScaling = Number(foundry.utils.getProperty(effect, 'flags.dnd5e.scaling'));
	const spellLevel = Number.isFinite(effectSpellLevel) ? effectSpellLevel : (evalData.castingLevel ?? 0);
	const scaling = Number.isFinite(effectScaling) ? effectScaling : (evalData.scaling ?? 0);

	const staticMap = {
		'@scaling': scaling,
		scaling: scaling,
		'@spellLevel': spellLevel,
		spellLevel: spellLevel,
		'@castingLevel': spellLevel,
		castingLevel: spellLevel,
		'@baseSpellLevel': evalData.baseSpellLevel ?? 0,
		baseSpellLevel: evalData.baseSpellLevel ?? 0,
		effectStacks: effect.flags?.dae?.stacks ?? effect.flags?.statuscounter?.value ?? 1,
		stackCount: effect.flags?.dae?.stacks ?? effect.flags?.statuscounter?.value ?? 1,
	};

	const pattern = new RegExp(Object.keys(staticMap).join('|'), 'g');
	expression = expression.replace(pattern, (match) => staticMap[match]);
	if (expression.includes('@item') && effect.origin) {
		let origin = fromUuidSync(effect?.origin);
		if (origin instanceof Item) {
			const itemIndex = isAura ? evalData.auraActor.items.findIndex((i) => i.uuid === origin.uuid) : evalData.rollingActor.items.findIndex((i) => i.uuid === origin.uuid);
			if (itemIndex >= 0) expression = isAura ? expression.replaceAll('@item', `auraActor.items[${itemIndex}]`) : expression.replaceAll('@item', `rollingActor.items.${itemIndex}`);
		} else if (origin instanceof ActiveEffect) {
			origin = origin.item instanceof Item && origin.item;
			if (origin) {
				const itemIndex = isAura ? evalData.auraActor.items.findIndex((i) => i.uuid === origin.uuid) : evalData.rollingActor.items.findIndex((i) => i.uuid === origin.uuid);
				if (itemIndex >= 0) expression = isAura ? expression.replaceAll('@item', `auraActor.items[${itemIndex}]`) : expression.replaceAll('@item', `rollingActor.items.${itemIndex}`);
			}
		}
	}
	if (expression.includes('@')) expression = isAura ? expression.replaceAll('@', 'auraActor.') : expression.replaceAll('@', 'rollingActor.');
	if (expression.includes('##')) expression = isAura ? expression.replaceAll('##', 'rollingActor.') : expression.replaceAll('##', 'opponentActor.');
	if (expression.includes('effectOriginActor')) {
		const tok = _getEffectOriginToken(effect, 'token');
		evalData.effectOriginActor = _ac5eActorRollData(tok);
	}
	return expression;
}

function preEvaluateExpression({ value, mode, hook, effect, evaluationData, isAura, debug, chanceCache, chanceKey }) {
	let bonus, set, modifier, threshold, chance;
	const rawValue = String(value ?? '');
	const lowerValue = rawValue.toLowerCase();
	const isBonus =
		lowerValue.includes('bonus') && (mode === 'bonus' || mode === 'targetADC' || mode === 'extraDice' || mode === 'diceUpgrade' || mode === 'diceDowngrade' || mode === 'range') ?
			getBlacklistedKeysValue('bonus', rawValue)
		:	false;
	if (isBonus) {
		const replacementBonus = bonusReplacements(isBonus, evaluationData, isAura, effect);
		const preservedSignedDiceBonus = _preserveStandaloneSignedDiceFormula(replacementBonus);
		bonus =
			preservedSignedDiceBonus ??
			_ac5eSafeEval({
				expression: replacementBonus,
				sandbox: evaluationData,
				mode: 'formula',
				debug,
			});
	}
	const isSet =
		lowerValue.includes('set') && (mode === 'bonus' || mode === 'targetADC' || (['criticalThreshold', 'fumbleThreshold'].includes(mode) && hook === 'attack')) ?
			getBlacklistedKeysValue('set', rawValue)
		:	false;
	if (isSet) {
		const replacementBonus = bonusReplacements(isSet, evaluationData, isAura, effect);
		set = _ac5eSafeEval({ expression: replacementBonus, sandbox: evaluationData, mode: 'formula', debug });
	}
	const isModifier = lowerValue.includes('modifier') && mode === 'modifiers' ? getBlacklistedKeysValue('modifier', rawValue) : false;
	if (isModifier) {
		const replacementModifier = bonusReplacements(isModifier, evaluationData, isAura, effect);
		const trimmedModifier = typeof replacementModifier === 'string' ? replacementModifier.trim() : replacementModifier;
		// Preserve leading operator modifier fragments (e.g. "/2", "* 1.5", "%3") as suffix syntax.
		// These are appended to an existing roll formula and are invalid as standalone Roll formulas.
		if (typeof trimmedModifier === 'string' && /^[*/%]/.test(trimmedModifier)) modifier = trimmedModifier;
		else modifier = _ac5eSafeEval({ expression: replacementModifier, sandbox: evaluationData, mode: 'formula', debug });
	}
	const isThreshold = lowerValue.includes('threshold') && hook === 'attack' ? getBlacklistedKeysValue('threshold', rawValue) : false;
	if (isThreshold) {
		const replacementThreshold = bonusReplacements(isThreshold, evaluationData, isAura, effect);
		threshold = _ac5eSafeEval({ expression: replacementThreshold, sandbox: evaluationData, mode: 'formula', debug });
	}
	const isChance = lowerValue.includes('chance') ? getBlacklistedKeysValue('chance', rawValue) : false;
	if (isChance !== false && isChance !== '') {
		const replacementChance = bonusReplacements(isChance, evaluationData, isAura, effect);
		let evaluatedChance = _ac5eSafeEval({ expression: replacementChance, sandbox: evaluationData, mode: 'formula', debug });
		if (!Number.isFinite(Number(evaluatedChance))) evaluatedChance = evalNumericFormulaExpression(evaluatedChance, { debug });
		const thresholdChance = Number(evaluatedChance);
		if (Number.isFinite(thresholdChance)) {
			const cachedChance = chanceKey && chanceCache && typeof chanceCache === 'object' ? chanceCache[chanceKey] : undefined;
			if (cachedChance && Number(cachedChance.threshold) === thresholdChance && Number.isFinite(Number(cachedChance.rolled))) {
				chance = {
					enabled: true,
					threshold: thresholdChance,
					rolled: Number(cachedChance.rolled),
					triggered: Boolean(cachedChance.triggered),
				};
			} else {
				const rolled = Math.floor(Math.random() * 100) + 1;
				chance = { enabled: true, threshold: thresholdChance, rolled, triggered: rolled >= thresholdChance };
				if (chanceKey && chanceCache && typeof chanceCache === 'object') chanceCache[chanceKey] = foundry.utils.duplicate(chance);
			}
		}
	}
	if (threshold !== undefined && threshold !== '') threshold = Number(evalNumericFormulaExpression(threshold, { debug })); // we need Integers to differentiate from set
	if (bonus && mode !== 'bonus') {
		// Preserve extraDice multiplier literals (x2/^2) so they can be parsed downstream.
		const isExtraDiceMultiplierLiteral = mode === 'extraDice' && typeof bonus === 'string' && /^\+?\s*(?:x|\^)\s*-?\d+\s*$/i.test(bonus.trim());
		if (isExtraDiceMultiplierLiteral) bonus = bonus.trim();
		else bonus = Number(evalDiceExpression(bonus)); // non-bonus modes should resolve to numeric values
	}
	if (set !== undefined && set !== '') {
		if (['criticalThreshold', 'fumbleThreshold'].includes(mode) && hook === 'attack') set = String(evalNumericFormulaExpression(set, { debug }));
		else set = String(evalDiceExpression(set)); // we need Strings for set
	}
	if (ac5e?.debugTargetADC && mode === 'targetADC') console.warn('AC5E targetADC: preEvaluate', { hook, value, bonus, set, threshold, effect: effect?.name });
	return { bonus, set, modifier, threshold, chance };
}

function evalDiceExpression(expr, { maxDice = 100, maxSides = 1000, debug = ac5e.debug.evaluations } = {}) {
	// expanded logic for unary minus: `((1d4) - 1)` returns from formulas like -1d4
	if (typeof expr === 'number') return expr;
	if (typeof expr !== 'string') return NaN;

	const allowed = /^[0-9dc+\-*\s()]+$/i; // added 1dc for coin flips
	if (!allowed.test(expr)) {
		if (debug) console.warn(`${Constants.MODULE_ID} - evalDiceExpression: Invalid characters in expression: "${expr}"`);
		return NaN;
	}

	const diceRe = /(\d*)d(\d+|c)/gi; // added 1dc for coin flips
	const diceLogs = [];

	const replaced = expr.replace(diceRe, (match, cStr, sStr) => {
		const count = Math.min(Math.max(parseInt(cStr || '1'), 0), maxDice);
		const isCoin = sStr.toLowerCase() === 'c';
		const sides = Math.min(Math.max(parseInt(sStr), 1), maxSides);

		let sum = 0;
		const rolls = [];
		for (let i = 0; i < count; i++) {
			let r;
			if (isCoin) {
				r = Math.random() < 0.5 ? 1 : 0;
				rolls.push(r ? 'H' : 'T');
			} else {
				r = Math.floor(Math.random() * sides) + 1;
				rolls.push(r);
			}
			sum += r;
		}

		if (debug) diceLogs.push(`${Constants.MODULE_ID} - evalDiceExpression: ${match} → [${rolls.join(', ')}] = ${sum}`);
		return String(sum);
	});

	function evaluateMath(input) {
		// Tokenize
		const tokens = [];
		const re = /\s*([0-9]+|\S)\s*/g;
		let m;
		let lastWasOp = true;

		while ((m = re.exec(input)) !== null) {
			const t = m[1];

			if (/^[0-9]+$/.test(t)) {
				tokens.push({ type: 'num', value: Number(t) });
				lastWasOp = false;
			} else if ('+-*()'.includes(t)) {
				if (t === '-' && lastWasOp) {
					tokens.push({ type: 'op', value: 'u-' }); // unary minus
				} else {
					tokens.push({ type: 'op', value: t });
					lastWasOp = t !== ')';
				}
				if (t === '(') lastWasOp = true;
			} else {
				return NaN;
			}
		}

		const prec = { 'u-': 3, '*': 2, '+': 1, '-': 1 };
		const assoc = { 'u-': 'right', '*': 'left', '+': 'left', '-': 'left' };

		const out = [];
		const ops = [];

		for (const tk of tokens) {
			if (tk.type === 'num') out.push(tk);
			else if (tk.value === '(') ops.push(tk);
			else if (tk.value === ')') {
				while (ops.length && ops[ops.length - 1].value !== '(') out.push(ops.pop());
				ops.pop(); // remove '('
			} else {
				const o1 = tk.value;
				while (ops.length) {
					const o2 = ops[ops.length - 1].value;
					if (o2 === '(') break;
					if (prec[o2] > prec[o1] || (prec[o2] === prec[o1] && assoc[o1] === 'left')) out.push(ops.pop());
					else break;
				}
				ops.push(tk);
			}
		}

		while (ops.length) out.push(ops.pop());

		// Evaluate RPN
		const stack = [];
		for (const tk of out) {
			if (tk.type === 'num') stack.push(tk.value);
			else {
				if (tk.value === 'u-') {
					stack.push(-stack.pop());
					continue;
				}
				const b = stack.pop();
				const a = stack.pop();
				if (tk.value === '+') stack.push(a + b);
				else if (tk.value === '-') stack.push(a - b);
				else if (tk.value === '*') stack.push(a * b);
			}
		}

		return stack.length === 1 ? stack[0] : NaN;
	}

	const result = evaluateMath(replaced);

	if (debug) {
		console.warn(`${Constants.MODULE_ID} - evalDiceExpression("${expr}") = ${result}`);
		console.warn(`${Constants.MODULE_ID} - evalDiceExpression Dice:`, diceLogs);
	}

	return result;
}

function evalNumericFormulaExpression(expr, { maxDice = 100, maxSides = 1000, debug = ac5e.debug.evaluations } = {}) {
	if (typeof expr === 'number') return expr;
	if (typeof expr !== 'string') return NaN;

	const trimmed = expr.trim();
	if (!trimmed.length) return NaN;

	const arithmeticResult = evalDiceExpression(trimmed, { maxDice, maxSides, debug: false });
	if (Number.isFinite(arithmeticResult)) return arithmeticResult;

	const strippedFunctions = trimmed.replace(/\b(?:min|max|round|floor|ceil|abs)\b/gi, '');
	const allowed = /^[0-9dc+\-*/%\s(),.]+$/i;
	if (!allowed.test(strippedFunctions)) return NaN;

	const diceRe = /(\d*)d(\d+|c)/gi;
	const replaced = trimmed.replace(diceRe, (match, cStr, sStr) => {
		const count = Math.min(Math.max(parseInt(cStr || '1', 10), 0), maxDice);
		const isCoin = sStr.toLowerCase() === 'c';
		const sides = isCoin ? 2 : Math.min(Math.max(parseInt(sStr, 10), 1), maxSides);

		let sum = 0;
		for (let i = 0; i < count; i++) {
			sum +=
				isCoin ?
					Math.random() < 0.5 ?
						1
					:	0
				:	Math.floor(Math.random() * sides) + 1;
		}
		return String(sum);
	});

	try {
		// Limit evaluation to arithmetic and a small Math helper subset after dice have been resolved.
		// eslint-disable-next-line no-new-func
		const evaluator = new Function('Math', `"use strict"; const { min, max, round, floor, ceil, abs } = Math; return (${replaced});`);
		const result = evaluator(Math);
		return Number.isFinite(Number(result)) ? Number(result) : NaN;
	} catch {
		return NaN;
	}
}
