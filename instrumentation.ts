import type { Instrumentation } from "next";

// Next calls register() once per server process and onRequestError() for errors thrown while rendering, in route
// handlers, server actions and the proxy (note 09 §4.2). Both log through lib/log.ts: one JSON line, no personal
// data. Our line has the digest, route and reqId as one searchable event (`@event:http.request.error`); under
// `next start` the multi-line copy Next prints next is dropped, and every other console.error / console.warn becomes
// one JSON line too (routeConsoleToLog in lib/log.ts). The work lives in instrumentation-node.ts, imported only on
// Node.js.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { onServerStart } = await import("./instrumentation-node");
    onServerStart();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logRequestError } = await import("./instrumentation-node");
    await logRequestError(err, request, context);
  }
};
