import {
	_autoRanged,
	_autoArmor,
	_ac5eSafeEval,
	_activeModule,
	_buildFlagRegistry,
	_createEvaluationSandbox,
	checkNearby,
	_generateAC5eFlags,
	_getDistance,
	_getItems,
	_getItemOrActivity,
	_inspectFlagRegistry,
	_raceOrType,
	_reindexFlagRegistryActor,
	_canSee,
	_safeFromUuidSync,
	_resolveUuidString,
	_isUuidLike,
	_hasItem,
} from './ac5e-helpers.mjs';
import { _renderHijack, _renderSettings, _rollFunctions, _overtimeHazards } from './ac5e-hooks.mjs';
import { _migrate } from './ac5e-migrations.mjs';
import { _gmCombatCadenceUpdate, _gmContextKeywordsUpdate, _gmDocumentUpdates, _gmEffectDeletions, _gmUsageRulesUpdate, _setContextKeywordsSetting, _setUsageRulesSetting } from './ac5e-queries.mjs';
import {
	_initStatusEffectsTables,
	_syncCombatCadenceFlags,
	clearStatusEffectOverrides,
	inspectCadenceFlags,
	listStatusEffectOverrides,
	registerStatusEffectOverride,
	removeStatusEffectOverride,
	resetCadenceFlags,
} from './ac5e-setpieces.mjs';
import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';
export let scopeUser, lazySandbox, ac5eQueue, statusEffectsTables;
let daeFlags;
const AC5E_LOCAL_BUILD_ID = 'local-delete-race-2026-02-19a';
const contextKeywordRegistryState = {
	runtime: new Map(),
	persistent: new Map(),
	seq: 1,
};
const usageRulesRegistryState = {
	runtime: new Map(),
	persistent: new Map(),
	seq: 1,
};

Hooks.once('init', ac5eRegisterOnInit);
Hooks.once('i18nInit', ac5ei18nInit);
Hooks.once('ready', ac5eReady);

/* SETUP FUNCTIONS */
function ac5eRegisterOnInit() {
	registerQueries();
	daeFlags = _generateAC5eFlags();
	Hooks.on('dae.setFieldData', (fieldData) => {
		fieldData['AC5E'] = daeFlags;
	});
	scopeUser = game.version > 13 ? 'user' : 'client';
	patchApplyDamage();
	return new Settings().registerSettings();
}

function patchApplyDamage() {
	const proto = CONFIG.Actor?.documentClass?.prototype;

	function getMessageIdFromUI() {
		return (
			globalThis.event?.currentTarget?.closest?.('[data-message-id]')?.dataset?.messageId ??
			globalThis.event?.target?.closest?.('[data-message-id]')?.dataset?.messageId ??
			document.activeElement?.closest?.('[data-message-id]')?.dataset?.messageId ??
			null
		);
	}

	function wrapper(wrapped, damages, options = {}, ...rest) {
		if (!options?.messageId) {
			const mid = getMessageIdFromUI();
			if (mid) options = { ...options, messageId: mid };
		}
		return wrapped(damages, options, ...rest);
	}

	if (globalThis.libWrapper) {
		try {
			libWrapper.register(Constants.MODULE_ID, 'CONFIG.Actor.documentClass.prototype.applyDamage', wrapper, 'WRAPPER');
			console.log(`${Constants.MODULE_NAME} | Wrapped Actor.applyDamage via libWrapper`);
			return;
		} catch (err) {
			console.warn(`${Constants.MODULE_NAME} | libWrapper failed, falling back to monkeypatch`, err);
		}
	}
	// Fallback monkeypatch
	const original = proto.applyDamage;
	proto.applyDamage = function (damages, options = {}, ...rest) {
		if (!options?.messageId) {
			const mid = getMessageIdFromUI();
			if (mid) options = { ...options, messageId: mid };
		}
		return original.call(this, damages, options, ...rest);
	};
	proto.applyDamage.__ac5e_original__ = original;
	return console.log(`${Constants.MODULE_NAME} | Monkeypatched Actor.applyDamage (no libWrapper)`);
}

function _normalizeContextKeywordKey(key) {
	const parsed = String(key ?? '').trim();
	if (!parsed) return null;
	if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(parsed)) return null;
	return parsed;
}

function _normalizeUsageRuleKey(key) {
	const parsed = String(key ?? '').trim();
	if (!parsed) return null;
	if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(parsed)) return null;
	return parsed;
}

function _normalizeUsageRuleHook(hook) {
	const parsed = String(hook ?? '*')
		.trim()
		.toLowerCase();
	if (!parsed || parsed === 'all' || parsed === '*') return '*';
	const aliases = {
		attack: 'attack',
		bonus: 'bonus',
		damage: 'damage',
		check: 'check',
		checks: 'check',
		save: 'save',
		saves: 'save',
		skill: 'skill',
		skills: 'skill',
		tool: 'tool',
		tools: 'tool',
		concentration: 'concentration',
		conc: 'concentration',
		death: 'death',
		deathsave: 'death',
		'death-save': 'death',
		init: 'initiative',
		initiative: 'initiative',
	};
	return aliases[parsed] ?? null;
}

function _isUsageRuleBonusContext(context = {}) {
	const activity = context?.activity ?? context?.options?.activity ?? null;
	const activationType = String(activity?.activation?.type ?? activity?.system?.activation?.type ?? context?.item?.system?.activation?.type ?? '')
		.trim()
		.toLowerCase();
	return activationType === 'bonus';
}

function _usageRuleHookMatches(ruleHook, currentHook, context = {}) {
	const normalizedRule = _normalizeUsageRuleHook(ruleHook ?? '*') ?? '*';
	if (normalizedRule === '*') return true;
	const normalizedCurrent = _normalizeUsageRuleHook(currentHook ?? '*') ?? '*';
	switch (normalizedRule) {
		case 'attack':
			return normalizedCurrent === 'attack';
		case 'damage':
			return normalizedCurrent === 'damage';
		case 'check':
			return normalizedCurrent === 'check';
		case 'save':
			return normalizedCurrent === 'save';
		case 'skill':
			return normalizedCurrent === 'check' && Boolean(context?.skill && Object.keys(context.skill).length);
		case 'tool':
			return normalizedCurrent === 'check' && Boolean(context?.tool && Object.keys(context.tool).length);
		case 'concentration':
			return normalizedCurrent === 'save' && Boolean(context?.isConcentration);
		case 'death':
			return normalizedCurrent === 'save' && Boolean(context?.isDeathSave);
		case 'initiative':
			return normalizedCurrent === 'check' && Boolean(context?.isInitiative);
		case 'bonus':
			return _isUsageRuleBonusContext(context);
		default:
			return false;
	}
}

function _normalizeUsageRuleTarget(target) {
	const parsed = String(target ?? 'subject')
		.trim()
		.toLowerCase();
	if (['subject', 'self', 'rolling', 'rollingactor'].includes(parsed)) return 'subject';
	if (['opponent', 'target', 'grants', 'opponentactor'].includes(parsed)) return 'opponent';
	if (['aura', 'auraactor', 'sourceaura'].includes(parsed)) return 'aura';
	return null;
}

function _normalizeUsageRuleMode(mode) {
	const parsed = String(mode ?? '')
		.trim()
		.toLowerCase();
	if (!parsed) return null;
	const aliases = {
		adv: 'advantage',
		dis: 'disadvantage',
		noadv: 'noAdvantage',
		nodis: 'noDisadvantage',
		nocrit: 'noCritical',
		crit: 'critical',
		bonus: 'bonus',
		mod: 'modifiers',
		modifier: 'modifiers',
		modifiers: 'modifiers',
		modifyac: 'targetADC',
		modifydc: 'targetADC',
		targetadc: 'targetADC',
		criticalthreshold: 'criticalThreshold',
		criticalthres: 'criticalThreshold',
		fumblethreshold: 'fumbleThreshold',
		fumblethres: 'fumbleThreshold',
		extradice: 'extraDice',
		diceupgrade: 'diceUpgrade',
		dicedowngrade: 'diceDowngrade',
		range: 'range',
		fail: 'fail',
		fumble: 'fumble',
		success: 'success',
		critical: 'critical',
		advantage: 'advantage',
		disadvantage: 'disadvantage',
		noadvantage: 'noAdvantage',
		nodisadvantage: 'noDisadvantage',
		nocritical: 'noCritical',
	};
	return aliases[parsed] ?? null;
}

function _normalizeUsageRuleCadence(value) {
	if (value == null) return null;
	const token = String(value).trim().toLowerCase();
	if (!token) return null;
	if (token === 'onceperturn' || token === 'turn') return 'oncePerTurn';
	if (token === 'onceperround' || token === 'round') return 'oncePerRound';
	if (token === 'oncepercombat' || token === 'combat' || token === 'encounter') return 'oncePerCombat';
	return null;
}

