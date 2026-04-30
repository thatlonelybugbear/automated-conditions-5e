import { buildEffectValueAutocompleteEntries, getAutocompletePrefix, replaceAutocompletePrefix } from './ac5e-effect-value-autocomplete.mjs';
import { collectAc5eEffectValueFormData, mergeAc5eEffectValueFormData, parseAc5eEffectValue, serializeAc5eEffectValue } from './ac5e-effect-value-parser.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const COMMON_TOGGLE_FIELDS = ['optin', 'once', 'oncePerTurn', 'oncePerRound', 'oncePerCombat', 'itemLimited'];
const AURA_TOGGLE_FIELDS = ['allies', 'enemies', 'includeSelf', 'singleAura', 'wallsBlock'];
const CONDITIONAL_TOGGLE_FIELDS = ['partialConsume'];
const OPTIONAL_FIELD_NAMES = ['name', 'description', 'usesCount'];
const CADENCE_TOGGLE_FIELDS = ['once', 'oncePerTurn', 'oncePerRound', 'oncePerCombat'];

export class AC5EEffectValueEditor extends HandlebarsApplicationMixin(ApplicationV2) {
	static openEditors = new Map();

	static DEFAULT_OPTIONS = {
		id: 'ac5e-effect-value-editor-{id}',
		classes: ['ac5e-effect-value-editor'],
		window: {
			title: 'AC5E Effect Value Editor',
			icon: 'fa-solid fa-wand-magic-sparkles',
			resizable: true,
		},
		actions: {
			apply: AC5EEffectValueEditor.#onApplyAction,
			applyClose: AC5EEffectValueEditor.#onApplyCloseAction,
			cancel: AC5EEffectValueEditor.#onCancelAction,
		},
		position: {
			width: 680,
			height: 'auto',
		},
		form: {
			closeOnSubmit: false,
			submitOnChange: false,
		},
	};

	static PARTS = {
		form: {
			template: 'modules/automated-conditions-5e/templates/apps/ac5e-effect-value-editor.hbs',
			root: true,
		},
	};

	constructor({ activeEffectSheet, effect, changeIndex, keyInput, valueInput } = {}, options = {}) {
		super(options);
		this.activeEffectSheet = activeEffectSheet;
		this.effect = effect;
		this.changeIndex = changeIndex;
		this.keyInput = keyInput;
		this.valueInput = valueInput;
		this.keyInputName = keyInput?.name;
		this.valueInputName = valueInput?.name;
		this.draftKey = keyInput?.value ?? '';
		this.draftData = null;
		this.uiState = null;
		this.instanceKey = buildEditorInstanceKey(effect, changeIndex);
		this.autocompleteEntries = buildEffectValueAutocompleteEntries(effect);
		const Autocomplete = foundry.applications.ux.Autocomplete.implementation;
		this.autocomplete = new Autocomplete({
			onSelect: (identifier, _label, { prefix } = {}) => {
				const input = this.activeAutocompleteInput;
				if (!input) return;
				replaceAutocompletePrefix(input, prefix ?? '', identifier);
				input.focus();
			},
		});
	}

