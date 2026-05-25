import { fetchJson } from "../core/api.js";
import { renderRows, byId } from "../core/dom.js";
import { state } from "../core/state.js";

function renderLogs(items) {
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
    "暂无请求日志"
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
  const payload = await fetchJson(`/api/admin/logs?limit=${state.logs.limit}`);
  renderLogs(payload.data.items);
  setLogsStatus(
    `最近刷新：${formatRefreshTime(new Date())}，显示最近 ${payload.data.limit} 条请求日志`
  );
}

export function bindLogs() {
  byId("logs-limit").addEventListener("change", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    state.logs.limit = Number(target.value);
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
