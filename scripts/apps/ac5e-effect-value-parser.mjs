const ASSIGNMENT_FIELDS = [
	'bonus',
	'modifier',
	'set',
	'radius',
	'threshold',
	'chance',
	'usesCount',
	'enforceMode',
	'name',
	'description',
	'addTo',
];

const TOGGLE_FIELDS = [
	'allies',
	'enemies',
	'includeSelf',
	'singleAura',
	'wallsBlock',
	'once',
	'oncePerTurn',
	'oncePerRound',
	'oncePerCombat',
	'itemLimited',
	'partialConsume',
	'optin',
];

const ASSIGNMENT_LOOKUP = new Map(ASSIGNMENT_FIELDS.map((field) => [field.toLowerCase(), field]));
const TOGGLE_LOOKUP = new Map(TOGGLE_FIELDS.map((field) => [field.toLowerCase(), field]));

export { ASSIGNMENT_FIELDS, TOGGLE_FIELDS };

export function parseAc5eEffectValue(value = '') {
	const parsed = {
		fields: Object.fromEntries(ASSIGNMENT_FIELDS.map((field) => [field, ''])),
		toggles: Object.fromEntries(TOGGLE_FIELDS.map((field) => [field, false])),
		conditions: [],
		raw: [],
	};

	for (const fragment of splitEffectValueFragments(value)) {
		const assignment = fragment.match(/^([A-Za-z][\w-]*)\s*=\s*(.*)$/s);
		if (assignment) {
			const [, rawKey, rawAssignmentValue] = assignment;
			const field = ASSIGNMENT_LOOKUP.get(rawKey.toLowerCase());
			if (rawKey.toLowerCase() === 'condition') {
				if (rawAssignmentValue.trim()) parsed.conditions.push(rawAssignmentValue.trim());
				continue;
			}
			if (!field && /^\s*[=<>!]/.test(rawAssignmentValue)) {
				parsed.conditions.push(fragment);
				continue;
			}
			if (field && !parsed.fields[field]) {
				parsed.fields[field] = rawAssignmentValue.trim();
			} else {
				parsed.raw.push(fragment);
			}
			continue;
		}

		const toggle = TOGGLE_LOOKUP.get(fragment.toLowerCase());
		if (toggle) {
			parsed.toggles[toggle] = true;
			continue;
		}

		parsed.conditions.push(fragment);
	}

	return parsed;
}

export function serializeAc5eEffectValue({ fields = {}, toggles = {}, conditions = [], raw = [] } = {}) {
	const fragments = [];
	for (const field of ASSIGNMENT_FIELDS) {
		const value = String(fields[field] ?? '').trim();
		if (value) fragments.push(`${field}=${value}`);
	}
	for (const toggle of TOGGLE_FIELDS) {
		if (toggles[toggle]) fragments.push(toggle);
	}
	fragments.push(
		...conditions.map((condition) => String(condition ?? '').trim()).filter(Boolean),
		...raw.map((fragment) => String(fragment ?? '').trim()).filter(Boolean),
	);
	return fragments.join('; ');
}

export function collectAc5eEffectValueFormData(form) {
	const fields = Object.fromEntries(ASSIGNMENT_FIELDS.map((field) => [field, getNamedValue(form, `fields.${field}`)]));
	const toggles = Object.fromEntries(TOGGLE_FIELDS.map((field) => [field, hasCheckedInput(form, `toggles.${field}`)]));
	const conditions = splitConditionFragments(getNamedValue(form, 'conditions'));
	const raw = getNamedValues(form, 'raw').flatMap((value) => splitLines(value));
	return { fields, toggles, conditions, raw };
}

function getNamedValue(root, name) {
	const input = getNamedInputs(root, name)[0];
	return String(input?.value ?? '').trim();
}

function getNamedValues(root, name) {
	return getNamedInputs(root, name).map((input) => input.value);
}

function hasCheckedInput(root, name) {
	return getNamedInputs(root, name).some((input) => input.checked);
}

function getNamedInputs(root, name) {
	if (!root) return [];
	if (root instanceof HTMLFormElement) return Array.from(root.elements).filter((element) => element.name === name);
	const escapedName = globalThis.CSS?.escape?.(name) ?? name.replaceAll('"', '\\"');
	return Array.from(root.querySelectorAll(`[name="${escapedName}"]`));
}

function splitLines(value) {
	return String(value ?? '')
		.split('\n')
		.map((fragment) => fragment.trim())
		.filter(Boolean);
}

function splitConditionFragments(value) {
	return String(value ?? '')
		.split(/[\n;]+/)
		.map((fragment) => fragment.trim())
		.filter(Boolean);
}

export function mergeAc5eEffectValueFormData(baseData, formData, { fieldNames = ASSIGNMENT_FIELDS, toggleNames = TOGGLE_FIELDS } = {}) {
	const merged = {
		fields: { ...(baseData?.fields ?? {}) },
		toggles: { ...(baseData?.toggles ?? {}) },
		conditions: formData.conditions ?? [],
		raw: formData.raw ?? [],
	};
	for (const field of fieldNames) {
		merged.fields[field] = formData.fields?.[field] ?? '';
	}
	for (const toggle of toggleNames) {
		merged.toggles[toggle] = Boolean(formData.toggles?.[toggle]);
	}
	return merged;
}

function splitEffectValueFragments(value) {
	return String(value ?? '')
		.split(';')
		.map((fragment) => fragment.trim())
		.filter(Boolean);
}
