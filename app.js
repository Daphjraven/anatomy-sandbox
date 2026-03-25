pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const baseCanvas = document.getElementById("baseCanvas");
const baseCtx = baseCanvas.getContext("2d");

const fabricCanvas = new fabric.Canvas("sandboxCanvas", {
  preserveObjectStacking: true
});

const statusEl = document.getElementById("status");
const containerEl = document.getElementById("canvasContainer");

let currentPdf = null;
let currentPage = 1;
let pdfPageCount = 1;
let history = [];
let isRestoring = false;

function setStatus(message) {
  statusEl.textContent = message;
}

function resizeBoard(width, height) {
  const safeWidth = Math.round(width);
  const safeHeight = Math.round(height);

  baseCanvas.width = safeWidth;
  baseCanvas.height = safeHeight;

  fabricCanvas.setWidth(safeWidth);
  fabricCanvas.setHeight(safeHeight);

  containerEl.style.width = `${safeWidth}px`;
  containerEl.style.height = `${safeHeight}px`;

  fabricCanvas.renderAll();
}

function clearBaseCanvas() {
  baseCtx.clearRect(0, 0, baseCanvas.width, baseCanvas.height);
  baseCtx.fillStyle = "#ffffff";
  baseCtx.fillRect(0, 0, baseCanvas.width, baseCanvas.height);
}

function saveHistory() {
  if (isRestoring) return;

  history.push(JSON.stringify(fabricCanvas.toJSON(["annotationType"])));

  if (history.length > 50) {
    history.shift();
  }
}

function restoreFromJson(jsonStr) {
  isRestoring = true;
  fabricCanvas.loadFromJSON(jsonStr, () => {
    fabricCanvas.renderAll();
    isRestoring = false;
  });
}

function undo() {
  if (history.length <= 1) return;

  history.pop();
  restoreFromJson(history[history.length - 1]);
  setStatus("Undid last action.");
}

function setPenMode() {
  fabricCanvas.isDrawingMode = true;
  fabricCanvas.selection = false;

  fabricCanvas.forEachObject((obj) => {
    obj.selectable = false;
    obj.evented = false;
  });

  fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
  fabricCanvas.freeDrawingBrush.width = 3;
  fabricCanvas.freeDrawingBrush.color = "#111111";

  setStatus("Pen mode.");
}

function setEraserMode() {
  fabricCanvas.isDrawingMode = true;
  fabricCanvas.selection = false;

  fabricCanvas.forEachObject((obj) => {
    obj.selectable = false;
    obj.evented = false;
  });

  fabricCanvas.freeDrawingBrush = new fabric.PencilBrush(fabricCanvas);
  fabricCanvas.freeDrawingBrush.width = 18;
  fabricCanvas.freeDrawingBrush.color = "#ffffff";

  setStatus("Eraser mode.");
}

function setSelectMode() {
  fabricCanvas.isDrawingMode = false;
  fabricCanvas.selection = true;

  fabricCanvas.forEachObject((obj) => {
    const isAnnotation = !!obj.annotationType;
    obj.selectable = isAnnotation;
    obj.evented = isAnnotation;
  });

  setStatus("Select mode.");
}

function addTextLabel() {
  fabricCanvas.isDrawingMode = false;

  const textbox = new fabric.Textbox("Label", {
    left: 100,
    top: 100,
    fontSize: 24,
    fill: "#c62828",
    fontFamily: "Arial",
    editable: true,
    selectable: true,
    evented: true
  });

  textbox.annotationType = "label";

  fabricCanvas.add(textbox);
  fabricCanvas.setActiveObject(textbox);
  fabricCanvas.renderAll();

  saveHistory();
  setStatus("Added label.");
}

function clearAnnotations() {
  const objects = fabricCanvas.getObjects().slice();

  objects.forEach((obj) => {
    if (obj.annotationType) {
      fabricCanvas.remove(obj);
    }
  });

  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();

  saveHistory();
  setStatus("Cleared ink and labels.");
}

