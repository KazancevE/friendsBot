import type { Board, GameState, Piece } from "../../src/domain/block-blast.ts";
import { BOARD_SIZE, canPlace, pieceAnchorCells } from "../../src/domain/block-blast.ts";
import {
  createDragGhostElement,
  DRAG_GHOST_MAX_PX,
  PLACE_MS,
  pieceBounds,
  piecePreviewCellSize,
  TRAY_PIECE_GAP_PX,
  type BlockBlastBoard,
} from "./block-blast-board.ts";
import { hapticImpact } from "./telegram.ts";

type BindBlockBlastGesturesParameters = {
  readonly boardApi: BlockBlastBoard;
  readonly getState: () => GameState;
  readonly getBusy: () => boolean;
  readonly onPlace: (input: {
    readonly pieceIndex: number;
    readonly row: number;
    readonly col: number;
  }) => void;
  readonly onInvalid: () => void;
};

const DRAG_THRESHOLD_PX = 8;
const MIN_FINGER_OFFSET_PX = 120;
const FINGER_MARGIN_PX = 48;
const MAGNET_RADIUS_CELLS = 1;

export const computeDragOffsetY = (piece: Piece, maxPx = DRAG_GHOST_MAX_PX) => {
  const { rows } = pieceBounds(piece);
  const cellSize = piecePreviewCellSize(piece, maxPx);
  const pieceHeightPx = rows * cellSize + (rows - 1) * TRAY_PIECE_GAP_PX;
  return Math.max(MIN_FINGER_OFFSET_PX, pieceHeightPx + FINGER_MARGIN_PX);
};

type BoardCell = {
  readonly row: number;
  readonly col: number;
};

type BoardRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
};

type DragGhostCssPositionParameters = {
  readonly clientX: number;
  readonly clientY: number;
  readonly piece: Piece;
};

export const dragGhostCssPosition = ({ clientX, clientY, piece }: DragGhostCssPositionParameters) => {
  return {
    left: clientX,
    top: clientY - computeDragOffsetY(piece),
  };
};

type DragPieceBoxFromFingerParameters = {
  readonly clientX: number;
  readonly clientY: number;
  readonly piece: Piece;
  readonly board: BoardRect;
};

const dragPieceBoxFromFinger = ({
  clientX,
  clientY,
  piece,
  board,
}: DragPieceBoxFromFingerParameters) => {
  const cellSize = board.width / BOARD_SIZE;
  const { rows, cols } = pieceBounds(piece);
  const width = cols * cellSize;
  const height = rows * cellSize;
  const bottom = clientY - computeDragOffsetY(piece);
  return {
    left: clientX - width / 2,
    top: bottom - height,
    width,
    height,
  };
};

type SnapOriginFromPieceBoxParameters = {
  readonly box: { readonly left: number; readonly top: number };
  readonly board: BoardRect;
};

const fractionalOriginFromPieceBox = ({ box, board }: SnapOriginFromPieceBoxParameters) => {
  const cellSize = board.width / BOARD_SIZE;
  return {
    row: (box.top - board.top) / cellSize,
    col: (box.left - board.left) / cellSize,
  };
};

type MagnetSnapOriginParameters = {
  readonly box: { readonly left: number; readonly top: number };
  readonly board: BoardRect;
  readonly piece: Piece;
  readonly occupancy: Board;
};

const magnetSnapOrigin = ({ box, board, piece, occupancy }: MagnetSnapOriginParameters) => {
  const fractional = fractionalOriginFromPieceBox({ box, board });
  const rounded = {
    row: Math.round(fractional.row),
    col: Math.round(fractional.col),
  };
  if (canPlace({ board: occupancy, piece, row: rounded.row, col: rounded.col })) {
    return rounded;
  }
  let best: { origin: BoardCell; dist: number } | undefined;
  for (let row = rounded.row - 1; row <= rounded.row + 1; row += 1) {
    for (let col = rounded.col - 1; col <= rounded.col + 1; col += 1) {
      if (!canPlace({ board: occupancy, piece, row, col })) {
        continue;
      }
      const dist = Math.hypot(row - fractional.row, col - fractional.col);
      if (dist > MAGNET_RADIUS_CELLS) {
        continue;
      }
      if (best === undefined || dist < best.dist) {
        best = { origin: { row, col }, dist };
      }
    }
  }
  return best?.origin;
};

type PieceOverlapsBoardParameters = {
  readonly piece: Piece;
  readonly origin: BoardCell;
};

const pieceOverlapsBoard = ({ piece, origin }: PieceOverlapsBoardParameters) => {
  return piece.cells.some((cell) => {
    const row = origin.row + cell.dr;
    const col = origin.col + cell.dc;
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  });
};

type SnappedGhostCssPositionParameters = {
  readonly origin: BoardCell;
  readonly piece: Piece;
  readonly board: BoardRect;
};

const snappedGhostCssPosition = ({ origin, piece, board }: SnappedGhostCssPositionParameters) => {
  const { rows, cols } = pieceBounds(piece);
  const cellSize = board.width / BOARD_SIZE;
  return {
    left: board.left + (origin.col + cols / 2) * cellSize,
    top: board.top + (origin.row + rows) * cellSize,
  };
};

