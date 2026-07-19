import { AC5EEffectValueEditor } from './ac5e-effect-value-editor.mjs';
import { buildEffectKeyAutocompleteEntries, configureAc5eAutocompleteMenu, getAutocompletePrefix, isAc5eAutocompleteDebugEnabled, isAc5eChangeKey, normalizeEffectKeyAutocompletePrefix, shouldTriggerAc5eKeyAutocomplete } from './ac5e-effect-value-autocomplete.mjs';
import { registerAc5eActiveEffectChangeType } from '../ac5e-active-effect-change-type.mjs';
import Constants from '../ac5e-constants.mjs';
import Settings from '../ac5e-settings.mjs';

export function registerEffectValueEditorHooks() {
	return Hooks.on('renderActiveEffectConfig', enhanceActiveEffectConfig);
}

function enhanceActiveEffectConfig(app, element) {
	const root = normalizeElement(element);
	if (!root) return;
	registerAc5eActiveEffectChangeType();
	ensureAc5eChangeTypeOptions(root);
	moveAc5eChangeTypeOptionsToBottom(root);
	restoreAc5eChangeTypeSelections(root);
	if (!isDaeActiveEffectSheet(app, root)) initializeKeyAutocomplete(app, root);
	initializeEditorButtonSync(app, root);
	if (!new Settings().enableAc5eUi) return;

	refreshEditorButtons(app, root);
}

function ensureAc5eChangeTypeOptions(root) {
	for (const select of root.querySelectorAll('select[name$=".type"]')) {
		if (select.querySelector(`option[value="${Constants.ACTIVE_EFFECT_CHANGE_TYPE}"]`)) continue;
		const option = document.createElement('option');
		option.value = Constants.ACTIVE_EFFECT_CHANGE_TYPE;
		option.textContent = game.i18n?.localize?.('AC5E.ActiveEffect.ChangeTypes.AC5E') ?? 'AC5E';
		select.append(option);
	}
}

function initializeKeyAutocomplete(app, root) {
	const Autocomplete = foundry.applications?.ux?.Autocomplete?.implementation;
	if (!Autocomplete) return;

	for (const keyInput of root.querySelectorAll('input[name$=".key"], textarea[name$=".key"]')) {
		if (keyInput.dataset.ac5eKeyAutocompleteReady) continue;
		keyInput.dataset.ac5eKeyAutocompleteReady = 'true';
		const row = keyInput.closest('li, .form-group, tr, fieldset') ?? keyInput.parentElement;
		const autocomplete = new Autocomplete({
			onSelect: (identifier, _label, { prefix } = {}) => {
				void prefix;
				keyInput.blur();
				keyInput.value = identifier;
				keyInput.dispatchEvent(new Event('input', { bubbles: true }));
				keyInput.dispatchEvent(new Event('change', { bubbles: true }));
				refreshEditorButtons(app, root);
			},
		});
		const activateAutocomplete = () => {
			if (!isAc5eChangeRow(row, keyInput) && !shouldTriggerAc5eKeyAutocomplete(keyInput.value)) {
				if (isAc5eAutocompleteDebugEnabled('effectKeys')) {
					console.debug('AC5E | autocomplete.effectKeys | dismiss (trigger=false)', { value: keyInput.value ?? '' });
				}
				autocomplete.dismiss();
				return;
			}
			const prefix = getAutocompletePrefix(keyInput);
			const normalizedPrefix = normalizeEffectKeyAutocompletePrefix(prefix).toLowerCase();
			const entries = buildEffectKeyAutocompleteEntries(keyInput.value);
			const filteredEntries = prefix
				? entries.filter((entry) => entry.identifier.toLowerCase().includes(normalizedPrefix)).slice(0, 40)
				: entries.slice(0, 40);
			if (!filteredEntries.length) {
				if (isAc5eAutocompleteDebugEnabled('effectKeys')) {
					console.debug('AC5E | autocomplete.effectKeys | dismiss (no entries)', { prefix, value: keyInput.value ?? '' });
				}
				autocomplete.dismiss();
				return;
			}
			if (isAc5eAutocompleteDebugEnabled('effectKeys')) {
				console.debug('AC5E | autocomplete.effectKeys | activate', {
					prefix,
					value: keyInput.value ?? '',
					candidates: filteredEntries.length,
				});
			}
			autocomplete.activate(keyInput, filteredEntries, { prefix });
			configureAc5eAutocompleteMenu(autocomplete);
		};
		keyInput.addEventListener('focus', activateAutocomplete);
		keyInput.addEventListener('input', activateAutocomplete);
		keyInput.addEventListener('blur', () => window.setTimeout(() => autocomplete.dismiss(), 100));
		app.addEventListener?.('close', () => autocomplete.dismiss(), { once: true });
	}
}

function initializeEditorButtonSync(app, root) {
	for (const input of root.querySelectorAll('input[name$=".key"], textarea[name$=".key"], select[name$=".type"]')) {
		if (input.dataset.ac5eEditorButtonSyncReady) continue;
		input.dataset.ac5eEditorButtonSyncReady = 'true';
		const refresh = () => refreshEditorButtons(app, root);
		input.addEventListener('input', refresh);
		input.addEventListener('change', refresh);
	}
}

