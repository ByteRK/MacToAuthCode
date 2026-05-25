import { fetchJson } from "../core/api.js";
import { renderRows, byId } from "../core/dom.js";
import { state } from "../core/state.js";

function resetLogHighlights() {
  state.logs.hasLoaded = false;
  state.logs.seenLogIds = [];
}

function currentLogQuery() {
  return new URLSearchParams({
    limit: String(state.logs.limit),
    action: state.logs.action,
    search: state.logs.search,
  }).toString();
}

function applySearchInput() {
  const input = byId("logs-search-input");
  if (!(input instanceof HTMLInputElement)) {
    return;
  }
  state.logs.search = input.value.trim();
}

function renderLogs(items, highlightedIds) {
  renderRows(
    "logs-body",
    items,
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
    "暂无请求日志",
    {
      getRowClassName: (row) =>
        highlightedIds.has(String(row.log_id)) ? "log-row-new" : "",
    }
  );
}

function setLogsStatus(text) {
  byId("logs-refresh-status").textContent = text;
}

function formatRefreshTime(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function stopLogsAutoRefresh() {
  if (state.logs.timerId) {
    window.clearInterval(state.logs.timerId);
    state.logs.timerId = null;
  }
}

function startLogsAutoRefresh() {
  stopLogsAutoRefresh();
  if (!state.logs.autoRefresh || !state.logs.panelActive || document.hidden) {
    return;
  }
  state.logs.timerId = window.setInterval(() => {
    loadLogs().catch((error) => {
      console.error(error);
      setLogsStatus(`日志刷新失败：${error.message}`);
    });
  }, state.logs.intervalMs);
}

export async function loadLogs() {
  const payload = await fetchJson(`/api/admin/logs?${currentLogQuery()}`);
  const items = payload.data.items;
  const currentIds = items.map((item) => String(item.log_id));
  let highlightedIds = new Set();
  if (state.logs.hasLoaded) {
    highlightedIds = new Set(
      currentIds.filter((id) => !state.logs.seenLogIds.includes(id))
    );
  }
  state.logs.seenLogIds = currentIds;
  state.logs.hasLoaded = true;
  renderLogs(items, highlightedIds);
  const actionLabel = state.logs.action === "all" ? "全部动作" : state.logs.action;
  const searchLabel = state.logs.search ? `，关键词“${state.logs.search}”` : "";
  setLogsStatus(
    `最近刷新：${formatRefreshTime(new Date())}，显示 ${actionLabel}${searchLabel} 下最近 ${payload.data.limit} 条请求日志`
  );
}

export function bindLogs() {
  byId("logs-action-filter").addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    state.logs.action = target.value;
    resetLogHighlights();
    setLogsStatus("正在按动作类型刷新日志...");
    await loadLogs();
  });

  byId("logs-search-btn").addEventListener("click", async () => {
    applySearchInput();
    resetLogHighlights();
    setLogsStatus("正在按关键词筛选日志...");
    await loadLogs();
  });

  byId("logs-search-reset-btn").addEventListener("click", async () => {
    const input = byId("logs-search-input");
    if (input instanceof HTMLInputElement) {
      input.value = "";
    }
    state.logs.search = "";
    resetLogHighlights();
    setLogsStatus("已清空关键词，正在恢复全部日志...");
    await loadLogs();
  });

  byId("logs-search-input").addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    applySearchInput();
    resetLogHighlights();
    setLogsStatus("正在按关键词筛选日志...");
    await loadLogs();
  });

  byId("logs-limit").addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    state.logs.limit = Number(target.value);
    resetLogHighlights();
    await loadLogs();
  });

  byId("logs-auto-refresh").addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    state.logs.autoRefresh = target.checked;
    if (state.logs.autoRefresh) {
      setLogsStatus("自动刷新已开启。");
      startLogsAutoRefresh();
    } else {
      setLogsStatus("自动刷新已关闭，可点击“立即刷新”查看最新日志。");
      stopLogsAutoRefresh();
    }
  });

  byId("logs-refresh-btn").addEventListener("click", async () => {
    setLogsStatus("正在刷新日志...");
    await loadLogs();
  });

  byId("logs-export-btn").addEventListener("click", () => {
    applySearchInput();
    window.location.href = `/api/admin/export-logs?${currentLogQuery()}`;
  });

  document.addEventListener("admin:panelchange", async (event) => {
    const targetId = event.detail?.targetId;
    state.logs.panelActive = targetId === "logs-panel";
    if (state.logs.panelActive) {
      await loadLogs();
      startLogsAutoRefresh();
    } else {
      stopLogsAutoRefresh();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopLogsAutoRefresh();
      return;
    }
    startLogsAutoRefresh();
  });

  state.logs.panelActive = document.querySelector("#logs-panel.active") !== null;
  if (state.logs.panelActive) {
    loadLogs().catch((error) => {
      console.error(error);
      setLogsStatus(`日志加载失败：${error.message}`);
    });
    startLogsAutoRefresh();
  }
}
