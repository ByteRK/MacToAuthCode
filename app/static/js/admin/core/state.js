export const state = {
  selectedPid: "",
  allocations: { page: 1, pageSize: 20, search: "", totalPages: 1 },
  inventorySummary: { page: 1, pageSize: 20, search: "", totalPages: 1 },
  codeDetails: { page: 1, pageSize: 20, search: "", status: "all", totalPages: 1 },
  logs: {
    limit: 20,
    action: "all",
    autoRefresh: true,
    intervalMs: 5000,
    timerId: null,
    panelActive: false,
    hasLoaded: false,
    seenLogIds: [],
  },
};
