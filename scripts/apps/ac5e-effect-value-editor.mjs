import { buildEffectValueAutocompleteEntries, configureAc5eAutocompleteMenu, getAutocompletePrefix, rankEffectValueAutocompleteEntries, replaceAutocompletePrefix, shouldActivateEffectValueAutocomplete } from './ac5e-effect-value-autocomplete.mjs';
import { AC5E_ACTOR_ROLLDATA_ADDED_FIELDS, AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS } from '../ac5e-runtimeLogic.mjs';

const AC5E_ACTOR_ROOTS = ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'];
const AC5E_ACTOR_ADDED_LAMBDA_PATHS = new Set([
	...AC5E_ACTOR_ROOTS.flatMap((root) => AC5E_ACTOR_ROLLDATA_ADDED_FIELDS.map((suffix) => `${root}.${suffix}`)),
	'opponentActor.opponentId',
]);
const AC5E_ITEM_ACTIVITY_ADDED_LAMBDA_PATHS = new Set([
	'item.itemUuid',
	'item.itemType',
	'item.itemProperties',
	'item.actionType',
	'item.attackMode',
	'item.mastery',
	'item.damageTypes',
	'item.defaultDamageType',
	'activity.actionType',
	'activity.damageTypes',
	'activity.defaultDamageType',
	'activity.healingTypes',
	'originItem.actionType',
	'originItem.attackMode',
	'originItem.mastery',
	'originItem.damageTypes',
	'originItem.defaultDamageType',
	'originActivity.actionType',
	'originActivity.damageTypes',
	'originActivity.defaultDamageType',
	'originActivity.healingTypes',
]);
const AC5E_ADDED_LAMBDA_PATHS = new Set([...AC5E_ACTOR_ADDED_LAMBDA_PATHS, ...AC5E_ITEM_ACTIVITY_ADDED_LAMBDA_PATHS]);
const AC5E_ADDED_LAMBDA_PREFIXES = new Set(
	AC5E_ACTOR_ROOTS.flatMap((root) => AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS.map((suffix) => `${root}.${suffix}`)),
);
import { collectAc5eEffectValueFormData, mergeAc5eEffectValueFormData, parseAc5eEffectValue, serializeAc5eEffectValue } from './ac5e-effect-value-parser.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const COMMON_TOGGLE_FIELDS = ['optin', 'once', 'oncePerTurn', 'oncePerRound', 'oncePerCombat', 'itemLimited'];
const AURA_TOGGLE_FIELDS = ['allies', 'enemies', 'includeSelf', 'singleAura', 'wallsBlock'];
const CONDITIONAL_TOGGLE_FIELDS = ['partialConsume'];
const OPTIONAL_FIELD_NAMES = ['name', 'description', 'usesCount'];
const CADENCE_TOGGLE_FIELDS = ['once', 'oncePerTurn', 'oncePerRound', 'oncePerCombat'];
const DEFAULT_USESCOUNT_SCALING = { min: 1, max: 1, step: 1 };
const ROOT_IDENTIFIERS = new Set(['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor', 'item', 'activity', 'originItem', 'originActivity']);
const ROLL_AWARE_ENTRIES = new Set([
	'hasAdvantage',
	'hasDisadvantage',
	'hasTransitAdvantage',
	'hasTransitDisadvantage',
	'ability',
	'skill',
	'tool',
	'hasProficiency',
	'hasExpertise',
	'hasHalfProficiency',
	'hasFullProficiency',
	'isConcentration',
	'isDeathSave',
	'isInitiative',
	'targetValue',
	'isCritical',
	'isFumble',
	'opponentAC',
	'targetOverAC',
	'd20Total',
	'd20Result',
	'd20ResultOverTarget',
	'attackRollTotal',
	'attackRollD20',
	'attackRollOverAC',
]);
const COMPUTED_ROLL_AWARE_ENTRIES = new Set([
	'opponentAC',
	'targetOverAC',
	'd20Total',
	'd20Result',
	'd20ResultOverTarget',
	'attackRollTotal',
	'attackRollD20',
	'attackRollOverAC',
]);

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
			reset: AC5EEffectValueEditor.#onResetAction,
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
					hint: getToggleHint('ui.showCadence'),
				},
				{
					name: 'ui.showName',
					label: 'Name',
					checked: optionalFieldState.name,
					hint: getToggleHint('ui.showName'),
				},
				{
					name: 'ui.showDescription',
					label: 'Description',
					checked: optionalFieldState.description,
					hint: getToggleHint('ui.showDescription'),
				},
				{
					name: 'ui.showUsesCount',
					label: 'Uses Count',
					checked: optionalFieldState.usesCount,
					hint: getToggleHint('ui.showUsesCount'),
				},
				...profile.commonToggles.filter((name) => !CADENCE_TOGGLE_FIELDS.includes(name)).map((name) => ({
					name: `toggles.${name}`,
					label: labelForField(name),
					checked: Boolean(parsed.toggles[name]),
					hint: getToggleHint(`toggles.${name}`),
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
				hint: getToggleHint(`toggles.${name}`),
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

	static #onResetAction(event) {
		event.preventDefault();
		const conditionInputs = Array.from(this.element?.querySelectorAll?.('input[name="conditions"], textarea[name="conditions"]') ?? []);
		for (const input of conditionInputs) {
			if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) continue;
			input.value = '';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		}
		const active = document.activeElement;
		if (active instanceof HTMLElement && this.element?.contains(active)) {
			active.blur();
			return;
		}
		const conditionInput = this.element?.querySelector?.('input[name="conditions"], textarea[name="conditions"]');
		if (conditionInput instanceof HTMLElement) conditionInput.blur();
	}

	#activateUiEnhancements(htmlElement) {
		for (const input of htmlElement?.querySelectorAll('[data-ac5e-condition-input]:not([data-ac5e-autocomplete-ready])') ?? []) {
			input.dataset.ac5eAutocompleteReady = 'true';
			input.addEventListener('input', (event) => this.#onConditionInput(event));
			input.addEventListener('blur', () => {
				if (ui.autocomplete === this.autocomplete) this.autocomplete.dismiss();
			});
		}
		for (const button of htmlElement?.querySelectorAll('[data-ac5e-expand-input]:not([data-ac5e-expand-ready])') ?? []) {
			button.dataset.ac5eExpandReady = 'true';
			button.addEventListener('click', (event) => void this.#onExpandInput(event));
		}
		for (const input of htmlElement?.querySelectorAll('[name^="ui.show"]:not([data-ac5e-ui-toggle-ready]), [name="ui.setMode"]:not([data-ac5e-ui-toggle-ready]), [name="ui.enableUsesCountScaling"]:not([data-ac5e-ui-toggle-ready])') ?? []) {
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
		const showUsesCountScaling = hasCheckedInput(form, 'ui.enableUsesCountScaling');
		const usesCountScalingInputs = getUsesCountScalingInputValues(form);
		const cadenceMode = showCadence ? getSelectValue(form, 'ui.cadenceMode') : '';
		if (profile.supportsSetMode) applySetModeToFormData(formData, setMode);
		const mergedData = mergeAc5eEffectValueFormData(baseData, formData, {
			fieldNames: [...getPersistedFieldNames(profile)],
			toggleNames: [...profile.commonToggles, ...profile.contextToggles, 'recover'],
		});
		if (!showName) mergedData.fields.name = '';
		if (!showDescription) mergedData.fields.description = '';
		if (!showUsesCount) mergedData.fields.usesCount = '';
		const partialConsumeEnabled = Boolean(mergedData.toggles.partialConsume);
		const scalingEnabled = showUsesCountScaling && !partialConsumeEnabled;
		if (showUsesCount) mergedData.fields.usesCount = updateUsesCountScaling(mergedData.fields.usesCount, scalingEnabled ? usesCountScalingInputs : null);
		if (scalingEnabled) mergedData.toggles.partialConsume = false;
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
		if (!shouldActivateEffectValueAutocomplete(input, prefix)) {
			return;
		}
		const cursor = Number(input.selectionStart ?? input.value.length);
		const entries = rankEffectValueAutocompleteEntries(this.autocompleteEntries, {
			inputValue: input.value ?? '',
			cursor,
			prefix,
			limit: 40,
		});
		if (!entries.length) {
			return;
		}
		this.autocomplete.activate(input, entries, { prefix });
		configureAc5eAutocompleteMenu(this.autocomplete);
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
		const appId = buildExpandEditorAppId(this.instanceKey || this.id || 'editor', inputName);
		const currentValue = input.value ?? '';
		const escapedLabel = escapeHtml(label);
		const escapedValue = escapeHtml(currentValue);
		const changeKey = this.draftKey ?? this.#getKeyInput()?.value ?? '';
		const assistProfile = getEditorProfile(changeKey, this.draftData ?? null);
		const assist = buildLambdaAssistData(this.autocompleteEntries, { includeAuraActor: assistProfile.isAura, changeKey });
		try {
			const result = await foundry.applications.api.DialogV2.wait({
				id: appId,
				window: {
					title: `Edit ${label}`,
					id: appId,
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
								${renderAssistActionFieldset('Operators', assist.operators, 'ac5e-assist-insert', 'button')}
								<div class="ac5e-effect-value-assist-groups">
									${renderAssistActionFieldset('Actor entries', assist.actorEntryButtons, 'ac5e-assist-root-insert', 'entry', '', true)}
									${renderAssistActionFieldset('Item/Activity entries', assist.itemActivityEntryButtons, 'ac5e-assist-root-insert', 'entry', '', true)}
								${assist.rollAwareEntries.length ? renderAssistActionFieldset('Roll-aware entries', assist.rollAwareEntries, 'ac5e-assist-entry', 'entry', 'sandbox', true) : ''}
								${renderAssistActionFieldset('Sandbox entries', assist.sandboxEntries, 'ac5e-assist-entry', 'entry', 'sandbox', true)}
							</div>
							</section>
							<aside class="ac5e-effect-value-expand-aside">
								<p class="ac5e-effect-value-assist-title">Lambda Paths <small>(* AC5E addition)</small></p>
								<div class="ac5e-effect-value-assist-browser" data-ac5e-assist-browser>
									<div class="ac5e-effect-value-assist-stage" data-ac5e-assist-stage></div>
								</div>
							</aside>
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
						action: 'reset',
						label: 'Reset',
						icon: 'fa-solid fa-rotate-left',
						callback: () => '__ac5e_reset__',
					},
				],
				position: {
					width: 920,
				},
				render: (_event, dialog) => {
					const textarea = dialog.element.querySelector('textarea[name="value"]');
					if (!(textarea instanceof HTMLTextAreaElement)) return;
					const resetButton = dialog.element.querySelector('[data-action="reset"], button[name="reset"]');
					if (resetButton instanceof HTMLButtonElement) {
						resetButton.addEventListener('click', (clickEvent) => {
							clickEvent.preventDefault();
							clickEvent.stopImmediatePropagation();
							textarea.value = '';
							textarea.dispatchEvent(new Event('input', { bubbles: true }));
							textarea.dispatchEvent(new Event('change', { bubbles: true }));
							textarea.focus();
							textarea.setSelectionRange(0, 0);
						}, { capture: true });
					}
					prepareLambdaAssist(dialog.element, assist);
					textarea.focus();
					const cursor = textarea.value.length;
					textarea.setSelectionRange(cursor, cursor);
				},
			});
			if (result === '__ac5e_reset__' || typeof result !== 'string') return;
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
			usesCountScaling: hasCheckedInput(form, 'ui.enableUsesCountScaling'),
			partialConsume: hasCheckedInput(form, 'toggles.partialConsume'),
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
		const showUsesCountScaling = hasCheckedInput(form, 'ui.enableUsesCountScaling');
		const usesCountScalingInputs = getUsesCountScalingInputValues(form);
		const cadenceMode = showCadence ? getSelectValue(form, 'ui.cadenceMode') : '';
		if (profile.supportsSetMode) applySetModeToFormData(formData, setMode);
		const mergedData = mergeAc5eEffectValueFormData(baseData, formData, {
			fieldNames: [...getPersistedFieldNames(profile)],
			toggleNames: [...profile.commonToggles, ...profile.contextToggles, 'recover'],
		});
		if (!showName) mergedData.fields.name = baseData.fields.name;
		if (!showDescription) mergedData.fields.description = baseData.fields.description;
		if (!showUsesCount) {
			mergedData.fields.usesCount = baseData.fields.usesCount;
			mergedData.toggles.partialConsume = baseData.toggles.partialConsume;
		} else {
			const partialConsumeEnabled = Boolean(mergedData.toggles.partialConsume);
			const scalingEnabled = showUsesCountScaling && !partialConsumeEnabled;
			mergedData.fields.usesCount = updateUsesCountScaling(mergedData.fields.usesCount, scalingEnabled ? usesCountScalingInputs : null);
			if (scalingEnabled) mergedData.toggles.partialConsume = false;
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

function getToggleHint(name) {
	const hints = {
		'ui.showCadence': 'Show cadence controls (once, once per turn, round, or combat).',
		'ui.showName': 'Include a custom display name for this entry.',
		'ui.showDescription': 'Include a short description for display/tooltip text.',
		'ui.showUsesCount': 'Enable uses-count configuration for this entry.',
		'ui.setMode': 'Treat the bonus field as an absolute set value instead of additive bonus.',
		'ui.enableUsesCountScaling': 'Enable min/max/step scaling inputs for usesCount consume value.',
		'toggles.optin': 'Show this entry as optional for users to enable per roll.',
		'toggles.itemLimited': 'Only apply when the originating item/activity matches the limited source context.',
		'toggles.allies': 'Aura applies to allied tokens.',
		'toggles.enemies': 'Aura applies to enemy tokens.',
		'toggles.includeSelf': 'Aura can apply to the source actor as well.',
		'toggles.singleAura': 'Only allow one active aura source to apply at a time.',
		'toggles.wallsBlock': 'Walls can block aura reach/pathing.',
		'toggles.recover': 'Reverse uses consumption and restore the configured amount.',
		'toggles.partialConsume': 'Allow spending only what is available instead of blocking when short.',
	};
	return hints[name] ?? '';
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
	const parsedUsesCountValue = parsed?.fields?.usesCount ?? '';
	const hasParsedScaling = hasUsesCountScalingSpec(parsedUsesCountValue);
	return {
		cadence: uiState?.cadence ?? resolveCadenceMode(parsed) !== '',
		name: uiState?.name ?? hasParsedValue(parsed, 'name'),
		description: uiState?.description ?? hasParsedValue(parsed, 'description'),
		usesCount: uiState?.usesCount ?? (hasParsedValue(parsed, 'usesCount') || Boolean(parsed?.toggles?.partialConsume)),
		usesCountScaling: uiState?.usesCountScaling ?? hasParsedScaling,
		partialConsume: uiState?.partialConsume ?? Boolean(parsed?.toggles?.partialConsume),
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
			hint: getToggleHint('ui.setMode'),
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
	const hasUsesCountScaling = optionalFieldState.usesCountScaling ?? hasUsesCountScalingSpec(usesCountValue);
	const partialConsumeEnabled = optionalFieldState.partialConsume ?? Boolean(parsed.toggles.partialConsume);
	const showPartialConsume = !hasUsesCountScaling;
	const showScalingToggle = !partialConsumeEnabled;
	return {
		nameDescription: {
			left: nameField ?? (!nameField && descriptionField ? descriptionField : null),
			right: nameField && descriptionField ? descriptionField : null,
		},
		usesCount: {
			left: optionalFieldState.usesCount ? buildRenderedOptionalField('usesCount', parsed, id) : null,
			right: optionalFieldState.usesCount ? [
				showScalingToggle ? {
					name: 'ui.enableUsesCountScaling',
					label: 'Scaling',
					checked: hasUsesCountScaling,
					hint: getToggleHint('ui.enableUsesCountScaling'),
				} : null,
				{
					name: 'toggles.recover',
					label: 'Recover',
					checked: Boolean(parsed.toggles.recover),
					hint: getToggleHint('toggles.recover'),
				},
				showPartialConsume ? {
					name: 'toggles.partialConsume',
					label: 'Partial',
					checked: partialConsumeEnabled,
					hint: getToggleHint('toggles.partialConsume'),
				} : null,
			].filter(Boolean) : null,
			scaling: optionalFieldState.usesCount && hasUsesCountScaling ? buildRenderedUsesCountScalingFields(parsedUsesCount?.scaling, id) : null,
		},
	};
}

function buildLambdaAssistData(entries, { includeAuraActor = true, changeKey = '' } = {}) {
	const entryRecords = (entries ?? []).filter((entry) => typeof entry?.identifier === 'string' && entry.identifier.trim());
	const uniqueIdentifiers = dedupe(entryRecords.map((entry) => entry.identifier));
	const allEntryPoints = [
		{ label: 'rollingActor', value: 'rollingActor' },
		{ label: 'opponentActor', value: 'opponentActor' },
		{ label: 'auraActor', value: 'auraActor' },
		{ label: 'effectActor', value: 'effectActor' },
		{ label: 'nonEffectActor', value: 'nonEffectActor' },
		{ label: 'effectOriginActor', value: 'effectOriginActor' },
		{ label: 'item', value: 'item' },
		{ label: 'activity', value: 'activity' },
		{ label: 'originItem', value: 'originItem' },
		{ label: 'originActivity', value: 'originActivity' },
	];
	const entryPoints = includeAuraActor ? allEntryPoints : allEntryPoints.filter((entry) => entry.value !== 'auraActor');
	const actorEntryButtons = entryPoints
		.filter((entry) => ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'].includes(entry.value))
		.map((entry) => entry.value);
	const itemActivityEntryButtons = entryPoints
		.filter((entry) => ['item', 'activity', 'originItem', 'originActivity'].includes(entry.value))
		.map((entry) => entry.value);
	const operators = [
		{ label: 'AND', value: ' && ' },
		{ label: 'OR', value: ' || ' },
		{ label: 'NOT', value: '!' },
		{ label: '==', value: ' == ' },
		{ label: '!=', value: ' != ' },
		{ label: '>', value: ' > ' },
		{ label: '>=', value: ' >= ' },
		{ label: '<', value: ' < ' },
		{ label: '<=', value: ' <= ' },
		{ label: '(...)', value: ' () ' },
		{ label: 'Ternary', value: '(condition ? trueValue : falseValue)' },
	];
	const sandboxIdentifiers = dedupe(entryRecords
		.filter((entry) => isSandboxAssistIdentifier(entry))
		.map((entry) => entry.identifier));
	const compatibilityFiltered = sandboxIdentifiers.filter((identifier) => !isLegacyCompatibilityIdentifier(identifier));
	const contextualFallbacks = getContextSandboxFallbackEntries(changeKey);
	const contextualIdentifiers = dedupe([...compatibilityFiltered, ...contextualFallbacks]);
	const isD20Context = isD20AssistContext(changeKey);
	const rollAwareEntries = dedupe(contextualIdentifiers.filter((identifier) => ROLL_AWARE_ENTRIES.has(identifier))).sort((a, b) => a.localeCompare(b));
	const sandboxEntries = dedupe(contextualIdentifiers.filter((identifier) => !ROLL_AWARE_ENTRIES.has(identifier))).sort((a, b) => a.localeCompare(b));
	const pathsByRoot = Object.fromEntries(entryPoints.map((entry) => {
		const fromEntries = uniqueIdentifiers
			.filter((identifier) => identifier === entry.value || identifier.startsWith(`${entry.value}.`))
			.filter((identifier) => !identifier.startsWith(`${entry.value}.system.`) && identifier !== `${entry.value}.system`);
		return [entry.value, dedupe(fromEntries)];
	}));
	addAssistFallbackPaths(pathsByRoot);
	const treesByRoot = Object.fromEntries(entryPoints.map((entry) => [
		entry.value,
		buildAssistPathTree(entry.value, pathsByRoot[entry.value] ?? [], AC5E_ADDED_LAMBDA_PATHS, AC5E_ADDED_LAMBDA_PREFIXES),
	]));
	const enumValues = {
		actorTypes: dedupe([
			...(Array.isArray(game?.system?.documentTypes?.Actor) ? game.system.documentTypes.Actor : []),
			...Object.keys(CONFIG?.Actor?.typeLabels ?? {}),
		].map((value) => String(value ?? '').trim()).filter(Boolean)),
		creatureTypes: Object.keys(CONFIG?.DND5E?.creatureTypes ?? {}).filter(Boolean),
		itemTypes: dedupe([
			...(Array.isArray(game?.system?.documentTypes?.Item) ? game.system.documentTypes.Item : []),
			...Object.keys(CONFIG?.Item?.typeLabels ?? {}),
		].map((value) => String(value ?? '').trim()).filter(Boolean)),
		activityTypes: Object.keys(CONFIG?.DND5E?.activityTypes ?? {}).filter(Boolean),
		actionTypes: dedupe([
			...Object.keys(CONFIG?.DND5E?.itemActionTypes ?? {}),
			...Object.keys(CONFIG?.DND5E?.attackTypes ?? {}),
		].filter(Boolean)),
		attackModes: Object.keys(CONFIG?.DND5E?.attackModes ?? {}).filter(Boolean),
		masteries: Object.keys(CONFIG?.DND5E?.weaponMasteries ?? {}).filter(Boolean),
		itemProperties: Object.keys(CONFIG?.DND5E?.itemProperties ?? {}).filter(Boolean),
		abilities: Object.keys(CONFIG?.DND5E?.abilities ?? {}).filter(Boolean),
		skills: Object.keys(CONFIG?.DND5E?.skills ?? {}).filter(Boolean),
		tools: Object.keys(CONFIG?.DND5E?.tools ?? {}).filter(Boolean),
		damageTypes: Object.keys(CONFIG?.DND5E?.damageTypes ?? {}).filter(Boolean),
		healingTypes: Object.keys(CONFIG?.DND5E?.healingTypes ?? {}).filter(Boolean),
		baseItems: dedupe([
			...Object.keys(CONFIG?.DND5E?.weaponIds ?? {}),
			...Object.keys(CONFIG?.DND5E?.armorIds ?? {}),
			...Object.keys(CONFIG?.DND5E?.toolIds ?? {}),
			...Object.keys(CONFIG?.DND5E?.ammoIds ?? {}),
		].filter(Boolean)),
	};
	const contextRollAwareEntries = isD20Context ? filterRollAwareEntriesForChangeKey(rollAwareEntries, changeKey) : [];
	const allEntryButtons = dedupe([...contextRollAwareEntries, ...sandboxEntries]).sort((a, b) => a.localeCompare(b));
	return { entryPoints, actorEntryButtons, itemActivityEntryButtons, operators, rollAwareEntries: contextRollAwareEntries, sandboxEntries, allEntryButtons, pathsByRoot, treesByRoot, enumValues };
}

function isSandboxAssistIdentifier(entry) {
	const identifier = `${entry?.identifier ?? ''}`.trim();
	if (!identifier || !/^[A-Za-z_$][\w$]*$/.test(identifier)) return false;
	if (ROOT_IDENTIFIERS.has(identifier)) return false;
	const source = `${entry?.source ?? ''}`;
	if (source === 'DND5E config' || source.startsWith('DND5E ')) return false;
	return true;
}

function isLegacyCompatibilityIdentifier(identifier) {
	return ['targetActor'].includes(`${identifier ?? ''}`.trim());
}

function isD20AssistContext(changeKey) {
	const normalized = `${changeKey ?? ''}`.toLowerCase();
	if (!normalized) return false;
	const isDamageContext = normalized.includes('damage');
	return normalized.includes('attack')
		|| normalized.includes('check')
		|| normalized.includes('save')
		|| isDamageContext
		|| normalized.includes('d20')
		|| normalized.includes('critical')
		|| normalized.includes('fumble');
}

function isNonDamageBonusContext(changeKey) {
	const normalized = `${changeKey ?? ''}`.toLowerCase();
	if (!normalized) return false;
	const isBonus = normalized.includes('.bonus');
	if (!isBonus) return false;
	const isDamage = normalized.includes('damage');
	if (isDamage) return false;
	return normalized.includes('attack')
		|| normalized.includes('save')
		|| normalized.includes('check')
		|| normalized.includes('skill')
		|| normalized.includes('tool')
		|| normalized.includes('d20');
}

function filterRollAwareEntriesForChangeKey(entries, changeKey) {
	if (!isNonDamageBonusContext(changeKey)) return entries;
	return entries.filter((entry) => !COMPUTED_ROLL_AWARE_ENTRIES.has(entry));
}

function getContextSandboxFallbackEntries(changeKey) {
	const normalized = `${changeKey ?? ''}`.toLowerCase();
	if (!normalized) return [];
	const entries = [];
	const isRollLike = isD20AssistContext(normalized);
	if (isRollLike) {
		entries.push(
			'ability',
			'skill',
			'tool',
			'hasProficiency',
			'hasExpertise',
			'hasHalfProficiency',
			'hasFullProficiency',
			'isConcentration',
			'isDeathSave',
			'isInitiative',
			'targetValue',
		);
		if (!isNonDamageBonusContext(normalized)) {
			entries.push(
				'd20Total',
				'd20Result',
				'd20ResultOverTarget',
				'attackRollTotal',
				'attackRollD20',
				'attackRollOverAC',
			);
		}
	}
	if ((normalized.includes('attack') || normalized.includes('damage')) && !isNonDamageBonusContext(normalized)) {
		entries.push(
			'hasAttack',
			'hasDamage',
			'hasHealing',
			'hasSave',
			'hasCheck',
			'opponentAC',
			'targetOverAC',
		);
	}
	return dedupe(entries);
}

function addAssistFallbackPaths(pathsByRoot) {
	const actorRoots = ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'];
	const actorFallbacks = ['abilities', 'skills', 'tools', 'actionType', 'damageTypes'];
	for (const root of actorRoots) {
		const paths = pathsByRoot?.[root];
		if (!Array.isArray(paths)) continue;
		for (const suffix of actorFallbacks) {
			const path = `${root}.${suffix}`;
			if (!paths.includes(path)) paths.push(path);
		}
	}
	for (const root of ['activity', 'originActivity']) {
		const paths = pathsByRoot?.[root];
		if (!Array.isArray(paths)) continue;
		for (const suffix of ['actionType', 'damageTypes', 'healingTypes', 'defaultDamageType', 'activityType', 'identifier', 'uuid']) {
			const path = `${root}.${suffix}`;
			if (!paths.includes(path)) paths.push(path);
		}
	}
	for (const root of ['item', 'originItem']) {
		const paths = pathsByRoot?.[root];
		if (!Array.isArray(paths)) continue;
		for (const suffix of ['itemType', 'attackMode', 'mastery', 'itemProperties', 'actionType', 'damageTypes', 'defaultDamageType']) {
			const path = `${root}.${suffix}`;
			if (!paths.includes(path)) paths.push(path);
		}
	}
	for (const root of ['item', 'originItem', 'activity', 'originActivity']) {
		const paths = pathsByRoot?.[root];
		if (!Array.isArray(paths)) continue;
		const damageKeys = Object.keys(CONFIG?.DND5E?.damageTypes ?? {});
		const healingKeys = Object.keys(CONFIG?.DND5E?.healingTypes ?? {});
		for (const key of dedupe([...damageKeys, ...healingKeys])) {
			const path = `${root}.damageTypes.${key}`;
			if (!paths.includes(path)) paths.push(path);
		}
	}
}

function renderAssistActionFieldset(title, values, dataAttribute, kind = 'button', section = '', compact = false) {
	const items = (values ?? [])
		.map((value) => {
			if (kind === 'button') {
				const label = `${value?.label ?? value?.value ?? ''}`.trim();
				const insert = `${value?.value ?? ''}`.trim();
				if (!label || !insert) return '';
				return `<button type="button" class="ac5e-effect-value-assist-chip" data-${dataAttribute}="${escapeHtml(insert)}">${escapeHtml(label)}</button>`;
			}
			const entry = `${value ?? ''}`.trim();
			if (!entry) return '';
			return `<button type="button" class="ac5e-effect-value-assist-chip" data-${dataAttribute}="${escapeHtml(entry)}">${escapeHtml(entry)}</button>`;
		})
		.filter(Boolean)
		.join('');
	const content = items || '<p class="ac5e-effect-value-assist-empty">No entries</p>';
	const listAttr = section ? ` data-ac5e-assist-entry-list="${escapeHtml(section)}"` : '';
	return `
		<fieldset class="ac5e-effect-value-assist-fieldset${compact ? ' ac5e-effect-value-assist-fieldset-compact' : ''}">
			<legend>${escapeHtml(title)}</legend>
			<div class="ac5e-effect-value-assist-chip-list"${listAttr}>
				${content}
			</div>
		</fieldset>
	`;
}

function resetAssistBrowserContext(root, assist, selectionState, textarea) {
	root.dataset.ac5eAssistActiveRoot = '';
	root.dataset.ac5eAssistChain = '[]';
	root.dataset.ac5eAssistFilter = '';
	setAssistActivePath(root, '');
	renderAssistStage(root, assist, selectionState, textarea);
}

function prepareLambdaAssist(root, assist) {
	if (!(root instanceof HTMLElement)) return;
	const textarea = root.querySelector('textarea[name="value"]');
	if (!(textarea instanceof HTMLTextAreaElement)) return;
	const selectionState = { userMovedCaret: false, start: null, end: null };
	const rememberSelection = () => {
		selectionState.userMovedCaret = true;
		selectionState.start = textarea.selectionStart;
		selectionState.end = textarea.selectionEnd;
		selectionState.recentAssistInsert = null;
	};
	for (const eventName of ['click', 'keyup', 'select', 'mouseup']) {
		textarea.addEventListener(eventName, rememberSelection);
	}
	textarea.addEventListener('keydown', (event) => {
		const key = event.key ?? '';
		if (key === 'Enter') {
			if (applyFocusedAssistMatch(textarea, root, assist, selectionState)) event.preventDefault();
			return;
		}
		if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'ArrowRight' || key === 'ArrowLeft') {
			const direction = (key === 'ArrowUp' || key === 'ArrowLeft') ? -1 : 1;
			if (cycleAssistEntryFromInput(textarea, root, assist, direction)) event.preventDefault();
			return;
		}
		if (key !== 'Tab' || event.ctrlKey || event.metaKey) return;
		const tabDirection = event.shiftKey ? -1 : 1;
		if (cycleAssistEntryFromInput(textarea, root, assist, tabDirection)) {
			event.preventDefault();
			return;
		}
		if (applyAssistTabCompletion(textarea, root, assist, selectionState, tabDirection)) {
			event.preventDefault();
			return;
		}
		if (handleAssistTabNavigation(textarea, selectionState, tabDirection)) event.preventDefault();
	});
	const syncFromInput = () => {
		syncAssistBrowserFromInput(root, assist, selectionState, textarea);
		updateAssistEntryHighlights(root, textarea, assist);
	};
	textarea.addEventListener('input', syncFromInput);
	textarea.addEventListener('click', syncFromInput);
	textarea.addEventListener('keyup', (event) => {
		if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab', 'Shift'].includes(event.key)) return;
		syncFromInput();
	});
	for (const button of root.querySelectorAll('[data-ac5e-assist-insert]')) {
		button.addEventListener('click', () => insertAtCursor(textarea, button.dataset.ac5eAssistInsert ?? '', selectionState));
	}
	for (const button of root.querySelectorAll('[data-ac5e-assist-entry]')) {
		button.addEventListener('click', () => {
			const value = (button.dataset.ac5eAssistEntry ?? '').trim();
			if (!value) return;
			const insertion = resolveAssistEntryInsertion(value);
			replaceTokenAtCursorOrInsert(textarea, insertion, selectionState);
		});
	}
	for (const button of root.querySelectorAll('[data-ac5e-assist-root-insert]')) {
		button.addEventListener('click', () => {
			const rootName = (button.dataset.ac5eAssistRootInsert ?? '').trim();
			if (!rootName) return;
			replaceTokenAtCursorOrInsert(textarea, `${rootName}.`, selectionState);
			root.dataset.ac5eAssistActiveRoot = rootName;
			root.dataset.ac5eAssistChain = '[]';
			root.dataset.ac5eAssistFilter = '';
			setAssistActivePath(root, '');
			renderAssistStage(root, assist, selectionState, textarea);
		});
	}
	setAssistActivePath(root, '');
	root.dataset.ac5eAssistFilter = '';
	renderAssistStage(root, assist, selectionState, textarea);
	updateAssistEntryHighlights(root, textarea, assist);
}

function setAssistActivePath(root, path) {
	root.dataset.ac5eAssistActivePath = path;
}

function buildAssistPathTree(rootPath, paths, ac5eAddedPaths = new Set(), ac5eAddedPrefixes = new Set()) {
	const root = { label: rootPath, path: rootPath, terminal: true, ac5eAdded: false, ac5eActorAdded: false, ac5eItemAdded: false, children: [] };
	const childrenByPath = new Map();
	for (const path of paths ?? []) {
		if (path !== rootPath && !path.startsWith(`${rootPath}.`)) continue;
		const segments = path === rootPath ? [] : path.split('.').filter((segment, index) => !(index === 0 && segment === rootPath));
		if (!segments.length) {
			root.terminal = true;
			if (isAc5eAddedPath(path, ac5eAddedPaths, ac5eAddedPrefixes)) {
				root.ac5eAdded = true;
				root.ac5eActorAdded = isActorAc5eAddedPath(path);
				root.ac5eItemAdded = isItemActivityAc5eAddedPath(path);
			}
			continue;
		}
		let branch = root;
		let currentPath = rootPath;
		for (const segment of segments) {
			currentPath = `${currentPath}.${segment}`;
			let next = childrenByPath.get(currentPath);
			if (!next) {
				next = { label: segment, path: currentPath, terminal: false, ac5eAdded: false, ac5eActorAdded: false, ac5eItemAdded: false, children: [] };
				childrenByPath.set(currentPath, next);
				branch.children.push(next);
			}
			if (isAc5eAddedPath(currentPath, ac5eAddedPaths, ac5eAddedPrefixes)) {
				next.ac5eAdded = true;
				if (isActorAc5eAddedPath(currentPath)) next.ac5eActorAdded = true;
				if (isItemActivityAc5eAddedPath(currentPath)) next.ac5eItemAdded = true;
			}
			branch = next;
		}
		branch.terminal = true;
		if (isAc5eAddedPath(path, ac5eAddedPaths, ac5eAddedPrefixes)) {
			branch.ac5eAdded = true;
			if (isActorAc5eAddedPath(path)) branch.ac5eActorAdded = true;
			if (isItemActivityAc5eAddedPath(path)) branch.ac5eItemAdded = true;
		}
	}
	return root;
}

function isAc5eAddedPath(path, ac5eAddedPaths = new Set(), ac5eAddedPrefixes = new Set()) {
	if (!path) return false;
	if (ac5eAddedPaths.has(path)) return true;
	for (const prefix of ac5eAddedPrefixes) {
		if (path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(prefix)) return true;
	}
	return false;
}

function isActorAc5eAddedPath(path) {
	return AC5E_ACTOR_ADDED_LAMBDA_PATHS.has(path);
}

function isItemActivityAc5eAddedPath(path) {
	return AC5E_ITEM_ACTIVITY_ADDED_LAMBDA_PATHS.has(path);
}

function renderAssistStage(root, assist, selectionState, textarea) {
	const container = root.querySelector('[data-ac5e-assist-stage]');
	if (!(container instanceof HTMLElement)) return;
	const activeRoot = root.dataset.ac5eAssistActiveRoot ?? '';
	const chain = parseAssistChain(root.dataset.ac5eAssistChain ?? '');
	if (!activeRoot) {
		container.innerHTML = renderAssistIdleStage();
		return;
	}
	const tree = assist?.treesByRoot?.[activeRoot];
	const parentNode = chain.length ? findTreeNodeByPath(tree, chain[chain.length - 1]) : tree;
	const allNodes = parentNode?.children ?? [];
	const filterText = (root.dataset.ac5eAssistFilter ?? '').trim().toLowerCase();
	const nodes = filterText ? allNodes.filter((node) => (node?.label ?? '').toLowerCase().startsWith(filterText)) : allNodes;
	const headerPath = chain.length ? chain[chain.length - 1] : activeRoot;
	const activePath = root.dataset.ac5eAssistActivePath ?? '';
	const fallbackPath =
		nodes.length === 1 ? nodes[0]?.path
		: filterText ? nodes.find((node) => (node?.label ?? '').toLowerCase() === filterText)?.path
		: '';
	const valuePath = activePath || fallbackPath || headerPath || '';
	root.dataset.ac5eAssistValuePath = valuePath;
	const valueChoices = nodes.length ? [] : resolveAssistValueChoices(valuePath, assist?.enumValues);
	container.innerHTML = renderAssistNodeStage(nodes, headerPath, chain.length > 0, valueChoices);
	const backButton = container.querySelector('[data-ac5e-assist-back]');
	backButton?.addEventListener('click', () => {
		const nextChain = chain.slice(0, -1);
		root.dataset.ac5eAssistChain = JSON.stringify(nextChain);
		root.dataset.ac5eAssistFilter = '';
		setAssistActivePath(root, nextChain[nextChain.length - 1] ?? '');
		renderAssistStage(root, assist, selectionState, textarea);
	});
	const rootsButton = container.querySelector('[data-ac5e-assist-roots]');
	rootsButton?.addEventListener('click', () => {
		resetAssistBrowserContext(root, assist, selectionState, textarea);
	});
	for (const nodeButton of container.querySelectorAll('[data-ac5e-assist-node]')) {
		const nodePath = nodeButton.dataset.ac5eAssistNode ?? '';
		const node = findTreeNodeByPath(tree, nodePath);
		nodeButton.addEventListener('click', () => {
			if (!node) return;
			if (node.children?.length) {
				root.dataset.ac5eAssistChain = JSON.stringify([...chain, node.path]);
				root.dataset.ac5eAssistFilter = '';
				setAssistActivePath(root, '');
				renderAssistStage(root, assist, selectionState, textarea);
				return;
			}
			setAssistActivePath(root, node.path);
			const insertionPath = resolveAssistNodeInsertionPath(textarea, node.path);
			replaceTokenAtCursorOrInsert(textarea, `${insertionPath} `, selectionState);
			resetAssistBrowserContext(root, assist, selectionState, textarea);
		});
		nodeButton.addEventListener('dblclick', () => {
			if (!node?.terminal) return;
			setAssistActivePath(root, node.path);
			const insertionPath = resolveAssistNodeInsertionPath(textarea, node.path);
			replaceTokenAtCursorOrInsert(textarea, `${insertionPath} `, selectionState);
			resetAssistBrowserContext(root, assist, selectionState, textarea);
		});
	}
	for (const valueButton of container.querySelectorAll('[data-ac5e-assist-value]')) {
		valueButton.addEventListener('click', () => {
			const value = valueButton.dataset.ac5eAssistValue ?? '';
			if (!value) return;
			insertAssistValueAtCursor(textarea, value, root.dataset.ac5eAssistValuePath ?? '', selectionState);
		});
	}
}

function syncAssistBrowserFromInput(root, assist, selectionState, textarea) {
	if (!(root instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) return;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	if (!token) {
		if (root.dataset.ac5eAssistActiveRoot) resetAssistBrowserContext(root, assist, selectionState, textarea);
		return;
	}
	const context = resolveAssistInputContext(token, assist, textarea.value, caret, root.dataset.ac5eAssistActiveRoot ?? '');
	if (!context) {
		if (root.dataset.ac5eAssistActiveRoot && !token.includes('.')) resetAssistBrowserContext(root, assist, selectionState, textarea);
		return;
	}
	const nextChain = JSON.stringify(context.chain ?? []);
	const nextRoot = context.root ?? '';
	const nextFilter = context.filter ?? '';
	const changed = root.dataset.ac5eAssistActiveRoot !== nextRoot
		|| (root.dataset.ac5eAssistChain ?? '[]') !== nextChain
		|| (root.dataset.ac5eAssistFilter ?? '') !== nextFilter;
	if (!changed) return;
	root.dataset.ac5eAssistActiveRoot = nextRoot;
	root.dataset.ac5eAssistChain = nextChain;
	root.dataset.ac5eAssistFilter = nextFilter;
	setAssistActivePath(root, '');
	renderAssistStage(root, assist, selectionState, textarea);
}

function resolveAssistInputContext(token, assist, fullText = '', caret = 0, activeRoot = '') {
	const normalized = (token ?? '').trim();
	if (!normalized) return null;
	const trailingDot = normalized.endsWith('.');
	const trimmed = trailingDot ? normalized.slice(0, -1) : normalized;
	const segments = trimmed.split('.').filter(Boolean);
	if (!segments.length) return null;
	const root = segments[0];
	if (assist?.treesByRoot?.[root]) {
		const tree = assist.treesByRoot[root];
		if (trailingDot) {
			const chain = buildAssistChainForPath(tree, root, trimmed);
			return { root, chain, filter: '' };
		}
		if (segments.length === 1) return { root, chain: [], filter: '' };
		const parentPath = segments.slice(0, -1).join('.');
		const filter = segments[segments.length - 1] ?? '';
		const chain = buildAssistChainForPath(tree, root, parentPath);
		return { root, chain, filter };
	}
	const enumPathKey = (segments[0] ?? '').trim();
	const enumPathRoots = {
		damageTypes: ['item', 'activity', 'originItem', 'originActivity'],
		defaultDamageType: ['item', 'activity', 'originItem', 'originActivity'],
		actionType: ['activity', 'originActivity', 'item', 'originItem'],
		attackMode: ['item', 'originItem'],
		mastery: ['item', 'originItem'],
		itemProperties: ['item', 'originItem'],
	};
	const candidateRoots = enumPathRoots[enumPathKey];
	if (!candidateRoots?.length) return null;
	const inferredRoot = inferAssistRootFromTextContext(fullText, caret, assist, candidateRoots, activeRoot);
	if (!inferredRoot || !assist?.treesByRoot?.[inferredRoot]) return null;
	const inferredPath = `${inferredRoot}.${enumPathKey}`;
	return { root: inferredRoot, chain: [inferredPath], filter: '' };
}

function inferAssistRootFromTextContext(fullText, caret, assist, candidateRoots, activeRoot = '') {
	const roots = (candidateRoots ?? []).filter((root) => assist?.treesByRoot?.[root]);
	if (!roots.length) return '';
	if (activeRoot && roots.includes(activeRoot)) return activeRoot;
	const before = `${fullText ?? ''}`.slice(0, Math.max(0, Number(caret ?? 0)));
	let bestRoot = '';
	let bestIndex = -1;
	for (const root of roots) {
		const pattern = new RegExp(`\\b${root}\\.[A-Za-z_$][\\w$-]*(?:\\.[A-Za-z_$][\\w$-]*)*`, 'g');
		let match = pattern.exec(before);
		while (match) {
			const index = Number(match.index ?? -1);
			if (index > bestIndex) {
				bestIndex = index;
				bestRoot = root;
			}
			match = pattern.exec(before);
		}
	}
	return bestRoot || roots[0];
}

function applyAssistTabCompletion(textarea, root, assist, selectionState, direction = 1) {
	if (direction > 0 && applyAssistTabRootCompletion(textarea, root, assist, selectionState)) return true;
	if (direction > 0 && applyAssistTabPathCompletion(textarea, root, assist, selectionState)) return true;
	return applyAssistTabEntryCompletion(textarea, root, assist, selectionState, direction);
}

function applyAssistTabRootCompletion(textarea, root, assist, selectionState) {
	if (!(textarea instanceof HTMLTextAreaElement)) return false;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	const normalized = (token ?? '').trim();
	if (!normalized || normalized.includes('.')) return false;
	const roots = (assist?.entryPoints ?? []).map((entry) => (entry?.value ?? '').trim()).filter(Boolean);
	const matches = roots.filter((entry) => entry.toLowerCase().startsWith(normalized.toLowerCase()));
	if (!matches.length) return false;
	const entryMatches = getAssistEntryMatchesInUiOrder(root, normalized);
	const uniqueMatches = new Set([...matches, ...entryMatches]);
	if (uniqueMatches.size > 1) return false;
	const selected = matches[0];
	replaceTokenAtCursorOrInsert(textarea, `${selected}.`, selectionState);
	root.dataset.ac5eAssistActiveRoot = selected;
	root.dataset.ac5eAssistChain = '[]';
	root.dataset.ac5eAssistFilter = '';
	setAssistActivePath(root, '');
	renderAssistStage(root, assist, selectionState, textarea);
	return true;
}

function applyAssistTabPathCompletion(textarea, root, assist, selectionState) {
	if (!(textarea instanceof HTMLTextAreaElement)) return false;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	const normalized = (token ?? '').trim();
	if (normalized && !normalized.includes('.')) {
		const activeRoot = root.dataset.ac5eAssistActiveRoot ?? '';
		if (activeRoot && assist?.treesByRoot?.[activeRoot]) {
			const chain = parseAssistChain(root.dataset.ac5eAssistChain ?? '[]');
			const tree = assist.treesByRoot[activeRoot];
			const parentNode = chain.length ? findTreeNodeByPath(tree, chain[chain.length - 1]) : tree;
			const allNodes = parentNode?.children ?? [];
			const match = allNodes.find((node) => (node?.label ?? '').toLowerCase().startsWith(normalized.toLowerCase()));
			if (match?.path) {
				replaceTokenAtCursorOrInsert(textarea, match.path, selectionState);
				root.dataset.ac5eAssistFilter = '';
				setAssistActivePath(root, match.path);
				renderAssistStage(root, assist, selectionState, textarea);
				return true;
			}
		}
	}
	if (!token) return false;
	const context = resolveAssistInputContext(token, assist);
	if (!context?.root) return false;
	const tree = assist?.treesByRoot?.[context.root];
	if (!tree) return false;
	const chain = Array.isArray(context.chain) ? context.chain : [];
	const parentNode = chain.length ? findTreeNodeByPath(tree, chain[chain.length - 1]) : tree;
	const allNodes = parentNode?.children ?? [];
	const filterText = (context.filter ?? '').trim().toLowerCase();
	const nodes = filterText ? allNodes.filter((node) => (node?.label ?? '').toLowerCase().startsWith(filterText)) : allNodes;
	if (!nodes.length) return false;
	replaceTokenAtCursorOrInsert(textarea, nodes[0].path, selectionState);
	root.dataset.ac5eAssistActiveRoot = context.root;
	root.dataset.ac5eAssistChain = JSON.stringify(context.chain ?? []);
	root.dataset.ac5eAssistFilter = '';
	setAssistActivePath(root, nodes[0].path);
	renderAssistStage(root, assist, selectionState, textarea);
	return true;
}

function applyAssistTabEntryCompletion(textarea, root, assist, selectionState, direction = 1) {
	if (!(textarea instanceof HTMLTextAreaElement)) return false;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	const normalized = (token ?? '').trim();
	if (!normalized || normalized.includes('.')) return false;
	const matchButtons = getAssistMatchButtonsInUiOrder(root, normalized, token);
	if (!matchButtons.length) return false;
	const cycleResult = cycleAssistButtonFocus(root, matchButtons, direction);
	if (!cycleResult) return false;
	updateAssistEntryHighlights(root, textarea, assist);
	return true;
}

function updateAssistEntryHighlights(root, textarea, assist, explicitMatches = null) {
	if (!(root instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) return;
	const caret = Number(textarea.selectionStart ?? 0);
	const rawToken = extractAutocompleteToken(textarea.value, caret);
	const token = rawToken.toLowerCase();
	const operatorOnlyMode = shouldIncludeOperatorMatches(rawToken, root, token);
	const matches = operatorOnlyMode
		? []
		: (explicitMatches ?? (token ? getAssistEntryMatchesInUiOrder(root, token) : []));
	const allMatchButtons = token ? getAssistMatchButtonsInUiOrder(root, token, rawToken) : [];
	const rootMatchButtons = allMatchButtons.filter((button) => Boolean(button.dataset.ac5eAssistRootInsert));
	const operatorMatchButtons = allMatchButtons.filter((button) => Boolean(button.dataset.ac5eAssistInsert));
	const rootMatches = rootMatchButtons.map((button) => normalizeAssistMatchKey(button.dataset.ac5eAssistRootInsert ?? '')).filter(Boolean);
	const entryMatches = matches.map((value) => normalizeAssistMatchKey(value)).filter(Boolean);
	const operatorMatches = operatorMatchButtons.map((button) => getAssistButtonValue(button)).filter(Boolean);
	const combined = dedupe([...rootMatches, ...entryMatches, ...operatorMatches]);
	const single = combined.length === 1 ? combined[0] : '';
	const focused = normalizeAssistMatchKey(root.dataset.ac5eAssistEntryFocus ?? '');
	const resolvedFocus = combined.length
		? (combined.includes(focused) ? focused : combined[0])
		: '';
	root.dataset.ac5eAssistEntryFocus = resolvedFocus;
	for (const button of root.querySelectorAll('[data-ac5e-assist-entry]')) {
		const value = button.dataset.ac5eAssistEntry ?? '';
		const lower = value.toLowerCase();
		const matchesToken = operatorOnlyMode ? false : (token ? assistEntryMatchesToken(lower, token) : false);
		const key = normalizeAssistMatchKey(value);
		button.classList.toggle('active', matchesToken || (resolvedFocus && key === resolvedFocus));
		button.classList.toggle('ac5e-effect-value-assist-focused', Boolean(resolvedFocus) && key === resolvedFocus);
		button.classList.toggle('ac5e-effect-value-assist-single-match', Boolean(single) && key === single);
		button.hidden = false;
	}
	const rootToken = token.includes('.') ? '' : token;
	for (const button of root.querySelectorAll('[data-ac5e-assist-root-insert]')) {
		const value = normalizeAssistMatchKey(button.dataset.ac5eAssistRootInsert ?? '');
		const starts = operatorOnlyMode ? false : (rootToken ? value.startsWith(rootToken) : false);
		const isFocused = Boolean(resolvedFocus) && value === resolvedFocus;
		button.classList.toggle('active', starts || isFocused);
		button.classList.toggle('ac5e-effect-value-assist-focused', isFocused);
		button.classList.toggle('ac5e-effect-value-assist-single-match', Boolean(single) && value === single);
	}
	for (const button of root.querySelectorAll('[data-ac5e-assist-insert]')) {
		const key = getAssistButtonValue(button);
		const matchesToken = token ? shouldIncludeOperatorMatches(rawToken, root, token) && operatorMatchesToken(button, rawToken) : false;
		const isFocused = Boolean(resolvedFocus) && key === resolvedFocus;
		button.classList.toggle('active', matchesToken || isFocused);
		button.classList.toggle('ac5e-effect-value-assist-focused', isFocused);
		button.classList.toggle('ac5e-effect-value-assist-single-match', Boolean(single) && key === single);
	}
}

function cycleAssistEntryFocus(root, matches, direction = 1) {
	if (!Array.isArray(matches) || !matches.length) return null;
	const buttons = Array.from(root.querySelectorAll('[data-ac5e-assist-entry]')).filter((button) => matches.includes(button.dataset.ac5eAssistEntry ?? ''));
	if (!buttons.length) return null;
	const current = root.dataset.ac5eAssistEntryFocus ?? '';
	let index = buttons.findIndex((button) => (button.dataset.ac5eAssistEntry ?? '') === current);
	if (index < 0) index = direction < 0 ? buttons.length : -1;
	index = (index + (direction < 0 ? -1 : 1) + buttons.length) % buttons.length;
	const target = buttons[index];
	const selected = target?.dataset.ac5eAssistEntry ?? '';
	if (selected) root.dataset.ac5eAssistEntryFocus = selected;
	return { selected };
}

function cycleAssistEntryFromInput(textarea, root, assist, direction = 1) {
	if (!(textarea instanceof HTMLTextAreaElement)) return false;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	const normalized = (token ?? '').trim();
	if (!normalized || normalized.includes('.')) return false;
	const matchButtons = getAssistMatchButtonsInUiOrder(root, normalized, token);
	if (!matchButtons.length) return false;
	const cycled = cycleAssistButtonFocus(root, matchButtons, direction);
	if (!cycled?.selected) return false;
	updateAssistEntryHighlights(root, textarea, assist);
	return true;
}

function applyFocusedAssistMatch(textarea, root, assist, selectionState) {
	if (!(textarea instanceof HTMLTextAreaElement)) return false;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	const normalized = (token ?? '').trim();
	if (!normalized || normalized.includes('.')) return false;
	const matches = getAssistMatchButtonsInUiOrder(root, normalized, token);
	if (!matches.length) return false;
	const focused = normalizeAssistMatchKey(root.dataset.ac5eAssistEntryFocus ?? '');
	const selectedButton = matches.find((button) => getAssistButtonValue(button) === focused) ?? matches[0];
	if (!(selectedButton instanceof HTMLElement)) return false;
	const selectedOperator = `${selectedButton.dataset.ac5eAssistInsert ?? ''}`.trim();
	if (selectedOperator) {
		replaceTokenAtCursorOrInsert(textarea, selectedOperator, selectionState);
		updateAssistEntryHighlights(root, textarea, assist);
		return true;
	}
	const selectedRoot = (selectedButton.dataset.ac5eAssistRootInsert ?? '').trim();
	if (selectedRoot) {
		replaceTokenAtCursorOrInsert(textarea, `${selectedRoot}.`, selectionState);
		root.dataset.ac5eAssistActiveRoot = selectedRoot;
		root.dataset.ac5eAssistChain = '[]';
		root.dataset.ac5eAssistFilter = '';
		setAssistActivePath(root, '');
		renderAssistStage(root, assist, selectionState, textarea);
		updateAssistEntryHighlights(root, textarea, assist);
		return true;
	}
	const selected = (selectedButton.dataset.ac5eAssistEntry ?? '').trim();
	if (!selected) return false;
	const insertion = resolveAssistEntryInsertion(selected);
	replaceTokenAtCursorOrInsert(textarea, insertion, selectionState);
	updateAssistEntryHighlights(root, textarea, assist);
	return true;
}

function resolveAssistEntryInsertion(entry) {
	const value = `${entry ?? ''}`.trim();
	if (!value) return '';
	if (['damageTypes', 'defaultDamageType', 'actionType', 'attackMode', 'mastery', 'itemProperties', 'activityType', 'creatureType', 'abilities', 'skills', 'tools'].includes(value)) return `${value}.`;
	return `${value} `;
}

function applyFocusedAssistRoot(textarea, root, assist, selectionState) {
	if (!(textarea instanceof HTMLTextAreaElement)) return false;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	const normalized = (token ?? '').trim();
	if (!normalized || normalized.includes('.')) return false;
	const roots = (assist?.entryPoints ?? []).map((entry) => `${entry?.value ?? ''}`.trim()).filter(Boolean);
	const matches = roots.filter((entry) => entry.toLowerCase().startsWith(normalized.toLowerCase()));
	if (!matches.length) return false;
	const selected = matches[0];
	replaceTokenAtCursorOrInsert(textarea, `${selected}.`, selectionState);
	root.dataset.ac5eAssistActiveRoot = selected;
	root.dataset.ac5eAssistChain = '[]';
	root.dataset.ac5eAssistFilter = '';
	setAssistActivePath(root, '');
	renderAssistStage(root, assist, selectionState, textarea);
	return true;
}

function assistEntryMatchesToken(entry, token) {
	const value = `${entry ?? ''}`.toLowerCase();
	const query = `${token ?? ''}`.toLowerCase().trim();
	if (!value || !query) return false;
	return value.includes(query);
}

function getAssistMatchButtonsInUiOrder(root, token, rawToken = '') {
	if (!(root instanceof HTMLElement)) return [];
	const query = `${token ?? ''}`.toLowerCase().trim();
	if (!query) return [];
	const buttons = [];
	if (shouldIncludeOperatorMatches(rawToken, root, query)) {
		for (const button of root.querySelectorAll('[data-ac5e-assist-insert]')) {
			if (!operatorMatchesToken(button, rawToken)) continue;
			buttons.push(button);
		}
		return buttons;
	}
	for (const button of root.querySelectorAll('[data-ac5e-assist-root-insert], [data-ac5e-assist-entry]')) {
		const value = getAssistButtonValue(button).trim();
		if (!value) continue;
		if (!assistEntryMatchesToken(value, query)) continue;
		buttons.push(button);
	}
	return buttons;
}

function getAssistButtonValue(button) {
	if (!(button instanceof HTMLElement)) return '';
	if (button.dataset.ac5eAssistInsert) return `op:${normalizeAssistMatchKey(button.dataset.ac5eAssistInsert ?? '')}`;
	return normalizeAssistMatchKey(button.dataset.ac5eAssistRootInsert ?? button.dataset.ac5eAssistEntry ?? '');
}

function cycleAssistButtonFocus(root, buttons, direction = 1) {
	if (!(root instanceof HTMLElement)) return null;
	if (!Array.isArray(buttons) || !buttons.length) return null;
	const current = normalizeAssistMatchKey(root.dataset.ac5eAssistEntryFocus ?? '');
	let index = buttons.findIndex((button) => getAssistButtonValue(button) === current);
	if (index < 0) index = direction < 0 ? buttons.length : -1;
	index = (index + (direction < 0 ? -1 : 1) + buttons.length) % buttons.length;
	const target = buttons[index];
	const selected = getAssistButtonValue(target);
	if (selected) root.dataset.ac5eAssistEntryFocus = selected;
	return { selected };
}

function normalizeAssistMatchKey(value) {
	return `${value ?? ''}`.trim().toLowerCase();
}

function shouldIncludeOperatorMatches(token, root = null, normalizedToken = '') {
	const raw = `${token ?? ''}`.trim();
	if (!raw || raw.includes('.')) return false;
	if (!/[A-Z]/.test(raw)) return false;
	if (!(root instanceof HTMLElement)) return true;
	for (const button of root.querySelectorAll('[data-ac5e-assist-insert]')) {
		if (operatorMatchesToken(button, raw)) return true;
	}
	return false;
}

function operatorMatchesToken(button, token) {
	if (!(button instanceof HTMLElement)) return false;
	const query = `${token ?? ''}`.trim().toUpperCase();
	if (!query) return false;
	const keys = getOperatorShortcutKeys(button);
	return keys.some((key) => key.startsWith(query));
}

function getOperatorShortcutKeys(button) {
	const insert = `${button?.dataset?.ac5eAssistInsert ?? ''}`.trim();
	if (insert === '&&') return ['A', 'AND'];
	if (insert === '||') return ['O', 'OR'];
	if (insert === '!') return ['N', 'NOT'];
	if (insert === '==') return ['E', 'EQ'];
	if (insert === '!=') return ['NE', 'D', 'DIFF'];
	if (insert === '>') return ['M', 'MORE', 'GT'];
	if (insert === '>=') return ['ME', 'MOREEQ', 'GTE'];
	if (insert === '<') return ['L', 'LESS', 'LT'];
	if (insert === '<=') return ['LE', 'LESSEQ', 'LTE'];
	if (insert === '()') return ['P', 'PAR', 'PAREN'];
	if (insert === '(condition ? trueValue : falseValue)') return ['T', 'TERNARY'];
	return [];
}

function getAssistEntryMatchesInUiOrder(root, token) {
	if (!(root instanceof HTMLElement)) return [];
	if (!token) return [];
	const matches = [];
	for (const button of root.querySelectorAll('[data-ac5e-assist-entry]')) {
		const value = (button.dataset.ac5eAssistEntry ?? '').trim();
		if (!value) continue;
		if (!assistEntryMatchesToken(value, token)) continue;
		matches.push(value);
	}
	return matches;
}

function buildAssistChainForPath(tree, root, path) {
	const chain = [];
	const segments = (path ?? '').split('.').filter(Boolean);
	let currentPath = root;
	for (let index = 1; index < segments.length; index += 1) {
		currentPath = `${currentPath}.${segments[index]}`;
		if (!findTreeNodeByPath(tree, currentPath)) break;
		chain.push(currentPath);
	}
	return chain;
}

function parseAssistChain(rawChain) {
	try {
		const parsed = JSON.parse(rawChain || '[]');
		return Array.isArray(parsed) ? parsed.filter((value) => typeof value === 'string' && value) : [];
	} catch (_err) {
		return [];
	}
}

function renderAssistIdleStage() {
	return `
		<div class="ac5e-effect-value-assist-toolbar"><span>Root</span></div>
		<div class="ac5e-effect-value-assist-scroll">
			<div class="ac5e-effect-value-assist-list"><p class="ac5e-effect-value-assist-empty">Type or select an actor/item root (for example <code>rollingActor.</code>) to browse Lambda Paths.</p></div>
		</div>
	`;
}

function renderAssistNodeStage(nodes, headerPath, canGoBack, valueChoices = []) {
	const items = (nodes ?? [])
		.map((node) => {
		const marker = node.children?.length ? '>' : '';
		const ac5eMarker = node.ac5eActorAdded ? '*' : '';
		return `<button type="button" class="ac5e-effect-value-assist-node" data-ac5e-assist-node="${escapeHtml(node.path)}" title="${escapeHtml(node.path)}">${escapeHtml(node.label)}${ac5eMarker ? ` ${ac5eMarker}` : ''} ${marker}</button>`;
	}).join('');
	const empty = items || '<p class="ac5e-effect-value-assist-empty">No paths available</p>';
	const values = (valueChoices ?? [])
		.map((value) => `<button type="button" class="ac5e-effect-value-assist-node" data-ac5e-assist-value="${escapeHtml(`'${value.replaceAll("'", "\\'")}'`)}">${escapeHtml(value)}</button>`)
		.join('');
	const valuesSection = values ?
		`<div class="ac5e-effect-value-assist-toolbar"><span>Values</span></div><div class="ac5e-effect-value-assist-list">${values}</div>`
		: '';
	return `
		<div class="ac5e-effect-value-assist-toolbar">
			<button type="button" data-ac5e-assist-roots>Roots</button>
			<button type="button" data-ac5e-assist-back ${canGoBack ? '' : 'disabled'}>Back</button>
			<span class="ac5e-effect-value-assist-current" title="${escapeHtml(headerPath)}">${escapeHtml(headerPath)}</span>
		</div>
		<div class="ac5e-effect-value-assist-scroll">
			<div class="ac5e-effect-value-assist-list">${empty}</div>
			${valuesSection}
		</div>
	`;
}

function resolveAssistValueChoices(path, enumValues) {
	const sourcePath = `${path ?? ''}`.trim();
	if (!sourcePath) return [];
	if (/\.(?:creatureType)$/.test(sourcePath)) return enumValues?.creatureTypes ?? [];
	if (/\.(?:damageTypes|defaultDamageType)$/.test(sourcePath)) return dedupe([...(enumValues?.damageTypes ?? []), ...(enumValues?.healingTypes ?? [])]);
	if (/\.(?:healingTypes)$/.test(sourcePath)) return enumValues?.healingTypes ?? [];
	if (/\.(?:actionType)$/.test(sourcePath)) return enumValues?.actionTypes ?? [];
	if (/\.(?:activityType)$/.test(sourcePath)) return enumValues?.activityTypes ?? [];
	if (/\.(?:itemType)$/.test(sourcePath)) return enumValues?.itemTypes ?? [];
	if (/\.(?:attackMode)$/.test(sourcePath)) return enumValues?.attackModes ?? [];
	if (/\.(?:mastery)$/.test(sourcePath)) return enumValues?.masteries ?? [];
	if (/\.(?:itemProperties)$/.test(sourcePath)) return enumValues?.itemProperties ?? [];
	if (/\.(?:abilities)$/.test(sourcePath)) return enumValues?.abilities ?? [];
	if (/\.(?:skills)$/.test(sourcePath)) return enumValues?.skills ?? [];
	if (/\.(?:tools)$/.test(sourcePath)) return enumValues?.tools ?? [];
	if (/\.(?:type)$/.test(sourcePath)) {
		if (/^(?:rollingActor|opponentActor|effectActor|nonEffectActor|auraActor)\./.test(sourcePath)) return enumValues?.actorTypes ?? [];
		if (/^(?:item|originItem)\./.test(sourcePath)) return enumValues?.itemTypes ?? [];
		if (/^(?:activity|originActivity)\./.test(sourcePath)) return enumValues?.activityTypes ?? [];
	}
	if (/\.(?:baseItem)$/.test(sourcePath)) return enumValues?.baseItems ?? [];
	return [];
}

function insertAssistValueAtCursor(input, quotedValue, valuePath, selectionState = null) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
	const path = `${valuePath ?? ''}`.trim();
	const value = `${quotedValue ?? ''}`.trim();
	if (!path || !value) return insertAtCursor(input, value, selectionState);
	if (path.endsWith('.damageTypes') || path.endsWith('.defaultDamageType')) {
		const normalizedValue = value.replace(/^'/, '').replace(/'$/, '').replace(/\\'/g, "'");
		const enumPath = `${path}.${normalizedValue}`;
		if (tryAppendEnumPathClause(input, enumPath, selectionState)) return;
		if (tryReplaceTrailingEnumPathToken(input, enumPath, path, selectionState)) return;
		return insertAtCursor(input, `${enumPath} `, selectionState);
	}
	if (tryAppendAssistClauseAfterOperator(input, value, path, selectionState)) return;
	if (!path.endsWith('.creatureType')) return insertAtCursor(input, value, selectionState);
	if (tryAppendCreatureTypeIncludesClause(input, value, path, selectionState)) return;
	if (tryReplaceTrailingPathWithCreatureTypeClause(input, value, path, selectionState)) return;
	insertAtCursor(input, `${path}.includes(${value})`, selectionState);
}

function tryAppendEnumPathClause(input, enumPath, selectionState = null) {
	const cursor = Number(input.selectionStart ?? input.value.length);
	const selectionEnd = Number(input.selectionEnd ?? cursor);
	if (cursor !== selectionEnd) return false;
	const before = input.value.slice(0, cursor).trimEnd();
	const escaped = escapeRegExp(enumPath.replace(/\.[^.]+$/, ''));
	const match = before.match(new RegExp(`${escaped}\\.[A-Za-z0-9_]+\\s*$`));
	if (!match) return false;
	const insertion = ` || ${enumPath}`;
	input.value = `${input.value.slice(0, cursor)}${insertion}${input.value.slice(cursor)}`;
	const nextCursor = cursor + insertion.length;
	input.focus();
	input.setSelectionRange(nextCursor, nextCursor);
	if (selectionState) {
		selectionState.start = nextCursor;
		selectionState.end = nextCursor;
		selectionState.userMovedCaret = true;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

function tryReplaceTrailingEnumPathToken(input, enumPath, basePath, selectionState = null) {
	const cursor = Number(input.selectionStart ?? input.value.length);
	const selectionEnd = Number(input.selectionEnd ?? cursor);
	if (cursor !== selectionEnd) return false;
	const before = input.value.slice(0, cursor);
	const trimmedBefore = before.trimEnd();
	const trailingDot = `${basePath}.`;
	let replacementStart = -1;
	if (trimmedBefore.endsWith(trailingDot)) replacementStart = trimmedBefore.length - trailingDot.length;
	else if (trimmedBefore.endsWith(basePath)) replacementStart = trimmedBefore.length - basePath.length;
	if (replacementStart < 0) return false;
	const nextBefore = `${before.slice(0, replacementStart)}${enumPath}`;
	input.value = `${nextBefore}${input.value.slice(cursor)}`;
	const nextCursor = nextBefore.length;
	input.focus();
	input.setSelectionRange(nextCursor, nextCursor);
	if (selectionState) {
		selectionState.start = nextCursor;
		selectionState.end = nextCursor;
		selectionState.userMovedCaret = true;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

function tryAppendAssistClauseAfterOperator(input, quotedValue, defaultPath, selectionState = null) {
	const cursor = Number(input.selectionStart ?? input.value.length);
	const selectionEnd = Number(input.selectionEnd ?? cursor);
	if (cursor !== selectionEnd) return false;
	const before = input.value.slice(0, cursor);
	const operatorMatch = before.match(/(\|\||&&)\s*$/);
	if (!operatorMatch) return false;
	const operator = operatorMatch[1];
	const insertion = buildAssistClauseFromContext(before.slice(0, operatorMatch.index), defaultPath, quotedValue);
	if (!insertion) return false;
	const nextBefore = before.replace(/(\|\||&&)\s*$/, `${operator} ${insertion}`);
	input.value = `${nextBefore}${input.value.slice(cursor)}`;
	const nextCursor = nextBefore.length;
	input.focus();
	input.setSelectionRange(nextCursor, nextCursor);
	if (selectionState) {
		selectionState.start = nextCursor;
		selectionState.end = nextCursor;
		selectionState.userMovedCaret = true;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

function buildAssistClauseFromContext(prefix, defaultPath, quotedValue) {
	const source = `${prefix ?? ''}`.trimEnd();
	const includesMatch = source.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.includes\(\s*'(?:\\'|[^'])*'\s*\)\s*$/);
	if (includesMatch) return `${includesMatch[1]}.includes(${quotedValue})`;
	const equalityMatch = source.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(?:==|===|!=|!==)\s*'(?:\\'|[^'])*'\s*$/);
	if (equalityMatch) return `${equalityMatch[1]} == ${quotedValue}`;
	const path = `${defaultPath ?? ''}`.trim();
	if (!path) return '';
	if (path.endsWith('.creatureType')) return `${path}.includes(${quotedValue})`;
	return `${path} == ${quotedValue}`;
}

function tryAppendCreatureTypeIncludesClause(input, quotedValue, path, selectionState = null) {
	const cursor = Number(input.selectionStart ?? input.value.length);
	const selectionEnd = Number(input.selectionEnd ?? cursor);
	if (cursor !== selectionEnd) return false;
	const before = input.value.slice(0, cursor).trimEnd();
	const escapedPath = escapeRegExp(path);
	const includesPattern = new RegExp(`${escapedPath}\\.includes\\(\\s*'(?:\\\\'|[^'])*'\\s*\\)\\s*$`);
	if (!includesPattern.test(before)) return false;
	const insertion = ` || ${path}.includes(${quotedValue})`;
	input.value = `${input.value.slice(0, cursor)}${insertion}${input.value.slice(cursor)}`;
	const nextCursor = cursor + insertion.length;
	input.focus();
	input.setSelectionRange(nextCursor, nextCursor);
	if (selectionState) {
		selectionState.start = nextCursor;
		selectionState.end = nextCursor;
		selectionState.userMovedCaret = true;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

function tryReplaceTrailingPathWithCreatureTypeClause(input, quotedValue, path, selectionState = null) {
	const cursor = Number(input.selectionStart ?? input.value.length);
	const selectionEnd = Number(input.selectionEnd ?? cursor);
	if (cursor !== selectionEnd) return false;
	const before = input.value.slice(0, cursor);
	const trimmedBefore = before.trimEnd();
	const trailingDot = `${path}.`;
	let replacementStart = -1;
	if (trimmedBefore.endsWith(trailingDot)) replacementStart = trimmedBefore.length - trailingDot.length;
	else if (trimmedBefore.endsWith(path)) replacementStart = trimmedBefore.length - path.length;
	if (replacementStart < 0) return false;
	const clause = `${path}.includes(${quotedValue})`;
	const nextBefore = `${before.slice(0, replacementStart)}${clause}`;
	input.value = `${nextBefore}${input.value.slice(cursor)}`;
	const nextCursor = nextBefore.length;
	input.focus();
	input.setSelectionRange(nextCursor, nextCursor);
	if (selectionState) {
		selectionState.start = nextCursor;
		selectionState.end = nextCursor;
		selectionState.userMovedCaret = true;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
}

function resolveAssistNodeInsertionPath(textarea, nodePath) {
	const path = `${nodePath ?? ''}`.trim();
	if (!path) return path;
	const normalizedPath = path.toLowerCase();
	const isScopedDamageEnum = /^(?:item|activity|originitem|originactivity)\.(?:damagetypes|defaultdamagetype)\.[a-z0-9_]+$/.test(normalizedPath);
	if (!isScopedDamageEnum) return path;
	const caret = Number(textarea?.selectionStart ?? textarea?.value?.length ?? 0);
	const token = extractAutocompleteToken(textarea?.value ?? '', caret).toLowerCase();
	if (token.startsWith('damagetypes.') || token.startsWith('defaultdamagetype.')) {
		return path.replace(/^[^.]+\./, '');
	}
	return path;
}

function escapeRegExp(value) {
	return `${value ?? ''}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildExpandEditorAppId(editorId, inputName) {
	const normalizedEditorId = `${editorId ?? 'editor'}`.replace(/[^A-Za-z0-9_-]+/g, '-');
	const normalizedInput = `${inputName ?? 'value'}`.replace(/[^A-Za-z0-9_.-]+/g, '-');
	return `ac5e-openEditor-${normalizedEditorId}-${normalizedInput}`;
}

function extractAutocompleteToken(text, caret) {
	const left = `${text ?? ''}`.slice(0, Math.max(0, caret));
	const match = left.match(/[A-Za-z_][A-Za-z0-9_.]*$/);
	return match?.[0] ?? '';
}

function findTreeNodeByPath(rootNode, path) {
	if (!rootNode || !path) return null;
	if (rootNode.path === path) return rootNode;
	const queue = [...(rootNode.children ?? [])];
	while (queue.length) {
		const node = queue.shift();
		if (!node) continue;
		if (node.path === path) return node;
		if (node.children?.length) queue.push(...node.children);
	}
	return null;
}

function replaceTokenAtCursorOrInsert(input, replacement, selectionState = null) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
	const text = `${replacement ?? ''}`;
	if (!text) return;
	const insertion = resolveAssistInsertion(text);
	const cursor = Number(input.selectionStart ?? input.value.length);
	const token = extractAutocompleteToken(input.value, cursor);
	if (!token) {
		insertAtCursor(input, insertion.text, selectionState);
		return;
	}
	const start = Math.max(0, cursor - token.length);
	const end = Number(input.selectionEnd ?? cursor);
	const replacementText = normalizeOperatorInsertion(input.value, start, end, insertion.text);
	input.value = `${input.value.slice(0, start)}${replacementText}${input.value.slice(end)}`;
	const nextStart = insertion.selectionLength > 0
		? start + Math.min(insertion.selectionStartOffset, replacementText.length)
		: start + replacementText.length;
	const nextEnd = nextStart + insertion.selectionLength;
	input.focus();
	input.setSelectionRange(nextStart, nextEnd);
	if (selectionState) {
		selectionState.start = nextStart;
		selectionState.end = nextEnd;
		selectionState.userMovedCaret = true;
		selectionState.recentAssistInsert = { start, end: nextStart + replacementText.length, text: replacementText };
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertAtCursor(input, text, selectionState = null) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
	if (!text) return;
	const insertion = resolveAssistInsertion(text);
	const hasExplicitSelection = Boolean(selectionState?.userMovedCaret) &&
		Number.isInteger(selectionState?.start) &&
		Number.isInteger(selectionState?.end);
	const start = hasExplicitSelection ? selectionState.start : input.value.length;
	const end = hasExplicitSelection ? selectionState.end : input.value.length;
	const insertionText = normalizeOperatorInsertion(input.value, start, end, insertion.text);
	input.value = `${input.value.slice(0, start)}${insertionText}${input.value.slice(end)}`;
	const selectionStart = insertion.selectionLength > 0
		? start + Math.min(insertion.selectionStartOffset, insertionText.length)
		: start + insertionText.length;
	const selectionEnd = selectionStart + insertion.selectionLength;
	input.focus();
	input.setSelectionRange(selectionStart, selectionEnd);
	if (selectionState) {
		selectionState.start = selectionStart;
		selectionState.end = selectionEnd;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

function normalizeOperatorInsertion(source, start, end, text) {
	const raw = `${text ?? ''}`;
	const trimmed = raw.trim();
	const binaryOperators = new Set(['&&', '||', '==', '!=', '>', '>=', '<', '<=']);
	const unaryOperators = new Set(['!']);
	if (!binaryOperators.has(trimmed) && !unaryOperators.has(trimmed)) {
		return normalizeTokenInsertion(source, start, end, raw);
	}
	const before = `${source ?? ''}`.slice(0, Math.max(0, Number(start ?? 0)));
	const after = `${source ?? ''}`.slice(Math.max(0, Number(end ?? 0)));
	const prev = before.at(-1) ?? '';
	const next = after[0] ?? '';
	const needsLead = Boolean(before.length) && !/\s|[(]/.test(prev);
	const needsTrail = !next || !/\s|[)\],.:?]/.test(next);
	return `${needsLead ? ' ' : ''}${trimmed}${needsTrail ? ' ' : ''}`;
}

function normalizeTokenInsertion(source, start, end, text) {
	const raw = `${text ?? ''}`;
	if (!raw) return raw;
	const before = `${source ?? ''}`.slice(0, Math.max(0, Number(start ?? 0)));
	const after = `${source ?? ''}`.slice(Math.max(0, Number(end ?? 0)));
	const prev = before.at(-1) ?? '';
	const next = after[0] ?? '';
	const startsWithSpace = /^\s/.test(raw);
	const endsWithSpace = /\s$/.test(raw);
	const needsLead = !startsWithSpace && Boolean(before.length) && /[A-Za-z0-9_.)'"]/.test(prev);
	const needsTrail = !endsWithSpace && Boolean(next) && /[A-Za-z0-9_('"`]/.test(next);
	return `${needsLead ? ' ' : ''}${raw}${needsTrail ? ' ' : ''}`;
}

function insertAssistPathAtCursor(input, path, selectionState = null) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
	const text = `${path ?? ''}`;
	if (!text) return;
	const recent = selectionState?.recentAssistInsert ?? null;
	const canReplaceRecent =
		recent &&
		Number.isInteger(recent.start) &&
		Number.isInteger(recent.end) &&
		recent.start >= 0 &&
		recent.end >= recent.start &&
		input.value.slice(recent.start, recent.end) === recent.text &&
		input.selectionStart === input.selectionEnd &&
		input.selectionStart === recent.end;
	if (canReplaceRecent) {
		const start = recent.start;
		const end = recent.end;
		input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
		const next = start + text.length;
		input.focus();
		input.setSelectionRange(next, next);
		if (selectionState) {
			selectionState.start = next;
			selectionState.end = next;
			selectionState.recentAssistInsert = { start, end: next, text };
		}
		input.dispatchEvent(new Event('input', { bubbles: true }));
		return;
	}
	const start = Number(input.selectionStart ?? input.value.length);
	insertAtCursor(input, text, selectionState);
	const end = start + text.length;
	if (selectionState) selectionState.recentAssistInsert = { start, end, text };
}

function resolveAssistInsertion(text) {
	const rawText = String(text ?? '');
	const trimmed = rawText.trim();
	if (trimmed === '()') {
		const cursorOffset = rawText.indexOf('(') + 1;
		return { text: rawText, selectionStartOffset: Math.max(0, cursorOffset), selectionLength: 0 };
	}
	const ternaryTemplate = '(condition ? trueValue : falseValue)';
	if (trimmed === ternaryTemplate) {
		const conditionToken = 'condition';
		const tokenOffset = rawText.indexOf(conditionToken);
		return {
			text: rawText,
			selectionStartOffset: Math.max(0, tokenOffset),
			selectionLength: conditionToken.length,
		};
	}
	return { text: rawText, selectionStartOffset: rawText.length, selectionLength: 0 };
}

function handleAssistTabNavigation(input, selectionState = null, direction = 1) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false;
	const value = input.value ?? '';
	const start = Number(input.selectionStart ?? 0);
	const end = Number(input.selectionEnd ?? start);
	const targets = collectAssistNavigationTargets(value);
	if (!targets.length) return false;
	const currentIndex = findActiveNavigationTargetIndex(targets, start, end);
	let nextIndex = -1;
	if (currentIndex >= 0) nextIndex = currentIndex + (direction > 0 ? 1 : -1);
	else {
		nextIndex = direction > 0
			? targets.findIndex((target) => target.start >= end)
			: findLastIndex(targets, (target) => target.end <= start);
	}
	if (nextIndex < 0 || nextIndex >= targets.length) {
		const activeIndex = currentIndex >= 0 ? currentIndex : findActiveNavigationTargetIndex(targets, start, end);
		const activeTarget = activeIndex >= 0 ? targets[activeIndex] : null;
		if (activeTarget && direction > 0) {
			const enclosing = findEnclosingParenthesisRange(value, activeTarget.end);
			if (enclosing && activeTarget.end <= enclosing.close + 1) {
				const next = enclosing.close + 1;
				input.setSelectionRange(next, next);
				if (selectionState) {
					selectionState.start = next;
					selectionState.end = next;
				}
				return true;
			}
		}
		return false;
	}
	const target = targets[nextIndex];
	input.setSelectionRange(target.start, target.end);
	if (selectionState) {
		selectionState.start = target.start;
		selectionState.end = target.end;
	}
	return true;
}

function collectAssistNavigationTargets(value) {
	const text = String(value ?? '');
	const targets = [];
	let index = 0;
	while (index < text.length) {
		const char = text[index];
		if (char === "'" || char === '"' || char === '`') {
			let end = index + 1;
			while (end < text.length) {
				if (text[end] === '\\') {
					end += 2;
					continue;
				}
				if (text[end] === char) {
					end++;
					break;
				}
				end++;
			}
			targets.push({ start: index, end });
			index = end;
			continue;
		}
		if (/[A-Za-z_]/.test(char)) {
			let end = index + 1;
			while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end++;
			targets.push({ start: index, end });
			index = end;
			continue;
		}
		if (/[0-9]/.test(char)) {
			let end = index + 1;
			while (end < text.length && /[0-9.]/.test(text[end])) end++;
			targets.push({ start: index, end });
			index = end;
			continue;
		}
		index++;
	}
	return targets;
}

function findActiveNavigationTargetIndex(targets, start, end) {
	return targets.findIndex((target) => {
		const fullySelected = start === target.start && end === target.end;
		const caretInside = start === end && start >= target.start && start <= target.end;
		const overlapsSelection = start !== end && start < target.end && end > target.start;
		return fullySelected || caretInside || overlapsSelection;
	});
}

function findLastIndex(array, predicate) {
	for (let index = array.length - 1; index >= 0; index--) {
		if (predicate(array[index], index)) return index;
	}
	return -1;
}

function findEnclosingParenthesisRange(text, position) {
	const source = String(text ?? '');
	const stack = [];
	let quote = null;
	for (let index = 0; index < source.length; index++) {
		const char = source[index];
		if (quote) {
			if (char === '\\') {
				index++;
				continue;
			}
			if (char === quote) quote = null;
			continue;
		}
		if (char === "'" || char === '"' || char === '`') {
			quote = char;
			continue;
		}
		if (char === '(') {
			stack.push(index);
			continue;
		}
		if (char !== ')') continue;
		const open = stack.pop();
		if (!Number.isInteger(open)) continue;
		if (open < position && position <= index + 1) return { open, close: index };
	}
	return null;
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
		min: {
			name: 'ui.usesCountScaling.min',
			label: 'Min',
			value: scaling?.min ?? '',
			inputId: `ac5e-value-usesCount-scaling-min-${id}`,
			placeholder: '1',
		},
		max: {
			name: 'ui.usesCountScaling.max',
			label: 'Max',
			value: scaling?.max ?? '',
			inputId: `ac5e-value-usesCount-scaling-max-${id}`,
			placeholder: '1',
		},
		step: {
			name: 'ui.usesCountScaling.step',
			label: 'Step',
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

