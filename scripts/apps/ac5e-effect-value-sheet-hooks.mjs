import { AC5EEffectValueEditor } from './ac5e-effect-value-editor.mjs';
import { isAc5eChangeKey } from './ac5e-effect-value-autocomplete.mjs';
import Settings from '../ac5e-settings.mjs';

export function registerEffectValueEditorHooks() {
	return Hooks.on('renderActiveEffectConfig', injectEffectValueEditorButtons);
}

function injectEffectValueEditorButtons(app, element) {
	if (!new Settings().enableExperimentalAc5eUi) return;
	const root = normalizeElement(element);
	if (!root) return;

	for (const valueInput of root.querySelectorAll('input[name$=".value"], textarea[name$=".value"]')) {
		const row = valueInput.closest('li, .form-group, tr, fieldset') ?? valueInput.parentElement;
		if (!row || row.querySelector('.ac5e-effect-value-editor-button')) continue;
		const keyInput = findKeyInput(row, valueInput);
		if (!keyInput || !isAc5eChangeKey(keyInput.value)) continue;
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

function ensureValueEditorWrapper(valueInput) {
	if (valueInput.parentElement?.classList.contains('ac5e-effect-value-editor-control')) return valueInput.parentElement;
	const wrapper = document.createElement('div');
	wrapper.className = 'ac5e-effect-value-editor-control';
	valueInput.insertAdjacentElement('beforebegin', wrapper);
	wrapper.append(valueInput);
	return wrapper;
}

function findKeyInput(row, valueInput) {
	const keyName = valueInput.name.replace(/\.value$/, '.key');
	const escapedKeyName = globalThis.CSS?.escape?.(keyName) ?? keyName.replaceAll('"', '\\"');
	return row.querySelector('input[name$=".key"], textarea[name$=".key"]') ?? valueInput.ownerDocument.querySelector(`[name="${escapedKeyName}"]`);
}

function getChangeIndex(row, valueInput) {
	const rowIndex = Number(row?.dataset?.index);
	if (Number.isInteger(rowIndex)) return rowIndex;
	const match = valueInput.name.match(/(?:^|\.)changes\.(\d+)\.value$/);
	return match ? Number(match[1]) : null;
}

function normalizeElement(element) {
	if (element instanceof HTMLElement) return element;
	if (element?.[0] instanceof HTMLElement) return element[0];
	return null;
}
