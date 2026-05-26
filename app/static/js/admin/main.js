import { bindSidebar } from "./modules/navigation.js";
import { loadOverview } from "./modules/overview.js";
import { bindAllocationSearch, loadAllocations } from "./modules/allocations.js";
import { bindInventory, loadInventorySummary, loadCodeDetails } from "./modules/inventory.js";
import { bindImporter } from "./modules/importer.js";
import { byId } from "./core/dom.js";
import { bindAccessControl, loadRequestIpWhitelistConfig } from "./modules/access_control.js";
import { bindLogs } from "./modules/logs.js";
import { bindPayloadModal } from "./modules/modal.js";

async function runLoader(loader, label) {
  try {
    await loader();
  } catch (error) {
    console.error(`[dashboard] ${label} load failed`, error);
  }
}

async function bootstrap() {
  bindSidebar();
  bindPayloadModal();
  bindAllocationSearch();
  bindInventory();
  bindLogs();
  bindAccessControl();
  bindImporter({
    refreshOverview: loadOverview,
    refreshAllocations: loadAllocations,
    refreshInventory: loadInventorySummary,
    refreshCodeDetails: loadCodeDetails,
  });

  const loaders = [
    runLoader(loadOverview, "overview"),
    runLoader(loadAllocations, "allocations"),
    runLoader(loadInventorySummary, "inventory-summary"),
  ];

  if (byId("request-ip-whitelist-form")) {
    loaders.push(runLoader(loadRequestIpWhitelistConfig, "request-ip-whitelist"));
  }

  await Promise.all(loaders);
}

bootstrap().catch((error) => {
  console.error(error);
});
