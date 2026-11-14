/** Metadata only: contextual entries never register variables or execute caller code. */
const RESERVED_PATH_PARTS = new Set(['__proto__', 'prototype', 'constructor', 'eval', 'Function', 'window', 'globalThis', 'document', 'self', 'this', 'game', 'canvas']);

export function normalizeConditionContext(context = {}) {
	const entries = context.entries ?? [];
	if (!Array.isArray(entries)) throw new TypeError('context.entries must be an array.');
	const normalized = new Map();
	for (const entry of entries) {
		const identifier = typeof entry === 'string' ? entry : entry?.identifier;
		if (typeof identifier !== 'string' || !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(identifier)
			|| identifier.split('.').some((part) => RESERVED_PATH_PARTS.has(part))) {
			throw new TypeError('Context identifiers must be data paths without reserved members.');
		}
		const hint = typeof entry?.hint === 'string' ? entry.hint : '';
		normalized.set(identifier, { identifier, label: hint ? `${identifier} - ${hint}` : identifier, hint, source: 'Caller context' });
	}
	return [...normalized.values()];
}

/** The same identifier restriction used by ac5e.safeEval; quoted names remain allowed. */
export function conditionExpressionRestriction(expression) {
	const code = expression.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\$]|\$(?!\{))*\x60|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g, ' ');
	const identifiers = code.match(/[\p{ID_Start}$_][\p{ID_Continue}$\u200c\u200d]*/gu) ?? [];
	return identifiers.some((identifier) => identifier === 'game' || identifier === 'canvas')
		? 'Roll.safeEval expression cannot access game/canvas identifiers; use sandbox fields instead.' : null;
}

/** Compile with the same wrapper as condition evaluation, without invoking it. */
export function validateCondition({ expression = '', context = {} } = {}) {
	normalizeConditionContext(context);
	if (typeof expression !== 'string') return { valid: false, diagnostics: [{ severity: 'error', code: 'invalid-type', message: 'Condition must be a string.' }] };
	const restriction = conditionExpressionRestriction(expression);
	if (restriction) return { valid: false, diagnostics: [{ severity: 'error', code: 'restricted-identifier', message: restriction }] };
	// Empty conditions mean unconditional eligibility; callers need not build evaluationData.
	if (!expression.trim()) return { valid: true, diagnostics: [] };
	try {
		// eslint-disable-next-line no-new-func
		new Function('sandbox', `with (sandbox) { return (${expression}); }`);
		return { valid: true, diagnostics: [] };
	} catch (error) {
		if (!(error instanceof SyntaxError)) throw error;
		return { valid: false, diagnostics: [{ severity: 'error', code: 'syntax-error', message: error.message }] };
	}
}
