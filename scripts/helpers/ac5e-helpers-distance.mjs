import Constants from '../ac5e-constants.mjs';
import { _safeFromUuidSync } from '../ac5e-helpers.mjs';
import Settings from '../ac5e-settings.mjs';

const settings = new Settings();
const DISTANCE_PERIMETER_CACHE_LIMIT = 500;
const distancePerimeterCache = new Map();

export function getPerimeterDistanceCore(tokenA, tokenB, includeUnits = false, checkCollision = false, includeHeight = true) {
	let totalDistance = Infinity;
	const meleeDiagonals = settings.autoRangeChecks.has('meleeDiagonals');
	let adjacent2D;

	const tokenInstance = foundry.canvas.placeables.Token;
	tokenA = resolveDistanceToken(tokenA);
	tokenB = resolveDistanceToken(tokenB);
	if (!(tokenA instanceof tokenInstance) || !(tokenB instanceof tokenInstance)) return totalDistance;

	const { grid } = canvas || {};
	if (foundry.utils.isEmpty(grid)) return totalDistance;
	const { distance: gridDistance, units, isGridless, isHexagonal, isSquare } = grid;

	let diagonals;
	let spaces;

	if (isHexagonal) {
		const tokenAHexes = getHexesOnPerimeter(tokenA);
		if (settings.debug) tokenAHexes.forEach((e) => canvas.ping(e));
		const tokenBHexes = getHexesOnPerimeter(tokenB);
		if (settings.debug) tokenBHexes.forEach((e) => canvas.ping(e));

		outer: for (const pointA of tokenAHexes) {
			for (const pointB of tokenBHexes) {
				if (_testDistanceCollision(pointA, pointB, tokenB.document, checkCollision)) continue;
				adjacent2D = testDistanceAdjacency(pointA, pointB, { meleeDiagonals });
				if (adjacent2D && meleeDiagonals) {
					totalDistance = gridDistance;
					diagonals = 0;
					spaces = 1;
					break outer;
				}
				const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
				if (distance2D < totalDistance) {
					totalDistance = distance2D;
					diagonals = pathDiagonals;
					spaces = pathSpaces;
				}
			}
		}
	} else {
		const areTokensIntersencting = tokenA.bounds.intersects(tokenB.bounds);
		if (areTokensIntersencting) {
			totalDistance = 0;
			diagonals = 0;
			spaces = 0;
		} else if (isGridless) {
			const tokenASquares = getGridlessSquaresOnPerimeter(tokenA);
			if (settings.debug) tokenASquares.forEach((s) => canvas.ping(s));
			const tokenBSquares = getGridlessSquaresOnPerimeter(tokenB);
			if (settings.debug) tokenBSquares.forEach((s) => canvas.ping(s));
			for (const pointA of tokenASquares) {
				for (const pointB of tokenBSquares) {
					if (_testDistanceCollision(pointA, pointB, tokenB.document, checkCollision)) continue;
					const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
					if (distance2D < totalDistance) {
						const leeway = settings.autoRangeChecks.has('meleeOoR') ? gridDistance * 2 : false;
						totalDistance = leeway && distance2D <= leeway ? gridDistance : distance2D;
						diagonals = pathDiagonals;
						spaces = pathSpaces;
					}
				}
			}
		} else if (isSquare) {
			const tokenASquares = getSquaresOnPerimeter(tokenA);
			if (settings.debug) tokenASquares.forEach((s) => canvas.ping(s));
			const tokenBSquares = getSquaresOnPerimeter(tokenB);
			if (settings.debug) tokenBSquares.forEach((s) => canvas.ping(s));

			outer: for (const pointA of tokenASquares) {
				for (const pointB of tokenBSquares) {
					if (_testDistanceCollision(pointA, pointB, tokenB.document, checkCollision)) continue;
					adjacent2D = testDistanceAdjacency(pointA, pointB, { meleeDiagonals });
					if (adjacent2D && meleeDiagonals) {
						totalDistance = gridDistance;
						diagonals = 0;
						spaces = 1;
						break outer;
					}
					const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
					if (distance2D < totalDistance) {
						totalDistance = distance2D;
						diagonals = pathDiagonals;
						spaces = pathSpaces;
					}
				}
			}
		}
	}

	if (includeHeight) totalDistance = heightDifference(tokenA, tokenB, totalDistance, diagonals, spaces, grid, adjacent2D);
	if (settings.debug) console.log(`${Constants.MODULE_NAME_SHORT} - getDistance():`, { sourceId: tokenA.id, opponentId: tokenB.id, result: totalDistance, units });
	if (includeUnits) return roundDistance(totalDistance) + units;
	return roundDistance(totalDistance);
}