	static open(args = {}, options = {}) {
		const instanceKey = buildEditorInstanceKey(args?.effect, args?.changeIndex);
		const existing = instanceKey ? this.openEditors.get(instanceKey) : null;
		if (existing?.element?.isConnected) {
			existing.render({ force: true });
			existing.bringToFront?.();
			existing.focus?.();
			return existing;
		}
		const editor = new this(args, options);
		if (editor.instanceKey) this.openEditors.set(editor.instanceKey, editor);
		editor.render({ force: true });
		return editor;
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const changeKey = this.draftKey ?? this.keyInput?.value ?? '';
		const parsed = this.draftData ?? parseAc5eEffectValue(this.#getValueInput()?.value ?? '');
		const profile = getEditorProfile(changeKey, parsed);
		const setMode = profile.supportsSetMode && shouldUseSetMode(parsed);
		const optionalFieldState = resolveOptionalFieldState(parsed, this.uiState);
		const optionalFieldRows = buildRenderedOptionalFieldRows(parsed, this.id, optionalFieldState);
		const primaryLayout = buildPrimaryLayout(profile, parsed, this.id, {
			setMode,
			conditionsLabel: 'Condition',
		});
		return {
			...context,
			changeIndex: this.changeIndex,
			headerLabel: `${this.effect?.name ?? 'Effect'} (change index: ${this.changeIndex})`,
			changeKey,
			primaryLayout,
			toggleBehavior: [
				{
					name: 'ui.showCadence',
					label: 'Cadence',
					checked: optionalFieldState.cadence,
				},
				{
					name: 'ui.showName',
					label: 'Name',
					checked: optionalFieldState.name,
				},
				{
					name: 'ui.showDescription',
					label: 'Description',
					checked: optionalFieldState.description,
				},
				{
					name: 'ui.showUsesCount',
					label: 'Uses Count',
					checked: optionalFieldState.usesCount,
				},
				...profile.commonToggles.filter((name) => !CADENCE_TOGGLE_FIELDS.includes(name)).map((name) => ({
					name: `toggles.${name}`,
					label: labelForField(name),
					checked: Boolean(parsed.toggles[name]),
				})),
			],
			showCadence: optionalFieldState.cadence,
			cadenceOptions: buildCadenceOptions(resolveCadenceMode(parsed)),
			optionalFieldRows,
			hasOptionalFieldRows: hasOptionalFieldRows(optionalFieldRows),
			contextToggles: profile.contextToggles.map((name) => ({
				name,
				label: labelForField(name),
				checked: Boolean(parsed.toggles[name]),
			})),
			hasAuraBehavior: profile.isAura && profile.contextToggles.length > 0,
			hasContextToggles: profile.contextToggles.length > 0,
		};
	}

	async _onRender(context, options) {
		await super._onRender(context, options);
		this.#activateUiEnhancements(this.element);
	}

	async close(options) {
		if (this.instanceKey) AC5EEffectValueEditor.openEditors.delete(this.instanceKey);
		return super.close(options);
	}

	_attachPartListeners(partId, htmlElement, options) {
		super._attachPartListeners(partId, htmlElement, options);
		this.#activateUiEnhancements(htmlElement);
	}

	static #onApplyAction(event) {
		return this.#onApply(event, false);
	}

