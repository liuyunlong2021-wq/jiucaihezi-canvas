# 画布与 NewAPI 媒体接口适配排查

## 范围与证据

画布是浏览器静态前端，通过用户本地配置的 NewAPI Token 请求公网接口。生成结果需要在浏览器读取并保存到 IndexedDB，桌面 App 的原生下载成功不能替代浏览器跨域验收。按单个用户、多张参考图、已有本地画布的使用场景调查。

本报告的诊断阶段只备份资料、追踪代码、执行不联网的插件解码对照和无鉴权公网检查。随后已按用户指令实施画布核心修复并执行本地回归，详见[实施与验收记录](../docs/media-reference-fix-verification.md)；未重启服务器、替换生产插件或发起收费生成。下文诊断证据不等于生产修复验收通过。

- 原始服务器运维资料：见 [备份说明](reference/README.md)。它不是当前插件清单的权威来源。
- 插件源码及专项资料来源：`/Users/by3/Documents/jiucaihezi-app`，读取时提交 `6229325f19d2a408b811e9c531bf32dd95e94085`。
- 重点资料：`newapi-plugins/{xiaoyi-image,yihong,fk,yuanliu,lingdong,rh,boluo,dola,shanhai}.plugin.js`；Wiki 中的任务插件迁移方案、小易图片 rc40 接入、multipart 漏头修复、易红全模型计费与 FK 合同复查。
- 用户确认：文生图正常；小易、易红图生图在供应方与 NewAPI 后台均显示成功，画布无提示且一直转圈。未取得这些具体请求在浏览器中的状态码、响应字段、后续下载和控制台错误。

## 本次图生图问题的结论边界

### 新现场已确认：参考图跨域读取失败，任务尚未提交

用户随后提供画布“无限画布 6”的现场：图生图配置持续转圈，NewAPI 后台没有对应任务。通过 Chrome 原生开发者工具读取到：

```text
Access to fetch at 'https://relay.xiaoyiapi.xyz/v1/images/public/[REDACTED]'
from origin 'https://huabu.jiucaihezi.studio' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.

Uncaught (in promise) TypeError: Failed to fetch
```

调用栈依次经过线上 bundle 的 `Lye`、`Nd`、`aL` 与生成入口；对照源码分别为图片 fetch、`imageToDataUrl`、`hydrateNodeGenerationContext` 及 `handleGenerateNode`。当前选用 `gpt-image-2.5-1k`，参考图为此前文生图返回的小易公开地址。

已确认因果链：文生图保存外链时，fetch 因 CORS 失败，但 Image 标签展示兜底成功，没有本地 storageKey；图生图准备阶段需要重新读取该外链字节，再次被 CORS 拦截，异常逃出 try/finally，留下“停止/转圈”。这一现场尚未进入生成提交，符合用户所见的后台无任务记录。

当前画布 `requestEdit` 直接用 FormData 向 `/v1/images/edits` 交付参考文件，没有调用 OSS 授权 `/api/creations/upload-url`，也没有执行 OSS 表单直传。`uploadImage` 在这里是浏览器 IndexedDB 保存工具，不是 OSS 上传函数。NewAPI 配置了 OSS 不会让这段画布代码自动切换素材传输方式；即便后续接 OSS，也必须先拿到参考图字节，所以不能靠换上传地址绕过这次读取失败。

最小修复方向：参考图准备纳入生成 try/finally 并支持取消；有本地 storageKey 时优先读持久化 Blob；新生成结果应通过当前渠道确实支持的 Base64 输出或受控结果下载通道持久化，不能把仅可显示的第三方 URL 当作已保存原图。现有无本地原图的跨域外链，单靠前端 fetch 或上传 OSS 无法恢复可读权限。临时可将参考图另存到本机后重新上传，使用本地文件作为参考。

这是已拿到浏览器错误证据的新现场。此前“小易/易红后台成功但画布无结果”的请求仍需各自关联证据，不能把两种现象当成同一笔请求或宣称所有渠道均已定位。

### 此前后台已成功的请求

同一任务的供应方和 NewAPI 状态成功，说明需要重点检查成功结果回传与浏览器落盘；不能继续按“模型不支持图生图”排查，也不能仅凭后台成功断言浏览器已拿到图片。

画布现有路径：

```text
准备参考图 → POST /v1/images/edits → 解析 data[].url / b64_json
→ uploadImage → fetch 图片 → 解码 → IndexedDB → 缩略图 → 更新结果节点
```

`web/src/pages/canvas/project.tsx` 的图片分支，只有 `requestEdit` 和 `uploadImage` 都返回后才更新成功节点。下载、落盘和缩略图阶段没有独立状态；接口阶段和本地阶段都显示“生成中”。这解释了后台成功与页面仍转圈可以同时发生，但尚不能确定本次挂起在何处。

