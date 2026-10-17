# FK / 小易 / 易红图生图与图生视频修复方案（TDD）

状态：核心实现与第一轮本地回归已完成，生产验收未完成。以下为完整设计，不表示全部测试通过；实际范围、结果与剩余门槛见[实施与验收记录](media-reference-fix-verification.md)。

## 1. 目标与已确认根因

复用 fork 已有的 `localforage / image_files / image_previews` 与媒体存储，让三个插件的图生图、图生视频从参考素材读取、提交、查询到播放/显示、下载、本地保存、刷新恢复完整闭环；失败时正常结束运行状态。文件、Base64、OSS URL 三种参考素材传输按接口合同选择。

现场证据见 [排查报告](../deploy/canvas-newapi-compatibility-audit.md)：小易结果外链可以用 `<img>` 显示，但 `fetch` 被 CORS 拦截。现有 `uploadImage` 退回仅展示外链，没有保存原图；再次图生图在 `hydrateNodeGenerationContext → imageToDataUrl` 阶段失败。此 await 位于生成入口的 try/finally 外，导致未提交任务、没有后台记录、界面一直转圈。

这条已证实的因果链是本方案的首要修复对象。此前易红/小易“后台成功但画布无结果”的其它请求，不在没有关联日志时一并宣布修复。

## 2. 修复边界

- 不新建图片存储系统，不改画布为云同步，不把所有生成图片强制存 OSS。
- 不删除已有节点、图片、素材、生成历史或用户配置，不清浏览器数据库。
- 不向所有 gpt-image 接口无条件增加 `response_format`；韭菜盒子 NewAPI 与直连 OpenAI 的请求规则分开。
- 不把 OSS 当作跨域读取代理：上传 OSS 之前仍必须拿到图片字节。
- 不增加自动生成重试，不自动降画质，不静默裁剪参考素材。
- 沿用现有超时、大小和并发规则。新增或调整任何边界值前，依 AGENTS.md 单独说明并确认。
- 新增外部请求只放 `web/src/services/api/`。本轮同时覆盖三个插件的图片和视频，不改无关 RH、菠萝、Wenwu、自定义脚本的合同。

## 2A. 方案审计结论：原方案不能直接交付

需求有价值且属于本轮目标；原实现方案不完整。下面“已确认”指本地插件源码/画布源码或离线函数复现，不表示生产插件版本和真实生成已经验收。

| 必修问题 | 代码证据与具体失败 | 最小修正；不修的后果 |
| --- | --- | --- |
| 视频请求体不匹配 | `video.ts:createOpenAIVideoTask` 发 FormData；小易、易红 `openai_video.decodeRequest` 只收 JSON，离线分别抛 `JSON video body required` / `JSON body required` | 已知平台模型按各自合同组装；否则修好图片读取后视频仍不能创建 |
| FK 表单字段不匹配 | FK 视频只接收 `images/videos/audios` 文件字段；画布发 `first_frame/last_frame/image[]/video[]/audio[]`，离线抛 `Unsupported video file field: first_frame` | FK 可本地文件直传，改为合同字段；不必让 FK 所有新视频都绕 OSS |
| 图片参数不是通用 OpenAI 参数 | FK 用 `imageSize=1K/2K/4K`，`quality=high` 离线抛 `Unsupported Fk imageSize: HIGH`；易红 GPT 仅接受列举尺寸，画布可算出不支持的 2880 方图；易红 Gemini 读取 ratio/imageSize 而非仅 quality/size | 参数面板和 API 共用当前已知模型的最小能力表；否则报错或悄悄生成错误比例/分辨率 |
| OSS 在部分视频中是必需项 | 小易 Grok 需要 HTTPS 单图；易红多数视频需要 HTTPS 素材；旧脚本使用 `/api/creations/uploads`，来源 App 已有 `/api/creations/upload-url` 直传合同 | P2 从可选扩展改为这些视频的交付前置项，不能把 blob/data URL 当 HTTPS 链接 |
| 宽泛脚本抢路由且不保存真实任务 | `model-scripts.ts` 用 Seedance 名称规则选择旧脚本；`createPluginVideoTask` 等完整脚本结束后才创建 nanoid，结果只在 Map；`project.tsx` 排除 plugin 任务持久化 | 三个已知平台插件走现有 create/poll 两阶段流程；否则刷新丢失查询能力，长时间转圈且难区分上传/生成 |
| 结果可展示不等于可保存 | FK 图片 render 只返回 URL，小易内部请求 URL；不能仅加 b64_json 就断言可本地保存。视频 `videoResultFromUrl/storeGeneratedVideo` 也会失败后退回无 storageKey 外链 | 图片逐插件核实宿主转换，视频使用已知鉴权 `/content` 合同并严格保存；否则下一次引用、下载仍可失败 |

