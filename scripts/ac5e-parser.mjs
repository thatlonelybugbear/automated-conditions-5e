import Constants from './ac5e-constants.mjs';
import Settings from './ac5e-settings.mjs';

import { lazySandbox } from './ac5e-main.mjs';

const settings = new Settings();

const BLOCKED = new Set(['__proto__', 'prototype', 'constructor', 'eval', 'Function']);

const MATH_PROXY = new Proxy(Math, {
	has: (t, k) => k in t && !BLOCKED.has(k), // only claim real Math members
	get: (t, k) => (k === Symbol.unscopables || BLOCKED.has(k) ? undefined : t[k]),
	set: () => undefined,
});

function mathSafeEval(code) {
	try {
		// eslint-disable-next-line no-new-func
		const evl = new Function('sandbox', `"use strict"; with (sandbox) { return (${code}); }`);
		const v = evl(MATH_PROXY);
		return Number.isFinite(v) ? v : undefined;
	} catch {
		return undefined;
	}
}

function createProxySandbox(sandbox, mode = 'formula') {
	const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
	return new Proxy(sandbox, {
		get(target, prop) {
			if (BLOCKED.has(prop)) return undefined;
			if (prop in target) return target[prop];
			if (target._flatConstants && prop in target._flatConstants) return target._flatConstants[prop];
			if (prop === 'Math') return Math; // allow Math.*
			if (prop in Math) return Math[prop]; // allow bare max, PI, etc., esp. in conditions
			return mode === 'condition' ? false : undefined;
		},
	});
}
/* -------------------------------------------------------------------- */
/* CONDITION EVALUATION                                                 */
/* -------------------------------------------------------------------- */
export function evaluateCondition(expression, sandbox, debugLog) {
	const proxySandbox = createProxySandbox(sandbox, 'condition');

	try {
		const result = new Function('sandbox', `with (sandbox) { return (${expression}); }`)(proxySandbox);
		if (settings.debug || ac5e.logEvaluationData) console.log('AC5E._ac5eSafeEval [condition OK]', { expression, result });
		return !!result;
	} catch (err) {
		let reason = 'unknown error';
		if (err.name === 'ReferenceError') reason = 'missing variable';
		else if (err.name === 'SyntaxError') reason = 'syntax error';
		else if (err.name === 'TypeError') reason = 'type error';
		else reason = `${err.name}: ${err.message}`;

		debugLog(`AC5E._ac5eSafeEval [condition fail → false]: ${reason}`, { expression });
		return false; // always fail safe
	}
}

/* -------------------------------------------------------------------- */
/* FORMULAS EVALUATION                                                 */
/* -------------------------------------------------------------------- */
/**
 * Prepare a Foundry roll formula string:
 * - strip leading assignment & trailing var noise
 * - reduce parenthesized ternaries (outer→inner, chosen branch only)
 * - resolve @-actor refs
 * - resolve whitelisted function calls (and property/index chains)
 * - pre-evaluate deterministic Math.* constants/calls
 * - inline simple identifiers from sandbox
 * - simplify deterministic sub-terms (dice/flavor intact)
 *
 * @param {string} expression Raw user/formula string
 * @param {object} sandbox Your evaluation sandbox (actors, helpers, constants, etc.)
 * @param {object} debugLog?: (...args)=>void
 * @returns {string}
 */
export function prepareRollFormula(expression, sandbox, debugLog) {
	const proxySandbox = createProxySandbox(sandbox, 'formula');
	// 0) Normalize: strip leading assignment and trailing identifier (common macro typos)
	let resultExpr = normalizeExpr(expression); // could be safe to remove, but being a bugbear... ¯_(ツ)_/¯
	// 1) Reduce only parens that contain a *top-level* ternary; dive only into chosen branch
	resultExpr = reduceTernaryParens(resultExpr, { evaluateCondition, sandbox: proxySandbox, debugLog });
	// 2) Resolve @ actor references (mutate rollingActor.x into @x, via Roll(formula, actorData))
	const actorNames = ['rollingActor', 'opponentActor', 'targetActor', 'auraActor', 'effectOriginActor'];
	resultExpr = resolveActorAtRefs(resultExpr, sandbox, actorNames, Roll, debugLog);
	// 3) Resolve whitelisted helper calls + property chains up-front
	resultExpr = resolveWhitelistedCalls(resultExpr, proxySandbox, debugLog);
	// 4) Pre-evaluate deterministic Math.* (constants & calls with pure-arith args)
	resultExpr = foldBareMath(resultExpr);
	// 5) Inline simple identifiers from sandbox (keep dice/@/actor refs intact)
	resultExpr = inlineSimpleIdentifiers(resultExpr, sandbox, proxySandbox, actorNames, debugLog);
	// 6) Strip remnant quotes around numeric literals (backwards compatibility)
	resultExpr = coerceQuotedNumbersAndFlavors(resultExpr);
	// 7) Fold deterministic sub-terms using your simplify (dice & flavors preserved)
	const finalExpr = simplifyFormula(resultExpr, /* removeFlavor */ false);
	return finalExpr;
}