### 已排除的简单猜测

- `requestEdit` 单图上传 `image`，多图上传重复 `image[]`；没有手写 multipart boundary。对照当前小易和易红的真实解码函数，单图请求均被识别为 `image_to_image`，文件引用保留。不能声称文件字段名普遍不兼容。
- 小易插件向供应方构建 multipart `/v1/images/edits/async`；易红插件把文件引用嵌入 JSON，向 GPT 或 Gemini 上游请求。因此旧宿主 multipart 漏头问题不是两者共同原因的现成证明。
- 易红插件可返回 Base64，不必下载第三方结果 URL。外链 CORS 无法解释所有易红图片故障。
- 当前无密钥 OPTIONS 检查中，`/v1/images/generations` 和 `/v1/images/edits` 都返回 204。204 本身不代表浏览器预检通过，详见问题 1。

### 下一次只读取既有失败请求

不要为排障反复创建收费任务。对同一已有请求核对：

| 浏览器证据 | 定位方向 |
| --- | --- |
| 没有 edits POST，控制台有参考图读取错误 | 提交前的参考图准备与错误清理，见问题 2 |
| edits POST 一直 pending，但对应 NewAPI 任务已成功 | NewAPI 的成功结果呈现、响应传输或 Nginx；需按同一请求 ID 对照日志，不能仅查询任务状态 |
| edits 返回 200，含 `data[].url`，随后图片 GET pending/403/CORS | 外链结果读取，见问题 3 |
| edits 返回 200，含有效 `b64_json`，没有远程图片下载 | 本地 Base64 读取、图片解码、IndexedDB 或缩略图；不可归咎于第三方结果 URL |
| 已返回错误但画布仍转圈 | 错误捕获与状态清理；保存错误阶段与原始原因 |

浏览器检查只需状态码、返回字段、脱敏错误和请求 ID，不需要 API Key、参考图正文、Base64 或带签名的完整 URL。若读不到浏览器记录，下一步让用户逐条提供诊断结果，不输出长篇批量服务器指令。

## 必须处理的适配问题

### 1. 图片接口预检没有显式允许 Authorization