type DragPlacementFromFingerParameters = {
  readonly clientX: number;
  readonly clientY: number;
  readonly piece: Piece;
  readonly board: BoardRect;
  readonly occupancy: Board;
};

export const dragPlacementFromFinger = ({
  clientX,
  clientY,
  piece,
  board,
  occupancy,
}: DragPlacementFromFingerParameters) => {
  const box = dragPieceBoxFromFinger({ clientX, clientY, piece, board });
  const origin = magnetSnapOrigin({ box, board, piece, occupancy });
  const followCellSize = piecePreviewCellSize(piece, DRAG_GHOST_MAX_PX);
  if (origin === undefined || !pieceOverlapsBoard({ piece, origin })) {
    return {
      mode: "follow" as const,
      origin: undefined,
      css: dragGhostCssPosition({ clientX, clientY, piece }),
      ghostCellSize: followCellSize,
      showBoardGhost: false,
    };
  }
  return {
    mode: "snap" as const,
    origin,
    css: snappedGhostCssPosition({ origin, piece, board }),
    ghostCellSize: board.width / BOARD_SIZE,
    showBoardGhost: false,
  };
};

export const compensatedLookupY = (clientY: number, piece: Piece, compensate: boolean) => {
  return compensate ? clientY - computeDragOffsetY(piece) : clientY;
};

type ResolveDragReleaseParameters = {
  readonly dragMoved: boolean;
  readonly origin: BoardCell | undefined;
};

export const resolveDragRelease = ({ dragMoved, origin }: ResolveDragReleaseParameters) => {
  if (!dragMoved) {
    return { type: "select" as const, ghost: "clear" as const };
  }
  if (origin === undefined) {
    return { type: "return" as const, ghost: "clear" as const };
  }
  return { type: "place" as const, origin, ghost: "defer" as const };
};

const boardCellFromFinger = (
  boardApi: BlockBlastBoard,
  piece: Piece,
  clientX: number,
  clientY: number,
  compensate: boolean,
) => {
  const lookupY = compensatedLookupY(clientY, piece, compensate);
  const cell = boardApi.boardCellFromPoint(clientX, lookupY);
  return { cell, overBoard: cell !== undefined };
};

