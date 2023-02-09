/** Respect ZHELL's code
* Gets the minimum distance between two tokens,
* evaluating all grid spaces they occupy.
*/
export function _getMinimumDistanceBetweenTokens(tokenA, tokenB) {
  const A = _getAllTokenGridSpaces(tokenA.document);
  const B = _getAllTokenGridSpaces(tokenB.document);
  const rays = A.flatMap(a => {
    return B.map(b => {
      return { ray: new Ray(a, b) };
    });
  });
  const dist = canvas.scene.grid.distance; // 5ft.
  const distances = canvas.grid.measureDistances(rays, {
    gridSpaces: true
  }).map(d => Math.round(d / dist) * dist);
  const eles = [tokenA, tokenB].map(t => t.document.elevation);
  const elevationDiff = Math.abs(eles[0] - eles[1]);
  return Math.max(Math.min(...distances), elevationDiff);
}

/**
* Get the upper left corners of all grid spaces a token document occupies.
*/
export function _getAllTokenGridSpaces(tokenDoc) {
  const { width, height, x, y } = tokenDoc;
  if (width <= 1 && height <= 1) return [{ x, y }];
  const centers = [];
  const grid = canvas.grid.size;
  for (let a = 0; a < width; a++) {
    for (let b = 0; b < height; b++) {
      centers.push({
        x: x + a * grid,
        y: y + b * grid
      });
    }
  }
  return centers;
}

export function _playerForActor(actor) { //From tposney's code for MidiQOL.
  if (!actor) return undefined;
  let user;
  // find an active user whose character is the actor
  if (actor.hasPlayerOwner) user = game.users?.find((u) => u.data.character === actor?.id && u.active);
  if (!user)
    // no controller - find the first owner who is active
    user = game.users?.players.find(
      (p) => p.active && actor?.data.permission[p.id ?? ""] === CONST.DOCUMENT_PERMISSION_LEVELS.OWNER
    );
  if (!user)
    // find a non-active owner
    user = game.users?.players.find((p) => p.character?.id === actor?.id);
  if (!user)
    // no controlled - find an owner that is not active
    user = game.users?.players.find((p) => actor?.data.permission[p.id ?? ""] === CONST.DOCUMENT_PERMISSION_LEVELS.OWNER);
  if (!user && actor?.data.permission.default === CONST.DOCUMENT_PERMISSION_LEVELS.OWNER) {
    // does anyone have default owner permission who is active
    user = game.users?.players.find(
      (p) => p.active && actor?.data.permission.default === CONST.DOCUMENT_PERMISSION_LEVELS.OWNER
    );
  }
  // if all else fails it's and active gm.
  if (!user) user = game.users?.find((p) => p.isGM && p.active);
  return user;
} 
