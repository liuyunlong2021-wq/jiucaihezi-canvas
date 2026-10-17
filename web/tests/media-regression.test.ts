import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

// Bun module mocks survive mock.restore(); isolate service tests from each other and the existing suite.
for (const suite of ["image-storage", "image-request", "video-task-lifecycle"]) {
    test(`${suite}: isolated real service regression`, () => {
        const result = spawnSync(process.execPath, ["test", join(import.meta.dir, `fixtures/${suite}.case.ts`)], { encoding: "utf8" });
        if (result.status !== 0) throw new Error(result.stderr || result.stdout || result.error?.message);
        if (`${result.stderr}${result.stdout}`.includes("EXTERNAL_CONTRACT_UNAVAILABLE")) console.warn(`${suite}: external NewAPI plugin verification skipped; configure NEWAPI_PLUGINS_DIR. Service tests passed.`);
        expect(result.status).toBe(0);
    });
}
