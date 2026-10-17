const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const counts: Record<string, number> = {};
let videoStatus = "queued";
const waiting = new Set<(response: Response) => void>();
const cors = { "Access-Control-Allow-Origin": "http://127.0.0.1:3000", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
Bun.serve({
    hostname: "127.0.0.1",
    port: 3002,
    async fetch(request) {
        const url = new URL(request.url);
        if (url.pathname === "/no-cors.png") return new Response(png, { headers: { "Content-Type": "image/png" } });
        if (url.pathname === "/slow.png")
            return new Promise<Response>((resolve) => {
                waiting.add(resolve);
                request.signal.addEventListener("abort", () => waiting.delete(resolve), { once: true });
            });
        if (url.pathname === "/stats") return Response.json({ counts, videoStatus }, { headers: cors });
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
        counts[`${request.method} ${url.pathname}`] = (counts[`${request.method} ${url.pathname}`] || 0) + 1;
        if (url.pathname === "/fixture-control" && request.method === "POST") {
            const body = await request.json();
            if (["queued", "completed", "failed"].includes(body.videoStatus)) videoStatus = body.videoStatus;
            if (body.releaseImages) {
                waiting.forEach((resolve) => resolve(new Response(png, { headers: { ...cors, "Content-Type": "image/png" } })));
                waiting.clear();
            }
            return Response.json({ videoStatus }, { headers: cors });
        }
        if (request.headers.get("Authorization") !== "Bearer fixture-not-a-real-key") return new Response("fixture token required", { status: 401, headers: cors });
        if (request.method === "POST" && ["/v1/images/generations", "/v1/images/edits"].includes(url.pathname)) return Response.json({ data: [{ b64_json: png.toString("base64") }] }, { headers: cors });
        if (request.method === "POST" && url.pathname === "/v1/videos") return Response.json({ id: "fixture-video-task", status: "queued" }, { headers: cors });
        if (url.pathname === "/v1/videos/fixture-video-task") return Response.json({ id: "fixture-video-task", status: videoStatus }, { headers: cors });
        if (url.pathname === "/v1/videos/fixture-video-task/content") return new Response(Bun.file(new URL("./fixtures/tiny.mp4", import.meta.url)), { headers: { ...cors, "Content-Type": "video/mp4" } });
        return new Response("not found", { status: 404, headers: cors });
    },
});
console.log("Cross-origin fixture: http://127.0.0.1:3002 (no paid API)");
