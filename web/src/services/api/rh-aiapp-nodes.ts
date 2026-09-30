export const WENWU_APP_ID = "2101840271142117377";

type AppNode = { nodeId: string; fieldName: string; fieldValue: unknown; options?: unknown[]; [key: string]: unknown };

export function buildWenwuRequest(discovered: unknown, prompt: string, images: string[], seconds: string, ratio: string, drama = "0") {
    if (!prompt.trim()) throw new Error("文武双修提示词不能为空");
    if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) throw new Error("文武双修时长必须为有效的正数");
    if (images.length > 9) throw new Error("文武双修最多支持 9 张参考图");
    if (!Array.isArray(discovered) || !discovered.length) throw new Error("文武双修未返回完整节点列表");
    const values: Record<string, string> = { "28:prompt": prompt, "27:value": seconds, "65:index": drama };
    ["6", "35", "36", "37", "38", "39", "40", "41", "42"].forEach((id, index) => {
        values[`${id}:image`] = images[index] || "None";
    });
    const keys = new Set<string>();
    const nodes = discovered.map((item: unknown) => {
        if (!item || typeof item !== "object") throw new Error("文武双修节点格式无效");
        const node = item as AppNode;
        if (typeof node.nodeId !== "string" || !node.nodeId || typeof node.fieldName !== "string" || !node.fieldName) throw new Error("文武双修节点键无效");
        const key = `${node.nodeId}:${node.fieldName}`;
        if (keys.has(key)) throw new Error(`文武双修节点重复：${key}`);
        keys.add(key);
        let fieldValue = values[key] ?? node.fieldValue;
        if (key === "29:aspect_ratio") {
            fieldValue = Array.isArray(node.options) ? node.options.find((value) => typeof value === "string" && value.split(" (")[0] === ratio) : undefined;
            if (!fieldValue) throw new Error(`文武双修不支持画幅 ${ratio}，请根据应用节点选项选择画幅`);
        }
        if (fieldValue === undefined || fieldValue === null || String(fieldValue).trim() === "") throw new Error(`文武双修节点值为空：${key}`);
        return { ...node, fieldValue };
    });
    for (const key of [...Object.keys(values), "29:aspect_ratio"]) {
        if (!keys.has(key)) throw new Error(`文武双修节点发生变化，缺少 ${key}，请更新接入映射`);
    }
    return {
        model: "rh-aiapp", prompt, duration: Number(seconds), seconds,
        metadata: { rh_aiapp: { version: 1, webappId: WENWU_APP_ID, nodeInfoList: nodes } },
        webappId: WENWU_APP_ID, nodeInfoList: nodes,
        extra_fields: { webappId: WENWU_APP_ID, nodeInfoList: nodes },
    };
}
