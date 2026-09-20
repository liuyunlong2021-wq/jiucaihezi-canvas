import type { ModelCapability } from "@/stores/use-config-store";

/**
 * 内置模型调用脚本。
 *
 * 部分第三方中转服务的视频接口要求 JSON 请求体，并且只接受公网 URL 形式的参考素材，
 * 用内置的 OpenAI 兼容请求（multipart）无法调用。这里按模型名自动套用适配脚本，
 * 让接入这些服务的用户不用手写脚本。
 *
 * 优先级：用户在该模型上保存的调用脚本 > 内置脚本。内置脚本只对视频能力生效。
 */
type BuiltinModelScript = { pattern: RegExp; script: string };

const MINIMAX_H3_SCRIPT = `
/**
 * 参考生视频：JSON 请求体 + 参考素材换公网 URL。
 * 契约要点：duration 1-15 秒；画幅由 resolution 后缀决定（768p竖 / 480p横 / 768p(1:1)）；
 * images / audios 只接受 http(s) URL。
 */
async function generateVideo({ prompt, images, audios, params: { seconds, resolution, ratio }, model, baseUrl, apiKey, request, http, poll }) {
  const origin = stripVersionSuffix(baseUrl);
  const headers = { Authorization: "Bearer " + apiKey };

  const upload = async (blob, filename) => {
    const form = new FormData();
    form.append("file", blob, filename);
    const res = await request({ method: "post", url: origin + "/api/creations/uploads", headers: headers, data: form });
    if (!res || !res.url) throw new Error("素材上传失败：" + JSON.stringify(res));
    return res.url;
  };

  if (!images.length) throw new Error("至少需要 1 张参考图");
  const imageUrls = [];
  for (let i = 0; i < images.length; i += 1) {
    imageUrls.push(await upload(await (await fetch(images[i])).blob(), "ref-" + (i + 1) + ".png"));
  }
  const audioUrls = [];
  for (let i = 0; i < audios.length; i += 1) {
    audioUrls.push(await upload(audios[i], audios[i].name || "ref-" + (i + 1) + ".mp3"));
  }

  const square = ratio === "1:1";
  if (square && !model.includes("zm_u24")) throw new Error("该模型不支持 1:1 画幅，请改用 9:16 或 16:9");
  const axis = square ? "(1:1)" : ratio === "9:16" ? "竖" : "横";
  const quality = String(resolution || "").startsWith("480") ? "480p" : "768p";

  const created = await http.post("/videos", {
    model: model,
    prompt: prompt,
    duration: Math.min(15, Math.max(1, Math.round(Number(seconds) || 5))),
    resolution: quality + axis,
    images: imageUrls,
    audios: audioUrls,
  });
  if (!created || !created.id) throw new Error("创建任务失败：" + JSON.stringify(created));

  const done = await poll(
    () => http.get("/videos/" + created.id),
    (task) => {
      if (!task) return false;
      if (task.status === "failed") throw new Error((task.error && task.error.message) || "生成失败");
      const url = task.url || task.result_url || task.video_url;
      if (url) return { url: url };
      return task.status === "completed" ? { ready: true } : false;
    },
    { intervalMs: 3000, timeoutMs: 900000 },
  );

  if (done.url) return done;
  return await http.get("/videos/" + created.id + "/content", { responseType: "blob" });
}

function stripVersionSuffix(value) {
  let result = String(value || "");
  while (result.endsWith("/")) result = result.slice(0, -1);
  if (result.endsWith("/v1")) result = result.slice(0, -3);
  return result;
}

return await generateVideo({ prompt: prompt, images: images, audios: audios, params: params, model: model, baseUrl: baseUrl, apiKey: apiKey, request: request, http: http, poll: poll });
`;

const SEEDANCE_SCRIPT = `
/**
 * 参考生视频：JSON 请求体 + 参考素材换公网 URL，画幅用 ratio 指定。
 * 契约要点：不接受 audios 字段（传了会被拒）；固定 30 秒的模型按名字区分；
 * 生成较慢，轮询超时放宽到 40 分钟。
 */
async function generateVideo({ prompt, images, params: { seconds, ratio }, model, baseUrl, apiKey, request, http, poll }) {
  const origin = stripVersionSuffix(baseUrl);
  const headers = { Authorization: "Bearer " + apiKey };
  const fixedDuration = String(model).includes("海");

  const upload = async (dataUrl, index) => {
    const blob = await (await fetch(dataUrl)).blob();
    const form = new FormData();
    form.append("file", blob, "ref-" + (index + 1) + ".png");
    const res = await request({ method: "post", url: origin + "/api/creations/uploads", headers: headers, data: form });
    if (!res || !res.url) throw new Error("素材上传失败：" + JSON.stringify(res));
    return res.url;
  };

  if (!images.length) throw new Error("至少需要 1 张参考图");
  const imageUrls = [];
  for (let i = 0; i < images.length; i += 1) imageUrls.push(await upload(images[i], i));

  const created = await http.post("/videos", {
    model: model,
    prompt: prompt,
    images: imageUrls,
    ratio: ratio && ratio !== "auto" ? ratio : "16:9",
    duration: fixedDuration ? 30 : Math.min(30, Math.max(4, Math.round(Number(seconds) || 30))),
  });
  if (!created || !created.id) throw new Error("创建任务失败：" + JSON.stringify(created));

  const done = await poll(
    () => http.get("/videos/" + created.id),
    (task) => {
      if (!task) return false;
      if (task.status === "failed") throw new Error((task.error && task.error.message) || "生成失败");
      const url = task.url || task.result_url || task.video_url;
      if (url) return { url: url };
      return task.status === "completed" ? { ready: true } : false;
    },
    { intervalMs: 5000, timeoutMs: 2400000 },
  );

  if (done.url) return done;
  return await http.get("/videos/" + created.id + "/content", { responseType: "blob" });
}

function stripVersionSuffix(value) {
  let result = String(value || "");
  while (result.endsWith("/")) result = result.slice(0, -1);
  if (result.endsWith("/v1")) result = result.slice(0, -3);
  return result;
}

return await generateVideo({ prompt: prompt, images: images, params: params, model: model, baseUrl: baseUrl, apiKey: apiKey, request: request, http: http, poll: poll });
`;

const BUILTIN_SCRIPTS: BuiltinModelScript[] = [
    { pattern: /^minimax_h3_/i, script: MINIMAX_H3_SCRIPT },
    { pattern: /seedance2\.5/i, script: SEEDANCE_SCRIPT },
];

/** 返回模型对应的内置调用脚本；非视频能力或未匹配到规则时返回空字符串。 */
export function resolveBuiltinModelScript(name: string, capability?: ModelCapability) {
    if (capability !== "video") return "";
    return BUILTIN_SCRIPTS.find((item) => item.pattern.test(name))?.script.trim() || "";
}
