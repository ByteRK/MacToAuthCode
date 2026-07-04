import { byId } from "../core/dom.js";

function renderImportErrors(errors) {
  const container = byId("import-errors");
  const list = byId("import-errors-list");
  if (!container || !list) {
    return;
  }
  if (!errors.length) {
    container.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  list.innerHTML = errors.map((item) => `<li>${item}</li>`).join("");
  container.classList.remove("hidden");
}

function renderImportWarnings(warnings) {
  const container = byId("import-warnings");
  const list = byId("import-warnings-list");
  if (!container || !list) {
    return;
  }
  if (!warnings.length) {
    container.classList.add("hidden");
    list.innerHTML = "";
    return;
  }

  list.innerHTML = warnings.map((item) => `<li>${item}</li>`).join("");
  container.classList.remove("hidden");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setImportButtonState(isLoading) {
  const button = byId("import-submit-btn");
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? "导入中..." : "开始导入";
}

function setImportStatus({ title, phase, progress, progressText, tone = "neutral" }) {
  const card = byId("import-status-card");
  const titleNode = byId("import-status-title");
  const phaseNode = byId("import-status-phase");
  const progressBar = byId("import-progress-bar");
  const progressTextNode = byId("import-progress-text");
  if (!card || !titleNode || !phaseNode || !progressBar || !progressTextNode) {
    return;
  }

  card.classList.remove("hidden", "is-success", "is-error");
  if (tone === "success") {
    card.classList.add("is-success");
  } else if (tone === "error") {
    card.classList.add("is-error");
  }

  titleNode.textContent = title;
  phaseNode.textContent = phase;
  progressBar.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
  progressTextNode.textContent = progressText;
}

function renderImportSummary(info) {
  const summary = byId("import-summary");
  const totalNode = byId("import-summary-total");
  const insertedNode = byId("import-summary-inserted");
  const skippedNode = byId("import-summary-skipped");
  if (!summary || !totalNode || !insertedNode || !skippedNode) {
    return;
  }

  if (!info) {
    summary.classList.add("hidden");
    totalNode.textContent = "0";
    insertedNode.textContent = "0";
    skippedNode.textContent = "0";
    return;
  }

  totalNode.textContent = String(info.total_rows ?? 0);
  insertedNode.textContent = String(info.inserted ?? 0);
  skippedNode.textContent = String(info.skipped ?? 0);
  summary.classList.remove("hidden");
}

function resetImportFeedback() {
  renderImportErrors([]);
  renderImportWarnings([]);
  renderImportSummary(null);
}

function uploadImportFile(formData, onUploadProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/admin/import-codes");
    xhr.responseType = "json";

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) {
        return;
      }
      onUploadProgress({
        loaded: event.loaded,
        total: event.total,
        percent: Math.round((event.loaded / event.total) * 100),
      });
    });

    xhr.addEventListener("load", () => {
      const payload =
        xhr.response ||
        (() => {
          try {
            return JSON.parse(xhr.responseText || "{}");
          } catch {
            return {};
          }
        })();

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }

      reject({
        message: payload.message || "导入请求失败",
        details: payload.errors || [],
      });
    });

    xhr.addEventListener("error", () => {
      reject({ message: "导入请求失败，请检查网络或服务状态", details: [] });
    });

    xhr.addEventListener("timeout", () => {
      reject({ message: "导入请求超时，请稍后重试", details: [] });
    });

    xhr.timeout = 10 * 60 * 1000;
    xhr.send(formData);
  });
}

export function bindImporter({ refreshOverview, refreshAllocations, refreshInventory, refreshCodeDetails }) {
  const fileInput = byId("import-file-input");
  const fileNote = byId("import-file-note");
  const resultNode = byId("import-result");

  if (fileInput instanceof HTMLInputElement && fileNote) {
    fileInput.addEventListener("change", () => {
      const selectedFile = fileInput.files?.[0];
      fileNote.textContent = selectedFile
        ? `已选择：${selectedFile.name}（${formatBytes(selectedFile.size)}）`
        : "支持 .xlsx，当前未选择文件";
    });
  }

  byId("import-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!(form instanceof HTMLFormElement) || !resultNode) {
      return;
    }

    const formData = new FormData(form);
    resetImportFeedback();
    setImportButtonState(true);
    resultNode.textContent = "正在准备导入...";
    setImportStatus({
      title: "正在上传导入文件",
      phase: "上传中",
      progress: 0,
      progressText: "文件已提交，正在上传到服务端...",
    });

    try {
      const payload = await uploadImportFile(formData, ({ loaded, total, percent }) => {
        setImportStatus({
          title: "正在上传导入文件",
          phase: "上传中",
          progress: percent,
          progressText: `已上传 ${formatBytes(loaded)} / ${formatBytes(total)}（${percent}%）`,
        });
        if (percent >= 100) {
          resultNode.textContent = "文件上传完成，正在校验并写入数据库...";
          setImportStatus({
            title: "服务端正在处理导入数据",
            phase: "校验与写入中",
            progress: 100,
            progressText: "文件上传完成，正在校验数据并写入数据库，请稍候...",
          });
        }
      });

      const info = payload.data;
      renderImportSummary(info);
      renderImportWarnings(info.warnings || []);
      resultNode.textContent = `导入完成：总行数 ${info.total_rows}，新增 ${info.inserted}，跳过重复 ${info.skipped}`;
      setImportStatus({
        title: "导入完成",
        phase: "处理完成",
        progress: 100,
        progressText: `本次共处理 ${info.total_rows} 条记录，新增 ${info.inserted} 条。`,
        tone: "success",
      });
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
      resultNode.textContent = error.message || "导入失败";
      renderImportErrors(error.details || []);
      setImportStatus({
        title: "导入失败",
        phase: "处理终止",
        progress: 100,
        progressText: error.message || "导入失败，请检查文件内容后重试。",
        tone: "error",
      });
    } finally {
      setImportButtonState(false);
    }
  });
}
