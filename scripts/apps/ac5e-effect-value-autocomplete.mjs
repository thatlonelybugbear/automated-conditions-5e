import Constants from '../ac5e-constants.mjs';
import { _generateAC5eFlags, _resolveEffectOriginContext } from '../ac5e-helpers.mjs';
import { AC5E_ACTOR_ROLLDATA_ADDED_FIELDS, AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS, _ac5eActorRollData } from '../ac5e-runtimeLogic.mjs';

const CURATED_AC5E_PATHS = [
	'rollingActor',
	'opponentActor',
	'effectActor',
	'nonEffectActor',
	'auraActor',
	'effectOriginActor',
	'item',
	'activity',
	'originItem',
	'originActivity',
	'itemType',
	'itemProperties',
	'originItemType',
	'originItemProperties',
	'damageTypes',
	'defaultDamageType',
	'actionType',
	'actionType.mwak',
	'actionType.rwak',
	'actionType.msak',
	'actionType.rsak',
	'attackMode',
	'mastery',
	'activityName',
	'itemName',
	'itemIdentifier',
	'hasAttack',
	'hasDamage',
	'hasHealing',
	'hasSave',
	'hasCheck',
	'hasAdvantage',
	'hasDisadvantage',
	'hasTransitAdvantage',
	'hasTransitDisadvantage',
	'isSpell',
	'isCantrip',
	'isAoE',
	'isCritical',
	'isFumble',
	'isTurn',
	'isOpponentTurn',
	'canMove',
	'canSee',
	'isSeen',
	'opponentAC',
	'tokenId',
	'tokenUuid',
	'actorId',
	'actorUuid',
	'opponentId',
	'opponentUuid',
	'opponentActorId',
	'opponentActorUuid',
	'originItemProperties.sil',
	'originItemProperties.mgc',
	'originItemProperties.ver',
	'originItemProperties.som',
	'originItemProperties.mat',
	'itemProperties.sil',
	'itemProperties.mgc',
	'itemProperties.ver',
	'itemProperties.som',
	'itemProperties.mat',
];
const ROOT_PATHS = ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor', 'item', 'activity', 'originItem', 'originActivity'];
const AC5E_AUTOCOMPLETE_TRIGGER_PREFIXES = ['flags.auto', 'ac5e', 'automated-'];
const CONFIG_BOOLEAN_MAP_KEYS = [
	'abilities',
	'abilityConsumptionTypes',
	'activityActivationTypes',
	'activityConsumptionTypes',
	'activityTypes',
	'actorSizes',
	'alignments',
	'ammoIds',
	'areaTargetTypes',
	'armorIds',
	'armorProficiencies',
	'armorTypes',
	'attackClassifications',
	'attackModes',
	'attackTypes',
	'conditionTypes',
	'creatureTypes',
	'damageTypes',
	'healingTypes',
	'itemProperties',
	'skills',
	'spellSchools',
	'statusEffects',
	'toolIds',
	'toolProficiencies',
	'tools',
	'weaponMasteries',
	'weaponIds',
	'weaponTypes',
];
const DND5E_SEED_ACTOR_UUIDS = ['Compendium.dnd5e.actors24.Actor.AkraLv1700000000', 'Compendium.dnd5e.actors24.Actor.mmAncientBlueDra'];
const ACTIVITY_TYPES_TO_COLLECT = ['attack', 'save', 'check', 'damage', 'heal'];
let collectedPathCache = null;
let hasLoggedSeedCoverage = false;
let seedCollectionStarted = false;

export function buildEffectValueAutocompleteEntries(effect) {
	const entries = new Map();
	const origin = _resolveEffectOriginContext(effect, { relative: effect?.parent ?? effect?.target });
	addCollectedSchemaEntries(entries);

	addDocumentRollData(entries, 'rollingActor', getActorDocument(effect?.target ?? effect?.parent), 'Actor roll data');
	addDocumentRollData(entries, 'item', getItemParent(effect), 'Item roll data', 'item');
	addDocumentRollData(entries, 'activity', origin.originActivity, 'Activity roll data', 'activity');
	addDocumentRollData(entries, 'originItem', origin.originItem, 'Origin item roll data', 'item');
	addDocumentRollData(entries, 'originActivity', origin.originActivity, 'Origin activity roll data', 'activity');
	addCuratedEntries(entries);
	addConfigConstantEntries(entries);
	addKnownValueLiteralEntries(entries);

	return Array.from(entries.values()).sort((a, b) => a.identifier.localeCompare(b.identifier));
}

