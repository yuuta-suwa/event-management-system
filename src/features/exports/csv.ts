export function safeCsvCell(value:unknown){let text=value==null?"":String(value);if(/^[=+\-@]/.test(text))text=`'${text}`;return `"${text.replaceAll('"','""')}"`}
export function createCsv(headers:string[],rows:unknown[][]){return `\uFEFF${[headers,...rows].map(row=>row.map(safeCsvCell).join(",")).join("\r\n")}\r\n`}
