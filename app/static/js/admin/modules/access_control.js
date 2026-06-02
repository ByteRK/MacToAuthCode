import { fetchJson } from "../core/api.js";
import { byId } from "../core/dom.js";

function setRequestWhitelistResult(text) {
  const node = byId("request-ip-whitelist-result");
  if (node) {
    node.textContent = text;
  }
}

function applyRequestWhitelistForm(data) {
  const enabledInput = byId("request-ip-whitelist-enabled");
  const allowedIpsInput = byId("request-ip-whitelist-allowed-ips");
  if (enabledInput instanceof HTMLInputElement) {
    enabledInput.checked = Boolean(data.enabled);
  }
  if (allowedIpsInput instanceof HTMLTextAreaElement) {
    allowedIpsInput.value = (data.allowed_ips || []).join("\n");
  }
}

export async function loadRequestIpWhitelistConfig() {
  if (!byId("request-ip-whitelist-form")) {
    return;
  }
  const payload = await fetchJson("/api/admin/request-ip-whitelist");
  applyRequestWhitelistForm(payload.data);
  setRequestWhitelistResult(
    payload.data.enabled
      ? `白名单已启用，共 ${payload.data.allowed_ips.length} 条规则。`
      : "白名单当前处于关闭状态。"
  );
}

export function bindAccessControl() {
  const form = byId("request-ip-whitelist-form");
  const reloadButton = byId("request-ip-whitelist-reload");
  if (!(form instanceof HTMLFormElement) || !(reloadButton instanceof HTMLButtonElement)) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const enabledInput = byId("request-ip-whitelist-enabled");
    const allowedIpsInput = byId("request-ip-whitelist-allowed-ips");
    const enabled =
      enabledInput instanceof HTMLInputElement ? enabledInput.checked : false;
    const allowedIps =
      allowedIpsInput instanceof HTMLTextAreaElement
        ? allowedIpsInput.value
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean)
        : [];

    try {
      setRequestWhitelistResult("正在保存白名单配置...");
      const payload = await fetchJson("/api/admin/request-ip-whitelist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          allowed_ips: allowedIps,
        }),
      });
      applyRequestWhitelistForm(payload.data);
      setRequestWhitelistResult(payload.message);
    } catch (error) {
      setRequestWhitelistResult(error.message);
    }
  });

  reloadButton.addEventListener("click", async () => {
    try {
      setRequestWhitelistResult("正在重新加载白名单配置...");
      await loadRequestIpWhitelistConfig();
    } catch (error) {
      setRequestWhitelistResult(error.message);
    }
  });

  document.addEventListener("admin:panelchange", async (event) => {
    if (event.detail?.targetId !== "access-control-panel") {
      return;
    }
    try {
      setRequestWhitelistResult("正在刷新白名单配置...");
      await loadRequestIpWhitelistConfig();
    } catch (error) {
      setRequestWhitelistResult(error.message);
    }
  });
}