export function buildEffectKeyAutocompleteEntries(currentKey) {
	const entries = new Map();
	for (const key of _generateAC5eFlags()) addEntry(entries, key, 'AC5E flag');
	if (isAc5eChangeKey(currentKey)) addEntry(entries, currentKey, 'Current key');
	const built = Array.from(entries.values()).sort(compareAutocompleteEntries);
	if (isAc5eAutocompleteDebugEnabled('effectKeys')) {
		console.debug('AC5E | autocomplete.effectKeys | built entries', {
			total: built.length,
			currentKey: `${currentKey ?? ''}`,
		});
	}
	return built;
}

function compareAutocompleteEntries(a, b) {
	const aLegacyActionType = isLegacyActionTypeKey(a?.identifier);
	const bLegacyActionType = isLegacyActionTypeKey(b?.identifier);
	if (aLegacyActionType !== bLegacyActionType) return aLegacyActionType ? 1 : -1;
	const left = typeof a?.identifier === 'string' ? a.identifier : '';
	const right = typeof b?.identifier === 'string' ? b.identifier : '';
	return left.localeCompare(right);
}

function isLegacyActionTypeKey(identifier) {
	if (typeof identifier !== 'string') return false;
	return /\.ACTIONTYPE\./i.test(identifier);
}

export function getAutocompletePrefix(input) {
	const cursor = input.selectionStart ?? input.value.length;
	const beforeCursor = input.value.slice(0, cursor);
	return beforeCursor.match(/[A-Za-z_$][\w$-]*(?:\.(?:[A-Za-z_$][\w$-]*|\d+))*\.?$/)?.[0] ?? '';
}

export function shouldActivateEffectValueAutocomplete(input, prefix = '') {
	const inputValue = `${input?.value ?? ''}`.toLowerCase();
	const cursor = Number(input?.selectionStart ?? inputValue.length);
	const beforeCursor = inputValue.slice(0, Math.max(0, cursor));
	const normalizedPrefix = `${prefix ?? ''}`.toLowerCase().trim();
	if (!normalizedPrefix) return false;
	if (AC5E_AUTOCOMPLETE_TRIGGER_PREFIXES.some((trigger) => normalizedPrefix.startsWith(trigger))) return true;
	if (ROOT_PATHS.some((root) => root.toLowerCase().includes(normalizedPrefix))) return true;
	const token = beforeCursor.match(/[A-Za-z_$][\w$-]*(?:\.(?:[A-Za-z_$][\w$-]*|\d+))*\.?$/)?.[0] ?? '';
	return AC5E_AUTOCOMPLETE_TRIGGER_PREFIXES.some((trigger) => token.startsWith(trigger));
}

export function replaceAutocompletePrefix(input, prefix, replacement) {
	const cursor = input.selectionStart ?? input.value.length;
	const start = Math.max(0, cursor - prefix.length);
	input.value = `${input.value.slice(0, start)}${replacement}${input.value.slice(cursor)}`;
	const nextCursor = start + replacement.length;
	input.setSelectionRange(nextCursor, nextCursor);
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
}

export function configureAc5eAutocompleteMenu(autocomplete) {
	const menu = autocomplete?.element;
	if (!(menu instanceof HTMLElement)) return;
	menu.classList.add('ac5e-autocomplete-menu');
	menu.tabIndex = -1;
	if (menu.dataset.ac5eAutocompleteMenuReady) return;
	menu.dataset.ac5eAutocompleteMenuReady = 'true';
	menu.addEventListener('wheel', (event) => {
		event.stopPropagation();
		if (menu.scrollHeight > menu.clientHeight) return;
		event.preventDefault();
	}, { passive: false });
	menu.addEventListener('pointerdown', (event) => event.stopPropagation());
}

