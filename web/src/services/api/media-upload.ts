import { type AiConfig, withLocalProxy } from "@/stores/use-config-store";
import { isMediaPlatform, videoContract } from "@/lib/newapi-media-contract";

const r2Origin = "https://d055e5deea504cb25551755cc486a61a.r2.cloudflarestorage.com";
export function validateR2UploadGrant(value: unknown, contentType: string) {
    const grant = value as { method?: string; upload_url?: string; asset_url?: string; headers?: Record<string, string> };
    if (grant?.method !== "PUT" || !grant.upload_url || !grant.asset_url || !grant.headers ||
        Object.keys(grant.headers).length !== 1 || grant.headers["Content-Type"] !== contentType) throw new Error("R2 上传授权响应不完整");
    const upload = new URL(grant.upload_url);
    const asset = new URL(grant.asset_url);
    if ([upload, asset].some((url) => url.origin !== r2Origin || url.username || url.password || url.hash || !url.searchParams.get("X-Amz-Signature")) ||
        !/^\/jiucaihezi-media-test\/lingdong-temp\/[1-9]\d*\/[a-f0-9]{32}\.[a-z0-9]+$/.test(upload.pathname) ||
        asset.pathname !== upload.pathname || upload.searchParams.get("X-Amz-Expires") !== "300" || asset.searchParams.get("X-Amz-Expires") !== "21600")
        throw new Error("R2 上传授权地址或字段无效");
    return { uploadUrl: grant.upload_url, assetUrl: grant.asset_url, headers: grant.headers };
}

export function validateUploadGrant(value: unknown) {
    const grant = value as { upload_url?: string; asset_url?: string; form_fields?: Record<string, string> };
    if (!grant?.upload_url || !grant.asset_url || !grant.form_fields || Array.isArray(grant.form_fields)) throw new Error("OSS 上传授权响应不完整");
    const upload = new URL(grant.upload_url);
    const asset = new URL(grant.asset_url);
    if (
        upload.protocol !== "https:" ||
        !/^[a-z0-9-]+\.oss-[a-z0-9-]+\.aliyuncs\.com$/.test(upload.hostname) ||
        upload.username ||
        upload.password ||
        upload.port ||
        upload.pathname !== "/" ||
        upload.search ||
        asset.origin !== upload.origin ||
        decodeURIComponent(asset.pathname.slice(1)) !== grant.form_fields.key ||
        !asset.search ||
        !grant.form_fields.policy ||
        !Object.values(grant.form_fields).every((value) => typeof value === "string")
    )
        throw new Error("OSS 上传授权地址或字段无效");
    return { uploadUrl: grant.upload_url, assetUrl: grant.asset_url, fields: grant.form_fields };
}

export async function uploadReferenceMedia(config: AiConfig, file: Blob, filename: string, signal?: AbortSignal) {
    if (!isMediaPlatform(config.baseUrl)) throw new Error("此素材上传接口仅适用于韭菜盒子平台");
    signal?.throwIfAborted();
    if (!file.size) throw new Error("参考素材为空");
    const r2 = videoContract(config.baseUrl, config.model)?.plugin === "lingdong";
    if (r2 && file.size > (20 << 20)) throw new Error("R2 参考素材不能超过 20 MiB");
    const origin = new URL(config.baseUrl).origin;
    const contentType = file.type || "application/octet-stream";
    const authorization = await fetch(withLocalProxy(`${origin}/api/creations/${r2 ? "lingdong/" : ""}upload-url`), {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: contentType, size: file.size, ...(r2 ? { model: config.model } : {}) }),
        signal,
        credentials: "omit",
    });
    if (!authorization.ok) throw new Error(`申请 ${r2 ? "R2" : "OSS"} 上传授权失败（HTTP ${authorization.status}）`);
    const value: unknown = await authorization.json();
    signal?.throwIfAborted();
    if (r2) {
        const grant = validateR2UploadGrant(value, contentType);
        const response = await fetch(grant.uploadUrl, { method: "PUT", headers: grant.headers, body: file, signal, credentials: "omit", redirect: "error" });
        if (!response.ok) throw new Error(`R2 素材上传失败（HTTP ${response.status}）`);
        signal?.throwIfAborted();
        return grant.assetUrl;
    }
    const grant = validateUploadGrant(value);
    const form = new FormData();
    Object.entries(grant.fields).forEach(([key, value]) => form.append(key, value));
    form.append("file", file, filename);
    const response = await fetch(grant.uploadUrl, { method: "POST", body: form, signal, credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Error(`OSS 素材上传失败（HTTP ${response.status}）`);
    signal?.throwIfAborted();
    return grant.assetUrl;
}
