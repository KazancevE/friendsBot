import { deleteFloorElement, patchVenueTable, saveFloorElement, type FloorElementView, type FloorPlanView, type VenueTableView } from "./api.ts";
import { escapeHtml } from "./ui-helpers.ts";

type DragTarget =
  | { kind: "table"; id: string }
  | { kind: "element"; id: string };

type ResizeTarget = DragTarget;

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

const elementHtml = (element: FloorElementView, scale: number) =>
  `<div class="floor-item floor-item--${escapeHtml(element.kind)}" data-element-id="${element.id}" style="left:${element.posX * scale}px;top:${element.posY * scale}px;width:${element.width * scale}px;height:${element.height * scale}px;transform:rotate(${element.rotation}deg)">
    <span>${escapeHtml(kindLabel(element.kind))}</span>
    <button type="button" class="floor-delete" data-delete-element="${element.id}">×</button>
    <span class="floor-resize-handle" data-resize-element="${element.id}"></span>
  </div>`;

const tableHtml = (table: VenueTableView, scale: number) =>
  `<div class="floor-table ${table.active ? "" : "floor-table--inactive"}" data-table-id="${table.id}" style="left:${table.posX * scale}px;top:${table.posY * scale}px;width:${table.width * scale}px;height:${table.height * scale}px;transform:rotate(${table.rotation}deg)">
    <strong>${escapeHtml(table.label)}</strong>
    <small>${table.seatsMin}-${table.seatsMax}</small>
    <span class="floor-resize-handle" data-resize-table="${table.id}"></span>
  </div>`;

export type FloorEditorCallbacks = {
  onStructureChange?: () => void;
};