function refreshEditorButtons(app, root) {
	for (const valueInput of root.querySelectorAll('input[name$=".value"], textarea[name$=".value"]')) {
		const row = valueInput.closest('li, .form-group, tr, fieldset') ?? valueInput.parentElement;
		if (!row) continue;
		const keyInput = findKeyInput(row, valueInput);
		if (!keyInput) continue;
		const existingButton = row.querySelector('.ac5e-effect-value-editor-button');
		if (!new Settings().enableAc5eUi || (!isAc5eChangeRow(row, valueInput) && !isAc5eChangeKey(keyInput.value))) {
			existingButton?.remove();
			cleanupValueEditorWrapper(valueInput);
			continue;
		}
		if (existingButton) continue;
		addEditorButton({ app, row, keyInput, valueInput });
	}
}

function addEditorButton({ app, row, keyInput, valueInput }) {
	const wrapper = ensureValueEditorWrapper(valueInput);
	const button = document.createElement('button');
	button.type = 'button';
	button.className = 'ac5e-effect-value-editor-button icon fa-solid fa-wand-magic-sparkles';
	button.dataset.tooltip = 'AC5E Effect Value Editor';
	button.setAttribute('aria-label', 'AC5E Effect Value Editor');
	button.addEventListener('click', (event) => {
		event.preventDefault();
		AC5EEffectValueEditor.open({
			activeEffectSheet: app,
			effect: app.document,
			changeIndex: getChangeIndex(row, valueInput),
			keyInput,
			valueInput,
		});
	});
	wrapper.append(button);
}

function cleanupValueEditorWrapper(valueInput) {
	const wrapper = valueInput.parentElement;
	if (!wrapper?.classList.contains('ac5e-effect-value-editor-control')) return;
	if (wrapper.querySelector('.ac5e-effect-value-editor-button')) return;
	wrapper.replaceWith(valueInput);
}

function ensureValueEditorWrapper(valueInput) {
	if (valueInput.parentElement?.classList.contains('ac5e-effect-value-editor-control')) return valueInput.parentElement;
	const wrapper = document.createElement('div');
	wrapper.className = 'ac5e-effect-value-editor-control';
	valueInput.insertAdjacentElement('beforebegin', wrapper);
	wrapper.append(valueInput);
	return wrapper;
}

function findKeyInput(row, valueInput) {
	const keyName = valueInput.name.replace(/\.(?:type|value)$/, '.key');
	const escapedKeyName = globalThis.CSS?.escape?.(keyName) ?? keyName.replaceAll('"', '\\"');
	return row?.querySelector(`[name="${escapedKeyName}"]`) ?? valueInput.ownerDocument.querySelector(`[name="${escapedKeyName}"]`) ?? row?.querySelector('input[name$=".key"], textarea[name$=".key"]');
}

function findTypeInput(row, input) {
	const typeName = input.name.replace(/\.(?:key|value)$/, '.type');
	const escapedTypeName = globalThis.CSS?.escape?.(typeName) ?? typeName.replaceAll('"', '\\"');
	return row?.querySelector(`[name="${escapedTypeName}"]`) ?? input.ownerDocument.querySelector(`[name="${escapedTypeName}"]`) ?? row?.querySelector('select[name$=".type"], input[name$=".type"]');
}

function isAc5eChangeRow(row, input) {
	const typeInput = findTypeInput(row, input);
	return `${typeInput?.value ?? ''}`.trim().toLowerCase() === Constants.ACTIVE_EFFECT_CHANGE_TYPE;
}

function moveAc5eChangeTypeOptionsToBottom(root) {
	for (const select of root.querySelectorAll('select[name$=".type"]')) {
		const option = select.querySelector(`option[value="${Constants.ACTIVE_EFFECT_CHANGE_TYPE}"]`);
		if (option) select.append(option);
	}
}

function restoreAc5eChangeTypeSelections(root) {
	for (const select of root.querySelectorAll('select[name$=".type"]')) {
		if (`${select.value ?? ''}`.trim().toLowerCase() !== 'custom') continue;
		const row = select.closest('li, .form-group, tr, fieldset') ?? select.parentElement;
		const keyInput = findKeyInput(row, select);
		if (!isAc5eChangeKey(keyInput?.value)) continue;
		select.value = Constants.ACTIVE_EFFECT_CHANGE_TYPE;
	}
}

function isDaeActiveEffectSheet(app, root) {
	return app?.constructor?.name === 'DAEActiveEffectConfig' || root?.classList?.contains('dae') || !!root?.querySelector?.('.dae-key-input');
}

function getChangeIndex(row, input) {
	const rowIndex = Number(row?.dataset?.index);
	if (Number.isInteger(rowIndex)) return rowIndex;
	const match = input.name.match(/(?:^|\.)changes\.(\d+)\.(?:key|type|value)$/);
	if (match) return Number(match[1]);
	const rows = Array.from(row?.parentElement?.children ?? []).filter((element) => element.querySelector?.('input[name$=".value"], textarea[name$=".value"]'));
	const index = rows.indexOf(row);
	return index >= 0 ? index : null;
}

function normalizeElement(element) {
	if (element instanceof HTMLElement) return element;
	if (element?.[0] instanceof HTMLElement) return element[0];
	return null;
}
