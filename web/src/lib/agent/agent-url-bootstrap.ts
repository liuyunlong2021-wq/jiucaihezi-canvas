export type AgentConnectionMode = "codex" | "tools";

export function agentSessionMode(hash: string, stored: string | null): AgentConnectionMode {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    const mode = params.get("agentMode");
    if (mode) return mode === "tools" ? "tools" : "codex";
    if (hasAgentUrlBootstrap(hash)) return "codex";
    return stored === "tools" ? "tools" : "codex";
}

export function hasAgentUrlBootstrap(hash: string) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    return params.has("agentUrl") || params.has("agentToken");
}

export function readAgentUrlBootstrap(hash: string) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    if (!params.has("agentUrl") && !params.has("agentToken")) return null;
    const url = params.get("agentUrl")?.trim() || "";
    const token = params.get("agentToken")?.trim() || "";
    const mode = agentSessionMode(hash, null);
    params.delete("agentUrl");
    params.delete("agentToken");
    params.delete("agentMode");
    const remaining = params.toString();
    return { url, token, mode, remainingHash: remaining ? `#${remaining}` : "" };
}
