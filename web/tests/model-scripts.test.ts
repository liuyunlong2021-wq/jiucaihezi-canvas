import { expect, test } from "bun:test";

import { clampVideoSeconds, resolveVideoSecondsLimit } from "../src/lib/media-size";
import { resolveBuiltinModelScript, RH_CHANNEL_MODELS, syncRhChannelModels } from "../src/lib/model-scripts";

const RH_SCRIPT_APPS = [
    ["rh-aiapp｜Minimax-h3 文生视频", "2093604127250149377"],
    ["rh-aiapp｜Minimax-h3 首帧图生视频", "2093571735550521345"],
    ["rh-aiapp｜Minimax-h3 首尾帧", "2093579373894000642"],
    ["rh-aiapp｜Minimax-h3 多参双图", "2093654136997900290"],
    ["rh-aiapp｜Minimax-h3 多参3图", "2093662476146667522"],
    ["rh-aiapp｜Minimax-h3 多参-4图", "2093651661213491202"],
    ["rh-aiapp｜Minimax-h3多参5图", "2093706819385516034"],
    ["rh-aiapp｜文-MiniMax", "2101840271142117377"],
    ["rh-aiapp｜武-MiniMax", "2101840271142117377"],
];

test("RH 每个应用都预置成视频模型并带上 webappId", () => {
    expect(RH_CHANNEL_MODELS.map((item) => item.name)).toEqual(RH_SCRIPT_APPS.map(([name]) => name));
    expect(RH_CHANNEL_MODELS.every((item) => item.capability === "video")).toBe(true);
    for (const [name, webappId] of RH_SCRIPT_APPS) {
        const script = resolveBuiltinModelScript(name, "video");
        expect(script).toContain(webappId);
        expect(script).toContain('model: "rh-aiapp"');
    }
});

test("RH 参考图上限按应用收窄，生图能力不套用视频脚本", () => {
    expect(resolveBuiltinModelScript("rh-aiapp｜Minimax-h3 文生视频", "video")).toMatch(/"maxImages": 0/);
    expect(resolveBuiltinModelScript("rh-aiapp｜Minimax-h3多参5图", "video")).toMatch(/"maxImages": 5/);
    expect(resolveBuiltinModelScript("rh-aiapp｜文-MiniMax", "video")).toMatch(/"maxImages": 9/);
    expect(resolveBuiltinModelScript("rh-aiapp｜文-MiniMax", "image")).toBe("");
});

test("RH 脚本把应用编号放在 extra_fields，并带上应用自己的工作流参数", () => {
    const script = resolveBuiltinModelScript("rh-aiapp｜文-MiniMax", "video");
    expect(script).toContain("webappId: app.webappId,");
    expect(script).toContain("extra_fields: Object.assign({ webappId: app.webappId }, app.extras),");
});

test("文武双修拆成两个应用，各自提交对应的工作流参数", () => {
    expect(resolveBuiltinModelScript("rh-aiapp｜文-MiniMax", "video")).toContain('"[65]easy anythingIndexSwitch-index": 0');
    expect(resolveBuiltinModelScript("rh-aiapp｜武-MiniMax", "video")).toContain('"[65]easy anythingIndexSwitch-index": 1');
});

test("渠道同步会换掉下线的 RH 应用并补齐新增应用", () => {
    const synced = syncRhChannelModels([
        { name: "gpt-image-2-1k", capability: "image" as const },
        { name: "rh-aiapp｜文武双修", capability: "video" as const },
        { name: "rh-aiapp｜Minimax-h3 文生视频", capability: "video" as const },
    ]);
    expect(synced.map((item) => item.name)).toEqual(["gpt-image-2-1k", ...RH_CHANNEL_MODELS.map((item) => item.name)]);
});

test("内置脚本都能编译，且区分失败步骤", () => {
    for (const name of ["minimax_h3_zm_u24", "rh-aiapp｜文-MiniMax", "海seedance2.5"]) {
        const script = resolveBuiltinModelScript(name, "video");
        // 与 runModelPlugin 的包装方式一致：脚本是 async 函数体，最后 return 结果。
        expect(() => new Function(`"use strict"; return (async () => {\n${script}\n})();`)).not.toThrow();
    }
    const rhScript = resolveBuiltinModelScript("rh-aiapp｜武-MiniMax", "video");
    expect(rhScript).toContain("参考图上传失败");
    expect(rhScript).toContain("创建视频任务失败");
    expect(rhScript).toContain("下载成片失败");
});

test("MiniMax 系列限制在 1–15 秒，文武双修放宽到 30 秒，其余视频模型保持 4–30 秒", () => {
    expect(resolveVideoSecondsLimit("jiucaihezi::rh-aiapp｜Minimax-h3多参5图")).toEqual({ min: 1, max: 15 });
    expect(resolveVideoSecondsLimit("minimax_h3_zm_u24")).toEqual({ min: 1, max: 15 });
    expect(resolveVideoSecondsLimit("rh-aiapp｜文-MiniMax")).toEqual({ min: 1, max: 30 });
    expect(resolveVideoSecondsLimit("山seedance2.5")).toEqual({ min: 4, max: 30 });
    expect(clampVideoSeconds("2", resolveVideoSecondsLimit("rh-aiapp｜武-MiniMax"))).toBe("2");
    expect(clampVideoSeconds("30", resolveVideoSecondsLimit("rh-aiapp｜武-MiniMax"))).toBe("30");
    expect(clampVideoSeconds("30", resolveVideoSecondsLimit("rh-aiapp｜Minimax-h3 多参双图"))).toBe("15");
    expect(clampVideoSeconds("2", resolveVideoSecondsLimit("山seedance2.5"))).toBe("4");
    expect(clampVideoSeconds("2")).toBe("4");
});
