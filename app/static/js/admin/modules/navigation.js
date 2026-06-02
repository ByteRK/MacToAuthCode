const ACTIVE_PANEL_STORAGE_KEY = "auth-platform-active-panel";

function saveActivePanel(targetId) {
  try {
    window.localStorage.setItem(ACTIVE_PANEL_STORAGE_KEY, targetId);
  } catch (error) {
    console.warn("[dashboard] unable to persist active panel", error);
  }
}

export function getInitialPanelTarget() {
  const fallbackTarget = "overview-panel";
  try {
    const targetId = window.localStorage.getItem(ACTIVE_PANEL_STORAGE_KEY);
    if (!targetId) {
      return fallbackTarget;
    }
    const targetButton = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    const targetPanel = document.getElementById(targetId);
    return targetButton && targetPanel ? targetId : fallbackTarget;
  } catch (error) {
    console.warn("[dashboard] unable to read active panel", error);
    return fallbackTarget;
  }
}

export function switchPanel(targetId, options = {}) {
  const { emitEvent = true, persist = true } = options;
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.target === targetId);
  });
  document.querySelectorAll(".content-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
  if (persist) {
    saveActivePanel(targetId);
  }
  if (emitEvent) {
    document.dispatchEvent(
      new CustomEvent("admin:panelchange", {
        detail: { targetId },
      }),
    );
  }
}

export function bindSidebar() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      switchPanel(button.dataset.target);
    });
  });
}
