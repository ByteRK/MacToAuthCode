import { bindSidebar } from "./modules/navigation.js";
import { loadOverview } from "./modules/overview.js";
import { bindAllocationSearch, loadAllocations } from "./modules/allocations.js";
import { bindInventory, loadInventorySummary, loadCodeDetails } from "./modules/inventory.js";
import { bindImporter } from "./modules/importer.js";
import { bindPayloadModal } from "./modules/modal.js";

async function bootstrap() {
  bindSidebar();
  bindPayloadModal();
  bindAllocationSearch();
  bindInventory();
  bindImporter({
    refreshOverview: loadOverview,
    refreshAllocations: loadAllocations,
    refreshInventory: loadInventorySummary,
    refreshCodeDetails: loadCodeDetails,
  });

  await Promise.all([loadOverview(), loadAllocations(), loadInventorySummary()]);
}

bootstrap().catch((error) => {
  console.error(error);
});
