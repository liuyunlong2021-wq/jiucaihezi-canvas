import { expect, test } from "bun:test";
import { imageContract, imageContractParams, videoContract, videoContracts, validateVideoContract } from "../src/lib/newapi-media-contract";

test("platform matching is an exact origin, not a hostname substring", () => {
    expect(videoContract("https://api.jiucaihezi.studio.evil.invalid", "grok-imagine-video-1.5")).toBeUndefined();
    expect(videoContract("https://api.jiucaihezi.studio", "constructor")).toBeUndefined();
});
test("Lingdong experiment uses verified public IDs only, URL transport and official constraints", () => {
    const spec = videoContract("https://api.jiucaihezi.studio", "灵动-sd2.5-满血-301010-2")!;
    expect(spec).toMatchObject({ plugin: "lingdong", transport: "urls", defaultSeconds: 10, min: 4, max: 30, refs: [30, 10, 10], resolutions: ["720p"] });
    expect(() => validateVideoContract(spec, { seconds: 30, resolution: "720p", ratio: "9:16", mode: "reference", counts: [1, 0, 0] })).not.toThrow();
    expect(() => validateVideoContract(spec, { seconds: 3, resolution: "720p", ratio: "9:16", mode: "reference", counts: [1, 0, 0] })).toThrow();
    expect(videoContract("https://other.invalid", "SD-2.5-特价-2")).toBeUndefined();
    expect(videoContract("https://api.jiucaihezi.studio", "sd2.5-a")).toBeUndefined();
    expect(videoContract("https://api.jiucaihezi.studio", "SD-2.5-特价-2")).toBeUndefined();
    for (const name of ["灵动-gpt-image-2.5-flare", "灵动-gpt-image-2.5-sunburst"]) expect(imageContract("https://api.jiucaihezi.studio", name)).toBe("lingdong");
    expect(imageContractParams("lingdong", { quality: "auto", size: "9:16" }, 1, 2)).toEqual({ response_format: "b64_json" });
});
test("FK H3 public mapping uses the same OSS URL contract as its upstream ID", () => {
    const spec = videoContract("https://api.jiucaihezi.studio", "fk-MiniMaxh3")!;
    expect(spec).toBe(videoContracts["ft-video-v1-77e8ee7a636f15dac27b2ce6d6fcd746"]);
    expect(spec).toMatchObject({ plugin: "fk", transport: "urls", defaultSeconds: 1, min: 1, max: 15, refs: [9, 0, 3], resolutions: ["768p"] });
    expect(() => validateVideoContract(spec, { seconds: 1, resolution: "768p", ratio: "4:3", mode: "reference", counts: [9, 0, 3] })).not.toThrow();
    expect(() => validateVideoContract(spec, { seconds: 1, resolution: "768p", ratio: "16:9", mode: "reference", counts: [1, 1, 0] })).toThrow();
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
