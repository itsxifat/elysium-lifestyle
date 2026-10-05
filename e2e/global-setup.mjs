import { startMailSink } from "./mail-sink.mjs";

// The mail sink the ERP's worker sends the shop's emails to during the run. If
// one is already listening (started by hand), it is used as it is.
export default async function globalSetup() {
  try {
    const sink = await startMailSink();
    return async () => sink.stop();
  } catch (error) {
    if (error?.code === "EADDRINUSE") return undefined;
    throw error;
  }
}
