import { fetchJson } from "../core/api.js";
import { renderRows, byId } from "../core/dom.js";

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

export async function loadOverview() {
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
      { key: "payload_preview", type: "payload", title: "请求日志载荷" },
      { key: "message" },
      { key: "client_ip" },
    ],
    "暂无请求日志"
  );
}
