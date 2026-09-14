import {describe,expect,it} from "vitest";
import {createCsv,safeCsvCell} from "@/features/exports/csv";
describe("CSV export",()=>{it("カンマと引用符をエスケープする",()=>expect(safeCsvCell('山田, "太郎"')).toBe('"山田, ""太郎"""'));it("表計算ソフトの数式注入を防ぐ",()=>expect(safeCsvCell("=HYPERLINK('bad')")).toBe('"\'=HYPERLINK(\'bad\')"'));it("Excel向けBOMとCRLFを付ける",()=>{const csv=createCsv(["氏名"],[["山田"]]);expect(csv.startsWith("\uFEFF")).toBe(true);expect(csv.endsWith("\r\n")).toBe(true)})});