export function rankEffectValueAutocompleteEntries(entries, { inputValue = '', cursor = 0, prefix = '', limit = 40 } = {}) {
	const normalizedPrefix = `${prefix ?? ''}`.toLowerCase();
	if (!normalizedPrefix) return [];
	const ranked = [];
	for (const entry of entries ?? []) {
		const identifier = `${entry?.identifier ?? ''}`;
		if (!identifier) continue;
		const score = scoreAutocompleteEntry(identifier, normalizedPrefix);
		if (score <= -1) continue;
		ranked.push({ ...entry, _score: score });
	}
	const enumSnippets = buildContextualEnumSnippets(inputValue, cursor);
	for (const snippet of enumSnippets) ranked.push({ ...snippet, _score: 2000 });
	return ranked
		.sort((a, b) => (b._score - a._score) || a.identifier.localeCompare(b.identifier))
		.slice(0, Math.max(1, Number(limit) || 40))
		.map(({ _score, ...entry }) => entry);
}

function addDocumentRollData(entries, root, document, source, preferredKey) {
	if (!document?.getRollData) return;
	const rollData = document.getRollData() ?? {};
	const data = preferredKey && rollData?.[preferredKey] ? rollData[preferredKey] : rollData;
	walkData(entries, root, data, source);
}

function addCuratedEntries(entries) {
	for (const path of CURATED_AC5E_PATHS) addEntry(entries, path, 'AC5E runtime context');
}

function addConfigConstantEntries(entries) {
	const dnd5e = CONFIG?.DND5E ?? {};
	for (const key of CONFIG_BOOLEAN_MAP_KEYS) {
		const mapValue = dnd5e?.[key];
		if (!mapValue || typeof mapValue !== 'object') continue;
		addEntry(entries, key, 'DND5E config');
		for (const entryKey of Object.keys(mapValue)) {
			if (!isSafePathKey(entryKey)) continue;
			addEntry(entries, `${key}.${entryKey}`, 'DND5E config');
		}
	}
}

function addKnownValueLiteralEntries(entries) {
	for (const actorType of getActorTypeKeys()) addLiteralEntry(entries, actorType, 'DND5E actor type');
	for (const creatureType of Object.keys(CONFIG?.DND5E?.creatureTypes ?? {})) addLiteralEntry(entries, creatureType, 'DND5E creature type');
}

function scoreAutocompleteEntry(identifier, normalizedPrefix) {
	const source = identifier.toLowerCase();
	if (source === normalizedPrefix) return 1200;
	if (source.startsWith(normalizedPrefix)) return 1000 - source.length;
	if (source.includes(`.${normalizedPrefix}`)) return 700 - source.length;
	if (source.includes(normalizedPrefix)) return 350 - source.length;
	let index = 0;
	let score = 120;
	for (const char of normalizedPrefix) {
		index = source.indexOf(char, index);
		if (index < 0) return -1;
		index += 1;
		score += 1;
	}
	return score;
}

function buildContextualEnumSnippets(inputValue, cursor) {
	const context = `${inputValue ?? ''}`.slice(0, Math.max(0, Number(cursor) || 0));
	const match = context.match(/(rollingActor|opponentActor|effectActor|nonEffectActor|auraActor)\.(type|creatureType)\s*(?:[!=]==?)?\s*$/i);
	if (!match) return [];
	const path = `${match[1]}.${match[2]}`;
	return [
		{
			identifier: `['valueA', 'valueB'].includes(${path})`,
			label: `['valueA', 'valueB'].includes(${path}) - AC5E helper`,
		},
		{
			identifier: `(${path} ?? []).some((entry) => ['valueA', 'valueB'].includes(entry))`,
			label: `(${path} ?? []).some(...) - AC5E helper`,
		},
	];
}

function getActorTypeKeys() {
	const fromSystem = Array.isArray(game?.system?.documentTypes?.Actor) ? game.system.documentTypes.Actor : [];
	const fromConfig = Object.keys(CONFIG?.Actor?.typeLabels ?? {});
	return dedupe([...fromSystem, ...fromConfig].map((value) => `${value ?? ''}`.trim()).filter(Boolean));
}

