const byId = (id) => document.getElementById(id);

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
    ["授权码总数", summary.total_codes],
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
          return `<td>${row[column.key] ?? "-"}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
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

async function loadAllocations(search = "") {
  const payload = await fetchJson(`/api/admin/allocations?search=${encodeURIComponent(search)}`);
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
}

async function loadCodes() {
  const search = byId("code-search").value.trim();
  const status = byId("code-status").value;
  const payload = await fetchJson(
    `/api/admin/codes?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`
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
    "暂无库存数据"
  );
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
    await Promise.all([loadOverview(), loadAllocations(), loadCodes()]);
  } catch (error) {
    resultNode.textContent = error.message;
  }
}

function bindForms() {
  byId("import-form").addEventListener("submit", handleImport);
  byId("allocation-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadAllocations(byId("allocation-search").value.trim());
  });
  byId("code-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await loadCodes();
  });
}

async function bootstrap() {
  bindForms();
  await Promise.all([loadOverview(), loadAllocations(), loadCodes()]);
}

bootstrap().catch((error) => {
  console.error(error);
});
