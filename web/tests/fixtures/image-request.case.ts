import { afterAll, expect, mock, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fkImageModels } from "../../src/lib/newapi-media-contract";
const posts: Array<{ url: string; body: any }> = [];
const pluginRoot = process.env.NEWAPI_PLUGINS_DIR || resolve(import.meta.dir, "../../../../jiucaihezi-app/newapi-plugins");
const hasPlugins = ["fk", "xiaoyi-image", "yihong", "lingdong"].every((file) => existsSync(join(pluginRoot, `${file}.plugin.js`)));
const contractCases: Array<{ file: string; model: string; edit: boolean; body: any }> = [];
if (!hasPlugins) console.warn("EXTERNAL_CONTRACT_UNAVAILABLE: set NEWAPI_PLUGINS_DIR to verify the real NewAPI plugins; service checks still run.");
mock.module("@/i18n", () => ({ default: { t: (key: string) => key } }));
mock.module("@/services/image-storage", () => ({
    imageToDataUrl: async (image: { dataUrl: string }, options?: { signal?: AbortSignal }) => {
        options?.signal?.throwIfAborted();
        return image.dataUrl;
    },
}));
mock.module("axios", () => ({
    default: {
        post: async (url: string, body: unknown) => {
            posts.push({ url, body });
            return { data: { data: [{ b64_json: "eA==" }] } };
        },
        isAxiosError: () => false,
    },
}));
const { defaultConfig, guessCapability } = await import("../../src/stores/use-config-store");
const { requestGeneration, requestEdit } = await import("../../src/services/api/image");
const oldFetch = globalThis.fetch;
const uploads: Array<{ url: string; options?: RequestInit }> = [];
let uploadStatus = 204;
let abortAfterUpload: AbortController | undefined;
globalThis.fetch = mock(async (url: RequestInfo | URL, options?: RequestInit) => {
    if (String(url).startsWith("data:")) return oldFetch(url, options);
    uploads.push({ url: String(url), options });
    const root = "https://d055e5deea504cb25551755cc486a61a.r2.cloudflarestorage.com/jiucaihezi-media-test/lingdong-temp/17/" + "a".repeat(32) + ".png";
    if (String(url).endsWith("/api/creations/lingdong/upload-url")) return Response.json({ method: "PUT", headers: { "Content-Type": "image/png" }, upload_url: root + "?X-Amz-Signature=put&X-Amz-Expires=300", asset_url: root + "?X-Amz-Signature=get&X-Amz-Expires=21600" });
    abortAfterUpload?.abort();
    return new Response(null, { status: uploadStatus });
}) as typeof fetch;
afterAll(() => { globalThis.fetch = oldFetch; mock.restore(); });
const models = {
    fk: fkImageModels,
    "xiaoyi-image": [
        "gpt-image-2-1k",
        "gpt-image-2-超分",
        "gpt-image-2.5-1k",
        "gpt-image-2.5-flare-1k",
        "gpt-image-2.5-sunburst-1k",
        "gpt-image-2.5-官方",
        "gpt-image-2.5-flare-官方",
        "gpt-image-2.5-sunburst-官方",
        "gpt-image-2.5-flare-CF-超分",
        "gpt-image-2.5-sunburst-CF-超分",
        "grok-imagine-image-2.0",
        "grok-imagine-image",
    ],
    yihong: ["gemini-nano-banana-2.1", "gpt-image-2-1K-4K", "gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "yihong-gpt-image-2", "yihong-gpt-image-2.5-flare", "yihong-gpt-image-2.5-sunburst"],
};
function config(model: string, baseUrl = "https://api.jiucaihezi.studio") {
    return {
        ...defaultConfig,
        model: `fixture::${model}`,
        quality: "high",
        size: "9:16",
        count: "1",
        channels: [{ id: "fixture", name: "fixture", baseUrl, apiKey: "fixture-token", apiFormat: "openai" as const, models: [{ name: model, capability: "image" as const }] }],
    };
}
test("all known image models assemble generation and edit bodies", async () => {
    for (const [file, names] of Object.entries(models)) {
        for (const model of names)
            for (const edit of [false, true]) {
                const cfg = config(model);
                if (edit) await requestEdit(cfg, "p", [{ id: "ref", name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,eA==" }]);
                else await requestGeneration(cfg, "p");
                const { url, body } = posts.at(-1)!;
                expect(url).toEndWith(edit ? "/images/edits" : "/images/generations");
                expect(body instanceof FormData ? body.get("response_format") : body.response_format).toBe("b64_json");
                contractCases.push({ file, model, edit, body });
            }
    }
});
test.skipIf(!hasPlugins)("actual external plugins accept the generated image contracts", async () => {
    for (const { file, model, edit, body } of contractCases) {
        const plugin = await import(join(pluginRoot, `${file}.plugin.js`));
        const fields = body instanceof FormData ? Object.fromEntries([...body.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, [value]])) : undefined;
        const ctx = {
            model,
            upstreamModel: model,
            baseUrl: plugin.meta.baseUrl,
            apiKey: "fixture-upstream-key",
            operation: edit ? "edit" : "generate",
            body: fields ? { kind: "multipart", fields, files: [{ name: "image", ref: "request_file:image", filename: "a.png", mimeType: "image/png" }] } : { kind: "json", value: body },
        };
        const intent = plugin.protocols.openai_image.decodeRequest(ctx);
        expect(intent.action).toBe(edit ? "image_to_image" : "text_to_image");
        expect(plugin.buildSubmitRequest({ ...ctx, requestBody: intent.requestBody, action: intent.action }).method).toBe("POST");
    }
});
test("Lingdong images upload original bytes to R2 then submit JSON, never multipart edits", async () => {
    for (const model of ["灵动-gpt-image-2.5-flare", "灵动-gpt-image-2.5-sunburst"]) {
        const before = uploads.length;
        await requestEdit(config(model), "两人跳舞", [{ id: "ref", name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,eA==" }]);
        const [grant, put] = uploads.slice(before);
        expect(grant.url).toEndWith("/api/creations/lingdong/upload-url");
        expect(JSON.parse(String(grant.options?.body))).toMatchObject({ model, size: 1, content_type: "image/png" });
        expect(put.options?.method).toBe("PUT");
        expect(await (put.options?.body as Blob).text()).toBe("x");
        const { url, body } = posts.at(-1)!;
        expect(url).toEndWith("/images/generations");
        expect(body).not.toBeInstanceOf(FormData);
        expect(body).toMatchObject({ model, n: 1, images: [put.url.replace("Signature=put&X-Amz-Expires=300", "Signature=get&X-Amz-Expires=21600")] });
        if (hasPlugins) {
            const plugin = await import(join(pluginRoot, "lingdong.plugin.js"));
            const context = { model, body: { kind: "json", value: body }, baseUrl: plugin.meta.baseUrl, apiKey: "fixture" };
            const intent = plugin.protocols.openai_image.decodeRequest(context);
            expect(intent.action).toBe("image_to_image");
            expect(plugin.buildSubmitRequest({ ...context, requestBody: intent.requestBody }).body.model).toBe(model.slice(3));
        }
        const count = uploads.length;
        await requestGeneration(config(model), "海边");
        expect(uploads.length).toBe(count);
        expect(posts.at(-1)!.body.model).toBe(model);
    }
});
test("Lingdong image upload failure or cancellation never submits a generation", async () => {
    const count = posts.length;
    try {
        uploadStatus = 403;
        await expect(requestEdit(config("灵动-gpt-image-2.5-flare"), "p", [{ id: "r", name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,eA==" }])).rejects.toThrow();
        uploadStatus = 204;
        abortAfterUpload = new AbortController();
        await expect(requestEdit(config("灵动-gpt-image-2.5-flare"), "p", [{ id: "r", name: "a.png", type: "image/png", dataUrl: "data:image/png;base64,eA==" }], { signal: abortAfterUpload.signal })).rejects.toThrow();
        expect(posts.length).toBe(count);
    } finally { uploadStatus = 204; abortAfterUpload = undefined; }
});
test("direct OpenAI gpt-image contract is unchanged", async () => {
    await requestGeneration(config("gpt-image-2", "https://api.openai.com"), "p");
    expect(posts.at(-1)!.body.response_format).toBeUndefined();
});
test("freshly fetched plugin image names are classified as images", () => {
    for (const names of Object.values(models)) for (const name of names) expect(guessCapability(name)).toBe("image");
});
test("platform Gemini image plugin still uses its OpenAI Images public contract", async () => {
    const cfg = config("gemini-nano-banana-2.1");
    await requestGeneration({ ...cfg, channels: cfg.channels.map((channel) => ({ ...channel, apiFormat: "gemini" as const })) }, "p");
    expect(posts.at(-1)!.url).toEndWith("/images/generations");
});