function addLiteralEntry(entries, value, source) {
	const normalized = `${value ?? ''}`.trim();
	if (!normalized) return;
	const literal = `'${normalized.replaceAll("'", "\\'")}'`;
	addEntry(entries, literal, source);
}

function addCollectedSchemaEntries(entries) {
	const collected = getCollectedPathsByRoot();
	for (const root of ROOT_PATHS) {
		addEntry(entries, root, 'Collected roll data');
		const paths = collected[root] ?? [];
		for (const path of paths) addEntry(entries, path, 'Collected roll data');
	}
}

function getCollectedPathsByRoot() {
	if (collectedPathCache) return collectedPathCache;
	const pathsByRoot = buildBaseCollectedPathsByRoot();
	collectedPathCache = materializeCollectedPathsByRoot(pathsByRoot);
	if (!seedCollectionStarted) {
		seedCollectionStarted = true;
		void collectFromSeedActorUuids(pathsByRoot);
	}
	return collectedPathCache;
}

function buildBaseCollectedPathsByRoot() {
	const pathsByRoot = Object.fromEntries(ROOT_PATHS.map((root) => [root, new Set([root])]));
	collectAc5eRuntimeAdditions(pathsByRoot);
	return pathsByRoot;
}

function materializeCollectedPathsByRoot(pathsByRoot) {
	return Object.fromEntries(Object.entries(pathsByRoot).map(([root, paths]) => [root, sanitizeCollectedPaths(root, Array.from(paths)).sort()]));
}

async function collectFromSeedActorUuids(pathsByRoot) {
	const seededActors = await getSeedActorsFromUuids();
	for (const actor of seededActors) {
		collectActorRoots(pathsByRoot, actor);
		collectRepresentativeItemsAndActivities(pathsByRoot, actor);
	}
	collectedPathCache = materializeCollectedPathsByRoot(pathsByRoot);
	logSeedCoverage(seededActors, collectedPathCache);
}

async function getSeedActorsFromUuids() {
	const actors = [];
	for (const uuid of DND5E_SEED_ACTOR_UUIDS) {
		try {
			const actor = await fromUuid?.(uuid);
			if (actor instanceof CONFIG.Actor.documentClass) actors.push(actor);
		} catch (_error) {}
	}
	return dedupeByUuid(actors);
}

function dedupeByUuid(documents) {
	const unique = [];
	const seen = new Set();
	for (const document of documents ?? []) {
		const uuid = document?.uuid ?? '';
		if (!uuid || seen.has(uuid)) continue;
		seen.add(uuid);
		unique.push(document);
	}
	return unique;
}

function collectActorRoots(pathsByRoot, actor) {
	const ac5eRollData = _ac5eActorRollData(null, null, actor, true);
	if (!ac5eRollData || typeof ac5eRollData !== 'object') return;
	walkDataIntoSet(pathsByRoot.rollingActor, 'rollingActor', ac5eRollData);
	walkDataIntoSet(pathsByRoot.opponentActor, 'opponentActor', ac5eRollData);
	walkDataIntoSet(pathsByRoot.effectActor, 'effectActor', ac5eRollData);
	walkDataIntoSet(pathsByRoot.nonEffectActor, 'nonEffectActor', ac5eRollData);
	walkDataIntoSet(pathsByRoot.auraActor, 'auraActor', ac5eRollData);
	walkDataIntoSet(pathsByRoot.effectOriginActor, 'effectOriginActor', ac5eRollData);
}

function collectRepresentativeItemsAndActivities(pathsByRoot, actor) {
	const representativeItems = getRepresentativeItemsFromActor(actor);
	let itemRollData;
	for (const item of representativeItems) {
		const rollData = collectActivityRollDataFromItem(pathsByRoot, item);
		if (!rollData || typeof rollData !== 'object') continue;
		const itemData = rollData?.item;
		itemRollData ??= itemData;
		walkDataIntoSet(pathsByRoot.item, 'item', itemData);
		walkDataIntoSet(pathsByRoot.originItem, 'originItem', itemData);
	}
}

