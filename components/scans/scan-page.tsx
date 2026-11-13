/**
 * The frame of every /scans page. The shell's <main> may shrink (SidebarInset min-w-0), and `contain: inline-size`
 * keeps the page's own content (a wide table, a long unbreakable label) from widening it. Inside the frame, tables
 * scroll in their own container and text wraps.
 */
export function ScanPageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div data-scan-page className="flex flex-col gap-6 [contain:inline-size]">
      {children}
    </div>
  );
}

const BREADCRUMB_MAX = 40;

/** The last breadcrumb shows a long area label shortened (the breadcrumb never wraps); the h1 has it in full. */
export function breadcrumbText(label: string): string {
  const chars = Array.from(label.trim());
  return chars.length <= BREADCRUMB_MAX ? label.trim() : `${chars.slice(0, BREADCRUMB_MAX - 1).join("").trimEnd()}…`;
}