export function getCachedDistanceCore(tokenA, tokenB, includeUnits = false, checkCollision = false, includeHeight = true) {
	const result = getCachedPerimeterDistanceData(tokenA, tokenB, { checkCollision, includeHeight });
	if (!result) return Infinity;
	if (includeUnits) return `${result.distance}${canvas?.grid?.units ?? ''}`;
	return result.distance;
}

export async function debugBenchmarkPerimeterGridSpaceCenters(token, { iterations = 100, data = {}, useFoundryBenchmark = false } = {}) {
	const perimeterFn = () => uniqueCenters(getPerimeterCenters(token));
	const occupiedFn = () => uniqueCenters(getOccupiedPerimeterCenters(token, data));
	const perimeter = benchmarkFunction(perimeterFn, iterations);
	const occupied = benchmarkFunction(occupiedFn, iterations);
	if (useFoundryBenchmark && foundry?.utils?.benchmark) {
		await foundry.utils.benchmark(perimeterFn, iterations);
		await foundry.utils.benchmark(occupiedFn, iterations);
	}
	const comparison = compareCenterSets(perimeter.lastResult ?? [], occupied.lastResult ?? []);
	return {
		tokenId: token?.id ?? null,
		iterations,
		perimeter,
		occupied,
		comparison: {
			onlyPerimeterCount: comparison.onlyLeft.length,
			onlyOccupiedCount: comparison.onlyRight.length,
			onlyPerimeter: comparison.onlyLeft,
			onlyOccupied: comparison.onlyRight,
		},
	};
}

function _testDistanceCollision(pointA, pointB, source, checkCollision) {
	if (!checkCollision) return false;
	const backend = CONFIG.Canvas?.polygonBackends?.[checkCollision];
	if (!backend?.testCollision) return false;
	return backend.testCollision(pointB, pointA, {
		source,
		mode: 'any',
		type: checkCollision,
	});
}

function resolveDistanceToken(token) {
	const tokenInstance = foundry.canvas.placeables.Token;
	if (typeof token === 'string') {
		if (token.includes('.')) token = _safeFromUuidSync(token)?.object;
		else token = canvas.tokens.get(token);
	}
	if (token instanceof TokenDocument) token = token.object;
	if (token instanceof Actor) token = token.getActiveTokens()[0] ?? null;
	return token instanceof tokenInstance ? token : null;
}

function centerKey(point) {
	return `${point.x}_${point.y}`;
}

function uniqueCenters(points = []) {
	const deduped = {};
	for (const point of points) {
		if (!point) continue;
		deduped[centerKey(point)] = point;
	}
	return Object.values(deduped);
}

function offsetKey(offset) {
	return `${offset.i}_${offset.j}`;
}

function getOccupiedOffsets2D(token, data = {}) {
	if (!token?.document || canvas.grid.isGridless) return [];
	const offsets = token.document.getOccupiedGridSpaceOffsets(data);
	const deduped = {};
	for (const { i, j } of offsets) {
		const key = `${i}_${j}`;
		if (!deduped[key]) deduped[key] = { i, j };
	}
	return Object.values(deduped);
}

function getCentersFromOffsets(offsets = []) {
	return uniqueCenters(offsets.map((offset) => canvas.grid.getCenterPoint(offset)));
}

function getPerimeterOffsetsFromOccupiedOffsets(offsets = []) {
	if (!offsets.length || canvas.grid.isGridless) return [];
	const occupied = new Map(offsets.map((offset) => [offsetKey(offset), offset]));
	const perimeter = [];
	for (const offset of offsets) {
		const adjacentOffsets = canvas.grid.getAdjacentOffsets(offset);
		const isPerimeter = adjacentOffsets.some((adjacent) => !occupied.has(offsetKey(adjacent)));
		if (isPerimeter) perimeter.push(offset);
	}
	return perimeter;
}