export const bindBlockBlastGestures = ({
  boardApi,
  getState,
  getBusy,
  onPlace,
  onInvalid,
}: BindBlockBlastGesturesParameters) => {
  const board = boardApi.getBoardElement();
  const tray = boardApi.getTrayElement();

  let selectedIndex: number | undefined;
  let dragIndex: number | undefined;
  let dragPiece: Piece | undefined;
  let dragGhost: HTMLElement | undefined;
  let dragMoved = false;
  let suppressClick = false;
  let pointerStartX = 0;
  let pointerStartY = 0;
  let hapticPickup = false;

  const clearDragGhost = () => {
    dragGhost?.remove();
    dragGhost = undefined;
  };

  const resetDrag = () => {
    dragIndex = undefined;
    dragPiece = undefined;
    dragMoved = false;
    hapticPickup = false;
    boardApi.setDraggingPiece(undefined);
    boardApi.setGhost(undefined, true);
  };

  const finishDragGhost = (action: "clear" | "defer") => {
    const settling = dragGhost;
    dragGhost = undefined;
    if (settling === undefined) {
      return;
    }
    if (action === "clear") {
      settling.remove();
      return;
    }
    settling.classList.add("bb-drag-ghost--settling");
    window.setTimeout(() => {
      settling.remove();
    }, PLACE_MS);
  };

  const tryPlace = (pieceIndex: number, row: number, col: number) => {
    const state = getState();
    const piece = state.tray[pieceIndex];
    if (piece === undefined || piece === null) {
      onInvalid();
      return false;
    }
    if (!canPlace({ board: state.board, piece, row, col })) {
      boardApi.shakeTrayPiece(pieceIndex);
      onInvalid();
      return false;
    }
    selectedIndex = undefined;
    boardApi.setSelectedPiece(undefined);
    hapticImpact("medium");
    onPlace({ pieceIndex, row, col });
    return true;
  };

  const showGhost = (piece: Piece, row: number, col: number) => {
    const state = getState();
    const cells = pieceAnchorCells(piece, row, col);
    const valid = canPlace({ board: state.board, piece, row, col });
    boardApi.setGhost(cells, valid, piece.tile);
  };

  const positionDragGhost = (ghost: HTMLElement, css: { readonly left: number; readonly top: number }) => {
    ghost.style.left = `${css.left}px`;
    ghost.style.top = `${css.top}px`;
  };

  const ensureDragGhost = (piece: Piece) => {
    if (dragGhost === undefined) {
      dragGhost = createDragGhostElement(piece, boardApi.getSkin());
      document.body.append(dragGhost);
    }
    return dragGhost;
  };

  const applyDragGhostVisual = ({
    ghost,
    placement,
    piece,
  }: {
    readonly ghost: HTMLElement;
    readonly placement: ReturnType<typeof dragPlacementFromFinger>;
    readonly piece: Piece;
  }) => {
    const followCellSize = piecePreviewCellSize(piece, DRAG_GHOST_MAX_PX);
    ghost.style.setProperty("--bb-drag-scale", String(placement.ghostCellSize / followCellSize));
    ghost.classList.toggle("bb-drag-ghost--snap", placement.mode === "snap");
    positionDragGhost(ghost, placement.css);
    if (placement.showBoardGhost && placement.origin !== undefined) {
      showGhost(piece, placement.origin.row, placement.origin.col);
      return;
    }
    boardApi.setGhost(undefined, true);
  };

  const updateDragVisuals = (clientX: number, clientY: number) => {
    if (dragPiece === undefined) {
      return;
    }
    const boardRect = boardApi.getBoardElement().getBoundingClientRect();
    const placement = dragPlacementFromFinger({
      clientX,
      clientY,
      piece: dragPiece,
      board: boardRect,
      occupancy: getState().board,
    });
    applyDragGhostVisual({ ghost: ensureDragGhost(dragPiece), placement, piece: dragPiece });
  };

  const onTrayPointerDown = (event: PointerEvent) => {
    if (getBusy()) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const slot = target.closest("[data-index]");
    if (!(slot instanceof HTMLElement)) {
      return;
    }
    const index = Number(slot.dataset.index);
    const state = getState();
    const piece = state.tray[index];
    if (piece === undefined || piece === null) {
      return;
    }

    selectedIndex = index;
    boardApi.setSelectedPiece(index);
    boardApi.setDraggingPiece(index);
    boardApi.setGhost(undefined, true);
    dragIndex = index;
    dragPiece = piece;
    dragMoved = false;
    hapticPickup = false;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    clearDragGhost();
    const ghost = ensureDragGhost(piece);
    ghost.style.setProperty("--bb-drag-scale", "1");
    ghost.classList.remove("bb-drag-ghost--snap");
    positionDragGhost(ghost, dragGhostCssPosition({ clientX: event.clientX, clientY: event.clientY, piece }));
    slot.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (getBusy() || dragIndex === undefined || dragPiece === undefined) {
      return;
    }
    const distance = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
    if (distance >= DRAG_THRESHOLD_PX) {
      if (!dragMoved) {
        dragMoved = true;
      }
      if (!hapticPickup) {
        hapticPickup = true;
        hapticImpact("light");
      }
    }
    updateDragVisuals(event.clientX, event.clientY);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (dragIndex === undefined || dragPiece === undefined) {
      return;
    }
    const index = dragIndex;
    const piece = dragPiece;
    const boardRect = boardApi.getBoardElement().getBoundingClientRect();
    const placement = dragMoved
      ? dragPlacementFromFinger({
          clientX: event.clientX,
          clientY: event.clientY,
          piece,
          board: boardRect,
          occupancy: getState().board,
        })
      : { origin: undefined };
    const release = resolveDragRelease({ dragMoved, origin: placement.origin });
    switch (release.type) {
      case "place": {
        const placed = tryPlace(index, release.origin.row, release.origin.col);
        suppressClick = true;
        window.setTimeout(() => {
          suppressClick = false;
        }, 0);
        finishDragGhost(placed ? release.ghost : "clear");
        break;
      }
      case "return": {
        selectedIndex = undefined;
        boardApi.setSelectedPiece(undefined);
        finishDragGhost(release.ghost);
        break;
      }
      case "select": {
        finishDragGhost(release.ghost);
        break;
      }
      default: {
        const _exhaustive: never = release;
        throw new Error(`Unhandled drag release: ${_exhaustive}`);
      }
    }
    resetDrag();
  };

  const onBoardClick = (event: MouseEvent) => {
    if (getBusy() || suppressClick || selectedIndex === undefined) {
      return;
    }
    const state = getState();
    const piece = state.tray[selectedIndex];
    if (piece === undefined || piece === null) {
      return;
    }
    const { cell } = boardCellFromFinger(boardApi, piece, event.clientX, event.clientY, false);
    if (cell === undefined) {
      return;
    }
    tryPlace(selectedIndex, cell.row, cell.col);
  };

  const onBoardMove = (event: PointerEvent) => {
    if (getBusy() || dragMoved || selectedIndex === undefined) {
      return;
    }
    const state = getState();
    const piece = state.tray[selectedIndex];
    if (piece === undefined || piece === null) {
      return;
    }
    const { cell } = boardCellFromFinger(boardApi, piece, event.clientX, event.clientY, false);
    if (cell === undefined) {
      boardApi.setGhost(undefined, true);
      return;
    }
    showGhost(piece, cell.row, cell.col);
  };

  tray.addEventListener("pointerdown", onTrayPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("pointercancel", onPointerUp);
  board.addEventListener("click", onBoardClick);
  board.addEventListener("pointermove", onBoardMove);

  return () => {
    tray.removeEventListener("pointerdown", onTrayPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerUp);
    board.removeEventListener("click", onBoardClick);
    board.removeEventListener("pointermove", onBoardMove);
    clearDragGhost();
    resetDrag();
  };
};
