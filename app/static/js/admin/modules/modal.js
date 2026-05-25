import { byId } from "../core/dom.js";

function openPayloadModal(title, payloadText) {
  byId("payload-modal-title").textContent = title || "载荷详情";
  byId("payload-modal-content").textContent = payloadText || "{}";
  byId("payload-modal").classList.remove("hidden");
}

function closePayloadModal() {
  byId("payload-modal").classList.add("hidden");
}

export function bindPayloadModal() {
  byId("payload-modal-close").addEventListener("click", closePayloadModal);
  byId("payload-modal").addEventListener("click", (event) => {
    if (event.target === byId("payload-modal")) {
      closePayloadModal();
    }
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target.classList.contains("payload-action")) {
      openPayloadModal(
        target.dataset.title || "载荷详情",
        decodeURIComponent(target.dataset.payload || "%7B%7D"),
      );
    }
  });
}
