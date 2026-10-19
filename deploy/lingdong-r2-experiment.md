# 灵动 R2 小范围试验

## 插件 0.4.0 配套修复（已部署，真实生成待验收）

画布 v0.20.6 已构建、提交并发布：提交 `63cde114eddad970fb0108830c8b83123c309feb`，Docker image Actions `39206392474` 成功，镜像 digest `sha256:014f7ec09b1cd082ad7bb955cb2963d75d7b108eb396c1330a85e76a7e53b2ed`。生产画布已切换，保留原 env、bridge、无挂载及 `127.0.0.1:3010:3000`。旧容器 `infinite-canvas-backup-v0.20.5-DjCby8` 保留。

NewAPI 四模型白名单已在固定宿主源码上构建并部署，运行镜像 `jiucaihezi/new-api:rc40-lingdong-fourmodels`，ID `sha256:c9ff2598d34790b2ee2848e7e75984198b9716788d98cf9f77d98737fd9a6ab4`。原四份 Compose 解析配置仅 image 变化，环境变量按键值、挂载按目标路径核对不变，原路由文件 hash 不变，容器 healthy。切换校验中曾因 Env/Mounts 列表顺序变化自动回滚，核实无实际值变化并修正比较后重新切换成功。

本次备份在 `/root/jc-lingdong-fourmodels.DjCby8`，包括已用 `pg_restore --list` 校验的数据库归档、原容器配置、R2 源码和 override；`rollback-newapi.sh`、`rollback-canvas.sh` 可恢复旧运行镜像/容器。不要输出备份中的 env、inspect 或 Compose 正文。

已验证公网首页及 `/assets/index-B_DW5R7R.js` 均 200，bundle 含 v0.20.6 与四个新公开名；R2 API 预检204、未鉴权POST401，均允许画布来源。未读取用户 Key、未上传真实素材、未触发收费生成；这不是出片/下载/账单验收。用户需强刷确认版本，再先测一张图生图。

用户已部署画布 v0.20.5 并上传/激活灵动 0.4.0。生产图生图误走 multipart `/images/edits`，被插件的 JSON 校验拒绝；本地已改成参考原图→现有 R2 上传→`/images/generations` JSON `images` 数组，不新增服务。文生图不上传素材。插件文件和定价不需为本次修复再次修改。

当前画布合同与服务端 `r2direct/signer.go` 仅保留以下四个公开名；历史八型号表不是当前发布名单：

| 公开名 | 请求 |
| --- | --- |
| `灵动-gpt-image-2.5-flare` | JSON 图片接口，参考图使用 R2 URL |
| `灵动-gpt-image-2.5-sunburst` | 同上 |
| `灵动-sd2.5-满血-301010` | 视频 JSON，720p，4–30 秒，30图/10视频/10音频 |
| `灵动-sd2.5-满血-301010-2` | 同上 |

视频新选模型沿用本试验已批准默认 10 秒；已有节点和脚本不覆盖。20 MiB、上传5分钟/读取6小时以及签名校验均未调整。上传失败或取消不提交生成、不回退 OSS。两个图片公开名的文生图/图生图请求已直接送入实际插件 decode/build 夹具，两个视频同样覆盖；画布28项、插件147项及服务端三个 Go 包通过，真实图片响应、收费生成、R2读取、保存和账单未验收。

部署已按**先服务端白名单、后画布**完成，保留四个 Compose 文件、现有 R2/OSS 环境、数据库和回滚备份。下面 `prepare-r2.sh` / `activate-r2.py` 的镜像 tag、固定镜像 ID 和三文件基线属于首次试验，不能直接重跑来升级当前已激活的服务。此次使用独立镜像 tag，没有覆盖旧镜像；后续仍需先核验当前基线。

## 首次试验历史（八型号与旧脚本，仅供核对基线）

## 当前状态与边界

代码已实现、隔离回归通过。用户已在服务器完成镜像构建及 `activate-r2.py` 激活，新镜像 `jiucaihezi/new-api:rc40-media-lingdong-r2` 的 ID 为 `sha256:4daecc3bc0f41dbf39dfda3847b28193438e436cfd8be0537d3dde3898ff23bc`；源码路由备份在 `/opt/jc-r2-source-backup.juExjk`，数据库与 Compose 回滚备份在 `/root/jc-r2-switch-xrh4274u`。用户回执确认私有 R2 PUT/GET/HEAD、R2 CORS 探针与旧 OSS 授权通过，未调用生成；代理公网新路径 OPTIONS 已实测 204、未鉴权 POST 为 401，并带允许画布来源的跨域头。真实浏览器及灵动出片/下载/账单未验收。画布前端准备发布 v0.20.5。其他渠道继续使用 OSS，本次不迁移已有对象、不改插件定价、不增加自动删除。

采用用户已创建的私有标准桶 `jiucaihezi-media-test`，账户 `d055e5deea504cb25551755cc486a61a`。浏览器直接 PUT 到 R2；香港服务器只鉴权、签名，不转发素材字节。