function getRepresentativeItemsFromActor(actor) {
	return dedupeByUuid(Array.from(actor?.items ?? []));
}

function collectActivityRollDataFromItem(pathsByRoot, item) {
	const activities = item?.system?.activities;
	if (!activities) return;
	let values = [];
	if (typeof activities?.getByType === 'function') {
		for (const type of ACTIVITY_TYPES_TO_COLLECT) {
			const typed = activities.getByType(type);
			if (typed) values.push(...typed);
		}
	}
	if (!values.length) values = typeof activities?.values === 'function' ? Array.from(activities.values()) : Object.values(activities ?? {});
	values = dedupeByUuid(values);
	let rollData;
	for (const activity of values) {
		rollData ??= activity?.getRollData?.();
		if (!rollData || typeof rollData !== 'object') continue;
		const activityData = rollData?.activity;
		walkDataIntoSet(pathsByRoot.activity, 'activity', activityData);
		walkDataIntoSet(pathsByRoot.originActivity, 'originActivity', activityData);
	}
	return rollData;
}

function logSeedCoverage(actors, collectedPathsByRoot = null) {
	if (!CONFIG?.debug?.ac5e) return;
	if (hasLoggedSeedCoverage) return;
	hasLoggedSeedCoverage = true;
	const loadedActors = actors ?? [];
	const representativeItemTypes = new Set();
	const representativeExamples = {};
	const activityTypesFound = new Set();
	const activityHits = Object.fromEntries(ACTIVITY_TYPES_TO_COLLECT.map((type) => [type, 0]));
	for (const actor of loadedActors) {
		for (const [type, bucket] of Object.entries(actor?.itemTypes ?? {})) {
			if (!Array.isArray(bucket) || !bucket.length) continue;
			representativeItemTypes.add(type);
			if (!representativeExamples[type]) representativeExamples[type] = bucket[0]?.name ?? '';
		}
		for (const item of actor?.items ?? []) {
			const activities = item?.system?.activities;
			if (!activities) continue;
			if (typeof activities.getByType === 'function') {
				for (const type of ACTIVITY_TYPES_TO_COLLECT) {
					const typed = activities.getByType(type) ?? [];
					if (!typed.length) continue;
					activityTypesFound.add(type);
					activityHits[type] += typed.length;
				}
				continue;
			}
			const values = typeof activities?.values === 'function' ? Array.from(activities.values()) : Object.values(activities ?? {});
			for (const activity of values) {
				const type = `${activity?.type ?? ''}`.toLowerCase();
				if (!ACTIVITY_TYPES_TO_COLLECT.includes(type)) continue;
				activityTypesFound.add(type);
				activityHits[type] += 1;
			}
		}
	}
	const missingActivityTypes = ACTIVITY_TYPES_TO_COLLECT.filter((type) => !activityTypesFound.has(type));
	const pathCoverage = summarizeCollectedPathCoverage(collectedPathsByRoot);
	console.log('[AC5E seed coverage]', {
		actorsLoaded: loadedActors.map((actor) => `${actor?.name ?? ''} (${actor?.type ?? ''})`),
		representativeItemTypesCount: representativeItemTypes.size,
		representativeItemTypes: [...representativeItemTypes].sort(),
		representativeExamples,
		handledActivityTypes: [...ACTIVITY_TYPES_TO_COLLECT],
		activityTypesFound: [...activityTypesFound].sort(),
		missingActivityTypes,
		activityHits,
		pathCoverage,
	});
}

