import { ChevronDownIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { TableFrame } from "./table-frame";

/**
 * The table twin of a chart (dataviz: every chart has one; WCAG: the values without the picture). A native
 * disclosure, so it works with the keyboard and screen readers without script; `open` prints it expanded.
 */
export function ChartDataTable({
  summary,
  caption,
  columns,
  rows,
  open = false,
}: {
  summary: string;
  caption: string;
  columns: readonly string[];
  rows: ReadonlyArray<{ key: string; cells: readonly React.ReactNode[] }>;
  open?: boolean;
}) {
  return (
    <details className="group mt-3 rounded-lg border print:border-0" open={open || undefined}>
      <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none select-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 print:hidden [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon aria-hidden className="size-4 transition-transform group-open:rotate-180" />
        {summary}
      </summary>
      <div className="border-t px-1 pb-1 print:border-0">
        <DataTable caption={caption} columns={columns} rows={rows} />
      </div>
    </details>
  );
}

/**
 * A plain data table: the first cell of each row is its row header, numbers align to the end. Cells wrap, so the
 * table fits a phone; when it still does not, its frame scrolls (TableFrame).
 */
export function DataTable({
  caption,
  columns,
  rows,
  captionVisible = false,
}: {
  caption: string;
  columns: readonly string[];
  rows: ReadonlyArray<{ key: string; cells: readonly React.ReactNode[] }>;
  captionVisible?: boolean;
}) {
  return (
    <TableFrame label={caption}>
      <Table>
        <caption className={cn(captionVisible ? "mb-2 text-start text-sm text-muted-foreground" : "sr-only")}>{caption}</caption>
        <TableHeader>
          <TableRow>
            {columns.map((c, i) => (
              <TableHead key={c} scope="col" className={cn("whitespace-normal", i > 0 && "text-end")}>
                {c}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              {row.cells.map((cell, i) =>
                i === 0 ? (
                  <TableHead key={i} scope="row" className="font-normal whitespace-normal">
                    {cell}
                  </TableHead>
                ) : (
                  <TableCell key={i} className="text-end whitespace-normal tabular-nums">
                    {cell}
                  </TableCell>
                ),
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableFrame>
  );
}
