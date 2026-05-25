import { fetchJson } from "../core/api.js";
import { renderRows, renderTableMeta, byId } from "../core/dom.js";
import { state } from "../core/state.js";

function renderAllocationPagination(result) {
  const totalPages = Math.max(1, Math.ceil(result.total / result.page_size));
  state.allocations.totalPages = totalPages;
  byId("allocations-page-indicator").textContent = `第 ${result.page} / ${totalPages} 页`;
  byId("allocations-prev-page").disabled = result.page <= 1;
  byId("allocations-next-page").disabled = result.page >= totalPages;
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
}