function _normalizeUsageRuleScope(value) {
	const token = String(value ?? 'effect')
		.trim()
		.toLowerCase();
	if (!token) return 'effect';
	if (['effect', 'effectdriven', 'effect-driven', 'keyword'].includes(token)) return 'effect';
	if (['universal', 'global'].includes(token)) return 'universal';
	return null;
}

function _parseUsageRuleDefinition(definition = {}) {
	const isObject = definition && typeof definition === 'object' && !Array.isArray(definition);
	if (!isObject) return null;
	const key = _normalizeUsageRuleKey(definition.key ?? definition.id);
	if (!key) return null;
	const hook = _normalizeUsageRuleHook(definition.hook ?? definition.type);
	if (!hook) return null;
	const mode = _normalizeUsageRuleMode(definition.mode);
	if (!mode) return null;
	const target = _normalizeUsageRuleTarget(definition.target ?? definition.actorType);
	if (!target) return null;
	const cadence = _normalizeUsageRuleCadence(definition.cadence);
	const name = typeof definition.name === 'string' ? definition.name.trim() : undefined;
	const description = typeof definition.description === 'string' ? definition.description.trim() : undefined;
	const condition =
		typeof definition.condition === 'string' ? definition.condition.trim()
		: typeof definition.expression === 'string' ? definition.expression.trim()
		: undefined;
	const evaluate = typeof definition.evaluate === 'function' ? definition.evaluate : undefined;
	const priority = Number.isFinite(Number(definition.priority)) ? Number(definition.priority) : 0;
	const optin = Boolean(definition.optin);
	const chance = definition.chance;
	const addTo = definition.addTo;
	const usesCount = definition.usesCount;
	const itemLimited = Boolean(definition.itemLimited);
	const value = definition.value;
	const bonus = definition.bonus ?? value;
	const persistent = Boolean(definition.persistent);
	const effectName = typeof definition.effectName === 'string' ? definition.effectName.trim() : undefined;
	const effectUuid = typeof definition.effectUuid === 'string' ? definition.effectUuid.trim() : undefined;
	const sourceUuid = typeof definition.sourceUuid === 'string' ? definition.sourceUuid.trim() : undefined;
	const documentScope = typeof definition.documentScope === 'string' ? definition.documentScope.trim() : undefined;
	const scope = _normalizeUsageRuleScope(definition.scope ?? definition.application);
	if (!scope) return null;
	return {
		key,
		hook,
		mode,
		target,
		name,
		description,
		condition,
		evaluate,
		priority,
		optin,
		cadence,
		chance,
		addTo,
		usesCount,
		itemLimited,
		bonus,
		set: definition.set,
		modifier: definition.modifier,
		threshold: definition.threshold,
		effectName,
		effectUuid,
		sourceUuid,
		documentScope,
		persistent,
		scope,
	};
}

function _listUsageRuleEntriesMerged() {
	const merged = new Map();
	for (const entry of usageRulesRegistryState.persistent.values()) merged.set(entry.key, entry);
	for (const entry of usageRulesRegistryState.runtime.values()) merged.set(entry.key, entry);
	return Array.from(merged.values());
}

function _buildUsageRulesState() {
	const entries = {};
	for (const entry of usageRulesRegistryState.persistent.values()) {
		if (!entry?.key) continue;
		entries[entry.key] = {
			hook: entry.hook,
			mode: entry.mode,
			target: entry.target,
			name: entry.name,
			description: entry.description,
			condition: entry.condition,
			priority: entry.priority,
			optin: entry.optin,
			cadence: entry.cadence,
			chance: entry.chance,
			addTo: entry.addTo,
			usesCount: entry.usesCount,
			itemLimited: entry.itemLimited,
			bonus: entry.bonus,
			set: entry.set,
			modifier: entry.modifier,
			threshold: entry.threshold,
			effectName: entry.effectName,
			effectUuid: entry.effectUuid,
			sourceUuid: entry.sourceUuid,
			documentScope: entry.documentScope,
			scope: entry.scope,
		};
	}
	return {
		schema: 1,
		updatedAt: Date.now(),
		entries,
	};
}

function _loadPersistentUsageRules(state = null) {
	const source = state ?? game.settings.get(Constants.MODULE_ID, Settings.USAGE_RULES_REGISTRY) ?? {};
	const root = source?.entries && typeof source.entries === 'object' ? source.entries : source;
	usageRulesRegistryState.persistent.clear();
	for (const [rawKey, value] of Object.entries(root ?? {})) {
		const isObject = value && typeof value === 'object' && !Array.isArray(value);
		const parsed = _parseUsageRuleDefinition({
			...(isObject ? value : {}),
			key: rawKey,
			persistent: true,
		});
		if (!parsed) continue;
		usageRulesRegistryState.persistent.set(parsed.key, {
			id: `ac5e-usage-rule-persistent-${parsed.key}`,
			...parsed,
			evaluate: undefined,
			source: 'persistent',
			updatedAt: Date.now(),
		});
	}
	return usageRulesRegistryState.persistent.size;
}

function _canPersistUsageRules() {
	return Boolean(game.users?.activeGM);
}

async function _persistUsageRulesState() {
	if (!_canPersistUsageRules()) return false;
	return _setUsageRulesSetting({ state: _buildUsageRulesState() });
}

function registerUsageRule(definition = {}) {
	const parsed = _parseUsageRuleDefinition(definition);
	if (!parsed) return null;
	const now = Date.now();
	if (parsed.persistent) {
		if (!_canPersistUsageRules()) {
			console.warn(`AC5E usage rule "${parsed.key}" requested persistent registration but current user cannot persist. Registering runtime only.`);
		} else if (parsed.evaluate) {
			console.warn(`AC5E usage rule "${parsed.key}" requested persistent registration with evaluate() function. Function cannot be persisted; registering runtime only.`);
		} else {
			const previous = usageRulesRegistryState.persistent.get(parsed.key);
			usageRulesRegistryState.persistent.set(parsed.key, {
				id: `ac5e-usage-rule-persistent-${parsed.key}`,
				...parsed,
				source: 'persistent',
				updatedAt: now,
			});
			_persistUsageRulesState().then((ok) => {
				if (ok) return;
				if (previous) usageRulesRegistryState.persistent.set(parsed.key, previous);
				else usageRulesRegistryState.persistent.delete(parsed.key);
			});
			return parsed.key;
		}
	}
	usageRulesRegistryState.runtime.set(parsed.key, {
		id: `ac5e-usage-rule-runtime-${usageRulesRegistryState.seq++}`,
		...parsed,
		source: 'runtime',
		updatedAt: now,
	});
	return parsed.key;
}

function removeUsageRule(key) {
	const normalized = _normalizeUsageRuleKey(key);
	if (!normalized) return false;
	const removedRuntime = usageRulesRegistryState.runtime.delete(normalized);
	const removedPersistent = usageRulesRegistryState.persistent.delete(normalized);
	if (removedPersistent) {
		_persistUsageRulesState().then((ok) => {
			if (!ok) console.warn(`AC5E usage rule "${normalized}" persistent removal failed to save`);
		});
	}
	return removedRuntime || removedPersistent;
}

function clearUsageRules() {
	usageRulesRegistryState.runtime.clear();
}

function listUsageRules() {
	return _listUsageRuleEntriesMerged()
		.map((entry) => ({
			key: entry.key,
			hook: entry.hook,
			mode: entry.mode,
			target: entry.target,
			name: entry.name,
			description: entry.description,
			condition: entry.condition,
			evaluate: entry.evaluate,
			priority: entry.priority,
			optin: entry.optin,
			cadence: entry.cadence,
			chance: entry.chance,
			addTo: entry.addTo,
			usesCount: entry.usesCount,
			itemLimited: entry.itemLimited,
			bonus: entry.bonus,
			set: entry.set,
			modifier: entry.modifier,
			threshold: entry.threshold,
			effectName: entry.effectName,
			effectUuid: entry.effectUuid,
			sourceUuid: entry.sourceUuid,
			documentScope: entry.documentScope,
			scope: entry.scope,
			source: entry.source ?? 'runtime',
			updatedAt: entry.updatedAt,
		}))
		.sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key));
}