function testDistanceAdjacency(coords1, coords2, { meleeDiagonals = false } = {}) {
	const { grid } = canvas ?? {};
	if (!grid) return false;
	if (grid.isHexagonal && typeof grid.getCube === 'function') {
		const c1 = grid.getCube(coords1);
		const c2 = grid.getCube(coords2);
		const d0 = foundry.grid.HexagonalGrid.cubeDistance(c1, c2);
		if (c1.k === undefined || c2.k === undefined) return d0 === 1;
		if (d0 > 1) return false;
		const d1 = Math.abs(c1.k - c2.k);
		if (d1 > 1) return false;
		if (meleeDiagonals) return d0 + d1 !== 0;
		if (grid.diagonals === CONST.GRID_DIAGONALS.ILLEGAL) return d0 + d1 === 1;
		return d0 + d1 !== 0;
	}
	return testAdjacency(coords1, coords2);
}

export function getPerimeterCenters(token) {
	const { isGridless, isHexagonal, isSquare } = canvas.grid;
	if (isHexagonal) return getHexesOnPerimeter(token);
	if (isGridless) return getGridlessSquaresOnPerimeter(token);
	if (isSquare) return getSquaresOnPerimeter(token);
	return [];
}

function getOccupiedPerimeterCenters(token, data = {}) {
	const occupiedOffsets = getOccupiedOffsets2D(token, data);
	const perimeterOffsets = getPerimeterOffsetsFromOccupiedOffsets(occupiedOffsets);
	return getCentersFromOffsets(perimeterOffsets);
}

function compareCenterSets(left = [], right = []) {
	const leftMap = new Map(left.map((point) => [centerKey(point), point]));
	const rightMap = new Map(right.map((point) => [centerKey(point), point]));
	const onlyLeft = [];
	const onlyRight = [];
	for (const [key, point] of leftMap.entries()) {
		if (!rightMap.has(key)) onlyLeft.push(point);
	}
	for (const [key, point] of rightMap.entries()) {
		if (!leftMap.has(key)) onlyRight.push(point);
	}
	return { onlyLeft, onlyRight };
}

function benchmarkFunction(fn, iterations, ...args) {
	const count = Math.max(1, Number(iterations) || 1);
	const started = performance.now();
	let result;
	for (let i = 0; i < count; i += 1) {
		result = fn(...args);
	}
	const totalMs = performance.now() - started;
	return {
		iterations: count,
		totalMs,
		perIterationMs: totalMs / count,
		lastResult: result,
	};
}

function getTokenPerimeterCacheKey(token) {
	token = resolveDistanceToken(token);
	if (!token || !canvas?.grid || !canvas?.scene) return null;
	const doc = token.document;
	const shape = token.shape;
	const shapeKey =
		shape?.constructor?.name === 'Rectangle' ? `rect:${shape.x ?? 0}:${shape.y ?? 0}:${shape.width ?? 0}:${shape.height ?? 0}`
		: shape?.constructor?.name === 'Circle' ? `circle:${shape.x ?? 0}:${shape.y ?? 0}:${shape.radius ?? 0}`
		: shape?.points?.length ? `poly:${shape.points.join(',')}`
		: shape?.toPolygon?.()?.points?.length ? `poly:${shape.toPolygon().points.join(',')}`
		: (shape?.constructor?.name ?? 'shape');
	return [
		canvas.scene.id,
		token.id,
		token.x,
		token.y,
		doc.width,
		doc.height,
		doc.elevation ?? 0,
		canvas.grid.type,
		canvas.grid.size,
		canvas.grid.sizeX,
		canvas.grid.sizeY,
		canvas.grid.distance,
		shapeKey,
	].join(':');
}

function rememberPerimeterCacheEntry(key, value) {
	if (!key) return value;
	if (distancePerimeterCache.has(key)) distancePerimeterCache.delete(key);
	distancePerimeterCache.set(key, value);
	if (distancePerimeterCache.size > DISTANCE_PERIMETER_CACHE_LIMIT) {
		const oldestKey = distancePerimeterCache.keys().next().value;
		if (oldestKey !== undefined) distancePerimeterCache.delete(oldestKey);
	}
	return value;
}

function getCachedPerimeterCenters(token) {
	token = resolveDistanceToken(token);
	if (!token) return [];
	const key = getTokenPerimeterCacheKey(token);
	const cached = key ? distancePerimeterCache.get(key) : null;
	if (cached) {
		distancePerimeterCache.delete(key);
		distancePerimeterCache.set(key, cached);
		return cached.points;
	}
	const points = uniqueCenters(getPerimeterCenters(token));
	rememberPerimeterCacheEntry(key, {
		key,
		tokenId: token.id,
		points,
		createdAt: Date.now(),
	});
	return points;
}

