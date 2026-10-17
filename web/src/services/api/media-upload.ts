import { type AiConfig, withLocalProxy } from "@/stores/use-config-store";
import { isMediaPlatform } from "@/lib/newapi-media-contract";

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
    const origin = new URL(config.baseUrl).origin;
    const authorization = await fetch(withLocalProxy(`${origin}/api/creations/upload-url`), {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: file.type || "application/octet-stream", size: file.size }),
        signal,
        credentials: "omit",
    });
    if (!authorization.ok) throw new Error(`申请 OSS 上传授权失败（HTTP ${authorization.status}）`);
    const grant = validateUploadGrant(await authorization.json());
    signal?.throwIfAborted();
    const form = new FormData();
    Object.entries(grant.fields).forEach(([key, value]) => form.append(key, value));
    form.append("file", file, filename);
    const response = await fetch(grant.uploadUrl, { method: "POST", body: form, signal, credentials: "omit", redirect: "error" });
    if (!response.ok) throw new Error(`OSS 素材上传失败（HTTP ${response.status}）`);
    signal?.throwIfAborted();
    return grant.assetUrl;
}