function _applyUsageRuleKeywordsToSandbox(sandbox = {}) {
	if (!sandbox || typeof sandbox !== 'object') return sandbox;
	sandbox._evalConstants ??= {};
	const currentHook = String(sandbox?.hook ?? '*')
		.trim()
		.toLowerCase();
	const entries = _listUsageRuleEntriesMerged();
	for (const entry of entries) {
		const key = _normalizeUsageRuleKey(entry?.key);
		if (!key) continue;
		// Do not clobber explicit sandbox/context keyword values.
		if (Object.prototype.hasOwnProperty.call(sandbox, key)) continue;
		let result = false;
		try {
			if (!_usageRuleHookMatches(entry?.hook ?? '*', currentHook, sandbox)) {
				result = false;
			} else {
				let evaluateOk = true;
				if (typeof entry?.evaluate === 'function') {
					evaluateOk = Boolean(entry.evaluate(sandbox, { sandbox, rule: entry }));
				}
				let conditionOk = true;
				if (entry?.condition) {
					conditionOk = _ac5eSafeEval({ expression: entry.condition, sandbox, mode: 'condition' });
				}
				result = Boolean(evaluateOk && conditionOk);
			}
		} catch (err) {
			console.warn(`AC5E usage rule keyword "${key}" failed`, err);
		}
		sandbox[key] = Boolean(result);
		sandbox._evalConstants[key] = Boolean(result);
	}
	return sandbox;
}

function _parseContextKeywordDefinition(definition = {}, { allowFunction = true } = {}) {
	const isObject = definition && typeof definition === 'object' && !Array.isArray(definition);
	const rawKey = isObject ? (definition.key ?? definition.id) : definition;
	const key = _normalizeContextKeywordKey(rawKey);
	if (!key) return null;
	const name = isObject && typeof definition.name === 'string' ? definition.name.trim() : undefined;
	let expression;
	if (isObject) {
		expression = definition.expression ?? definition.condition;
		if (typeof expression !== 'string' && typeof definition.value === 'string') expression = definition.value;
	}
	const evaluate = allowFunction && isObject ? (definition.evaluate ?? definition.when ?? (typeof definition.value === 'function' ? definition.value : undefined)) : undefined;
	const parsedExpression = typeof expression === 'string' ? expression.trim() : '';
	if (typeof evaluate !== 'function' && !parsedExpression) return null;
	return { key, name, expression: parsedExpression || undefined, evaluate: typeof evaluate === 'function' ? evaluate : undefined };
}

function _listContextKeywordEntriesMerged() {
	const merged = new Map();
	for (const entry of contextKeywordRegistryState.persistent.values()) merged.set(entry.key, entry);
	for (const entry of contextKeywordRegistryState.runtime.values()) merged.set(entry.key, entry);
	return Array.from(merged.values());
}

function _buildContextKeywordsState() {
	const entries = {};
	for (const entry of contextKeywordRegistryState.persistent.values()) {
		if (!entry?.key || !entry?.expression) continue;
		entries[entry.key] = entry.name ? { expression: entry.expression, name: entry.name } : { expression: entry.expression };
	}
	return {
		schema: 1,
		updatedAt: Date.now(),
		entries,
	};
}

function _loadPersistentContextKeywords(state = null) {
	const source = state ?? game.settings.get(Constants.MODULE_ID, Settings.CONTEXT_KEYWORDS_REGISTRY) ?? {};
	const root = source?.entries && typeof source.entries === 'object' ? source.entries : source;
	contextKeywordRegistryState.persistent.clear();
	for (const [rawKey, value] of Object.entries(root ?? {})) {
		const key = _normalizeContextKeywordKey(rawKey);
		if (!key) continue;
		let expression;
		let name;
		if (typeof value === 'string') expression = value.trim();
		else if (value && typeof value === 'object') {
			expression = String(value.expression ?? value.condition ?? value.value ?? '').trim();
			name = typeof value.name === 'string' ? value.name.trim() : undefined;
		}
		if (!expression) continue;
		contextKeywordRegistryState.persistent.set(key, {
			id: `ac5e-context-keyword-persistent-${key}`,
			key,
			name,
			expression,
			source: 'persistent',
			updatedAt: Date.now(),
		});
	}
	return contextKeywordRegistryState.persistent.size;
}

function _canPersistContextKeywords() {
	if (game.user?.isGM) return true;
	return Boolean(game.settings.get(Constants.MODULE_ID, Settings.CONTEXT_KEYWORDS_ALLOW_PLAYER_PERSIST));
}

function _isContextKeywordPlayerPersistEnabled() {
	return Boolean(game.settings.get(Constants.MODULE_ID, Settings.CONTEXT_KEYWORDS_ALLOW_PLAYER_PERSIST));
}

async function _setContextKeywordPlayerPersistEnabled(enabled = false) {
	if (!game.user?.isGM) return false;
	await game.settings.set(Constants.MODULE_ID, Settings.CONTEXT_KEYWORDS_ALLOW_PLAYER_PERSIST, Boolean(enabled));
	return true;
}

async function _persistContextKeywordsState() {
	if (!_canPersistContextKeywords()) return false;
	return _setContextKeywordsSetting({ state: _buildContextKeywordsState() });
}

function registerContextKeyword(definition = {}) {
	const parsed = _parseContextKeywordDefinition(definition, { allowFunction: true });
	if (!parsed) return null;
	contextKeywordRegistryState.runtime.set(parsed.key, {
		id: `ac5e-context-keyword-runtime-${contextKeywordRegistryState.seq++}`,
		...parsed,
		source: 'runtime',
		updatedAt: Date.now(),
	});
	return parsed.key;
}

function removeContextKeyword(key) {
	const normalized = _normalizeContextKeywordKey(key);
	if (!normalized) return false;
	return contextKeywordRegistryState.runtime.delete(normalized);
}

function clearContextKeywords() {
	contextKeywordRegistryState.runtime.clear();
}

async function registerPersistentContextKeyword(definition = {}) {
	const parsed = _parseContextKeywordDefinition(definition, { allowFunction: false });
	if (!parsed?.expression) return null;
	if (!_canPersistContextKeywords()) return null;
	const previous = contextKeywordRegistryState.persistent.get(parsed.key);
	contextKeywordRegistryState.persistent.set(parsed.key, {
		id: `ac5e-context-keyword-persistent-${parsed.key}`,
		...parsed,
		source: 'persistent',
		updatedAt: Date.now(),
	});
	const ok = await _persistContextKeywordsState();
	if (!ok) {
		if (previous) contextKeywordRegistryState.persistent.set(parsed.key, previous);
		else contextKeywordRegistryState.persistent.delete(parsed.key);
		return null;
	}
	return parsed.key;
}

async function removePersistentContextKeyword(key) {
	const normalized = _normalizeContextKeywordKey(key);
	if (!normalized) return false;
	if (!_canPersistContextKeywords()) return false;
	const previous = contextKeywordRegistryState.persistent.get(normalized);
	if (!previous) return false;
	contextKeywordRegistryState.persistent.delete(normalized);
	const ok = await _persistContextKeywordsState();
	if (!ok) {
		contextKeywordRegistryState.persistent.set(normalized, previous);
		return false;
	}
	return true;
}

async function clearPersistentContextKeywords() {
	if (!_canPersistContextKeywords()) return false;
	const previous = new Map(contextKeywordRegistryState.persistent);
	contextKeywordRegistryState.persistent.clear();
	const ok = await _persistContextKeywordsState();
	if (!ok) {
		contextKeywordRegistryState.persistent.clear();
		for (const [key, entry] of previous.entries()) contextKeywordRegistryState.persistent.set(key, entry);
		return false;
	}
	return true;
}

