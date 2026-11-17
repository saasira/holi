/**
 * Pure layout arithmetic for a grid of rectangular tiles: no DOM, so it can be checked on its own.
 *
 * A tile is `{ id, x, y, w, h }` in grid cells: `x` and `w` along the columns, `y` and `h` down the rows. Tiles never overlap and, after
 * {@link compact}, rest as high as the tiles above allow (vertical compaction, as in a dashboard).
 */

function toInt(value, fallback) {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? n : fallback;
}

/** A copy of the tile kept inside the grid: at least one cell, no wider than the columns, not left of or above the origin. */
export function clampTile(tile, cols) {
    const w = Math.min(Math.max(1, toInt(tile.w, 1)), cols);
    const h = Math.max(1, toInt(tile.h, 1));
    const x = Math.min(Math.max(0, toInt(tile.x, 0)), cols - w);
    const y = Math.max(0, toInt(tile.y, 0));
    return { ...tile, x, y, w, h };
}

export function collides(a, b) {
    return a.id !== b.id && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Settles every tile as high as it can go without overlapping a tile placed before it. Tiles are taken top to bottom, then left to right.
 * The anchor (the tile being dragged or resized) keeps its place and the others flow around it. Returns new tiles in the order given.
 */
export function compact(tiles, cols, anchorId = null) {
    const list = tiles.map((tile) => clampTile(tile, cols));
    const anchor = anchorId === null ? null : list.find((tile) => tile.id === anchorId) || null;
    const placed = anchor ? [anchor] : [];
    list.filter((tile) => tile !== anchor)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .forEach((tile) => {
            tile.y = 0;
            let hit = placed.find((other) => collides(tile, other));
            while (hit) {
                tile.y = hit.y + hit.h;
                hit = placed.find((other) => collides(tile, other));
            }
            placed.push(tile);
        });
    return list;
}

/**
 * Gives a position to each tile that has none (`x` or `y` missing): the first free spot, scanning row by row. Tiles that have a position
 * keep it. Returns new tiles in the order given.
 */
export function autoPlace(tiles, cols) {
    const list = tiles.map((tile) => clampTile({ ...tile, x: tile.x ?? 0, y: tile.y ?? 0 }, cols));
    const unplaced = new Set(tiles.map((tile, i) => (Number.isFinite(Number(tile.x)) && Number.isFinite(Number(tile.y)) ? -1 : i)).filter((i) => i >= 0));
    const placed = list.filter((_, i) => !unplaced.has(i));
    unplaced.forEach((i) => {
        const tile = list[i];
        search: for (let y = 0; ; y += 1) {
            for (let x = 0; x <= cols - tile.w; x += 1) {
                tile.x = x;
                tile.y = y;
                if (!placed.some((other) => collides(tile, other))) break search;
            }
        }
        placed.push(tile);
    });
    return list;
}

/** Moves one tile to a cell and lets the others flow around it. */
export function moveTile(tiles, id, x, y, cols) {
    return compact(tiles.map((tile) => (tile.id === id ? { ...tile, x, y } : tile)), cols, id);
}

/** Resizes one tile and lets the others flow around it. */
export function resizeTile(tiles, id, w, h, cols) {
    return compact(tiles.map((tile) => (tile.id === id ? { ...tile, w, h } : tile)), cols, id);
}

/** True when the two layouts put every tile in the same place. */
export function sameLayout(a, b) {
    if (a.length !== b.length) return false;
    const byId = new Map(b.map((tile) => [tile.id, tile]));
    return a.every((tile) => {
        const other = byId.get(tile.id);
        return other && other.x === tile.x && other.y === tile.y && other.w === tile.w && other.h === tile.h;
    });
}
