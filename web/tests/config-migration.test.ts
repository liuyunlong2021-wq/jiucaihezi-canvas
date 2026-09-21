import { expect, test } from "bun:test";

// use-config-store 在模块加载时会读 localStorage（i18n 语言），bun 里没有这个全局，先补桩再动态导入。
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as unknown as Storage;
const { migratePersistedConfig } = await import("../src/stores/use-config-store");

function migrate(config: Record<string, unknown>, version: number) {
    return (migratePersistedConfig({ config, webdav: {} }, version) as { config: { size: string; videoMode: string } }).config;
}

test("旧默认值（1:1 / 首尾帧）迁到新默认值", () => {
    expect(migrate({ size: "1:1", videoMode: "frames" }, 0)).toMatchObject({ size: "9:16", videoMode: "reference" });
});

test("用户改过的值不动，只迁没改过的那项", () => {
    expect(migrate({ size: "4:3", videoMode: "frames" }, 0)).toMatchObject({ size: "4:3", videoMode: "reference" });
    expect(migrate({ size: "1:1", videoMode: "reference" }, 0)).toMatchObject({ size: "9:16", videoMode: "reference" });
});

test("已迁过的配置不再改动", () => {
    expect(migrate({ size: "1:1", videoMode: "frames" }, 2)).toMatchObject({ size: "1:1", videoMode: "frames" });
});