### 三插件合同基线

读取来源：`/Users/by3/Documents/jiucaihezi-app/newapi-plugins/` 中 `fk.plugin.js`（0.3.2）、`xiaoyi-image.plugin.js`（0.2.0）、`yihong.plugin.js`（0.1.7）及各自 `__tests__`。只读对照，不在画布仓库复制整套插件运行时；历史服务器运维备份不能代替这些当前合同。本轮通过无网络、无收费的真实 decode 函数调用复现上表两种 JSON 拒绝、FK 文件字段拒绝、FK HIGH 拒绝和小易 5 秒拒绝；未运行完整测试套件。

| 插件 | 图生图 | 图生视频 | 关键限制与结果 |
| --- | --- | --- | --- |
| FK | 本地原图 multipart 可用；亦有 URL 合同，不混传；`imageSize` 与 ratio 分开传 | 当前型号可用 multipart `images/videos/audios`，也接受 JSON URL；旧 H3 兼容型号只接受公网 HTTPS | 六个图片 ID 的参考上限分为 10/8，不支持 mask；视频逐 ID 限定时长/分辨率/参考类型。图片返回 URL，必须验证宿主可读字节输出；视频有内容下载 hook |
| 小易 | edits 必须 multipart 文件；不改成 JSON URL；保留 size、quality 等原合同 | Grok JSON，最多一张 HTTPS 图，6/10 秒，480p/720p/1080p，16:9/9:16，不支持参考视频/音频 | 图像可多结果，默认请求 1；内部异步产物以 URL 为主。视频返回真实任务 ID，完成后可通过内容 hook 下载 |
| 易红 | GPT/Gemini 图片可用 multipart；一次仅 1 张结果；Gemini 最多 1 张参考图 | JSON；普通型号 images/videos/audios，Super/Prime 使用各自 media 合同，H3 使用 attachments；多数参考要求 HTTPS，Grok 支持图片 data URL | GPT 使用 GPT_SIZES 精确枚举，4K 仅横/竖两项；Gemini 使用 ratio + imageSize。图片解析支持 Base64，但宿主响应落库补丁是否部署需核验 |

易红视频不能合成一个“Seedance 通用合同”：Max 固定 30 秒，Muse 5–30，Omni 4–29，Pro 5–30，mini-Muse 5–15，Super 5–30，Cheap 4–30；Grok 固定 15，H3 4–15，Wan 两项 2–30 秒。还须按源码取各自画幅、清晰度和参考上限。FK 同样包含固定 30、15/30、4–30、15–30 秒等不同型号。以上是接口约束，不是已经批准修改画布默认值；实现前需向用户明确各型号默认值、超限处理并确认，不静默取整、裁剪或降级。

### 路由与部署前置条件

- 前端只请求自己的 NewAPI，不保存插件供应方 Key；“插件”指 NewAPI 服务端任务插件，不等同于画布的调用脚本/节点插件。
- 先核对生产启用插件版本、公开模型 ID/别名、NewAPI 映射和分组权限。原始模型名、界面显示名和供应方模型名不必相等，不能凭模型名称猜实际路由。
- 同一个公开模型若可能跨插件随机路由，必须先在自己的 NewAPI 统一对外合同，或提供明确可区分的公开模型别名，再适配画布。前端无法可靠猜中服务端本次分配的插件。
- 仅对已经确认的平台 + 公开模型合同绑定小型能力表；参数 UI 和请求组装复用它。不新建通用插件管理系统，不覆盖用户显式自定义脚本，不对所有第三方模型套默认合同。
- 真实插件 `decodeRequest → buildSubmitRequest` 必须参与合同测试；只写一个什么请求都返回 200 的 mock，不能证明插件适配。

## 3. 最小实现分四段

### P0：参考图读失败必须结束运行，并优先使用本地原图

