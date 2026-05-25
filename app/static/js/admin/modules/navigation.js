export function switchPanel(targetId) {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.classList.toggle("active", button.dataset.target === targetId);
  });
  document.querySelectorAll(".content-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
  document.dispatchEvent(
    new CustomEvent("admin:panelchange", {
      detail: { targetId },
    }),
  );
}

export function bindSidebar() {
  document.querySelectorAll(".nav-link").forEach((button) => {
    button.addEventListener("click", () => {
      switchPanel(button.dataset.target);
    });
  });
}
