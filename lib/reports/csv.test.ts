import { describe, expect, it } from "vitest";
import { cellText, csvCell, csvLine, decodeSpreadsheet, encodeUtf16le, SPREADSHEET_BOM, spreadsheetText, toSpreadsheet } from "./csv";

/** How a spreadsheet splits a file on a separator, the way Excel does for a .csv in a ";" regional format. */
function splitOn(text: string, separator: string): string[] {
  return text.split(/\r\n|\r|\n/).flatMap((line) => line.split(separator));
}

/** Every piece a parser could make of the file (TAB, comma or semicolon) must not start a formula. */
function expectNoFormulaPiece(text: string) {
  for (const separator of ["\t", ",", ";"]) {
    for (const piece of splitOn(text, separator)) {
      expect(piece.replace(/^"+/, "").trimStart(), `piece "${piece}" split on "${separator}"`).not.toMatch(/^[=+\-@＝＋－＠]/);
    }
  }
}

describe("csvCell", () => {
  it("writes plain text and numbers as they are", () => {
    expect(csvCell("غرفة 12")).toBe("غرفة 12");
    expect(csvCell(87)).toBe("87");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
    // A comma is ordinary text now (TAB separates the cells).
    expect(csvCell("Ward 3, bed 2")).toBe("Ward 3, bed 2");
  });

  it("keeps every cell on one line: TAB, CR, LF and other control characters become a space, edges are trimmed", () => {
    expect(csvCell("line1\nline2")).toBe("line1 line2");
    expect(csvCell("crlf\r\nx")).toBe("crlf x");
    expect(csvCell("a\tb")).toBe("a b");
    expect(csvCell("a\u0000b\u0085c\u2028d")).toBe("a b c d");
    expect(csvCell("  padded \t")).toBe("padded");
  });

  it("quotes a cell that holds a double quote, so the quote stays text", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    // A cell that starts with a quote cannot smuggle a formula behind it.
    expect(csvCell('"=1+1')).toBe('"""=1+1"');
    expect(csvCell('""=1+1')).toBe('"""""=1+1"');
  });

  it("neutralises formulas (CSV injection): = + - @ at the start, also full-width and behind invisible marks", () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell("+1+2")).toBe("'+1+2");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\t=1")).toBe("'=1");
    expect(csvCell("\r\n=1")).toBe("'=1");
    expect(csvCell("＝1+1")).toBe("'＝1+1");
    expect(csvCell("‏=1+1")).toBe("'‏=1+1");
    expect(csvCell("​ @x")).toBe("'​ @x");
    // Not at the start and not after a separator: left alone.
    expect(csvCell("a=b")).toBe("a=b");
    expect(csvCell("2-3 beds")).toBe("2-3 beds");
  });

  it("neutralises a formula after a ; or , inside a cell (a program splitting on them finds no formula either)", () => {
    expect(cellText("x;=1+1;")).toBe("x;'=1+1;");
    expect(cellText("x; =1+1")).toBe("x; '=1+1");
    expect(cellText("a, -b")).toBe("a, '-b");
    expect(cellText("y;=WEBSERVICE(CHAR(104)&B3);")).toBe("y;'=WEBSERVICE(CHAR(104)&B3);");
    expect(cellText("x；=1")).toBe("x；'=1");
    // The review's payloads, as a whole row: no piece starts a formula, whatever the separator.
    const text = spreadsheetText(["Trainee", "Score"], [["x;=1+1;", 79], ["z\r\n=7+7;", 100], ["=HYPERLINK(\"h\")", 1], ["a,@b", 2]]);
    expectNoFormulaPiece(text);
  });
});

describe("the file", () => {
  it("is BOM + rows of TAB-separated cells, CRLF after every row", () => {
    const text = spreadsheetText(["المنطقة", "الدرجة"], [["مغسلة الغرفة 3", 92], ["=cmd", null]]);
    expect(text).toBe(`${SPREADSHEET_BOM}المنطقة\tالدرجة\r\nمغسلة الغرفة 3\t92\r\n'=cmd\t\r\n`);
    expect(csvLine(["x", 1, null])).toBe("x\t1\t");
  });

  it("ends with its notes after an empty row (e.g. that the export was cut)", () => {
    const text = spreadsheetText(["a"], [["1"]], ["Only the newest 10,000 rows"]);
    expect(text).toBe(`${SPREADSHEET_BOM}a\r\n1\r\n\r\nOnly the newest 10,000 rows\r\n`);
  });

  it("is UTF-16 little endian with the BOM FF FE first, Arabic included, and reads back the same", () => {
    const bytes = toSpreadsheet(["المنطقة", "Score"], [["مغسلة 3", 92]]);
    expect([...bytes.slice(0, 2)]).toEqual([0xff, 0xfe]);
    // "ا" (U+0627) is 27 06 in UTF-16LE.
    expect([...bytes.slice(2, 4)]).toEqual([0x27, 0x06]);
    expect(decodeSpreadsheet(bytes)).toEqual([
      ["المنطقة", "Score"],
      ["مغسلة 3", "92"],
    ]);
    // Characters outside the Basic Multilingual Plane keep their surrogate pair.
    expect(new TextDecoder("utf-16le").decode(encodeUtf16le("😷"))).toBe("😷");
  });
});
