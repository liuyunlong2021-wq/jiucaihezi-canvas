import { afterAll, expect, mock, test } from "bun:test";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { videoContracts } from "../../src/lib/newapi-media-contract";

const posts: Array<{ url: string; body: unknown; options?: unknown }> = [];
let postError: Error | undefined;
let uploadSequence = 0;
let abortAfterUpload: AbortController | undefined;
const pluginRoot = process.env.NEWAPI_PLUGINS_DIR || resolve(import.meta.dir, "../../../../jiucaihezi-app/newapi-plugins");
const hasPlugins = ["fk", "xiaoyi-image", "yihong"].every((file) => existsSync(join(pluginRoot, `${file}.plugin.js`)));
if (!hasPlugins) console.warn("EXTERNAL_CONTRACT_UNAVAILABLE: set NEWAPI_PLUGINS_DIR to verify the real NewAPI plugins; service checks still run.");
const contractCases: Array<{ model: string; plugin: string; body: unknown }> = [];
let state: Record<string, unknown> = { id: "real-task-id", status: "queued" };
let content = new Blob(["video fixture"], { type: "video/mp4" });
let uploadStatus = 204;
let authorizationStatus = 200;
const gets: Array<{ url: string; options: unknown }> = [];
mock.module("@/i18n", () => ({ default: { t: (key: string) => key } }));
mock.module("axios", () => ({
    default: {
        post: async (url: string, body: unknown, options?: unknown) => {
            posts.push({ url, body, options });
            if (postError) throw postError;
            return { data: { id: "real-task-id" } };
        },
        get: async (url: string, options: unknown) => {
            gets.push({ url, options });
            return { data: url.endsWith("/content") ? content : state };
        },
        isCancel: () => false,
        isAxiosError: (error: { isAxiosError?: boolean }) => error?.isAxiosError === true,
    },
}));
mock.module("@/services/image-storage", () => ({
    imageToDataUrl: async (image: { dataUrl: string }, options?: { signal?: AbortSignal }) => {
        options?.signal?.throwIfAborted();
        return image.dataUrl;
    },
}));
const oldFetch = globalThis.fetch;
const requests: Array<{ url: string; options?: RequestInit }> = [];
globalThis.fetch = mock(async (url: RequestInfo | URL, options?: RequestInit) => {
    if (String(url).startsWith("data:")) return oldFetch(url, options);
    requests.push({ url: String(url), options });
    if (String(url).endsWith("/api/creations/upload-url")) {
        const key = `creation-temp/${++uploadSequence}`;
        return Response.json(
            { upload_url: "https://fixture.oss-cn-hangzhou.aliyuncs.com/", asset_url: `https://fixture.oss-cn-hangzhou.aliyuncs.com/${key}?exp=123&sig=keep%2Bsignature`, form_fields: { key, policy: "fixture" } },
            { status: authorizationStatus },
        );
    }
    abortAfterUpload?.abort();
    return new Response(null, { status: uploadStatus });
}) as typeof fetch;
const { defaultConfig, guessCapability, videoModelSelectionSeconds } = await import("../../src/stores/use-config-store");
const { createVideoGenerationTask, pollVideoGenerationTask } = await import("../../src/services/api/video");
const { validateUploadGrant } = await import("../../src/services/api/media-upload");
afterAll(() => {
    globalThis.fetch = oldFetch;
    mock.restore();
});
const reference = { id: "ref", name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,eA==" };
test("freshly fetched plugin video names are classified as videos", () => {
    for (const name of Object.keys(videoContracts)) expect(guessCapability(name)).toBe("video");
});
function config(model: string, seconds: number, resolution: string) {
    return {
        ...defaultConfig,
        model: `fixture::${model}`,
        videoSeconds: String(seconds),
        vquality: resolution,
        size: "9:16",
        videoMode: "reference",
        channels: [{ id: "fixture", name: "fixture", baseUrl: "https://api.jiucaihezi.studio", apiKey: "fixture-token", apiFormat: "openai" as const, models: [{ name: model, capability: "video" as const }] }],
    };
}
test("only new model selection supplies defaults without mutating existing config", () => {
    const cfg = config("grok-imagine-video-1.5", 10, "720p");
    expect(videoModelSelectionSeconds(cfg, cfg.model, "another-model")).toBe("6");
    expect(cfg.videoSeconds).toBe("10");
    expect(videoModelSelectionSeconds(cfg, cfg.model, cfg.model)).toBeUndefined();
    expect(videoModelSelectionSeconds({ ...cfg, channels: cfg.channels.map((channel) => ({ ...channel, baseUrl: "https://other.invalid" })) }, cfg.model, "another-model")).toBeUndefined();
    expect(videoModelSelectionSeconds({ ...cfg, channels: cfg.channels.map((channel) => ({ ...channel, models: channel.models.map((model) => ({ ...model, script: "return 'custom';" })) })) }, cfg.model, "another-model")).toBeUndefined();
});
test("known URL video reports reference, upload and submit stages", async () => {
    const stages: string[] = [];
    await createVideoGenerationTask(config("grok-imagine-video-1.5", 6, "720p"), "p", [reference], { onStage: (stage) => stages.push(stage) });
    expect(stages).toEqual(["references", "upload", "submit"]);
});

test("all fourteen FK IDs and public aliases use OSS plus official JSON, not multipart", async () => {
    const models = Object.entries(videoContracts).filter(([, spec]) => spec.plugin === "fk");
    expect(models).toHaveLength(14);
    for (const [model, spec] of models) {
        const before = posts.length;
        const sequence = uploadSequence;
        const stages: string[] = [];
        await createVideoGenerationTask(config(model, spec.min, spec.resolutions[0]), "p", [reference, { ...reference, id: "ref2" }], { onStage: (stage) => stages.push(stage) });
        expect(posts.length).toBe(before + 1);
        expect(stages).toEqual(["references", "upload", "submit"]);
        expect(posts.at(-1)?.body).toEqual({ model, prompt: "p", duration: spec.min, ratio: "9:16", resolution: spec.resolutions[0],
            imageUrls: [sequence + 1, sequence + 2].map((id) => `https://fixture.oss-cn-hangzhou.aliyuncs.com/creation-temp/${id}?exp=123&sig=keep%2Bsignature`), videoUrls: [], audioUrls: [] });
        expect(posts.at(-1)?.options).toMatchObject({ headers: { "Content-Type": "application/json" } });
    }
});

test("FK reference videos and audio retain their ordered URL fields", async () => {
    const seq = uploadSequence;
    const video = { id: "v", name: "ref.mp4", type: "video/mp4", url: "data:video/mp4;base64,eA==" };
    const audio = { id: "a", name: "ref.mp3", type: "audio/mpeg", url: "data:audio/mpeg;base64,eA==" };
    await createVideoGenerationTask(config("官方渠道-Seedance 2.5 满血 720p", 4, "720p"), "p", [reference], { videos: [video], audios: [audio] });
    const url = (id: number) => `https://fixture.oss-cn-hangzhou.aliyuncs.com/creation-temp/${id}?exp=123&sig=keep%2Bsignature`;
    expect(posts.at(-1)?.body).toMatchObject({ imageUrls: [url(seq + 1)], videoUrls: [url(seq + 2)], audioUrls: [url(seq + 3)] });
});

test("FK upload failure, invalid settings and cancellation never submit; a rejected POST is not retried", async () => {
    const cfg = config("fk-MiniMaxh3", 3, "768p");
    const before = posts.length;
    try {
        authorizationStatus = 403;
        await expect(createVideoGenerationTask(cfg, "p", [reference])).rejects.toThrow();
        authorizationStatus = 200;
        uploadStatus = 500;
        await expect(createVideoGenerationTask(cfg, "p", [reference])).rejects.toThrow();
        uploadStatus = 204;
        const uploadsBeforeInvalid = requests.length;
        await expect(createVideoGenerationTask({ ...cfg, videoSeconds: "16" }, "p", [reference])).rejects.toThrow();
        expect(requests.length).toBe(uploadsBeforeInvalid);
        abortAfterUpload = new AbortController();
        await expect(createVideoGenerationTask(cfg, "p", [reference], { signal: abortAfterUpload.signal })).rejects.toThrow();
        expect(posts.length).toBe(before);
        abortAfterUpload = undefined;
        postError = Object.assign(new Error("Request failed with status code 500"), { isAxiosError: true, response: { status: 500, data: { message: "fixture submission rejected" } } });
        await expect(createVideoGenerationTask(cfg, "p", [reference])).rejects.toThrow("fixture submission rejected");
        expect(posts.length).toBe(before + 1);
    } finally {
        authorizationStatus = 200;
        uploadStatus = 204;
        abortAfterUpload = undefined;
        postError = undefined;
    }
});

test("every known video model creates an immediate real task", async () => {
    for (const [model, spec] of Object.entries(videoContracts)) {
        const task = await createVideoGenerationTask(config(model, spec.min, spec.resolutions[0] || "720p"), "p", [reference]);
        expect(task).toMatchObject({ id: "real-task-id", provider: "openai" });
        const body = posts.at(-1)!.body;
        expect(body instanceof FormData ? body.get("images") instanceof File : typeof (body as Record<string, unknown>).model === "string").toBe(true);
        contractCases.push({ model, plugin: spec.plugin, body });
    }
});
test.skipIf(!hasPlugins)("actual external plugins accept the generated video contracts", async () => {
    const plugins: Record<string, any> = {};
    for (const [name, file] of Object.entries({ fk: "fk", xiaoyi: "xiaoyi-image", yihong: "yihong" })) plugins[name] = await import(join(pluginRoot, `${file}.plugin.js`));
    for (const { model, plugin: pluginName, body } of contractCases) {
        const value =
            body instanceof FormData
                ? { kind: "multipart", fields: Object.fromEntries([...body.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, [value]])), files: [{ field: "images", filename: "ref.png", ref: "request_file:images" }] }
                : { kind: "json", value: body };
        const plugin = plugins[pluginName];
        const ctx = { model, upstreamModel: model, body: value, baseUrl: plugin.meta.baseUrl, apiKey: "fixture-upstream-key" };
        const intent = plugin.protocols.openai_video.decodeRequest(ctx);
        expect(intent.action).toBe("image_to_video");
        const request = plugin.buildSubmitRequest({ ...ctx, requestBody: intent.requestBody, action: intent.action });
        expect(request.method).toBe("POST");
        if (pluginName === "fk") {
            expect(body).not.toBeInstanceOf(FormData);
            expect(request.url).toBe("https://ai.fanke2026.xyz/api/open/v1/video/generate");
            expect(request.headers).toMatchObject({ "X-Public-Model-Ids": "1", "Content-Type": "application/json" });
            expect(request.bodyType).toBeUndefined();
            expect(request.body.imageUrls).toEqual((body as Record<string, unknown>).imageUrls);
            expect(request.body.duration).toBe((body as Record<string, unknown>).duration);
        }
    }
});
test("invalid parameters and cancellation do not upload or submit", async () => {
    const count = posts.length,
        uploads = requests.length;
    await expect(createVideoGenerationTask(config("grok-imagine-video-1.5", 5, "720p"), "p", [reference])).rejects.toThrow();
    const controller = new AbortController();
    controller.abort();
    await expect(createVideoGenerationTask(config("grok-imagine-video-1.5", 6, "720p"), "p", [reference], { signal: controller.signal })).rejects.toThrow();
    expect(posts.length).toBe(count);
    expect(requests.length).toBe(uploads);
});
test("OSS receives no platform Authorization and accepts an empty 204 response", () => {
    const oss = requests.find((request) => request.url.includes("aliyuncs.com"))!;
    expect(oss.options?.headers).toBeUndefined();
    expect(oss.options?.credentials).toBe("omit");
    expect([...(oss.options?.body as FormData).keys()].at(-1)).toBe("file");
});
test("completed platform task downloads authenticated content, not an external result URL", async () => {
    state = { id: "real-task-id", status: "completed", video_url: "https://unreadable.invalid/video.mp4" };
    const task = { id: "real-task-id", provider: "openai" as const, model: "fixture::grok-imagine-video-1.5" };
    const before = posts.length;
    const result = await pollVideoGenerationTask(config("grok-imagine-video-1.5", 6, "720p"), task);
    expect(result.status).toBe("completed");
    expect(gets.at(-1)?.url).toEndWith("/videos/real-task-id/content");
    expect(gets.at(-1)?.options).toMatchObject({ headers: { Authorization: "Bearer fixture-token" } });
    expect(posts.length).toBe(before);
});
test("failed task cannot become successful through a leftover URL", async () => {
    state = { id: "real-task-id", status: "failed", video_url: "https://unreadable.invalid/video.mp4", error: "failed" };
    expect((await pollVideoGenerationTask(config("grok-imagine-video-1.5", 6, "720p"), { id: "real-task-id", provider: "openai", model: "fixture::grok-imagine-video-1.5" })).status).toBe("failed");
});
test("bad grants and failed uploads cannot create a paid task", async () => {
    for (const grant of [
        {},
        { upload_url: "http://bucket.invalid/", asset_url: "http://bucket.invalid/a?sig=x", form_fields: { key: "a", policy: "fixture" } },
        { upload_url: "https://fixture.oss-cn-hangzhou.aliyuncs.com/", asset_url: "https://other.oss-cn-hangzhou.aliyuncs.com/a?sig=x", form_fields: { key: "a", policy: "fixture" } },
    ])
        expect(() => validateUploadGrant(grant)).toThrow();
    const count = posts.length;
    authorizationStatus = 403;
    await expect(createVideoGenerationTask(config("grok-imagine-video-1.5", 6, "720p"), "p", [reference])).rejects.toThrow();
    authorizationStatus = 200;
    uploadStatus = 500;
    await expect(createVideoGenerationTask(config("grok-imagine-video-1.5", 6, "720p"), "p", [reference])).rejects.toThrow();
    uploadStatus = 204;
    expect(posts.length).toBe(count);
});
test("HTML and JSON content are rejected; download retry never creates another task", async () => {
    state = { id: "real-task-id", status: "completed" };
    const task = { id: "real-task-id", provider: "openai" as const, model: "fixture::grok-imagine-video-1.5" };
    const count = posts.length;
    for (const type of ["text/html", "application/json"]) {
        content = new Blob(["{}"], { type });
        await expect(pollVideoGenerationTask(config("grok-imagine-video-1.5", 6, "720p"), task)).rejects.toThrow();
    }
    content = new Blob(["video fixture"], { type: "video/mp4" });
    expect((await pollVideoGenerationTask(config("grok-imagine-video-1.5", 6, "720p"), task)).status).toBe("completed");
    expect(posts.length).toBe(count);
});