/* NORMALIZE */
function normalizeExpr(expr) {
	expr = String(expr ?? '').trim();
	// strip leading assignment:  name = <expr>
	expr = expr.replace(/^[A-Za-z_]\w*\s*=\s*/, ''); //@to-do: probably not needed
	// strip trailing accidental identifier: "<expr>  bonus"
	expr = expr.replace(/\s+[A-Za-z_]\w*\s*$/, ''); //@to-do: probably not needed
	return expr;
}

/* TERNARY REDUCER */
function reduceTernaryParens(expr, { evaluateCondition, sandbox, debugLog } = {}) {
	if (!(expr.includes('?') && expr.includes(':'))) return expr;

	let i = 0;
	while (i < expr.length) {
		if (expr[i] !== '(') {
			i++;
			continue;
		}

		const close = findMatchingParen(expr, i);
		if (close < 0) {
			debugLog("Unbalanced '(' at " + i);
			return expr;
		}

		const inner = expr.slice(i + 1, close);

		// quick local gate for ternary existence; I think it's a good approximation... hopefully!
		if (!(inner.includes('?') && inner.includes(':'))) {
			i = close + 1;
			continue;
		}

		const qIndex = findTopLevelQuery(inner);
		if (qIndex === -1) {
			i = close + 1;
			continue;
		}

		const colonIndex = findMatchingColon(inner, qIndex);
		if (colonIndex === -1) {
			i = close + 1;
			continue;
		}

		const cond = inner.slice(0, qIndex).trim();
		const trueRaw = inner.slice(qIndex + 1, colonIndex).trim();
		const falseRaw = inner.slice(colonIndex + 1).trim();

		let condResult = false;
		try {
			condResult = !!evaluateCondition(cond, sandbox, debugLog);
		} catch (e) {
			debugLog(`Condition eval failed: ${cond}`, e?.message);
		}

		const chosen = condResult ? trueRaw : falseRaw;
		const reducedChosen = reduceTernaryParens(chosen, { evaluateCondition, sandbox, debugLog });

		expr = expr.slice(0, i) + reducedChosen + expr.slice(close + 1);
		i += String(reducedChosen).length;
	}
	return expr;
}

// Bracket/brace/quote scan
function findMatchingParen(str, pos) {
	let p = 0,
		b = 0,
		c = 0,
		inStr = false,
		q = null,
		esc = false;
	for (let i = pos; i < str.length; i++) {
		const ch = str[i];
		if (inStr) {
			if (esc) esc = false;
			else if (ch === '\\') esc = true;
			else if (ch === q) {
				inStr = false;
				q = null;
			}
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			inStr = true;
			q = ch;
			continue;
		}
		if (ch === '(') p++;
		else if (ch === ')') {
			p--;
			if (p === 0) return i;
		} else if (ch === '[') b++;
		else if (ch === ']') b = Math.max(0, b - 1);
		else if (ch === '{') c++;
		else if (ch === '}') c = Math.max(0, c - 1);
	}
	return -1;
}

function findTopLevelQuery(str) {
	let p = 0,
		b = 0,
		c = 0,
		inStr = false,
		q = null,
		esc = false;
	for (let i = 0; i < str.length; i++) {
		const ch = str[i];
		if (inStr) {
			if (esc) esc = false;
			else if (ch === '\\') esc = true;
			else if (ch === q) {
				inStr = false;
				q = null;
			}
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			inStr = true;
			q = ch;
			continue;
		}
		if (ch === '(') p++;
		else if (ch === ')') p = Math.max(0, p - 1);
		else if (ch === '[') b++;
		else if (ch === ']') b = Math.max(0, b - 1);
		else if (ch === '{') c++;
		else if (ch === '}') c = Math.max(0, c - 1);
		else if (ch === '?' && p === 0 && b === 0 && c === 0) return i;
	}
	return -1;
}