	static #onApplyCloseAction(event) {
		return this.#onApply(event, true);
	}

	static #onCancelAction(event) {
		event.preventDefault();
		return this.close();
	}

	#activateUiEnhancements(htmlElement) {
		for (const input of htmlElement?.querySelectorAll('[data-ac5e-condition-input]:not([data-ac5e-autocomplete-ready])') ?? []) {
			input.dataset.ac5eAutocompleteReady = 'true';
			input.addEventListener('input', (event) => this.#onConditionInput(event));
			input.addEventListener('keyup', (event) => this.#onConditionInput(event));
		}
		for (const button of htmlElement?.querySelectorAll('[data-ac5e-expand-input]:not([data-ac5e-expand-ready])') ?? []) {
			button.dataset.ac5eExpandReady = 'true';
			button.addEventListener('click', (event) => void this.#onExpandInput(event));
		}
		for (const input of htmlElement?.querySelectorAll('[name^="ui.show"]:not([data-ac5e-ui-toggle-ready])') ?? []) {
			input.dataset.ac5eUiToggleReady = 'true';
			input.addEventListener('change', (event) => void this.#onUiToggleChange(event));
		}
	}

	async #onApply(event, close) {
		event.preventDefault();
		const form = this.#getFormDataRoot(event);
		const valueInput = this.#getValueInput();
		if (!form || !valueInput) {
			return;
		}
		const changeKey = this.draftKey ?? this.#getKeyInput()?.value ?? '';
		const baseData = this.draftData ?? parseAc5eEffectValue(valueInput.value ?? '');
		const profile = getEditorProfile(changeKey, baseData);
		const formData = collectAc5eEffectValueFormData(form);
		const setMode = profile.supportsSetMode && hasCheckedInput(form, 'ui.setMode');
		const showCadence = hasCheckedInput(form, 'ui.showCadence');
		const showName = hasCheckedInput(form, 'ui.showName');
		const showDescription = hasCheckedInput(form, 'ui.showDescription');
		const showUsesCount = hasCheckedInput(form, 'ui.showUsesCount');
		const cadenceMode = showCadence ? getSelectValue(form, 'ui.cadenceMode') : '';
		if (profile.supportsSetMode) {
			formData.fields.bonus = setMode ? '' : formData.fields.bonus;
			formData.fields.set = setMode ? formData.fields.bonus : '';
		}
		const mergedData = mergeAc5eEffectValueFormData(baseData, formData, {
			fieldNames: [...getPersistedFieldNames(profile)],
			toggleNames: [...profile.commonToggles, ...profile.contextToggles],
		});
		if (!showName) mergedData.fields.name = '';
		if (!showDescription) mergedData.fields.description = '';
		if (!showUsesCount) mergedData.fields.usesCount = '';
		if (!String(mergedData.fields.usesCount ?? '').trim()) mergedData.toggles.partialConsume = false;
		applyCadenceMode(mergedData, cadenceMode);
		if (profile.supportsSetMode) {
			mergedData.fields.bonus = setMode ? '' : mergedData.fields.bonus;
			mergedData.fields.set = setMode ? mergedData.fields.set : '';
		}
		const value = serializeAc5eEffectValue(mergedData);
		valueInput.value = value;
		valueInput.dispatchEvent(new Event('input', { bubbles: true }));
		valueInput.dispatchEvent(new Event('change', { bubbles: true }));
		this.draftKey = changeKey;
		this.draftData = mergedData;
		await this.#submitActiveEffectSheet({ changeKey, value });
		if (close) this.close();
	}

	async #submitActiveEffectSheet({ changeKey, value } = {}) {
		const sheet = this.activeEffectSheet;
		const updateData = this.#getChangeUpdateData({ changeKey, value });
		try {
			if (typeof sheet?.submit === 'function') {
				if (typeof sheet.options?.form?.handler === 'function') {
					await sheet.submit({ updateData, operation: { render: false } });
				} else {
					await sheet.submit({ updateData, preventClose: true, preventRender: true });
				}
			}
		} catch (err) {
			console.warn('AC5E | Effect Value Editor | Failed to submit Active Effect sheet.', err);
		}
		await this.#ensureEffectChangeUpdated(updateData);
	}

	#getChangeUpdateData({ changeKey, value } = {}) {
		if (!Number.isInteger(this.changeIndex)) return {};
		return {
			system: {
				changes: {
					[this.changeIndex]: {
						key: changeKey,
						value,
					},
				},
			},
		};
	}

	async #ensureEffectChangeUpdated(updateData) {
		if (!Number.isInteger(this.changeIndex) || !this.effect?.update) return;
		const expectedChange = updateData?.system?.changes?.[this.changeIndex];
		if (!expectedChange) return;
		const currentChange = this.effect.system?.changes?.[this.changeIndex];
		if (currentChange?.key === expectedChange.key && currentChange?.value === expectedChange.value) return;
		await this.effect.update({
			[`system.changes.${this.changeIndex}.key`]: expectedChange.key,
			[`system.changes.${this.changeIndex}.value`]: expectedChange.value,
		}, { render: false });
	}

	#onConditionInput(event) {
		const input = event.currentTarget;
		this.activeAutocompleteInput = input;
		const prefix = getAutocompletePrefix(input);
		if (prefix.length < 2) {
			this.autocomplete.dismiss();
			return;
		}
		const entries = this.autocompleteEntries.filter((entry) => entry.identifier.toLowerCase().includes(prefix.toLowerCase())).slice(0, 40);
		if (!entries.length) {
			this.autocomplete.dismiss();
			return;
		}
		this.autocomplete.activate(input, entries, { prefix });
	}

	#filterAutocompleteEntries(entries, prefix, limit) {
		const normalized = String(prefix ?? '').toLowerCase();
		return entries.filter((entry) => entry.identifier.toLowerCase().includes(normalized)).slice(0, limit);
	}

	async #onExpandInput(event) {
		event.preventDefault();
		const button = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		const inputName = button?.dataset?.ac5eExpandInput ?? '';
		if (!inputName) return;
		const form = this.#getFormDataRoot(event);
		const input = form?.querySelector?.(`[name="${globalThis.CSS?.escape?.(inputName) ?? inputName.replaceAll('"', '\\"')}"]`);
		if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
		const label = button?.dataset?.ac5eExpandLabel ?? inputName;
		const currentValue = input.value ?? '';
		const escapedLabel = escapeHtml(label);
		const escapedValue = escapeHtml(currentValue);
		try {
			const result = await foundry.applications.api.DialogV2.wait({
				window: {
					title: `Edit ${label}`,
				},
				content: `
					<form class="ac5e-effect-value-expand-dialog">
						<div class="form-group stacked">
							<label for="ac5e-expand-value">${escapedLabel}</label>
							<div class="form-fields">
								<textarea id="ac5e-expand-value" name="value" rows="12">${escapedValue}</textarea>
							</div>
						</div>
					</form>
				`,
				buttons: [
					{
						action: 'apply',
						label: 'Apply',
						icon: 'fa-solid fa-check',
						default: true,
						callback: (_event, _button, dialog) => dialog.element.querySelector('textarea[name="value"]')?.value ?? currentValue,
					},
					{
						action: 'cancel',
						label: 'Cancel',
						icon: 'fa-solid fa-xmark',
					},
				],
				position: {
					width: 540,
				},
				render: (_event, dialog) => {
					const textarea = dialog.element.querySelector('textarea[name="value"]');
					if (!(textarea instanceof HTMLTextAreaElement)) return;
					textarea.focus();
					const cursor = textarea.value.length;
					textarea.setSelectionRange(cursor, cursor);
				},
			});
			if (typeof result !== 'string') return;
			input.value = result;
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		} catch (_err) {
			// Dialog dismissal intentionally leaves the source input unchanged.
		}
	}

	async #onUiToggleChange(event) {
		const form = this.#getFormDataRoot(event);
		if (!form) return;
		this.#captureDraftState(form);
		this.uiState = {
			cadence: hasCheckedInput(form, 'ui.showCadence'),
			name: hasCheckedInput(form, 'ui.showName'),
			description: hasCheckedInput(form, 'ui.showDescription'),
			usesCount: hasCheckedInput(form, 'ui.showUsesCount'),
		};
		await this.render({ force: true });
	}

	#captureDraftState(form) {
		const valueInput = this.#getValueInput();
		const changeKey = this.draftKey ?? this.#getKeyInput()?.value ?? '';
		const baseData = this.draftData ?? parseAc5eEffectValue(valueInput?.value ?? '');
		const profile = getEditorProfile(changeKey, baseData);
		const formData = collectAc5eEffectValueFormData(form);
		const setMode = profile.supportsSetMode && hasCheckedInput(form, 'ui.setMode');
		const showCadence = hasCheckedInput(form, 'ui.showCadence');
		const showName = hasCheckedInput(form, 'ui.showName');
		const showDescription = hasCheckedInput(form, 'ui.showDescription');
		const showUsesCount = hasCheckedInput(form, 'ui.showUsesCount');
		const cadenceMode = showCadence ? getSelectValue(form, 'ui.cadenceMode') : '';
		if (profile.supportsSetMode) {
			formData.fields.bonus = setMode ? '' : formData.fields.bonus;
			formData.fields.set = setMode ? formData.fields.bonus : '';
		}
		const mergedData = mergeAc5eEffectValueFormData(baseData, formData, {
			fieldNames: [...getPersistedFieldNames(profile)],
			toggleNames: [...profile.commonToggles, ...profile.contextToggles],
		});
		if (!showName) mergedData.fields.name = baseData.fields.name;
		if (!showDescription) mergedData.fields.description = baseData.fields.description;
		if (!showUsesCount) {
			mergedData.fields.usesCount = baseData.fields.usesCount;
			mergedData.toggles.partialConsume = baseData.toggles.partialConsume;
		}
		if (showCadence) applyCadenceMode(mergedData, cadenceMode);
		else {
			for (const toggle of CADENCE_TOGGLE_FIELDS) mergedData.toggles[toggle] = baseData.toggles[toggle];
		}
		if (profile.supportsSetMode) {
			mergedData.fields.bonus = setMode ? '' : mergedData.fields.bonus;
			mergedData.fields.set = setMode ? mergedData.fields.set : '';
		}
		this.draftData = mergedData;
	}

	#getFormDataRoot(event) {
		const eventTarget = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
		const eventRoot = eventTarget?.closest('[data-ac5e-effect-value-editor-form]');
		if (eventRoot) return eventRoot;
		if (this.element instanceof HTMLFormElement) return this.element;
		return this.element?.querySelector('form') ?? this.element ?? null;
	}

	#getKeyInput() {
		if (this.keyInput?.isConnected) return this.keyInput;
		this.keyInput = findInputByName(this.keyInputName);
		return this.keyInput;
	}

	#getValueInput() {
		if (this.valueInput?.isConnected) return this.valueInput;
		this.valueInput = findInputByName(this.valueInputName);
		return this.valueInput;
	}

}

