import { buildEffectValueAutocompleteEntries, configureAc5eAutocompleteMenu, getAutocompletePrefix, replaceAutocompletePrefix } from './ac5e-effect-value-autocomplete.mjs';
import { collectAc5eEffectValueFormData, mergeAc5eEffectValueFormData, parseAc5eEffectValue, serializeAc5eEffectValue } from './ac5e-effect-value-parser.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const COMMON_TOGGLE_FIELDS = ['optin', 'once', 'oncePerTurn', 'oncePerRound', 'oncePerCombat', 'itemLimited'];
const AURA_TOGGLE_FIELDS = ['allies', 'enemies', 'includeSelf', 'singleAura', 'wallsBlock'];
const CONDITIONAL_TOGGLE_FIELDS = ['partialConsume'];
const OPTIONAL_FIELD_NAMES = ['name', 'description', 'usesCount'];
const CADENCE_TOGGLE_FIELDS = ['once', 'oncePerTurn', 'oncePerRound', 'oncePerCombat'];
const DEFAULT_USESCOUNT_SCALING = { min: 1, max: 1, step: 1 };

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
		const parsed = this.draftData ?? parseAc5eEffectValue(this.#getValueInput()?.value ?? '', { changeKey });
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
		for (const input of htmlElement?.querySelectorAll('[name^="ui.show"]:not([data-ac5e-ui-toggle-ready]), [name="ui.setMode"]:not([data-ac5e-ui-toggle-ready])') ?? []) {
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
		const baseData = this.draftData ?? parseAc5eEffectValue(valueInput.value ?? '', { changeKey });
		const profile = getEditorProfile(changeKey, baseData);
		const formData = collectAc5eEffectValueFormData(form);
		const setMode = profile.supportsSetMode && hasCheckedInput(form, 'ui.setMode');
		const showCadence = hasCheckedInput(form, 'ui.showCadence');
		const showName = hasCheckedInput(form, 'ui.showName');
		const showDescription = hasCheckedInput(form, 'ui.showDescription');
		const showUsesCount = hasCheckedInput(form, 'ui.showUsesCount');
		const usesCountScalingInputs = getUsesCountScalingInputValues(form);
		const cadenceMode = showCadence ? getSelectValue(form, 'ui.cadenceMode') : '';
		if (profile.supportsSetMode) applySetModeToFormData(formData, setMode);
		const mergedData = mergeAc5eEffectValueFormData(baseData, formData, {
			fieldNames: [...getPersistedFieldNames(profile)],
			toggleNames: [...profile.commonToggles, ...profile.contextToggles],
		});
		if (!showName) mergedData.fields.name = '';
		if (!showDescription) mergedData.fields.description = '';
		if (!showUsesCount) mergedData.fields.usesCount = '';
		if (showUsesCount) {
			mergedData.fields.usesCount = updateUsesCountScaling(mergedData.fields.usesCount, usesCountScalingInputs);
		}
		if (!String(mergedData.fields.usesCount ?? '').trim()) mergedData.toggles.partialConsume = false;
		applyCadenceMode(mergedData, cadenceMode);
		if (profile.supportsSetMode) {
			mergedData.fields.bonus = setMode ? '' : mergedData.fields.bonus;
			mergedData.fields.set = setMode ? mergedData.fields.set : '';
		}
		const value = serializeAc5eEffectValue(mergedData, { changeKey });
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
		configureAc5eAutocompleteMenu(this.autocomplete);
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
		const assist = buildLambdaAssistData(this.autocompleteEntries);
		try {
			const result = await foundry.applications.api.DialogV2.wait({
				window: {
					title: `Edit ${label}`,
				},
				content: `
					<form class="ac5e-effect-value-expand-dialog" data-ac5e-lambda-assist>
						<div class="ac5e-effect-value-expand-layout">
							<section class="ac5e-effect-value-expand-main">
								<div class="form-group stacked">
									<label for="ac5e-expand-value">${escapedLabel}</label>
									<div class="form-fields">
										<textarea id="ac5e-expand-value" name="value" rows="12">${escapedValue}</textarea>
									</div>
								</div>
								<div class="ac5e-effect-value-assist-operators" data-ac5e-assist-operators>
									${renderAssistButtonGroup(assist.operators, 'ac5e-assist-insert')}
								</div>
								<div class="ac5e-effect-value-assist-groups">
									<div class="form-group stacked">
										<label for="ac5e-assist-is-entries">is* entries</label>
										<div class="form-fields">
											<select id="ac5e-assist-is-entries" data-ac5e-assist-select>
												${renderAssistOptions(assist.isEntries)}
											</select>
											<button type="button" class="icon fa-solid fa-plus" data-ac5e-assist-insert-selected="ac5e-assist-is-entries" aria-label="Insert selected is entry"></button>
										</div>
									</div>
									<div class="form-group stacked">
										<label for="ac5e-assist-has-entries">has* entries</label>
										<div class="form-fields">
											<select id="ac5e-assist-has-entries" data-ac5e-assist-select>
												${renderAssistOptions(assist.hasEntries)}
											</select>
											<button type="button" class="icon fa-solid fa-plus" data-ac5e-assist-insert-selected="ac5e-assist-has-entries" aria-label="Insert selected has entry"></button>
										</div>
									</div>
									<div class="form-group stacked">
										<label for="ac5e-assist-other-entries">Other sandbox entries</label>
										<div class="form-fields">
											<select id="ac5e-assist-other-entries" data-ac5e-assist-select>
												${renderAssistOptions(assist.otherEntries)}
											</select>
											<button type="button" class="icon fa-solid fa-plus" data-ac5e-assist-insert-selected="ac5e-assist-other-entries" aria-label="Insert selected entry"></button>
										</div>
									</div>
								</div>
							</section>
							<aside class="ac5e-effect-value-expand-aside">
								<p class="ac5e-effect-value-assist-title">Lambda Paths</p>
								<div class="ac5e-effect-value-assist-roots">
									${renderAssistButtonGroup(assist.entryPoints, 'ac5e-assist-root')}
								</div>
								<div class="form-group stacked">
									<label for="ac5e-assist-paths">Paths</label>
									<div class="form-fields">
										<select id="ac5e-assist-paths" data-ac5e-assist-paths size="12">
											${renderAssistOptions(assist.pathsByRoot[assist.entryPoints[0]?.value] ?? [])}
										</select>
									</div>
								</div>
								<button type="button" data-ac5e-assist-insert-selected="ac5e-assist-paths">Insert Selected Path</button>
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
					width: 920,
				},
				render: (_event, dialog) => {
					const textarea = dialog.element.querySelector('textarea[name="value"]');
					if (!(textarea instanceof HTMLTextAreaElement)) return;
					prepareLambdaAssist(dialog.element, assist);
					textarea.focus();
					const cursor = textarea.value.length;
					textarea.setSelectionRange(cursor, cursor);
				},
			});
			if (result === 'cancel' || typeof result !== 'string') return;
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
		const baseData = this.draftData ?? parseAc5eEffectValue(valueInput?.value ?? '', { changeKey });
		const profile = getEditorProfile(changeKey, baseData);
		const formData = collectAc5eEffectValueFormData(form);
		const setMode = profile.supportsSetMode && hasCheckedInput(form, 'ui.setMode');
		const showCadence = hasCheckedInput(form, 'ui.showCadence');
		const showName = hasCheckedInput(form, 'ui.showName');
		const showDescription = hasCheckedInput(form, 'ui.showDescription');
		const showUsesCount = hasCheckedInput(form, 'ui.showUsesCount');
		const usesCountScalingInputs = getUsesCountScalingInputValues(form);
		const cadenceMode = showCadence ? getSelectValue(form, 'ui.cadenceMode') : '';
		if (profile.supportsSetMode) applySetModeToFormData(formData, setMode);
		const mergedData = mergeAc5eEffectValueFormData(baseData, formData, {
			fieldNames: [...getPersistedFieldNames(profile)],
			toggleNames: [...profile.commonToggles, ...profile.contextToggles],
		});
		if (!showName) mergedData.fields.name = baseData.fields.name;
		if (!showDescription) mergedData.fields.description = baseData.fields.description;
		if (!showUsesCount) {
			mergedData.fields.usesCount = baseData.fields.usesCount;
			mergedData.toggles.partialConsume = baseData.toggles.partialConsume;
		} else {
			mergedData.fields.usesCount = updateUsesCountScaling(mergedData.fields.usesCount, usesCountScalingInputs);
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
	const isTypeOverride = normalized.endsWith('.typeoverride');
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
	if (isTypeOverride) requiredFields.push('override');
	if (isTargetADC) requiredFields.push('set');
	if (isModifier) requiredFields.push('modifier');
	if (isCriticalThreshold || isFumbleThreshold) requiredFields.push('bonus', 'set');
	if (isRange) requiredFields.push('radius');
	if (isAura) auraFields.push('radius');
	if (isRange) requiredFields.push('bonus');
	if (hasParsedValue(parsed, 'chance')) requiredFields.push('chance');
	if (hasParsedValue(parsed, 'enforceMode')) requiredFields.push('enforceMode');
	if (isTypeOverride) requiredFields.push('addTo');
	if (hasParsedValue(parsed, 'addTo')) requiredFields.push('addTo');

	const contextToggles = [];
	if (isAura) contextToggles.push(...AURA_TOGGLE_FIELDS);
	for (const toggle of [...AURA_TOGGLE_FIELDS, ...CONDITIONAL_TOGGLE_FIELDS]) {
		if (parsed?.toggles?.[toggle] && !contextToggles.includes(toggle)) contextToggles.push(toggle);
	}

	const supportsSetMode = !isTypeOverride && (isTargetADC || isCriticalThreshold || isFumbleThreshold || hasParsedValue(parsed, 'set'));
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
	const usesCountValue = parsed.fields.usesCount ?? '';
	const parsedUsesCount = parseUsesCountScalingSpec(usesCountValue);
	return {
		nameDescription: {
			left: nameField ?? (!nameField && descriptionField ? descriptionField : null),
			right: nameField && descriptionField ? descriptionField : null,
		},
		usesCount: {
			left: optionalFieldState.usesCount ? buildRenderedOptionalField('usesCount', parsed, id) : null,
			right: optionalFieldState.usesCount ? [
				{
					name: 'toggles.partialConsume',
					label: 'Partial Consume',
					checked: Boolean(parsed.toggles.partialConsume),
				},
			] : null,
			scaling: optionalFieldState.usesCount ? buildRenderedUsesCountScalingFields(parsedUsesCount?.scaling, id) : null,
		},
	};
}

function buildLambdaAssistData(entries) {
	const uniqueIdentifiers = dedupe((entries ?? []).map((entry) => entry?.identifier).filter((identifier) => typeof identifier === 'string' && identifier.trim()));
	const entryPoints = [
		{ label: 'rollingActor', value: 'rollingActor' },
		{ label: 'opponentActor', value: 'opponentActor' },
		{ label: 'auraActor', value: 'auraActor' },
		{ label: 'effectActor', value: 'effectActor' },
		{ label: 'nonEffectActor', value: 'nonEffectActor' },
		{ label: 'item', value: 'item' },
		{ label: 'activity', value: 'activity' },
		{ label: 'originItem', value: 'originItem' },
		{ label: 'originActivity', value: 'originActivity' },
	];
	const operators = [
		{ label: '>', value: ' > ' },
		{ label: '>=', value: ' >= ' },
		{ label: '<', value: ' < ' },
		{ label: '<=', value: ' <= ' },
		{ label: '==', value: ' == ' },
		{ label: '&&', value: ' && ' },
		{ label: '||', value: ' || ' },
		{ label: 'Ternary', value: '(condition ? trueValue : falseValue)' },
	];
	const isEntries = uniqueIdentifiers.filter((identifier) => /^is[A-Z_]/.test(identifier) || identifier.startsWith('is'));
	const hasEntries = uniqueIdentifiers.filter((identifier) => /^has[A-Z_]/.test(identifier) || identifier.startsWith('has'));
	const used = new Set([...isEntries, ...hasEntries]);
	const otherEntries = uniqueIdentifiers.filter((identifier) => !used.has(identifier)).slice(0, 250);
	const pathsByRoot = Object.fromEntries(entryPoints.map((entry) => [
		entry.value,
		uniqueIdentifiers.filter((identifier) => identifier === entry.value || identifier.startsWith(`${entry.value}.`)),
	]));
	return { entryPoints, operators, isEntries, hasEntries, otherEntries, pathsByRoot };
}

function renderAssistButtonGroup(items, dataAttribute) {
	return (items ?? [])
		.map((item) => `<button type="button" data-${dataAttribute}="${escapeHtml(item.value)}">${escapeHtml(item.label)}</button>`)
		.join('');
}

function renderAssistOptions(options) {
	const source = (options ?? []).length ? options : [''];
	return source
		.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option || 'No entries')}</option>`)
		.join('');
}

function prepareLambdaAssist(root, assist) {
	if (!(root instanceof HTMLElement)) return;
	const textarea = root.querySelector('textarea[name="value"]');
	if (!(textarea instanceof HTMLTextAreaElement)) return;
	for (const button of root.querySelectorAll('[data-ac5e-assist-insert]')) {
		button.addEventListener('click', () => insertAtCursor(textarea, button.dataset.ac5eAssistInsert ?? ''));
	}
	for (const button of root.querySelectorAll('[data-ac5e-assist-root]')) {
		button.addEventListener('mouseenter', () => updatePathOptions(root, assist, button.dataset.ac5eAssistRoot ?? ''));
		button.addEventListener('click', () => updatePathOptions(root, assist, button.dataset.ac5eAssistRoot ?? ''));
	}
	for (const button of root.querySelectorAll('[data-ac5e-assist-insert-selected]')) {
		button.addEventListener('click', () => {
			const selectId = button.dataset.ac5eAssistInsertSelected ?? '';
			const select = root.querySelector(`#${globalThis.CSS?.escape?.(selectId) ?? selectId.replaceAll('"', '\\"')}`);
			if (!(select instanceof HTMLSelectElement)) return;
			insertAtCursor(textarea, select.value ?? '');
		});
	}
}

function updatePathOptions(root, assist, rootPath) {
	const select = root.querySelector('[data-ac5e-assist-paths]');
	if (!(select instanceof HTMLSelectElement)) return;
	const options = assist?.pathsByRoot?.[rootPath] ?? [];
	select.innerHTML = renderAssistOptions(options);
}

function insertAtCursor(input, text) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
	if (!text) return;
	const start = input.selectionStart ?? input.value.length;
	const end = input.selectionEnd ?? input.value.length;
	input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
	const cursor = start + text.length;
	input.setSelectionRange(cursor, cursor);
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

function hasOptionalFieldRows(rows) {
	return Boolean(rows?.nameDescription?.left || rows?.nameDescription?.right || rows?.usesCount?.left || rows?.usesCount?.right || rows?.usesCount?.scaling);
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

function applySetModeToFormData(formData, setMode) {
	if (!formData?.fields) return;
	const enteredValue = String(formData.fields.bonus ?? '').trim();
	formData.fields.set = setMode ? enteredValue : '';
	formData.fields.bonus = setMode ? '' : enteredValue;
}

function getPersistedFieldNames(profile) {
	const fieldNames = [...profile.requiredFields, ...profile.auraFields, ...profile.optionalFields];
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
	const escapedValue = foundry?.utils?.escapeHTML?.(value);
	if (typeof escapedValue === 'string') return escapedValue;
	return String(value ?? '');
}

function hasUsesCountScalingSpec(rawValue) {
	if (typeof rawValue !== 'string') return false;
	return /,\s*[+-]?\s*\{[\s\S]*\}\s*$/u.test(rawValue.trim());
}

function stripUsesCountScaling(rawValue) {
	if (typeof rawValue !== 'string') return '';
	return rawValue.replace(/,\s*[+-]?\s*\{[\s\S]*\}\s*$/u, '').trim();
}

function updateUsesCountScaling(rawValue, enabled) {
	const current = typeof rawValue === 'string' ? rawValue.trim() : '';
	if (!current) return '';
	const parsed = parseUsesCountScalingSpec(current);
	const baseValue = parsed.baseValue;
	if (!baseValue) return '';
	const normalizedScaling = normalizeScalingConfig(enabled);
	if (!normalizedScaling) return baseValue;
	const scalingLiteral = `{ min: ${normalizedScaling.min}, max: ${normalizedScaling.max}, step: ${normalizedScaling.step} }`;
	return `${baseValue}, ${scalingLiteral}`;
}

function parseUsesCountScalingSpec(rawValue) {
	const current = typeof rawValue === 'string' ? rawValue.trim() : '';
	if (!current) return { baseValue: '', scaling: null };
	const match = current.match(/^(.*?),\s*[+-]?\s*\{([\s\S]*)\}\s*$/u);
	if (!match) return { baseValue: current, scaling: null };
	const baseValue = match[1].trim();
	const objectSource = match[2] ?? '';
	const scaling = {
		min: extractNumericScalingKey(objectSource, 'min'),
		max: extractNumericScalingKey(objectSource, 'max'),
		step: extractNumericScalingKey(objectSource, 'step'),
	};
	return { baseValue, scaling };
}

function extractNumericScalingKey(source, key) {
	if (typeof source !== 'string' || typeof key !== 'string') return '';
	const match = source.match(new RegExp(`\\b${key}\\s*:\\s*(-?\\d*\\.?\\d+)`, 'i'));
	return match ? match[1] : '';
}

function buildRenderedUsesCountScalingFields(scaling, id) {
	return {
		max: {
			name: 'ui.usesCountScaling.max',
			label: 'Scaling Max',
			value: scaling?.max ?? '',
			inputId: `ac5e-value-usesCount-scaling-max-${id}`,
			placeholder: '1',
		},
		min: {
			name: 'ui.usesCountScaling.min',
			label: 'Scaling Min',
			value: scaling?.min ?? '',
			inputId: `ac5e-value-usesCount-scaling-min-${id}`,
			placeholder: '1',
		},
		step: {
			name: 'ui.usesCountScaling.step',
			label: 'Scaling Step',
			value: scaling?.step ?? '',
			inputId: `ac5e-value-usesCount-scaling-step-${id}`,
			placeholder: '1',
		},
	};
}

function getUsesCountScalingInputValues(root) {
	return {
		max: getInputValue(root, 'ui.usesCountScaling.max'),
		min: getInputValue(root, 'ui.usesCountScaling.min'),
		step: getInputValue(root, 'ui.usesCountScaling.step'),
	};
}

function getInputValue(root, name) {
	if (!root) return '';
	if (root instanceof HTMLFormElement) {
		const element = Array.from(root.elements).find((candidate) => candidate.name === name);
		return element?.value ?? '';
	}
	const escapedName = globalThis.CSS?.escape?.(name) ?? name.replaceAll('"', '\\"');
	return root.querySelector(`[name="${escapedName}"]`)?.value ?? '';
}

function normalizeScalingConfig(scalingInputs) {
	if (!scalingInputs || typeof scalingInputs !== 'object') return null;
	const maxRaw = String(scalingInputs.max ?? '').trim();
	const minRaw = String(scalingInputs.min ?? '').trim();
	const stepRaw = String(scalingInputs.step ?? '').trim();
	if (!maxRaw && !minRaw && !stepRaw) return null;
	const max = coerceScalingNumber(maxRaw, DEFAULT_USESCOUNT_SCALING.max);
	const min = coerceScalingNumber(minRaw, DEFAULT_USESCOUNT_SCALING.min);
	let step = coerceScalingNumber(stepRaw, DEFAULT_USESCOUNT_SCALING.step);
	if (step <= 0) step = DEFAULT_USESCOUNT_SCALING.step;
	return {
		min,
		max: max < min ? min : max,
		step,
	};
}

function coerceScalingNumber(value, fallback) {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
}