1. `imageToDataUrl` 收到 `storageKey` 时，优先通过现有 `getImageBlob` 读取原图并转换为 Data URL，不先 fetch 已过期或跨域的 `dataUrl/url`。
2. 只有没有可用本地原图时才读取已有 Data URL 或远程 URL；原图缺失且远端也不可读时明确失败，不以空文件继续提交。
3. `hydrateNodeGenerationContext` 接收并向下传递同一个 AbortSignal，保留原图顺序、去重和引用标签规则。检查并同步所有调用者，包括普通生成、插件节点和重试路径。
4. `handleGenerateNode` 在启动 controller 后立即进入覆盖准备阶段的 try/finally。引用准备、参数验证、创建节点、提交、保存均能到达收尾；用于 catch 的节点 ID/阶段状态须在正确作用域声明。
5. 停止操作使用现有取消逻辑，不能因读取尚未结束而继续提交。错误展示说明“读取参考图失败”，保留内部 cause，但不泄露 Key、Base64 或完整签名 URL。

完成标准：失败后生成按钮恢复可用，controller 清理，edits POST 次数为零，控制台没有未捕获 Promise；第二次操作不会被旧运行状态阻塞。

P0 只解决本地读取与异常收尾；不能单独宣称新生成的跨域外链已经可靠保存。

### P1：让韭菜盒子生成结果确实保存到已有本地存储

#### 结果获取

- 在 `requestGeneration/requestEdit` 的平台请求组装处复用 `isJiucaiheziChannel` 判断实际 resolved Base URL，而非界面显示名。仅对已核实支持 OpenAI Images Base64 输出的韭菜盒子模型合同，显式请求 `response_format=b64_json`。
- 小易插件向供应方请求 URL 的内部行为不用改。已有接口资料说明 NewAPI 图片 presenter 可把结果转换成客户端要求的 Base64；这项能力必须通过当前生产合同验收，不以本地 mock 代替服务器验收。
- 对直连 OpenAI 的 gpt-image 模型继续省略该字段；其他渠道、Gemini 协议和用户自定义脚本保持各自合同，不自动套平台专用规则。
- `parseImagePayload` 继续支持 URL 和 Base64。不能把“声明请求 Base64”当成“响应必定为 Base64”；服务端仍返回 URL 时，必须实际读取和保存成功才能标为已持久化。
- 若当前服务端不能按合同返回 Base64，先修正对应 NewAPI presenter/插件输出，或另行明确受控结果下载合同。不要猜造图片 `/content` 路由，也不要加入任意 URL 开放代理。

#### 结果持久化

- 复用 `uploadImage/storeImage`。为“生成结果必须保存本地”增加最小的显式调用语义，例如现有 options 中的 `requireLocal`；不要让所有外部图片导入都突然失去原有展示能力。
- 严格保存的生成结果不能走“Image 标签能显示便返回无 storageKey”的成功分支。CORS、解码或 IndexedDB 失败要显示真实失败阶段。
- 更新所有生成结果入口：画布普通/批量图片、重试、蒙版编辑、角度编辑、内置面板写回、生图工作台及节点插件宿主。逐个检查其是否已有本地结果，避免重复下载或遗漏仅一条路径。
- 生成成功但本地保存失败时，保留当前页面能用于重试保存的结果句柄，重试只下载/保存已有结果，不能重新调用生成接口。结果尚未持久化就刷新，不能承诺恢复；不伪造可恢复状态。
- 下载优先使用已有原图 Blob，复用“我的资产”的 `getImageBlob → saveAs(blob)` 做法；缩略图仅用于展示，不作为再次编辑、下载和导出的原图。

完成标准：新生成图有有效 `storageKey`、本地 Blob 和正确尺寸；断开供应方结果地址后，仍能查看、下载、刷新恢复及再次图生图。

### P2：仅给 URL 型接口接 OSS，保持文件型接口直传

| 对外接口合同 | 画布提交方式 | 本轮重点 |
| --- | --- | --- |
| 小易/易红 OpenAI Images 文件编辑 | 原图 Blob → FormData → `/v1/images/edits` | 保留，直接使用本地原图，不先上传 OSS |
| 明确接受 Base64 的接口 | 本地 Blob → Base64 → 对应 JSON 字段 | 逐模型核实，不把 URL 字段填成 data URL |
| 仅接受 HTTPS 素材地址的接口 | 本地原图 → 申请 OSS 授权 → 表单上传 → 签名 URL | 接口确实需要时才走；不作为 multipart 失败后的自动重试 |