function getCachedPerimeterDistanceData(tokenA, tokenB, { checkCollision = false, includeHeight = true } = {}) {
	tokenA = resolveDistanceToken(tokenA);
	tokenB = resolveDistanceToken(tokenB);
	if (!tokenA || !tokenB) return null;
	let totalDistance = Infinity;
	let diagonals = 0;
	let spaces = 0;
	let adjacent2D;
	let bestPair = null;
	const meleeDiagonals = settings.autoRangeChecks.has('meleeDiagonals');
	const { grid } = canvas || {};
	if (foundry.utils.isEmpty(grid)) return null;
	const { distance: gridDistance, isGridless, isHexagonal, isSquare } = grid;

	if (isHexagonal) {
		const tokenAHexes = getCachedPerimeterCenters(tokenA);
		const tokenBHexes = getCachedPerimeterCenters(tokenB);
		outer: for (const pointA of tokenAHexes) {
			for (const pointB of tokenBHexes) {
				if (_testDistanceCollision(pointA, pointB, tokenB.document, checkCollision)) continue;
				adjacent2D = testDistanceAdjacency(pointA, pointB, { meleeDiagonals });
				if (adjacent2D && meleeDiagonals) {
					totalDistance = gridDistance;
					diagonals = 0;
					spaces = 1;
					bestPair = { tokenA: pointA, tokenB: pointB };
					break outer;
				}
				const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
				if (distance2D < totalDistance) {
					totalDistance = distance2D;
					diagonals = pathDiagonals;
					spaces = pathSpaces;
					bestPair = { tokenA: pointA, tokenB: pointB };
				}
			}
		}
	} else {
		const areTokensIntersencting = tokenA.bounds.intersects(tokenB.bounds);
		if (areTokensIntersencting) {
			totalDistance = 0;
			diagonals = 0;
			spaces = 0;
			bestPair = { tokenA: tokenA.center, tokenB: tokenB.center };
		} else if (isGridless) {
			const tokenASquares = getCachedPerimeterCenters(tokenA);
			const tokenBSquares = getCachedPerimeterCenters(tokenB);
			for (const pointA of tokenASquares) {
				for (const pointB of tokenBSquares) {
					if (_testDistanceCollision(pointA, pointB, tokenB.document, checkCollision)) continue;
					const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
					if (distance2D < totalDistance) {
						const leeway = settings.autoRangeChecks.has('meleeOoR') ? gridDistance * 2 : false;
						totalDistance = leeway && distance2D <= leeway ? gridDistance : distance2D;
						diagonals = pathDiagonals;
						spaces = pathSpaces;
						bestPair = { tokenA: pointA, tokenB: pointB };
					}
				}
			}
		} else if (isSquare) {
			const tokenASquares = getCachedPerimeterCenters(tokenA);
			const tokenBSquares = getCachedPerimeterCenters(tokenB);
			outer: for (const pointA of tokenASquares) {
				for (const pointB of tokenBSquares) {
					if (_testDistanceCollision(pointA, pointB, tokenB.document, checkCollision)) continue;
					adjacent2D = testDistanceAdjacency(pointA, pointB, { meleeDiagonals });
					if (adjacent2D && meleeDiagonals) {
						totalDistance = gridDistance;
						diagonals = 0;
						spaces = 1;
						bestPair = { tokenA: pointA, tokenB: pointB };
						break outer;
					}
					const { distance: distance2D, diagonals: pathDiagonals, spaces: pathSpaces } = grid.measurePath([pointA, pointB]);
					if (distance2D < totalDistance) {
						totalDistance = distance2D;
						diagonals = pathDiagonals;
						spaces = pathSpaces;
						bestPair = { tokenA: pointA, tokenB: pointB };
					}
				}
			}
		}
	}

	if (includeHeight) totalDistance = heightDifference(tokenA, tokenB, totalDistance, diagonals, spaces, grid, adjacent2D);
	return {
		tokenA,
		tokenB,
		distance: roundDistance(totalDistance),
		bestPair,
		cache: {
			size: distancePerimeterCache.size,
			limit: DISTANCE_PERIMETER_CACHE_LIMIT,
		},
	};
}