function exportPNG() {
  const mergedCanvas = document.createElement("canvas");
  mergedCanvas.width = baseCanvas.width;
  mergedCanvas.height = baseCanvas.height;

  const mergedCtx = mergedCanvas.getContext("2d");
  mergedCtx.drawImage(baseCanvas, 0, 0);

  const overlayImage = new Image();
  overlayImage.onload = () => {
    mergedCtx.drawImage(overlayImage, 0, 0);

    const link = document.createElement("a");
    link.href = mergedCanvas.toDataURL("image/png");
    link.download = "annotated_board.png";
    link.click();

    setStatus("Exported PNG.");
  };

  overlayImage.src = fabricCanvas.toDataURL({
    format: "png",
    multiplier: 1
  });
}

function resetOverlay() {
  fabricCanvas.clear();
  fabricCanvas.discardActiveObject();
  fabricCanvas.renderAll();
  history = [];
  saveHistory();
}

function loadImageFile(file) {
  const reader = new FileReader();

  reader.onload = (event) => {
    const img = new Image();

    img.onload = () => {
      const maxWidth = 900;
      const scale = Math.min(maxWidth / img.width, 1.5);
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      resizeBoard(width, height);
      clearBaseCanvas();
      baseCtx.drawImage(img, 0, 0, width, height);

      resetOverlay();
      setPenMode();
      setStatus(`Loaded image: ${file.name}`);
    };

    img.src = event.target.result;
  };

  reader.readAsDataURL(file);
}

async function renderPdfPage(pageNumber) {
  if (!currentPdf) return;

  const page = await currentPdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 });

  resizeBoard(viewport.width, viewport.height);
  clearBaseCanvas();

  await page.render({
    canvasContext: baseCtx,
    viewport: viewport
  }).promise;

  resetOverlay();
  setPenMode();
  setStatus(`Loaded PDF page ${currentPage} of ${pdfPageCount}`);
}

async function loadPdfFile(file) {
  const arrayBuffer = await file.arrayBuffer();

  currentPdf = await pdfjsLib.getDocument({
    data: arrayBuffer
  }).promise;

  pdfPageCount = currentPdf.numPages;
  currentPage = 1;

  await renderPdfPage(currentPage);
}

document.getElementById("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const lowerName = file.name.toLowerCase();

  currentPdf = null;
  currentPage = 1;
  pdfPageCount = 1;

  try {
    if (lowerName.endsWith(".pdf")) {
      await loadPdfFile(file);
    } else {
      loadImageFile(file);
    }
  } catch (error) {
    console.error("File load error:", error);
    setStatus("Could not load that file.");
  }
});

document.getElementById("penBtn").addEventListener("click", setPenMode);
document.getElementById("eraserBtn").addEventListener("click", setEraserMode);
document.getElementById("selectBtn").addEventListener("click", setSelectMode);
document.getElementById("textBtn").addEventListener("click", addTextLabel);
document.getElementById("undoBtn").addEventListener("click", undo);
document.getElementById("clearBtn").addEventListener("click", clearAnnotations);
document.getElementById("exportBtn").addEventListener("click", exportPNG);

document.getElementById("prevPageBtn").addEventListener("click", async () => {
  if (currentPdf && currentPage > 1) {
    currentPage -= 1;
    try {
      await renderPdfPage(currentPage);
    } catch (error) {
      console.error("Previous page render error:", error);
      setStatus("Could not render previous page.");
    }
  }
});

document.getElementById("nextPageBtn").addEventListener("click", async () => {
  if (currentPdf && currentPage < pdfPageCount) {
    currentPage += 1;
    try {
      await renderPdfPage(currentPage);
    } catch (error) {
      console.error("Next page render error:", error);
      setStatus("Could not render next page.");
    }
  }
});

fabricCanvas.on("path:created", (event) => {
  if (event.path) {
    event.path.annotationType = "ink";
  }
  saveHistory();
});

fabricCanvas.on("object:modified", () => {
  saveHistory();
});

fabricCanvas.on("object:added", (event) => {
  const obj = event.target;
  if (!obj) return;

  if (obj.annotationType && !isRestoring) {
    // avoid double-history bursts for free draw paths, which are already tracked
    if (obj.type !== "path") {
      saveHistory();
    }
  }
});

resizeBoard(900, 1200);
clearBaseCanvas();
setPenMode();
saveHistory();