OSS 复用来源仓库 `src/api/media-generation.ts` 与 `scripts/newapi-media/extension/ossdirect/signer.go` 中已存在的合同：

1. 使用用户 NewAPI Token 请求 `POST /api/creations/upload-url`，JSON 为 `content_type`、`size`。
2. 读取 `upload_url`、`form_fields`、`asset_url`；字段缺失、地址或类型非法时停止。
3. 仅将授权表单字段和图片文件发送到获准的 OSS 上传地址，文件字段最后添加。不要手写 multipart Content-Type，也不要把 NewAPI Authorization 或 Cookie 发往 OSS。
4. OSS 返回 204 等成功状态时，不能强制解析 JSON；成功后使用完整 `asset_url`，不裁掉签名查询参数。
5. 前端只得到临时授权，不持有长期 OSS Secret。平台授权接口和 OSS Bucket 都需要允许画布来源的正确浏览器 CORS；桌面原生 HTTP 成功不等于网页已通过。
6. 校验授权上传地址必须是 HTTPS 且属于本平台预期 Bucket/地域，防止伪造授权诱导上传到其他站点。最终绑定依据现有服务端配置，不凭空枚举白名单。
7. 取消或任一素材上传失败时，不提交生成请求。失败后根据剩余授权有效性重新申请，不新增自动次数/超时策略。

P2 不要求给无需 URL 的图片编辑和 FK 当前支持文件的视频增加 OSS 依赖，但必须覆盖小易及易红 URL 型图生视频。小易外链原图读不到时仍应先解决原图获取，不能直接把不可读 URL“上传”至 OSS。将此处 helper 命名/入参扩展到实际需要的参考媒体即可，不另建图片、视频两套授权上传逻辑；上传限制沿平台已确认合同，不能顺手照搬 App 的 20 MB/120 秒经验值。

### P3：三个插件的参数、视频任务和结果完整闭环

1. 按 2A 的生产公开模型映射补齐图片/视频能力表和请求组装。UI 不展示模型明确不支持的画质、时长、参考类型、mask 或首尾帧模式；API 层仍需校验，不能依赖 UI。已有用户配置不静默覆写，不支持时说明原因并要求选择。
2. FK 当前视频本地 Blob 直传 `images/videos/audios`；小易单图先 OSS 再 JSON；易红按型号组装 images/media/attachments 及 ratio、resolution、seconds/duration。不支持原生首尾帧语义时不能偷偷把首尾帧变成普通多图参考，提示改选支持模式。
3. 已知平台模型不再命中旧的宽泛内置脚本，复用现有 `createVideoGenerationTask/pollVideoGenerationTask/waitForVideoGenerationTask`。创建收到服务端 ID 后立即写入节点 metadata，保存对应模型、渠道身份和合同标识，随后轮询；不要保存供应方密钥或把真实 ID 替换成本地 nanoid。重载使用原渠道配置；渠道已删除/授权已变更时提示，不拿当前任意渠道查询。
4. 区分读取参考、上传、创建、生成中、获取结果、本地保存阶段，复用现有状态展示，不做通用状态机。停止本地轮询不等于服务端取消/退款，保留已创建任务供继续查询；查询/下载失败不得自动重提生成，不能丢掉真实 taskId。
5. 按三个插件内容 hook 与实际宿主路由核对 `/v1/videos/{id}/content`。已完成任务优先取受控的鉴权内容字节，不因响应带外部 video_url 就跳过内容下载；不把 NewAPI Key 发给外部结果域名。核验重定向与浏览器 CORS，不能只证明 Node/curl 能下载。
6. 完成状态与 URL 存在分别判断；失败状态不能因残留 URL 被标成功。结果需验证为可解码媒体而非 JSON、HTML 错误页或空文件，复用浏览器解码与现有存储，不手写容器解析器。
7. 视频也必须得到本地 Blob/storageKey 才标记保存完成，支持刷新播放、下载、抽帧再用；保存失败保留任务/结果，可单独重取保存，不重新收费。图片同样验收图生图后结果再次用于图生视频。

## 4. 测试设计：先红、再绿、最后整理