function findMatchingColon(str, qIndex) {
	let p = 0,
		b = 0,
		c = 0,
		inStr = false,
		q = null,
		esc = false,
		want = 1;
	for (let i = qIndex + 1; i < str.length; i++) {
		const ch = str[i];
		if (inStr) {
			if (esc) esc = false;
			else if (ch === '\\') esc = true;
			else if (ch === q) {
				inStr = false;
				q = null;
			}
			continue;
		}
		if (ch === "'" || ch === '"' || ch === '`') {
			inStr = true;
			q = ch;
			continue;
		}
		if (ch === '(') {
			p++;
			continue;
		}
		if (ch === ')') {
			p = Math.max(0, p - 1);
			continue;
		}
		if (ch === '[') {
			b++;
			continue;
		}
		if (ch === ']') {
			b = Math.max(0, b - 1);
			continue;
		}
		if (ch === '{') {
			c++;
			continue;
		}
		if (ch === '}') {
			c = Math.max(0, c - 1);
			continue;
		}

		if (p === 0 && b === 0 && c === 0) {
			if (ch === '?') want++;
			else if (ch === ':') {
				want--;
				if (want === 0) return i;
			}
		}
	}
	return -1;
}

/* @ ACTOR REFERENCES */
function resolveActorAtRefs(expr, sandbox, actorNames, Roll, debugLog) {
	let out = expr;
	for (const actorName of actorNames) {
		const actor = sandbox[actorName];
		if (!actor) continue;
		const refRegex = new RegExp(`\\b${actorName}\\.[\\w.-]+`, 'g');
		for (const m of [...out.matchAll(refRegex)]) {
			const ref = m[0];
			try {
				const atExpr = ref.replace(new RegExp(`^${actorName}\\.`), '@');
				const roll = new Roll(atExpr, actor);
				const formula = roll.formula ?? atExpr;
				out = out.replace(ref, formula);
			} catch (e) {
				debugLog(`@ref parse failed for ${ref}`, e.message);
			}
		}
	}
	return out;
}

