import { _getTokenFromActor } from '../ac5e-helpers.mjs';

const defaultButtonFocusTimers = new WeakMap();

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

export function enforceDefaultButtonFocus(root, button, { attempts = 10, delay = 60 } = {}) {
	if (!root || !button) return;
	const previousTimer = defaultButtonFocusTimers.get(root);
	if (previousTimer) clearTimeout(previousTimer);
	const doc = root.ownerDocument ?? document;
	let remaining = Math.max(1, Number(attempts) || 1);
	const tick = () => {
		if (!root?.isConnected || !button?.isConnected) {
			defaultButtonFocusTimers.delete(root);
			return;
		}
		if (doc?.activeElement !== button) {
			try {
				button.focus({ preventScroll: true });
			} catch (_err) {
				// ignore focus errors from detached/disabled elements
			}
		}
		remaining -= 1;
		if (remaining <= 0) {
			defaultButtonFocusTimers.delete(root);
			return;
		}
		const timer = setTimeout(tick, Math.max(0, Number(delay) || 0));
		defaultButtonFocusTimers.set(root, timer);
	};
	tick();
}