沿用 `web/package.json` 的 Bun 测试与 `web/tests/*.test.ts`，不为这次修复引入新的测试框架。已有纯节点合同测试继续保留其 Node 运行方式。

单元测试 mock `localforage` 的对象存储、网络、FileReader、图片解码与缩略图，只替换外部边界，调用真实生产函数；用实际有效的小 PNG 字节检查内容，不能只断言调用次数或源码中出现某个字符串。单独文件/进程隔离模块 mock，清理 fetch、window、URL 等全局替身，避免污染现有用例。

浏览器测试使用独立测试页面和本地 HTTP 夹具，提供两个不同 Origin：一个图片可以展示却不允许跨域读取，一个 API 提供可读的 Base64/文件结果。夹具记录路径和提交次数，不访问供应方。浏览器真实 CORS 与真实 IndexedDB 用此层验证，不能用 Node fetch mock 假装覆盖了浏览器限制；不关闭或刷新用户当前失败页。

### P0 用例

| ID | 场景 | 必须断言 | 修复前预期 |
| --- | --- | --- | --- |
| R1 | 有有效 storageKey，同时 dataUrl 为跨域/过期链接 | 从本地读取原始字节，远程 fetch 0 次，得到正确 Data URL | 当前优先 dataUrl，失败 |
| R2 | 没有本地原图，参考图 fetch 被 CORS 拒绝 | 出现参考图读取失败，running/controller 收尾，edits POST 0 次，无未捕获异常 | 当前会留下运行状态 |
| R3 | 参考图准备期间点击停止 | 同一 signal 到达读取；取消后不提交，无迟到状态写回，按钮恢复 | 当前 hydration 未传 signal |
| R4 | 本地原图正常，单图/多图参考 | 原图字节、顺序和标签不变；multipart 单图 image、多图 image[]；浏览器自行生成 boundary | 保护现有正确行为，允许原本已绿 |

候选测试文件：`web/tests/image-storage.test.ts`、`web/tests/canvas-reference-preparation.test.ts`。R2/R3 必须触发实际生成入口验证收尾，不能只测一个新写的、生产未使用的 helper；若当前 Bun 环境不能挂载真实 React 页面，则由上述独立浏览器夹具执行状态集成用例，不为了测试重构整个生成函数。

### P1 用例

| ID | 场景 | 必须断言 | 修复前预期 |
| --- | --- | --- | --- |
| R5 | 韭菜盒子已核实的图片模型，文生图和图生图 | 实际 JSON/FormData 均按合同传 b64_json；响应进入真实解析与保存流程 | 当前 gpt-image 名称规则省略字段 |
| R6 | 直连 OpenAI gpt-image、非平台渠道、Gemini、自定义脚本 | 保留各自原合同；用户 Key 不发给第三方结果域名 | 保护既有行为，不强求全部先红 |
| R7 | API 200 返回有效 Base64 | 原始 PNG 字节写 image_files，有 storageKey；预览与原图分离；没有图片外链 GET | 现有正常链路应保持通过 |
| R8 | API 200 返回 URL，图片仅能显示且 CORS 不可读 | 严格生成保存不能当作成功；保留结果句柄，显示保存失败；不能生成空 Blob | 当前会退回无 storageKey 的成功 |
| R9 | IndexedDB 写入失败、无效图片、下载失败后重试保存 | 清理本次部分写入/无效对象 URL，不删其它图片；生成 POST 始终只有首次 1 次 | 对照现状补证，不预先假设每项均失败 |
| R10 | 生成→刷新→下载→再次图生图，期间阻断供应方地址 | Blob 原始字节一致、图片比例正确、无需供应方地址或 OSS；页面无永久转圈 | 当前外链兜底不能完成闭环 |

候选测试文件：`web/tests/image-request.test.ts` 与图片存储测试；浏览器闭环包含普通节点、配置节点、图片工作台和自定义节点插件入口。数量为 1 与多结果部分失败分别覆盖，不能丢掉已经成功的图片。

### P2 用例（URL 型视频交付必测）

候选文件：`web/tests/image-upload.test.ts`，浏览器部分仍用独立夹具。

