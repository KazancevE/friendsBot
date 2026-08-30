import type { GameState, Piece } from "../../src/domain/block-blast.ts";
import { canPlace, pieceAnchorCells } from "../../src/domain/block-blast.ts";
import {
  createDragGhostElement,
  DRAG_GHOST_MAX_PX,
  pieceBounds,
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

export const computeDragOffsetY = (piece: Piece, maxPx = DRAG_GHOST_MAX_PX) => {
  const { rows } = pieceBounds(piece);
  const cellSize = Math.max(1, Math.floor(maxPx / Math.max(rows, pieceBounds(piece).cols)));
  const pieceHeightPx = rows * cellSize + (rows - 1) * TRAY_PIECE_GAP_PX;
  return Math.max(MIN_FINGER_OFFSET_PX, pieceHeightPx + FINGER_MARGIN_PX);
};

type BoardCell = {
  readonly row: number;
  readonly col: number;
};

export const compensatedLookupY = (clientY: number, piece: Piece, compensate: boolean) => {
  return compensate ? clientY - computeDragOffsetY(piece) : clientY;
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
  let lastGhostCell: BoardCell | undefined;

  const clearDragGhost = () => {
    dragGhost?.remove();
    dragGhost = undefined;
  };

  const resetDrag = () => {
    dragIndex = undefined;
    dragPiece = undefined;
    dragMoved = false;
    hapticPickup = false;
    lastGhostCell = undefined;
    clearDragGhost();
    boardApi.setDraggingPiece(undefined);
    boardApi.setGhost(undefined, true);
  };

  const tryPlace = (pieceIndex: number, row: number, col: number) => {
    const state = getState();
    const piece = state.tray[pieceIndex];
    if (piece === undefined || piece === null) {
      onInvalid();
      return;
    }
    if (!canPlace({ board: state.board, piece, row, col })) {
      boardApi.shakeTrayPiece(pieceIndex);
      onInvalid();
      return;
    }
    selectedIndex = undefined;
    boardApi.setSelectedPiece(undefined);
    hapticImpact("medium");
    onPlace({ pieceIndex, row, col });
  };

  const showGhost = (piece: Piece, row: number, col: number) => {
    const state = getState();
    const cells = pieceAnchorCells(piece, row, col);
    const valid = canPlace({ board: state.board, piece, row, col });
    boardApi.setGhost(cells, valid, piece.tile);
  };

  const positionDragGhost = (ghost: HTMLElement, clientX: number, clientY: number, piece: Piece) => {
    ghost.style.left = `${clientX}px`;
    ghost.style.top = `${clientY - computeDragOffsetY(piece)}px`;
  };

  const updateDragVisuals = (clientX: number, clientY: number) => {
    if (dragPiece === undefined) {
      return;
    }
    const { cell, overBoard } = boardCellFromFinger(boardApi, dragPiece, clientX, clientY, true);
    if (overBoard) {
      clearDragGhost();
      if (cell === undefined) {
        lastGhostCell = undefined;
        boardApi.setGhost(undefined, true);
        return;
      }
      lastGhostCell = cell;
      showGhost(dragPiece, cell.row, cell.col);
      return;
    }
    lastGhostCell = undefined;
    boardApi.setGhost(undefined, true);
    if (dragGhost === undefined) {
      dragGhost = createDragGhostElement(dragPiece);
      document.body.append(dragGhost);
    }
    positionDragGhost(dragGhost, clientX, clientY, dragPiece);
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
    dragIndex = index;
    dragPiece = piece;
    dragMoved = false;
    hapticPickup = false;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    clearDragGhost();
    dragGhost = createDragGhostElement(piece, boardApi.getSkin());
    positionDragGhost(dragGhost, event.clientX, event.clientY, piece);
    document.body.append(dragGhost);
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
    const { cell } = boardCellFromFinger(boardApi, piece, event.clientX, event.clientY, dragMoved);
    const placeCell = cell ?? lastGhostCell;
    if (dragMoved && placeCell !== undefined) {
      tryPlace(index, placeCell.row, placeCell.col);
      suppressClick = true;
      window.setTimeout(() => {
        suppressClick = false;
      }, 0);
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
    resetDrag();
  };
};
