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

/**
 * RH 渠道的 8 个 Minimax-h3 应用：接口只认统一模型名 `rh-aiapp`，用 `webappId` 选应用。
 * 画布没有「应用」这一层，所以把应用名放在模型名后缀里，脚本按后缀还原编号；
 * `maxImages` 是该应用能接受的参考图张数上限。
 */
const RH_APP_MODEL = "rh-aiapp";
const RH_APP_SEPARATOR = "｜";
const RH_APPS = [
    { name: "Minimax-h3 文生视频", webappId: "2093604127250149377", maxImages: 0 },
    { name: "Minimax-h3 首帧图生视频", webappId: "2093571735550521345", maxImages: 1 },
    { name: "Minimax-h3 首尾帧", webappId: "2093579373894000642", maxImages: 2 },
    { name: "Minimax-h3 多参双图", webappId: "2093654136997900290", maxImages: 2 },
    { name: "Minimax-h3 多参3图", webappId: "2093662476146667522", maxImages: 3 },
    { name: "Minimax-h3 多参-4图", webappId: "2093651661213491202", maxImages: 4 },
    { name: "Minimax-h3多参5图", webappId: "2093706819385516034", maxImages: 5 },
    { name: "文武双修", webappId: "2101840271142117377", maxImages: 9 },
];

/** 渠道里预置的 RH 模型项：选到哪个应用，脚本就提交对应的 webappId。 */
export const RH_CHANNEL_MODELS: Array<{ name: string; capability: ModelCapability }> = RH_APPS.map((app) => ({ name: `${RH_APP_MODEL}${RH_APP_SEPARATOR}${app.name}`, capability: "video" }));

const RH_AIAAP_SCRIPT = `
/**
 * RH 渠道 Minimax-h3 应用：JSON 请求体 + 参考素材换公网 URL。
 * 契约要点：model 固定 rh-aiapp，用 webappId 选应用（服务端只读 extra_fields.webappId，
 * 顶层那份一并写上给转发层）；duration 1-15 整数；ratio 八种取值（默认 9:16）；
 * 没有 quality 字段；images 张数是上限（超过返回 400），"文生视频"不传 images。
 */
const APPS = ${JSON.stringify(Object.fromEntries(RH_APPS.map((app) => [app.name, { webappId: app.webappId, maxImages: app.maxImages }])), null, 2)};

async function generateVideo({ prompt, images, params: { seconds, ratio }, model, baseUrl, apiKey, request, http, poll }) {
  const app = APPS[String(model).split(${JSON.stringify(RH_APP_SEPARATOR)}).pop().trim()];
  if (!app) throw new Error("未知的 RH 应用：" + model);
  const origin = stripVersionSuffix(baseUrl);
  const headers = { Authorization: "Bearer " + apiKey };
  // 把接口错误整理成「（HTTP 500）后端原文」，便于定位是哪一步挂的。
  const describe = (error) => {
    const response = error && error.response;
    const data = response ? response.data : "";
    const body = typeof data === "string" ? data : JSON.stringify(data || "");
    return (response ? "（HTTP " + response.status + "）" : "") + String(body || (error && error.message) || error).slice(0, 300);
  };

  const upload = async (dataUrl, index) => {
    const blob = await (await fetch(dataUrl)).blob();
    const form = new FormData();
    form.append("file", blob, "ref-" + (index + 1) + ".png");
    let res;
    try {
      res = await request({ method: "post", url: origin + "/api/creations/uploads", headers: headers, data: form });
    } catch (error) {
      throw new Error("参考图上传失败" + describe(error));
    }
    if (!res || !res.url) throw new Error("素材上传失败：" + JSON.stringify(res));
    return res.url;
  };

  const body = {
    model: ${JSON.stringify(RH_APP_MODEL)},
    // 服务端只从 extra_fields.webappId 取应用编号，顶层那份是给平台转发层用的，两处都写。
    webappId: app.webappId,
    extra_fields: { webappId: app.webappId },
    prompt: prompt,
    duration: Math.min(15, Math.max(1, Math.round(Number(seconds) || 5))),
    ratio: ratio && ratio !== "auto" ? ratio : "9:16",
  };
  // 参考图只取该应用的上限张数：少传不报错，多传会 400；张数为 0 时整个字段省略。
  const imageUrls = [];
  for (let i = 0; i < Math.min(images.length, app.maxImages); i += 1) imageUrls.push(await upload(images[i], i));
  if (imageUrls.length) body.images = imageUrls;

  const created = await http.post("/videos", body).catch((error) => {
    throw new Error("创建视频任务失败" + describe(error));
  });
  if (!created || !created.id) throw new Error("创建任务失败：" + JSON.stringify(created));

  // 查询过快（429）和服务暂不可用（5xx）不判失败，继续查询原任务。
  const query = async (id) => {
    try {
      return await http.get("/videos/" + id);
    } catch (error) {
      const status = (error && error.response && error.response.status) || 0;
      if (status === 429 || status >= 500) return null;
      throw error;
    }
  };

  const done = await poll(
    () => query(created.id),
    (task) => {
      if (!task) return false;
      // 失败时把服务端给的完整详情带出来（含 code / task 编号），便于对账后端日志。
      if (task.status === "failed") throw new Error("任务失败：" + String(JSON.stringify(task.error || task)).slice(0, 300));
      if (task.status !== "completed") return false;
      return { url: task.url || task.result_url || task.video_url || "" };
    },
    { intervalMs: 5000, timeoutMs: 900000 },
  );

  if (done.url) return done;
  return await http.get("/videos/" + created.id + "/content", { responseType: "blob" }).catch((error) => {
    throw new Error("下载成片失败" + describe(error));
  });
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
    { pattern: /^rh-aiapp/i, script: RH_AIAAP_SCRIPT },
    { pattern: /seedance2\.5/i, script: SEEDANCE_SCRIPT },
];

/** 返回模型对应的内置调用脚本；非视频能力或未匹配到规则时返回空字符串。 */
export function resolveBuiltinModelScript(name: string, capability?: ModelCapability) {
    if (capability !== "video") return "";
    return BUILTIN_SCRIPTS.find((item) => item.pattern.test(name))?.script.trim() || "";
}
