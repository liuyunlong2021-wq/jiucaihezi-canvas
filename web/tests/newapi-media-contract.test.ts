import { expect, test } from "bun:test";
import { imageContractParams, videoContract, videoContracts, validateVideoContract } from "../src/lib/newapi-media-contract";

test("platform matching is an exact origin, not a hostname substring", () => {
    expect(videoContract("https://api.jiucaihezi.studio.evil.invalid", "grok-imagine-video-1.5")).toBeUndefined();
    expect(videoContract("https://api.jiucaihezi.studio", "constructor")).toBeUndefined();
});
test("FK image scale is not OpenAI high quality", () => {
    expect(imageContractParams("fk", { quality: "high", size: "9:16" }, 1, 1)).toMatchObject({ imageSize: "4K", ratio: "9:16" });
});
test("Yihong rejects unsupported 4K square instead of defaulting to 1K", () => {
    expect(() => imageContractParams("yihong", { quality: "high", size: "1:1" }, 1, 1)).toThrow();
    expect(imageContractParams("yihong-gemini", { quality: "high", size: "9:16" }, 1, 1)).toMatchObject({ imageSize: "4K", ratio: "9:16" });
});
test("Yihong native 1K dimensions are not misclassified as generic 2K", () => {
    expect(imageContractParams("yihong", { quality: "high", size: "864x1536" }, 1, 1).size).toBe("864x1536");
    expect(() => imageContractParams("yihong", { quality: "high", size: "1000x1000" }, 1, 1)).toThrow();
});
test("Xiaoyi validates 6/10 seconds before upload", () => {
    const spec = videoContract("https://api.jiucaihezi.studio/v1", "grok-imagine-video-1.5")!;
    expect(() => validateVideoContract(spec, { seconds: 5, resolution: "720p", ratio: "9:16", mode: "reference", counts: [1, 0, 0] })).toThrow();
    expect(() => validateVideoContract(spec, { seconds: 6, resolution: "720p", ratio: "9:16", mode: "reference", counts: [1, 0, 0] })).not.toThrow();
});
test("approved model defaults are explicit and satisfy every video contract", () => {
    expect(videoContracts["grok-imagine-video-1.5"].defaultSeconds).toBe(6);
    expect(videoContracts["seedance2.5 cheap"].defaultSeconds).toBe(15);
    for (const spec of Object.values(videoContracts))
        expect(() => validateVideoContract(spec, { seconds: spec.defaultSeconds!, resolution: spec.resolutions[0] || "720p", ratio: spec.ratios[0] || "16:9", mode: "reference", counts: [0, 0, 0] })).not.toThrow();
});
