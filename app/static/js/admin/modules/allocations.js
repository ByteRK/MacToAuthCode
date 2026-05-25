import { fetchJson } from "../core/api.js";
import { renderRows, renderTableMeta, byId } from "../core/dom.js";
import { state } from "../core/state.js";

function clampPage(page, totalPages) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function renderAllocationPagination(result) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));
  state.allocations.totalPages = totalPages;
  byId("allocations-page-indicator").textContent = `第 ${result.page} / ${totalPages} 页`;
  byId("allocations-prev-page").disabled = result.page <= 1;
  byId("allocations-next-page").disabled = result.page >= totalPages;
  byId("allocations-page-size").value = String(result.page_size);
  byId("allocations-page-jump").value = String(result.page);
}

export async function loadAllocations() {
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
  renderAllocationPagination(payload.data);
}

export function bindAllocationSearch() {
  byId("allocation-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.allocations.page = 1;
    state.allocations.search = byId("allocation-search").value.trim();
    await loadAllocations();
  });

  byId("allocations-prev-page").addEventListener("click", async () => {
    if (state.allocations.page <= 1) {
      return;
    }
    state.allocations.page -= 1;
    await loadAllocations();
  });

  byId("allocations-next-page").addEventListener("click", async () => {
    const totalPages = state.allocations.totalPages || 1;
    if (state.allocations.page >= totalPages) {
      return;
    }
    state.allocations.page += 1;
    await loadAllocations();
  });

  byId("allocations-page-size").addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    state.allocations.pageSize = Number(target.value);
    state.allocations.page = 1;
    await loadAllocations();
  });

  byId("allocations-page-go").addEventListener("click", async () => {
    const totalPages = state.allocations.totalPages || 1;
    const desiredPage = Number(byId("allocations-page-jump").value || "1");
    state.allocations.page = clampPage(desiredPage, totalPages);
    await loadAllocations();
  });

  byId("allocations-page-jump").addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    byId("allocations-page-go").click();
  });
}