function findInputByName(name) {
	if (!name) return null;
	const escapedName = globalThis.CSS?.escape?.(name) ?? name.replaceAll('"', '\\"');
	return document.querySelector(`input[name="${escapedName}"], textarea[name="${escapedName}"]`);
}

function labelForField(name) {
	return name.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function buildEditorInstanceKey(effect, changeIndex) {
	if (!effect?.uuid || !Number.isInteger(changeIndex)) return '';
	return `${effect.uuid}::${changeIndex}`;
}

function getEditorProfile(changeKey, parsed) {
	const normalized = String(changeKey ?? '').toLowerCase();
	const isAura = normalized.includes('.aura.');
	const isCriticalThreshold = normalized.endsWith('.criticalthreshold') || normalized.endsWith('.critthreshold');
	const isFumbleThreshold = normalized.endsWith('.fumblethreshold');
	const isModifier = normalized.endsWith('.modifier') || normalized.endsWith('.modifiers') || normalized.includes('.modifier.');
	const isTargetADC = normalized.endsWith('.modifyac') || normalized.endsWith('.modifydc');
	const isBonus =
		normalized.endsWith('.bonus') ||
		isTargetADC ||
		normalized.endsWith('.extradice') ||
		normalized.endsWith('.diceupgrade') ||
		normalized.endsWith('.dicedowngrade');
	const isRange = normalized.includes('.range');

	const requiredFields = [];
	const auraFields = [];
	if (isBonus) requiredFields.push('bonus');
	if (isTargetADC) requiredFields.push('set');
	if (isModifier) requiredFields.push('modifier');
	if (isCriticalThreshold || isFumbleThreshold) requiredFields.push('bonus', 'set');
	if (isRange) requiredFields.push('radius');
	if (isAura) auraFields.push('radius');
	if (isRange) requiredFields.push('bonus');
	if (hasParsedValue(parsed, 'chance')) requiredFields.push('chance');
	if (hasParsedValue(parsed, 'enforceMode')) requiredFields.push('enforceMode');
	if (hasParsedValue(parsed, 'addTo')) requiredFields.push('addTo');

	const contextToggles = [];
	if (isAura) contextToggles.push(...AURA_TOGGLE_FIELDS);
	for (const toggle of [...AURA_TOGGLE_FIELDS, ...CONDITIONAL_TOGGLE_FIELDS]) {
		if (parsed?.toggles?.[toggle] && !contextToggles.includes(toggle)) contextToggles.push(toggle);
	}

	const supportsSetMode = isTargetADC || isCriticalThreshold || isFumbleThreshold || hasParsedValue(parsed, 'set');
	const renderedRequiredFields = supportsSetMode ? dedupe(requiredFields).filter((field) => field !== 'set') : dedupe(requiredFields);
	const renderedContextToggles = dedupe(contextToggles).filter((toggle) => toggle !== 'partialConsume');

	return {
		isAura,
		requiredFields: renderedRequiredFields,
		auraFields: dedupe(auraFields),
		optionalFields: OPTIONAL_FIELD_NAMES,
		commonToggles: COMMON_TOGGLE_FIELDS,
		contextToggles: renderedContextToggles,
		supportsSetMode,
	};
}

function hasParsedValue(parsed, field) {
	return String(parsed?.fields?.[field] ?? '').trim() !== '';
}

function resolveCadenceMode(parsed) {
	for (const toggle of CADENCE_TOGGLE_FIELDS) {
		if (parsed?.toggles?.[toggle]) return toggle;
	}
	return '';
}

function resolveOptionalFieldState(parsed, uiState = null) {
	return {
		cadence: uiState?.cadence ?? resolveCadenceMode(parsed) !== '',
		name: uiState?.name ?? hasParsedValue(parsed, 'name'),
		description: uiState?.description ?? hasParsedValue(parsed, 'description'),
		usesCount: uiState?.usesCount ?? (hasParsedValue(parsed, 'usesCount') || Boolean(parsed?.toggles?.partialConsume)),
	};
}

function dedupe(values) {
	return [...new Set(values)];
}

function buildRenderedPrimaryFields(profile, parsed, id, { setMode = false } = {}) {
	return [
		...profile.requiredFields.map((name) => ({
		name,
		label: profile.supportsSetMode && name === 'bonus' ? 'Bonus / Set' : name === 'bonus' ? 'Bonus' : labelForField(name),
		value: profile.supportsSetMode && name === 'bonus' ? parsed.fields[setMode ? 'set' : 'bonus'] ?? '' : parsed.fields[name] ?? '',
		inputId: `ac5e-value-${name}-${id}`,
		expandable: true,
		fullRow: false,
		inlineToggle: profile.supportsSetMode && name === 'bonus' ? {
			name: 'ui.setMode',
			label: 'Set',
			checked: setMode,
		} : null,
		})),
		...profile.auraFields.map((name) => ({
		name,
		label: labelForField(name),
		value: parsed.fields[name] ?? '',
		inputId: `ac5e-value-${name}-${id}`,
		expandable: true,
		fullRow: true,
		inlineToggle: null,
		})),
	];
}

function buildPrimaryLayout(profile, parsed, id, { setMode = false, conditionsLabel = 'Condition' } = {}) {
	const renderedPrimaryFields = buildRenderedPrimaryFields(profile, parsed, id, { setMode });
	const radiusField = renderedPrimaryFields.find((field) => field.name === 'radius') ?? null;
	const mainFields = renderedPrimaryFields.filter((field) => field.name !== 'radius');
	return {
		radiusField,
		mainFields,
		conditionField: {
			name: 'conditions',
			label: conditionsLabel,
			value: parsed.conditions.join('; '),
			inputId: `ac5e-value-conditions-${id}`,
			placeholder: 'true',
			expandable: true,
		},
	};
}

function buildRenderedOptionalFieldRows(parsed, id, optionalFieldState) {
	const nameField = optionalFieldState.name ? buildRenderedOptionalField('name', parsed, id) : null;
	const descriptionField = optionalFieldState.description ? buildRenderedOptionalField('description', parsed, id) : null;
	return {
		nameDescription: {
			left: nameField ?? (!nameField && descriptionField ? descriptionField : null),
			right: nameField && descriptionField ? descriptionField : null,
		},
		usesCount: {
			left: optionalFieldState.usesCount ? buildRenderedOptionalField('usesCount', parsed, id) : null,
			right: optionalFieldState.usesCount ? {
				name: 'toggles.partialConsume',
				label: 'Partial Consume',
				checked: Boolean(parsed.toggles.partialConsume),
			} : null,
		},
	};
}

function hasOptionalFieldRows(rows) {
	return Boolean(rows?.nameDescription?.left || rows?.nameDescription?.right || rows?.usesCount?.left || rows?.usesCount?.right);
}

function buildRenderedOptionalField(name, parsed, id) {
	return {
		name,
		label: labelForField(name),
		value: parsed.fields[name] ?? '',
		inputId: `ac5e-value-${name}-${id}`,
		expandable: true,
		fullRow: false,
	};
}

function shouldUseSetMode(parsed) {
	return hasParsedValue(parsed, 'set') && !hasParsedValue(parsed, 'bonus');
}

function getPersistedFieldNames(profile) {
	const fieldNames = [...profile.requiredFields, ...profile.optionalFields];
	if (profile.supportsSetMode) fieldNames.push('set');
	return dedupe(fieldNames);
}

function buildCadenceOptions(selectedValue = '') {
	return [
		{ value: '', label: 'None', selected: selectedValue === '' },
		{ value: 'once', label: 'Once', selected: selectedValue === 'once' },
		{ value: 'oncePerTurn', label: 'Once Per Turn', selected: selectedValue === 'oncePerTurn' },
		{ value: 'oncePerRound', label: 'Once Per Round', selected: selectedValue === 'oncePerRound' },
		{ value: 'oncePerCombat', label: 'Once Per Combat', selected: selectedValue === 'oncePerCombat' },
	];
}

function applyCadenceMode(data, mode) {
	if (!data?.toggles) return;
	for (const toggle of CADENCE_TOGGLE_FIELDS) data.toggles[toggle] = false;
	if (CADENCE_TOGGLE_FIELDS.includes(mode)) data.toggles[mode] = true;
}

function hasCheckedInput(root, name) {
	if (!root) return false;
	if (root instanceof HTMLFormElement) return Array.from(root.elements).some((element) => element.name === name && element.checked);
	const escapedName = globalThis.CSS?.escape?.(name) ?? name.replaceAll('"', '\\"');
	return Array.from(root.querySelectorAll(`[name="${escapedName}"]`)).some((element) => element.checked);
}

function getSelectValue(root, name) {
	if (!root) return '';
	if (root instanceof HTMLFormElement) {
		const element = Array.from(root.elements).find((candidate) => candidate.name === name);
		return String(element?.value ?? '');
	}
	const escapedName = globalThis.CSS?.escape?.(name) ?? name.replaceAll('"', '\\"');
	return String(root.querySelector(`[name="${escapedName}"]`)?.value ?? '');
}

function escapeHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}
