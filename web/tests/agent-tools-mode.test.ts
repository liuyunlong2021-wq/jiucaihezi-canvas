import { expect, test } from "bun:test";
// i18n reads the browser locale during module initialization.
const storage = new Map<string, string>();
if (typeof localStorage === "undefined") Object.defineProperty(globalThis, "localStorage", {
    value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) },
    configurable: true,
});
const { useAgentStore } = await import("../src/stores/use-agent-store");
const { fetchAgentJson } = await import("../src/services/api/canvas-agent");

test("tools mode cannot issue Codex HTTP requests, while normal Codex mode still can", async () => {
    const originalFetch = globalThis.fetch;
    const originalMode = useAgentStore.getState().connectionMode;
    const calls: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
        calls.push(String(input));
        return Response.json({ ok: true });
    }) as typeof fetch;
    try {
        useAgentStore.setState({ connectionMode: "tools" });
        for (const path of ["/agent/codex/threads/reset", "/agent/codex/threads", "/agent/codex/models", "/agent/codex/skills", "/agent/codex/turn"]) {
            await expect(fetchAgentJson("http://127.0.0.1:17371", "test", path)).rejects.toThrow();
        }
        expect(calls).toHaveLength(0);
        await fetchAgentJson("http://127.0.0.1:17371", "test", "/canvas/result", { method: "POST" });
        expect(calls).toHaveLength(1);
        useAgentStore.setState({ connectionMode: "codex" });
        await fetchAgentJson("http://127.0.0.1:17371", "test", "/agent/codex/models");
        expect(calls).toHaveLength(2);
    } finally {
        globalThis.fetch = originalFetch;
        useAgentStore.setState({ connectionMode: originalMode });
    }
});