export const mountFloorEditor = (
  host: HTMLElement,
  floorPlan: FloorPlanView,
  callbacks: FloorEditorCallbacks = {},
) => {
  const scale = Math.min(1, 640 / floorPlan.width);
  const width = floorPlan.width * scale;
  const height = floorPlan.height * scale;

  host.innerHTML = `
    <div class="floor-toolbar">
      <button type="button" class="action" data-add-element="bar">+ Бар</button>
      <button type="button" class="action" data-add-element="obstacle">+ Препятствие</button>
      <button type="button" class="action" data-add-element="wall">+ Стена</button>
      <span class="muted">Перетащите или измените размер</span>
      <div class="floor-size-panel hidden" data-size-panel>
        <label>Ш<input type="number" data-size-w min="4" max="100" step="1" /></label>
        <label>В<input type="number" data-size-h min="4" max="100" step="1" /></label>
        <button type="button" class="action" data-apply-size>Применить</button>
      </div>
    </div>
    <div class="floor-canvas-wrap">
      <div class="floor-canvas" data-floor-canvas style="width:${width}px;height:${height}px">
        ${floorPlan.elements.map((element) => elementHtml(element, scale)).join("")}
        ${floorPlan.tables.map((table) => tableHtml(table, scale)).join("")}
      </div>
    </div>
  `;

  const canvas = host.querySelector("[data-floor-canvas]");
  const sizePanel = host.querySelector("[data-size-panel]");
  if (!(canvas instanceof HTMLElement) || !(sizePanel instanceof HTMLElement)) {
    return;
  }

  let selected: DragTarget | null = null;
  let drag: { target: DragTarget; startX: number; startY: number; originX: number; originY: number } | null = null;
  let resize: {
    target: ResizeTarget;
    startX: number;
    startY: number;
    originW: number;
    originH: number;
  } | null = null;

  const toPlanCoords = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    };
  };

  const findEl = (target: DragTarget) =>
    target.kind === "table"
      ? canvas.querySelector(`[data-table-id="${target.id}"]`)
      : canvas.querySelector(`[data-element-id="${target.id}"]`);

  const selectTarget = (target: DragTarget | null) => {
    selected = target;
    for (const node of canvas.querySelectorAll(".floor-selected")) {
      node.classList.remove("floor-selected");
    }
    if (target === null) {
      sizePanel.classList.add("hidden");
      return;
    }
    const el = findEl(target);
    if (el instanceof HTMLElement) {
      el.classList.add("floor-selected");
    }
    const wInput = sizePanel.querySelector("[data-size-w]");
    const hInput = sizePanel.querySelector("[data-size-h]");
    if (!(wInput instanceof HTMLInputElement) || !(hInput instanceof HTMLInputElement)) {
      return;
    }
    if (target.kind === "table") {
      const table = floorPlan.tables.find((row) => row.id === target.id);
      if (table === undefined) {
        return;
      }
      wInput.value = String(table.width);
      hInput.value = String(table.height);
    } else {
      const element = floorPlan.elements.find((row) => row.id === target.id);
      if (element === undefined) {
        return;
      }
      wInput.value = String(element.width);
      hInput.value = String(element.height);
    }
    sizePanel.classList.remove("hidden");
  };

  const applySize = async (widthValue: number, heightValue: number) => {
    if (selected === null) {
      return;
    }
    const w = Math.max(4, Math.min(floorPlan.width, widthValue));
    const h = Math.max(4, Math.min(floorPlan.height, heightValue));
    if (selected.kind === "table") {
      const table = floorPlan.tables.find((row) => row.id === selected!.id);
      if (table === undefined) {
        return;
      }
      table.width = w;
      table.height = h;
      const el = findEl(selected);
      if (el instanceof HTMLElement) {
        el.style.width = `${w * scale}px`;
        el.style.height = `${h * scale}px`;
      }
      await patchVenueTable(table.id, { width: w, height: h });
    } else {
      const element = floorPlan.elements.find((row) => row.id === selected!.id);
      if (element === undefined) {
        return;
      }
      element.width = w;
      element.height = h;
      const el = findEl(selected);
      if (el instanceof HTMLElement) {
        el.style.width = `${w * scale}px`;
        el.style.height = `${h * scale}px`;
      }
      await saveFloorElement({
        id: element.id,
        floorPlanId: element.floorPlanId,
        kind: element.kind,
        label: element.label,
        posX: element.posX,
        posY: element.posY,
        width: w,
        height: h,
        rotation: element.rotation,
        sort: element.sort,
      });
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (drag !== null) {
      const point = toPlanCoords(event.clientX, event.clientY);
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      const el = findEl(drag.target);
      if (el instanceof HTMLElement) {
        el.style.left = `${(drag.originX + dx) * scale}px`;
        el.style.top = `${(drag.originY + dy) * scale}px`;
      }
      return;
    }
    if (resize !== null) {
      const point = toPlanCoords(event.clientX, event.clientY);
      const dw = point.x - resize.startX;
      const dh = point.y - resize.startY;
      const newW = Math.max(4, resize.originW + dw);
      const newH = Math.max(4, resize.originH + dh);
      const el = findEl(resize.target);
      if (el instanceof HTMLElement) {
        el.style.width = `${newW * scale}px`;
        el.style.height = `${newH * scale}px`;
      }
    }
  };

  const onPointerUp = async (event: PointerEvent) => {
    if (drag !== null) {
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
          table.posX = posX;
          table.posY = posY;
          await patchVenueTable(table.id, { posX, posY });
        }
      } else {
        const element = floorPlan.elements.find((row) => row.id === current.target.id);
        if (element !== undefined) {
          element.posX = posX;
          element.posY = posY;
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
      return;
    }
    if (resize !== null) {
      const current = resize;
      resize = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      const point = toPlanCoords(event.clientX, event.clientY);
      const dw = point.x - current.startX;
      const dh = point.y - current.startY;
      const newW = Math.max(4, Math.min(floorPlan.width, Math.round(current.originW + dw)));
      const newH = Math.max(4, Math.min(floorPlan.height, Math.round(current.originH + dh)));
      await applySize(newW, newH);
      selectTarget(current.target);
    }
  };

  const startDrag = (target: DragTarget, event: PointerEvent, originX: number, originY: number) => {
    selectTarget(target);
    const point = toPlanCoords(event.clientX, event.clientY);
    drag = { target, startX: point.x, startY: point.y, originX, originY };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const startResize = (target: ResizeTarget, event: PointerEvent, originW: number, originH: number) => {
    event.stopPropagation();
    event.preventDefault();
    selectTarget(target);
    const point = toPlanCoords(event.clientX, event.clientY);
    resize = { target, startX: point.x, startY: point.y, originW, originH };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const bindDeleteButtons = () => {
    for (const button of host.querySelectorAll("[data-delete-element]")) {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = button.getAttribute("data-delete-element");
        if (id === null) {
          return;
        }
        void deleteFloorElement(id).then((result) => {
          if (result.kind !== "ok") {
            return;
          }
          floorPlan.elements = floorPlan.elements.filter((row) => row.id !== id);
          canvas.querySelector(`[data-element-id="${id}"]`)?.remove();
          if (selected?.kind === "element" && selected.id === id) {
            selectTarget(null);
          }
        });
      });
    }
  };

  for (const tableEl of canvas.querySelectorAll("[data-table-id]")) {
    tableEl.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent) || (event.target as Element).closest(".floor-resize-handle")) {
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
      if (!(event instanceof PointerEvent) || (event.target as Element).closest(".floor-delete, .floor-resize-handle")) {
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

  for (const handle of canvas.querySelectorAll("[data-resize-table]")) {
    handle.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent)) {
        return;
      }
      const id = handle.getAttribute("data-resize-table");
      const table = floorPlan.tables.find((row) => row.id === id);
      if (id === null || table === undefined) {
        return;
      }
      startResize({ kind: "table", id }, event, table.width, table.height);
    });
  }

  for (const handle of canvas.querySelectorAll("[data-resize-element]")) {
    handle.addEventListener("pointerdown", (event) => {
      if (!(event instanceof PointerEvent)) {
        return;
      }
      const id = handle.getAttribute("data-resize-element");
      const element = floorPlan.elements.find((row) => row.id === id);
      if (id === null || element === undefined) {
        return;
      }
      startResize({ kind: "element", id }, event, element.width, element.height);
    });
  }

  bindDeleteButtons();

  sizePanel.querySelector("[data-apply-size]")?.addEventListener("click", () => {
    const wInput = sizePanel.querySelector("[data-size-w]");
    const hInput = sizePanel.querySelector("[data-size-h]");
    if (!(wInput instanceof HTMLInputElement) || !(hInput instanceof HTMLInputElement)) {
      return;
    }
    void applySize(Number(wInput.value), Number(hInput.value));
  });

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
      }).then((result) => {
        if (result.kind !== "ok" || result.data === null) {
          return;
        }
        floorPlan.elements.push(result.data);
        canvas.insertAdjacentHTML("beforeend", elementHtml(result.data, scale));
        const newEl = canvas.querySelector(`[data-element-id="${result.data.id}"]`);
        if (newEl instanceof HTMLElement) {
          newEl.addEventListener("pointerdown", (event) => {
            if (!(event instanceof PointerEvent) || (event.target as Element).closest(".floor-delete, .floor-resize-handle")) {
              return;
            }
            event.preventDefault();
            startDrag({ kind: "element", id: result.data!.id }, event, result.data!.posX, result.data!.posY);
          });
          const handle = newEl.querySelector("[data-resize-element]");
          handle?.addEventListener("pointerdown", (event) => {
            if (!(event instanceof PointerEvent)) {
              return;
            }
            startResize({ kind: "element", id: result.data!.id }, event, result.data!.width, result.data!.height);
          });
        }
        bindDeleteButtons();
        callbacks.onStructureChange?.();
      });
    });
  }
};
