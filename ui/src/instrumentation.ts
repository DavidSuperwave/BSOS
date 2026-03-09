export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { runProvisionerStartupPreflight } = await import(
      "@/lib/provisioner-ssh"
    );
    runProvisionerStartupPreflight();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
