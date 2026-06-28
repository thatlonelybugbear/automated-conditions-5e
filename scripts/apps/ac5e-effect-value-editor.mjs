import {
	buildEffectValueAutocompleteEntries,
	configureAc5eAutocompleteMenu,
	getAutocompletePrefix,
	rankEffectValueAutocompleteEntries,
	replaceAutocompletePrefix,
	shouldActivateEffectValueAutocomplete,
} from './ac5e-effect-value-autocomplete.mjs';
import Constants from '../ac5e-constants.mjs';
import { AC5E_ACTOR_ROLLDATA_ADDED_FIELDS, AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS } from '../ac5e-runtimeLogic.mjs';
import { _parseAddToSpec, _stringifyAddToSpec } from '../ac5e-addTo.mjs';

const AC5E_ACTOR_ROOTS = ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'];
const AC5E_ACTOR_ADDED_LAMBDA_PATHS = new Set([...AC5E_ACTOR_ROOTS.flatMap((root) => AC5E_ACTOR_ROLLDATA_ADDED_FIELDS.map((suffix) => `${root}.${suffix}`)), 'opponentActor.opponentId']);
const AC5E_ITEM_ACTIVITY_ADDED_LAMBDA_PATHS = new Set([
	// 'item.itemUuid',
	// 'item.itemProperties',
	// 'item.actionType',
	// 'item.attackMode',
	// 'item.mastery',
	// 'activity.actionType',
	// 'activity.damageTypes',
	// 'activity.defaultDamageType',
	// 'activity.healingTypes',
	'originItem.actionType',
	'originItem.attackMode',
	'originItem.mastery',
	'originActivity.actionType',
	'originActivity.damageTypes',
	'originActivity.defaultDamageType',
	'originActivity.healingTypes',
]);
const AC5E_ADDED_LAMBDA_PATHS = new Set([...AC5E_ACTOR_ADDED_LAMBDA_PATHS, ...AC5E_ITEM_ACTIVITY_ADDED_LAMBDA_PATHS]);
const AC5E_ADDED_LAMBDA_PREFIXES = new Set(AC5E_ACTOR_ROOTS.flatMap((root) => AC5E_ACTOR_ROLLDATA_ADDED_PREFIX_FIELDS.map((suffix) => `${root}.${suffix}`)));
import { collectAc5eEffectValueFormData, mergeAc5eEffectValueFormData, parseAc5eEffectValue, serializeAc5eEffectValue } from './ac5e-effect-value-parser.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const COMMON_TOGGLE_FIELDS = ['optin', 'once', 'oncePerTurn', 'oncePerRound', 'oncePerCombat', 'itemLimited'];
const AURA_TOGGLE_FIELDS = ['allies', 'enemies', 'includeSelf', 'singleAura', 'wallsBlock'];
const CONDITIONAL_TOGGLE_FIELDS = ['partialConsume'];
const RANGE_TOGGLE_FIELDS = ['longDisadvantage', 'noLongDisadvantage', 'nearbyFoeDisadvantage', 'noNearbyFoeDisadvantage', 'outOfRangeFail', 'noOutOfRangeFail'];
const RANGE_VALUE_FIELDS = ['short', 'long', 'reach', 'bonus'];
const OPTIONAL_FIELD_NAMES = ['name', 'description', 'usesCount'];
const CADENCE_TOGGLE_FIELDS = ['once', 'oncePerTurn', 'oncePerRound', 'oncePerCombat'];
const DEFAULT_USESCOUNT_SCALING = { min: 1, max: 1, step: 1 };
const SPELL_SLOT_USESCOUNT_ENTRIES = ['pact', ...Array.from({ length: Number(Object.keys(CONFIG?.DND5E?.spellLevels || {0: 'Cantrip', 1: '1st Level', 2: '2nd Level', 3: '3rd Level', 4: '4th Level', 5: '5th Level', 6: '6th Level', 7: '7th Level', 8: '8th Level', 9: '9th Level'})?.at(-1) ?? 9) }, (_entry, index) => `spell${index + 1}`)];
const ENUM_ASSIST_ALIAS_ROOTS = new Set([
	'ability',
	'skill',
	'tool',
	'damageTypes',
	'defaultDamageType',
	'actionType',
	'attackMode',
	'itemProperties',
	'itemType',
	'originItemProperties',
	'originItemType',
	'mastery',
	'riderStatuses',
]);
const ROOT_IDENTIFIERS = new Set(['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor', 'item', 'activity', 'originItem', 'originActivity']);
const NUMBER_OPERATOR_ASSIST_ENTRIES = new Set(['attackRollD20', 'attackRollOverAC', 'attackRollTotal', 'd20Result', 'd20ResultOverTarget', 'd20Total', 'opponentAC', 'targetOverAC', 'targetValue']);
const STRING_OPERATOR_ASSIST_ENTRIES = new Set(['ability', 'skill', 'tool']);
const NUMBER_COMPARATOR_OPERATORS = new Set(['==', '!=', '>', '>=', '<=', '<']);
const STRING_COMPARISON_OPERATORS = new Set(['==', '!=']);
const BOOLEAN_LOGICAL_OPERATORS = new Set(['&&', '||', '!']);
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
const COMPUTED_ROLL_AWARE_ENTRIES = new Set(['opponentAC', 'targetOverAC', 'd20Total', 'd20Result', 'd20ResultOverTarget', 'attackRollTotal', 'attackRollD20', 'attackRollOverAC']);
const AC5E_USESCOUNT_BASE_ENTRIES = [
	'origin',
	'hp',
	'hpTemp',
	'hpMax',
	'hd',
	'hd.smallest',
	'hd.largest',
	...SPELL_SLOT_USESCOUNT_ENTRIES,
	'inspiration',
	'exhaustion',
	'death.fail',
	'death.success',
	'flag.<path>',
	'flags.<path>',
	'Item.<itemId>',
	'Item.<itemId>.Activity.<activityId>',
];
const AC5E_UPDATE_BASE_ENTRIES = ['rollingActor', 'opponentActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'];
const AC5E_COUNTER_ACTOR_ROOTS = ['rollingActor', 'opponentActor', 'targetActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'];

export class AC5EEffectValueEditor extends HandlebarsApplicationMixin(ApplicationV2) {
	static openEditors = new Map();

