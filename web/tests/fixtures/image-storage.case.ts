import { afterAll, expect, mock, test } from "bun:test";

const originals = new Map<string, Blob>();
mock.module("localforage", () => ({
    default: { createInstance: () => ({ getItem: async (key: string) => originals.get(key), setItem: async (key: string, blob: Blob) => originals.set(key, blob), removeItem: async (key: string) => originals.delete(key) }) },
}));
mock.module("@/lib/image-thumbnail", () => ({ createImageThumbnail: async () => undefined }));
mock.module("@/stores/use-config-store", () => ({ withLocalProxy: (url: string) => url }));
mock.module("@/i18n", () => ({ default: { t: (key: string) => key } }));
const { imageToDataUrl, uploadImage } = await import("../../src/services/image-storage");
const oldReader = globalThis.FileReader;
const oldWindow = globalThis.window;
const oldFetch = globalThis.fetch;
globalThis.window = globalThis as unknown as Window & typeof globalThis;
globalThis.FileReader = class {
    result = "";
    onload: (() => void) | null = null;
    async readAsDataURL(blob: Blob) {
        this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`;
        this.onload?.();
    }
} as unknown as typeof FileReader;
afterAll(() => {
    globalThis.FileReader = oldReader;
    globalThis.window = oldWindow;
    globalThis.fetch = oldFetch;
    mock.restore();
});

test("reference uses stored original before an unreadable display URL", async () => {
    originals.set("image:original", new Blob(["original bytes"], { type: "image/png" }));
    let calls = 0;
    globalThis.fetch = mock(async () => {
        calls++;
        throw new TypeError("CORS");
    }) as unknown as typeof fetch;
    expect(await imageToDataUrl({ storageKey: "image:original", dataUrl: "https://unreadable.invalid/a.png" })).toBe("data:image/png;base64,b3JpZ2luYWwgYnl0ZXM=");
    expect(calls).toBe(0);
});

test("aborted reference cannot return even a local data URL", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(imageToDataUrl({ dataUrl: "data:image/png;base64,eA==" }, { signal: controller.signal })).rejects.toThrow();
});

test("strict generation storage must not fall back to a display-only remote image", async () => {
    globalThis.fetch = mock(async () => {
        throw new TypeError("CORS");
    }) as unknown as typeof fetch;
    await expect(uploadImage("https://unreadable.invalid/a.png", { requireLocal: true })).rejects.toThrow("CORS");
});
