import { fetchJson } from "../core/api.js";
import { renderRows, renderTableMeta, byId } from "../core/dom.js";
import { state } from "../core/state.js";
import { switchPanel } from "./navigation.js";

function renderCodePagination(result) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));
  state.codeDetails.totalPages = totalPages;
  byId("codes-page-indicator").textContent = `第 ${result.page} / ${totalPages} 页`;
  byId("codes-prev-page").disabled = result.page <= 1;
  byId("codes-next-page").disabled = result.page >= totalPages;
}

function resetCodeDetailsView() {
  byId("codes-body").innerHTML = '<tr><td colspan="7">请选择 PID 后查看明细。</td></tr>';
  byId("codes-meta").textContent = "";
  byId("codes-page-indicator").textContent = "第 1 / 1 页";
  byId("codes-prev-page").disabled = true;
  byId("codes-next-page").disabled = true;
}

export async function loadInventorySummary() {
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

export async function loadCodeDetails() {
  if (!state.selectedPid) {
    resetCodeDetailsView();
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
      { key: "did" },
      { key: "status", type: "status" },
      { key: "assigned_mac" },
      { key: "source_batch" },
      { key: "payload_preview", type: "payload", title: "授权记录载荷" },
      { key: "assigned_at" },
    ],
    "当前筛选条件下暂无明细"
  );
  renderTableMeta("codes-meta", payload.data, `PID ${state.selectedPid} 明细`);
  renderCodePagination(payload.data);
}

export function selectPid(pid) {
  state.selectedPid = pid;
  state.codeDetails.page = 1;
  byId("selected-pid").value = pid;
  byId("inventory-detail-hint").textContent = `当前查看 PID：${pid}`;
  switchPanel("inventory-panel");
  loadCodeDetails().catch((error) => console.error(error));
}

export function bindInventory() {
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
    await loadCodeDetails();
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.classList.contains("payload-action")) {
      return;
    }
    if (target.classList.contains("table-action") && target.dataset.pid) {
      selectPid(target.dataset.pid || "");
    }
  });

  byId("codes-prev-page").addEventListener("click", async () => {
    if (!state.selectedPid || state.codeDetails.page <= 1) {
      return;
    }
    state.codeDetails.page -= 1;
    await loadCodeDetails();
  });

  byId("codes-next-page").addEventListener("click", async () => {
    const totalPages = state.codeDetails.totalPages || 1;
    if (!state.selectedPid || state.codeDetails.page >= totalPages) {
      return;
    }
    state.codeDetails.page += 1;
    await loadCodeDetails();
  });

  resetCodeDetailsView();
}