批准的边界：单文件 20 MiB、上传授权 5 分钟、读取授权 6 小时。PUT 签名绑定具体对象、大小和 Content-Type；没有自动重试生成、没有失败后偷偷切换 OSS。读取签名失效不等于对象已删除；本次试验后需人工清理 `lingdong-temp/` 测试对象。

## 模型与请求合同

依据用户提供的灵动插件 0.3.0，与[实时能力目录](https://www.lingdongapi.com/api/pricing)取交集：

| 型号 | 时长 | 参考图/视频/音频 | 清晰度 |
| --- | --- | --- | --- |
| `SD-2.5-特价` | 固定 30 秒 | 30 / 0 / 0 | 由上游固定，省略 resolution |
| `SD-2.5-特价-2` | 固定 30 秒 | 10 / 0 / 0 | 由上游固定，省略 resolution |
| `cvk-2.5-480` | 4–30 秒 | 30 / 10 / 10 | 480p |
| `cvk-2.5-720` | 4–30 秒 | 30 / 10 / 10 | 720p |
| `cvk-2.5-1080` | 4–30 秒 | 30 / 10 / 10 | 1080p |
| `sd-2.5-720-v3` | 4–30 秒 | 30 / 10 / 10 | 720p |
| `sd2.5-101010` | 4–30 秒 | 10 / 10 / 10 | 720p |
| `sd2.5-301010` | 4–30 秒 | 30 / 10 / 10 | 720p |

新选模型时固定型号填 30 秒，其他型号沿用插件注释所记录的默认 10 秒；原节点及自定义脚本不覆盖。`sd2.5-a`、`sd2.5-3033` 未出现在当前实时目录，内置链路在上传前明确拒绝，不猜合同。目录将来可能变化，正式开放前再次核实；最终 Key 能否调用仍以 NewAPI `/v1/models` 为准，不凭这张表授予权限。

画布 → NewAPI `POST /v1/videos` 使用 JSON `model/prompt/duration/ratio/images/videos/audios`，有可选分辨率的型号才发送 `resolution`。保留素材顺序。带参考视频时先验证已读取真实时长，参考视频总时长加生成时长不得超过 25 秒，依据[官方文档](https://www.lingdongapi.com/docs/api/?v=20260517#video-create)。不自动改时长。

插件仍使用其现有 `/v1/videos` 提交/查询别名，未修改插件或价格 JSON。官方网页当前展示 `/v1/video/generations`；现有插件注释记录过别名验证，但此次未重新付费验别名。若生成失败，记录创建接口正文与后台任务，不自动重复收费。

## 服务端与画布改动

- App 仓库 `scripts/newapi-media/extension/r2direct/` 使用 rc.40 已有 AWS SDK v4 signer，不手写签名、不新增生产依赖。`extension/go.mod` / `go.sum` 只为独立测试这些扩展，不复制覆盖 NewAPI 的模块文件。
- `POST /api/creations/lingdong/upload-url` 复用 NewAPI TokenAuth，由已认证用户 ID 生成 `lingdong-temp/{user}/{random}.{ext}`；请求只接受型号、MIME 和大小，不接受任意桶、对象路径或上传目标。服务端只为以上型号和固定测试桶签名。
- 原 `/api/creations/upload-url` 的 OSS 合同和 `/api/creations/uploads` 本地存储不变。
- 画布仅为该平台的灵动合同调用新入口；校验授权只能指向本账户测试桶及同一对象。R2 PUT 不携带 NewAPI Authorization、cookie 或 Secret；上传失败/取消时不提交生成。
- 已识别灵动任务沿用现有真实任务 ID、查询与 NewAPI 鉴权 content 下载、本地保存链路。查询预算未改；长任务可能超出现有等待预算，必须用原任务 ID 恢复查询，不能重新生成。

## 部署顺序（服务端已激活，画布部署与端到端验收待完成）

1. **先只读核对服务器基线**。记录 `new-api` 当前 image、Compose project/config_files、固定源码 SHA 和现有宿主补丁；不输出 Env 或完整 inspect。当前已知源码在 `/opt/jc-newapi-media/source`，但不能把历史路径当成已核验现状。
2. 将本次 App 仓库的 `scripts/newapi-media/` 同步到服务器。确认构建授权后，执行 `bash scripts/newapi-media/prepare-r2.sh`：校验固定官方 SHA、既有 OSS/本地扩展和 multipart 补丁，备份源码路由后只新增 R2 代码，构建与测试新镜像；脚本不加载密钥、不修改 Compose、不重启服务。源码不匹配就停止，不要删除已有补丁强行继续。原有 Yihong 等补丁保持在源码中。
3. 在服务器 root-only `/root/jc-r2.env`（权限 600）保存 `R2_ACCOUNT_ID/R2_BUCKET/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY`，字段见 App 仓库 `scripts/newapi-media/r2.env.example`。真实凭据用隐藏输入或安全编辑器配置，不出现在命令行参数、聊天、Git、前端或插件里。尚未配置真实凭据。
4. 切换前使用现有 `backup_db.py` 备份数据库，保存全部现行 Compose 文件及原镜像 ID。以新增 Compose override 注入 R2 env 与新镜像，**保留所有原有 override、OSS env、挂载、网络与端口**；不要直接替换既有 env_file 列表。部署命令必须基于第 1 步实际输出生成；这里不提供未经核实的重启命令。回滚使用原 Compose 文件列表及原镜像，不删除数据或测试桶。

   基线已由用户回执确认是 `rc40-local-media-ossdirect-yihong-images-20261016`，三个 Compose 文件在 `/root/new-api-new/`。配套 `activate-r2.py` 已按该基线编写：核对新镜像精确 ID、root-only env、Key 的可用灵动型号、合并后的完整配置不变，再备份数据库并仅重建 NewAPI；以合成小图验证私有 PUT/GET/HEAD、R2 CORS 和旧 OSS 授权，失败尝试回滚并检查旧镜像健康。脚本隐藏输入 NewAPI 用户 Key，不传给 R2、不落盘，不请求生成。需单独上传此新脚本到服务器 `/root/lingdong-r2-prep/` 后运行 `python3 /root/lingdong-r2-prep/activate-r2.py`。会短暂重建服务，不重启服务器；本地模拟验证不等于真实切换通过。

   新增 override 是 `/root/new-api-new/docker-compose.r2.json`。备份目录内 `rollback.sh` 使用备份的 Compose 和旧运行镜像 ID，并固定原项目目录以免相对挂载跑偏。脚本若停止或自动回滚，先回传脱敏末尾，不要重复执行或删除 override 绕过校验。
5. 先确认新路由未鉴权返回 401，合法 Key 可获取授权；未配置 R2 时返回 503、非试验型号拒绝。核对 API Nginx 对新精确路径的 OPTIONS/POST 代理与 CORS：允许画布来源和 Authorization、Content-Type，不能只验证旧 OSS 路径。需要修改时按 `huabu-wenwu-runbook.md` 的备份、`nginx -t`、reload 规则处理。
6. R2 CORS 保持已保存的画布域名与两个本地来源、PUT/GET/HEAD、Content-Type、Expose ETag；桶保持私有，不开 r2.dev、不购买 Worker 服务。先在独立测试页面上传非敏感真实图片（不生成），验证浏览器成功、签名 GET 字节读回及 Content-Type；HEAD 使用响应单独的 `head_url`。GET 签名不能当成 HEAD 签名测试。还需验灵动是否会用 HEAD 预检 GET URL，未证实前不宣称私有签名 URL 已端到端兼容。
7. 构建发布画布前端，再强刷；现有已保存的模型分类不会被覆盖，必要时手动改为视频，自定义旧脚本需用户手动移除才能走内置合同。先选 `SD-2.5-特价-2`、30 秒、普通参考、1 张非敏感图片，由用户确认价格后提交一次。对账：创建、后台任务、生成、content 下载、IndexedDB 保存、播放与下载，逐项记录；失败先查原任务，不连续点生成。

可先让用户执行的只读检查（不含密钥）：

```bash
docker inspect new-api --format 'Image={{.Config.Image}} ImageID={{.Image}} Project={{index .Config.Labels "com.docker.compose.project"}} Compose={{index .Config.Labels "com.docker.compose.project.config_files"}}'
```

## 本地验证

- 先红后绿：画布未有灵动合同时，新增合同和直传用例失败；服务端 signer 未实现时新增 Go 用例失败。
- `cd web && bun test tests/newapi-media-contract.test.ts tests/media-regression.test.ts` 通过，包含隔离的图片存储、图片请求及视频生命周期回归；真实外部四个插件 decode/build 均运行，不是收费请求。
- 一次把多个 `.case.ts` 直接放进同一 Bun 进程时，已有模块 mock 相互污染导致图片存储两项失败；按仓库既定的隔离 runner 重跑全部通过，图片存储单独重跑也为 3/3。不要用同进程拼 fixture 的命令代替正式回归入口。
- App 仓库 `cd scripts/newapi-media/extension && go test -mod=readonly ./r2direct ./ossdirect ./jcmedia` 三包通过。覆盖固定私有桶、随机对象名、大小/MIME/owner/型号校验、PUT 签名头和 5 分钟/6 小时时效、独立 GET/HEAD 签名与取消。
- `activate_r2_test.py` 本地模拟覆盖 env/目标校验、原环境与端口/挂载保留、配置异常不切换、上传验证失败回滚、正常切换，以及真实探针不生成/不向 R2 传 Authorization；数据库备份既有 5 项回归通过。
- 用户服务器 Docker 构建及激活已成功，真实 R2 小图读写与旧 OSS 授权通过；公网跨域预检与鉴权已核对。v0.20.5 画布发布验证以发布交接为准，真实浏览器 R2 上传、灵动生成或账单仍待验收。