function listContextKeywords({ source = 'all' } = {}) {
	const includeRuntime = source === 'all' || source === 'runtime';
	const includePersistent = source === 'all' || source === 'persistent';
	const merged = new Map();
	if (includePersistent) {
		for (const entry of contextKeywordRegistryState.persistent.values()) {
			merged.set(entry.key, {
				key: entry.key,
				name: entry.name,
				expression: entry.expression,
				source: 'persistent',
				updatedAt: entry.updatedAt,
			});
		}
	}
	if (includeRuntime) {
		for (const entry of contextKeywordRegistryState.runtime.values()) {
			merged.set(entry.key, {
				key: entry.key,
				name: entry.name,
				expression: entry.expression,
				evaluate: entry.evaluate,
				source: 'runtime',
				updatedAt: entry.updatedAt,
			});
		}
	}
	return Array.from(merged.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function _applyContextKeywordsToSandbox(sandbox = {}) {
	if (!sandbox || typeof sandbox !== 'object') return sandbox;
	sandbox._evalConstants ??= {};
	const entries = _listContextKeywordEntriesMerged();
	for (const entry of entries) {
		let result = false;
		try {
			if (typeof entry?.evaluate === 'function') result = entry.evaluate(sandbox, { sandbox, entry });
			else if (entry?.expression) result = _ac5eSafeEval({ expression: entry.expression, sandbox, mode: 'condition' });
		} catch (err) {
			console.warn(`AC5E context keyword "${entry?.key}" failed`, err);
		}
		const normalized = Boolean(result);
		sandbox[entry.key] = normalized;
		sandbox._evalConstants[entry.key] = normalized;
	}
	return sandbox;
}

const contextOverrideKeywordsProxy = new Proxy(
	{},
	{
		get(_target, prop) {
			if (typeof prop !== 'string') return undefined;
			const entry = contextKeywordRegistryState.runtime.get(prop);
			return entry?.evaluate ?? entry?.expression;
		},
		set(_target, prop, value) {
			if (typeof prop !== 'string') return false;
			const definition = typeof value === 'function' ? { key: prop, evaluate: value } : { key: prop, expression: String(value ?? '').trim() };
			return Boolean(registerContextKeyword(definition));
		},
		deleteProperty(_target, prop) {
			if (typeof prop !== 'string') return false;
			return removeContextKeyword(prop);
		},
		has(_target, prop) {
			return typeof prop === 'string' && contextKeywordRegistryState.runtime.has(prop);
		},
		ownKeys() {
			return Array.from(contextKeywordRegistryState.runtime.keys());
		},
		getOwnPropertyDescriptor(_target, prop) {
			if (typeof prop !== 'string' || !contextKeywordRegistryState.runtime.has(prop)) return undefined;
			return { enumerable: true, configurable: true };
		},
	},
);

function _reloadPersistentContextKeywords() {
	_loadPersistentContextKeywords();
	return listContextKeywords({ source: 'persistent' });
}

function _onContextKeywordsRegistrySettingUpdate(setting) {
	const settingKey = String(setting?.key ?? setting?.id ?? '');
	const matchesNamespaced = settingKey === `${Constants.MODULE_ID}.${Settings.CONTEXT_KEYWORDS_REGISTRY}`;
	const matchesLocal = settingKey === Settings.CONTEXT_KEYWORDS_REGISTRY;
	if (!matchesNamespaced && !matchesLocal) return;
	_loadPersistentContextKeywords(setting?.value ?? setting?._source?.value ?? null);
}

function _reloadPersistentUsageRules() {
	_loadPersistentUsageRules();
	return listUsageRules().filter((entry) => entry.source === 'persistent');
}

function _onUsageRulesRegistrySettingUpdate(setting) {
	const settingKey = String(setting?.key ?? setting?.id ?? '');
	const matchesNamespaced = settingKey === `${Constants.MODULE_ID}.${Settings.USAGE_RULES_REGISTRY}`;
	const matchesLocal = settingKey === Settings.USAGE_RULES_REGISTRY;
	if (!matchesNamespaced && !matchesLocal) return;
	_loadPersistentUsageRules(setting?.value ?? setting?._source?.value ?? null);
}

function ac5ei18nInit() {
	const settings = new Settings();
	if (settings.displayOnly5eStatuses) {
		const basic = Object.values(CONFIG.DND5E.conditionTypes)
			.filter((e) => !e.pseudo)
			.map((e) => e.name.toLowerCase())
			.concat(['burning', 'suffocation']);
		CONFIG.statusEffects.forEach((effect) => {
			if (!basic.includes(effect.id)) effect.hud = false;
		});
	}
}

function ac5eReady() {
	ac5eQueue = new foundry.utils.Semaphore();
	const settings = new Settings();
	const moduleVersion = game.modules?.get(Constants.MODULE_ID)?.version ?? 'unknown';
	const systemVersion = game.system?.version ?? 'unknown';
	const foundryVersion = game.version ?? game.release?.version ?? 'unknown';
	const devModeEnabled = settings.devModeEnabled;
	const readyStamp = Date.now();
	const readyStateId = `${AC5E_LOCAL_BUILD_ID}:${readyStamp}`;
	console.warn(`AC5E LOADED | v${moduleVersion} | dnd5e ${systemVersion} | foundry ${foundryVersion}`);
	if (devModeEnabled) {
		console.warn('AC5E READY DEV STATE', {
			buildId: AC5E_LOCAL_BUILD_ID,
			readyStateId,
			moduleVersion,
			systemVersion,
			foundryVersion,
			userId: game.user?.id ?? null,
			isGM: Boolean(game.user?.isGM),
			isActiveGM: Boolean(game.user?.isActiveGM),
		});
	}
	if (_activeModule('midi-qol')) {
		Hooks.once('midi-qol.midiReady', ac5eSetup); //added midi-qol ready hook, so that ac5e registers hooks after MidiQOL.
	} else {
		ac5eSetup();
	}
	if (_activeModule('dae')) DAE.addAutoFields(daeFlags);
	_migrate();
}

function ac5eSetup() {
	const settings = new Settings();
	initializeSandbox();
	_loadPersistentContextKeywords();
	_loadPersistentUsageRules();
	statusEffectsTables = _initStatusEffectsTables();
	const hooksRegistered = {};
	const actionHooks = [
		// { id: 'dnd5e.activityConsumption', type: 'consumptionHook' }, //@to-do: validate that there isn't an actual need for this
		{ id: 'dnd5e.preConfigureInitiative', type: 'init' }, //needed for Combat Carousel at least, when using the actor.rollInitiative()
		{ id: 'dnd5e.preRollAbilityCheck', type: 'check' },
		{ id: 'dnd5e.preRollAttack', type: 'attack' },
		{ id: 'dnd5e.preRollDamage', type: 'damage' },
		{ id: 'dnd5e.preRollSavingThrow', type: 'save' },
		{ id: 'dnd5e.preUseActivity', type: 'use' },
		{ id: 'dnd5e.postUseActivity', type: 'postUse' },
	];
	const buildHooks = [
		{ id: 'dnd5e.buildRollConfig', type: 'buildRoll' },
		{ id: 'dnd5e.postRollConfiguration', type: 'postRollConfig' },
	];
	const foundryHooks = [{ id: 'preCreateItem', type: 'preCreateItem' }];
	const renderHooks = [
		//renders
		{ id: 'dnd5e.renderChatMessage', type: 'chat' },
		//'renderAttackRollConfigurationDialog',  //@to-do, double check if it is needed
		{ id: 'renderD20RollConfigurationDialog', type: 'd20Dialog' },
		{ id: 'renderDamageRollConfigurationDialog', type: 'damageDialog' },
	];
	for (const hook of actionHooks.concat(renderHooks).concat(foundryHooks).concat(buildHooks)) {
		const hookId = Hooks.on(hook.id, (...args) => {
			if (renderHooks.some((h) => h.id === hook.id)) {
				const [render, element] = args;
				if (settings.debug) console.warn(hook.id, { render, element });
				return _renderHijack(hook.type, ...args);
			} else {
				if (hook.id === 'dnd5e.preUseActivity') {
					const [activity, config, dialog, message] = args;
					if (settings.debug) console.warn(hook.id, { activity, config, dialog, message });
				} else if (hook.id === 'dnd5e.postUseActivity') {
					const [activity, usageConfig, results] = args;
					if (settings.debug) console.warn(hook.id, { activity, usageConfig, results });
				} else if (hook.id === 'dnd5e.preConfigureInitiative') {
					const [actor, rollConfig] = args;
					if (settings.debug) console.warn(hook.id, { actor, rollConfig });
				} else if (hook.id === 'dnd5e.postRollConfiguration') {
					const [rolls, config, dialog, message] = args;
					if (settings.debug) console.warn(hook.id, { rolls, config, dialog, message });
				} else if (hook.id.startsWith('dnd5e.build')) {
					const [app, config, formData, index] = args;
					if (settings.debug) console.warn(hook.id, { app, config, formData, index });
				} else if (hook.id === 'preCreateItem') {
					const [item, updates] = args;
					if (settings.debug) console.warn(hook.id, { item, updates });
				} else {
					const [config, dialog, message] = args;
					if (settings.debug) console.warn(hook.id, { config, dialog, message });
				}
				return _rollFunctions(hook.type, ...args);
			}
		});
		hooksRegistered[hook.id] = hookId;
	}
	const renderSettingsConfigID = Hooks.on('renderSettingsConfig', _renderSettings);
	hooksRegistered['renderSettingsConfig'] = renderSettingsConfigID;
	const combatCadenceHookID = Hooks.on('updateCombat', _syncCombatCadenceFlags);
	hooksRegistered['updateCombat.cadence'] = combatCadenceHookID;
	const combatUpdateHookID = Hooks.on('updateCombat', _overtimeHazards);
	hooksRegistered['updateCombat.hazards'] = combatUpdateHookID;
	const contextKeywordsSettingHookId = Hooks.on('updateSetting', _onContextKeywordsRegistrySettingUpdate);
	hooksRegistered['updateSetting.contextKeywords'] = contextKeywordsSettingHookId;
	const usageRulesSettingHookId = Hooks.on('updateSetting', _onUsageRulesRegistrySettingUpdate);
	hooksRegistered['updateSetting.usageRules'] = usageRulesSettingHookId;
	/* Hooks block for UI
	const usageRuleHeaderHookNames = [
		'getHeaderControlsActorSheetV2',
		'getHeaderControlsItemSheet5e',
		'getHeaderControlsActiveEffectConfig',
		'getHeaderControlsSceneConfig',
		'getHeaderControlsSceneSheet',
	];
	for (const hookName of usageRuleHeaderHookNames) {
		const hookId = Hooks.on(hookName, _appendUsageRuleSheetHeaderControls);
		hooksRegistered[hookName] = hookId;
	}
	*/
	const registryUpdateHooks = ['createActor', 'updateActor', 'deleteActor', 'createItem', 'updateItem', 'deleteItem', 'createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect'];
	for (const hookName of registryUpdateHooks) {
		const registryHookId = Hooks.on(hookName, (document) => _reindexFlagRegistryActor(document));
		hooksRegistered[hookName] = registryHookId;
	}
	_buildFlagRegistry();

	console.warn('Automated Conditions 5e added the following (mainly) dnd5e hooks:', hooksRegistered);
	globalThis[Constants.MODULE_NAME_SHORT] = {};
	globalThis[Constants.MODULE_NAME_SHORT].info = {
		moduleName: Constants.MODULE_NAME,
		hooksRegistered,
		version: game.modules.get(Constants.MODULE_ID).version,
		buildId: AC5E_LOCAL_BUILD_ID,
		devModeEnabled: game.settings.get(Constants.MODULE_ID, Settings.DEV_MODE_ENABLED),
	};
	globalThis[Constants.MODULE_NAME_SHORT].checkArmor = _autoArmor;
	globalThis[Constants.MODULE_NAME_SHORT].checkCreatureType = _raceOrType;
	globalThis[Constants.MODULE_NAME_SHORT].checkDistance = _getDistance;
	globalThis[Constants.MODULE_NAME_SHORT].checkNearby = checkNearby;
	globalThis[Constants.MODULE_NAME_SHORT].checkRanged = _autoRanged;
	globalThis[Constants.MODULE_NAME_SHORT].checkVisibility = _canSee;
	globalThis[Constants.MODULE_NAME_SHORT].evaluationData = _createEvaluationSandbox;
	globalThis[Constants.MODULE_NAME_SHORT].getItems = _getItems;
	globalThis[Constants.MODULE_NAME_SHORT].getItemOrActivity = _getItemOrActivity;
	globalThis[Constants.MODULE_NAME_SHORT].hasItem = _hasItem;
	globalThis[Constants.MODULE_NAME_SHORT].logEvaluationData = false;

	globalThis[Constants.MODULE_NAME_SHORT].debug = {
		evaluations: false,
		optins: false,
		getConfigLayers: false,
		checksReuse: false,
		midiTooltipSync: false,
		getMessageDataHook: false,
		originatingUseConfig: false,
		preRollAttackHook: false,
		preRollDamageHook: false,
		preRollAbilityCheckHook: false,
		preRollSavingThrowHook: false,
		preUseActivityHook: false,
		postUseActivityHook: false,
		buildRollConfigHook: false,
		postRollConfigurationHook: false,
		renderHijackHook: false,
		preConfigureInitiativeHook: false,
		setAC5eProperties: false,
		usesCount: false,
	};
	Object.defineProperty(globalThis[Constants.MODULE_NAME_SHORT], 'debugGetConfigLayers', {
		get() {
			return Boolean(globalThis[Constants.MODULE_NAME_SHORT]?.debug?.getConfigLayers);
		},
		set(value) {
			globalThis[Constants.MODULE_NAME_SHORT].debug.getConfigLayers = Boolean(value);
		},
		configurable: true,
	});
	Object.defineProperty(globalThis[Constants.MODULE_NAME_SHORT], 'debugChecksReuse', {
		get() {
			return Boolean(globalThis[Constants.MODULE_NAME_SHORT]?.debug?.checksReuse);
		},
		set(value) {
			globalThis[Constants.MODULE_NAME_SHORT].debug.checksReuse = Boolean(value);
		},
		configurable: true,
	});
	globalThis[Constants.MODULE_NAME_SHORT].flagRegistry = {
		rebuild: _buildFlagRegistry,
		reindexActor: _reindexFlagRegistryActor,
		inspect: _inspectFlagRegistry,
	};
	Object.defineProperty(globalThis[Constants.MODULE_NAME_SHORT], '_target', {
		get() {
			return game?.user?.targets?.first();
		},
		configurable: true,
	});
	globalThis[Constants.MODULE_NAME_SHORT].statusEffectsTables = statusEffectsTables;
	globalThis[Constants.MODULE_NAME_SHORT].statusEffectsOverrides = {
		register: registerStatusEffectOverride,
		remove: removeStatusEffectOverride,
		clear: clearStatusEffectOverrides,
		list: listStatusEffectOverrides,
	};
	globalThis[Constants.MODULE_NAME_SHORT].cadence = {
		reset: resetCadenceFlags,
		inspect: inspectCadenceFlags,
	};
	globalThis[Constants.MODULE_NAME_SHORT].troubleshooter = {
		snapshot: createTroubleshooterSnapshot,
		exportSnapshot: exportTroubleshooterSnapshot,
		importSnapshot: importTroubleshooterSnapshot,
		lintFlags: lintAc5eFlags,
	};
	globalThis[Constants.MODULE_NAME_SHORT].contextKeywords = {
		register: registerContextKeyword,
		remove: removeContextKeyword,
		clear: clearContextKeywords,
		list: listContextKeywords,
		canPersist: _canPersistContextKeywords,
		isPlayerPersistEnabled: _isContextKeywordPlayerPersistEnabled,
		setPlayerPersistEnabled: _setContextKeywordPlayerPersistEnabled,
		registerPersistent: registerPersistentContextKeyword,
		removePersistent: removePersistentContextKeyword,
		clearPersistent: clearPersistentContextKeywords,
		reloadPersistent: _reloadPersistentContextKeywords,
		applyToSandbox: _applyContextKeywordsToSandbox,
	};
	globalThis[Constants.MODULE_NAME_SHORT].contextOverrideKeywords = contextOverrideKeywordsProxy;
	globalThis[Constants.MODULE_NAME_SHORT].usageRules = {
		register: registerUsageRule,
		/* UI block definitions
		promptDefinition: promptUsageRuleDefinition,
		registerDialog: registerUsageRuleDialog,
		manageDialog: registerUsageRuleManagerDialog,
		registerDialogForDocument: registerUsageRuleDialogForDocument,
		registerDialogForScene: registerUsageRuleDialogForScene,
		registerDialogUniversal: registerUsageRuleDialogUniversal,
		*/
		remove: removeUsageRule,
		clear: clearUsageRules,
		list: listUsageRules,
		canPersist: _canPersistUsageRules,
		reloadPersistent: _reloadPersistentUsageRules,
		applyToSandbox: _applyUsageRuleKeywordsToSandbox,
	};
	Hooks.callAll('ac5e.statusEffectsReady', {
		tables: statusEffectsTables,
		overrides: globalThis[Constants.MODULE_NAME_SHORT].statusEffectsOverrides,
	});
	Hooks.callAll('ac5e.contextKeywordsReady', {
		contextKeywords: globalThis[Constants.MODULE_NAME_SHORT].contextKeywords,
		contextOverrideKeywords: globalThis[Constants.MODULE_NAME_SHORT].contextOverrideKeywords,
	});
	Hooks.callAll('ac5e.usageRulesReady', {
		usageRules: globalThis[Constants.MODULE_NAME_SHORT].usageRules,
	});
}

function initializeSandbox() {
	const { DND5E } = CONFIG;

	const safeConstants = foundry.utils.deepFreeze({
		abilities: Object.fromEntries(Object.keys(DND5E.abilities).map((k) => [k, false])),
		abilityConsumptionTypes: Object.fromEntries(Object.keys(DND5E.abilityConsumptionTypes).map((k) => [k, false])),
		activityActivationTypes: Object.fromEntries(Object.keys(DND5E.activityActivationTypes).map((k) => [k, false])),
		activityConsumptionTypes: Object.fromEntries(Object.keys(DND5E.activityConsumptionTypes).map((k) => [k, false])),
		activityTypes: Object.fromEntries(Object.keys(DND5E.activityTypes).map((k) => [k, false])),
		actorSizes: Object.fromEntries(Object.keys(DND5E.actorSizes).map((k) => [k, false])),
		alignments: Object.fromEntries(Object.keys(DND5E.alignments).map((k) => [k, false])),
		ammoIds: Object.fromEntries(Object.keys(DND5E.ammoIds).map((k) => [k, false])),
		areaTargetTypes: Object.fromEntries(Object.keys(DND5E.areaTargetTypes).map((k) => [k, false])),
		armorIds: Object.fromEntries(Object.keys(DND5E.armorIds).map((k) => [k, false])),
		armorProficiencies: Object.fromEntries(Object.keys(DND5E.armorProficiencies).map((k) => [k, false])),
		armorTypes: Object.fromEntries(Object.keys(DND5E.armorTypes).map((k) => [k, false])),
		attackClassifications: Object.fromEntries(Object.keys(DND5E.attackClassifications).map((k) => [k, false])),
		attackModes: Object.fromEntries(Object.keys(DND5E.attackModes).map((k) => [k, false])),
		attackTypes: Object.fromEntries(Object.keys(DND5E.attackTypes).map((k) => [k, false])),
		conditionTypes: Object.fromEntries(
			Object.keys(DND5E.conditionTypes)
				.concat('bloodied')
				.map((k) => [k, false]),
		),
		creatureTypes: Object.fromEntries(Object.keys(DND5E.creatureTypes).map((k) => [k, false])),
		damageTypes: Object.fromEntries(Object.keys(DND5E.damageTypes).map((k) => [k, false])),
		healingTypes: Object.fromEntries(Object.keys(DND5E.healingTypes).map((k) => [k, false])),
		itemActionTypes: Object.fromEntries(Object.keys(DND5E.itemActionTypes).map((k) => [k, false])),
		itemProperties: Object.fromEntries(Object.keys(DND5E.itemProperties).map((k) => [k, false])),
		skills: Object.fromEntries(Object.keys(DND5E.skills).map((k) => [k, false])),
		toolIds: Object.fromEntries(Object.keys(DND5E.toolIds).map((k) => [k, false])),
		toolProficiencies: Object.fromEntries(Object.keys(DND5E.toolProficiencies).map((k) => [k, false])),
		tools: Object.fromEntries(Object.keys(DND5E.tools).map((k) => [k, false])),
		spellSchools: Object.fromEntries(Object.keys(DND5E.spellSchools).map((k) => [k, false])),
		statusEffects: Object.fromEntries(Object.keys(DND5E.statusEffects).map((k) => [k, false])),
		weaponMasteries: Object.fromEntries(Object.keys(DND5E.weaponMasteries).map((k) => [k, false])),
		weaponIds: Object.fromEntries(Object.keys(DND5E.weaponIds).map((k) => [k, false])),
	});

	const flatConstants = Object.assign({}, ...Object.values(safeConstants).filter((v) => typeof v === 'object'));
	foundry.utils.deepFreeze(flatConstants);
	const safeHelpers = Object.freeze({
		checkNearby,
		checkVisibility: _canSee,
		checkDistance: _getDistance,
		checkCreatureType: _raceOrType,
		getItemOrActivity: _getItemOrActivity,
		getItems: _getItems,
		checkArmor: _autoArmor,
		checkRanged: _autoRanged,
		hasItem: _hasItem,
	});

	lazySandbox = foundry.utils.deepFreeze({
		CONSTANTS: safeConstants,
		_evalConstants: flatConstants,
		...safeHelpers,
		Math,
		Number,
		String,
		Boolean,
		Array,
		Object,
		JSON,
		Date,
	});

	console.log('AC5E Base sandbox initialized', lazySandbox);
}

function registerQueries() {
	CONFIG.queries[Constants.MODULE_ID] = {};
	CONFIG.queries[Constants.GM_DOCUMENT_UPDATES] = _gmDocumentUpdates;
	CONFIG.queries[Constants.GM_EFFECT_DELETIONS] = _gmEffectDeletions;
	CONFIG.queries[Constants.GM_COMBAT_CADENCE_UPDATE] = _gmCombatCadenceUpdate;
	CONFIG.queries[Constants.GM_CONTEXT_KEYWORDS_UPDATE] = _gmContextKeywordsUpdate;
	CONFIG.queries[Constants.GM_USAGE_RULES_UPDATE] = _gmUsageRulesUpdate;
}

function _safeGetSetting(namespace, key) {
	try {
		return game.settings.get(namespace, key);
	} catch (_err) {
		return null;
	}
}

function _enumKeyByValue(enumObject, value) {
	if (!enumObject || value === undefined || value === null) return null;
	const match = Object.entries(enumObject).find(([, enumValue]) => enumValue === value);
	return match?.[0] ?? null;
}

function _normalizeCadenceToken(value) {
	if (value == null) return null;
	const token = String(value).trim().toLowerCase();
	if (!token) return null;
	if (token === 'onceperturn' || token === 'turn') return 'oncePerTurn';
	if (token === 'onceperround' || token === 'round') return 'oncePerRound';
	if (token === 'oncepercombat' || token === 'combat' || token === 'encounter') return 'oncePerCombat';
	return null;
}

function _splitKeywordFragments(value) {
	if (typeof value !== 'string') return [];
	return value
		.split(';')
		.map((fragment) => fragment.trim())
		.filter(Boolean);
}

function _parseKeywordFragment(fragment) {
	if (typeof fragment !== 'string') return null;
	const trimmed = fragment.trim();
	if (!trimmed) return null;
	const match = trimmed.match(/^([a-z][a-z0-9_]*)\s*([:=])\s*(.*)$/i);
	if (!match) return null;
	const keyword = match[1]?.trim().toLowerCase();
	const separator = match[2];
	const rawValue = match[3] ?? '';
	// Guard against treating comparison/assignment expressions as keyword fragments.
	// Example: "targetUuid === '0'" should stay a normal condition expression.
	if (separator === '=' && /^\s*[=<>!]/.test(rawValue)) return null;
	return {
		keyword,
		keywordValue: rawValue.trim(),
	};
}

function _isTokenKeywordLike(value) {
	return /^[a-z][a-z0-9_]*$/i.test(String(value ?? '').trim());
}

function _extractFlagKeywordValue(rawValue, keyword) {
	if (typeof rawValue !== 'string') return null;
	const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(`(?:^|;)\\s*${escapedKeyword}\\s*[:=]\\s*([^;]*)`, 'i');
	const match = rawValue.match(regex);
	return match?.[1]?.trim() ?? null;
}

function _hasBalancedDelimiters(text) {
	const source = String(text ?? '');
	const stack = [];
	let quote = null;
	let escaped = false;
	const pairs = new Map([
		['(', ')'],
		['[', ']'],
		['{', '}'],
	]);
	for (const char of source) {
		if (quote) {
			if (escaped) {
				escaped = false;
				continue;
			}
			if (char === '\\') {
				escaped = true;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			quote = char;
			continue;
		}
		if (pairs.has(char)) {
			stack.push(pairs.get(char));
			continue;
		}
		if (char === ')' || char === ']' || char === '}') {
			const expected = stack.pop();
			if (char !== expected) return false;
		}
	}
	return !quote && stack.length === 0;
}

function _checkExpressionShape(expression, { allowLeadingOperator = false } = {}) {
	const raw = String(expression ?? '').trim();
	if (!raw) return 'empty expression';
	if (!allowLeadingOperator && /^[*/%]/.test(raw)) return 'unexpected leading operator';
	if (!_hasBalancedDelimiters(raw)) return 'unbalanced delimiters';
	if (/[\+\-*/%]{4,}/.test(raw)) return 'suspicious operator sequence';
	return null;
}

function _isAc5eChangeKey(changeKey) {
	if (typeof changeKey !== 'string') return false;
	const normalized = changeKey.trim().toLowerCase();
	return normalized.startsWith('flags.ac5e.') || normalized.startsWith(`flags.${Constants.MODULE_ID.toLowerCase()}.`);
}

function _collectLintActorCandidates({ includeSceneActors = true } = {}) {
	const actorsByUuid = new Map();
	for (const actor of game.actors ?? []) {
		if (!actor?.uuid) continue;
		actorsByUuid.set(actor.uuid, actor);
	}
	if (includeSceneActors) {
		for (const scene of game.scenes ?? []) {
			for (const token of scene?.tokens ?? []) {
				const actor = token?.actor;
				if (!actor?.uuid || actorsByUuid.has(actor.uuid)) continue;
				actorsByUuid.set(actor.uuid, actor);
			}
		}
	}
	return Array.from(actorsByUuid.values());
}

function _collectLintEffectSources({ includeSceneActors = true, includeWorldItems = true } = {}) {
	const sources = [];
	const seen = new Set();
	const pushEffect = ({ sourceType, actor = null, item = null, effect = null }) => {
		if (!effect) return;
		const key = effect.uuid ?? `${sourceType}:${actor?.uuid ?? 'none'}:${item?.uuid ?? 'none'}:${effect.id ?? effect.name ?? 'effect'}`;
		if (seen.has(key)) return;
		seen.add(key);
		sources.push({ sourceType, actor, item, effect });
	};

	for (const actor of _collectLintActorCandidates({ includeSceneActors })) {
		for (const effect of actor?.effects ?? []) {
			pushEffect({ sourceType: 'actor', actor, effect });
		}
		for (const item of actor?.items ?? []) {
			for (const effect of item?.effects ?? []) {
				pushEffect({ sourceType: 'item', actor, item, effect });
			}
		}
	}

	if (includeWorldItems) {
		for (const item of game.items ?? []) {
			for (const effect of item?.effects ?? []) {
				pushEffect({ sourceType: 'worldItem', item, effect });
			}
		}
	}

	return sources;
}

function _summarizeLintFindings(findings = []) {
	const byCode = {};
	const bySeverity = {};
	for (const finding of findings) {
		const code = finding?.code ?? 'unknown';
		const severity = finding?.severity ?? 'warn';
		byCode[code] = (byCode[code] ?? 0) + 1;
		bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
	}
	return {
		total: findings.length,
		byCode,
		bySeverity,
	};
}

function _logLintReport(report) {
	if (!report) return;
	const summary = report.summary ?? {};
	const total = summary.total ?? 0;
	const errors = summary.bySeverity?.error ?? 0;
	const warns = summary.bySeverity?.warn ?? 0;
	console.groupCollapsed(`AC5E flag lint: ${total} finding(s), ${errors} error(s), ${warns} warning(s)`);
	for (const finding of report.findings ?? []) {
		const log = finding.severity === 'error' ? console.error : console.warn;
		log(`AC5E flag lint [${finding.code}] ${finding.message}`, finding);
	}
	console.info('AC5E flag lint summary', {
		summary: report.summary,
		scanned: report.scanned,
	});
	console.groupEnd();
}

export function lintAc5eFlags({ log = true, includeDisabled = true, includeSceneActors = true, includeWorldItems = true } = {}) {
	const blacklist = new Set([
		'addto',
		'allies',
		'bonus',
		'cadence',
		'chance',
		'description',
		'enemies',
		'fail',
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
		'radius',
		'reach',
		'set',
		'short',
		'singleaura',
		'threshold',
		'usescount',
		'wallsblock',
	]);
	const knownKeyedKeywords = new Set([...blacklist, 'condition', 'priority']);
	const knownBooleanKeywords = new Set(['true', 'false', '0', '1']);
	const knownStandaloneKeywords = new Set([...blacklist, ...knownBooleanKeywords, 'turn', 'round', 'combat', 'encounter']);
	const damageTypeSet = new Set(
		Object.keys(CONFIG?.DND5E?.damageTypes ?? {})
			.map((entry) => String(entry).trim().toLowerCase())
			.filter(Boolean),
	);
	const contextKeywordList = globalThis?.[Constants.MODULE_NAME_SHORT]?.contextKeywords?.list?.();
	const contextKeywordSet = new Set(Array.isArray(contextKeywordList) ? contextKeywordList.map((entry) => String(entry).trim().toLowerCase()).filter(Boolean) : []);
	const sandboxIdentifierSet = new Set(
		Object.keys(lazySandbox ?? {})
			.map((entry) => String(entry).trim().toLowerCase())
			.filter(Boolean),
	);
	const sandboxFlatConstantSet = new Set(
		Object.keys(lazySandbox?._evalConstants ?? {})
			.map((entry) => String(entry).trim().toLowerCase())
			.filter(Boolean),
	);
	const formulaKeywords = new Set(['bonus', 'set', 'modifier', 'threshold']);

	const findings = [];
	const seen = new Set();
	const pushFinding = ({ severity = 'warn', code, message, sourceType, actor, item, effect, change, changeIndex, fragment = null, keyword = null, value = null }) => {
		const fingerprint = [code, effect?.uuid ?? effect?.id ?? 'none', changeIndex ?? 'none', change?.key ?? 'none', keyword ?? fragment ?? 'none', message].join('|');
		if (seen.has(fingerprint)) return;
		seen.add(fingerprint);
		findings.push({
			severity,
			code,
			message,
			sourceType: sourceType ?? null,
			actorName: actor?.name ?? null,
			actorUuid: actor?.uuid ?? null,
			itemName: item?.name ?? null,
			itemUuid: item?.uuid ?? null,
			effectName: effect?.name ?? null,
			effectUuid: effect?.uuid ?? effect?.id ?? null,
			changeIndex: Number.isInteger(changeIndex) ? changeIndex : null,
			changeKey: change?.key ?? null,
			changeValue: change?.value ?? null,
			keyword,
			fragment,
			value,
		});
	};

	const effectSources = _collectLintEffectSources({ includeSceneActors, includeWorldItems });
	let scannedEffects = 0;
	let scannedChanges = 0;
	for (const source of effectSources) {
		const actor = source.actor;
		const item = source.item;
		const effect = source.effect;
		if (!effect) continue;
		if (!includeDisabled && effect.disabled) continue;
		const changes = Array.isArray(effect?.changes) ? effect.changes : [];
		const hasAc5eChange = changes.some((change) => _isAc5eChangeKey(change?.key));
		if (!hasAc5eChange) continue;
		scannedEffects += 1;

		if (effect.origin != null) {
			const originUuid = _resolveUuidString(effect.origin);
			if (!originUuid) {
				pushFinding({
					severity: 'warn',
					code: 'invalidEffectOrigin',
					message: 'Effect origin is not a valid UUID string',
					sourceType: source.sourceType,
					actor,
					item,
					effect,
				});
			} else if (!_isUuidLike(originUuid)) {
				pushFinding({
					severity: 'warn',
					code: 'invalidEffectOrigin',
					message: `Effect origin has invalid UUID syntax: "${originUuid}"`,
					sourceType: source.sourceType,
					actor,
					item,
					effect,
				});
			} else if (!_safeFromUuidSync(originUuid)) {
				pushFinding({
					severity: 'warn',
					code: 'unresolvedEffectOrigin',
					message: `Effect origin could not be resolved: "${originUuid}"`,
					sourceType: source.sourceType,
					actor,
					item,
					effect,
				});
			}
		}
		for (let changeIndex = 0; changeIndex < changes.length; changeIndex++) {
			const change = changes[changeIndex];
			if (!_isAc5eChangeKey(change?.key)) continue;
			scannedChanges += 1;
			const normalizedChangeKey = String(change?.key ?? '').toLowerCase();
			if (normalizedChangeKey.includes('.actiontype.')) {
				pushFinding({
					severity: 'warn',
					code: 'malformedChangeKey',
					message: 'Unresolved ACTIONTYPE placeholder in change key; use explicit roll-type keys instead',
					sourceType: source.sourceType,
					actor,
					item,
					effect,
					change,
					changeIndex,
				});
			}

			if (typeof change.value !== 'string') {
				pushFinding({
					severity: 'warn',
					code: 'nonStringFlagValue',
					message: 'AC5E flag value is not a string',
					sourceType: source.sourceType,
					actor,
					item,
					effect,
					change,
					changeIndex,
				});
				continue;
			}

			const rawValue = change.value;
			const fragments = _splitKeywordFragments(rawValue);
			const parsedKeywords = [];

			for (const fragment of fragments) {
				const parsedFragment = _parseKeywordFragment(fragment);
				if (parsedFragment) {
					const { keyword, keywordValue } = parsedFragment;
					parsedKeywords.push({ keyword, keywordValue, fragment });
					if (!keyword) continue;
					if (!knownKeyedKeywords.has(keyword) && _isTokenKeywordLike(keyword)) {
						if (contextKeywordSet.has(keyword) || sandboxIdentifierSet.has(keyword) || sandboxFlatConstantSet.has(keyword)) continue;
						pushFinding({
							severity: 'warn',
							code: 'unknownKeyword',
							message: `Unknown keyword "${keyword}"`,
							sourceType: source.sourceType,
							actor,
							item,
							effect,
							change,
							changeIndex,
							fragment,
							keyword,
							value: keywordValue,
						});
						continue;
					}

					if (keyword === 'cadence') {
						const cadence = _normalizeCadenceToken(keywordValue);
						if (!cadence) {
							pushFinding({
								severity: 'warn',
								code: 'invalidCadence',
								message: `Invalid cadence value "${keywordValue}"`,
								sourceType: source.sourceType,
								actor,
								item,
								effect,
								change,
								changeIndex,
								fragment,
								keyword,
								value: keywordValue,
							});
						}
					}

					if (keyword === 'chance') {
						const chanceValue = Number(keywordValue);
						if (Number.isFinite(chanceValue) && (chanceValue < 1 || chanceValue > 100)) {
							pushFinding({
								severity: 'warn',
								code: 'chanceOutOfRange',
								message: `Chance must be between 1 and 100 (received "${keywordValue}")`,
								sourceType: source.sourceType,
								actor,
								item,
								effect,
								change,
								changeIndex,
								fragment,
								keyword,
								value: keywordValue,
							});
						}
					}

					if (keyword === 'addto') {
						const parsedTypes = keywordValue
							.toLowerCase()
							.split(/[,|]/)
							.map((entry) => entry.trim())
							.filter(Boolean);
						if (parsedTypes.length && !(parsedTypes.length === 1 && parsedTypes[0] === 'all')) {
							const unknownDamageTypes = parsedTypes.filter((entry) => !damageTypeSet.has(entry));
							if (unknownDamageTypes.length) {
								pushFinding({
									severity: 'warn',
									code: 'invalidAddToType',
									message: `Unknown addTo damage type(s): ${unknownDamageTypes.join(', ')}`,
									sourceType: source.sourceType,
									actor,
									item,
									effect,
									change,
									changeIndex,
									fragment,
									keyword,
									value: keywordValue,
								});
							}
						}
					}

					if (formulaKeywords.has(keyword)) {
						const shapeIssue = _checkExpressionShape(keywordValue, { allowLeadingOperator: keyword === 'modifier' });
						if (shapeIssue) {
							pushFinding({
								severity: 'warn',
								code: 'malformedFormula',
								message: `Malformed ${keyword} expression (${shapeIssue})`,
								sourceType: source.sourceType,
								actor,
								item,
								effect,
								change,
								changeIndex,
								fragment,
								keyword,
								value: keywordValue,
							});
						}
					}

					if (keyword === 'condition') {
						const conditionIssue = _checkExpressionShape(keywordValue);
						if (conditionIssue) {
							pushFinding({
								severity: 'warn',
								code: 'malformedCondition',
								message: `Malformed condition expression (${conditionIssue})`,
								sourceType: source.sourceType,
								actor,
								item,
								effect,
								change,
								changeIndex,
								fragment,
								keyword,
								value: keywordValue,
							});
						}
					}
					continue;
				}

				const normalized = fragment.toLowerCase();
				if (contextKeywordSet.has(normalized)) continue;
				if (sandboxIdentifierSet.has(normalized)) continue;
				if (sandboxFlatConstantSet.has(normalized)) continue;
				if (knownStandaloneKeywords.has(normalized)) continue;
				if (damageTypeSet.has(normalized)) continue;
				// Standalone camelCase / mixed-case tokens are usually sandbox identifiers (e.g. isSpell).
				if (fragment.trim() !== normalized) continue;
				if (!_isTokenKeywordLike(normalized)) continue;
				pushFinding({
					severity: 'warn',
					code: 'unknownKeyword',
					message: `Unknown keyword "${fragment}"`,
					sourceType: source.sourceType,
					actor,
					item,
					effect,
					change,
					changeIndex,
					fragment,
					value: fragment,
				});
			}

			const usesCountValue = _extractFlagKeywordValue(rawValue, 'usescount');
			if (usesCountValue != null && !usesCountValue.trim()) {
				pushFinding({
					severity: 'warn',
					code: 'invalidUsesCount',
					message: 'usesCount keyword has an empty value',
					sourceType: source.sourceType,
					actor,
					item,
					effect,
					change,
					changeIndex,
					keyword: 'usesCount',
					value: usesCountValue,
				});
			}

			const hasCadenceToken = fragments.some((fragment) => Boolean(_normalizeCadenceToken(fragment)));
			if (!hasCadenceToken && !parsedKeywords.some(({ keyword }) => keyword === 'cadence')) {
				const cadenceValue = _extractFlagKeywordValue(rawValue, 'cadence');
				if (cadenceValue && !_normalizeCadenceToken(cadenceValue)) {
					pushFinding({
						severity: 'warn',
						code: 'invalidCadence',
						message: `Invalid cadence value "${cadenceValue}"`,
						sourceType: source.sourceType,
						actor,
						item,
						effect,
						change,
						changeIndex,
						keyword: 'cadence',
						value: cadenceValue,
					});
				}
			}
		}
	}

	const report = {
		schema: 1,
		generatedAt: new Date().toISOString(),
		scanned: {
			effects: scannedEffects,
			changes: scannedChanges,
			actors: _collectLintActorCandidates({ includeSceneActors }).length,
			worldItems: includeWorldItems ? (game.items?.size ?? 0) : 0,
		},
		summary: _summarizeLintFindings(findings),
		findings,
	};

	if (log) _logLintReport(report);
	return report;
}

function _collectModuleSettings(namespace) {
	const settings = {};
	for (const setting of game.settings.settings.values()) {
		if (setting?.namespace !== namespace) continue;
		const settingKey = setting?.key;
		if (!settingKey) continue;
		settings[settingKey] = _safeGetSetting(namespace, settingKey);
	}
	return settings;
}

function _getModuleState(moduleId) {
	const module = game.modules?.get(moduleId);
	return {
		id: moduleId,
		active: Boolean(module?.active),
		version: module?.version ?? null,
		title: module?.title ?? null,
	};
}

function _formatTroubleshooterFilename(date = new Date()) {
	const pad = (n) => `${n}`.padStart(2, '0');
	const year = date.getFullYear();
	const month = pad(date.getMonth() + 1);
	const day = pad(date.getDate());
	const hour = pad(date.getHours());
	const minute = pad(date.getMinutes());
	const second = pad(date.getSeconds());
	return `ac5e-troubleshooter-${year}${month}${day}-${hour}${minute}${second}.json`;
}

export function createTroubleshooterSnapshot({ includeLint = true, lintOptions = {} } = {}) {
	const gridDiagonalsValue = _safeGetSetting('core', 'gridDiagonals');
	const rulesVersion = _safeGetSetting('dnd5e', 'rulesVersion');
	const scene = canvas?.scene ?? null;
	const grid = canvas?.grid ?? null;
	const environment = scene?.environment?.toObject?.() ?? foundry.utils.duplicate(scene?.environment ?? {});
	let lint = null;
	if (includeLint) {
		try {
			lint = lintAc5eFlags({ log: false, ...lintOptions });
		} catch (error) {
			lint = {
				schema: 1,
				error: String(error?.message ?? error ?? 'Unknown lint error'),
			};
		}
	}

	return {
		schema: 1,
		generatedAt: new Date().toISOString(),
		user: {
			id: game.user?.id ?? null,
			name: game.user?.name ?? null,
			role: game.user?.role ?? null,
			isGM: Boolean(game.user?.isGM),
		},
		versions: {
			foundry: game.version ?? null,
			foundryGeneration: game.release?.generation ?? null,
			system: {
				id: game.system?.id ?? null,
				version: game.system?.version ?? null,
			},
			modules: {
				ac5e: _getModuleState(Constants.MODULE_ID),
				midiQOL: _getModuleState('midi-qol'),
				dae: _getModuleState('dae'),
				timesUp: _getModuleState('times-up'),
				chrisPremades: _getModuleState('chris-premades'),
			},
		},
		ac5e: {
			settings: _collectModuleSettings(Constants.MODULE_ID),
			lint,
		},
		canvas: {
			scene: {
				id: scene?.id ?? null,
				uuid: scene?.uuid ?? null,
				name: scene?.name ?? null,
				tokenVision: scene?.tokenVision ?? null,
				environment,
				globalLightEnabled: scene?.environment?.globalLight?.enabled ?? null,
			},
			grid: {
				type: grid?.type ?? null,
				typeName: _enumKeyByValue(CONST.GRID_TYPES, grid?.type),
				diagonals: gridDiagonalsValue,
				diagonalsName: _enumKeyByValue(CONST.GRID_DIAGONALS, gridDiagonalsValue),
				distance: grid?.distance ?? null,
				units: grid?.units ?? null,
				size: grid?.size ?? null,
			},
		},
		dnd5e: {
			rulesVersion,
		},
	};
}

export function exportTroubleshooterSnapshot({ filename = null } = {}) {
	const snapshot = createTroubleshooterSnapshot();
	const json = JSON.stringify(snapshot, null, 2);
	const targetFile = filename || _formatTroubleshooterFilename();
	foundry.utils.saveDataToFile(json, 'application/json', targetFile);
	return snapshot;
}

function readTextFromFile(file) {
	const reader = new FileReader();
	return new Promise((resolve, reject) => {
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => {
			reader.abort();
			reject(new Error('Unable to read file'));
		};
		reader.readAsText(file);
	});
}

function pickTroubleshooterSnapshotFile() {
	return new Promise((resolve) => {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json,application/json';
		input.style.display = 'none';
		input.addEventListener(
			'change',
			() => {
				const [file] = Array.from(input.files ?? []);
				input.remove();
				resolve(file ?? null);
			},
			{ once: true },
		);
		document.body.appendChild(input);
		input.click();
	});
}

export async function importTroubleshooterSnapshot(file = null) {
	const importFile = file ?? (await pickTroubleshooterSnapshotFile());
	if (!importFile) return null;
	const text = await (foundry.utils.readTextFromFile?.(importFile) ?? readTextFromFile(importFile));
	const parsed = JSON.parse(text);
	console.log('AC5E troubleshooter import:', parsed);
	return parsed;
}

