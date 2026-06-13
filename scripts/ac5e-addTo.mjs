const AC5E_ADD_TO_PARTS = new Set(['all', 'base', 'bonus', 'global']);

function _normalizeAddToModeToken(value) {
	if (typeof value !== 'string') return null;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return null;
	return AC5E_ADD_TO_PARTS.has(normalized) ? normalized : null;
}

function _normalizeAddToTypes(values = []) {
	return [...new Set(values.filter((value) => typeof value === 'string').map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function _normalizeAddToParts(parts, fallback = null) {
	return _normalizeAddToModeToken(parts) ?? _normalizeAddToModeToken(fallback) ?? null;
}

function _buildResolvedAddToSpec({ parts = null, includeTypes = [], excludeTypes = [], explicitParts = false, explicitIncludeClause = false, explicitExcludeClause = false } = {}, fallbackParts = null) {
	const normalizedIncludeTypes = _normalizeAddToTypes(includeTypes);
	const normalizedExcludeTypes = _normalizeAddToTypes(excludeTypes);
	const normalizedParts = _normalizeAddToParts(parts, normalizedIncludeTypes.length || normalizedExcludeTypes.length ? 'all' : fallbackParts);
	if (!normalizedParts && !normalizedIncludeTypes.length && !normalizedExcludeTypes.length && !explicitIncludeClause && !explicitExcludeClause) return undefined;
	return {
		parts: normalizedParts ?? 'all',
		includeTypes: normalizedIncludeTypes,
		excludeTypes: normalizedExcludeTypes,
		explicitParts: !!explicitParts,
		explicitIncludeClause: !!explicitIncludeClause,
		explicitExcludeClause: !!explicitExcludeClause,
	};
}

function _parseAddToTypeClause(value) {
	if (typeof value !== 'string') return [];
	const inner = value.trim();
	if (!inner) return [];
	return _normalizeAddToTypes(inner.split(','));
}

export function _parseAddToSpec(value) {
	if (value == null) return undefined;
	if (typeof value === 'object' && !Array.isArray(value)) {
		const rawMode = typeof value.mode === 'string' ? value.mode.trim().toLowerCase() : '';
		const includeTypes = Array.isArray(value.includeTypes) ? value.includeTypes : [];
		const excludeTypes = Array.isArray(value.excludeTypes) ? value.excludeTypes : [];
		if ('parts' in value || includeTypes.length || excludeTypes.length) {
			return _buildResolvedAddToSpec({
				parts: value.parts,
				includeTypes,
				excludeTypes,
				explicitParts: 'parts' in value,
				explicitIncludeClause: !!value.explicitIncludeClause || !!value.hasIncludeClause,
				explicitExcludeClause: !!value.explicitExcludeClause || !!value.hasExcludeClause,
			});
		}
		if (rawMode === 'types' || rawMode === 'include' || rawMode === 'includetypes') {
			return _buildResolvedAddToSpec({ parts: 'all', includeTypes: value.types, explicitParts: false });
		}
		if (rawMode === 'nottypes' || rawMode === 'exclude' || rawMode === 'excludetypes' || rawMode === 'not' || value.exclude === true) {
			return _buildResolvedAddToSpec({ parts: 'all', excludeTypes: value.types, explicitParts: false });
		}
		const mode = _normalizeAddToModeToken(value.mode);
		if (mode) return _buildResolvedAddToSpec({ parts: mode, explicitParts: true });
		if (Array.isArray(value.types) && value.types.length) return _buildResolvedAddToSpec({ parts: 'all', includeTypes: value.types, explicitParts: false });
		return undefined;
	}
	const raw = Array.isArray(value) ? value.filter((entry) => typeof entry === 'string').join(',') : typeof value === 'string' ? value.trim() : '';
	if (!raw) return undefined;
	if (/!?types\s*\(/i.test(raw)) {
		const clauses = [];
		let current = '';
		let depth = 0;
		for (const char of raw) {
			if (char === '(') {
				depth++;
				current += char;
				continue;
			}
			if (char === ')') {
				depth = Math.max(0, depth - 1);
				current += char;
				continue;
			}
			if (char === ',' && depth === 0) {
				const clause = current.trim();
				if (clause) clauses.push(clause);
				current = '';
				continue;
			}
			current += char;
		}
		const trailingClause = current.trim();
		if (trailingClause) clauses.push(trailingClause);
		if (!clauses.length) return undefined;
		let parts = null;
		let explicitParts = false;
		const includeTypes = [];
		const excludeTypes = [];
		let explicitIncludeClause = false;
		let explicitExcludeClause = false;
		for (const clause of clauses) {
			const part = _normalizeAddToModeToken(clause);
			if (part) {
				if (parts && parts !== part) return undefined;
				parts = part;
				explicitParts = true;
				continue;
			}
			const includeMatch = clause.match(/^types\s*\((.*)\)$/i);
			if (includeMatch) {
				explicitIncludeClause = true;
				includeTypes.push(..._parseAddToTypeClause(includeMatch[1]));
				continue;
			}
			const excludeMatch = clause.match(/^!types\s*\((.*)\)$/i);
			if (excludeMatch) {
				explicitExcludeClause = true;
				excludeTypes.push(..._parseAddToTypeClause(excludeMatch[1]).map((entry) => entry.replace(/^!+/, '')));
				continue;
			}
			return undefined;
		}
		return _buildResolvedAddToSpec({ parts, includeTypes, excludeTypes, explicitParts, explicitIncludeClause, explicitExcludeClause });
	}
	const rawValues = raw.split(/[,|]/).map((entry) => entry.trim()).filter(Boolean);
	if (!rawValues.length) return undefined;
	if (rawValues.length === 1) {
		const part = _normalizeAddToModeToken(rawValues[0]);
		if (part) return _buildResolvedAddToSpec({ parts: part, explicitParts: true });
	}
	if (rawValues.some((entry) => entry.startsWith('!'))) return undefined;
	if (rawValues.some((entry) => _normalizeAddToModeToken(entry))) return undefined;
	return _buildResolvedAddToSpec({ parts: 'all', includeTypes: rawValues, explicitParts: false });
}

export function _resolveAddToSpec(value, defaultMode = 'base') {
	const parsed = _parseAddToSpec(value);
	if (parsed) return parsed;
	return _buildResolvedAddToSpec({ parts: defaultMode, explicitParts: true }, 'base');
}

export function _stringifyAddToSpec(value) {
	const parsed = _parseAddToSpec(value);
	if (!parsed) return '';
	const clauses = [];
	const hasTypeFilters = parsed.includeTypes.length || parsed.excludeTypes.length;
	if (parsed.parts && (parsed.parts !== 'all' || parsed.explicitParts || !hasTypeFilters)) clauses.push(parsed.parts);
	if (parsed.includeTypes.length || parsed.explicitIncludeClause) clauses.push(`types(${parsed.includeTypes.join(',')})`);
	if (parsed.excludeTypes.length || parsed.explicitExcludeClause) clauses.push(`!types(${parsed.excludeTypes.join(',')})`);
	return clauses.join(',');
}

export function _addToAllowsRollType(addTo, rollType) {
	if (addTo?.explicitIncludeClause && !addTo?.includeTypes?.length) return false;
	if (!addTo?.includeTypes?.length && !addTo?.excludeTypes?.length) return true;
	if (typeof rollType !== 'string' || !rollType) return false;
	const normalizedType = rollType.toLowerCase();
	if (addTo.includeTypes.length && !addTo.includeTypes.includes(normalizedType)) return false;
	if (addTo.excludeTypes.length && addTo.excludeTypes.includes(normalizedType)) return false;
	return true;
}

export function _addToAllowsAnySelectedType(addTo, selectedTypes) {
	if (!addTo?.includeTypes?.length && !addTo?.excludeTypes?.length) return true;
	if (!selectedTypes?.size) return false;
	for (const type of selectedTypes) {
		if (_addToAllowsRollType(addTo, type)) return true;
	}
	return false;
}

export function _shouldApplyAddToRoll(addTo, rollIndex, rollType, defaultMode = 'base') {
	const parts = addTo?.parts ?? defaultMode;
	if (parts === 'all') return _addToAllowsRollType(addTo, rollType);
	if (parts === 'bonus') return rollIndex > 0 && _addToAllowsRollType(addTo, rollType);
	if (parts === 'global') return _addToAllowsRollType(addTo, rollType);
	return rollIndex === 0 && _addToAllowsRollType(addTo, rollType);
}