function collectAc5eRuntimeAdditions(pathsByRoot) {
	const actorArmorEntries = Array.from(foundry.utils.iterateKeys(CONFIG.DND5E.armorTypes)).map(e => {
		if (e === 'shield') return `has${e.capitalize()}`;
		return `has${e.capitalize()}Armor`
	});
	const additions = {
		rollingActor: [
			...AC5E_ACTOR_ROLLDATA_ADDED_FIELDS.map((field) => `rollingActor.${field}`),
			...AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS.map((field) => `rollingActor.${field}`),
			...actorArmorEntries.map((field) => `rollingActor.${field}`),
			'rollingActor.effects',
		],
		opponentActor: [
			...AC5E_ACTOR_ROLLDATA_ADDED_FIELDS.map((field) => `opponentActor.${field}`),
			...AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS.map((field) => `opponentActor.${field}`),
			...actorArmorEntries.map((field) => `opponentActor.${field}`),
			'opponentActor.opponentId',
			'opponentActor.effects',
		],
		auraActor: [
			...AC5E_ACTOR_ROLLDATA_ADDED_FIELDS.map((field) => `auraActor.${field}`),
			...AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS.map((field) => `auraActor.${field}`),
			...actorArmorEntries.map((field) => `auraActor.${field}`),
			'auraActor.effects',
		],
		effectActor: [
			...AC5E_ACTOR_ROLLDATA_ADDED_FIELDS.map((field) => `effectActor.${field}`),
			...AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS.map((field) => `effectActor.${field}`),
			...actorArmorEntries.map((field) => `effectActor.${field}`),
			'effectActor.effects',
		],
		nonEffectActor: [
			...AC5E_ACTOR_ROLLDATA_ADDED_FIELDS.map((field) => `nonEffectActor.${field}`),
			...AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS.map((field) => `nonEffectActor.${field}`),
			...actorArmorEntries.map((field) => `nonEffectActor.${field}`),
			'nonEffectActor.effects',
		],
		effectOriginActor: [
			...AC5E_ACTOR_ROLLDATA_ADDED_FIELDS.map((field) => `effectOriginActor.${field}`),
			...AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS.map((field) => `effectOriginActor.${field}`),
			...actorArmorEntries.map((field) => `effectOriginActor.${field}`),
			'effectOriginActor.effects',
		],
		item: ['item.itemUuid', 'item.itemType', 'item.itemProperties'],
		activity: ['activity.activityType', 'activity.identifier', 'activity.uuid', 'activity.damageTypes', 'activity.defaultDamageType', 'activity.healingTypes'],
		originActivity: ['originActivity.activityType', 'originActivity.identifier', 'originActivity.uuid', 'originActivity.damageTypes', 'originActivity.defaultDamageType', 'originActivity.healingTypes'],
	};
	for (const [root, paths] of Object.entries(additions)) {
		const set = pathsByRoot[root];
		if (!(set instanceof Set)) continue;
		for (const path of paths) set.add(path);
	}
}

function walkDataIntoSet(targetSet, root, value, depth = 0, seen = new WeakSet()) {
	if (!(targetSet instanceof Set) || !root) return;
	if (depth > 7 || !value || typeof value !== 'object') return;
	if (seen.has(value)) return;
	seen.add(value);
	targetSet.add(root);

	if (Array.isArray(value)) {
		if (value.length) walkDataIntoSet(targetSet, `${root}.0`, value[0], depth + 1, seen);
		return;
	}
	if (!isWalkable(value)) return;
	for (const key of Object.keys(value)) {
		if (!isSafePathKey(key)) continue;
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor) continue;
		const path = `${root}.${key}`;
		if (path === `${root}.system` || path.includes('.system.')) continue;
		targetSet.add(path);
		if (!Object.hasOwn(descriptor, 'value')) continue;
		const child = descriptor.value;
		if (child && typeof child === 'object') walkDataIntoSet(targetSet, path, child, depth + 1, seen);
	}
}

function walkData(entries, root, value, source, depth = 0, seen = new WeakSet()) {
	if (depth > 7 || !value || typeof value !== 'object') return;
	if (seen.has(value)) return;
	seen.add(value);
	addEntry(entries, root, source);

	if (Array.isArray(value)) {
		if (value.length) walkData(entries, `${root}.0`, value[0], source, depth + 1, seen);
		return;
	}

	if (!isWalkable(value)) return;
	for (const key of Object.keys(value)) {
		if (!isSafePathKey(key)) continue;
		const descriptor = Object.getOwnPropertyDescriptor(value, key);
		if (!descriptor) continue;
		const path = `${root}.${key}`;
		addEntry(entries, path, source);
		if (!Object.hasOwn(descriptor, 'value')) continue;
		const child = descriptor.value;
		if (child && typeof child === 'object') walkData(entries, path, child, source, depth + 1, seen);
	}
}

