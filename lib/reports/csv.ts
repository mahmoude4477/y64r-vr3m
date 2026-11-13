/**
 * The institution export file (/api/reports/export): a table that opens the same way in Excel in EVERY regional
 * format, Arabic first, and never runs anything a user typed.
 *
 * Format: UTF-16LE with a byte-order mark, TAB between cells, CRLF after every row (Excel's own "Unicode text";
 * the .csv name keeps the double-click association with Excel).
 * - Why not comma-separated UTF-8: Excel splits a double-clicked .csv on the Windows list separator, which is ";"
 *   in Arabic (Saudi Arabia), Arabic (UAE / Egypt / Kuwait) and many European formats. The whole row then lands in
 *   one cell, and a ";" inside a value starts a new cell (review SEC-1 / SEC-2, checked in Excel 16). A "sep=," first
 *   line fixes the columns but makes Excel ignore the BOM, so the Arabic turns into mojibake. A UTF-16LE file with a
 *   BOM is read as Unicode text and split on TAB whatever the list separator is; LibreOffice, Numbers and Google
 *   Sheets detect it too.
 * - A cell can never start a new cell or a new row: in text cells TAB, CR, LF and every other control character
 *   (C0, DEL, C1, U+2028/U+2029) become one space, and the text is trimmed. A cell that holds a double quote is
 *   quoted ("" for the quote), so Excel keeps the quote as text.
 * - Formula injection (OWASP "CSV injection"): a text cell whose first visible character is = + - @ (or the
 *   full-width ＝ ＋ － ＠) gets a leading ', so a name such as "=HYPERLINK(...)" is shown as text, never run. The
 *   same is done after every , or ; inside a cell (defence in depth: a program told to split on those must not find
 *   a formula at the start of a piece either). Invisible format characters (bidi marks, zero-width spaces) in front
 *   of the trigger do not hide it.
 * Numbers are written as plain numbers (never prefixed). Pure and dependency-free: unit-tested in csv.test.ts.
 */

export type CsvValue = string | number | null | undefined;

export const SPREADSHEET_BOM = "﻿";
export const SPREADSHEET_CONTENT_TYPE = "text/csv; charset=utf-16le";
export const CELL_SEPARATOR = "\t";
export const ROW_END = "\r\n";

/** Control characters: C0 (TAB, LF, CR included), DEL, C1 (NEL included), line and paragraph separators. */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g;
/** The first visible character starts a formula (format characters and spaces in front of it do not count). */
const FORMULA_START = /^[\p{Cf}\s]*[=+\-@＝＋－＠]/u;
/** A , or ; (ASCII or full-width) followed by a formula trigger. */
const AFTER_SEPARATOR = /([,;，；][\p{Cf}\s]*)(?=[=+\-@＝＋－＠])/gu;

/** The text a cell shows: one line, trimmed, formulas neutralised (no quoting yet). */
export function cellText(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = value.replace(CONTROL, " ").trim();
  text = text.replace(AFTER_SEPARATOR, "$1'");
  if (FORMULA_START.test(text)) text = `'${text}`;
  return text;
}

/** One cell as written to the file. */
export function csvCell(value: CsvValue): string {
  const text = cellText(value);
  return text.includes('"') ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvLine(values: readonly CsvValue[]): string {
  return values.map(csvCell).join(CELL_SEPARATOR);
}

/**
 * The file's text: BOM + header + rows, CRLF after every row. `notes` (e.g. "the export was cut") follow after an
 * empty row, one cell each, so the file itself says what it holds when it is forwarded.
 */
export function spreadsheetText(
  header: readonly string[],
  rows: ReadonlyArray<readonly CsvValue[]>,
  notes: readonly string[] = [],
): string {
  const lines = [header, ...rows].map(csvLine);
  if (notes.length > 0) lines.push("", ...notes.map((note) => csvCell(note)));
  return SPREADSHEET_BOM + lines.join(ROW_END) + ROW_END;
}

/** UTF-16 little endian bytes of a string (JavaScript strings are UTF-16 already: each code unit is two bytes). */
export function encodeUtf16le(text: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    bytes[2 * i] = unit & 0xff;
    bytes[2 * i + 1] = unit >> 8;
  }
  return bytes;
}

/** The whole file as bytes (see the header comment). */
export function toSpreadsheet(
  header: readonly string[],
  rows: ReadonlyArray<readonly CsvValue[]>,
  notes: readonly string[] = [],
): Uint8Array<ArrayBuffer> {
  return encodeUtf16le(spreadsheetText(header, rows, notes));
}

/** Reads such a file back (tests, and the e2e check): BOM dropped, rows split on CRLF, cells on TAB. */
export function decodeSpreadsheet(bytes: Uint8Array): string[][] {
  const text = new TextDecoder("utf-16le").decode(bytes);
  const body = text.startsWith(SPREADSHEET_BOM) ? text.slice(1) : text;
  return body
    .split(ROW_END)
    .slice(0, -1)
    .map((line) => line.split(CELL_SEPARATOR));
}
