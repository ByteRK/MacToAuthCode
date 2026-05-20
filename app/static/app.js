const byId = (id) => document.getElementById(id);

const state = {
  selectedPid: "",
  allocations: { page: 1, pageSize: 20, search: "" },
  inventorySummary: { page: 1, pageSize: 20, search: "" },
  codeDetails: { page: 1, pageSize: 20, search: "", status: "all" },
};

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = "请求失败";
    try {
      const payload = await response.json();
      message = payload.message || message;
    } catch (error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  return response.json();
}

function renderSummary(summary) {
  const container = byId("summary-cards");
  const entries = [
    ["PID 数量", summary.pid_count],
    ["授权记录总数", summary.total_codes],
    ["可分配数量", summary.available_codes],
    ["已分配数量", summary.assigned_codes],
    ["请求次数", summary.distribution_requests],
  ];
  container.innerHTML = entries
    .map(
      ([label, value]) => `
        <article class="summary-card">
          <span>${label}</span>
          <strong>${value ?? 0}</strong>
        </article>
      `
    )
    .join("");
}

function renderRows(targetId, rows, columns, emptyText) {
  const body = byId(targetId);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${columns.length}">${emptyText}</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((row) => {
      const tds = columns
        .map((column) => {
          if (column.type === "status") {
            return `<td><span class="status-chip ${row[column.key]}">${row[column.key] || "-"}</span></td>`;
          }
          if (column.type === "action") {
            return `<td><button type="button" class="table-action" data-pid="${row.pid}">查看明细</button></td>`;
          }
          return `<td>${row[column.key] ?? "-"}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
}

function renderTableMeta(targetId, result, label) {
  const node = byId(targetId);
  if (!node) {
    return;
  }
  const start = result.total === 0 ? 0 : (result.page - 1) * result.page_size + 1;
  const end = Math.min(result.page * result.page_size, result.total);
  node.textContent = `${label}：第 ${result.page} 页，显示 ${start}-${end} / 共 ${result.total} 条`;
}

function switchPanel(targetId) {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.target === targetId);
  });
  document.querySelectorAll(".content-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

async function loadOverview() {
  const payload = await fetchJson("/api/admin/overview");
  renderSummary(payload.data.summary);
  renderRows(
    "logs-body",
    payload.data.recent_logs,
    [
      { key: "created_at" },
      { key: "pid" },
      { key: "mac" },
      { key: "action" },
      { key: "code" },
      { key: "message" },
      { key: "client_ip" },
    ],
    "暂无请求日志"
  );
}

async function loadAllocations() {
  const { page, pageSize, search } = state.allocations;
  const payload = await fetchJson(
    `/api/admin/allocations?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`
  );
  renderRows(
    "allocations-body",
    payload.data.items,
    [
      { key: "pid" },
      { key: "assigned_mac" },
      { key: "code" },
      { key: "source_batch" },
      { key: "assigned_at" },
    ],
    "暂无已分配数据"
  );
  renderTableMeta("allocations-meta", payload.data, "分配记录");
}

async function loadInventorySummary() {
  const { page, pageSize, search } = state.inventorySummary;
  const payload = await fetchJson(
    `/api/admin/inventory-summary?page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`
  );
  renderRows(
    "inventory-summary-body",
    payload.data.items,
    [
      { key: "pid" },
      { key: "total_codes" },
      { key: "available_codes" },
      { key: "assigned_codes" },
      { key: "last_assigned_at" },
      { key: "pid", type: "action" },
    ],
    "暂无库存数据"
  );
  renderTableMeta("inventory-summary-meta", payload.data, "PID 聚合库存");
}

async function loadCodes() {
  if (!state.selectedPid) {
    byId("codes-body").innerHTML = '<tr><td colspan="7">请选择 PID 后查看明细。</td></tr>';
    byId("codes-meta").textContent = "";
    return;
  }

  const { page, pageSize, search, status } = state.codeDetails;
  const payload = await fetchJson(
    `/api/admin/codes?pid=${encodeURIComponent(state.selectedPid)}&status=${encodeURIComponent(status)}&page=${page}&page_size=${pageSize}&search=${encodeURIComponent(search)}`
  );
  renderRows(
    "codes-body",
    payload.data.items,
    [
      { key: "pid" },
      { key: "code" },
      { key: "status", type: "status" },
      { key: "assigned_mac" },
      { key: "source_batch" },
      { key: "payload_preview" },
      { key: "assigned_at" },
    ],
    "当前筛选条件下暂无明细"
  );
  renderTableMeta("codes-meta", payload.data, `PID ${state.selectedPid} 明细`);
}

function selectPid(pid) {
  state.selectedPid = pid;
  state.codeDetails.page = 1;
  byId("selected-pid").value = pid;
  byId("inventory-detail-hint").textContent = `当前查看 PID：${pid}`;
  switchPanel("inventory-panel");
  loadCodes().catch((error) => console.error(error));
}

async function handleImport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const resultNode = byId("import-result");
  resultNode.textContent = "正在导入，请稍候...";

  try {
    const payload = await fetchJson("/api/admin/import-codes", {
      method: "POST",
      body: formData,
    });
    const info = payload.data;
    resultNode.textContent = `导入完成：总行数 ${info.total_rows}，新增 ${info.inserted}，跳过重复 ${info.skipped}`;
    form.reset();
    await Promise.all([loadOverview(), loadAllocations(), loadInventorySummary(), loadCodes()]);
  } catch (error) {
    resultNode.textContent = error.message;
  }
}

function bindSidebar() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      switchPanel(button.dataset.target);
    });
  });
}

function bindForms() {
  byId("import-form").addEventListener("submit", handleImport);

  byId("allocation-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.allocations.page = 1;
    state.allocations.search = byId("allocation-search").value.trim();
    await loadAllocations();
  });

  byId("inventory-summary-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.inventorySummary.page = 1;
    state.inventorySummary.search = byId("inventory-summary-search").value.trim();
    await loadInventorySummary();
  });

  byId("code-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.codeDetails.page = 1;
    state.codeDetails.status = byId("code-status").value;
    state.codeDetails.search = byId("code-search").value.trim();
    await loadCodes();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.classList.contains("table-action")) {
      selectPid(target.dataset.pid || "");
    }
  });
}

async function bootstrap() {
  bindSidebar();
  bindForms();
  await Promise.all([loadOverview(), loadAllocations(), loadInventorySummary()]);
}

bootstrap().catch((error) => {
  console.error(error);
});