- 文件型/明确 Base64 型模型不访问 upload-url 或 OSS。
- URL 型模型：先授权、后按原样字段上传、最后生成；提交的签名 URL 与授权返回值逐字一致。
- 授权 401/403、错误结构、非 HTTPS/非预期 Bucket、OSS 非 2xx：明确失败，生成提交 0 次。
- OSS 204 空正文成功；上传表单没有 NewAPI Authorization/Cookie，也没有长期 Secret。
- 取消过程中不继续上传后续素材、不提交生成、不自动重试收费操作。
- 用真实浏览器验证授权请求和 OSS 请求分别通过 CORS，签名地址可读取；只用合成小图，不调用收费模型。

### P3 合同与视频闭环用例

候选文件：`web/tests/newapi-media-contract.test.ts`、`web/tests/video-task-lifecycle.test.ts`。在来源插件目录只读加载真实模块，夹具用合成字节和虚构 Token，不连接收费服务。实施时记录插件版本/内容摘要并建立固定合同夹具；来源目录不在其它机器时应明确缺少外部合同验证，不静默跳过。公开模型映射清单确认后，每一个目标公开型号至少一条合法图生图或图生视频合同用例，不能用同品牌一个型号代替全部型号。

| ID | 输入/故障 | 必须断言 |
| --- | --- | --- |
| V1 | 画布真实组装请求送入三个插件 decode/build | 小易/易红视频是合法 JSON；FK 表单字段合法；图片 edits 仍用文件；插件产出的供应方请求字段、比例和分辨率与用户选择一致 |
| V2 | FK high、易红 GPT 不支持方形 4K、Gemini 竖屏 4K | 用合同支持的明确映射或提交前报错，不发 HIGH、不悄悄变成默认 1K 方图；请求 n 默认 1 |
| V3 | 小易视频 5 秒、两参考图；FK 固定时长型号；易红全视频型号 | UI 与服务层约束一致；非法输入生成 POST 为零；合法边界保留原值，不使用旧脚本静默 clamp |
| V4 | 本地图、画布生成图、图生图结果分别作为视频参考 | 同一原始字节贯穿本地读取和文件/OSS；OSS 保留签名 URL；引用顺序正确，非文件型才上传 |
| V5 | 普通参考/首尾帧、易红 Super/Prime media、H3 attachments | 按实际合同组装及保留必要媒体时长；不支持模式明确拒绝，不丢音视频、不把末帧当首帧 |
| V6 | 默认平台、其它渠道、用户脚本、RH/Wenwu/Gemini | 目标平台走新合同；其它既有分支和显式用户脚本不被劫持；不使用名称正则覆盖整个品牌 |
| V7 | 创建后 queued/in_progress/completed，生成途中刷新 | 立即保存真实 taskId；刷新只 GET 原任务，不再 POST；用原渠道身份和公开模型查询，不依赖进程内 Map |
| V8 | 创建响应丢失、轮询 401/403/404/网络断开、服务端失败/未知状态 | 明确区分阶段；没有已知 ID 时不冒称可恢复、不自动重提；已知 ID 保留并可续查；未知状态不能当成功，不新增无限重试策略 |
| V9 | 上传前停止、提交后停止、响应迟到、切换/删除渠道 | 上传前停止不提交；提交后停止不宣称服务端取消；迟到响应不破坏节点，已知 ID 不丢；不使用另一渠道 Key 查询 |
| V10 | completed 带跨域/受保护 video_url；failed 带残留 URL | 从合法鉴权 content 路由取有效视频；外站不收 Key；failed 不被 URL 判成功；HTML/JSON/空 Blob 不入库为视频 |
| V11 | 下载失败、存储配额不足，然后重试保存 | taskId 和已有结果不丢；重试仅 GET/存储；生成 POST 仍只有 1 次，不覆盖其它素材 |
| V12 | 三插件分别完整浏览器验收 | 图生图→显示/本地保存→刷新→下载→同图生视频→播放/保存→刷新/下载→视频抽帧；屏蔽供应方旧图片外链后本地素材仍可复用 |

真实生产验收按三个插件各自独立记录：公开模型、实际命中的插件版本、任务 ID（脱敏）、请求格式、生成与下载结果。至少每插件各一条图生图和图生视频，再覆盖各合同不同的型号家族；某家族未验证就标未验证。失败无需重生成的查询/下载优先复用已有任务。真实收费请求由用户安排/确认，不以反复重试证明修复。

## 5. 落地文件与调用面

