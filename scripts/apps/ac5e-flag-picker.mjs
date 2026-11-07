import { _generateAC5eFlags } from '../ac5e-helpers.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const MODE_ROWS = [
	['advantage', 'bonus', 'critical', 'disadvantage', 'fail', 'fumble', 'success'],
	['criticalThreshold', 'extraDice', 'fumbleThreshold', 'modifier', 'info'],
	['abilityOverride', 'typeOverride', 'modifyAC', 'modifyDC', 'modifyDenomination'],
	['noAdvantage', 'noCritical', 'noDisadvantage', 'range'],
];
const MAIN_MODES = MODE_ROWS.flat();
const GENERIC_MODES = ['allowEffectApplication', 'crossbowExpert', 'sharpShooter'];

function getModeActions(flags, mode, scope) {
	return new Set(flags.filter(flag => flag.mode === mode && (!scope || flag.scope === scope)).map(flag => flag.action));
}

export function normalizeFlagKey(key = '') {
	return String(key).trim().replace(/^flags\.ac5e\./i, 'flags.automated-conditions-5e.');
}

export function getSelectableFlags() {
	return _generateAC5eFlags().filter(key => !key.includes('.ACTIONTYPE.')).map(key => {
		const parts = key.split('.').slice(2);
		const scope = ['grants', 'aura'].includes(parts[0]) ? parts.shift() : 'source';
		return { key, scope, action: parts.length > 1 ? parts[0] : '', mode: parts.at(-1) };
	});
}

export function isSupportedFlag(key) {
	const canonical = normalizeFlagKey(key).replace(/\.range\.(short|long|reach|bonus)$/i, '.range');
	return getSelectableFlags().some(flag => flag.key === canonical);
}

export class AC5EFlagPicker extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: 'ac5e-flag-picker-{id}',
		classes: ['ac5e-flag-picker'],
		window: { title: 'AC5E.FlagPicker.Title', resizable: false },
		position: { width: 680, height: 'auto' },
		actions: { choose: AC5EFlagPicker.choose, continue: AC5EFlagPicker.continue },
	};
	static PARTS = { body: { template: 'modules/automated-conditions-5e/templates/apps/ac5e-flag-picker.hbs' } };

	constructor({ key, onSelect }, options = {}) {
		super(options);
		this.flags = getSelectableFlags();
		const current = this.flags.find(flag => flag.key === normalizeFlagKey(key));
		this.selection = current ? { scope: current.scope, action: current.action, mode: current.mode } : { scope: 'source' };
		this.onSelect = onSelect;
	}

	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const selected = this.flags.find(flag => ['scope', 'action', 'mode'].every(row => flag[row] === (this.selection[row] ?? (row === 'action' ? '' : undefined))));
		const finalModeSelected = !!selected;
		const genericUnavailable = (!!this.selection.mode && MAIN_MODES.includes(this.selection.mode)) || (this.selection.action !== undefined && this.selection.action !== '');
		return {
			...context, listId: `${this.id}-flags`, selectedKey: selected?.key,
			flagPreview: ['flags.automated-conditions-5e', this.selection.scope === 'source' ? '' : this.selection.scope, this.selection.action, this.selection.mode].filter(Boolean).join('.'),
			rows: [{ row: 'scope' }, { row: 'action' }, { row: 'mode', generic: false }, { row: 'mode', generic: true }].map(({ row, generic }) => {
				const values = [...new Set(this.flags.filter(flag => row !== 'mode' || !MAIN_MODES.includes(flag.mode) === generic).map(flag => flag[row]))];
				const groups = row !== 'mode' ? [values] : generic
					? [GENERIC_MODES, values.filter(value => !GENERIC_MODES.includes(value)).sort()]
					: MODE_ROWS;
				const disabled = row === 'mode' && (generic ? genericUnavailable : !!this.selection.mode && !MAIN_MODES.includes(this.selection.mode));
				return {
					label: `AC5E.FlagPicker.${generic ? 'Generic' : row}`, disabled,
					buttons: groups.flatMap((group, groupIndex) => group.filter(value => values.includes(value)).map((value, index) => ({
					row, value, label: value || game.i18n.localize('AC5E.FlagPicker.NoAction'),
					breakBefore: groupIndex > 0 && index === 0,
					selected: this.selection[row] === value,
					disabled: disabled || (row === 'mode' && finalModeSelected && value !== selected.mode) || !this.flags.some(flag => flag[row] === value && Object.entries(this.selection).every(([other, choice]) => other === row || flag[other] === choice)),
					}))),
				};
			}),
		};
	}

	async _onRender(context, options) {
		await super._onRender(context, options);
		const input = this.element.querySelector('[data-flag-search]');
		const results = this.element.querySelector('[data-flag-results]');
		let active = -1;
		const update = () => {
			const query = normalizeFlagKey(input.value).toLowerCase();
			results.replaceChildren();
			active = -1;
			input.removeAttribute('aria-activedescendant');
			for (const flag of this.flags.filter(entry => entry.key.toLowerCase().includes(query))) {
				const option = document.createElement('button');
				option.type = 'button';
				option.id = `${this.id}-option-${results.childElementCount}`;
				option.setAttribute('role', 'option');
				option.textContent = flag.key;
				option.addEventListener('click', () => this.select(flag.key));
				results.append(option);
			}
			results.hidden = !results.childElementCount;
			input.setAttribute('aria-expanded', String(!results.hidden));
		};
		input.addEventListener('focus', update);
		input.addEventListener('input', update);
		input.addEventListener('keydown', event => {
			if (event.key === 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				results.hidden = true;
				input.setAttribute('aria-expanded', 'false');
			} else if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
				event.preventDefault();
				if (results.hidden) update();
				const options = [...results.children];
				if (!options.length) return;
				active = active < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
					: (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
				options.forEach((option, index) => option.setAttribute('aria-selected', String(index === active)));
				input.setAttribute('aria-activedescendant', options[active].id);
				options[active].scrollIntoView({ block: 'nearest' });
			} else if (event.key === 'Enter') {
				event.preventDefault();
				if (!results.hidden && active >= 0) results.children[active]?.click();
				else {
					const flag = this.flags.find(entry => entry.key === normalizeFlagKey(input.value));
					if (flag) this.select(flag.key);
				}
			}
		});
		this.element.addEventListener('focusout', event => {
			if (event.relatedTarget === input || results.contains(event.relatedTarget)) return;
			results.hidden = true;
			input.setAttribute('aria-expanded', 'false');
		});
	}

	static choose(_event, target) {
		const { row, value } = target.dataset;
		if (this.selection[row] === value) {
			delete this.selection[row];
			if (row === 'mode' && this.selection.action === '') delete this.selection.action;
			if (row === 'action' && value === '') delete this.selection.mode;
		} else {
			this.selection[row] = value;
			if (row === 'mode') {
				const actions = getModeActions(this.flags, value, this.selection.scope);
				if (actions.size === 1) this.selection.action = actions.values().next().value;
			}
		}
		return this.render({ force: true });
	}

	static continue() {
		const flag = this.flags.find(entry => ['scope', 'action', 'mode'].every(row => entry[row] === (this.selection[row] ?? (row === 'action' ? '' : undefined))));
		if (flag) return this.select(flag.key);
	}

	async select(key) {
		await this.onSelect(key);
		await this.close();
	}
}