function testAdjacency(coords1, coords2) {
	const { i: i1, j: j1, k: k1 } = canvas.grid.getOffset(coords1);
	const { i: i2, j: j2, k: k2 } = canvas.grid.getOffset(coords2);
	const di = Math.abs(i1 - i2);
	const dj = Math.abs(j1 - j2);
	const dk = k1 !== undefined ? Math.abs(k1 - k2) : 0;
	return Math.max(di, dj, dk) === 1;
}

function roundDistance(distance) {
	if (!Number.isFinite(distance)) return distance;
	return ((distance * 100) | 0) / 100;
}

function heightDifference(tokenA, tokenB, totalDistance, diagonals, spaces, grid, adjacent2D) {
	const tokenAz0 = (tokenA.document.elevation / grid.distance) | 0;
	const tokenAz1 = tokenAz0 + Math.max(1, Math.min(tokenA.document.width | 0, tokenA.document.height | 0));
	const tokenBz0 = (tokenB.document.elevation / grid.distance) | 0;
	const tokenBz1 = tokenBz0 + Math.max(1, Math.min(tokenB.document.width | 0, tokenB.document.height | 0));
	const dz =
		tokenBz0 >= tokenAz1 ? tokenBz0 - tokenAz1 + 1
		: tokenAz0 >= tokenBz1 ? tokenAz0 - tokenBz1 + 1
		: 0;
	if (Math.abs(dz) <= 1 && adjacent2D) return totalDistance;
	if (grid.isGridless) {
		const verticalDistance = dz * grid.distance;
		totalDistance = dz ? Math.sqrt(totalDistance * totalDistance + verticalDistance * verticalDistance) : totalDistance;
	} else totalDistance = dz ? calculateDiagonalsZ(diagonals, dz, spaces, grid) : totalDistance;
	return totalDistance;
}

function getHexesOnPerimeter(t) {
	const perimeterPoints = getHexPerimeterPoints(t);
	if (!perimeterPoints || perimeterPoints.length === 0) {
		console.warn('No perimeter points found for the token.');
		return [];
	}

	const foundHexes = {};

	for (let i = 0; i < perimeterPoints.length; i += 1) {
		const p = perimeterPoints[i];
		const nudged = nudgeToward(p, t.center);
		const pointToCube = canvas.grid.pointToCube({ x: nudged[0], y: nudged[1] });
		const hex = canvas.grid.getCenterPoint(pointToCube);
		hex.id = hex.x + hex.y;
		if (!foundHexes[hex.id] && hex.x > t.bounds.left && hex.x < t.bounds.right && hex.y < t.bounds.bottom && hex.y > t.bounds.top) {
			foundHexes[hex.id] = hex;
		}
	}
	return Object.values(foundHexes);
}

function nudgeToward(point, center, distance = 0.2) {
	const dx = center.x - point.x;
	const dy = center.y - point.y;
	const radians = Math.atan2(dy, dx);
	const degrees = radians * (180 / Math.PI);
	const nudgedPoint = getHexTranslatedPoint(point, degrees, distance);
	return [nudgedPoint.x, nudgedPoint.y];
}

function getHexPerimeterPoints(t) {
	const clipperP = t.shape.toClipperPoints();

	const points = [];
	clipperP.forEach((r) => points.push({ x: t.x + r.X, y: t.y + r.Y }));
	return points;
}

function getHexTranslatedPoint(point, direction, distance) {
	direction = Math.toRadians(direction);
	const dx = Math.cos(direction);
	const dy = Math.sin(direction);
	let q;
	let r;
	if (canvas.grid.columns) {
		q = 2 * Math.SQRT1_3 * dx;
		r = -0.5 * q + dy;
	} else {
		r = 2 * Math.SQRT1_3 * dy;
		q = -0.5 * r + dx;
	}
	const s = ((distance / canvas.grid.distance) * canvas.grid.size) / ((Math.abs(r) + Math.abs(q) + Math.abs(q + r)) / 2);
	return { x: point.x + dx * s, y: point.y + dy * s };
}

