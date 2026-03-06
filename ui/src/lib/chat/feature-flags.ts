export type ChatFeatureFlags = {
  enableStructuredDirectives: boolean;
  enableTaskRuntime: boolean;
  enableInboxUnifiedChat: boolean;
};

function isEnabled(name: string, defaultValue = true): boolean {
  const raw = process.env[name];
  if (raw === null || raw === undefined || raw === "") return defaultValue;
  const val = raw.toLowerCase();
  return val === "1" || val === "true" || val === "yes" || val === "on";
}

export function getChatFeatureFlags(): ChatFeatureFlags {
  return {
    enableStructuredDirectives: isEnabled("FF_CHAT_STRUCTURED_DIRECTIVES", true),
    enableTaskRuntime: isEnabled("FF_CHAT_TASK_RUNTIME", true),
    enableInboxUnifiedChat: isEnabled("FF_CHAT_INBOX_UNIFIED", true),
  };
}
