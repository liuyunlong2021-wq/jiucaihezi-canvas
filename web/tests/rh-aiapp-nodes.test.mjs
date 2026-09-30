// Run: node --experimental-strip-types --test web/tests/rh-aiapp-nodes.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildWenwuRequest, WENWU_APP_ID } from "../src/services/api/rh-aiapp-nodes.ts";

test("完整节点、清空示例素材、本次输入及错误拒绝", () => {
    const nodes = [
        { nodeId: "28", fieldName: "prompt", fieldValue: "demo" },
        { nodeId: "27", fieldName: "value", fieldValue: "20" },
        { nodeId: "29", fieldName: "aspect_ratio", fieldValue: "16:9 (Widescreen)", options: ["16:9 (Widescreen)", "9:16 (Portrait Widescreen)"] },
        { nodeId: "65", fieldName: "index", fieldValue: "1" },
        ...["6", "35", "36", "37", "38", "39", "40", "41", "42"].map((nodeId) => ({ nodeId, fieldName: "image", fieldValue: "saved-demo.png" })),
        { nodeId: "99", fieldName: "quality", fieldValue: "0.9" },
    ];
    const images = ["data:image/png;base64,AAAA", "https://example.com/ref.png"];
    const body = buildWenwuRequest(nodes, "图1和图2掰手腕", images, "3", "9:16");
    const values = Object.fromEntries(body.nodeInfoList.map((node) => [`${node.nodeId}:${node.fieldName}`, node.fieldValue]));
    assert.equal(body.model, "rh-aiapp");
    assert.equal(body.webappId, WENWU_APP_ID);
    assert.equal(body.duration, 3);
    assert.equal(body.nodeInfoList.length, nodes.length);
    assert.deepEqual(body.metadata.rh_aiapp, { version: 1, webappId: WENWU_APP_ID, nodeInfoList: body.nodeInfoList });
    assert.deepEqual(body.extra_fields, { webappId: WENWU_APP_ID, nodeInfoList: body.nodeInfoList });
    assert.equal(values["28:prompt"], body.prompt);
    assert.equal(values["27:value"], "3");
    assert.equal(values["29:aspect_ratio"], "9:16 (Portrait Widescreen)");
    assert.equal(values["65:index"], "0");
    assert.equal(values["6:image"], images[0]);
    assert.equal(values["35:image"], images[1]);
    assert.equal(values["99:quality"], "0.9");
    for (const id of ["36", "37", "38", "39", "40", "41", "42"]) assert.equal(values[`${id}:image`], "None");
    assert.equal(nodes[0].fieldValue, "demo");
    const martial = buildWenwuRequest(nodes, "prompt", [], "3", "9:16", "1");
    assert.equal(martial.nodeInfoList.find((node) => node.nodeId === "65").fieldValue, "1");
    assert.throws(() => buildWenwuRequest(nodes.slice(1), "prompt", [], "3", "9:16"), /缺少/);
    assert.throws(() => buildWenwuRequest([...nodes, nodes[0]], "prompt", [], "3", "9:16"), /重复/);
    assert.throws(() => buildWenwuRequest(nodes, "prompt", Array(10).fill(images[0]), "3", "9:16"), /9 张/);
    assert.throws(() => buildWenwuRequest(nodes, "prompt", [], "3", "9:21"), /不支持画幅/);
    assert.throws(() => buildWenwuRequest(nodes, "prompt", [], "NaN", "9:16"), /时长/);
    assert.throws(() => buildWenwuRequest([...nodes, { nodeId: "100", fieldName: "value", fieldValue: "" }], "prompt", [], "3", "9:16"), /节点值为空/);
});
