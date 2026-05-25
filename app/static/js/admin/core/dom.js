export const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderRows(targetId, rows, columns, emptyText) {
  const body = byId(targetId);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="${columns.length}">${emptyText}</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const tds = columns
        .map((column) => {
          if (column.type === "status") {
            return `<td><span class="status-chip ${escapeHtml(row[column.key])}">${escapeHtml(row[column.key] || "-")}</span></td>`;
          }
          if (column.type === "action") {
            return `<td><button type="button" class="table-action" data-pid="${escapeHtml(row.pid)}">查看明细</button></td>`;
          }
          if (column.type === "payload") {
            if (!row.payload_preview) {
              return "<td>-</td>";
            }
            return `<td><button type="button" class="table-action payload-action" data-title="${escapeHtml(column.title || "载荷详情")}" data-payload="${encodeURIComponent(row.payload_preview)}">查看载荷</button></td>`;
          }
          return `<td>${escapeHtml(row[column.key] ?? "-")}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
}

export function renderTableMeta(targetId, result, label) {
  const node = byId(targetId);
  if (!node) {
    return;
  }
  const start = result.total === 0 ? 0 : (result.page - 1) * result.page_size + 1;
  const end = Math.min(result.page * result.page_size, result.total);
  node.textContent = `${label}：第 ${result.page} 页，显示 ${start}-${end} / 共 ${result.total} 条`;
}
