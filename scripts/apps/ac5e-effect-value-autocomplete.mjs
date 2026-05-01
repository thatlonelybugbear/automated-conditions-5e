import Constants from '../ac5e-constants.mjs';
import { _generateAC5eFlags, _resolveEffectOriginContext } from '../ac5e-helpers.mjs';

const CURATED_AC5E_PATHS = [
	'rollingActor',
	'opponentActor',
	'targetActor',
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

export function buildEffectValueAutocompleteEntries(effect) {
	const entries = new Map();
	const origin = _resolveEffectOriginContext(effect, { relative: effect?.parent ?? effect?.target });

	addDocumentRollData(entries, 'rollingActor', getActorDocument(effect?.target ?? effect?.parent), 'Actor roll data');
	addDocumentRollData(entries, 'item', getItemParent(effect), 'Item roll data', 'item');
	addDocumentRollData(entries, 'activity', origin.originActivity, 'Activity roll data', 'activity');
	addDocumentRollData(entries, 'originItem', origin.originItem, 'Origin item roll data', 'item');
	addDocumentRollData(entries, 'originActivity', origin.originActivity, 'Origin activity roll data', 'activity');
	addCuratedEntries(entries);

	return Array.from(entries.values()).sort((a, b) => a.identifier.localeCompare(b.identifier));
}

export function buildEffectKeyAutocompleteEntries(currentKey) {
	const entries = new Map();
	for (const key of _generateAC5eFlags()) addEntry(entries, key, 'AC5E flag');
	if (isAc5eChangeKey(currentKey)) addEntry(entries, currentKey, 'Current key');
	return Array.from(entries.values()).sort((a, b) => a.identifier.localeCompare(b.identifier));
}

export function getAutocompletePrefix(input) {
	const cursor = input.selectionStart ?? input.value.length;
	const beforeCursor = input.value.slice(0, cursor);
	return beforeCursor.match(/[A-Za-z_$][\w$]*(?:\.(?:[A-Za-z_$][\w$]*|\d+))*\.?$/)?.[0] ?? '';
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

function addDocumentRollData(entries, root, document, source, preferredKey) {
	if (!document?.getRollData) return;
	const rollData = document.getRollData() ?? {};
	const data = preferredKey && rollData?.[preferredKey] ? rollData[preferredKey] : rollData;
	walkData(entries, root, data, source);
}

function addCuratedEntries(entries) {
	for (const path of CURATED_AC5E_PATHS) addEntry(entries, path, 'AC5E runtime context');
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
	entries.set(identifier, {
		identifier,
		label: `${identifier} - ${source}`,
	});
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
	const normalized = String(changeKey ?? '').trim().toLowerCase();
	return normalized.startsWith('flags.ac5e.') || normalized.startsWith(`flags.${Constants.MODULE_ID}.`);
}