| 位置 | 计划修改/验证 |
| --- | --- |
| `web/src/services/image-storage.ts` | 复用本地 Blob、严格生成保存语义、失败原因及取消 |
| `web/src/components/canvas/canvas-node-generation.ts` | hydration 的 signal 和引用顺序 |
| `web/src/pages/canvas/project.tsx` | 准备阶段 try/finally、所有图片生成/重试/编辑入口和下载 |
| `web/src/services/api/image.ts` | 已核实平台的结果格式、原有协议保护、参考图 signal |
| `web/src/pages/image/index.tsx` | 图片工作台保存、下载、再编辑闭环 |
| `web/src/pages/canvas/hooks/use-plugin-host.tsx` | 不漏掉节点插件宿主的生成结果 |
| `web/src/services/api/video.ts` | 三插件文件/JSON 合同、创建即返回真实 ID、内容下载及严格本地保存 |
| `web/src/services/api/audio.ts` | 只保护共享读取改动，不重写音频生成 |
| `web/src/lib/model-scripts.ts` | 缩窄三插件对旧内置脚本的误命中；保护其它渠道和用户脚本 |
| 现有图片/视频设置面板及模型配置/节点 metadata 类型 | 复用最小能力表、合法参数与模式、原任务渠道身份；改类型时同步全部调用者 |
| `web/src/lib/canvas/canvas-generation-helpers.ts` | 刷新恢复、原图/缩略图与重试引用不退化 |
| `web/src/services/api/image-upload.ts`（名称按实际媒体范围确定） | 已有 OSS 合同的最小浏览器接入，供 URL 型视频复用，不新增后端 |
| `web/src/i18n/locales/{zh-CN,en-US}.ts` | 读取、上传、结果保存错误，不泄漏敏感响应 |
| `web/tests/` | 边界 mock 和双 Origin 夹具；只为实际改动增加测试 |

生成成功/保存失败的最小状态表达在实现时沿现有节点 metadata 决定；不为本任务先设计一套通用媒体状态机。

## 6. TDD 执行与交付门槛

1. 先准备固定图片与双 Origin 夹具，记录 R2/R8/R10 对应的当前失败；费用接口调用次数为零。
2. 写 P0 的真实边界测试与浏览器集成用例，先确认缺陷断言失败，再做最小修复，变绿后才进入 P1。
3. P1 先写平台与非平台请求差异、严格保存和重复收费防护用例；确认新增断言能在旧代码失败，再实现。R4/R6/R7 等正常基线用例本来通过是合理的，不能人为制造失败。
4. P0/P1 绿色后，完成 URL 型视频所需 P2，再完成 P3。文件直传的 FK 路径不增加不必要的 OSS 依赖；不能在 P1 后宣布两个目标已经完成。
5. 计划实施时运行新增的定向 Bun 测试与受影响既有用例，保存修复前失败原因和修复后输出。Node 合同测试另跑。此处是未来执行要求，不是本轮已执行记录；发布阶段不额外执行构建/测试，遵循 AGENTS.md。
6. 浏览器按 V12 验收三插件的图片与视频闭环；先本地夹具，再由用户安排真实请求并核对费用。每个插件/合同家族单独记录，不能用小易通过替代易红/FK，也不能用文生图通过替代带参考素材。
7. 实施完成后把对应 TODO 移入 pending-test，按真实行为更新 CHANGELOG Unreleased；仅通过 mock 不进正式功能说明。用户确认后再更新 features。
8. 有代码修复、测试结果及风险说明后再提交/合入/发版；本方案不包含现在部署或修改 NewAPI/OSS 配置的动作。线上排障与部署给用户的命令一次一条。

最终验收不能只看 HTTP 200 或图片能显示：必须证明本地有原始媒体字节，刷新和下一次图生图/图生视频能复用，视频任务可续查且能播放下载，错误和取消能正常结束，保存失败不会再次收费。平台结果可读性、OSS 浏览器 CORS、生产插件合同任一未满足，均不得宣称“顺畅”。

## 7. 已有外链图片的处理边界

旧节点有有效本地原图时直接复用；只有外链、没有原图字节的节点保持数据不动。可通过用户另存后上传，或平台已有且确认可授权关联的结果恢复能力补回原图。没有可用原图/任务关联且外链已经失效的图片，不能承诺自动恢复，也不能偷偷重新生成替代。

本方案没有扩建永久云素材库、增加任意下载代理、迁移旧数据或修改计费规则。
