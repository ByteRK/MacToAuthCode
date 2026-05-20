import { fetchJson } from "../core/api.js";
import { renderRows, renderTableMeta, byId } from "../core/dom.js";
import { state } from "../core/state.js";

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
}

export function bindAllocationSearch() {
  byId("allocation-search-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    state.allocations.page = 1;
    state.allocations.search = byId("allocation-search").value.trim();
    await loadAllocations();
  });
}