function getGridlessSquaresOnPerimeter(t) {
	const perimeterCenterPoints = {};
	if (t.bounds.width === canvas.grid.sizeX && t.bounds.height === canvas.grid.sizeY) {
		perimeterCenterPoints.one = { x: t.x + Math.floor(canvas.grid.size / 2), y: t.y + Math.floor(canvas.grid.size / 2) };
	} else {
		const bounds = t.bounds;
		for (let x = bounds.x; x < bounds.right; x += canvas.grid.size) {
			for (let y = bounds.y; y < bounds.bottom; y += canvas.grid.size) {
				if (x === bounds.x || x === bounds.right - canvas.grid.size || y === bounds.y || y === bounds.bottom - canvas.grid.size) {
					const centerPoint = { x: x + Math.floor(canvas.grid.size / 2), y: y + Math.floor(canvas.grid.size / 2) };
					const newID = `${centerPoint.x}_${centerPoint.y}`;
					if (!perimeterCenterPoints[newID]) perimeterCenterPoints[newID] = { x: centerPoint.x, y: centerPoint.y };
				}
			}
		}
	}
	return Object.values(perimeterCenterPoints);
}

function getSquaresOnPerimeter(t) {
	const perimeterCenterPoints = {};
	const clipperPoints = game.version < 13 ? t.shape.toPolygon().toClipperPoints() : t.shape.toClipperPoints();
	for (let x = clipperPoints[0].X; x < clipperPoints[1].X; x += canvas.grid.size) {
		for (let y = clipperPoints[0].Y; y < clipperPoints[3].Y; y += canvas.grid.size) {
			if (x === 0 || x === clipperPoints[1].X - canvas.grid.size || y === 0 || y === clipperPoints[3].Y - canvas.grid.size) {
				const newX = t.x + x;
				const newY = t.y + y;
				const centerPoint = canvas.grid.getCenterPoint({ i: Math.floor(newY / canvas.grid.size), j: Math.floor(newX / canvas.grid.size) });
				const newID = `${centerPoint.x}_${centerPoint.y}`;
				if (!perimeterCenterPoints[newID]) perimeterCenterPoints[newID] = { x: centerPoint.x, y: centerPoint.y };
			}
		}
	}
	return Object.values(perimeterCenterPoints);
}

function calculateDiagonalsZ(diagonals, dz, spaces, grid) {
	const XY = { diagonals, illegal: spaces, moves: 0 };
	const Z = { illegal: dz, diagonals: Math.min(XY.illegal, dz), diagonalsXYZ: 0, diagonalsXZ_YZ: 0, moves: 0 };
	Z.diagonalsXYZ = Math.min(XY.diagonals, Z.diagonals);
	Z.diagonalsXZ_YZ = Z.diagonals - Z.diagonalsXYZ;
	XY.moves = spaces - (XY.diagonals + Z.diagonalsXZ_YZ);
	Z.moves = dz - Z.diagonals;
	const overallDiagonals = Math.max(XY.diagonals, Z.diagonals);
	let totalDistance = 0;
	switch (grid.diagonals) {
		case CONST.GRID_DIAGONALS.EQUIDISTANT:
			totalDistance = XY.moves + Z.moves + overallDiagonals;
			break;

		case CONST.GRID_DIAGONALS.ALTERNATING_1:
			for (let i = 1; i <= overallDiagonals; i++) {
				totalDistance += i & 1 ? 1 : 2;
			}
			totalDistance += XY.moves + Z.moves;
			break;

		case CONST.GRID_DIAGONALS.ALTERNATING_2:
			for (let i = 1; i <= overallDiagonals; i++) {
				totalDistance += i & 1 ? 2 : 1;
			}
			totalDistance += XY.moves + Z.moves;
			break;

		case CONST.GRID_DIAGONALS.ILLEGAL:
			totalDistance = XY.illegal + Z.illegal;
			break;

		case CONST.GRID_DIAGONALS.EXACT:
			totalDistance = XY.moves + Z.moves + (overallDiagonals - Z.diagonalsXYZ) * Math.sqrt(2) + Z.diagonalsXYZ * Math.sqrt(3);
			break;

		case CONST.GRID_DIAGONALS.APPROXIMATE:
			totalDistance = XY.moves + Z.moves + overallDiagonals * 1.5;
			break;

		case CONST.GRID_DIAGONALS.RECTILINEAR:
			totalDistance = XY.moves + Z.moves + overallDiagonals * 2;
			break;

		default:
			throw new Error(`${Constants.MODULE_NAME_SHORT}: Unknown diagonal rule: ${grid.diagonals}`);
	}

	totalDistance *= grid.distance;
	return totalDistance;
}