	static DEFAULT_OPTIONS = {
		id: 'ac5e-effect-value-editor-{id}',
		classes: ['ac5e-effect-value-editor'],
		window: {
			title: 'AC5E Effect Value Editor',
			icon: 'fa-solid fa-wand-magic-sparkles',
			resizable: false,
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
				const replacement = this.#resolveAutocompleteSelectionInsertion(identifier);
				replaceAutocompletePrefix(input, prefix ?? '', replacement);
				input.focus();
			},
		});
	}

	#resolveAutocompleteSelectionInsertion(identifier) {
		const value = `${identifier ?? ''}`.trim();
		if (!value) return value;
		if (!/^[A-Za-z_$][\w$-]*(?:\.(?:[A-Za-z_$][\w$-]*|\d+))*$/.test(value)) return value;
		if (value.endsWith('.')) return value;
		for (const entry of this.autocompleteEntries ?? []) {
			const candidate = `${entry?.identifier ?? ''}`.trim();
			if (!candidate || candidate === value) continue;
			if (candidate.startsWith(`${value}.`)) return `${value}.`;
		}
		return value;
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
		const rangeFieldState = resolveRangeFieldState(parsed, this.uiState, profile);
		const optionalFieldRows = buildRenderedOptionalFieldRows(parsed, this.id, optionalFieldState, profile);
		const primaryLayout = buildPrimaryLayout(profile, parsed, this.id, {
			setMode,
			conditionsLabel: 'Condition',
			changeKey,
			rangeFieldState,
		});
		return {
			...context,
			changeIndex: this.changeIndex,
			headerLabel: `${this.effect?.name ?? 'Effect'} (change index: ${this.changeIndex})`,
			changeKey,
			rangeFieldToggles: profile.rangeFields.map((name) => ({
				name: `ui.showRange${name.replace(/^./, (char) => char.toUpperCase())}`,
				label: name === 'bonus' ? 'Range Bonus' : labelForField(name),
				checked: Boolean(rangeFieldState[name]),
				hint: getToggleHint(rangeFieldHintKey(name)),
			})),
			hasRangeFieldToggles: profile.rangeFields.length > 0,
			primaryLayout,
			toggleBehavior: [
				{
					name: 'ui.showCadence',
					label: 'Cadence',
					checked: optionalFieldState.cadence,
					hint: getToggleHint('AC5E.EffectValueEditor.Hint.ShowCadence'),
				},
				{
					name: 'ui.showName',
					label: 'Name',
					checked: optionalFieldState.name,
					hint: getToggleHint('AC5E.EffectValueEditor.Hint.ShowName'),
				},
				{
					name: 'ui.showDescription',
					label: 'Description',
					checked: optionalFieldState.description,
					hint: getToggleHint('AC5E.EffectValueEditor.Hint.ShowDescription'),
				},
				{
					name: 'ui.showUsesCount',
					label: 'Uses Count',
					checked: optionalFieldState.usesCount,
					hint: getToggleHint('AC5E.EffectValueEditor.Hint.ShowUsesCount'),
				},
				...(profile.supportsUpdate ?
					[
						{
							name: 'ui.showUpdate',
							label: 'Update',
							checked: optionalFieldState.update,
							hint: getToggleHint('AC5E.EffectValueEditor.Hint.ShowUpdate'),
						},
					]
				:	[]),
				...profile.commonToggles
					.filter((name) => !CADENCE_TOGGLE_FIELDS.includes(name))
					.map((name) => ({
						name: `toggles.${name}`,
						label: labelForField(name),
						checked: Boolean(parsed.toggles[name]),
						hint: getToggleHint(toggleHintKey(name)),
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
				hint: getToggleHint(toggleHintKey(name)),
			})),
			hasContextBehavior: profile.contextToggles.length > 0,
			contextBehaviorLabel:
				profile.isRange && profile.isAura ? 'Range / Aura Behavior'
				: profile.isRange ? 'Range Behavior'
				: 'Aura Behavior',
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
		for (const button of htmlElement?.querySelectorAll('[data-ac5e-inline-override]:not([data-ac5e-inline-override-ready])') ?? []) {
			button.dataset.ac5eInlineOverrideReady = 'true';
			button.addEventListener('click', (event) => {
				event.preventDefault();
				const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
				const value = `${target?.dataset?.ac5eInlineOverride ?? ''}`.trim();
				if (!value) return;
				const input = htmlElement?.querySelector?.('input[name="fields.override"]');
				if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
				if (target?.dataset?.ac5eInlineOverrideMode === 'append') {
					const selected = new Set(
						`${input.value ?? ''}`
							.split(',')
							.map((entry) => entry.trim())
							.filter(Boolean),
					);
					if (selected.has(value)) return;
					selected.add(value);
					input.value = [...selected].join(',');
					target.hidden = true;
				} else input.value = value;
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new Event('change', { bubbles: true }));
				for (const chip of htmlElement.querySelectorAll('[data-ac5e-inline-override]')) {
					if (!(chip instanceof HTMLElement)) continue;
					if (chip.dataset.ac5eInlineOverrideMode === 'append') continue;
					chip.classList.toggle('active', chip === target);
				}
			});
		}
		for (const input of htmlElement?.querySelectorAll(
			'[name^="ui.show"]:not([data-ac5e-ui-toggle-ready]), [name="ui.setMode"]:not([data-ac5e-ui-toggle-ready]), [name="ui.enableUsesCountScaling"]:not([data-ac5e-ui-toggle-ready])',
		) ?? []) {
			input.dataset.ac5eUiToggleReady = 'true';
			input.addEventListener('change', (event) => void this.#onUiToggleChange(event));
		}
		for (const input of htmlElement?.querySelectorAll('[name="ui.updatePath"]:not([data-ac5e-update-hint-ready])') ?? []) {
			input.dataset.ac5eUpdateHintReady = 'true';
			const update = () => updateUpdateAmountHint(htmlElement);
			input.addEventListener('input', update);
			input.addEventListener('change', update);
			update();
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
		const showUpdate = profile.supportsUpdate && hasCheckedInput(form, 'ui.showUpdate');
		const rangeFieldState = getRangeFieldUiState(form, profile);
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
		if (!showUpdate) mergedData.fields.update = '';
		clearHiddenRangeFields(mergedData, profile, rangeFieldState);
		const partialConsumeEnabled = Boolean(mergedData.toggles.partialConsume);
		const scalingEnabled = showUsesCountScaling && !partialConsumeEnabled;
		if (showUsesCount) {
			mergedData.fields.usesCount = buildUsesCountValueFromUi(form, {
				includeScaling: scalingEnabled,
				scalingInputs: scalingEnabled ? usesCountScalingInputs : null,
				preferExisting: mergedData.fields.usesCount,
			});
			if (!scalingEnabled) mergedData.toggles.recover = false;
		}
		if (showUpdate) {
			mergedData.fields.update = buildUpdateValueFromUi(form, {
				preferExisting: mergedData.fields.update,
			});
		}
		if (scalingEnabled) mergedData.toggles.partialConsume = false;
		if (!`${mergedData.fields.usesCount ?? ''}`.trim()) mergedData.toggles.partialConsume = false;
		applyCadenceMode(mergedData, cadenceMode);
		if (profile.supportsSetMode) {
			mergedData.fields.bonus = setMode ? '' : mergedData.fields.bonus;
			mergedData.fields.set = setMode ? mergedData.fields.set : '';
		}
		const outputChangeKey = getMigratedRangeChangeKey(changeKey);
		const value = serializeAc5eEffectValue(mergedData, { changeKey: outputChangeKey });
		const keyInput = this.#getKeyInput();
		if (keyInput && outputChangeKey !== changeKey) {
			keyInput.value = outputChangeKey;
			keyInput.dispatchEvent(new Event('input', { bubbles: true }));
			keyInput.dispatchEvent(new Event('change', { bubbles: true }));
		}
		valueInput.value = value;
		valueInput.dispatchEvent(new Event('input', { bubbles: true }));
		valueInput.dispatchEvent(new Event('change', { bubbles: true }));
		this.draftKey = outputChangeKey;
		this.draftData = mergedData;
		await this.#submitActiveEffectSheet({ changeKey: outputChangeKey, value });
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
						type: Constants.ACTIVE_EFFECT_CHANGE_TYPE,
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
		await this.effect.update(
			{
				[`system.changes.${this.changeIndex}.key`]: expectedChange.key,
				[`system.changes.${this.changeIndex}.value`]: expectedChange.value,
			},
			{ render: false },
		);
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
		const assistScope = resolveAssistScope(inputName, currentValue, changeKey);
		const normalizedInputName = `${inputName ?? ''}`.trim().toLowerCase();
		const isBonusExpand = normalizedInputName === 'fields.bonus' || normalizedInputName === 'fields.set';
		const hasUsesCountScaling = hasCheckedInput(form, 'ui.enableUsesCountScaling');
		const assist = buildLambdaAssistData(this.autocompleteEntries, {
			includeAuraActor: assistProfile.isAura,
			includeEffectOriginActor: !!this.effect?.origin && !this.effect?.transfer,
			changeKey,
			assistScope,
			includeScaleValue: isBonusExpand && hasUsesCountScaling,
			includeBaseValue: isBonusExpand && shouldExposeBaseValueForChangeKey(changeKey),
		});
		const isOverrideScope = assistScope === 'typeOverride' || assistScope === 'abilityOverride';
		const isAddToScope = assistScope === 'addTo';
		const isUsesCountScope = assistScope === 'usesCount';
		const isCounterScope = assistScope === 'usesCount' || assistScope === 'update';
		const isCompactScope = isAddToScope || isCounterScope;
		const textAreaRows = isAddToScope || isCounterScope ? 3 : 6;
		const minDialogWidth =
			isAddToScope || isUsesCountScope ? 500
			: isCounterScope ? 680
			: isOverrideScope ? 620
			: 760;
		const preferredDialogWidth =
			isAddToScope || isUsesCountScope ? 560
			: isCounterScope ? 760
			: isOverrideScope ? 620
			: 920;
		const resizeMinDialogWidth =
			isAddToScope || isUsesCountScope ? 420
			: isCounterScope ? 580
			: isOverrideScope ? 520
			: 620;
		const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || preferredDialogWidth;
		const maxDialogWidth = Math.max(minDialogWidth, Math.min(1200, Math.floor(viewportWidth * 0.92)));
		const dialogWidth = Math.min(maxDialogWidth, Math.max(minDialogWidth, preferredDialogWidth));
		const clampedResizeMinDialogWidth = Math.min(dialogWidth, Math.max(360, Math.min(resizeMinDialogWidth, Math.floor(viewportWidth * 0.9))));
		const assistControls =
			isOverrideScope ? renderAssistEntryGroups(assist)
			: isAddToScope ?
				`
					<div class="ac5e-effect-value-assist-groups ac5e-effect-value-assist-groups-addto">${renderAssistEntryGroups(assist)}</div>
				`
			: isCounterScope ?
				`
						<div class="ac5e-effect-value-assist-groups">
							${renderAssistEntryGroups(assist)}
						</div>
					`
			:	`
					${renderAssistActionFieldset('Operators', assist.operators, 'ac5e-assist-insert', 'button')}
					<div class="ac5e-effect-value-assist-groups">
						${renderAssistEntryGroups(assist)}
					</div>
				`;
		const asideMarkup =
			isOverrideScope || isAddToScope || isUsesCountScope ?
				''
			:	`
					<aside class="ac5e-effect-value-expand-aside">
						<p class="ac5e-effect-value-assist-title">Lambda Paths <small>(* AC5E addition)</small></p>
						<div class="ac5e-effect-value-assist-browser" data-ac5e-assist-browser>
							<div class="ac5e-effect-value-assist-stage" data-ac5e-assist-stage></div>
						</div>
					</aside>
				`;
		try {
			const result = await foundry.applications.api.DialogV2.wait({
				id: appId,
				window: {
					title: `Edit ${label}`,
					id: appId,
					resizable: false,
				},
				content: `
					<form class="ac5e-effect-value-expand-dialog${isAddToScope ? ' ac5e-effect-value-expand-dialog-addto' : ''}" data-ac5e-lambda-assist data-ac5e-assist-scope="${escapeHtml(assistScope)}">
						<div class="ac5e-effect-value-expand-layout${isAddToScope || isUsesCountScope ? ' ac5e-effect-value-expand-layout-single' : ''}">
							<section class="ac5e-effect-value-expand-main">
								<div class="form-group stacked">
									<label for="ac5e-expand-value">${escapedLabel}</label>
									<div class="form-fields">
										<textarea id="ac5e-expand-value" name="value" rows="${textAreaRows}" placeholder="${escapeHtml(isAddToScope ? 'Examples: base | bonus | types(fire,cold) | base,!types(acid)' : '')}">${escapedValue}</textarea>
									</div>
								</div>
								${assistControls}
							</section>
							${asideMarkup}
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
				position: { width: dialogWidth },
				render: (_event, dialog) => {
					const dialogElement = dialog?.element;
					if (dialogElement instanceof HTMLElement) {
						dialogElement.classList.add('ac5e-effect-value-expand-window');
						dialogElement.style.height = 'auto';
						dialogElement.style.minWidth = `${clampedResizeMinDialogWidth}px`;
						dialogElement.style.maxHeight = 'calc(100vh - 2rem)';
					}
					const textarea = dialog.element.querySelector('textarea[name="value"]');
					if (!(textarea instanceof HTMLTextAreaElement)) return;
					const resetButton = dialog.element.querySelector('[data-action="reset"], button[name="reset"]');
					if (resetButton instanceof HTMLButtonElement) {
						resetButton.addEventListener(
							'click',
							(clickEvent) => {
								clickEvent.preventDefault();
								clickEvent.stopImmediatePropagation();
								textarea.value = '';
								textarea.dispatchEvent(new Event('input', { bubbles: true }));
								textarea.dispatchEvent(new Event('change', { bubbles: true }));
								textarea.focus();
								textarea.setSelectionRange(0, 0);
							},
							{ capture: true },
						);
					}
					const assistRoot = textarea.closest('form') ?? dialog.element;
					prepareLambdaAssist(assistRoot, assist, assistScope);
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
		const eventTarget = event?.currentTarget instanceof HTMLInputElement ? event.currentTarget : null;
		if (eventTarget?.name === 'ui.enableUsesCountScaling' && eventTarget.checked) {
			const partialInput = form.querySelector('input[name="toggles.partialConsume"]');
			if (partialInput instanceof HTMLInputElement) partialInput.checked = false;
		}
		if (eventTarget?.name === 'toggles.partialConsume' && eventTarget.checked) {
			const scalingInput = form.querySelector('input[name="ui.enableUsesCountScaling"]');
			if (scalingInput instanceof HTMLInputElement) scalingInput.checked = false;
		}
		this.#captureDraftState(form);
		const changeKey = this.draftKey ?? this.#getKeyInput()?.value ?? '';
		const profile = getEditorProfile(changeKey, this.draftData ?? parseAc5eEffectValue(this.#getValueInput()?.value ?? '', { changeKey }));
		const usesCountScaling = hasCheckedInput(form, 'ui.enableUsesCountScaling');
		const partialConsume = hasCheckedInput(form, 'toggles.partialConsume');
		this.uiState = {
			cadence: hasCheckedInput(form, 'ui.showCadence'),
			name: hasCheckedInput(form, 'ui.showName'),
			description: hasCheckedInput(form, 'ui.showDescription'),
			usesCount: hasCheckedInput(form, 'ui.showUsesCount'),
			update: hasCheckedInput(form, 'ui.showUpdate'),
			rangeFields: getRangeFieldUiState(form, profile),
			usesCountScaling: usesCountScaling && !partialConsume,
			partialConsume: partialConsume,
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
		const showUpdate = profile.supportsUpdate && hasCheckedInput(form, 'ui.showUpdate');
		const rangeFieldState = getRangeFieldUiState(form, profile);
		const usesCountScalingInputs = getUsesCountScalingInputValues(form);
		const cadenceMode = showCadence ? getSelectValue(form, 'ui.cadenceMode') : '';
		if (profile.supportsSetMode) applySetModeToFormData(formData, setMode);
		const mergedData = mergeAc5eEffectValueFormData(baseData, formData, {
			fieldNames: [...getPersistedFieldNames(profile)],
			toggleNames: [...profile.commonToggles, ...profile.contextToggles, 'recover'],
		});
		if (!showName) mergedData.fields.name = baseData.fields.name;
		if (!showDescription) mergedData.fields.description = baseData.fields.description;
		if (!showUpdate) mergedData.fields.update = baseData.fields.update;
		else {
			mergedData.fields.update = buildUpdateValueFromUi(form, {
				preferExisting: formData.fields?.update ?? '',
			});
		}
		if (!showUsesCount) {
			mergedData.fields.usesCount = baseData.fields.usesCount;
			mergedData.toggles.partialConsume = baseData.toggles.partialConsume;
		} else {
			const partialConsumeEnabled = Boolean(mergedData.toggles.partialConsume);
			const scalingEnabled = showUsesCountScaling && !partialConsumeEnabled;
			mergedData.fields.usesCount = buildUsesCountValueFromUi(form, {
				includeScaling: scalingEnabled,
				scalingInputs: scalingEnabled ? usesCountScalingInputs : null,
				preferExisting: mergedData.fields.usesCount,
			});
			if (scalingEnabled) mergedData.toggles.partialConsume = false;
			else mergedData.toggles.recover = false;
		}
		if (showCadence) applyCadenceMode(mergedData, cadenceMode);
		else {
			for (const toggle of CADENCE_TOGGLE_FIELDS) mergedData.toggles[toggle] = baseData.toggles[toggle];
		}
		if (profile.supportsSetMode) {
			mergedData.fields.bonus = setMode ? '' : mergedData.fields.bonus;
			mergedData.fields.set = setMode ? mergedData.fields.set : '';
		}
		preserveHiddenRangeFields(mergedData, baseData, profile, rangeFieldState, form);
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
	const labels = {
		short: 'Short Range',
		long: 'Long Range',
		reach: 'Reach',
	};
	return labels[name] ?? name.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
}

function rangeFieldHintKey(name) {
	const map = {
		short: 'AC5E.EffectValueEditor.Hint.RangeShort',
		long: 'AC5E.EffectValueEditor.Hint.RangeLong',
		reach: 'AC5E.EffectValueEditor.Hint.RangeReach',
		bonus: 'AC5E.EffectValueEditor.Hint.RangeBonus',
	};
	return map[name] ?? '';
}

function toggleHintKey(name) {
	const map = {
		optin: 'AC5E.EffectValueEditor.Hint.ToggleOptin',
		itemLimited: 'AC5E.EffectValueEditor.Hint.ToggleItemLimited',
		criticalStatic: 'AC5E.EffectValueEditor.Hint.ToggleCriticalStatic',
		allies: 'AC5E.EffectValueEditor.Hint.ToggleAllies',
		enemies: 'AC5E.EffectValueEditor.Hint.ToggleEnemies',
		includeSelf: 'AC5E.EffectValueEditor.Hint.ToggleIncludeSelf',
		singleAura: 'AC5E.EffectValueEditor.Hint.ToggleSingleAura',
		wallsBlock: 'AC5E.EffectValueEditor.Hint.ToggleWallsBlock',
		recover: 'AC5E.EffectValueEditor.Hint.ToggleRecover',
		partialConsume: 'AC5E.EffectValueEditor.Hint.TogglePartialConsume',
		longDisadvantage: 'AC5E.EffectValueEditor.Hint.ToggleRangeLongDisadvantage',
		noLongDisadvantage: 'AC5E.EffectValueEditor.Hint.ToggleRangeNoLongDisadvantage',
		nearbyFoeDisadvantage: 'AC5E.EffectValueEditor.Hint.ToggleRangeNearbyFoeDisadvantage',
		noNearbyFoeDisadvantage: 'AC5E.EffectValueEditor.Hint.ToggleRangeNoNearbyFoeDisadvantage',
		outOfRangeFail: 'AC5E.EffectValueEditor.Hint.ToggleRangeOutOfRangeFail',
		noOutOfRangeFail: 'AC5E.EffectValueEditor.Hint.ToggleRangeNoOutOfRangeFail',
	};
	return map[name] ?? '';
}

function getToggleHint(name) {
	if (typeof name === 'string' && name.startsWith('AC5E.')) return game?.i18n?.localize?.(name) ?? name;
	return '';
}

function getUpdateAmountHint(target = '') {
	const normalized = `${target ?? ''}`.trim().toLowerCase();
	if (/(?:^|\.)statuses\.(?:concentrating|concentration)$/.test(normalized)) return getToggleHint('AC5E.EffectValueEditor.Hint.UpdateAmountConcentration');
	if (/(?:^|\.)statuses\.[^.]+$/.test(normalized)) return getToggleHint('AC5E.EffectValueEditor.Hint.UpdateAmountStatus');
	if (/(?:^|\.)inspiration$/.test(normalized)) return getToggleHint('AC5E.EffectValueEditor.Hint.UpdateAmountInspiration');
	if (/(?:^|\.)exhaustion$/.test(normalized)) return getToggleHint('AC5E.EffectValueEditor.Hint.UpdateAmountExhaustion');
	return getToggleHint('AC5E.EffectValueEditor.Hint.UpdateAmount');
}

function updateUpdateAmountHint(root) {
	const pathInput = root?.querySelector?.('[name="ui.updatePath"]');
	const info = root?.querySelector?.('[data-ac5e-update-amount-hint]');
	if (!(pathInput instanceof HTMLInputElement || pathInput instanceof HTMLTextAreaElement) || !(info instanceof HTMLElement)) return;
	const hint = getUpdateAmountHint(pathInput.value);
	info.dataset.tooltip = hint;
	info.setAttribute('aria-label', hint);
}

function buildEditorInstanceKey(effect, changeIndex) {
	if (!effect?.uuid || !Number.isInteger(changeIndex)) return '';
	return `${effect.uuid}::${changeIndex}`;
}

function getMigratedRangeChangeKey(changeKey = '') {
	return String(changeKey ?? '').replace(/\.range\.(short|long|reach|bonus)$/i, '.range');
}

function getEditorProfile(changeKey, parsed) {
	const normalized = String(changeKey ?? '').toLowerCase();
	const isAura = normalized.includes('.aura.');
	const isCriticalThreshold = normalized.endsWith('.criticalthreshold') || normalized.endsWith('.critthreshold');
	const isFumbleThreshold = normalized.endsWith('.fumblethreshold');
	const isAbilityOverride = normalized.endsWith('.abilityoverride');
	const isTypeOverride = normalized.endsWith('.typeoverride');
	const isModifier = normalized.endsWith('.modifier') || normalized.endsWith('.modifiers') || normalized.includes('.modifier.');
	const isDamageContext = normalized.includes('.damage.');
	const isTargetADC = normalized.endsWith('.modifyac') || normalized.endsWith('.modifydc');
	const isInfo = normalized.endsWith('.info');
	const supportsUpdate = true;
	const supportsCriticalStatic = isDamageContext && (normalized.endsWith('.bonus') || normalized.endsWith('.extradice'));
	const isBonus = normalized.endsWith('.bonus') || isTargetADC || normalized.endsWith('.extradice') || normalized.endsWith('.diceupgrade') || normalized.endsWith('.dicedowngrade');
	const isRange = normalized.includes('.range');

	const requiredFields = [];
	const auraFields = [];
	if (isBonus) requiredFields.push('bonus');
	if (isAbilityOverride) requiredFields.push('override');
	if (isTypeOverride) requiredFields.push('override');
	if (isTargetADC) requiredFields.push('set');
	if (isModifier) requiredFields.push('modifier');
	if (isCriticalThreshold || isFumbleThreshold) requiredFields.push('bonus', 'set');
	if (isAura) auraFields.push('radius');
	if (isRange) requiredFields.push(...RANGE_VALUE_FIELDS);
	if (hasParsedValue(parsed, 'chance')) requiredFields.push('chance');
	if (hasParsedValue(parsed, 'enforceMode')) requiredFields.push('enforceMode');
	const supportsAddTo = isDamageContext && (isBonus || isTypeOverride || isModifier || hasParsedValue(parsed, 'addTo'));
	const addToAnchorField =
		isTypeOverride ? 'override'
		: isModifier ? 'modifier'
		: 'bonus';

	const contextToggles = [];
	if (isAura) contextToggles.push(...AURA_TOGGLE_FIELDS);
	if (isRange) contextToggles.push(...RANGE_TOGGLE_FIELDS);
	for (const toggle of [...AURA_TOGGLE_FIELDS, ...CONDITIONAL_TOGGLE_FIELDS, ...RANGE_TOGGLE_FIELDS]) {
		if (parsed?.toggles?.[toggle] && !contextToggles.includes(toggle)) contextToggles.push(toggle);
	}

	const supportsSetMode = !isTypeOverride && (isTargetADC || isCriticalThreshold || isFumbleThreshold || hasParsedValue(parsed, 'set'));
	const renderedRequiredFields = supportsSetMode ? dedupe(requiredFields).filter((field) => field !== 'set') : dedupe(requiredFields);
	const renderedContextToggles = dedupe(contextToggles).filter((toggle) => toggle !== 'partialConsume');
	const optionalFields = supportsUpdate ? [...OPTIONAL_FIELD_NAMES, 'update'] : [...OPTIONAL_FIELD_NAMES];

	return {
		isAura,
		isRange,
		rangeFields: isRange ? RANGE_VALUE_FIELDS : [],
		requiredFields: renderedRequiredFields,
		auraFields: dedupe(auraFields),
		optionalFields,
		commonToggles: supportsCriticalStatic ? [...COMMON_TOGGLE_FIELDS, 'criticalStatic'] : COMMON_TOGGLE_FIELDS,
		contextToggles: renderedContextToggles,
		supportsSetMode,
		supportsAddTo,
		addToAnchorField,
		supportsUpdate,
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
		update: uiState?.update ?? hasParsedValue(parsed, 'update'),
		usesCountScaling: uiState?.usesCountScaling ?? hasParsedScaling,
		partialConsume: uiState?.partialConsume ?? Boolean(parsed?.toggles?.partialConsume),
	};
}

function resolveRangeFieldState(parsed, uiState = null, profile = {}) {
	const state = {};
	for (const field of profile.rangeFields ?? []) {
		state[field] = uiState?.rangeFields?.[field] ?? hasParsedValue(parsed, field);
	}
	return state;
}

function dedupe(values) {
	return [...new Set(values)];
}

function buildRenderedPrimaryFields(profile, parsed, id, { setMode = false, changeKey = '', rangeFieldState = {} } = {}) {
	const inlineOverrideEntries = getInlineOverrideEntries(changeKey, parsed?.fields?.override ?? '');
	const isAbilityOverride = `${changeKey ?? ''}`.trim().toLowerCase().endsWith('.abilityoverride');
	const rangeFields = new Set(profile.rangeFields ?? []);
	return [
		...profile.requiredFields
			.filter((name) => !rangeFields.has(name) || rangeFieldState[name])
			.map((name) => ({
				name,
				label:
					profile.supportsSetMode && name === 'bonus' ? 'Bonus / Set'
					: name === 'bonus' && profile.isRange ? 'Range Bonus'
					: name === 'bonus' ? 'Bonus'
					: labelForField(name),
				hint: rangeFields.has(name) ? getToggleHint(rangeFieldHintKey(name)) : '',
				value: profile.supportsSetMode && name === 'bonus' ? (parsed.fields[setMode ? 'set' : 'bonus'] ?? '') : (parsed.fields[name] ?? ''),
				inputId: `ac5e-value-${name}-${id}`,
				expandable: name === 'override' && isAbilityOverride && inlineOverrideEntries.length ? false : true,
				inlineOverrideEntries: name === 'override' && isAbilityOverride ? inlineOverrideEntries : [],
				hasInlineOverrideEntries: name === 'override' && isAbilityOverride && inlineOverrideEntries.length > 0,
				hideOverrideInput: name === 'override' && isAbilityOverride && inlineOverrideEntries.length > 0,
				fullRow: name === 'override' && isAbilityOverride && inlineOverrideEntries.length > 0,
				companionField:
					profile.supportsAddTo && name === profile.addToAnchorField ?
						{
							name: 'addTo',
							label: 'Add To',
							value: parsed.fields.addTo ?? '',
							inputId: `ac5e-value-addTo-${id}`,
							expandable: true,
						}
					:	null,
				inlineToggle:
					profile.supportsSetMode && name === 'bonus' ?
						{
							name: 'ui.setMode',
							label: 'Set',
							checked: setMode,
							hint: getToggleHint('AC5E.EffectValueEditor.Hint.SetMode'),
						}
					:	null,
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

function buildPrimaryLayout(profile, parsed, id, { setMode = false, conditionsLabel = 'Condition', changeKey = '', rangeFieldState = {} } = {}) {
	const renderedPrimaryFields = buildRenderedPrimaryFields(profile, parsed, id, { setMode, changeKey, rangeFieldState });
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

function buildRenderedOptionalFieldRows(parsed, id, optionalFieldState, profile = {}) {
	const nameField = optionalFieldState.name ? buildRenderedOptionalField('name', parsed, id) : null;
	const descriptionField = optionalFieldState.description ? buildRenderedOptionalField('description', parsed, id) : null;
	const usesCountValue = parsed.fields.usesCount ?? '';
	const parsedUsesCount = parseUsesCountScalingSpec(usesCountValue);
	const parsedUsesCountParts = parseUsesCountUiParts(parsedUsesCount.baseValue);
	const hasUsesCountScaling = optionalFieldState.usesCountScaling ?? hasUsesCountScalingSpec(usesCountValue);
	if (!hasUsesCountScaling && parsed.toggles.recover && !parsedUsesCountParts.setMode) {
		const amount = `${parsedUsesCountParts.amount ?? ''}`.trim();
		if (amount && !amount.startsWith('-') && !amount.startsWith('=')) parsedUsesCountParts.amount = `-${amount}`;
	}
	const partialConsumeEnabled = optionalFieldState.partialConsume ?? Boolean(parsed.toggles.partialConsume);
	const showPartialConsume = true;
	const showScalingToggle = true;
	return {
		nameDescription: {
			left: nameField ?? (!nameField && descriptionField ? descriptionField : null),
			right: nameField && descriptionField ? descriptionField : null,
		},
		usesCount: {
			left:
				optionalFieldState.usesCount ?
					{
						path: {
							name: 'ui.usesCountPath',
							label: game.i18n.localize('AC5E.EffectValueEditor.Label.ConsumptionType'),
							value: parsedUsesCountParts.path,
							inputId: `ac5e-value-usesCount-path-${id}`,
							expandable: true,
						},
						amount:
							hasUsesCountScaling ? null : (
								{
									name: 'ui.usesCountAmount',
									label: game.i18n.localize('AC5E.EffectValueEditor.Label.Amount'),
									hint: getToggleHint('AC5E.EffectValueEditor.Hint.UsesCountAmount'),
									value: parsedUsesCountParts.amount,
									inputId: `ac5e-value-usesCount-amount-${id}`,
									placeholder: game.i18n.localize('AC5E.EffectValueEditor.Placeholder.UsesCountAmount'),
								}
							),
						recover:
							hasUsesCountScaling ?
								{
									name: 'toggles.recover',
									label: 'Recover',
									checked: Boolean(parsed.toggles.recover),
									hint: getToggleHint('AC5E.EffectValueEditor.Hint.ToggleRecover'),
								}
							:	null,
					}
				:	null,
			right:
				optionalFieldState.usesCount ?
					[
						showScalingToggle ?
							{
								name: 'ui.enableUsesCountScaling',
								label: 'Scaling',
								className: 'ac5e-usescount-toggle-scaling',
								checked: hasUsesCountScaling,
								disabled: partialConsumeEnabled,
								hint: getToggleHint('AC5E.EffectValueEditor.Hint.EnableUsesCountScaling'),
							}
						:	null,
						showPartialConsume ?
							{
								name: 'toggles.partialConsume',
								label: 'Partial',
								className: 'ac5e-usescount-toggle-partial',
								checked: partialConsumeEnabled,
								disabled: hasUsesCountScaling,
								hint: getToggleHint('AC5E.EffectValueEditor.Hint.TogglePartialConsume'),
							}
						:	null,
					].filter(Boolean)
				:	null,
			scaling: optionalFieldState.usesCount && hasUsesCountScaling ? buildRenderedUsesCountScalingFields(parsedUsesCount?.scaling, id) : null,
			scalingRecover: null,
		},
		update: {
			left:
				profile.supportsUpdate && optionalFieldState.update ?
					(() => {
						const updateParts = parseUpdateUiParts(parsed.fields.update ?? '');
						return {
							path: {
								name: 'ui.updatePath',
								label: game.i18n.localize('AC5E.EffectValueEditor.Label.UpdateTarget'),
								value: updateParts.path,
								inputId: `ac5e-value-update-path-${id}`,
								expandable: true,
							},
							amount: {
								name: 'ui.updateAmount',
								label: game.i18n.localize('AC5E.EffectValueEditor.Label.Amount'),
								hint: getUpdateAmountHint(updateParts.path),
								value: updateParts.amount,
								inputId: `ac5e-value-update-amount-${id}`,
								placeholder: game.i18n.localize('AC5E.EffectValueEditor.Placeholder.UpdateAmount'),
							},
						};
					})()
				:	null,
			right: null,
			scaling: null,
		},
	};
}

function buildLambdaAssistData(
	entries,
	{ includeAuraActor = true, includeEffectOriginActor = true, changeKey = '', assistScope = 'default', includeScaleValue = false, includeBaseValue = false } = {},
) {
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
	const entryPoints = allEntryPoints.filter((entry) => includeAuraActor || entry.value !== 'auraActor').filter((entry) => includeEffectOriginActor || entry.value !== 'effectOriginActor');
	const actorEntryButtons = entryPoints
		.filter((entry) => ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'].includes(entry.value))
		.map((entry) => entry.value);
	const itemActivityEntryButtons = entryPoints.filter((entry) => ['item', 'activity', 'originItem', 'originActivity'].includes(entry.value)).map((entry) => entry.value);
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
	const sandboxIdentifiers = dedupe(entryRecords.filter((entry) => isSandboxAssistIdentifier(entry)).map((entry) => entry.identifier));
	const compatibilityFiltered = sandboxIdentifiers.filter((identifier) => !isLegacyCompatibilityIdentifier(identifier));
	const contextualFallbacks = getContextSandboxFallbackEntries(changeKey);
	const contextualIdentifiers = dedupe([...compatibilityFiltered, ...contextualFallbacks]);
	const rollAwareEntries = dedupe(contextualIdentifiers.filter((identifier) => isConditionEntry(identifier))).sort((a, b) => a.localeCompare(b));
	const sandboxEntries = dedupe(contextualIdentifiers.filter((identifier) => !isConditionEntry(identifier))).sort((a, b) => a.localeCompare(b));
	const actorContextEntries = sandboxEntries.filter((identifier) => classifyContextEntry(identifier) === 'actor');
	const itemActivityContextEntries = sandboxEntries.filter((identifier) => classifyContextEntry(identifier) === 'item-activity');
	const pathsByRoot = Object.fromEntries(
		entryPoints.map((entry) => {
			const fromEntries = uniqueIdentifiers
				.filter((identifier) => identifier === entry.value || identifier.startsWith(`${entry.value}.`))
				.filter((identifier) => !identifier.startsWith(`${entry.value}.system.`) && identifier !== `${entry.value}.system`);
			return [entry.value, dedupe(fromEntries)];
		}),
	);
	addAssistFallbackPaths(pathsByRoot);
	addEnumAliasRoots(pathsByRoot);
	const treesByRoot = Object.fromEntries(
		entryPoints.map((entry) => [entry.value, buildAssistPathTree(entry.value, pathsByRoot[entry.value] ?? [], AC5E_ADDED_LAMBDA_PATHS, AC5E_ADDED_LAMBDA_PREFIXES)]),
	);
	for (const root of [
		'ability',
		'skill',
		'tool',
		'damageTypes',
		'defaultDamageType',
		'actionType',
		'attackMode',
		'itemProperties',
		'itemType',
		'originItemProperties',
		'originItemType',
		'mastery',
		'riderStatuses',
	]) {
		if (!Array.isArray(pathsByRoot[root])) continue;
		treesByRoot[root] = buildAssistPathTree(root, pathsByRoot[root], AC5E_ADDED_LAMBDA_PATHS, AC5E_ADDED_LAMBDA_PREFIXES);
	}
	const enumValues = {
		actorTypes: dedupe(
			[...(Array.isArray(game?.system?.documentTypes?.Actor) ? game.system.documentTypes.Actor : []), ...Object.keys(CONFIG?.Actor?.typeLabels ?? {})]
				.map((value) => String(value ?? '').trim())
				.filter(Boolean),
		),
		creatureTypes: Object.keys(CONFIG?.DND5E?.creatureTypes ?? {}).filter(Boolean),
		itemTypes: dedupe(
			[...(Array.isArray(game?.system?.documentTypes?.Item) ? game.system.documentTypes.Item : []), ...Object.keys(CONFIG?.Item?.typeLabels ?? {})]
				.map((value) => String(value ?? '').trim())
				.filter(Boolean),
		),
		itemTypeValues: dedupe(
			[
				...Object.keys(CONFIG?.DND5E?.armorTypes ?? {}),
				...Object.keys(CONFIG?.DND5E?.consumableTypes ?? {}),
				...Object.keys(CONFIG?.DND5E?.equipmentTypes ?? {}),
				...Object.keys(CONFIG?.DND5E?.featureTypes ?? {}),
				...Object.keys(CONFIG?.DND5E?.lootTypes ?? {}),
				...Object.keys(CONFIG?.DND5E?.toolTypes ?? {}),
				...Object.keys(CONFIG?.DND5E?.weaponTypes ?? {}),
			].filter(Boolean),
		),
		activityTypes: Object.keys(CONFIG?.DND5E?.activityTypes ?? {}).filter(Boolean),
		actionTypes: Object.keys(CONFIG?.DND5E?.itemActionTypes ?? {}).filter(Boolean),
		attackModes: Object.keys(CONFIG?.DND5E?.attackModes ?? {}).filter(Boolean),
		masteries: Object.keys(CONFIG?.DND5E?.weaponMasteries ?? {}).filter(Boolean),
		itemProperties: Object.keys(CONFIG?.DND5E?.itemProperties ?? {}).filter(Boolean),
		abilities: Object.keys(CONFIG?.DND5E?.abilities ?? {}).filter(Boolean),
		skills: Object.keys(CONFIG?.DND5E?.skills ?? {}).filter(Boolean),
		tools: Object.keys(CONFIG?.DND5E?.tools ?? {}).filter(Boolean),
		damageTypes: Object.keys(CONFIG?.DND5E?.damageTypes ?? {}).filter(Boolean),
		healingTypes: Object.keys(CONFIG?.DND5E?.healingTypes ?? {}).filter(Boolean),
		statuses: getStatusEffectIds(),
		baseItems: dedupe(
			[
				...Object.keys(CONFIG?.DND5E?.weaponIds ?? {}),
				...Object.keys(CONFIG?.DND5E?.armorIds ?? {}),
				...Object.keys(CONFIG?.DND5E?.toolIds ?? {}),
				...Object.keys(CONFIG?.DND5E?.ammoIds ?? {}),
			].filter(Boolean),
		),
	};
	let contextRollAwareEntries = filterRollAwareEntriesForChangeKey(rollAwareEntries, changeKey);
	if (includeScaleValue) contextRollAwareEntries = dedupe([...contextRollAwareEntries, 'optinScale']);
	if (includeBaseValue) contextRollAwareEntries = dedupe([...contextRollAwareEntries, 'baseValue']);
	const updateActorRoots = getUpdateActorRoots(changeKey, { includeEffectOriginActor });
	const scopedEntries = buildScopedAssistEntries(assistScope, entries, changeKey, { includeEffectOriginActor });
	const flatScopedEntries = flattenScopedAssistEntries(scopedEntries);
	const scopedBrowser = flatScopedEntries.length ? buildScopedBrowserData(flatScopedEntries) : null;
	const scopedCounterRoots = assistScope === 'update' ? updateActorRoots : null;
	const scopedRootFilter = assistScope === 'update' ? scopedCounterRoots : null;
	const scopedEntryPoints = scopedRootFilter && scopedBrowser ? scopedBrowser.entryPoints.filter((entry) => scopedRootFilter.includes(entry.value)) : (scopedBrowser?.entryPoints ?? null);
	const scopedPathsByRoot =
		scopedRootFilter && scopedBrowser ? Object.fromEntries(scopedRootFilter.map((root) => [root, scopedBrowser.pathsByRoot?.[root] ?? []])) : (scopedBrowser?.pathsByRoot ?? null);
	const scopedTreesByRoot =
		scopedRootFilter && scopedBrowser ?
			Object.fromEntries(scopedCounterRoots.map((root) => [root, scopedBrowser.treesByRoot?.[root] ?? buildAssistPathTree(root, [], AC5E_ADDED_LAMBDA_PATHS, AC5E_ADDED_LAMBDA_PREFIXES)]))
		:	(scopedBrowser?.treesByRoot ?? null);
	const resolvedEntryPoints = scopedEntryPoints ?? entryPoints;
	const resolvedPathsByRoot = scopedPathsByRoot ?? pathsByRoot;
	const resolvedTreesByRoot = scopedTreesByRoot ?? treesByRoot;
	const allEntryButtons =
		flatScopedEntries.length ? [...flatScopedEntries] : dedupe([...contextRollAwareEntries, ...actorContextEntries, ...itemActivityContextEntries]).sort((a, b) => a.localeCompare(b));
	return {
		scope: assistScope,
		entryPoints: resolvedEntryPoints,
		actorEntryButtons,
		itemActivityEntryButtons,
		actorContextEntries,
		itemActivityContextEntries,
		operators,
		rollAwareEntries: contextRollAwareEntries,
		scopedEntries,
		allEntryButtons,
		pathsByRoot: resolvedPathsByRoot,
		treesByRoot: resolvedTreesByRoot,
		enumValues,
	};
}

function getInlineOverrideEntries(changeKey, currentOverrideValue = '') {
	const normalized = `${changeKey ?? ''}`.trim().toLowerCase();
	const currentOverride = `${currentOverrideValue ?? ''}`.trim();
	if (normalized.endsWith('.abilityoverride')) {
		const abilitiesConfig = CONFIG?.DND5E?.abilities ?? {};
		const entries = Object.entries(abilitiesConfig)
			.map(([value, rawLabel]) => {
				const labelKey =
					typeof rawLabel === 'string' ? rawLabel
					: typeof rawLabel?.label === 'string' ? rawLabel.label
					: '';
				const directLabel = typeof rawLabel?.label === 'string' && !rawLabel.label.startsWith('DND5E.') ? rawLabel.label : '';
				const localized = labelKey ? game?.i18n?.localize?.(labelKey) : '';
				return { value, label: directLabel || localized || value };
			})
			.filter((entry) => entry.value)
			.sort((a, b) => a.label.localeCompare(b.label));
		return entries.map((entry) => ({ ...entry, selected: entry.value === currentOverride, mode: 'single' }));
	}
	return [];
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
	return (
		normalized.includes('attack') ||
		normalized.includes('check') ||
		normalized.includes('save') ||
		isDamageContext ||
		normalized.includes('d20') ||
		normalized.includes('critical') ||
		normalized.includes('fumble')
	);
}

function isNonDamageBonusContext(changeKey) {
	const normalized = `${changeKey ?? ''}`.toLowerCase();
	if (!normalized) return false;
	const isBonus = normalized.includes('.bonus');
	if (!isBonus) return false;
	const isDamage = normalized.includes('damage');
	if (isDamage) return false;
	return normalized.includes('attack') || normalized.includes('save') || normalized.includes('check') || normalized.includes('skill') || normalized.includes('tool') || normalized.includes('d20');
}

function shouldExposeBaseValueForChangeKey(changeKey) {
	const normalized = `${changeKey ?? ''}`.toLowerCase();
	if (!normalized) return false;
	return (
		normalized.includes('.modifyac') ||
		normalized.includes('.modifydc') ||
		normalized.includes('.criticalthreshold') ||
		normalized.includes('.critthreshold') ||
		normalized.includes('.fumblethreshold')
	);
}

function filterRollAwareEntriesForChangeKey(entries, changeKey) {
	const normalized = `${changeKey ?? ''}`.toLowerCase();
	let filtered = entries;
	if (isNonDamageBonusContext(changeKey)) filtered = filtered.filter((entry) => !COMPUTED_ROLL_AWARE_ENTRIES.has(entry));
	const isAbilityOverrideOrModifyDC = normalized.endsWith('.abilityoverride') || normalized.endsWith('.modifydc');
	if (isAbilityOverrideOrModifyDC) {
		filtered = filtered.filter((entry) => !['hasAdvantage', 'hasDisadvantage', 'hasTransitAdvantage', 'hasTransitDisadvantage'].includes(entry));
	}
	return filtered;
}

function isConditionEntry(identifier) {
	const value = `${identifier ?? ''}`.trim();
	if (!value) return false;
	if (['ability', 'skill', 'tool', 'riderStatuses', 'damageTypes', 'defaultDamageType'].includes(value)) return false;
	if (ROLL_AWARE_ENTRIES.has(value)) return true;
	return value.startsWith('is') || value.startsWith('has') || value.startsWith('can');
}

function getContextSandboxFallbackEntries(changeKey) {
	const normalized = `${changeKey ?? ''}`.toLowerCase();
	const entries = ['ability', 'skill', 'tool', 'damageTypes', 'defaultDamageType', 'riderStatuses'];
	if (!normalized) return entries;
	const actionType = getRuleActionTypeFromChangeKey(normalized);
	const isRollLike = isD20AssistContext(normalized) || ['all', 'd20', 'check', 'skill', 'tool'].includes(actionType);
	if (isRollLike) {
		entries.push('skill', 'tool', 'hasProficiency', 'hasExpertise', 'hasHalfProficiency', 'hasFullProficiency', 'isConcentration', 'isDeathSave', 'isInitiative', 'targetValue');
		if (!isNonDamageBonusContext(normalized)) {
			entries.push('d20Total', 'd20Result', 'd20ResultOverTarget', 'attackRollTotal', 'attackRollD20', 'attackRollOverAC');
		}
	}
	if ((normalized.includes('attack') || normalized.includes('damage')) && !isNonDamageBonusContext(normalized)) {
		entries.push('hasAttack', 'hasDamage', 'hasHealing', 'hasSave', 'hasCheck', 'opponentAC', 'targetOverAC');
	}
	entries.push('actionType', 'attackMode', 'itemProperties', 'itemType', 'originItemProperties', 'originItemType', 'mastery');
	return dedupe(entries);
}

function getRuleActionTypeFromChangeKey(changeKey) {
	const segments = `${changeKey ?? ''}`.trim().toLowerCase().split('.').filter(Boolean);
	const moduleIndex = segments.indexOf(Constants.MODULE_ID);
	if (moduleIndex < 0) return '';
	const next = segments[moduleIndex + 1] ?? '';
	if (next === 'aura' || next === 'grants') return segments[moduleIndex + 2] ?? '';
	return next;
}

function resolveAssistScope(inputName, currentValue, changeKey = '') {
	const fieldName = `${inputName ?? ''}`.trim().toLowerCase();
	if (fieldName === 'fields.usescount' || fieldName === 'ui.usescountpath') return 'usesCount';
	if (fieldName === 'fields.update' || fieldName === 'ui.updatepath') return 'update';
	const normalizedKey = `${changeKey ?? ''}`.trim().toLowerCase();
	if (fieldName === 'fields.override') {
		if (normalizedKey.endsWith('.typeoverride')) return 'typeOverride';
		if (normalizedKey.endsWith('.abilityoverride')) return 'abilityOverride';
	}
	if (fieldName === 'fields.addto') return 'addTo';
	const raw = `${currentValue ?? ''}`.toLowerCase();
	if (/(?:^|[;\s])usescount\s*[:=]/.test(raw)) return 'usesCount';
	if (/(?:^|[;\s])update\s*[:=]/.test(raw)) return 'update';
	return 'default';
}

function buildScopedAssistEntries(scope, entries, changeKey = '', { includeEffectOriginActor = true } = {}) {
	if (scope === 'usesCount') return buildUsesCountScopedEntries(entries);
	if (scope === 'update') return buildUpdateScopedEntries(entries, changeKey, { includeEffectOriginActor });
	if (scope === 'typeOverride') return buildTypeOverrideScopedEntries();
	if (scope === 'abilityOverride') return buildAbilityOverrideScopedEntries();
	if (scope === 'addTo') return buildAddToScopedEntries();
	return [];
}

function buildTypeOverrideScopedEntries() {
	const damageTypes = Object.keys(CONFIG?.DND5E?.damageTypes ?? {});
	const healingTypes = Object.keys(CONFIG?.DND5E?.healingTypes ?? {});
	return {
		damageTypes: damageTypes
			.map((entry) => `${entry ?? ''}`.trim())
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b))
			.map((value) => ({ value, label: value.capitalize() })),
		healingTypes: healingTypes
			.map((entry) => `${entry ?? ''}`.trim())
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b))
			.map((value) => ({ value, label: value.capitalize() })),
	};
}

function buildAbilityOverrideScopedEntries() {
	return Object.keys(CONFIG?.DND5E?.abilities ?? {})
		.map((entry) => `${entry ?? ''}`.trim())
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
}

function buildAddToScopedEntries() {
	const damageTypes = Object.keys(CONFIG?.DND5E?.damageTypes ?? {})
		.map((entry) => `${entry ?? ''}`.trim())
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
	const healingTypes = Object.keys(CONFIG?.DND5E?.healingTypes ?? {})
		.map((entry) => `${entry ?? ''}`.trim())
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
	return {
		parts: [
			{ value: 'all', label: 'All' },
			{ value: 'base', label: 'Base Damage' },
			{ value: 'bonus', label: 'Bonus Damage' },
		],
		targets: [
			{ value: 'include', label: 'Include Types' },
			{ value: 'exclude', label: 'Exclude Types' },
		],
		damageTypes: buildLabeledAddToEntries(damageTypes),
		healingTypes: buildLabeledAddToEntries(healingTypes),
	};
}

function buildLabeledAddToEntries(values) {
	return values
		.map((value) => {
			const normalized = `${value ?? ''}`.trim();
			if (!normalized) return null;
			const label = formatAssistEntryLabel(normalized);
			return { value: normalized, label };
		})
		.filter(Boolean);
}

function formatAssistEntryLabel(value) {
	return `${value ?? ''}`
		.replace(/([A-Z])/g, ' $1')
		.replace(/^./, (char) => char.toUpperCase())
		.trim();
}

function flattenScopedAssistEntries(scopedEntries) {
	if (Array.isArray(scopedEntries)) return scopedEntries;
	if (!scopedEntries || typeof scopedEntries !== 'object') return [];
	return Object.values(scopedEntries)
		.flatMap((group) => (Array.isArray(group) ? group : []))
		.map((entry) => (typeof entry === 'string' ? entry : `${entry?.value ?? ''}`.trim()))
		.filter(Boolean);
}

function buildUsesCountScopedEntries(entries) {
	void entries;
	const resources = (CONFIG?.DND5E?.consumableResources ?? []).map((entry) => `${entry ?? ''}`.trim()).filter(Boolean);
	const abilityValues = Object.keys(CONFIG?.DND5E?.abilities ?? {}).map((ability) => `abilities.${ability}.value`);
	return dedupe([...AC5E_USESCOUNT_BASE_ENTRIES, ...resources, ...abilityValues]).sort((a, b) => a.localeCompare(b));
}

function buildUpdateScopedEntries(entries, changeKey = '', { includeEffectOriginActor = true } = {}) {
	void entries;
	const resources = (CONFIG?.DND5E?.consumableResources ?? []).map((entry) => `${entry ?? ''}`.trim()).filter(Boolean);
	const abilityValues = Object.keys(CONFIG?.DND5E?.abilities ?? {}).map((ability) => `abilities.${ability}.value`);
	const statusValues = getStatusEffectIds().map((id) => `statuses.${id}`);
	const actorTargets = buildCounterActorScopedTargets({
		suffixes: ['hp', 'hpTemp', 'hpMax', 'inspiration', 'exhaustion', 'death.fail', 'death.success', ...resources],
		abilityValues,
		statusValues,
		includeFlags: true,
		roots: getUpdateActorRoots(changeKey, { includeEffectOriginActor }),
	});
	return dedupe([...getUpdateActorRoots(changeKey, { includeEffectOriginActor }), ...actorTargets]).sort((a, b) => a.localeCompare(b));
}

function getUpdateActorRoots(changeKey = '', { includeEffectOriginActor = true } = {}) {
	const roots = AC5E_UPDATE_BASE_ENTRIES.filter((root) => includeEffectOriginActor || root !== 'effectOriginActor');
	if (`${changeKey ?? ''}`.toLowerCase().includes('aura')) roots.splice(2, 0, 'auraActor');
	return roots;
}

function collectMatchingIdentifiers(entries, prefixes) {
	const scoped = [];
	for (const entry of entries ?? []) {
		const identifier = `${entry?.identifier ?? ''}`.trim();
		if (!identifier) continue;
		if (prefixes.some((prefix) => identifier.startsWith(prefix))) scoped.push(identifier);
	}
	return scoped;
}

function buildCounterActorScopedTargets({ suffixes = [], abilityValues = [], statusValues = [], includeFlags = false, roots = AC5E_COUNTER_ACTOR_ROOTS } = {}) {
	const scoped = [];
	for (const root of roots) {
		for (const suffix of suffixes) scoped.push(`${root}.${suffix}`);
		for (const abilityValue of abilityValues) scoped.push(`${root}.${abilityValue}`);
		for (const statusValue of statusValues) scoped.push(`${root}.${statusValue}`);
		if (includeFlags) scoped.push(`${root}.flags.<path>`);
	}
	return scoped;
}

function buildScopedBrowserData(scopedEntries) {
	const groups = new Map();
	for (const entry of scopedEntries ?? []) {
		const identifier = `${entry ?? ''}`.trim();
		if (!identifier) continue;
		const root = identifier.includes('.') ? identifier.split('.')[0] : 'keywords';
		if (!groups.has(root)) groups.set(root, new Set([root]));
		const set = groups.get(root);
		if (root === 'keywords' && !identifier.includes('.')) set.add(`keywords.${identifier}`);
		else set.add(identifier);
	}
	const entryPoints = Array.from(groups.keys())
		.sort((a, b) => a.localeCompare(b))
		.map((root) => ({ label: root, value: root }));
	const pathsByRoot = Object.fromEntries(Array.from(groups.entries()).map(([root, set]) => [root, Array.from(set).sort((a, b) => a.localeCompare(b))]));
	const treesByRoot = Object.fromEntries(
		entryPoints.map((entry) => [entry.value, buildAssistPathTree(entry.value, pathsByRoot[entry.value] ?? [], AC5E_ADDED_LAMBDA_PATHS, AC5E_ADDED_LAMBDA_PREFIXES)]),
	);
	return { entryPoints, pathsByRoot, treesByRoot };
}

function addAssistFallbackPaths(pathsByRoot) {
	const actorRoots = ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'];
	const actorFallbacks = ['abilities', 'skills', 'tools', 'actionType', 'damageTypes', 'effects', 'statuses'];
	const statusIds = getStatusEffectIds();
	for (const root of actorRoots) {
		const paths = pathsByRoot?.[root];
		if (!Array.isArray(paths)) continue;
		for (const suffix of actorFallbacks) {
			const path = `${root}.${suffix}`;
			if (!paths.includes(path)) paths.push(path);
		}
		for (const id of statusIds) {
			const path = `${root}.statuses.${id}`;
			if (!paths.includes(path)) paths.push(path);
		}
	}
	for (const root of ['activity', 'originActivity']) {
		const paths = pathsByRoot?.[root];
		if (!Array.isArray(paths)) continue;
		for (const suffix of ['actionType', 'damageTypes', 'healingTypes', 'defaultDamageType', 'type', 'identifier', 'uuid']) {
			const path = `${root}.${suffix}`;
			if (!paths.includes(path)) paths.push(path);
		}
	}
	for (const root of ['item', 'originItem']) {
		const paths = pathsByRoot?.[root];
		if (!Array.isArray(paths)) continue;
		for (const suffix of ['type', 'type.value', 'type.subtype', 'type.baseItem', 'attackMode', 'mastery', 'itemProperties', 'actionType']) {
			const path = `${root}.${suffix}`;
			if (!paths.includes(path)) paths.push(path);
		}
	}
}

function addEnumAliasRoots(pathsByRoot) {
	if (!pathsByRoot || typeof pathsByRoot !== 'object') return;
	const damageTypes = Object.keys(CONFIG?.DND5E?.damageTypes ?? {});
	const healingTypes = Object.keys(CONFIG?.DND5E?.healingTypes ?? {});
	const combinedDamage = dedupe([...damageTypes, ...healingTypes].filter(Boolean)).sort((a, b) => a.localeCompare(b));
	const itemProps = Object.keys(CONFIG?.DND5E?.itemProperties ?? {})
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
	const masteries = Object.keys(CONFIG?.DND5E?.weaponMasteries ?? {})
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
	const abilities = Object.keys(CONFIG?.DND5E?.abilities ?? {})
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
	const skills = Object.keys(CONFIG?.DND5E?.skills ?? {})
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
	const tools = Object.keys(CONFIG?.DND5E?.tools ?? {})
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));
	const statuses = getStatusEffectIds();
	pathsByRoot.ability = ['ability'];
	pathsByRoot.skill = ['skill'];
	pathsByRoot.tool = ['tool'];
	pathsByRoot.damageTypes = ['damageTypes'];
	pathsByRoot.defaultDamageType = ['defaultDamageType'];
	pathsByRoot.actionType = ['actionType'];
	pathsByRoot.attackMode = ['attackMode'];
	pathsByRoot.itemProperties = ['itemProperties', ...itemProps.map((entry) => `itemProperties.${entry}`)];
	pathsByRoot.itemType = ['itemType'];
	pathsByRoot.originItemProperties = ['originItemProperties', ...itemProps.map((entry) => `originItemProperties.${entry}`)];
	pathsByRoot.originItemType = ['originItemType'];
	pathsByRoot.mastery = ['mastery'];
	pathsByRoot.riderStatuses = ['riderStatuses'];
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

function renderAssistCombinedFieldset(title, rootValues, entryValues, section = '', compact = false) {
	const rootItems = (rootValues ?? [])
		.map((value) => {
			const entry = `${value ?? ''}`.trim();
			if (!entry) return '';
			return `<button type="button" class="ac5e-effect-value-assist-chip" data-ac5e-assist-root-insert="${escapeHtml(entry)}">${escapeHtml(entry)}</button>`;
		})
		.filter(Boolean);
	const entryItems = (entryValues ?? [])
		.map((value) => {
			const entry = `${value ?? ''}`.trim();
			if (!entry) return '';
			return `<button type="button" class="ac5e-effect-value-assist-chip" data-ac5e-assist-entry="${escapeHtml(entry)}">${escapeHtml(entry)}</button>`;
		})
		.filter(Boolean);
	const items = [...rootItems, ...entryItems].join('');
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

function renderAssistEntryGroups(assist) {
	if (assist?.scope === 'usesCount') {
		return renderAssistActionFieldset(
			'UsesCount quick targets (actor with this effect)',
			resolveScopedQuickTargets(assist?.scopedEntries, 'usesCount'),
			'ac5e-assist-entry',
			'entry',
			'usesCount',
			true,
		);
	}
	if (assist?.scope === 'update') {
		return renderAssistActionFieldset('Update quick targets', resolveScopedQuickTargets(assist?.scopedEntries, 'update'), 'ac5e-assist-entry', 'entry', 'update', true);
	}
	if (assist?.scope === 'typeOverride') {
		const damageTypes = Array.isArray(assist?.scopedEntries?.damageTypes) ? assist.scopedEntries.damageTypes : [];
		const healingTypes = Array.isArray(assist?.scopedEntries?.healingTypes) ? assist.scopedEntries.healingTypes : [];
		return `
			${renderAssistActionFieldset('Damage Types', damageTypes, 'ac5e-assist-entry', 'button', 'type-override-damage', true)}
			${renderAssistActionFieldset('Healing Types', healingTypes, 'ac5e-assist-entry', 'button', 'type-override-healing', true)}
		`;
	}
	if (assist?.scope === 'abilityOverride') {
		return renderAssistActionFieldset('Ability Override entries', assist.scopedEntries, 'ac5e-assist-entry', 'entry', 'ability-override', true);
	}
	if (assist?.scope === 'addTo') {
		const parts = Array.isArray(assist?.scopedEntries?.parts) ? assist.scopedEntries.parts : [];
		const targets = Array.isArray(assist?.scopedEntries?.targets) ? assist.scopedEntries.targets : [];
		const damageTypes = Array.isArray(assist?.scopedEntries?.damageTypes) ? assist.scopedEntries.damageTypes : [];
		const healingTypes = Array.isArray(assist?.scopedEntries?.healingTypes) ? assist.scopedEntries.healingTypes : [];
		return `
			${renderAssistActionFieldset('Which Damage Parts', parts, 'ac5e-assist-addto-part', 'button', 'addto-parts', true)}
			${renderAssistActionFieldset('Type Filters', targets, 'ac5e-assist-addto-target', 'button', 'addto-targets', true)}
			${renderAssistActionFieldset('Damage Types', damageTypes, 'ac5e-assist-addto-type', 'button', 'addto-damage', true)}
			${renderAssistActionFieldset('Healing Types', healingTypes, 'ac5e-assist-addto-type', 'button', 'addto-healing', true)}
		`;
	}
	return `
		${renderAssistCombinedFieldset('Actor entries', assist.actorEntryButtons, assist.actorContextEntries, 'actor', true)}
		${renderAssistCombinedFieldset('Item/Activity entries', assist.itemActivityEntryButtons, assist.itemActivityContextEntries, 'item-activity', true)}
		${renderAssistActionFieldset('Roll-aware entries', assist.rollAwareEntries, 'ac5e-assist-entry', 'entry', 'roll-aware', true)}
	`;
}

function resolveScopedQuickTargets(scopedEntries, scope = '') {
	const entries = Array.isArray(scopedEntries) ? scopedEntries : [];
	if (scope === 'usesCount') {
		const preferred = [
			'origin',
			'hp',
			'hpTemp',
			'hpMax',
			'hd',
			'hd.smallest',
			'hd.largest',
			...SPELL_SLOT_USESCOUNT_ENTRIES,
			'inspiration',
			'exhaustion',
			'death.fail',
			'death.success',
			'flags.<path>',
			'Item.<itemId>',
			'Item.<itemId>.Activity.<activityId>',
		];
		// Always expose origin/item template targets for usesCount authoring.
		return dedupe([...preferred, ...entries]).filter((entry) => preferred.includes(entry));
	}
	return entries.filter((entry) => AC5E_UPDATE_BASE_ENTRIES.includes(entry) || entry === 'auraActor');
}

function classifyContextEntry(identifier) {
	const value = `${identifier ?? ''}`.trim();
	if (!value) return 'actor';
	const actorOnly = ['actorId', 'actorUuid', 'opponentId', 'opponentUuid', 'opponentActorId', 'opponentActorUuid', 'tokenId', 'tokenUuid', 'isTurn', 'isOpponentTurn', 'canMove', 'canSee', 'isSeen'];
	if (actorOnly.includes(value)) return 'actor';
	if (value.startsWith('item') || value.startsWith('originItem') || value.startsWith('activity') || value.startsWith('originActivity')) return 'item-activity';
	const itemActivityKeys = [
		'ability',
		'skill',
		'tool',
		'damageTypes',
		'defaultDamageType',
		'riderStatuses',
		'actionType',
		'attackMode',
		'itemProperties',
		'itemType',
		'originItemProperties',
		'originItemType',
		'mastery',
		'hasAttack',
		'hasDamage',
		'hasHealing',
		'hasSave',
		'hasCheck',
		'isSpell',
		'isCantrip',
		'isAoE',
	];
	if (itemActivityKeys.includes(value)) return 'item-activity';
	return 'actor';
}

function resetAssistBrowserContext(root, assist, selectionState, textarea) {
	root.dataset.ac5eAssistActiveRoot = '';
	root.dataset.ac5eAssistChain = '[]';
	root.dataset.ac5eAssistFilter = '';
	setAssistActivePath(root, '');
	renderAssistStage(root, assist, selectionState, textarea);
}

function prepareLambdaAssist(root, assist, scopeOverride = '') {
	if (!(root instanceof HTMLElement)) return;
	const assistRoot = root.matches?.('form') ? root : (root.querySelector?.('form') ?? root);
	const assistScope = `${scopeOverride || assistRoot.dataset.ac5eAssistScope || ''}`.trim();
	if (assistScope) assistRoot.dataset.ac5eAssistScope = assistScope;
	const textarea = assistRoot.querySelector('textarea[name="value"]');
	if (!(textarea instanceof HTMLTextAreaElement)) return;
	if (isEditorAutocompleteDebugEnabled()) {
		console.debug('AC5E | autocomplete.editor | prepare assist', {
			scope: assistScope,
			rootTag: assistRoot.tagName,
			rootClass: assistRoot.className,
			addToPartButtons: assistRoot.querySelectorAll('[data-ac5e-assist-addto-part]').length,
			addToTargetButtons: assistRoot.querySelectorAll('[data-ac5e-assist-addto-target]').length,
			addToTypeButtons: assistRoot.querySelectorAll('[data-ac5e-assist-addto-type]').length,
		});
	}
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
		syncAssistBrowserFromInput(assistRoot, assist, selectionState, textarea);
		updateAssistEntryHighlights(assistRoot, textarea, assist);
		if (assistScope === 'addTo') syncAddToAssistUi(assistRoot, textarea);
	};
	textarea.addEventListener('input', syncFromInput);
	textarea.addEventListener('click', syncFromInput);
	textarea.addEventListener('keyup', (event) => {
		if (['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'Tab', 'Shift'].includes(event.key)) return;
		syncFromInput();
	});
	for (const button of assistRoot.querySelectorAll('[data-ac5e-assist-insert]')) {
		button.addEventListener('click', () => {
			insertOperatorAtCursor(textarea, button.dataset.ac5eAssistInsert ?? '', assistRoot, selectionState);
			resetAssistBrowserContext(assistRoot, assist, selectionState, textarea);
		});
	}
	if (assistScope === 'addTo') {
		if (isEditorAutocompleteDebugEnabled()) {
			console.debug('AC5E | autocomplete.editor | bind addTo assist', {
				scope: assistScope,
				addToPartButtons: assistRoot.querySelectorAll('[data-ac5e-assist-addto-part]').length,
				addToTargetButtons: assistRoot.querySelectorAll('[data-ac5e-assist-addto-target]').length,
				addToTypeButtons: assistRoot.querySelectorAll('[data-ac5e-assist-addto-type]').length,
			});
		}
		assistRoot.addEventListener('click', (event) => {
			const target = event.target instanceof Element ? event.target : null;
			if (!target) return;
			const partButton = target.closest('[data-ac5e-assist-addto-part]');
			if (partButton instanceof HTMLElement) {
				const part = `${partButton.getAttribute('data-ac5e-assist-addto-part') ?? ''}`.trim();
				if (!part) return;
				if (isEditorAutocompleteDebugEnabled()) {
					console.debug('AC5E | autocomplete.editor | addTo click part', {
						part,
						scope: assistScope,
						currentValue: textarea.value,
					});
				}
				applyAddToAssistPart(textarea, assistRoot, part, selectionState);
				return;
			}
			const targetButton = target.closest('[data-ac5e-assist-addto-target]');
			if (targetButton instanceof HTMLElement) {
				const typeTarget = `${targetButton.getAttribute('data-ac5e-assist-addto-target') ?? ''}`.trim();
				if (!typeTarget) return;
				if (isEditorAutocompleteDebugEnabled()) {
					console.debug('AC5E | autocomplete.editor | addTo click target', {
						target: typeTarget,
						scope: assistScope,
						currentValue: textarea.value,
					});
				}
				focusAddToAssistTarget(textarea, assistRoot, typeTarget, selectionState);
				return;
			}
			const typeButton = target.closest('[data-ac5e-assist-addto-type]');
			if (typeButton instanceof HTMLElement) {
				const type = `${typeButton.getAttribute('data-ac5e-assist-addto-type') ?? ''}`.trim();
				if (!type) return;
				if (isEditorAutocompleteDebugEnabled()) {
					console.debug('AC5E | autocomplete.editor | addTo click type', {
						type,
						scope: assistScope,
						currentValue: textarea.value,
						activeTarget: assistRoot.dataset.ac5eAddToTypeTarget ?? '',
					});
				}
				applyAddToAssistType(textarea, assistRoot, type, selectionState);
			}
		});
	}
	for (const button of assistRoot.querySelectorAll('[data-ac5e-assist-entry]')) {
		button.addEventListener('click', () => {
			const value = (button.dataset.ac5eAssistEntry ?? '').trim();
			if (!value) return;
			if (isCounterAssistScope(assistScope)) {
				applyCounterAssistEntrySelection(textarea, value, assistRoot, assist, selectionState);
				return;
			}
			if (assistScope === 'typeOverride' || assistScope === 'abilityOverride') {
				insertDelimitedAssistEntry(textarea, value, selectionState);
				return;
			}
			if (applyProfileAssistEntrySelection(textarea, value, assistRoot, assist, selectionState)) return;
			const insertion = resolveAssistEntryInsertion(value);
			replaceTokenAtCursorOrInsert(textarea, insertion, selectionState);
		});
	}
	for (const button of assistRoot.querySelectorAll('[data-ac5e-assist-root-insert]')) {
		button.addEventListener('click', () => {
			const rootName = (button.dataset.ac5eAssistRootInsert ?? '').trim();
			if (!rootName) return;
			if (isCounterAssistScope(assistScope)) {
				applyCounterAssistRootSelection(textarea, rootName, assistRoot, assist, selectionState);
				return;
			}
			replaceTokenAtCursorOrInsert(textarea, `${resolveAssistRootInsertion(rootName)}.`, selectionState);
			assistRoot.dataset.ac5eAssistActiveRoot = rootName;
			assistRoot.dataset.ac5eAssistChain = '[]';
			assistRoot.dataset.ac5eAssistFilter = '';
			setAssistActivePath(assistRoot, '');
			renderAssistStage(assistRoot, assist, selectionState, textarea);
		});
	}
	setAssistActivePath(assistRoot, '');
	assistRoot.dataset.ac5eAssistFilter = '';
	renderAssistStage(assistRoot, assist, selectionState, textarea);
	updateAssistEntryHighlights(assistRoot, textarea, assist);
	if (assistScope === 'addTo') syncAddToAssistUi(assistRoot, textarea);
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
	const headerPath = chain.length ? chain[chain.length - 1] : activeRoot;
	const stageNodes = getAssistStageNodes(parentNode, headerPath);
	const filterText = (root.dataset.ac5eAssistFilter ?? '').trim().toLowerCase();
	const nodes = filterText ? stageNodes.filter((node) => assistEntryMatchesToken(node?.label, filterText)) : stageNodes;
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
		const node = findTreeNodeByPath(tree, nodePath) ?? nodes.find((candidate) => candidate?.path === nodePath) ?? null;
		nodeButton.addEventListener('click', () => {
			if (!node) return;
			if (node.isVirtualArrayMethod) {
				replaceTokenAtCursorOrInsert(textarea, node.insertion ?? '', selectionState);
				resetAssistBrowserContext(root, assist, selectionState, textarea);
				return;
			}
			if (node.children?.length) {
				const insertionPath = resolveAssistNodeCompletionInsertion(textarea, node);
				replaceTokenAtCursorOrInsert(textarea, insertionPath, selectionState);
				syncAssistBrowserFromInput(root, assist, selectionState, textarea);
				return;
			}
			const assistScope = getAssistScope(root);
			if (isCounterAssistScope(assistScope) && applyCounterAssistPathSelection(textarea, node.path, root, assist, selectionState)) {
				resetAssistBrowserContext(root, assist, selectionState, textarea);
				return;
			}
			setAssistActivePath(root, node.path);
			const insertionPath = resolveAssistNodeInsertionPath(textarea, node.path);
			replaceTokenAtCursorOrInsert(textarea, `${insertionPath}${insertionPath.endsWith('.') ? '' : ' '}`, selectionState);
			if (insertionPath.endsWith('.')) syncAssistBrowserFromInput(root, assist, selectionState, textarea);
			else resetAssistBrowserContext(root, assist, selectionState, textarea);
		});
		nodeButton.addEventListener('dblclick', () => {
			if (!node?.terminal) return;
			if (node.isVirtualArrayMethod) {
				replaceTokenAtCursorOrInsert(textarea, node.insertion ?? '', selectionState);
				resetAssistBrowserContext(root, assist, selectionState, textarea);
				return;
			}
			const assistScope = getAssistScope(root);
			if (isCounterAssistScope(assistScope) && applyCounterAssistPathSelection(textarea, node.path, root, assist, selectionState)) {
				resetAssistBrowserContext(root, assist, selectionState, textarea);
				return;
			}
			setAssistActivePath(root, node.path);
			const insertionPath = resolveAssistNodeInsertionPath(textarea, node.path);
			replaceTokenAtCursorOrInsert(textarea, `${insertionPath}${insertionPath.endsWith('.') ? '' : ' '}`, selectionState);
			if (insertionPath.endsWith('.')) syncAssistBrowserFromInput(root, assist, selectionState, textarea);
			else resetAssistBrowserContext(root, assist, selectionState, textarea);
		});
	}
	for (const valueButton of container.querySelectorAll('[data-ac5e-assist-value]')) {
		const groupPath = resolveAssistValueGroupPath(root.dataset.ac5eAssistValuePath ?? '');
		const enumPath = resolveAssistEnumClausePath(textarea, root.dataset.ac5eAssistValuePath ?? '', valueButton.dataset.ac5eAssistValue ?? '');
		if (groupPath) {
			const value = `${valueButton.dataset.ac5eAssistValue ?? ''}`.replace(/^'/, '').replace(/'$/, '').replace(/\\'/g, "'");
			valueButton.hidden = isAssistOrClauseSelected(textarea, `${groupPath}.${value}`);
		}
		if (enumPath) valueButton.hidden = isAssistOrClauseSelected(textarea, enumPath);
		valueButton.addEventListener('click', () => {
			const value = valueButton.dataset.ac5eAssistValue ?? '';
			if (!value) return;
			insertAssistValueAtCursor(textarea, value, root.dataset.ac5eAssistValuePath ?? '', selectionState);
		});
	}
}

function getAssistStageNodes(parentNode, headerPath) {
	const allNodes = parentNode?.children ?? [];
	const hasArrayIndexChild = allNodes.some((node) => isNumericPathSegment(node?.label));
	const arrayLikePath = isLikelyArrayPath(headerPath);
	const allVisibleNodes = allNodes.filter((node) => !isNumericPathSegment(node?.label));
	const arrayMethodNodes = hasArrayIndexChild || arrayLikePath ? buildArrayMethodAssistNodes(headerPath) : [];
	return [...arrayMethodNodes, ...allVisibleNodes];
}

function syncAssistBrowserFromInput(root, assist, selectionState, textarea) {
	if (!(root instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) return;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	const normalizedToken = (token ?? '').trim();
	if (!token) {
		if (root.dataset.ac5eAssistActiveRoot) resetAssistBrowserContext(root, assist, selectionState, textarea);
		return;
	}
	const context = resolveAssistInputContext(token, assist, textarea.value, caret, root.dataset.ac5eAssistActiveRoot ?? '');
	if (!context) {
		if (isEditorAutocompleteDebugEnabled()) {
			console.debug('AC5E | autocomplete.editor | unresolved context', {
				token,
				caret,
				activeRoot: root.dataset.ac5eAssistActiveRoot ?? '',
			});
		}
		const activeRoot = `${root.dataset.ac5eAssistActiveRoot ?? ''}`.trim();
		if (activeRoot && !token.includes('.')) {
			// Keep the current browse context so short tokens like "len" can match staged nodes (e.g. effects -> length).
			const nextFilter = normalizedToken;
			if ((root.dataset.ac5eAssistFilter ?? '') !== nextFilter) {
				root.dataset.ac5eAssistFilter = nextFilter;
				renderAssistStage(root, assist, selectionState, textarea);
			}
			return;
		}
		return;
	}
	const nextChain = JSON.stringify(context.chain ?? []);
	const nextRoot = context.root ?? '';
	const nextFilter = context.filter ?? '';
	const changed = root.dataset.ac5eAssistActiveRoot !== nextRoot || (root.dataset.ac5eAssistChain ?? '[]') !== nextChain || (root.dataset.ac5eAssistFilter ?? '') !== nextFilter;
	if (!changed) {
		if (normalizedToken.endsWith('.')) renderAssistStage(root, assist, selectionState, textarea);
		return;
	}
	root.dataset.ac5eAssistActiveRoot = nextRoot;
	root.dataset.ac5eAssistChain = nextChain;
	root.dataset.ac5eAssistFilter = nextFilter;
	setAssistActivePath(root, '');
	if (isEditorAutocompleteDebugEnabled()) {
		console.debug('AC5E | autocomplete.editor | context', {
			token,
			root: nextRoot,
			chain: context.chain ?? [],
			filter: nextFilter,
		});
	}
	renderAssistStage(root, assist, selectionState, textarea);
}

function resolveAssistInputContext(token, assist, fullText = '', caret = 0, activeRoot = '') {
	const normalized = (token ?? '').trim();
	if (!normalized) return null;
	const trailingDot = normalized.endsWith('.');
	const trimmed = trailingDot ? normalized.slice(0, -1) : normalized;
	const segments = trimmed.split('.').filter(Boolean);
	if (!segments.length) return null;
	const root = resolveAssistCanonicalRoot(segments[0]);
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
		damageTypes: ['activity', 'originActivity'],
		defaultDamageType: ['activity', 'originActivity'],
		actionType: ['activity', 'originActivity', 'item', 'originItem'],
		attackMode: ['item', 'originItem'],
		itemProperties: ['item', 'originItem'],
		itemType: ['item', 'originItem'],
		originItemProperties: ['originItem'],
		originItemType: ['originItem'],
		mastery: ['item', 'originItem'],
	};
	const candidateRoots = enumPathRoots[enumPathKey];
	if (!candidateRoots?.length) return null;
	const inferredRoot = inferAssistRootFromTextContext(fullText, caret, assist, candidateRoots, activeRoot);
	if (!inferredRoot || !assist?.treesByRoot?.[inferredRoot]) return null;
	const inferredPath = `${inferredRoot}.${enumPathKey}`;
	return { root: inferredRoot, chain: [inferredPath], filter: '' };
}

function resolveAssistCanonicalRoot(rootName) {
	const value = `${rootName ?? ''}`.trim();
	return value;
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
	const matches = roots.filter((entry) => assistEntryMatchesToken(entry, normalized));
	if (!matches.length) return false;
	const entryMatches = getAssistEntryMatchesInUiOrder(root, normalized);
	const uniqueMatches = new Set([...matches, ...entryMatches]);
	if (uniqueMatches.size > 1) return false;
	const selected = matches[0];
	const assistScope = getAssistScope(root);
	if (isCounterAssistScope(assistScope)) {
		applyCounterAssistRootSelection(textarea, selected, root, assist, selectionState);
		return true;
	}
	if (applyProfileAssistEntrySelection(textarea, selected, root, assist, selectionState)) return true;
	const selectedRoot = resolveAssistRootInsertion(selected);
	replaceTokenAtCursorOrInsert(textarea, `${selectedRoot}.`, selectionState);
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
			const headerPath = chain.length ? chain[chain.length - 1] : activeRoot;
			const stageNodes = getAssistStageNodes(parentNode, headerPath);
			const match = stageNodes.find((node) => assistEntryMatchesToken(node?.label, normalized));
			if (match?.path) {
				const insertion = match.isVirtualArrayMethod ? (match.insertion ?? '') : resolveAssistNodeCompletionInsertion(textarea, match);
				const assistScope = getAssistScope(root);
				if (isCounterAssistScope(assistScope) && !match.isVirtualArrayMethod && applyCounterAssistPathSelection(textarea, match.path, root, assist, selectionState)) {
					syncAssistBrowserFromInput(root, assist, selectionState, textarea);
					return true;
				}
				if (isEditorAutocompleteDebugEnabled()) {
					console.debug('AC5E | autocomplete.editor | tab path match', {
						token: normalized,
						matchPath: match.path,
						insertion,
					});
				}
				replaceTokenAtCursorOrInsert(textarea, insertion, selectionState);
				syncAssistBrowserFromInput(root, assist, selectionState, textarea);
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
	const headerPath = chain.length ? chain[chain.length - 1] : context.root;
	const stageNodes = getAssistStageNodes(parentNode, headerPath);
	const filterText = (context.filter ?? '').trim().toLowerCase();
	const nodes = filterText ? stageNodes.filter((node) => assistEntryMatchesToken(node?.label, filterText)) : stageNodes;
	if (!nodes.length) return false;
	const insertion = nodes[0].isVirtualArrayMethod ? (nodes[0].insertion ?? '') : resolveAssistNodeCompletionInsertion(textarea, nodes[0]);
	const assistScope = getAssistScope(root);
	if (isCounterAssistScope(assistScope) && !nodes[0].isVirtualArrayMethod && applyCounterAssistPathSelection(textarea, nodes[0].path, root, assist, selectionState)) {
		syncAssistBrowserFromInput(root, assist, selectionState, textarea);
		return true;
	}
	if (isEditorAutocompleteDebugEnabled()) {
		console.debug('AC5E | autocomplete.editor | tab fallback match', {
			token,
			root: context.root,
			matchPath: nodes[0].path,
			insertion,
		});
	}
	replaceTokenAtCursorOrInsert(textarea, insertion, selectionState);
	syncAssistBrowserFromInput(root, assist, selectionState, textarea);
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
	const assistScope = getAssistScope(root);
	const operatorOnlyMode = shouldIncludeOperatorMatches(rawToken, root, token);
	const suggestedOperatorButtons = getSuggestedOperatorButtons(root, textarea);
	const suggestedOperatorMode = shouldUseSuggestedOperatorMode(rawToken, suggestedOperatorButtons);
	const matches = operatorOnlyMode || suggestedOperatorMode ? [] : (explicitMatches ?? (token ? getAssistEntryMatchesInUiOrder(root, token) : []));
	const allMatchButtons =
		suggestedOperatorMode ? suggestedOperatorButtons
		: token ? getAssistMatchButtonsInUiOrder(root, token, rawToken)
		: suggestedOperatorButtons;
	const rootMatchButtons = allMatchButtons.filter((button) => Boolean(button.dataset.ac5eAssistRootInsert));
	const operatorMatchButtons = allMatchButtons.filter((button) => Boolean(button.dataset.ac5eAssistInsert));
	const rootMatches = rootMatchButtons.map((button) => normalizeAssistMatchKey(button.dataset.ac5eAssistRootInsert ?? '')).filter(Boolean);
	const entryMatches = matches.map((value) => normalizeAssistMatchKey(value)).filter(Boolean);
	const operatorMatches = operatorMatchButtons.map((button) => getAssistButtonValue(button)).filter(Boolean);
	const combined = dedupe([...rootMatches, ...entryMatches, ...operatorMatches]);
	const single = combined.length === 1 ? combined[0] : '';
	const focused = normalizeAssistMatchKey(root.dataset.ac5eAssistEntryFocus ?? '');
	const resolvedFocus =
		combined.length ?
			combined.includes(focused) ?
				focused
			:	combined[0]
		:	'';
	root.dataset.ac5eAssistEntryFocus = resolvedFocus;
	const selectedTypeOverrides =
		assistScope === 'typeOverride' ?
			new Set(
				`${textarea.value ?? ''}`
					.split(',')
					.map((entry) => entry.trim().toLowerCase())
					.filter(Boolean),
			)
		:	null;
	for (const button of root.querySelectorAll('[data-ac5e-assist-entry]')) {
		const value = button.dataset.ac5eAssistEntry ?? '';
		const lower = value.toLowerCase();
		const matchesToken =
			operatorOnlyMode || suggestedOperatorMode ? false
			: token ? assistEntryMatchesToken(lower, token)
			: false;
		const key = normalizeAssistMatchKey(value);
		button.classList.toggle('active', matchesToken || (resolvedFocus && key === resolvedFocus));
		button.classList.toggle('ac5e-effect-value-assist-focused', Boolean(resolvedFocus) && key === resolvedFocus);
		button.classList.toggle('ac5e-effect-value-assist-single-match', Boolean(single) && key === single);
		button.hidden = selectedTypeOverrides?.has(lower) ?? false;
	}
	const rootToken = token.includes('.') ? '' : token;
	for (const button of root.querySelectorAll('[data-ac5e-assist-root-insert]')) {
		const value = normalizeAssistMatchKey(button.dataset.ac5eAssistRootInsert ?? '');
		const starts =
			operatorOnlyMode || suggestedOperatorMode ? false
			: rootToken ? assistEntryMatchesToken(value, rootToken)
			: false;
		const isFocused = Boolean(resolvedFocus) && value === resolvedFocus;
		button.classList.toggle('active', starts || isFocused);
		button.classList.toggle('ac5e-effect-value-assist-focused', isFocused);
		button.classList.toggle('ac5e-effect-value-assist-single-match', Boolean(single) && value === single);
	}
	for (const button of root.querySelectorAll('[data-ac5e-assist-insert]')) {
		const key = getAssistButtonValue(button);
		const matchesToken = token ? shouldIncludeOperatorMatches(rawToken, root, token) && operatorMatchesToken(button, rawToken) : false;
		const isSuggested = suggestedOperatorButtons.includes(button);
		const isFocused = Boolean(resolvedFocus) && key === resolvedFocus;
		button.classList.toggle('active', matchesToken || isSuggested || isFocused);
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
	const suggestedOperatorButtons = getSuggestedOperatorButtons(root, textarea);
	if (shouldUseSuggestedOperatorMode(normalized, suggestedOperatorButtons)) {
		const cycled = cycleAssistButtonFocus(root, suggestedOperatorButtons, direction);
		if (!cycled?.selected) return false;
		updateAssistEntryHighlights(root, textarea, assist);
		return true;
	}
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
	const suggestedOperatorButtons = getSuggestedOperatorButtons(root, textarea);
	if (shouldUseSuggestedOperatorMode(normalized, suggestedOperatorButtons)) {
		const focused = normalizeAssistMatchKey(root.dataset.ac5eAssistEntryFocus ?? '');
		const selectedButton = suggestedOperatorButtons.find((button) => getAssistButtonValue(button) === focused) ?? suggestedOperatorButtons[0];
		const selectedOperator = `${selectedButton?.dataset?.ac5eAssistInsert ?? ''}`.trim();
		if (!selectedOperator) return false;
		insertOperatorAtCursor(textarea, selectedOperator, root, selectionState);
		updateAssistEntryHighlights(root, textarea, assist);
		return true;
	}
	if (!normalized || normalized.includes('.')) return false;
	const matches = getAssistMatchButtonsInUiOrder(root, normalized, token);
	if (!matches.length) return false;
	const focused = normalizeAssistMatchKey(root.dataset.ac5eAssistEntryFocus ?? '');
	const selectedButton = matches.find((button) => getAssistButtonValue(button) === focused) ?? matches[0];
	if (!(selectedButton instanceof HTMLElement)) return false;
	const selectedOperator = `${selectedButton.dataset.ac5eAssistInsert ?? ''}`.trim();
	if (selectedOperator) {
		insertOperatorAtCursor(textarea, selectedOperator, root, selectionState);
		updateAssistEntryHighlights(root, textarea, assist);
		return true;
	}
	const selectedRoot = (selectedButton.dataset.ac5eAssistRootInsert ?? '').trim();
	if (selectedRoot) {
		const assistScope = getAssistScope(root);
		if (isCounterAssistScope(assistScope)) {
			applyCounterAssistRootSelection(textarea, selectedRoot, root, assist, selectionState);
			updateAssistEntryHighlights(root, textarea, assist);
			return true;
		}
		replaceTokenAtCursorOrInsert(textarea, `${resolveAssistRootInsertion(selectedRoot)}.`, selectionState);
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
	const assistScope = getAssistScope(root);
	if (isCounterAssistScope(assistScope)) {
		applyCounterAssistEntrySelection(textarea, selected, root, assist, selectionState);
		updateAssistEntryHighlights(root, textarea, assist);
		return true;
	}
	const insertion = resolveAssistEntryInsertion(selected);
	replaceTokenAtCursorOrInsert(textarea, insertion, selectionState);
	updateAssistEntryHighlights(root, textarea, assist);
	return true;
}

function resolveAssistEntryInsertion(entry) {
	const value = `${entry ?? ''}`.trim();
	if (!value) return '';
	if (ROOT_IDENTIFIERS.has(value)) return `${value}.`;
	if (
		[
			'ability',
			'skill',
			'tool',
			'damageTypes',
			'defaultDamageType',
			'actionType',
			'attackMode',
			'mastery',
			'itemProperties',
			'itemType',
			'originItemProperties',
			'originItemType',
			'activityType',
			'creatureType',
			'abilities',
			'skills',
			'tools',
			'statuses',
			'riderStatuses',
		].includes(value)
	)
		return `${value}.`;
	return `${value} `;
}

function resolveAssistRootInsertion(rootName) {
	const value = `${rootName ?? ''}`.trim();
	if (value === 'abilities') return 'ability';
	if (value === 'skills') return 'skill';
	if (value === 'tools') return 'tool';
	return value;
}

function getDefaultAddToAssistSpec() {
	return { parts: 'all', includeTypes: [], excludeTypes: [], explicitParts: false, explicitIncludeClause: false, explicitExcludeClause: false };
}

function getParsedAddToAssistSpec(value) {
	return _parseAddToSpec(value) ?? getDefaultAddToAssistSpec();
}

function setAddToAssistValue(textarea, root, nextValue, selectionState = null, cursor = null) {
	if (!(textarea instanceof HTMLTextAreaElement)) return;
	if (isEditorAutocompleteDebugEnabled()) {
		console.debug('AC5E | autocomplete.editor | addTo set value', {
			previousValue: textarea.value,
			nextValue,
			cursor,
			scope: root instanceof HTMLElement ? (root.dataset.ac5eAssistScope ?? '') : '',
		});
	}
	textarea.value = nextValue;
	const resolvedCursor = Number.isInteger(cursor) ? cursor : nextValue.length;
	textarea.focus();
	textarea.setSelectionRange(resolvedCursor, resolvedCursor);
	if (selectionState) {
		selectionState.start = resolvedCursor;
		selectionState.end = resolvedCursor;
		selectionState.userMovedCaret = true;
	}
	textarea.dispatchEvent(new Event('input', { bubbles: true }));
	if (root instanceof HTMLElement) syncAddToAssistUi(root, textarea);
}

function getAddToClauseRange(value, target = 'include') {
	const raw = `${value ?? ''}`;
	const pattern = target === 'exclude' ? /!types\(([^)]*)\)/i : /(^|;)types\(([^)]*)\)/i;
	const match = pattern.exec(raw);
	if (!match) return null;
	if (target === 'exclude') {
		const start = match.index + '!types('.length;
		const end = start + (match[1] ?? '').length;
		return { start, end };
	}
	const prefixLength = (match[1] ?? '').length;
	const start = match.index + prefixLength + 'types('.length;
	const end = start + (match[2] ?? '').length;
	return { start, end };
}

function detectAddToAssistTarget(root, textarea, spec = getParsedAddToAssistSpec(textarea?.value ?? '')) {
	if (!(textarea instanceof HTMLTextAreaElement)) return 'include';
	const caret = Number(textarea.selectionStart ?? 0);
	for (const target of ['exclude', 'include']) {
		const range = getAddToClauseRange(textarea.value, target);
		if (range && caret >= range.start && caret <= range.end) return target;
	}
	const explicitTarget = `${root?.dataset?.ac5eAddToTypeTarget ?? ''}`.trim();
	if (explicitTarget === 'include' || explicitTarget === 'exclude') return explicitTarget;
	if (spec.includeTypes.length) return 'include';
	if (spec.excludeTypes.length) return 'exclude';
	return 'include';
}

function getAddToAssistCursor(value, target) {
	const range = getAddToClauseRange(value, target);
	return range ? range.end : String(value ?? '').length;
}

function focusAddToAssistTarget(textarea, root, target, selectionState = null) {
	if (!(textarea instanceof HTMLTextAreaElement) || !(root instanceof HTMLElement)) return;
	const spec = getParsedAddToAssistSpec(textarea.value);
	root.dataset.ac5eAddToTypeTarget = target;
	const nextSpec = {
		...spec,
		explicitIncludeClause: target === 'include' ? true : !!spec.explicitIncludeClause,
		explicitExcludeClause: target === 'exclude' ? true : !!spec.explicitExcludeClause,
	};
	const serialized = _stringifyAddToSpec(nextSpec);
	const cursor = getAddToAssistCursor(serialized, target);
	if (isEditorAutocompleteDebugEnabled()) {
		console.debug('AC5E | autocomplete.editor | addTo focus target', {
			target,
			spec,
			nextSpec,
			serialized,
			cursor,
		});
	}
	setAddToAssistValue(textarea, root, serialized, selectionState, cursor);
}

function applyAddToAssistPart(textarea, root, part, selectionState = null) {
	if (!(textarea instanceof HTMLTextAreaElement) || !(root instanceof HTMLElement)) return;
	const spec = getParsedAddToAssistSpec(textarea.value);
	spec.parts = part;
	spec.explicitParts = true;
	const nextValue = _stringifyAddToSpec(spec);
	const target = detectAddToAssistTarget(root, textarea, spec);
	const cursor = getAddToClauseRange(nextValue, target) ? getAddToAssistCursor(nextValue, target) : nextValue.length;
	if (isEditorAutocompleteDebugEnabled()) {
		console.debug('AC5E | autocomplete.editor | addTo apply part', {
			part,
			spec,
			nextValue,
			target,
			cursor,
		});
	}
	setAddToAssistValue(textarea, root, nextValue, selectionState, cursor);
}

function applyAddToAssistType(textarea, root, type, selectionState = null) {
	if (!(textarea instanceof HTMLTextAreaElement) || !(root instanceof HTMLElement)) return;
	const spec = getParsedAddToAssistSpec(textarea.value);
	const target = detectAddToAssistTarget(root, textarea, spec);
	root.dataset.ac5eAddToTypeTarget = target;
	const includeTypes = new Set(spec.includeTypes);
	const excludeTypes = new Set(spec.excludeTypes);
	if (target === 'exclude') {
		includeTypes.delete(type);
		excludeTypes.add(type);
	} else {
		excludeTypes.delete(type);
		includeTypes.add(type);
	}
	spec.includeTypes = [...includeTypes];
	spec.excludeTypes = [...excludeTypes];
	spec.explicitIncludeClause = spec.includeTypes.length > 0 || target === 'include' || !!spec.explicitIncludeClause;
	spec.explicitExcludeClause = spec.excludeTypes.length > 0 || target === 'exclude' || !!spec.explicitExcludeClause;
	const nextValue = _stringifyAddToSpec(spec);
	const cursor = getAddToAssistCursor(nextValue, target);
	if (isEditorAutocompleteDebugEnabled()) {
		console.debug('AC5E | autocomplete.editor | addTo apply type', {
			type,
			target,
			spec,
			nextValue,
			cursor,
		});
	}
	setAddToAssistValue(textarea, root, nextValue, selectionState, cursor);
}

function syncAddToAssistUi(root, textarea) {
	if (!(root instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) return;
	const spec = getParsedAddToAssistSpec(textarea.value);
	const target = detectAddToAssistTarget(root, textarea, spec);
	root.dataset.ac5eAddToTypeTarget = target;
	for (const button of root.querySelectorAll('[data-ac5e-assist-addto-part]')) {
		const value = `${button.getAttribute('data-ac5e-assist-addto-part') ?? ''}`.trim();
		button.classList.toggle('active', value === (spec.parts ?? 'all'));
	}
	for (const button of root.querySelectorAll('[data-ac5e-assist-addto-target]')) {
		const value = `${button.getAttribute('data-ac5e-assist-addto-target') ?? ''}`.trim();
		button.classList.toggle('active', value === target);
	}
	const activeTypeSet = new Set(target === 'exclude' ? spec.excludeTypes : spec.includeTypes);
	for (const button of root.querySelectorAll('[data-ac5e-assist-addto-type]')) {
		const value = `${button.getAttribute('data-ac5e-assist-addto-type') ?? ''}`.trim();
		button.hidden = activeTypeSet.has(value);
	}
}

function insertDelimitedAssistEntry(input, rawValue, selectionState = null) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
	const value = `${rawValue ?? ''}`.trim();
	if (!value) return;
	const current = `${input.value ?? ''}`.trim();
	if (!current) {
		input.value = value;
		const cursor = value.length;
		input.focus();
		input.setSelectionRange(cursor, cursor);
		if (selectionState) {
			selectionState.start = cursor;
			selectionState.end = cursor;
			selectionState.userMovedCaret = true;
		}
		input.dispatchEvent(new Event('input', { bubbles: true }));
		return;
	}
	const parts = current
		.split(',')
		.map((entry) => entry.trim())
		.filter(Boolean);
	if (parts.includes(value)) return;
	const next = `${parts.join(', ')}, ${value}`;
	input.value = next;
	const cursor = next.length;
	input.focus();
	input.setSelectionRange(cursor, cursor);
	if (selectionState) {
		selectionState.start = cursor;
		selectionState.end = cursor;
		selectionState.userMovedCaret = true;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

function applyFocusedAssistRoot(textarea, root, assist, selectionState) {
	if (!(textarea instanceof HTMLTextAreaElement)) return false;
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	const normalized = (token ?? '').trim();
	if (!normalized || normalized.includes('.')) return false;
	const roots = (assist?.entryPoints ?? []).map((entry) => `${entry?.value ?? ''}`.trim()).filter(Boolean);
	const matches = roots.filter((entry) => assistEntryMatchesToken(entry, normalized));
	if (!matches.length) return false;
	const selected = matches[0];
	const assistScope = getAssistScope(root);
	if (isCounterAssistScope(assistScope)) {
		applyCounterAssistRootSelection(textarea, selected, root, assist, selectionState);
		return true;
	}
	if (applyProfileAssistEntrySelection(textarea, selected, root, assist, selectionState)) return true;
	replaceTokenAtCursorOrInsert(textarea, `${selected}.`, selectionState);
	root.dataset.ac5eAssistActiveRoot = selected;
	root.dataset.ac5eAssistChain = '[]';
	root.dataset.ac5eAssistFilter = '';
	setAssistActivePath(root, '');
	renderAssistStage(root, assist, selectionState, textarea);
	return true;
}

function applyProfileAssistEntrySelection(textarea, entryValue, assistRoot, assist, selectionState = null) {
	const activeRoot = getProfileAssistEntryRoot(entryValue);
	if (!activeRoot) return false;
	replaceTokenAtCursorOrInsert(textarea, resolveAssistEntryInsertion(entryValue), selectionState);
	assistRoot.dataset.ac5eAssistActiveRoot = activeRoot;
	assistRoot.dataset.ac5eAssistChain = '[]';
	assistRoot.dataset.ac5eAssistFilter = '';
	setAssistActivePath(assistRoot, '');
	renderAssistStage(assistRoot, assist, selectionState, textarea);
	return true;
}

function getProfileAssistEntryRoot(entryValue) {
	const value = `${entryValue ?? ''}`.trim();
	if (['ability', 'skill', 'tool'].includes(value)) return value;
	if (ENUM_ASSIST_ALIAS_ROOTS.has(value)) return value;
	return '';
}

function isCounterAssistScope(scope = '') {
	return scope === 'usesCount' || scope === 'update';
}

function getAssistScope(root) {
	return `${root?.dataset?.ac5eAssistScope ?? ''}`.trim();
}

function isCounterActorRoot(value = '') {
	return ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'].includes(value);
}

function isCounterPathRoot(value = '') {
	return ['rollingActor', 'opponentActor', 'auraActor', 'effectActor', 'nonEffectActor', 'effectOriginActor'].some((root) => value.startsWith(`${root}.`));
}

function applyCounterAssistRootSelection(textarea, rootName, assistRoot, assist, selectionState = null) {
	if (!(textarea instanceof HTMLTextAreaElement)) return;
	setAssistFieldValue(textarea, `${rootName}.`, `${rootName}.`.length, `${rootName}.`.length, selectionState);
	assistRoot.dataset.ac5eAssistActiveRoot = rootName;
	assistRoot.dataset.ac5eAssistChain = '[]';
	assistRoot.dataset.ac5eAssistFilter = '';
	setAssistActivePath(assistRoot, '');
	renderAssistStage(assistRoot, assist, selectionState, textarea);
}

function applyCounterAssistEntrySelection(textarea, entryValue, assistRoot, assist, selectionState = null) {
	if (!(textarea instanceof HTMLTextAreaElement)) return;
	if (isCounterActorRoot(entryValue)) {
		applyCounterAssistRootSelection(textarea, entryValue, assistRoot, assist, selectionState);
		return;
	}
	applyCounterTargetTemplate(textarea, entryValue, selectionState);
	resetAssistBrowserContext(assistRoot, assist, selectionState, textarea);
}

function applyCounterAssistPathSelection(textarea, path, assistRoot, assist, selectionState = null) {
	if (!(textarea instanceof HTMLTextAreaElement)) return false;
	const targetPath = `${path ?? ''}`.trim();
	if (!targetPath) return false;
	if (isCounterActorRoot(targetPath)) {
		applyCounterAssistRootSelection(textarea, targetPath, assistRoot, assist, selectionState);
		return true;
	}
	if (isCounterPathRoot(targetPath)) {
		applyCounterTargetTemplate(textarea, targetPath, selectionState);
		return true;
	}
	return false;
}

function applyCounterTargetTemplate(textarea, target, selectionState = null) {
	const normalizedTarget = `${target ?? ''}`.trim();
	if (!normalizedTarget) return;
	const placeholder = normalizedTarget.match(/<[^>]+>/);
	if (placeholder) {
		const start = placeholder.index ?? 0;
		const end = start + placeholder[0].length;
		setAssistFieldValue(textarea, normalizedTarget, start, end, selectionState);
		return;
	}
	setAssistFieldValue(textarea, normalizedTarget, normalizedTarget.length, normalizedTarget.length, selectionState);
}

function setAssistFieldValue(input, value, selectionStart, selectionEnd, selectionState = null) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
	input.value = value;
	input.focus();
	input.setSelectionRange(selectionStart, selectionEnd);
	if (selectionState) {
		selectionState.start = selectionStart;
		selectionState.end = selectionEnd;
		selectionState.userMovedCaret = true;
		selectionState.recentAssistInsert = null;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
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
	for (const button of root.querySelectorAll('[data-ac5e-assist-root-insert], [data-ac5e-assist-entry], [data-ac5e-assist-insert]')) {
		if (button.dataset.ac5eAssistInsert && !shouldIncludeOperatorMatches(rawToken, root, query)) continue;
		const value = getAssistButtonValue(button).trim();
		if (!value) continue;
		if (!assistEntryMatchesToken(value, query)) continue;
		buttons.push(button);
	}
	return buttons;
}

function getSuggestedOperatorButtons(root, textarea) {
	if (!(root instanceof HTMLElement) || !(textarea instanceof HTMLTextAreaElement)) return [];
	const operators = getSuggestedOperatorsForRecentEntry(textarea, root);
	if (!operators.size) return [];
	return Array.from(root.querySelectorAll('[data-ac5e-assist-insert]')).filter((button) => operators.has(`${button.dataset.ac5eAssistInsert ?? ''}`.trim()));
}

function shouldUseSuggestedOperatorMode(token, buttons) {
	const normalized = `${token ?? ''}`.trim();
	if (!Array.isArray(buttons) || !buttons.length) return false;
	return !normalized || isOperatorAssistEntry(normalized) || isBooleanAssistToken(normalized);
}

function getSuggestedOperatorsForRecentEntry(textarea, root = null) {
	if (getRecentBooleanAssistToken(textarea, root)) return BOOLEAN_LOGICAL_OPERATORS;
	const entry = getRecentAssistEntryValue(textarea) || getOperatorAssistEntryToken(textarea);
	if (NUMBER_OPERATOR_ASSIST_ENTRIES.has(entry)) return NUMBER_COMPARATOR_OPERATORS;
	if (STRING_OPERATOR_ASSIST_ENTRIES.has(entry)) return STRING_COMPARISON_OPERATORS;
	return new Set();
}

function isOperatorAssistEntry(value) {
	const entry = `${value ?? ''}`.trim();
	return NUMBER_OPERATOR_ASSIST_ENTRIES.has(entry) || STRING_OPERATOR_ASSIST_ENTRIES.has(entry);
}

function getRecentAssistEntryValue(textarea) {
	if (!(textarea instanceof HTMLTextAreaElement)) return '';
	const caret = Number(textarea.selectionStart ?? 0);
	if (caret !== Number(textarea.selectionEnd ?? caret)) return '';
	const before = `${textarea.value ?? ''}`.slice(0, caret);
	const match = before.match(/(?:^|[\s!(|&])([A-Za-z_$][\w$-]*)\s*$/);
	return match?.[1] ?? '';
}

function getOperatorAssistEntryToken(textarea) {
	if (!(textarea instanceof HTMLTextAreaElement)) return '';
	const caret = Number(textarea.selectionStart ?? 0);
	const token = extractAutocompleteToken(textarea.value, caret);
	return isOperatorAssistEntry(token) ? token : '';
}

function getRecentBooleanAssistToken(textarea, root = null) {
	const range = getRecentBooleanAssistTokenRange(textarea, root);
	return range?.token ?? '';
}

function getRecentBooleanAssistTokenRange(textarea, root = null) {
	if (!(textarea instanceof HTMLTextAreaElement)) return null;
	const caret = Number(textarea.selectionStart ?? 0);
	if (caret !== Number(textarea.selectionEnd ?? caret)) return null;
	const before = `${textarea.value ?? ''}`.slice(0, caret);
	const match = before.match(/(?:^|[\s!(|&])(!?)([A-Za-z_$][\w$-]*(?:\.[A-Za-z_$][\w$-]*)*)\s*$/);
	if (!match) return null;
	const token = match[2] ?? '';
	if (!isBooleanAssistToken(token)) return null;
	const leadingLength = match[0].length - `${match[1] ?? ''}${token}${match[0].match(/\s*$/)?.[0] ?? ''}`.length;
	const negationStart = (match.index ?? 0) + leadingLength;
	const tokenStart = negationStart + (match[1] ?? '').length;
	if (isInsideActiveAssistPath(root, token, before)) return null;
	return { negationStart, tokenStart, tokenEnd: tokenStart + token.length, end: caret, token, negated: Boolean(match[1]) };
}

function isBooleanAssistToken(token) {
	const value = `${token ?? ''}`.trim();
	if (!value) return false;
	if (!value.includes('.')) return isConditionEntry(value);
	const [root] = value.split('.');
	return ENUM_ASSIST_ALIAS_ROOTS.has(root);
}

function isInsideActiveAssistPath(root, token, before) {
	if (!(root instanceof HTMLElement)) return false;
	if (/\s$/.test(before)) return false;
	const activeRoot = `${root.dataset.ac5eAssistActiveRoot ?? ''}`.trim();
	return Boolean(activeRoot) && (token === activeRoot || token.startsWith(`${activeRoot}.`));
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
	const first = raw[0] ?? '';
	if (first !== first.toUpperCase()) return false;
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
			<div class="ac5e-effect-value-assist-list"><p class="ac5e-effect-value-assist-empty">Type or select a supported root/path to browse available entries.</p></div>
		</div>
	`;
}

function renderAssistNodeStage(nodes, headerPath, canGoBack, valueChoices = []) {
	const items = (nodes ?? [])
		.map((node) => {
			const marker = node.children?.length ? '>' : '';
			const ac5eMarker = node.ac5eActorAdded ? '*' : '';
			const displayLabel = resolveAssistNodeDisplayLabel(node, headerPath);
			return `<button type="button" class="ac5e-effect-value-assist-node" data-ac5e-assist-node="${escapeHtml(node.path)}" title="${escapeHtml(node.path)}">${escapeHtml(displayLabel)}${ac5eMarker ? ` ${ac5eMarker}` : ''} ${marker}</button>`;
		})
		.join('');
	const empty = items || '<p class="ac5e-effect-value-assist-empty">No paths available</p>';
	const values = (valueChoices ?? [])
		.map((choice) => {
			const rawValue = typeof choice === 'string' ? choice : `${choice?.value ?? ''}`.trim();
			const label = typeof choice === 'string' ? choice : `${choice?.label ?? choice?.value ?? ''}`.trim();
			if (!rawValue || !label) return '';
			return `<button type="button" class="ac5e-effect-value-assist-node" data-ac5e-assist-value="${escapeHtml(`'${rawValue.replaceAll("'", "\\'")}'`)}">${escapeHtml(label)}</button>`;
		})
		.filter(Boolean)
		.join('');
	const valuesSection = values ? `<div class="ac5e-effect-value-assist-toolbar"><span>Values</span></div><div class="ac5e-effect-value-assist-list">${values}</div>` : '';
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
	if (/^(?:ability)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.abilities ?? [], CONFIG?.DND5E?.abilities);
	if (/^(?:skill)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.skills ?? [], CONFIG?.DND5E?.skills);
	if (/^(?:tool)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.tools ?? [], getToolLabelConfig());
	if (/^(?:riderStatuses)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.statuses ?? []);
	if (/^(?:damageTypes|defaultDamageType)$/.test(sourcePath)) return toAssistValueChoices(dedupe([...(enumValues?.damageTypes ?? []), ...(enumValues?.healingTypes ?? [])]));
	if (/^(?:actionType)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.actionTypes ?? []);
	if (/^(?:attackMode)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.attackModes ?? []);
	if (/^(?:itemProperties)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.itemProperties ?? [], CONFIG?.DND5E?.itemProperties);
	if (/^(?:itemType)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.itemTypes ?? []);
	if (/^(?:originItemProperties)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.itemProperties ?? [], CONFIG?.DND5E?.itemProperties);
	if (/^(?:originItemType)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.itemTypes ?? []);
	if (/^(?:mastery)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.masteries ?? [], CONFIG?.DND5E?.weaponMasteries);
	if (/\.(?:creatureType)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.creatureTypes ?? []);
	if (/\.(?:damageTypes|defaultDamageType)$/.test(sourcePath)) return toAssistValueChoices(dedupe([...(enumValues?.damageTypes ?? []), ...(enumValues?.healingTypes ?? [])]));
	if (/\.(?:healingTypes)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.healingTypes ?? []);
	if (/\.(?:actionType)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.actionTypes ?? []);
	if (/^(?:activity|originActivity)\.type$/.test(sourcePath)) return toAssistValueChoices(enumValues?.activityTypes ?? []);
	if (/^(?:item|originItem)\.type\.value$/.test(sourcePath)) return toAssistValueChoices(enumValues?.itemTypeValues ?? []);
	if (/^(?:item|originItem)\.type\.baseItem$/.test(sourcePath)) return toAssistValueChoices(enumValues?.baseItems ?? []);
	if (/\.(?:itemType)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.itemTypes ?? []);
	if (/\.(?:attackMode)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.attackModes ?? []);
	if (/\.(?:mastery)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.masteries ?? [], CONFIG?.DND5E?.weaponMasteries);
	if (/\.(?:itemProperties)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.itemProperties ?? [], CONFIG?.DND5E?.itemProperties);
	if (/\.(?:originItemProperties)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.itemProperties ?? [], CONFIG?.DND5E?.itemProperties);
	if (/\.(?:statuses)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.statuses ?? []);
	if (/^(?:abilities)$/.test(sourcePath) || /\.(?:abilities)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.abilities ?? [], CONFIG?.DND5E?.abilities);
	if (/^(?:skills)$/.test(sourcePath) || /\.(?:skills)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.skills ?? [], CONFIG?.DND5E?.skills);
	if (/^(?:tools)$/.test(sourcePath) || /\.(?:tools)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.tools ?? [], getToolLabelConfig());
	if (/\.(?:type)$/.test(sourcePath)) {
		if (/^(?:rollingActor|opponentActor|effectActor|nonEffectActor|auraActor)\./.test(sourcePath)) return toAssistValueChoices(enumValues?.actorTypes ?? []);
		if (/^(?:activity|originActivity)\./.test(sourcePath)) return toAssistValueChoices(enumValues?.activityTypes ?? []);
	}
	if (/\.(?:baseItem)$/.test(sourcePath)) return toAssistValueChoices(enumValues?.baseItems ?? []);
	return [];
}

function resolveAssistNodeDisplayLabel(node, headerPath = '') {
	const fallback = `${node?.label ?? ''}`.trim();
	if (!fallback) return '';
	const path = `${node?.path ?? ''}`.trim();
	const parentPath = `${headerPath ?? ''}`.trim();
	if (!path || !parentPath || node?.children?.length) return fallback;
	if (parentPath === 'mastery' || parentPath.endsWith('.mastery')) return resolveAssistEnumLabel(fallback, CONFIG?.DND5E?.weaponMasteries);
	if (parentPath === 'itemProperties' || parentPath.endsWith('.itemProperties')) return resolveAssistEnumLabel(fallback, CONFIG?.DND5E?.itemProperties);
	if (parentPath === 'originItemProperties' || parentPath.endsWith('.originItemProperties')) return resolveAssistEnumLabel(fallback, CONFIG?.DND5E?.itemProperties);
	return fallback;
}

function toAssistValueChoices(values, labelConfig = null, { appendKey = false } = {}) {
	return (values ?? [])
		.map((value) => {
			const key = `${value ?? ''}`.trim();
			if (!key) return null;
			return { value: key, label: resolveAssistEnumLabel(key, labelConfig, { appendKey }) };
		})
		.filter(Boolean);
}

function resolveAssistEnumLabel(key, labelConfig = null, { appendKey = false } = {}) {
	const fallback = `${key ?? ''}`.trim();
	if (!fallback) return '';
	const withKey = (label) => (appendKey && label && label !== fallback ? `${fallback} (${label})` : label);
	const configEntry = labelConfig?.[fallback];
	if (typeof configEntry === 'string') {
		const localized = game?.i18n?.localize?.(configEntry);
		const label = localized && localized !== configEntry ? localized : configEntry;
		return withKey(String(label).capitalize?.() ?? label);
	}
	if (configEntry && typeof configEntry === 'object') {
		const rawLabel =
			typeof configEntry.label === 'string' ? configEntry.label
			: typeof configEntry.name === 'string' ? configEntry.name
			: '';
		if (rawLabel) {
			const localized = game?.i18n?.localize?.(rawLabel);
			const label = localized && localized !== rawLabel ? localized : rawLabel;
			return withKey(String(label).capitalize?.() ?? label);
		}
	}
	return fallback;
}

function getToolLabelConfig() {
	const tools = CONFIG?.DND5E?.tools ?? {};
	return Object.fromEntries(
		Object.keys(tools).map((key) => {
			const tool = fromUuidSync?.(tools[key]?.id);
			const label = tool && typeof tool.then !== 'function' ? tool.name : '';
			return [key, { label: label || key.capitalize() }];
		}),
	);
}

function insertAssistValueAtCursor(input, quotedValue, valuePath, selectionState = null) {
	if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
	const path = `${valuePath ?? ''}`.trim();
	const value = `${quotedValue ?? ''}`.trim();
	if (!path || !value) return insertAtCursor(input, value, selectionState);
	const normalizedValue = value.replace(/^'/, '').replace(/'$/, '').replace(/\\'/g, "'");
	const groupPath = resolveAssistValueGroupPath(path);
	if (groupPath) {
		const enumPath = `${groupPath}.${normalizedValue}`;
		if (tryAppendEnumPathClause(input, enumPath, selectionState)) return;
		if (tryReplaceTrailingEnumPathToken(input, enumPath, groupPath, selectionState)) return;
		return insertAtCursor(input, enumPath, selectionState);
	}
	if (/^(?:item|originItem)\.mastery$/.test(path)) {
		const clause = `${path} === ${value}`;
		if (tryAppendEqualityClause(input, clause, path, selectionState)) return;
		if (tryReplaceTrailingEnumPathToken(input, clause, path, selectionState)) return;
		return insertAtCursor(input, clause, selectionState);
	}
	if (isEnumAssistValuePath(path)) {
		const basePath = resolveAssistEnumInsertionBasePath(input, path);
		const enumPath = `${basePath}.${normalizedValue}`;
		if (tryAppendEnumPathClause(input, enumPath, selectionState)) return;
		if (tryReplaceTrailingEnumPathToken(input, enumPath, basePath, selectionState)) return;
		return insertAtCursor(input, enumPath, selectionState);
	}
	if (path.endsWith('.damageTypes') || path.endsWith('.defaultDamageType')) {
		const enumPath = `${path}.${normalizedValue}`;
		if (tryAppendEnumPathClause(input, enumPath, selectionState)) return;
		if (tryReplaceTrailingEnumPathToken(input, enumPath, path, selectionState)) return;
		return insertAtCursor(input, enumPath, selectionState);
	}
	if (tryAppendAssistClauseAfterOperator(input, value, path, selectionState)) return;
	if (!path.endsWith('.creatureType')) return insertAtCursor(input, value, selectionState);
	if (tryAppendCreatureTypeIncludesClause(input, value, path, selectionState)) return;
	if (tryReplaceTrailingPathWithCreatureTypeClause(input, value, path, selectionState)) return;
	insertAtCursor(input, `${path}.includes(${value})`, selectionState);
}

function resolveAssistValueGroupPath(path) {
	const value = `${path ?? ''}`.trim();
	if (value === 'abilities' || value.endsWith('.abilities')) return 'ability';
	if (value === 'skills' || value.endsWith('.skills')) return 'skill';
	if (value === 'tools' || value.endsWith('.tools')) return 'tool';
	return '';
}

function isEnumAssistValuePath(path) {
	const value = `${path ?? ''}`.trim();
	if (!value) return false;
	if (ENUM_ASSIST_ALIAS_ROOTS.has(value)) return true;
	return (
		/\.(?:actionType|attackMode|itemProperties|itemType|mastery)$/.test(value) ||
		value.endsWith('.originItemProperties') ||
		value.endsWith('.originItemType') ||
		/^(?:item|originItem)\.type\.(?:value|baseItem)$/.test(value) ||
		/^(?:activity|originActivity)\.type$/.test(value)
	);
}

function resolveAssistEnumInsertionBasePath(input, path) {
	const value = `${path ?? ''}`.trim();
	if (!value) return value;
	if (ENUM_ASSIST_ALIAS_ROOTS.has(value)) return value;
	const cursor = Number(input?.selectionStart ?? input?.value?.length ?? 0);
	const token = extractAutocompleteToken(input?.value ?? '', cursor);
	const tokenBase = token.split('.').filter(Boolean)[0] ?? '';
	if (ENUM_ASSIST_ALIAS_ROOTS.has(tokenBase) && (value.endsWith(`.${tokenBase}`) || value === tokenBase)) return tokenBase;
	return value;
}

function resolveAssistEnumClausePath(input, path, quotedValue) {
	const value = `${quotedValue ?? ''}`.trim().replace(/^'/, '').replace(/'$/, '').replace(/\\'/g, "'");
	if (!value || !isEnumAssistValuePath(path)) return '';
	return `${resolveAssistEnumInsertionBasePath(input, path)}.${value}`;
}

function isAssistOrClauseSelected(input, clause) {
	return `${input?.value ?? ''}`
		.split(/\s*\|\|\s*/)
		.map((part) => part.trim())
		.includes(clause);
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

function tryAppendEqualityClause(input, clause, basePath, selectionState = null) {
	const cursor = Number(input.selectionStart ?? input.value.length);
	const selectionEnd = Number(input.selectionEnd ?? cursor);
	if (cursor !== selectionEnd) return false;
	const before = input.value.slice(0, cursor).trimEnd();
	const escaped = escapeRegExp(basePath);
	const match = before.match(new RegExp(`${escaped}\\s*(?:==|===)\\s*'(?:\\\\'|[^'])*'\\s*$`));
	if (!match) return false;
	const insertion = ` || ${clause}`;
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
	if (isExpandableAssistPath(path)) return `${path}.`;
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

function resolveAssistNodeCompletionInsertion(textarea, node) {
	const insertion = resolveAssistNodeInsertionPath(textarea, node?.path);
	if (node?.children?.length && insertion && !insertion.endsWith('.')) return `${insertion}.`;
	return insertion;
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
	const nextStart = insertion.selectionLength > 0 ? start + Math.min(insertion.selectionStartOffset, replacementText.length) : start + replacementText.length;
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
	const hasExplicitSelection = Boolean(selectionState?.userMovedCaret) && Number.isInteger(selectionState?.start) && Number.isInteger(selectionState?.end);
	const start = hasExplicitSelection ? selectionState.start : input.value.length;
	const end = hasExplicitSelection ? selectionState.end : input.value.length;
	const insertionText = normalizeOperatorInsertion(input.value, start, end, insertion.text);
	input.value = `${input.value.slice(0, start)}${insertionText}${input.value.slice(end)}`;
	const selectionStart = insertion.selectionLength > 0 ? start + Math.min(insertion.selectionStartOffset, insertionText.length) : start + insertionText.length;
	const selectionEnd = selectionStart + insertion.selectionLength;
	input.focus();
	input.setSelectionRange(selectionStart, selectionEnd);
	if (selectionState) {
		selectionState.start = selectionStart;
		selectionState.end = selectionEnd;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertOperatorAtCursor(input, text, root = null, selectionState = null) {
	const operator = `${text ?? ''}`.trim();
	if (operator === '!' && togglePreviousBooleanAssistToken(input, root, selectionState)) return;
	insertAtCursor(input, text, selectionState);
}

function togglePreviousBooleanAssistToken(input, root = null, selectionState = null) {
	if (!(input instanceof HTMLTextAreaElement)) return false;
	const range = getRecentBooleanAssistTokenRange(input, root);
	if (!range) return false;
	const source = `${input.value ?? ''}`;
	const replacement = `${range.negated ? '' : '!'}${range.token} `;
	input.value = `${source.slice(0, range.negationStart)}${replacement}${source.slice(range.end)}`;
	const caret = range.negationStart + replacement.length;
	input.focus();
	input.setSelectionRange(caret, caret);
	if (selectionState) {
		selectionState.start = caret;
		selectionState.end = caret;
		selectionState.userMovedCaret = true;
		selectionState.recentAssistInsert = null;
	}
	input.dispatchEvent(new Event('input', { bubbles: true }));
	return true;
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
	if (unaryOperators.has(trimmed)) return `${needsLead ? ' ' : ''}${trimmed}`;
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
	const placeholderMatch = rawText.match(/<[^>]+>/);
	if (placeholderMatch) {
		const tokenOffset = placeholderMatch.index ?? 0;
		return {
			text: rawText,
			selectionStartOffset: tokenOffset,
			selectionLength: placeholderMatch[0].length,
		};
	}
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
	const arrayTemplates = ['.some((entry) => condition)', '.filter((entry) => condition)', '.find((entry) => condition)'];
	for (const template of arrayTemplates) {
		if (!trimmed.endsWith(template)) continue;
		const tokenOffset = rawText.indexOf('condition');
		if (tokenOffset < 0) continue;
		return {
			text: rawText,
			selectionStartOffset: tokenOffset,
			selectionLength: 'condition'.length,
		};
	}
	return { text: rawText, selectionStartOffset: rawText.length, selectionLength: 0 };
}

function buildArrayMethodAssistNodes(path) {
	const base = `${path ?? ''}`.trim();
	if (!base) return [];
	return [
		{ label: 'length', path: `${base}.length`, terminal: true, isVirtualArrayMethod: true, insertion: `${base}.length `, children: [] },
		{ label: 'some(...)', path: `${base}.some`, terminal: true, isVirtualArrayMethod: true, insertion: `${base}.some((entry) => condition)`, children: [] },
		{ label: 'filter(...)', path: `${base}.filter`, terminal: true, isVirtualArrayMethod: true, insertion: `${base}.filter((entry) => condition)`, children: [] },
		{ label: 'find(...)', path: `${base}.find`, terminal: true, isVirtualArrayMethod: true, insertion: `${base}.find((entry) => condition)`, children: [] },
	];
}

function isNumericPathSegment(value) {
	return /^\d+$/.test(`${value ?? ''}`.trim());
}

function isLikelyArrayPath(path) {
	const value = `${path ?? ''}`.trim().toLowerCase();
	if (!value) return false;
	return /(?:^|\.)(effects|equippeditems|items|appliedeffects|statusesarray)$/.test(value);
}

function isExpandableAssistPath(path) {
	const value = `${path ?? ''}`.trim();
	if (!value) return false;
	if (/\.\d+$/.test(value)) return false;
	const last = value.split('.').at(-1)?.toLowerCase() ?? '';
	if (
		[
			'effects',
			'equippeditems',
			'abilities',
			'skills',
			'tools',
			'statuses',
			'riderstatuses',
			'damagetypes',
			'defaultdamagetype',
			'itemproperties',
			'itemtype',
			'actiontype',
			'activitytype',
			'attackmode',
			'mastery',
			'creaturetype',
		].includes(last)
	)
		return true;
	return false;
}

function getStatusEffectConfigs() {
	const effects = CONFIG?.statusEffects;
	if (!effects) return [];
	if (typeof foundry?.utils?.iterateValues === 'function') return Array.from(foundry.utils.iterateValues(effects));
	if (Array.isArray(effects)) return effects;
	return Object.values(effects);
}

function getStatusEffectIds() {
	const entries = getStatusEffectConfigs();
	const ids = entries.map((entry) => `${entry?.id ?? ''}`.trim()).filter(Boolean);
	return dedupe(ids).sort((a, b) => a.localeCompare(b));
}

function isEditorAutocompleteDebugEnabled() {
	return foundry.utils.getProperty(globalThis?.[Constants.MODULE_NAME_SHORT], 'debug.autocompletion.editor') === true;
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
		nextIndex = direction > 0 ? targets.findIndex((target) => target.start >= end) : findLastIndex(targets, (target) => target.end <= start);
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
	const placeholders = Array.from(text.matchAll(/<[^>]+>/g))
		.map((match) => ({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length }))
		.filter((target) => target.end > target.start);
	if (placeholders.length) return placeholders;
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
	return Boolean(
		rows?.nameDescription?.left || rows?.nameDescription?.right || rows?.usesCount?.left || rows?.usesCount?.right || rows?.usesCount?.scaling || rows?.update?.left || rows?.update?.right,
	);
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
	if (profile.supportsAddTo) fieldNames.push('addTo');
	return dedupe(fieldNames);
}

function getRangeFieldUiState(root, profile = {}) {
	const state = {};
	for (const field of profile.rangeFields ?? []) {
		state[field] = hasCheckedInput(root, `ui.showRange${field.replace(/^./, (char) => char.toUpperCase())}`);
	}
	return state;
}

function clearHiddenRangeFields(data, profile = {}, state = {}) {
	for (const field of profile.rangeFields ?? []) {
		if (!state[field]) data.fields[field] = '';
	}
}

function preserveHiddenRangeFields(data, baseData, profile = {}, state = {}, root = null) {
	for (const field of profile.rangeFields ?? []) {
		if (!state[field] || !hasNamedInput(root, `fields.${field}`)) data.fields[field] = baseData?.fields?.[field] ?? '';
	}
}

function hasNamedInput(root, name) {
	if (!root) return false;
	if (root instanceof HTMLFormElement) return Array.from(root.elements).some((element) => element.name === name);
	const escapedName = globalThis.CSS?.escape?.(name) ?? name.replaceAll('"', '\\"');
	return Boolean(root.querySelector(`[name="${escapedName}"]`));
}

function buildCadenceOptions(selectedValue = '') {
	return [
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
	const scalingParts = [];
	if (normalizedScaling.min) scalingParts.push(`min: ${normalizedScaling.min}`);
	if (normalizedScaling.max) scalingParts.push(`max: ${normalizedScaling.max}`);
	if (normalizedScaling.step) scalingParts.push(`step: ${normalizedScaling.step}`);
	const scalingLiteral = `{ ${scalingParts.join(', ')} }`;
	return `${baseValue}, ${scalingLiteral}`;
}

function parseUsesCountUiParts(baseValue) {
	const current = typeof baseValue === 'string' ? baseValue.trim() : '';
	if (!current) return { path: '', amount: '', setMode: false };
	const firstComma = current.indexOf(',');
	if (firstComma < 0) return { path: current, amount: '', setMode: false };
	const path = current.slice(0, firstComma).trim();
	const consumeRaw = current.slice(firstComma + 1).trim();
	if (!consumeRaw) return { path, amount: '', setMode: false };
	if (consumeRaw.startsWith('=')) return { path, amount: consumeRaw.slice(1).trim(), setMode: true };
	return { path, amount: consumeRaw, setMode: false };
}

function parseUpdateUiParts(rawValue) {
	const current = typeof rawValue === 'string' ? rawValue.trim() : '';
	if (!current) return { path: '', amount: '' };
	const firstComma = current.indexOf(',');
	if (firstComma < 0) return { path: current, amount: '' };
	return {
		path: current.slice(0, firstComma).trim(),
		amount: current.slice(firstComma + 1).trim(),
	};
}

function buildUsesCountValueFromUi(root, { includeScaling = false, scalingInputs = null, preferExisting = '' } = {}) {
	const fallback = typeof preferExisting === 'string' ? preferExisting.trim() : '';
	const path = `${getInputValue(root, 'ui.usesCountPath') ?? ''}`.trim();
	if (!path) return fallback;
	const amountInput = `${getInputValue(root, 'ui.usesCountAmount') ?? ''}`.trim();
	const recover = hasCheckedInput(root, 'toggles.recover');
	if (includeScaling) return updateUsesCountScaling(path, scalingInputs);
	let amountLiteral = amountInput || '1';
	const isSetMode = amountLiteral.startsWith('=');
	if (!isSetMode && recover && !amountLiteral.startsWith('-')) amountLiteral = `-${amountLiteral}`;
	let usesCountValue = `${path}, ${amountLiteral}`;
	return usesCountValue;
}

function buildUpdateValueFromUi(root, { preferExisting = '' } = {}) {
	const fallback = typeof preferExisting === 'string' ? preferExisting.trim() : '';
	const path = `${getInputValue(root, 'ui.updatePath') ?? ''}`.trim();
	if (!path) return fallback;
	const amountLiteral = `${getInputValue(root, 'ui.updateAmount') ?? ''}`.trim() || '1';
	return `${path}, ${amountLiteral}`;
}

function parseUsesCountScalingSpec(rawValue) {
	const current = typeof rawValue === 'string' ? rawValue.trim() : '';
	if (!current) return { baseValue: '', scaling: null };
	const match = current.match(/^(.*?),\s*[+-]?\s*\{([\s\S]*)\}\s*$/u);
	if (!match) return { baseValue: current, scaling: null };
	const baseValue = match[1].trim();
	const objectSource = match[2] ?? '';
	const scaling = {
		min: extractScalingKey(objectSource, 'min'),
		max: extractScalingKey(objectSource, 'max'),
		step: extractScalingKey(objectSource, 'step'),
	};
	return { baseValue, scaling };
}

function extractScalingKey(source, key) {
	if (typeof source !== 'string' || typeof key !== 'string') return '';
	const part = splitTopLevelCsv(source).find((candidate) => new RegExp(`^\\s*${key}\\s*[:=]`, 'i').test(candidate));
	if (!part) return '';
	return part.replace(new RegExp(`^\\s*${key}\\s*[:=]\\s*`, 'i'), '').trim();
}

function splitTopLevelCsv(value) {
	const text = String(value ?? '');
	const parts = [];
	let depth = 0;
	let current = '';
	for (const char of text) {
		if (char === ',' && depth === 0) {
			parts.push(current);
			current = '';
			continue;
		}
		current += char;
		if (char === '(' || char === '[' || char === '{') depth += 1;
		else if ((char === ')' || char === ']' || char === '}') && depth > 0) depth -= 1;
	}
	parts.push(current);
	return parts;
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
	return {
		min: minRaw || String(DEFAULT_USESCOUNT_SCALING.min),
		max: maxRaw,
		step: stepRaw || String(DEFAULT_USESCOUNT_SCALING.step),
	};
}
