import { imageSizePresets, inferMediaRatio, inferMediaScale } from "./media-size";

// NewAPI task-plugin contracts: FK 0.3.2, Xiaoyi 0.2.0, Yihong 0.1.7.
export function isMediaPlatform(baseUrl: string) {
    try {
        return new URL(baseUrl).origin === "https://api.jiucaihezi.studio";
    } catch {
        return false;
    }
}
export const fkImageModels = [
    "ft-image-v1-211f28f47b0355abb1798f72eb65f22d",
    "ft-image-v1-186289ba9d3263010c69372f8939dd94",
    "ft-image-v1-eb47192eb578f340043911005a06fb6e",
    "ft-image-v1-3432bdee1a22da4ce8ff2bbfc6ef4c1d",
    "ft-image-v1-80fa79934b03dcdc7a54dacdb1ad7f82",
    "ft-image-v1-d51c811d3d74a5b2433e6916ab564db9",
];
const xiaoyiImages = [
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
];
const yihongImages = ["gpt-image-2-1K-4K", "gpt-image-2", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst", "yihong-gpt-image-2", "yihong-gpt-image-2.5-flare", "yihong-gpt-image-2.5-sunburst"];
export type ImageContract = "fk" | "fk-banana" | "xiaoyi" | "yihong" | "yihong-gemini";
export const yihongImageSizes: Record<string, Record<string, string>> = {
    "1K": { "1:1": "1024x1024", "16:9": "1536x864", "9:16": "864x1536", "4:3": "1536x1152", "3:4": "1152x1536", "3:2": "1536x1024", "2:3": "1024x1536" },
    "2K": { "1:1": "2048x2048", "16:9": "2048x1152", "9:16": "1152x2048", "4:3": "2048x1536", "3:4": "1536x2048" },
    "4K": { "16:9": "3840x2160", "9:16": "2160x3840" },
};
export function imageContract(baseUrl: string, model: string): ImageContract | undefined {
    if (!isMediaPlatform(baseUrl)) return;
    const fk = fkImageModels.indexOf(model);
    if (fk >= 0) return fk < 4 ? "fk" : "fk-banana";
    if (xiaoyiImages.includes(model)) return "xiaoyi";
    if (yihongImages.includes(model)) return "yihong";
    if (model === "gemini-nano-banana-2.1") return "yihong-gemini";
}
export function imageContractParams(contract: ImageContract, config: { quality: string; size: string }, count: number, references: number): Record<string, string | number> {
    if (contract === "xiaoyi") return { response_format: "b64_json" };
    const max = contract === "fk-banana" ? 8 : contract === "yihong-gemini" ? 1 : 10;
    if (references > max) throw new Error(`该模型最多接受 ${max} 张参考图`);
    if (contract.startsWith("yihong") && count !== 1) throw new Error("易红图片接口每次只支持生成 1 张");
    if (contract === "yihong" && /^\d+x\d+$/.test(config.size)) {
        if (Object.values(yihongImageSizes).some((sizes) => Object.values(sizes).includes(config.size))) return { size: config.size, response_format: "b64_json" };
        if (!Object.values(imageSizePresets).some((sizes) => Object.values(sizes).includes(config.size))) throw new Error("易红 GPT 不支持此自定义尺寸，请选择模型支持的尺寸");
    }
    const scale = /^\d+x\d+$/.test(config.size)
        ? inferMediaScale(config.size)
        : ({ high: "4k", medium: "2k", hd: "2k", low: "1k" } as Record<string, string>)[config.quality] || inferMediaScale(config.size, config.quality === "auto" ? undefined : config.quality);
    const imageSize = (scale === "auto" ? "1k" : scale).toUpperCase();
    const ratio = inferMediaRatio(config.size);
    if (contract.startsWith("fk")) {
        if (!["auto", "1:1", "9:16", "16:9", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9"].includes(ratio)) throw new Error("FK 不支持此图片比例");
        return { imageSize, ratio, response_format: "b64_json" };
    }
    if (contract === "yihong-gemini") {
        if (!["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"].includes(ratio)) throw new Error("请选择易红 Gemini 支持的明确画幅");
        return { imageSize, ratio, response_format: "b64_json" };
    }
    const size = yihongImageSizes[imageSize]?.[ratio];
    if (!size) throw new Error(`易红 GPT 不支持 ${imageSize} / ${ratio}，请选择支持的分辨率与画幅`);
    return { size, response_format: "b64_json" };
}

export type VideoContract = {
    plugin: "fk" | "xiaoyi" | "yihong";
    transport: "files" | "urls";
    min: number;
    max: number;
    defaultSeconds?: number;
    seconds?: number[];
    refs: number[];
    ratios: string[];
    resolutions: string[];
    layout?: "super" | "prime" | "h3" | "grok";
    frames?: boolean;
    promptMax?: number;
};
const ratios = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const fkSpecs: Array<[string, number, number, number[], number[] | undefined, boolean, string[], number?]> = [
    ["89e87205d3be4eb2cf3fda249569e693", 30, 30, [9, 0, 0], [30], false, ["720p"]],
    ["99d13a482c1f6f0e71db1e36c4154b70", 15, 30, [9, 0, 0], [15, 30], false, ["720p"]],
    ["bdf45387433ac0a9042ebab3fae0299d", 30, 30, [30, 10, 10], [30], true, ["720p"], 6000],
    ["b8a797753dd4c6bf8e5a69820b293848", 4, 30, [30, 10, 10], undefined, false, ["480p", "720p"], 10000],
    ["756e0feb4b3e1f893726314109762123", 15, 30, [30, 0, 10], undefined, false, ["480p", "720p"], 10000],
    ["451adae35b0c4a3d275c2c46394abc98", 4, 30, [30, 10, 10], undefined, true, ["720p"]],
];
const fkAliases = ["特价渠道 Seedance 2.5 满血 720p", "特价渠道 Seedance 2.5 满血 720p（可过真人）", "长期特惠 Seedance 2.5 满血 720p", "Seedance 2.5 满血 480-720p", "XN2-Seedance 2.5 满血 480-720p", "官方渠道-Seedance 2.5 满血 720p"];
export const videoContracts: Record<string, VideoContract> = Object.create(null);
fkSpecs.forEach(([id, min, max, refs, seconds, wide, resolutions, promptMax], i) => {
    // Defaults come from the existing App mediaModelCapabilities, not from range inference.
    const spec: VideoContract = { plugin: "fk", transport: "files", min, max, refs, seconds, ratios: wide ? [...ratios, "21:9"] : ratios, resolutions, promptMax, defaultSeconds: [30, 15, 30, 4, 15, 4][i] };
    videoContracts[`ft-video-v1-${id}`] = spec;
    videoContracts[fkAliases[i]] = spec;
});
videoContracts["grok-imagine-video-1.5"] = { plugin: "xiaoyi", transport: "urls", min: 6, max: 10, seconds: [6, 10], refs: [1, 0, 0], ratios: ["16:9", "9:16"], resolutions: ["480p", "720p", "1080p"], frames: true, defaultSeconds: 6 };
const yihongSpecs: Array<[string, number, number, number[], string[], string[], VideoContract["layout"]?, boolean?]> = [
    ["seedance2.5 super", 5, 30, [30, 10, 10], [...ratios, "21:9"], [], "super", true],
    ["seedance2.5 cheap", 4, 30, [30, 0, 0], [...ratios, "21:9"], []],
    ["seedance-2.5-max", 30, 30, [30, 0, 0], [], []],
    ["seedance-2.5-Muse", 5, 30, [9, 0, 0], ["16:9", "9:16"], []],
    ["seedance-2.5-omni", 4, 29, [30, 0, 10], ratios, ["720p"]],
    ["seedance-2.5-pro", 5, 30, [30, 10, 10], ["16:9", "9:16"], ["720p"]],
    ["seedance-2.0-mini-Muse", 5, 15, [9, 0, 0], ["16:9", "9:16"], ["720p"]],
    ["Wan3.0 pro max", 2, 30, [10, 5, 5], [...ratios, "adaptive"], ["480p"]],
    ["wan3.0-video-prime", 2, 30, [10, 5, 5], [...ratios, "adaptive"], ["480p", "720p", "1080p"], "prime", true],
    ["grok-imagine-video-1.5-preview", 15, 15, [7, 0, 0], [...ratios, "2:3", "3:2"], ["480p", "720p", "1080p"], "grok", true],
    ["minimax H3", 4, 15, [9, 3, 3], [...ratios, "adaptive", "21:9"], ["768p"], "h3"],
];
yihongSpecs.forEach(([model, min, max, refs, ratios, resolutions, layout, frames]) => {
    videoContracts[model] = { plugin: "yihong", transport: "urls", min, max, refs, ratios, resolutions, layout, frames };
});
const yihongDefaultSeconds: Record<string, number> = {
    "seedance2.5 super": 5,
    "seedance2.5 cheap": 15,
    "seedance-2.5-max": 30,
    "seedance-2.5-Muse": 30,
    "seedance-2.5-omni": 29,
    "seedance-2.5-pro": 30,
    "seedance-2.0-mini-Muse": 15,
    "Wan3.0 pro max": 30,
    "wan3.0-video-prime": 5,
    "grok-imagine-video-1.5-preview": 15,
    "minimax H3": 10,
};
Object.entries(yihongDefaultSeconds).forEach(([model, seconds]) => {
    videoContracts[model].defaultSeconds = seconds;
});
export function videoContract(baseUrl: string, model: string) {
    return isMediaPlatform(baseUrl) ? videoContracts[model] : undefined;
}
export function validateVideoContract(spec: VideoContract, input: { seconds: number; resolution: string; ratio: string; mode: string; counts: number[]; prompt?: string }) {
    const { seconds, resolution, ratio, mode, counts, prompt } = input;
    if (!Number.isInteger(seconds) || seconds < spec.min || seconds > spec.max || (spec.seconds && !spec.seconds.includes(seconds))) throw new Error(`该模型时长须为 ${spec.seconds?.join(" / ") || `${spec.min}–${spec.max}`} 秒`);
    if (spec.resolutions.length && !spec.resolutions.includes(resolution)) throw new Error(`该模型清晰度须为 ${spec.resolutions.join(" / ")}`);
    if (spec.ratios.length && !spec.ratios.includes(ratio)) throw new Error(`该模型画幅须为 ${spec.ratios.join(" / ")}`);
    if (counts.some((count, i) => count > spec.refs[i])) throw new Error(`该模型参考上限：图片 ${spec.refs[0]}、视频 ${spec.refs[1]}、音频 ${spec.refs[2]}`);
    if (mode === "frames" && counts[0] && (!spec.frames || counts[0] > (spec.plugin === "xiaoyi" || spec.layout === "grok" ? 1 : 2) || counts[1] || counts[2])) throw new Error("该模型不支持此首尾帧组合，请改用普通参考或选择支持的模型");
    if (spec.layout === "h3" && counts.reduce((a, b) => a + b, 0) > 10) throw new Error("H3 总参考素材不能超过 10 项");
    if (spec.promptMax && (prompt?.length || 0) > spec.promptMax) throw new Error(`该模型提示词不能超过 ${spec.promptMax} 字符`);
}
