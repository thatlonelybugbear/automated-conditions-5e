import { _getTokenFromActor } from '../ac5e-helpers.mjs';

const defaultButtonFocusRequests = new WeakMap();
const buttonStyleValues = new WeakMap();

export function getExistingRoll(config, index = 0) {
	if (!Array.isArray(config?.rolls)) return undefined;
	const roll = config.rolls[index];
	return roll && typeof roll === 'object' ? roll : undefined;
}

export function getExistingRollOptions(config, index = 0) {
	const roll = getExistingRoll(config, index);
	const options = roll?.options;
	return options && typeof options === 'object' ? options : undefined;
}

export function getSubjectTokenId(source) {
	return source?.speaker?.token ?? source?.data?.speaker?.token ?? source?.document?.speaker?.token ?? source?.config?.speaker?.token;
}

export function getSubjectTokenIdFromConfig(config) {
	const tokenId = getSubjectTokenId(config);
	if (tokenId) return tokenId;
	const actor = config?.subject;
	return actor ? (_getTokenFromActor(actor)?.id ?? actor.getActiveTokens?.()?.[0]?.id) : undefined;
}

export function applyDefaultButtonStyles(buttons, target, { settings = {}, tooltip = '', highlight = true, clearTooltips = false } = {}) {
	for (const button of buttons) {
		const selected = button === target;
		if (target && button.hasAttribute('autofocus') !== selected) button.toggleAttribute('autofocus', selected);
		const highlighted = selected && highlight;
		if (button.classList.contains('ac5e-button') !== highlighted) button.classList.toggle('ac5e-button', highlighted);
		const colored = highlighted && settings.buttonColorEnabled;
		const desired = {
			backgroundColor: colored ? settings.buttonColorBackground || '' : '',
			border: colored && settings.buttonColorBorder ? `1px solid ${settings.buttonColorBorder}` : '',
			color: colored ? settings.buttonColorText || '' : '',
		};
		const previous = buttonStyleValues.get(button) ?? {};
		for (const [property, value] of Object.entries(desired)) {
			const cached = previous[property];
			if (button.style[property] !== value && !(cached?.value === value && cached.applied === button.style[property])) button.style[property] = value;
			previous[property] = { value, applied: button.style[property] };
		}
		buttonStyleValues.set(button, previous);
		if (selected && tooltip) {
			if (button.getAttribute('data-tooltip') !== tooltip) button.setAttribute('data-tooltip', tooltip);
		} else if (clearTooltips && button.hasAttribute('data-tooltip')) button.removeAttribute('data-tooltip');
	}
}

export function enforceDefaultButtonFocus(root, button, { attempts = 10, delay = 60 } = {}) {
	if (!root?.isConnected || !button?.isConnected) return;
	let request = defaultButtonFocusRequests.get(root);
	if (request?.interacted || (request?.button === button && request.timer !== null)) return;
	if (request?.timer !== undefined && request.timer !== null) clearTimeout(request.timer);
	const doc = root.ownerDocument ?? document;
	if (!request) {
		request = { timer: null, interacted: false };
		defaultButtonFocusRequests.set(root, request);
		const stopForInteraction = () => {
			request.interacted = true;
			if (request.timer !== null) clearTimeout(request.timer);
			request.timer = null;
		};
		root.addEventListener('pointerdown', stopForInteraction, { capture: true });
		root.addEventListener('keydown', stopForInteraction, { capture: true });
	}
	request.button = button;
	request.focused = false;
	const initialActive = doc?.activeElement;
	let remaining = Math.max(1, Number(attempts) || 1);
	const tick = () => {
		request.timer = null;
		if (request.interacted || !root.isConnected || !button.isConnected) return;
		if (doc?.activeElement !== initialActive && doc?.activeElement !== button && !root.contains(doc?.activeElement)) return;
		if (doc?.activeElement !== button) {
			try {
				button.focus({ preventScroll: true });
			} catch (_err) {
				// Keep the bounded guard active if focus could not be applied.
			}
		}
		request.focused = doc?.activeElement === button;
		remaining -= 1;
		if (remaining > 0) request.timer = setTimeout(tick, Math.max(0, Number(delay) || 0));
	};
	// Finish style writes before focus; guard against competing native/module autofocus.
	request.timer = setTimeout(tick, 0);
}