function addEntry(entries, identifier, source) {
	if (!identifier || entries.has(identifier)) return;
	const suffix = isAc5eOwnedSource(source) ? ` - ${source}` : '';
	entries.set(identifier, {
		identifier,
		label: `${identifier}${suffix}`,
		source: `${source ?? ''}`,
	});
}

function isAc5eOwnedSource(source) {
	if (typeof source !== 'string') return false;
	return source.toLowerCase().includes('ac5e');
}

function isWalkable(value) {
	if (!foundry.utils.isPlainObject(value) && !Array.isArray(value)) return false;
	if (value instanceof Set || value instanceof Map) return false;
	const DocumentClass = foundry.abstract?.Document;
	const DataModelClass = foundry.abstract?.DataModel;
	if (DocumentClass && value instanceof DocumentClass) return false;
	if (DataModelClass && value instanceof DataModelClass) return false;
	return true;
}

function isSafePathKey(key) {
	return /^[A-Za-z_$][\w$]*$/.test(key) || /^\d+$/.test(key);
}

function dedupe(values) {
	return Array.from(new Set(values));
}

function sanitizeCollectedPaths(root, paths) {
	if (!Array.isArray(paths) || !paths.length) return [];
	const nestedEnumBases = [
		'itemProperties',
		'originItemProperties',
		'damageTypes',
		'defaultDamageType',
		'actionType',
		'attackMode',
		'mastery',
		'itemType',
		'activityType',
	];
	const forbiddenPrefixes = nestedEnumBases.map((base) => `${root}.${base}.`);
	return paths.filter((path) => {
		if (typeof path !== 'string' || !path) return false;
		if (path === root) return true;
		for (const prefix of forbiddenPrefixes) {
			if (path.startsWith(prefix)) return false;
		}
		return true;
	});
}

function summarizeCollectedPathCoverage(collectedPathsByRoot) {
	const roots = ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor', 'item', 'originItem', 'activity', 'originActivity'];
	if (!collectedPathsByRoot || typeof collectedPathsByRoot !== 'object') {
		return { roots, counts: {}, samples: {} };
	}
	const counts = {};
	const samples = {};
	for (const root of roots) {
		const paths = Array.isArray(collectedPathsByRoot[root]) ? collectedPathsByRoot[root] : [];
		counts[root] = paths.length;
		samples[root] = paths.slice(0, 12);
	}
	return { roots, counts, samples };
}

function getActorDocument(document) {
	if (document instanceof CONFIG.Actor.documentClass) return document;
	if (document?.actor instanceof CONFIG.Actor.documentClass) return document.actor;
	return null;
}

function getItemParent(effect) {
	if (effect?.parent instanceof CONFIG.Item.documentClass) return effect.parent;
	const origin = _resolveEffectOriginContext(effect, { relative: effect?.parent ?? effect?.target });
	return origin.originItem ?? null;
}

export function isAc5eChangeKey(changeKey) {
	const normalized = `${changeKey ?? ''}`.trim().toLowerCase();
	return normalized.startsWith('flags.ac5e.') || normalized.startsWith(`flags.${Constants.MODULE_ID}.`);
}

export function shouldTriggerAc5eKeyAutocomplete(changeKey) {
	if (typeof changeKey !== 'string') return false;
	const normalized = changeKey.trim().toLowerCase();
	if (!normalized) return false;
	if (isAc5eChangeKey(normalized)) return true;
	return AC5E_AUTOCOMPLETE_TRIGGER_PREFIXES.some((trigger) => normalized.includes(trigger));
}

export function isAc5eAutocompleteDebugEnabled(scope = 'editor') {
	const normalized = `${scope ?? ''}`.trim().toLowerCase();
	const ac5e = globalThis?.[Constants.MODULE_NAME_SHORT];
	const value = normalized === 'effectkeys'
		? foundry.utils.getProperty(ac5e, 'debug.autocompletion.effectKeys')
		: foundry.utils.getProperty(ac5e, 'debug.autocompletion.editor');
	return value === true;
}
