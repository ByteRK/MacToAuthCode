import * as XLSX from 'xlsx'

const CELL_REFERENCE = /^[A-Za-z]{1,3}[1-9]\d*$/

/**
 * 外部工具（如 openpyxl）保存 xlsx 时可能写入小于真实数据的 <dimension>，
 * 而 SheetJS 会直接把该值当作 !ref，并且只在 !ref 范围内导出数据，
 * 于是文件中真实存在的行会被静默丢弃（表现为“只识别到一行”）。
 * 这里按工作表中真实存在的单元格重算范围，保证解析覆盖全部数据。
 */
export function expandSheetRange(sheet: XLSX.WorkSheet): void {
  let range: XLSX.Range | undefined
  const declared = sheet['!ref']
  if (typeof declared === 'string') {
    try {
      range = XLSX.utils.decode_range(declared)
    } catch {
      range = undefined
    }
  }
  for (const key of Object.keys(sheet)) {
    if (key.startsWith('!') || !CELL_REFERENCE.test(key)) continue
    const { r, c } = XLSX.utils.decode_cell(key)
    if (!range) {
      range = { s: { r, c }, e: { r, c } }
      continue
    }
    if (r < range.s.r) range.s.r = r
    if (c < range.s.c) range.s.c = c
    if (r > range.e.r) range.e.r = r
    if (c > range.e.c) range.e.c = c
  }
  if (range) sheet['!ref'] = XLSX.utils.encode_range(range)
}
