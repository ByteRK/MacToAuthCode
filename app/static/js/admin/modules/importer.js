import { fetchJson } from "../core/api.js";
import { byId } from "../core/dom.js";

function renderImportErrors(errors) {
  const container = byId("import-errors");
  const list = byId("import-errors-list");
  if (!errors.length) {
    container.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  list.innerHTML = errors.map((item) => `<li>${item}</li>`).join("");
  container.classList.remove("hidden");
}

export function bindImporter({ refreshOverview, refreshAllocations, refreshInventory, refreshCodeDetails }) {
  const fileInput = byId("import-file-input");
  const fileNote = byId("import-file-note");
  if (fileInput instanceof HTMLInputElement && fileNote) {
    fileInput.addEventListener("change", () => {
      const selectedFile = fileInput.files?.[0];
      fileNote.textContent = selectedFile
        ? `已选择：${selectedFile.name}`
        : "支持 .xlsx，当前未选择文件";
    });
  }

  byId("import-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const resultNode = byId("import-result");
    renderImportErrors([]);
    resultNode.textContent = "正在导入，请稍候...";

    try {
      const payload = await fetchJson("/api/admin/import-codes", {
        method: "POST",
        body: formData,
      });
      const info = payload.data;
      const warningText = (info.warnings || []).length
        ? `；告警：${info.warnings.join("；")}`
        : "";
      resultNode.textContent =
        `导入完成：总行数 ${info.total_rows}，新增 ${info.inserted}，跳过重复 ${info.skipped}` +
        warningText;
      form.reset();
      if (fileNote) {
        fileNote.textContent = "支持 .xlsx，当前未选择文件";
      }
      await Promise.all([
        refreshOverview(),
        refreshAllocations(),
        refreshInventory(),
        refreshCodeDetails(),
      ]);
    } catch (error) {
      resultNode.textContent = error.message;
      renderImportErrors(error.details || []);
    }
  });
}
