(() => {
  const VIEWPORT_PRESETS = {
    desktop: { name: "Desktop", width: 1200, height: 760 },
    iphone16pro: { name: "iPhone 16 Pro", width: 402, height: 874 },
    tablet: { name: "Tablet", width: 820, height: 1180 }
  };
  const STORAGE_KEY = "forma-editor-project-v1";
  const artboard = document.getElementById("artboard");
  const layerList = document.getElementById("layerList");
  const emptyState = document.getElementById("emptyState");
  const inspectorEmpty = document.getElementById("inspectorEmpty");
  const propertyEditor = document.getElementById("propertyEditor");
  const toast = document.getElementById("toast");
  const appShell = document.getElementById("appShell");

  const project = loadProject();
  let elements = project.elements;
  let ARTBOARD_WIDTH = project.viewport.width;
  let ARTBOARD_HEIGHT = project.viewport.height;
  let viewportName = project.viewport.name;
  let selectedId = null;
  let selectedIds = [];
  let nextId = maxElementId(elements) + 1;
  let zoom = 1;
  let toastTimer;
  let suppressNextClick = false;
  let activeDropTarget = null;

  function loadProject() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved)) return { elements: normalizeElements(saved), viewport: { ...VIEWPORT_PRESETS.desktop } };
      const rawElements = Array.isArray(saved?.elements) ? saved.elements : [];
      const rawViewport = saved?.viewport || VIEWPORT_PRESETS.desktop;
      const width = clamp(Number(rawViewport.width) || 1200, 160, 2400);
      const height = clamp(Number(rawViewport.height) || 760, 160, 2400);
      const preset = Object.values(VIEWPORT_PRESETS).find(item => item.width === width && item.height === height);
      const name = rawViewport.name === "Custom size" ? "Custom size" : preset?.name || "Custom size";
      return {
        elements: normalizeElements(rawElements),
        viewport: { width, height, name }
      };
    } catch (error) {
      console.error("Could not load the saved Forma project.", error);
      return { elements: [], viewport: { ...VIEWPORT_PRESETS.desktop } };
    }
  }

  function findHtmlId(id, list = elements) {
    for (const item of list) {
      if (item.htmlId === id) return item;
      const match = findHtmlId(id, item.children || []);
      if (match) return match;
    }
    return null;
  }

  function normalizeElements(items) {
    return items.map(item => ({
      ...item,
      htmlId: typeof item.htmlId === "string" ? item.htmlId : "",
      autoSize: Boolean(item.autoSize),
      borderColor: item.borderColor || "#20222a",
      borderWidth: Number(item.borderWidth) || 0,
      borderStyle: item.borderStyle || "solid",
      shadowColor: /^#[0-9a-f]{6}$/i.test(item.shadowColor || "") ? item.shadowColor : "#000000",
      shadowBlur: Math.max(0, Number(item.shadowBlur) || 0),
      shadowOpacity: clamp(Number(item.shadowOpacity) || 0, 0, 100),
      shadowX: Number(item.shadowX) || 0,
      shadowY: Number(item.shadowY) || 0,
      overflow: ["visible", "hidden", "auto", "scroll", "auto-x", "auto-y"].includes(item.overflow) ? item.overflow : "visible",
      direction: item.direction === "column" ? "column" : "row",
      children: normalizeElements(Array.isArray(item.children) ? item.children : [])
    }));
  }

  function maxElementId(items) {
    return items.reduce((highest, item) => Math.max(highest, Number(item.id) || 0, maxElementId(item.children || [])), 0);
  }

  function saveProject() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        elements,
        viewport: { name: viewportName, width: ARTBOARD_WIDTH, height: ARTBOARD_HEIGHT }
      }));
      document.querySelector(".save-status").innerHTML = "<i></i> Saved locally";
      document.querySelector(".canvas-footer > span:first-child").innerHTML = '<span class="footer-status"></span> All changes saved';
    } catch (error) {
      console.error("Could not save the Forma project.", error);
      showToast("Could not save this design in your browser.");
    }
  }

  function createElement(type, parentId = null) {
    const siblings = parentId ? findElement(parentId)?.children || [] : elements;
    const index = siblings.length;
    const defaults = {
      id: String(nextId++),
      htmlId: "",
      type,
      name: type === "container" ? "Layout container" : type === "circle" ? "Circle" : "Rectangle",
      x: parentId ? 0 : Math.min(90 + index * 36, 450),
      y: parentId ? 0 : Math.min(95 + index * 32, 380),
      width: type === "container" ? 360 : type === "circle" ? 120 : 220,
      height: type === "container" ? 220 : type === "circle" ? 120 : 150,
      fill: type === "container" ? "#f8f6ff" : type === "circle" ? "#bce9de" : "#8e7bea",
      radius: type === "circle" ? 100 : type === "container" ? 12 : 12,
      borderColor: "#20222a",
      borderWidth: 0,
      borderStyle: "solid",
      shadowColor: "#000000",
      shadowBlur: 0,
      shadowOpacity: 0,
      shadowX: 0,
      shadowY: 0,
      overflow: "visible",
      autoSize: false,
      layout: "flex",
      direction: "row",
      gap: 12,
      padding: 16,
      columns: 2,
      children: []
    };
    if (parentId) {
      const parent = findElement(parentId);
      if (parent && parent.type === "container") parent.children.push(defaults);
    } else {
      elements.push(defaults);
    }
    selectedId = defaults.id;
    selectedIds = [defaults.id];
    render();
    return defaults;
  }

  function findElement(id, list = elements, parent = null) {
    for (const item of list) {
      if (item.id === id) return item;
      const match = findElement(id, item.children || [], item);
      if (match) return match;
    }
    return null;
  }

  function findParent(id, list = elements, parent = null) {
    for (const item of list) {
      if ((item.children || []).some(child => child.id === id)) return item;
      const match = findParent(id, item.children || [], item);
      if (match) return match;
    }
    return null;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function renderElement(item, parentIsFlow = false) {
    const node = document.createElement("div");
    node.className = `design-element ${item.type}-element${item.children?.length ? " has-children" : ""}${item.type === "container" && !item.children?.length ? " empty-container" : ""}`;
    node.dataset.id = item.id;
    node.setAttribute("aria-label", item.name);
    applyElementStyles(node, item, parentIsFlow);
    if (item.type === "container") {
      node.classList.toggle("container-element", true);
    }
    if (selectedIds.includes(item.id)) node.classList.add("selected-canvas-element");
    node.addEventListener("pointerdown", event => {
      event.stopPropagation();
      if (event.button !== 0 || appShell.classList.contains("preview-mode")) return;
      const handle = event.target.closest(".resize-handle");
      if (handle) {
        beginResize(event, item, node, handle.dataset.handle, parentIsFlow);
        return;
      }
      if (event.shiftKey) {
        suppressNextClick = true;
        toggleSelection(item.id);
        return;
      }
      if (event.ctrlKey || event.metaKey) {
        duplicateElement(item.id, 0, 0, event, parentIsFlow);
        return;
      }
      if (!selectedIds.includes(item.id)) selectElement(item.id, false);
      if (parentIsFlow) {
        selectElement(item.id, false);
        beginNestedDrag(event, item, node);
      }
      else beginDrag(event, node);
    });
    node.addEventListener("click", event => {
      event.stopPropagation();
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (event.shiftKey) toggleSelection(item.id);
      else if (!selectedIds.includes(item.id)) selectElement(item.id);
    });
    for (const direction of ["n", "ne", "e", "se", "s", "sw", "w", "nw"]) {
      const handle = document.createElement("span");
      handle.className = `resize-handle resize-${direction}`;
      handle.dataset.handle = direction;
      handle.setAttribute("aria-hidden", "true");
      node.appendChild(handle);
    }
    if (item.type === "container") {
      for (const child of item.children || []) node.appendChild(renderElement(child, true));
    }
    return node;
  }

  function applyElementStyles(node, item, parentIsFlow = false) {
    node.style.width = `${item.width}px`;
    node.style.height = `${item.height}px`;
    node.style.backgroundColor = item.fill;
    node.style.borderRadius = `${item.radius}px`;
    node.style.border = `${item.borderWidth || 0}px ${item.borderStyle || "solid"} ${item.borderColor || "#20222a"}`;
    node.style.boxShadow = item.shadowOpacity > 0
      ? `${item.shadowX || 0}px ${item.shadowY || 0}px ${item.shadowBlur || 0}px ${hexToRgba(item.shadowColor, item.shadowOpacity / 100)}`
      : "none";
    node.style.outline = item.type === "container" && !item.children?.length && !item.borderWidth ? "1px dashed #b4a8e9" : "";
    node.style.position = parentIsFlow ? "relative" : "absolute";
    if (!parentIsFlow) {
      node.style.left = `${item.x}px`;
      node.style.top = `${item.y}px`;
    } else {
      node.style.flex = "0 0 auto";
    }
    if (item.type === "container") {
      node.classList.toggle("auto-size", Boolean(item.autoSize));
      node.style.display = item.layout === "grid" ? "grid" : item.layout === "flex" ? "flex" : "block";
      node.style.gap = `${item.gap}px`;
      node.style.padding = `${item.padding}px`;
      node.style.boxSizing = "border-box";
      node.style.overflow = item.overflow === "auto-x" || item.overflow === "auto-y" ? "hidden" : item.overflow;
      node.style.overflowX = item.overflow === "auto-x" ? "auto" : item.overflow === "auto-y" ? "hidden" : "";
      node.style.overflowY = item.overflow === "auto-y" ? "auto" : item.overflow === "auto-x" ? "hidden" : "";
      if (item.layout === "grid") node.style.gridTemplateColumns = `repeat(${item.columns}, minmax(0, 1fr))`;
      else if (item.layout === "flex") node.style.flexDirection = item.direction;
      else node.style.position = "relative";
      node.style.alignItems = item.layout === "flex" ? "flex-start" : "stretch";
    }

  }

  function hexToRgba(hex, opacity) {
    const value = /^#[0-9a-f]{6}$/i.test(hex || "") ? hex.slice(1) : "000000";
    const channels = [0, 2, 4].map(index => Number.parseInt(value.slice(index, index + 2), 16));
    return `rgba(${channels.join(", ")}, ${clamp(opacity, 0, 1)})`;
  }

  function recalculateAutoSize(items) {
    for (const item of items) {
      if (item.type !== "container") continue;
      recalculateAutoSize(item.children || []);
      if (!item.autoSize) continue;
      const gap = Number(item.gap) || 0;
      const padding = Number(item.padding) || 0;
      const border = Number(item.borderWidth) || 0;
      if (!item.children.length) {
        item.width = clamp(padding * 2 + border * 2, 24, ARTBOARD_WIDTH);
        item.height = clamp(padding * 2 + border * 2, 24, ARTBOARD_HEIGHT);
        continue;
      }
      let contentWidth;
      let contentHeight;
      if (item.layout === "grid") {
        const columns = clamp(Number(item.columns) || 1, 1, 6);
        const rows = Math.ceil(item.children.length / columns);
        const columnWidths = Array.from({ length: columns }, (_, column) => {
          const widths = item.children.filter((_, index) => index % columns === column).map(child => child.width);
          return widths.length ? Math.max(...widths) : 0;
        });
        const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(...item.children.slice(row * columns, (row + 1) * columns).map(child => child.height)));
        contentWidth = columnWidths.reduce((sum, width) => sum + width, 0) + gap * (columns - 1);
        contentHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gap * (rows - 1);
      } else if (item.direction === "column") {
        contentWidth = Math.max(...item.children.map(child => child.width));
        contentHeight = item.children.reduce((sum, child) => sum + child.height, 0) + gap * (item.children.length - 1);
      } else {
        contentWidth = item.children.reduce((sum, child) => sum + child.width, 0) + gap * (item.children.length - 1);
        contentHeight = Math.max(...item.children.map(child => child.height));
      }
      item.width = clamp(contentWidth + padding * 2 + border * 2, 24, ARTBOARD_WIDTH);
      item.height = clamp(contentHeight + padding * 2 + border * 2, 24, ARTBOARD_HEIGHT);
    }
  }

  function beginDrag(event, node) {
    if (appShell.classList.contains("preview-mode")) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const moving = selectedIds.map(id => findElement(id)).filter(item => item && !findParent(item.id));
    if (!moving.length) return;
    const initialPositions = new Map(moving.map(item => [item.id, { x: item.x, y: item.y }]));
    const scale = getCanvasScale();
    let moved = false;
    node.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const deltaX = Math.round((moveEvent.clientX - startX) / scale);
      const deltaY = Math.round((moveEvent.clientY - startY) / scale);
      if (deltaX || deltaY) moved = true;
      const minX = Math.max(...moving.map(item => -initialPositions.get(item.id).x));
      const maxX = Math.min(...moving.map(item => ARTBOARD_WIDTH - item.width - initialPositions.get(item.id).x));
      const minY = Math.max(...moving.map(item => -initialPositions.get(item.id).y));
      const maxY = Math.min(...moving.map(item => ARTBOARD_HEIGHT - item.height - initialPositions.get(item.id).y));
      const boundedX = clamp(deltaX, minX, maxX);
      const boundedY = clamp(deltaY, minY, maxY);
      for (const item of moving) {
        const initial = initialPositions.get(item.id);
        item.x = initial.x + boundedX;
        item.y = initial.y + boundedY;
        const elementNode = artboard.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
        if (elementNode) applyElementStyles(elementNode, item);
        updatePositionFields(item);
      }

      activeDropTarget = findDropTarget(moveEvent.clientX, moveEvent.clientY, moving.map(item => item.id));
      artboard.querySelectorAll(".drop-target").forEach(target => target.classList.remove("drop-target"));
      if (activeDropTarget) artboard.querySelector(`[data-id="${CSS.escape(activeDropTarget)}"]`)?.classList.add("drop-target");
    };
    const end = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      artboard.querySelectorAll(".drop-target").forEach(target => target.classList.remove("drop-target"));
      if (activeDropTarget && moving.length === 1) {
        const item = moving[0];
        const target = findElement(activeDropTarget);
        if (target?.type === "container" && !isDescendant(target.id, item)) {
          moveIntoContainer(item, target);
          selectedId = target.id;
          selectedIds = [target.id];
          activeDropTarget = null;
          suppressNextClick = true;
          render();
          return;
        }
      }
      if (moving.some(item => item.type === "container")) {
        const container = moving.find(item => item.type === "container");
        const rect = artboard.querySelector(`[data-id="${CSS.escape(container.id)}"]`)?.getBoundingClientRect();
        if (rect) {
          const siblings = findParent(container.id)?.children || elements;
          const overlapped = siblings.filter(item => item.id !== container.id && !moving.some(movingItem => movingItem.id === item.id)).filter(item => {
            const elementRect = artboard.querySelector(`[data-id="${CSS.escape(item.id)}"]`)?.getBoundingClientRect();
            if (!elementRect) return false;
            const centerX = elementRect.left + elementRect.width / 2;
            const centerY = elementRect.top + elementRect.height / 2;
            return centerX >= rect.left && centerX <= rect.right && centerY >= rect.top && centerY <= rect.bottom;
          });
          overlapped.forEach(item => moveIntoContainer(item, container));
        }
      }
      activeDropTarget = null;
      suppressNextClick = moved || node.dataset.suppressClick === "true";
      saveProject();
      renderLayers();
      updateMultiSelectControls();
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  function duplicateElement(id, offsetX = 12, offsetY = 12, dragEvent = null, parentIsFlow = false) {
    const source = findElement(id);
    if (!source) return;
    const siblings = findParent(id)?.children || elements;
    const sourceIndex = siblings.findIndex(item => item.id === id);
    if (sourceIndex < 0) return;
    const copyTree = item => ({
      ...item,
      id: String(nextId++),
      htmlId: "",
      children: (item.children || []).map(copyTree)
    });
    const copy = copyTree(source);
    copy.x = clamp(source.x + offsetX, 0, ARTBOARD_WIDTH - copy.width);
    copy.y = clamp(source.y + offsetY, 0, ARTBOARD_HEIGHT - copy.height);
    siblings.splice(sourceIndex + 1, 0, copy);
    recalculateAutoSize(elements);
    syncRenderedStyles(elements);
    selectedId = copy.id;
    selectedIds = [copy.id];
    artboard.querySelectorAll(".selected-canvas-element").forEach(node => node.classList.remove("selected-canvas-element"));
    const sourceNode = artboard.querySelector(`[data-id="${CSS.escape(id)}"]`);
    const copyNode = renderElement(copy, parentIsFlow);
    if (dragEvent) copyNode.dataset.suppressClick = "true";
    if (sourceNode?.parentElement) sourceNode.parentElement.insertBefore(copyNode, sourceNode.nextSibling);
    renderLayers();
    updateInspector();
    updateMultiSelectControls();
    saveProject();
    if (dragEvent) {
      if (parentIsFlow) beginNestedDrag(dragEvent, copy, copyNode);
      else beginDrag(dragEvent, copyNode);
    }
    return copy;
  }

  function syncRenderedStyles(items, parentIsFlow = false) {
    for (const item of items) {
      const node = artboard.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
      if (node) applyElementStyles(node, item, parentIsFlow);
      if (item.type === "container") syncRenderedStyles(item.children || [], true);
    }
  }

  function changeLayerOrder(direction) {
    if (!selectedId) return;
    const siblings = findParent(selectedId)?.children || elements;
    const index = siblings.findIndex(item => item.id === selectedId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    [siblings[index], siblings[nextIndex]] = [siblings[nextIndex], siblings[index]];
    render();
  }

  function beginNestedDrag(event, item, node) {
    const originParent = findParent(item.id);
    if (!originParent) return;
    const originRect = artboard.querySelector(`[data-id="${CSS.escape(originParent.id)}"]`)?.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    if (!originRect) return;
    const start = { clientX: event.clientX, clientY: event.clientY, left: nodeRect.left, top: nodeRect.top };
    const boardRect = artboard.getBoundingClientRect();
    const scale = boardRect.width / ARTBOARD_WIDTH;
    let moved = false;
    node.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const dx = moveEvent.clientX - start.clientX;
      const dy = moveEvent.clientY - start.clientY;
      moved ||= Math.abs(dx) + Math.abs(dy) > 2;
      node.style.transform = `translate(${dx / scale}px, ${dy / scale}px)`;
      activeDropTarget = findDropTarget(moveEvent.clientX, moveEvent.clientY, [item.id, originParent.id], [item.id]);
      artboard.querySelectorAll(".drop-target").forEach(target => target.classList.remove("drop-target"));
      if (activeDropTarget) artboard.querySelector(`[data-id="${CSS.escape(activeDropTarget)}"]`)?.classList.add("drop-target");
    };
    const end = endEvent => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      artboard.querySelectorAll(".drop-target").forEach(target => target.classList.remove("drop-target"));
      node.style.transform = "";
      const releasedOutside = endEvent.clientX < originRect.left || endEvent.clientX > originRect.right || endEvent.clientY < originRect.top || endEvent.clientY > originRect.bottom;
      if (moved && activeDropTarget) {
        const target = findElement(activeDropTarget);
        if (target?.type === "container" && moveIntoContainer(item, target)) {
          selectedId = item.id;
          selectedIds = [item.id];
          activeDropTarget = null;
          suppressNextClick = true;
          render();
          return;
        }
      }
      if (moved && releasedOutside) {
        const sourceList = originParent.children;
        const index = sourceList.findIndex(child => child.id === item.id);
        if (index !== -1) {
          sourceList.splice(index, 1);
          const left = (start.left + endEvent.clientX - start.clientX - boardRect.left) / scale;
          const top = (start.top + endEvent.clientY - start.clientY - boardRect.top) / scale;
          item.x = clamp(Math.round(left), 0, ARTBOARD_WIDTH - item.width);
          item.y = clamp(Math.round(top), 0, ARTBOARD_HEIGHT - item.height);
          elements.push(item);
          selectedId = item.id;
          selectedIds = [item.id];
        }
      }
      activeDropTarget = null;
      suppressNextClick = moved || node.dataset.suppressClick === "true";
      render();
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  function beginResize(event, item, node, direction, parentIsFlow) {
    event.preventDefault();
    event.stopPropagation();
    selectElement(item.id, false);
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { x: item.x, y: item.y, width: item.width, height: item.height };
    const scale = getCanvasScale();
    let resized = false;
    node.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const deltaX = Math.round((moveEvent.clientX - startX) / scale);
      const deltaY = Math.round((moveEvent.clientY - startY) / scale);
      const west = direction.includes("w");
      const east = direction.includes("e");
      const north = direction.includes("n");
      const south = direction.includes("s");
      let width = start.width + (east ? deltaX : west ? -deltaX : 0);
      let height = start.height + (south ? deltaY : north ? -deltaY : 0);
      width = clamp(width, 12, parentIsFlow || direction.includes("w") ? (parentIsFlow ? ARTBOARD_WIDTH : start.x + start.width) : ARTBOARD_WIDTH - start.x);
      height = clamp(height, 12, parentIsFlow || direction.includes("n") ? (parentIsFlow ? ARTBOARD_HEIGHT : start.y + start.height) : ARTBOARD_HEIGHT - start.y);
      item.width = width;
      item.height = height;
      if (!parentIsFlow && west) item.x = clamp(start.x + start.width - width, 0, ARTBOARD_WIDTH - width);
      if (!parentIsFlow && north) item.y = clamp(start.y + start.height - height, 0, ARTBOARD_HEIGHT - height);
      resized ||= deltaX !== 0 || deltaY !== 0;
      applyElementStyles(node, item, parentIsFlow);
      updateInspector();
    };
    const end = () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", end);
      node.removeEventListener("pointercancel", end);
      suppressNextClick = resized;
      render();
    };
    node.addEventListener("pointermove", move);
    node.addEventListener("pointerup", end);
    node.addEventListener("pointercancel", end);
  }

  function toggleSelection(id) {
    if (selectedIds.includes(id)) selectedIds = selectedIds.filter(selected => selected !== id);
    else selectedIds = [...selectedIds, id];
    selectedId = selectedIds.includes(selectedId) ? selectedId : selectedIds[selectedIds.length - 1] || null;
    render();
  }

  function startMarquee(event) {
    if (appShell.classList.contains("preview-mode") || event.button !== 0) return;
    const boardRect = artboard.getBoundingClientRect();
    const scale = boardRect.width / ARTBOARD_WIDTH;
    const origin = {
      x: clamp((event.clientX - boardRect.left) / scale, 0, ARTBOARD_WIDTH),
      y: clamp((event.clientY - boardRect.top) / scale, 0, ARTBOARD_HEIGHT)
    };
    const marquee = document.createElement("div");
    marquee.className = "selection-marquee";
    artboard.appendChild(marquee);
    artboard.setPointerCapture(event.pointerId);
    let didMove = false;
    const update = moveEvent => {
      const point = {
        x: clamp((moveEvent.clientX - boardRect.left) / scale, 0, ARTBOARD_WIDTH),
        y: clamp((moveEvent.clientY - boardRect.top) / scale, 0, ARTBOARD_HEIGHT)
      };
      const left = Math.min(origin.x, point.x);
      const top = Math.min(origin.y, point.y);
      const width = Math.abs(origin.x - point.x);
      const height = Math.abs(origin.y - point.y);
      didMove ||= width > 2 || height > 2;
      marquee.style.left = `${left}px`;
      marquee.style.top = `${top}px`;
      marquee.style.width = `${width}px`;
      marquee.style.height = `${height}px`;
    };
    const end = () => {
      artboard.removeEventListener("pointermove", update);
      artboard.removeEventListener("pointerup", end);
      artboard.removeEventListener("pointercancel", end);
      const selected = didMove ? elements.filter(item => {
        const left = Number.parseFloat(marquee.style.left);
        const top = Number.parseFloat(marquee.style.top);
        const right = left + Number.parseFloat(marquee.style.width);
        const bottom = top + Number.parseFloat(marquee.style.height);
        return item.x < right && item.x + item.width > left && item.y < bottom && item.y + item.height > top;
      }).map(item => item.id) : [];
      marquee.remove();
      selectedIds = event.shiftKey ? [...new Set([...selectedIds, ...selected])] : selected;
      selectedId = selectedIds[selectedIds.length - 1] || null;
      render();
    };
    artboard.addEventListener("pointermove", update);
    artboard.addEventListener("pointerup", end);
    artboard.addEventListener("pointercancel", end);
  }

  function findDropTarget(clientX, clientY, excludedIds, movingIds = excludedIds) {
    const candidates = [...artboard.querySelectorAll(".container-element")].reverse();
    const target = candidates.find(node => {
      const id = node.dataset.id;
      if (excludedIds.includes(id) || movingIds.some(sourceId => isDescendant(id, findElement(sourceId)))) return false;
      const rect = node.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
    return target?.dataset.id || null;
  }

  function isDescendant(id, item) {
    if (!item) return false;
    return (item.children || []).some(child => child.id === id || isDescendant(id, child));
  }

  function moveIntoContainer(item, container) {
    const sourceParent = findParent(item.id);
    const sourceList = sourceParent ? sourceParent.children : elements;
    const index = sourceList.findIndex(child => child.id === item.id);
    if (index === -1 || item.id === container.id || isDescendant(container.id, item)) return false;
    sourceList.splice(index, 1);
    container.children.push(item);
    item.x = 0;
    item.y = 0;
    recalculateAutoSize(elements);
    return true;
  }

  function groupSelection() {
    const selected = selectedIds.map(id => findElement(id)).filter(Boolean);
    if (selected.length < 2) return;
    const parents = new Set(selected.map(item => findParent(item.id)?.id || null));
    if (parents.size !== 1) {
      showToast("Select layers from the same parent to group them.");
      return;
    }
    const layoutChoice = document.getElementById("groupLayoutInput").value;
    const isFlowChild = Boolean(findParent(selected[0].id));
    const sorted = [...selected].sort((a, b) => layoutChoice === "flex-column" ? a.y - b.y || a.x - b.x : a.x - b.x || a.y - b.y);
    const left = isFlowChild ? 0 : Math.min(...selected.map(item => item.x));
    const top = isFlowChild ? 0 : Math.min(...selected.map(item => item.y));
    const horizontal = layoutChoice === "flex-row";
    const vertical = layoutChoice === "flex-column";
    const gap = 12;
    const padding = 12;
    const columns = Math.max(1, Math.ceil(Math.sqrt(selected.length)));
    const rows = Math.ceil(sorted.length / columns);
    const columnWidths = Array.from({ length: columns }, (_, column) =>
      Math.max(...sorted.filter((_, index) => index % columns === column).map(item => item.width))
    );
    const rowHeights = Array.from({ length: rows }, (_, row) =>
      Math.max(...sorted.slice(row * columns, (row + 1) * columns).map(item => item.height))
    );
    const contentWidth = horizontal
      ? sorted.reduce((sum, item) => sum + item.width, 0) + gap * (sorted.length - 1)
      : layoutChoice === "grid"
        ? columnWidths.reduce((sum, width) => sum + width, 0) + gap * (columns - 1)
        : Math.max(...sorted.map(item => item.width));
    const contentHeight = vertical
      ? sorted.reduce((sum, item) => sum + item.height, 0) + gap * (sorted.length - 1)
      : layoutChoice === "grid"
        ? rowHeights.reduce((sum, height) => sum + height, 0) + gap * (rows - 1)
        : Math.max(...sorted.map(item => item.height));
    const right = isFlowChild ? contentWidth : Math.max(...selected.map(item => item.x + item.width)) - left;
    const bottom = isFlowChild ? contentHeight : Math.max(...selected.map(item => item.y + item.height)) - top;
    const list = findParent(selected[0].id)?.children || elements;
    const firstIndex = Math.min(...selected.map(item => list.indexOf(item)));
    const chosen = new Set(selected.map(item => item.id));
    const container = {
      id: String(nextId++),
      type: "container",
      name: "Layout container",
      x: left,
      y: top,
      width: clamp(Math.max(right, contentWidth) + padding * 2, 24, ARTBOARD_WIDTH),
      height: clamp(Math.max(bottom, contentHeight) + padding * 2, 24, ARTBOARD_HEIGHT),
      fill: "#f8f6ff",
      radius: 12,
      borderColor: "#20222a",
      borderWidth: 0,
      borderStyle: "solid",
      layout: layoutChoice === "grid" ? "grid" : "flex",
      direction: vertical ? "column" : "row",
      gap,
      padding,
      columns,
      children: sorted
    };
    for (let index = list.length - 1; index >= 0; index--) {
      if (chosen.has(list[index].id)) list.splice(index, 1);
    }
    list.splice(Math.min(firstIndex, list.length), 0, container);
    selectedId = container.id;
    selectedIds = [container.id];
    render();
    showToast("Selection grouped in a layout container");
  }

  function getCanvasScale() {
    return artboard.getBoundingClientRect().width / ARTBOARD_WIDTH || 1;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function renderLayers() {
    layerList.replaceChildren();
    const total = countElements(elements);
    document.getElementById("layerCount").textContent = total;
    if (!elements.length) {
      const empty = document.createElement("p");
      empty.className = "layers-empty";
      empty.textContent = "Your layers will show up here as you build.";
      layerList.appendChild(empty);
      return;
    }
    const appendRows = (items, depth = 0) => {
      for (const item of items) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = `layer-row${selectedIds.includes(item.id) ? " active" : ""}${depth ? " child" : ""}`;
        row.setAttribute("role", "treeitem");
        row.setAttribute("aria-selected", String(selectedIds.includes(item.id)));
        row.style.paddingLeft = `${8 + depth * 14}px`;
        const symbol = document.createElement("span");
        symbol.className = `layer-symbol ${item.type}`;
        const name = document.createElement("span");
        name.className = "layer-name";
        name.textContent = item.name;
        const kind = document.createElement("span");
        kind.className = "layer-kind";
        kind.textContent = item.type === "container" ? item.layout : item.type;
        row.append(symbol, name, kind);
        row.addEventListener("click", event => selectElement(item.id, true, event.shiftKey));
        layerList.appendChild(row);
        if (item.children?.length) appendRows(item.children, depth + 1);
      }
    };
    appendRows(elements);
  };

  function countElements(items) {
    return items.reduce((count, item) => count + 1 + countElements(item.children || []), 0);
  }

  function render() {
    for (const child of [...artboard.children]) {
      if (child !== emptyState) child.remove();
    }
    recalculateAutoSize(elements);
    artboard.style.width = `${ARTBOARD_WIDTH}px`;
    artboard.style.height = `${ARTBOARD_HEIGHT}px`;
    emptyState.hidden = elements.length > 0;
    for (const item of elements) artboard.appendChild(renderElement(item));
    renderLayers();
    updateInspector();
    updateMultiSelectControls();
    saveProject();
  }

  function selectElement(id, shouldRender = true, additive = false) {
    if (additive) {
      toggleSelection(id);
      return;
    }
    selectedId = id;
    selectedIds = id ? [id] : [];
    if (shouldRender) render();
    else {
      renderLayers();
      updateInspector();
      updateMultiSelectControls();
      artboard.querySelectorAll(".selected-canvas-element").forEach(node => node.classList.remove("selected-canvas-element"));
      selectedIds.forEach(selected => artboard.querySelector(`[data-id="${CSS.escape(selected)}"]`)?.classList.add("selected-canvas-element"));
    }
  }

  function updateMultiSelectControls() {
    const selected = selectedIds.map(id => findElement(id)).filter(Boolean);
    const eligible = selected.length > 1 && new Set(selected.map(item => findParent(item.id)?.id || null)).size === 1;
    const controls = document.getElementById("multiSelectControls");
    controls.hidden = selected.length < 2;
    document.getElementById("multiSelectCount").textContent = `${selected.length} selected`;
    document.getElementById("groupSelectionButton").disabled = !eligible;
    document.getElementById("groupSelectionButton").title = eligible ? "Wrap selected elements in a layout container" : "Select elements from the same parent to group them";
  }

  function updateInspector() {
    const item = selectedId ? findElement(selectedId) : null;
    inspectorEmpty.hidden = Boolean(item);
    propertyEditor.hidden = !item;
    document.getElementById("selectionIndicator").classList.toggle("on", Boolean(item));
    if (!item) return;
    const siblings = findParent(item.id)?.children || elements;
    const siblingIndex = siblings.findIndex(sibling => sibling.id === item.id);
    document.getElementById("sendBackwardButton").disabled = siblingIndex <= 0;
    document.getElementById("bringForwardButton").disabled = siblingIndex < 0 || siblingIndex >= siblings.length - 1;
    document.getElementById("layerName").value = item.name;
    const htmlIdField = document.querySelector(".html-id-field");
    htmlIdField.hidden = selectedIds.length > 1;
    document.getElementById("htmlIdInput").value = item.htmlId || "";
    document.getElementById("selectedType").textContent = item.type === "container" ? "Container" : item.type;
    const typeIcon = document.getElementById("selectedTypeIcon");
    typeIcon.className = `selected-type-icon ${item.type}`;
    setInputValue("widthInput", item.width);
    setInputValue("heightInput", item.height);
    setInputValue("xInput", item.x);
    setInputValue("yInput", item.y);
    document.getElementById("fillSection").hidden = false;
    document.getElementById("layoutSection").hidden = item.type !== "container";
    document.getElementById("radiusField").hidden = item.type === "circle";
    const isFlowChild = Boolean(findParent(item.id));
    document.getElementById("xField").hidden = isFlowChild;
    document.getElementById("yField").hidden = isFlowChild;
    document.getElementById("colorInput").value = item.fill;
    document.getElementById("colorSwatch").style.backgroundColor = item.fill;
    document.getElementById("colorPicker").value = item.fill;
    document.getElementById("borderColorInput").value = item.borderColor || "#20222a";
    document.getElementById("borderColorSwatch").style.backgroundColor = item.borderColor || "#20222a";
    document.getElementById("borderColorPicker").value = item.borderColor || "#20222a";
    setInputValue("borderWidthInput", item.borderWidth || 0);
    document.getElementById("borderStyleInput").value = item.borderStyle || "solid";
    document.getElementById("shadowColorInput").value = item.shadowColor;
    document.getElementById("shadowColorSwatch").style.backgroundColor = item.shadowColor;
    document.getElementById("shadowColorPicker").value = item.shadowColor;
    setInputValue("shadowBlurInput", item.shadowBlur);
    setInputValue("shadowOpacityInput", item.shadowOpacity);
    setInputValue("shadowXInput", item.shadowX);
    setInputValue("shadowYInput", item.shadowY);
    document.getElementById("radiusInput").value = item.radius;
    document.getElementById("radiusValue").textContent = item.radius;
    document.getElementById("layoutInput").value = item.layout;
    document.getElementById("autoSizeInput").checked = Boolean(item.autoSize);
    document.getElementById("widthInput").disabled = item.type === "container" && item.autoSize;
    document.getElementById("heightInput").disabled = item.type === "container" && item.autoSize;
    document.getElementById("directionInput").value = item.direction;
    document.getElementById("gapInput").value = item.gap;
    document.getElementById("paddingInput").value = item.padding;
    document.getElementById("columnsInput").value = item.columns;
    document.getElementById("overflowInput").value = item.overflow;
    document.getElementById("directionField").hidden = item.layout !== "flex";
    document.getElementById("columnsField").hidden = item.layout !== "grid";
    document.getElementById("overflowInput").closest(".field").hidden = item.type !== "container";
  }

  function setInputValue(id, value) {
    document.getElementById(id).value = value;
  }

  function updatePositionFields(item) {
    if (item.id !== selectedId) return;
    setInputValue("xInput", item.x);
    setInputValue("yInput", item.y);
  }

  function updateSelected(property, value, shouldRender = true) {
    const item = selectedId ? findElement(selectedId) : null;
    if (!item) return;
    if (property === "name") item.name = value.trim() || item.name;
    else if (property === "fill") {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      item.fill = value.toLowerCase();
    } else if (property === "layout") {
      item.layout = value;
    } else if (property === "direction") {
      item.direction = value === "column" ? "column" : "row";
    } else if (property === "overflow") {
      if (!["visible", "hidden", "auto", "scroll", "auto-x", "auto-y"].includes(value)) return;
      item.overflow = value;
    } else if (property === "borderColor") {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      item.borderColor = value.toLowerCase();
    } else if (property === "shadowColor") {
      if (!/^#[0-9a-f]{6}$/i.test(value)) return;
      item.shadowColor = value.toLowerCase();
    } else if (property === "borderStyle") {
      item.borderStyle = value;
    } else if (property === "htmlId") {
      const htmlId = value.trim();
      if (htmlId && findHtmlId(htmlId) && findHtmlId(htmlId) !== item) {
        showToast("Each HTML id must be unique.");
        updateInspector();
        return;
      }
      item.htmlId = htmlId;
    } else if (property === "autoSize") {
      item.autoSize = Boolean(value);
      if (item.autoSize) recalculateAutoSize([item]);
    } else {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return;
      const constraints = {
        width: [1, ARTBOARD_WIDTH],
        height: [1, ARTBOARD_HEIGHT],
        x: [0, ARTBOARD_WIDTH - item.width],
        y: [0, ARTBOARD_HEIGHT - item.height],
        radius: [0, 100],
        borderWidth: [0, 40],
        gap: [0, 100],
        padding: [0, 100],
        columns: [1, 6],
        shadowBlur: [0, 100],
        shadowOpacity: [0, 100],
        shadowX: [-100, 100],
        shadowY: [-100, 100]
      };
      const bounds = constraints[property];
      item[property] = bounds ? clamp(Math.round(parsed), bounds[0], bounds[1]) : Math.round(parsed);
      if (property === "width") item.x = Math.min(item.x, ARTBOARD_WIDTH - item.width);
      if (property === "height") item.y = Math.min(item.y, ARTBOARD_HEIGHT - item.height);
    }
    if (shouldRender) render();
    else {
      const node = artboard.querySelector(`[data-id="${CSS.escape(item.id)}"]`);
      if (node) applyElementStyles(node, item, Boolean(findParent(item.id)));
      updateInspector();
      saveProject();
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2200);
  }

  function deleteSelected() {
    if (!selectedId) return;
    const removeIds = new Set(selectedIds.length ? selectedIds : [selectedId]);
    const removeMatching = list => {
      for (let index = list.length - 1; index >= 0; index--) {
        if (removeIds.has(list[index].id)) list.splice(index, 1);
        else removeMatching(list[index].children || []);
      }
    };
    removeMatching(elements);
    selectedId = null;
    selectedIds = [];
    render();
  }

  function elementStyles(item, nested) {
    const styles = [
      `width:${item.width}px`,
      `height:${item.height}px`,
      `background:${item.fill}`,
      `border-radius:${item.radius}px`,
      `border:${item.borderWidth || 0}px ${item.borderStyle || "solid"} ${item.borderColor || "#20222a"}`,
      `box-shadow:${item.shadowOpacity > 0 ? `${item.shadowX || 0}px ${item.shadowY || 0}px ${item.shadowBlur || 0}px ${hexToRgba(item.shadowColor, item.shadowOpacity / 100)}` : "none"}`
    ];
    if (!nested) styles.push(`position:absolute`, `left:${item.x}px`, `top:${item.y}px`);
    if (item.type === "container") {
      styles.push(`display:${item.layout}`);
      styles.push(`gap:${item.gap}px`, `padding:${item.padding}px`);
      if (item.layout === "flex") styles.push(`flex-direction:${item.direction}`, "align-items:flex-start");
      else styles.push(`grid-template-columns:repeat(${item.columns},minmax(0,1fr))`, "align-items:start");
      if (item.overflow === "auto-x") styles.push("overflow:hidden", "overflow-x:auto");
      else if (item.overflow === "auto-y") styles.push("overflow:hidden", "overflow-y:auto");
      else styles.push(`overflow:${item.overflow || "visible"}`);
    } else if (nested) {
      styles.push("flex:0 0 auto");
    }
    return styles.join("; ");
  }

  function serializeElement(item, nested = false) {
    const children = item.children?.length
      ? `\n${item.children.map(child => `    ${serializeElement(child, true).replace(/\n/g, "\n    ")}`).join("\n")}\n  `
      : "";
    const idAttribute = item.htmlId ? ` id="${escapeHtml(item.htmlId)}"` : "";
    return `<div class="${item.type}"${idAttribute} style="${escapeHtml(elementStyles(item, nested))}" aria-label="${escapeHtml(item.name)}">${children}</div>`;
  }

  function createExportDocument() {
    const body = elements.map(item => `  ${serializeElement(item)}`).join("\n");
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Forma Design</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: Arial, sans-serif; }
    .artboard { position: relative; width: min(100%, ${ARTBOARD_WIDTH}px); height: ${ARTBOARD_HEIGHT}px; margin: 0 auto; overflow: hidden; background: #fff; }
    .container { box-sizing: border-box; }
  </style>
</head>
<body>
  <main class="artboard">
${body}
  </main>
</body>
</html>`;
  }

  function openExport() {
    document.getElementById("exportCode").textContent = createExportDocument();
    document.getElementById("exportModal").hidden = false;
    document.getElementById("closeExport").focus();
  }

  document.querySelectorAll("[data-add]").forEach(button => {
    button.addEventListener("click", () => {
      const type = button.dataset.add;
      const current = selectedId ? findElement(selectedId) : null;
      const parentId = current?.type === "container" ? current.id : null;
      createElement(type, parentId);
      showToast(type === "container" ? "Layout container added" : `${type === "circle" ? "Circle" : "Rectangle"} added`);
    });
  });

  artboard.addEventListener("pointerdown", event => {
    if (event.target === artboard || event.target === emptyState) {
      startMarquee(event);
    }
  });
  document.getElementById("layerName").addEventListener("change", event => updateSelected("name", event.target.value));
  document.getElementById("htmlIdInput").addEventListener("change", event => updateSelected("htmlId", event.target.value));
  const numericProperties = [["widthInput", "width"], ["heightInput", "height"], ["xInput", "x"], ["yInput", "y"], ["gapInput", "gap"], ["paddingInput", "padding"], ["columnsInput", "columns"], ["borderWidthInput", "borderWidth"]];
  numericProperties.forEach(([id, property]) => {
    const input = document.getElementById(id);
    input.dataset.property = property;
    input.addEventListener("change", event => updateSelected(property, event.target.value));
  });
  document.querySelector(".property-editor").addEventListener("wheel", event => {
    const input = event.target.closest("input[data-property]");
    if (!input || !["width", "height", "x", "y"].includes(input.dataset.property)) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const increment = event.shiftKey ? 10 : 1;
    const next = (Number(input.value) || 0) + direction * increment;
    updateSelected(input.dataset.property, next, false);
  }, { passive: false });
  document.getElementById("colorInput").addEventListener("change", event => {
    if (!/^#[0-9a-f]{6}$/i.test(event.target.value)) {
      showToast("Enter a valid 6-digit hex color.");
      const item = findElement(selectedId);
      if (item) event.target.value = item.fill;
      return;
    }
    updateSelected("fill", event.target.value);
  });
  document.getElementById("colorPicker").addEventListener("input", event => updateSelected("fill", event.target.value));
  document.getElementById("borderColorInput").addEventListener("change", event => {
    if (!/^#[0-9a-f]{6}$/i.test(event.target.value)) {
      showToast("Enter a valid 6-digit hex border color.");
      const item = findElement(selectedId);
      if (item) event.target.value = item.borderColor || "#20222a";
      return;
    }
    updateSelected("borderColor", event.target.value);
  });
  document.getElementById("borderColorPicker").addEventListener("input", event => updateSelected("borderColor", event.target.value));
  document.getElementById("borderStyleInput").addEventListener("change", event => updateSelected("borderStyle", event.target.value));
  document.getElementById("shadowColorInput").addEventListener("change", event => {
    if (!/^#[0-9a-f]{6}$/i.test(event.target.value)) {
      showToast("Enter a valid 6-digit hex shadow color.");
      const item = findElement(selectedId);
      if (item) event.target.value = item.shadowColor;
      return;
    }
    updateSelected("shadowColor", event.target.value);
  });
  document.getElementById("shadowColorPicker").addEventListener("input", event => updateSelected("shadowColor", event.target.value));
  [["shadowBlurInput", "shadowBlur"], ["shadowOpacityInput", "shadowOpacity"], ["shadowXInput", "shadowX"], ["shadowYInput", "shadowY"]].forEach(([id, property]) => {
    document.getElementById(id).addEventListener("change", event => updateSelected(property, event.target.value));
  });
  document.getElementById("radiusInput").addEventListener("input", event => {
    document.getElementById("radiusValue").textContent = event.target.value;
    updateSelected("radius", event.target.value);
  });
  document.getElementById("layoutInput").addEventListener("change", event => updateSelected("layout", event.target.value));
  document.getElementById("autoSizeInput").addEventListener("change", event => updateSelected("autoSize", event.target.checked));
  document.getElementById("directionInput").addEventListener("change", event => updateSelected("direction", event.target.value));
  document.getElementById("overflowInput").addEventListener("change", event => updateSelected("overflow", event.target.value));
  document.getElementById("sendBackwardButton").addEventListener("click", () => changeLayerOrder(-1));
  document.getElementById("bringForwardButton").addEventListener("click", () => changeLayerOrder(1));
  document.getElementById("duplicateButton").addEventListener("click", () => duplicateElement(selectedId));
  document.querySelector(".property-editor").addEventListener("click", event => {
    const button = event.target.closest(".section-title");
    if (!button) return;
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    button.nextElementSibling.hidden = expanded;
  });
  document.getElementById("viewportPreset").addEventListener("change", event => {
    if (event.target.value === "custom") {
      viewportName = "Custom size";
      document.querySelector(".canvas-breadcrumb strong").textContent = viewportName;
      saveProject();
      return;
    }
    const preset = VIEWPORT_PRESETS[event.target.value];
    if (preset) setViewport(preset);
  });
  document.getElementById("viewportWidth").addEventListener("change", applyCustomViewport);
  document.getElementById("viewportHeight").addEventListener("change", applyCustomViewport);
  document.getElementById("groupSelectionButton").addEventListener("click", groupSelection);
  document.getElementById("deleteButton").addEventListener("click", deleteSelected);
  document.getElementById("clearButton").addEventListener("click", () => {
    if (!elements.length) return;
    elements = [];
    selectedId = null;
    render();
    showToast("Canvas cleared");
  });
  document.getElementById("addMenuButton").addEventListener("click", () => document.querySelector('[data-add="rectangle"]').click());
  document.getElementById("exportButton").addEventListener("click", openExport);
  document.getElementById("previewButton").addEventListener("click", () => {
    togglePreview();
  });
  document.getElementById("previewExitButton").addEventListener("click", togglePreview);
  function togglePreview() {
    appShell.classList.toggle("preview-mode");
    const isPreview = appShell.classList.contains("preview-mode");
    document.getElementById("previewExitButton").hidden = !isPreview;
    document.getElementById("previewButton").innerHTML = isPreview
      ? '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg><span>Exit preview</span>'
      : '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 10s2.7-5 7.5-5 7.5 5 7.5 5-2.7 5-7.5 5-7.5-5-7.5-5Z"/><circle cx="10" cy="10" r="2"/></svg><span>Preview</span>';
    setZoom(zoom);
  }
  document.getElementById("zoomIn").addEventListener("click", () => setZoom(zoom + .1));
  document.getElementById("zoomOut").addEventListener("click", () => setZoom(zoom - .1));
  function setZoom(value) {
    zoom = clamp(Math.round(value * 100) / 100, .5, 1.4);
    document.getElementById("zoomValue").textContent = `${Math.round(zoom * 100)}%`;
    const fitScale = appShell.classList.contains("preview-mode")
      ? Math.min(1, window.innerWidth / ARTBOARD_WIDTH, window.innerHeight / ARTBOARD_HEIGHT)
      : zoom;
    document.getElementById("artboardWrap").style.transform = `scale(${fitScale})`;
  }

  function setViewport(viewport) {
    ARTBOARD_WIDTH = clamp(Math.round(viewport.width), 160, 2400);
    ARTBOARD_HEIGHT = clamp(Math.round(viewport.height), 160, 2400);
    viewportName = viewport.name;
    for (const item of elements) {
      item.width = Math.min(item.width, ARTBOARD_WIDTH);
      item.height = Math.min(item.height, ARTBOARD_HEIGHT);
      item.x = clamp(item.x, 0, ARTBOARD_WIDTH - item.width);
      item.y = clamp(item.y, 0, ARTBOARD_HEIGHT - item.height);
    }
    document.getElementById("viewportPreset").value = viewport.name === "Custom size"
      ? "custom"
      : Object.entries(VIEWPORT_PRESETS).find(([, preset]) => preset.width === ARTBOARD_WIDTH && preset.height === ARTBOARD_HEIGHT)?.[0] || "custom";
    document.getElementById("viewportWidth").value = ARTBOARD_WIDTH;
    document.getElementById("viewportHeight").value = ARTBOARD_HEIGHT;
    document.querySelector(".canvas-breadcrumb strong").textContent = viewportName;
    document.querySelector(".canvas-size").innerHTML = `${ARTBOARD_WIDTH} <span>×</span> ${ARTBOARD_HEIGHT}`;
    artboard.setAttribute("aria-label", `${viewportName} artboard`);
    render();
  }

  function applyCustomViewport() {
    const width = Number(document.getElementById("viewportWidth").value);
    const height = Number(document.getElementById("viewportHeight").value);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    setViewport({ name: "Custom size", width, height });
  }

  window.addEventListener("resize", () => {
    if (appShell.classList.contains("preview-mode")) setZoom(zoom);
  });

  document.getElementById("closeExport").addEventListener("click", () => { document.getElementById("exportModal").hidden = true; });
  document.getElementById("exportModal").addEventListener("click", event => {
    if (event.target.id === "exportModal") event.currentTarget.hidden = true;
  });
  document.getElementById("copyButton").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(createExportDocument());
      showToast("HTML copied to clipboard");
    } catch (error) {
      console.error("Could not copy exported HTML.", error);
      showToast("Clipboard access unavailable. Download the HTML instead.");
    }
  });
  document.getElementById("downloadButton").addEventListener("click", () => {
    const blob = new Blob([createExportDocument()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "forma-design.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast("HTML downloaded");
  });
  document.addEventListener("keydown", event => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      openExport();
    } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d" && selectedId && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      duplicateElement(selectedId);
    } else if (event.key === "Escape") {
      document.getElementById("exportModal").hidden = true;
      if (appShell.classList.contains("preview-mode")) togglePreview();
    } else if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      deleteSelected();
    }
  });

  document.getElementById("viewportWidth").value = ARTBOARD_WIDTH;
  document.getElementById("viewportHeight").value = ARTBOARD_HEIGHT;
  document.getElementById("viewportPreset").value = Object.entries(VIEWPORT_PRESETS).find(([, preset]) => preset.width === ARTBOARD_WIDTH && preset.height === ARTBOARD_HEIGHT)?.[0] || "custom";
  document.querySelector(".canvas-breadcrumb strong").textContent = viewportName;
  document.querySelector(".canvas-size").innerHTML = `${ARTBOARD_WIDTH} <span>×</span> ${ARTBOARD_HEIGHT}`;
  artboard.setAttribute("aria-label", `${viewportName} artboard`);
  render();
  setZoom(zoom);
})();
