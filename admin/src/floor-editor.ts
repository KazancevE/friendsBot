import { patchVenueTable, saveFloorElement, deleteFloorElement, type FloorPlanView } from "./api.ts";
import { escapeHtml } from "./ui-helpers.ts";

type DragTarget =
  | { kind: "table"; id: string }
  | { kind: "element"; id: string };

const kindLabel = (kind: string) => {
  switch (kind) {
    case "bar":
      return "Бар";
    case "obstacle":
      return "Препятствие";
    case "wall":
      return "Стена";
    default:
      return "Декор";
  }
};

export const mountFloorEditor = (
  host: HTMLElement,
  floorPlan: FloorPlanView,
  onChange: () => void,
) => {
  const scale = Math.min(1, 640 / floorPlan.width);
  const width = floorPlan.width * scale;
  const height = floorPlan.height * scale;

  host.innerHTML = `
    <div class="floor-toolbar">
      <button type="button" class="action" data-add-element="bar">+ Бар</button>
      <button type="button" class="action" data-add-element="obstacle">+ Препятствие</button>
      <button type="button" class="action" data-add-element="wall">+ Стена</button>
      <span class="muted">Перетащите стол или элемент</span>
    </div>
    <div class="floor-canvas-wrap">
      <div class="floor-canvas" data-floor-canvas style="width:${width}px;height:${height}px">
        ${floorPlan.elements
          .map(
            (element) =>
              `<div class="floor-item floor-item--${escapeHtml(element.kind)}" data-element-id="${element.id}" style="left:${element.posX * scale}px;top:${element.posY * scale}px;width:${element.width * scale}px;height:${element.height * scale}px;transform:rotate(${element.rotation}deg)">
                <span>${escapeHtml(kindLabel(element.kind))}</span>
                <button type="button" class="floor-delete" data-delete-element="${element.id}">×</button>
              </div>`,
          )
          .join("")}
        ${floorPlan.tables
          .map(
            (table) =>
              `<div class="floor-table ${table.active ? "" : "floor-table--inactive"}" data-table-id="${table.id}" style="left:${table.posX * scale}px;top:${table.posY * scale}px;width:${table.width * scale}px;height:${table.height * scale}px;transform:rotate(${table.rotation}deg)">
                <strong>${escapeHtml(table.label)}</strong>
                <small>${table.seatsMin}-${table.seatsMax}</small>
              </div>`,
          )
          .join("")}
      </div>
    </div>
  `;

  const canvas = host.querySelector("[data-floor-canvas]");
  if (!(canvas instanceof HTMLElement)) {
    return;
  }

  let drag: { target: DragTarget; startX: number; startY: number; originX: number; originY: number } | null =
    null;

  const toPlanCoords = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  };

  const onPointerMove = (event: PointerEvent) => {
    if (drag === null) {
      return;
    }
    const point = toPlanCoords(event.clientX, event.clientY);
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    const el =
      drag.target.kind === "table"
        ? canvas.querySelector(`[data-table-id="${drag.target.id}"]`)
        : canvas.querySelector(`[data-element-id="${drag.target.id}"]`);
    if (el instanceof HTMLElement) {
      el.style.left = `${(drag.originX + dx) * scale}px`;
      el.style.top = `${(drag.originY + dy) * scale}px`;
    }
  };

  const onPointerUp = async (event: PointerEvent) => {
    if (drag === null) {
      return;
    }
    const current = drag;
    drag = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    const point = toPlanCoords(event.clientX, event.clientY);
    const posX = Math.max(0, Math.min(floorPlan.width - 5, current.originX + (point.x - current.startX)));
    const posY = Math.max(0, Math.min(floorPlan.height - 5, current.originY + (point.y - current.startY)));
    if (current.target.kind === "table") {
      const table = floorPlan.tables.find((row) => row.id === current.target.id);
      if (table !== undefined) {
        await patchVenueTable(table.id, { posX, posY });
      }
    } else {
      const element = floorPlan.elements.find((row) => row.id === current.target.id);
      if (element !== undefined) {
        await saveFloorElement({
          id: element.id,
          floorPlanId: element.floorPlanId,
          kind: element.kind,
          label: element.label,
          posX,
          posY,
          width: element.width,
          height: element.height,
          rotation: element.rotation,
          sort: element.sort,
        });
      }
    }
    onChange();
  };

  const startDrag = (target: DragTarget, event: PointerEvent, originX: number, originY: number) => {
    const point = toPlanCoords(event.clientX, event.clientY);
    drag = { target, startX: point.x, startY: point.y, originX, originY };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  for (const tableEl of canvas.querySelectorAll("[data-table-id]")) {
    tableEl.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent)) {
        return;
      }
      const id = tableEl.getAttribute("data-table-id");
      const table = floorPlan.tables.find((row) => row.id === id);
      if (id === null || table === undefined) {
        return;
      }
      event.preventDefault();
      startDrag({ kind: "table", id }, event, table.posX, table.posY);
    });
  }

  for (const elementEl of canvas.querySelectorAll("[data-element-id]")) {
    elementEl.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent)) {
        return;
      }
      const id = elementEl.getAttribute("data-element-id");
      const element = floorPlan.elements.find((row) => row.id === id);
      if (id === null || element === undefined) {
        return;
      }
      event.preventDefault();
      startDrag({ kind: "element", id }, event, element.posX, element.posY);
    });
  }

  for (const button of host.querySelectorAll("[data-add-element]")) {
    button.addEventListener("click", () => {
      const kind = button.getAttribute("data-add-element");
      if (kind === null) {
        return;
      }
      void saveFloorElement({
        floorPlanId: floorPlan.id,
        kind,
        label: kindLabel(kind),
        posX: 10,
        posY: 10,
        width: kind === "bar" ? 20 : 12,
        height: kind === "bar" ? 8 : 12,
      }).then(() => onChange());
    });
  }

  for (const button of host.querySelectorAll("[data-delete-element]")) {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = button.getAttribute("data-delete-element");
      if (id === null) {
        return;
      }
      void deleteFloorElement(id).then(() => onChange());
    });
  }
};