/* WHITELISTED CALLS (in lazySandbox) */
function resolveWhitelistedCalls(expr, proxySandbox, debugLog) {
	let i = 0,
		out = '';
	while (i < expr.length) {
		if (/[A-Za-z_]/.test(expr[i])) {
			let j = i;
			while (j < expr.length && /[A-Za-z0-9_$]/.test(expr[j])) j++;
			const ident = expr.slice(i, j);

			if (lazySandbox[ident] && expr[j] === '(') {
				// balanced (...) with nested quotes/parens
				let k = j,
					depth = 0,
					inStr = false,
					q = null,
					esc = false;
				while (k < expr.length) {
					const ch = expr[k];
					if (inStr) {
						if (esc) esc = false;
						else if (ch === '\\') esc = true;
						else if (ch === q) {
							inStr = false;
							q = null;
						}
					} else {
						if (ch === "'" || ch === '"' || ch === '`') {
							inStr = true;
							q = ch;
						} else if (ch === '(') depth++;
						else if (ch === ')') {
							depth--;
							if (depth === 0) {
								k++;
								break;
							}
						}
					}
					k++;
				}
				const callPart = expr.slice(i, k);

				// trailing property/index chains: .a['b'][0].c
				let m = k;
				for (;;) {
					const rest = expr.slice(m);
					const dot = rest.match(/^\s*\.\s*[A-Za-z_$][\w$]*/);
					const idx = rest.match(/^\s*\[\s*(?:'(?:\\'|[^'])*'|"(?:\\"|[^"])*"|[^\]]+)\s*\]/);
					if (dot) m += dot[0].length;
					else if (idx) m += idx[0].length;
					else break;
				}
				const snippet = expr.slice(i, m);

				try {
					const val = new Function('sandbox', `with (sandbox) { return (${snippet}); }`)(proxySandbox);
					let replacement;
					if (val && typeof val === 'object' && typeof val.formula === 'string') replacement = val.formula;
					else if (val && typeof val === 'object' && val.value != null) replacement = String(val.value);
					else if (typeof val === 'number' || typeof val === 'string') replacement = String(val);
					if (replacement != null) {
						out += replacement;
						i = m;
						continue;
					}
				} catch (e) {
					debugLog(`whitelisted call failed: ${snippet}`, e.message);
				}
			}
		}
		out += expr[i++];
	}
	return out;
}

/* PREFOLD MATH */
function foldBareMath(expr) {
	if (!expr || typeof expr !== 'string') return expr;

	expr = expr.replace(/\bMath\./g, ''); // Strip the namespace

	const CONST_NAMES = Object.getOwnPropertyNames(Math).filter((k) => typeof Math[k] !== 'function'); // For PI, E, ...
	if (CONST_NAMES.length) {
		const constRe = new RegExp(`\\b(${CONST_NAMES.join('|')})\\b(?!\\s*\\()`, 'g');
		expr = expr.replace(constRe, (_, c) => String(Math[c]));
	}

	// Only reduce fn(...) when args are pure arithmetic (no dice/@/idents except e/E)
	const FN_NAMES = Object.getOwnPropertyNames(Math).filter((k) => typeof Math[k] === 'function');
	if (FN_NAMES.length) {
		const bareFnRe = new RegExp(`\\b(${FN_NAMES.join('|')})\\s*\\(`, 'g');
		const argsAreSafe = (s) => {
			if (/\d+d\d+/i.test(s)) return false;
			if (/@/.test(s)) return false;
			if (/[A-Za-df-hj-z_]/i.test(s)) return false; // allow only e/E
			const safe = s.replace(/\*\*/g, '^');
			return /^[\s0-9eE+*\-/%.,()^]*$/.test(safe);
		};

		outer: for (;;) {
			bareFnRe.lastIndex = 0;
			let changed = false,
				m;
			while ((m = bareFnRe.exec(expr)) !== null) {
				const start = m.index;
				const head = m[0]; // e.g., "max("
				let i = start + head.length - 1; // at '('

				// find matching ')'
				let depth = 0,
					inStr = false,
					q = null,
					esc = false;
				for (; i < expr.length; i++) {
					const ch = expr[i];
					if (inStr) {
						if (esc) esc = false;
						else if (ch === '\\') esc = true;
						else if (ch === q) {
							inStr = false;
							q = null;
						}
						continue;
					}
					if (ch === "'" || ch === '"' || ch === '`') {
						inStr = true;
						q = ch;
						continue;
					}
					if (ch === '(') depth++;
					else if (ch === ')') {
						depth--;
						if (depth === 0) {
							i++;
							break;
						}
					}
				}
				if (depth !== 0) continue;

				const callText = expr.slice(start, i); // e.g., "max(5, 2)"
				const argsText = callText.replace(/^[^(]*\(/, '').slice(0, -1);
				if (!argsAreSafe(argsText)) continue;

				const value = mathSafeEval(callText);
				if (typeof value !== 'number') continue;

				expr = expr.slice(0, start) + String(value) + expr.slice(i);
				changed = true;
				continue outer;
			}
			if (!changed) break;
		}
	}

	return expr;
}

/* INLINING */
function inlineSimpleIdentifiers(expr, sandbox, proxySandbox, actorNames, debugLog) {
	const tokenRegex = /\b[a-zA-Z_][\w.\[\]']*\b/g;
	return expr.replace(tokenRegex, (match) => {
		if (/^\d*d\d+$/i.test(match)) return match; // dice literal like 3d8
		if (match.startsWith('@')) return match; // Foundry @ref
		if (actorNames.some((n) => match.startsWith(n + '.'))) return match; // actor chain
		if (match in sandbox) return match; // explicilty provided symbol
		try {
			const val = new Function('sandbox', `with (sandbox) { return ${match} }`)(proxySandbox);
			if (val && typeof val === 'object' && typeof val.formula === 'string') return val.formula;
			if (val && typeof val === 'object' && val.value != null) return val.value;
			if (typeof val === 'string' || typeof val === 'number') return String(val);
		} catch {
			/* leave unresolved */
		}
		return match;
	});
}

// Function from @kgar's Tidy 5e Sheet. Thanks :)
function simplifyFormula(formula = '', removeFlavor = false) {
	try {
		if (removeFlavor) {
			formula = formula?.replace(foundry.dice.terms.RollTerm.FLAVOR_REGEXP, '')?.replace(foundry.dice.terms.RollTerm.FLAVOR_REGEXP_STRING, '')?.trim();
		}

		if (formula?.trim() === '') {
			return '';
		}

		const roll = Roll.create(formula);
		formula = roll.formula;
		const simplifiedTerms = roll.terms.map((t, index) => {
			if (t.isIntermediate && t.isDeterministic) {
				const inter = new foundry.dice.terms.NumericTerm({
					number: t.evaluate({ allowInteractive: false }).total,
					options: t.options,
				});
				formula = formula.replace(t.formula, inter.number);
			} else if (t.number === 0) {
				const operator = roll.terms[index - 1].operator;
				formula = formula.replace(`${operator} ${t.formula}`, '');
			}
		});
		let simplifiedFormula = new Roll(formula).formula;
		return simplifiedFormula;
	} catch (e) {
		console.error('Unable to simplify formula due to an error.', false, e);
		return formula;
	}
}

// Unquote numeric string literals, optionally followed by one or more [flavor] tags.
// Matches '1', "-2", "3.14e2", '2[fire]', "+5[acid][cold]", etc.
function coerceQuotedNumbersAndFlavors(expr) {
	if (!expr || typeof expr !== 'string') return expr;

	// 1) numbers with optional flavors: '  +1.5e-2  [fire][cold]  '
	expr = expr.replace(/(['"])\s*([+\-]?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?)\s*((?:\[[^\]]*\])*)\s*\1/g, (_, __, num, flavors) => `${num}${flavors ?? ''}`);

	// 2) (optional) empty quotes with 0
	// expr = expr.replace(/(['"])\s*\1/g, "0");

	return expr;
}