- 证据：本轮分别以画布 Origin 对 generations/edits 发 OPTIONS，均返回 `Access-Control-Allow-Origin: *`、`Access-Control-Allow-Headers: *` 和 `Access-Control-Allow-Credentials: true`。
- 问题：画布实际请求带 `Authorization`；[Fetch 标准](https://fetch.spec.whatwg.org/#cors-non-wildcard-request-header-name)要求显式允许这个头，不能用 Allow-Headers 通配符覆盖。如果请求使用 credentials include，Allow-Origin 通配符还会造成另一项拒绝；当前默认 Axios 不能因此被误写成启用了 include。
- 最小处理：先确认命中的 Nginx location 与 NewAPI 响应来源，再保留现有站点允许规则、显式允许 Authorization/Content-Type；避免追加重复 Allow-Origin。配置修改另行执行。
- 影响：属于本轮观察到的独立跨域隐患。它同时出现在两个图片端点，不能单独解释用户“文生图正常、后台图生图成功”的差异；需要失败请求本身的浏览器证据。

### 2. 参考图准备异常可能绕过生成状态清理

- 证据：`web/src/pages/canvas/project.tsx` 先设置 `runningNodeId`、创建 controller，再调用 `hydrateNodeGenerationContext`，随后才进入 `try`。后面的 `finally` 才负责结束 controller 和清空 running 状态。
- 触发：连线参考图的 URL 过期、跨域不可读或 Blob 不可用，`imageToDataUrl` 抛错，会跳过该 finally，表现为一直运行且没有正常失败结果。这里的图片读取也未使用本次 controller 的取消信号。
- 最小处理：把准备参考图纳入同一 try/finally，保留原错误并及时收尾；不改变现有超时、重试或大小限制。
- 影响：这是独立的确定代码缺口；若用户指的就是同一笔后台已成功的 POST，不能把提交前失败当作那笔请求的根因。

### 3. URL 图片结果依赖浏览器跨域读取，失败后无法保证下载和持久化

- 证据：`web/src/services/api/image.ts` 按模型名包含 gpt-image 就省略 `response_format`，注释假定总会回 Base64；但小易插件固定向供应方请求 URL。`image-storage.ts:82` 直接 fetch 结果 URL，随后解码并写入本地存储。
- 触发：结果域名无 CORS、链接失效、403、返回非图片或需要额外鉴权。仅网络类错误会尝试 Image 标签展示兜底；HTTP 错误直接失败。兜底成功也只有远程 URL，没有 storageKey，链接过期后无法离线恢复；画布下载按钮仍把 URL 交给 file-saver。
- 最小处理：先检查失败图片 GET 的实际状态和响应类型；对于确需浏览器跨域的结果，选择该 NewAPI 渠道支持的 Base64 返回或受控结果下载通道。不要给任意外部域名附加用户 Token，也不要改成任意 URL 开放代理。
- 影响：已生成图片可能显示不了、下载不了或刷新后丢失。`fetchImageBlob` 把非 2xx 统一为“图片读取失败”，丢失状态码；应保留可脱敏的阶段与错误原因。具体这次是否命中尚待证实。

### 4. 图片规格没有按插件合同组装

- 证据与本地对照：画布仅统一发送 size/quality；FK 插件 quality 的兼容值要求 1K/2K/4K，画布 high 直接触发 `Unsupported Fk imageSize: HIGH`。易红 GPT 的 4K 方图不接受画布预设 `2880x2880`，实际解码返回 `Unsupported GPT image size: 2880x2880`。
- 另一触发：给易红 Gemini 的 multipart 传 `size=2160x3840, quality=high`，不传 ratio/imageSize；真实插件构造的上游参数实际为 `imageSize=1K, aspectRatio=1:1`，与画布选择不符。
- 最小处理：按公开模型对应的实际插件能力，在 API 层转换尺寸、比例和规格字段，模型 UI 同步能力范围；不要改全站默认尺寸来迁就一个渠道，也不要静默降低质量。
- 影响：有的模型直接报错，有的成功但生成错误规格。不能把这些参数缺口说成本次两渠道后台成功后挂起的已证实原因。

### 5. 通用视频 multipart 与多种 Task Plugin 的 JSON 合同冲突

- 证据：`web/src/services/api/video.ts:172` 的通用 OpenAI 视频分支总是构造 FormData，字段是 first_frame/last_frame/image[]、resolution_name。小易 Grok Video、源流和灵动等当前插件的 decodeRequest 则要求 JSON 和各自的参考素材字段。
- 本地对照：按画布通用分支给小易 `grok-imagine-video-1.5` 传 multipart，实际插件拒绝 `JSON video body required`；源流 `yl_seedance-2-5_6caffaca7390` 同样拒绝 `JSON body required`。
- 最小处理：保留原生 OpenAI 视频分支，给明确使用 NewAPI Task Plugin 的模型配置对应 JSON 组装与素材 URL 转换，不能把所有视频协议统一改掉。
- 影响：模型能出现在列表，不代表能由画布现有通用请求调用。

### 6. Seedance 的宽泛脚本匹配覆盖不同模型合同

- 证据：`web/src/lib/model-scripts.ts:285` 用 `/seedance2\.5/i` 给所有匹配模型套同一脚本；脚本强制至少一张图片，以名称是否包含“海”决定固定时长，其余按 4–30 秒处理。
- 触发：支持纯文生视频或有不同素材/时长字段的 Seedance 模型，可能被强制要求参考图或发送错误参数。用户自定义脚本能覆盖默认脚本，但不等于默认接入已适配。
- 最小处理：按已知模型及提供方绑定明确合同，不能用一个名称片段推断所有 Seedance 能力。
- 影响：新插件能正常工作，画布仍可能误选旧脚本。

### 7. 画布调用脚本的视频没有持久化 NewAPI 真实任务号

- 证据：`createPluginVideoTask` 先等待整份脚本提交及轮询完成，才生成本地 nanoid；结果仅放 `pluginVideoResults` 内存 Map。它与服务端的 NewAPI Task Plugin 是两个概念。
- 触发：菠萝、山海等内置脚本正在跑任务时刷新页面，服务端任务仍可能成功，但画布没有及时保存真实 id，不能沿已有任务继续查询；保存的本地 plugin id 刷新后也不能恢复结果。
- 最小处理：把明确的 NewAPI 视频接入改为现有 create/poll/content 生命周期，在创建后立即保存服务器 id，继续查询原任务；保留用户脚本功能。
- 影响：刷新后结果无法找回，并有用户重新生成造成额外费用的风险。

## 优先顺序与未检查项

先读取本次已成功任务的浏览器响应/控制台，区分服务端回包与客户端落盘，再处理状态清理和具体协议差异。任何新超时、重试、并发或大小限制变更，按 AGENTS.md 先说明并取得确认。

无密钥检查不证明真实 Token 权限、插件生产版本、收费结果或账单。已取得上述新现场的浏览器 CORS 错误与未捕获异常；此前后台成功任务的响应、同一请求服务器日志和逐型号收费验收仍未取得。浏览器扩展读取超时后改用 Chrome 原生开发者工具读取既有错误，没有刷新页面或提交新任务。本轮未实施业务代码修复。
