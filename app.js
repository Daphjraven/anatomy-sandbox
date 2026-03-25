pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const canvas = new fabric.Canvas("sandboxCanvas", {
  preserveObjectStacking: true
});

const statusEl = document.getElementById("status");

let currentPdf = null;
let currentPage = 1;
let pdfPageCount = 1;
let history = [];
let isRestoring = false;

function setStatus(msg) {
  statusEl.textContent = msg;
}

function resizeCanvas(width, height) {
  canvas.setWidth(width);
  canvas.setHeight(height);
  canvas.renderAll();
}

function saveHistory() {
  if (isRestoring) return;
  history.push(JSON.stringify(canvas.toJSON(["annotationType"])));
  if (history.length > 50) history.shift();
}

function restoreFromJson(jsonStr) {
  isRestoring = true;
  canvas.loadFromJSON(jsonStr, () => {
    canvas.renderAll();
    isRestoring = false;
  });
}

function undo() {
  if (history.length <= 1) return;
  history.pop();
  restoreFromJson(history[history.length - 1]);
}

function setPenMode() {
  canvas.isDrawingMode = true;
  canvas.selection = false;
  canvas.forEachObject(obj => obj.selectable = false);
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  canvas.freeDrawingBrush.width = 3;
  canvas.freeDrawingBrush.color = "#111";
  setStatus("Pen mode");
}

function setEraserMode() {
  canvas.isDrawingMode = true;
  canvas.selection = false;
  canvas.forEachObject(obj => obj.selectable = false);
  canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
  canvas.freeDrawingBrush.width = 18;
  canvas.freeDrawingBrush.color = "#ffffff";
  setStatus("Eraser mode");
}

function setSelectMode() {
  canvas.isDrawingMode = false;
  canvas.selection = true;
  canvas.forEachObject(obj => {
    obj.selectable = obj.annotationType && obj.annotationType !== "background";
  });
  setStatus("Select mode");
}

function addTextLabel() {
  canvas.isDrawingMode = false;
  const textbox = new fabric.Textbox("Label", {
    left: 100,
    top: 100,
    fontSize: 24,
    fill: "#c62828"
  });
  textbox.annotationType = "label";
  canvas.add(textbox);
  canvas.setActiveObject(textbox);
  canvas.renderAll();
  saveHistory();
}

function clearAnnotations() {
  canvas.getObjects().slice().forEach(obj => {
    if (obj.annotationType && obj.annotationType !== "background") {
      canvas.remove(obj);
    }
  });
  canvas.renderAll();
  saveHistory();
  setStatus("Cleared annotations");
}

function exportPNG() {
  const link = document.createElement("a");
  link.href = canvas.toDataURL({ format: "png" });
  link.download = "annotated_board.png";
  link.click();
}

function loadImageFile(file) {
  const reader = new FileReader();
  reader.onload = evt => {
    fabric.Image.fromURL(evt.target.result, img => {
      const maxWidth = 900;
      const scale = Math.min(maxWidth / img.width, 1.5);

      canvas.clear();
      resizeCanvas(img.width * scale, img.height * scale);

      img.set({
        left: 0,
        top: 0,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false
      });

      img.annotationType = "background";
      canvas.add(img);
      canvas.sendToBack(img);
      canvas.renderAll();

      history = [];
      saveHistory();
      setPenMode();
      setStatus(`Loaded image: ${file.name}`);
    });
  };
  reader.readAsDataURL(file);
}

async function renderPdfPage(pageNumber) {
  if (!currentPdf) return;

  const page = await currentPdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1.5 });

  const tempCanvas = document.createElement("canvas");
  const ctx = tempCanvas.getContext("2d");
  tempCanvas.width = viewport.width;
  tempCanvas.height = viewport.height;

  await page.render({
    canvasContext: ctx,
    viewport: viewport
  }).promise;

  const imgURL = tempCanvas.toDataURL("image/png");

  fabric.Image.fromURL(imgURL, img => {
    canvas.clear();
    resizeCanvas(viewport.width, viewport.height);

    img.set({
      left: 0,
      top: 0,
      selectable: false,
      evented: false
    });

    img.annotationType = "background";
    canvas.add(img);
    canvas.sendToBack(img);
    canvas.renderAll();

    history = [];
    saveHistory();
    setPenMode();
    setStatus(`Loaded PDF page ${currentPage} of ${pdfPageCount}`);
  });
}

async function loadPdfFile(file) {
  const arrayBuffer = await file.arrayBuffer();
  currentPdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  pdfPageCount = currentPdf.numPages;
  currentPage = 1;
  await renderPdfPage(currentPage);
}

document.getElementById("fileInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;

  const name = file.name.toLowerCase();
  currentPdf = null;
  currentPage = 1;
  pdfPageCount = 1;

  if (name.endsWith(".pdf")) {
    await loadPdfFile(file);
  } else {
    loadImageFile(file);
  }
});

document.getElementById("penBtn").onclick = setPenMode;
document.getElementById("eraserBtn").onclick = setEraserMode;
document.getElementById("selectBtn").onclick = setSelectMode;
document.getElementById("textBtn").onclick = addTextLabel;
document.getElementById("undoBtn").onclick = undo;
document.getElementById("clearBtn").onclick = clearAnnotations;
document.getElementById("exportBtn").onclick = exportPNG;

document.getElementById("prevPageBtn").onclick = async () => {
  if (currentPdf && currentPage > 1) {
    currentPage--;
    await renderPdfPage(currentPage);
  }
};

document.getElementById("nextPageBtn").onclick = async () => {
  if (currentPdf && currentPage < pdfPageCount) {
    currentPage++;
    await renderPdfPage(currentPage);
  }
};

canvas.on("path:created", event => {
  if (event.path) event.path.annotationType = "ink";
  saveHistory();
});

canvas.on("object:modified", saveHistory);

setPenMode();
saveHistory();
