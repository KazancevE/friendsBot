import type { GameState, Piece } from "../../src/domain/block-blast.ts";
import { canPlace, pieceAnchorCells } from "../../src/domain/block-blast.ts";
import { createDragGhostElement, type BlockBlastBoard } from "./block-blast-board.ts";

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
const DRAG_OFFSET_Y = 80;

const positionDragGhost = (ghost: HTMLElement, clientX: number, clientY: number) => {
  ghost.style.left = `${clientX}px`;
  ghost.style.top = `${clientY - DRAG_OFFSET_Y}px`;
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

  const clearDragGhost = () => {
    dragGhost?.remove();
    dragGhost = undefined;
  };

  const resetDrag = () => {
    dragIndex = undefined;
    dragPiece = undefined;
    dragMoved = false;
    clearDragGhost();
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
    onPlace({ pieceIndex, row, col });
  };

  const showGhost = (piece: Piece, row: number, col: number) => {
    const state = getState();
    const cells = pieceAnchorCells(piece, row, col);
    const valid = canPlace({ board: state.board, piece, row, col });
    boardApi.setGhost(cells, valid, piece.tile);
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
    dragIndex = index;
    dragPiece = piece;
    dragMoved = false;
    pointerStartX = event.clientX;
    pointerStartY = event.clientY;
    clearDragGhost();
    dragGhost = createDragGhostElement(piece);
    positionDragGhost(dragGhost, event.clientX, event.clientY);
    document.body.append(dragGhost);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (getBusy() || dragIndex === undefined || dragPiece === undefined) {
      return;
    }
    const distance = Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY);
    if (distance >= DRAG_THRESHOLD_PX) {
      dragMoved = true;
    }
    if (dragGhost !== undefined) {
      positionDragGhost(dragGhost, event.clientX, event.clientY);
    }
    const cell = boardApi.boardCellFromPoint(event.clientX, event.clientY);
    if (cell === undefined) {
      boardApi.setGhost(undefined, true);
      return;
    }
    showGhost(dragPiece, cell.row, cell.col);
  };

  const onPointerUp = (event: PointerEvent) => {
    if (dragIndex === undefined) {
      return;
    }
    const index = dragIndex;
    const cell = boardApi.boardCellFromPoint(event.clientX, event.clientY);
    if (dragMoved && cell !== undefined) {
      tryPlace(index, cell.row, cell.col);
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
    const cell = boardApi.boardCellFromPoint(event.clientX, event.clientY);
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
    const cell = boardApi.boardCellFromPoint(event.clientX, event.clientY);
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
