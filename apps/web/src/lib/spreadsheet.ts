import "server-only";
import { IMPORT_COLUMNS, mapHeaders, MAX_IMPORT_ROWS, type CellValue } from "@fyh/shared";
import ExcelJS from "exceljs";
import Papa from "papaparse";

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

export interface ParsedSheet {
  records: Array<Record<string, CellValue>>;
  unknownHeaders: string[];
  missingRequired: string[];
  tooManyRows: boolean;
}

export class SpreadsheetError extends Error {}

/** Normalises ExcelJS cell values (hyperlinks, formulas, rich text, dates) to plain values. */
function cellValue(value: ExcelJS.CellValue): CellValue {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if ("hyperlink" in value && typeof value.hyperlink === "string") {
      // A cell showing link text: prefer the link target when the text is not itself a URL.
      const text = typeof value.text === "string" ? value.text : "";
      return /^https?:\/\//.test(text) ? text : value.hyperlink;
    }
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    if ("result" in value) return cellValue(value.result as ExcelJS.CellValue);
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("error" in value) return null;
  }
  return String(value);
}

function toRecords(headers: string[], rows: CellValue[][]): ParsedSheet {
  const { indexByHeader, unknown, missingRequired } = mapHeaders(headers);
  const nonEmpty = rows.filter((row) => row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ""));
  const records = nonEmpty.slice(0, MAX_IMPORT_ROWS).map((row) => {
    const record: Record<string, CellValue> = {};
    for (const column of IMPORT_COLUMNS) {
      const index = indexByHeader.get(column.header);
      if (index !== undefined) record[column.header] = row[index] ?? null;
    }
    return record;
  });
  return { records, unknownHeaders: unknown, missingRequired, tooManyRows: nonEmpty.length > MAX_IMPORT_ROWS };
}

export async function readSpreadsheet(bytes: ArrayBuffer, fileName: string): Promise<ParsedSheet> {
  if (bytes.byteLength > MAX_IMPORT_FILE_BYTES) throw new SpreadsheetError("The file is larger than 5 MB. Split it into smaller files.");
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: "greedy" });
    if (parsed.errors.length && !parsed.data.length) throw new SpreadsheetError("The CSV file could not be read.");
    const [headers = [], ...rows] = parsed.data;
    return toRecords(headers.map(String), rows);
  }

  if (lower.endsWith(".xlsx")) {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(bytes);
    } catch {
      throw new SpreadsheetError("The Excel file could not be read. Save it as .xlsx and try again.");
    }
    const sheet = workbook.getWorksheet("Listings") ?? workbook.worksheets[0];
    if (!sheet) throw new SpreadsheetError("The Excel file has no sheets.");
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, column) => {
      headers[column - 1] = String(cellValue(cell.value) ?? "");
    });
    const rows: CellValue[][] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: CellValue[] = [];
      row.eachCell({ includeEmpty: true }, (cell, column) => {
        values[column - 1] = cellValue(cell.value);
      });
      rows.push(values);
    });
    return toRecords(headers, rows);
  }

  throw new SpreadsheetError("Upload an Excel (.xlsx) or CSV (.csv) file. Older .xls files must be saved as .xlsx first.");
}
