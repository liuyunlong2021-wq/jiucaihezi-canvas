# 线上画布部署与文武双修排障

## 当前发布交接

v0.20.5 增加灵动私有 R2 直传与 JSON 视频合同，其他渠道保留 OSS。配套 NewAPI 已由用户激活并完成 R2 小图读写、独立 HEAD 和旧 OSS 授权验证；公网新入口预检 204、未鉴权 POST 401，允许画布跨域来源。前端更新仍沿用下面的容器端口、网络及原 env，不把 R2 Secret 放进画布容器。真实浏览器与付费出片/下载仍待验收，详见 `deploy/lingdong-r2-experiment.md`。以下 v0.20.4 及更早交接作为历史证据。

v0.20.4 发布包含 FK 视频 OSS＋JSON 切换，配合 FK 插件 0.3.4；生产服务器由用户拉取镜像并切换容器。沿用 `/root/canvas-v0.20.2.ZfFFpW/container.env`、bridge、无挂载、`127.0.0.1:3010:3000` 和 unless-stopped；Nginx 不改，旧容器保留供回滚。用户确认 v0.20.3 已上线，但 FK multipart 仍空 500；图生图及清除过期脚本后的文武双修成功，不扩大为 FK 视频已通过。以下旧版本细节作为历史记录。

## 已验证的成功链路

线上地址：`https://huabu.jiucaihezi.studio`。实际部署仓库是 `/Users/by3/Documents/jiucaihezi-canvas`，远端为 `liuyunlong2021-wq/jiucaihezi-canvas`；不是 `/Users/by3/Documents/infinite-canvas` 的上游仓库。

历史修复提交：`b9b031a`；此前服务器镜像：`jiucaihezi-canvas:wenwu-b9b031a`，为源码构建的本地镜像。当前发布版本为 `v0.20.1`，包含文武双修修复、参考图交互、默认渠道和生成数量调整；本 fork 的 Docker image Actions 已成功，服务器已切换到 `ghcr.io/liuyunlong2021-wq/jiucaihezi-canvas:v0.20.1`，用户已确认线上显示该版本。该版本从修复分支打 tag 构建，发布提交 `fa1c81e` 已快进合入 `main`，未覆盖已有 `v0.20.0` 标签。

用户选择“武-MiniMax”，更新画布容器并补齐 API 的跨域白名单后反馈生成成功。此结论不扩展到文戏、其他七个 RH 应用、任务刷新恢复或计费的逐项验收。

链路：浏览器 → 画布静态前端 → `api.jiucaihezi.studio` → NewAPI/RH adapter → RunningHub。该链路不依赖用户电脑上的 comfy-adapter；浏览器配置若仍开启本地代理，则仍需运行本地代理或关闭该开关。

## 部署位置

| 项目 | 当前配置 |
| --- | --- |
| 容器 | `infinite-canvas` |
| 宿主机端口 | `127.0.0.1:3010` → 容器 `3000` |
| 画布 Nginx | `/etc/nginx/sites-enabled/huabu.jiucaihezi.studio.conf` |
| 画布代理 | `proxy_pass http://127.0.0.1:3010` |
| API Nginx | `/etc/nginx/sites-enabled/api.jiucaihezi.studio.conf` |
| 节点发现路由 | `location ^~ /api/runninghub/` |
| 节点发现上游 | `http://172.17.0.1:8789/api/runninghub/` |

画布和素材主要保存在浏览器本地；更新静态容器不等于云同步。API Key 存在浏览器本地，由前端发送到配置的接口。以下命令不包含密钥。

## 源码部署：没有已发布修复镜像时

在 Mac 上执行。`DEPLOY_REF` 必须替换为本次确认包含修复的提交或 tag；`b9b031a` 仅用于复现本次版本。`git archive` 不包含未提交改动。

```bash
cd /Users/by3/Documents/jiucaihezi-canvas
DEPLOY_REF=b9b031a
git archive --format=tar.gz -o /tmp/canvas-deploy.tar.gz "$DEPLOY_REF"
scp /tmp/canvas-deploy.tar.gz root@47.82.86.196:/tmp/
```

服务器执行。构建成功之后才停止旧容器；保留旧容器及环境变量供回滚。此命令适用于上表的静态站容器；启动参数、网络或挂载有变化时先核对 `docker inspect`，不要照搬。

```bash
set -e
DEPLOY_IMAGE=jiucaihezi-canvas:wenwu-b9b031a
DEPLOY_DIR=$(mktemp -d /opt/canvas-deploy.XXXXXX)
tar -xzf /tmp/canvas-deploy.tar.gz -C "$DEPLOY_DIR"
docker build -t "$DEPLOY_IMAGE" "$DEPLOY_DIR"

BACKUP="infinite-canvas-backup-$(date +%Y%m%d%H%M%S)"
docker inspect infinite-canvas > "$DEPLOY_DIR/old-container.json"
docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \
  infinite-canvas > "$DEPLOY_DIR/old.env"
chmod 600 "$DEPLOY_DIR/old-container.json" "$DEPLOY_DIR/old.env"

docker stop infinite-canvas
docker rename infinite-canvas "$BACKUP"
docker run -d --name infinite-canvas --restart unless-stopped \
  --env-file "$DEPLOY_DIR/old.env" --volumes-from "$BACKUP" \
  -p 127.0.0.1:3010:3000 "$DEPLOY_IMAGE"
printf '回滚容器：%s\n' "$BACKUP"
docker ps --filter name=infinite-canvas
curl -I http://127.0.0.1:3010/
curl -I https://huabu.jiucaihezi.studio/
```

正常应返回 200，但页面 200 只证明静态站可访问，不证明视频 API 可用。核对页面引用的新 JS 资源并在浏览器用 `⌘⇧R` 强刷，再测试生成。

正式版本镜像部署按 [AGENTS.md](../AGENTS.md) 的发版本流程：更新 VERSION/CHANGELOG、提交代码、推送版本 tag、等待 Docker image Actions 成功，再拉取 fork 命名空间的固定版本镜像。此次发布代码已合入 `main`；后续从主线继续开发。不要仅推分支就认为镜像已更新，也不要使用上游镜像覆盖 fork 的修复。

## 回滚

同一终端可使用 `$BACKUP`；换终端需设置为实际备份容器名，可用 `docker ps -a --filter name=infinite-canvas-backup` 查询。本次备份名为 `infinite-canvas-backup-20260930201744`。

```bash
# 换终端时先设置 BACKUP 为要恢复的容器名
docker stop infinite-canvas
docker rename infinite-canvas "infinite-canvas-failed-$(date +%Y%m%d%H%M%S)"
docker rename "$BACKUP" infinite-canvas
docker start infinite-canvas
curl -I http://127.0.0.1:3010/
```

## “请求失败”：先检查节点发现的 CORS

本次阻断原因：`/v1/videos` 跨域预检正常，但 `/api/runninghub/app-info` 使用独立白名单，只允许主站和 Pages 域名，漏了 `https://huabu.jiucaihezi.studio`。OPTIONS 返回 204、GET 返回 200，仍缺少 `Access-Control-Allow-Origin`，浏览器无法读取节点数据。命令行能拿到 JSON 不代表浏览器可以使用。

在 API Nginx 的 `location ^~ /api/runninghub/` 中，紧跟 `set $jc_runninghub_cors_origin "";` 增加：

```nginx
if ($http_origin = "https://huabu.jiucaihezi.studio") {
    set $jc_runninghub_cors_origin $http_origin;
}
```

保留其他来源规则、OPTIONS 处理、GET 响应的 CORS 头和 `proxy_hide_header`。只增加指定来源，避免返回重复的 Allow-Origin 头。

自动补丁命令（只适用于上述实际配置；找不到唯一锚点时拒绝修改）：

```bash
set -e
CONF=$(readlink -f /etc/nginx/sites-enabled/api.jiucaihezi.studio.conf)
NGINX_BACKUP="/root/api-nginx-backup-$(date +%Y%m%d%H%M%S).conf"
cp -p "$CONF" "$NGINX_BACKUP"
python3 - "$CONF" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
text = path.read_text()
anchor = 'set $jc_runninghub_cors_origin "";'
addition = '''
        if ($http_origin = "https://huabu.jiucaihezi.studio") {
            set $jc_runninghub_cors_origin $http_origin;
        }
'''
if addition.strip() not in text:
    if text.count(anchor) != 1:
        raise SystemExit("未找到唯一配置位置，未修改")
    path.write_text(text.replace(anchor, anchor + "\n" + addition, 1))
PY
if nginx -t; then
  systemctl reload nginx
else
  cp -p "$NGINX_BACKUP" "$CONF"
  echo "检查失败，已恢复原文件"
  exit 1
fi
```

修改配置先备份，`nginx -t` 成功才 reload。备份放 `/root`，不要放到可能被自动 include 的 Nginx 配置目录。

验证 OPTIONS 和 GET，不需要 API Key：

```bash
URL='https://api.jiucaihezi.studio/api/runninghub/app-info?webappId=2101840271142117377'
curl -sS -D - -o /dev/null -X OPTIONS "$URL" \
  -H 'Origin: https://huabu.jiucaihezi.studio' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization'
curl -sS -D - -o /dev/null "$URL" \
  -H 'Origin: https://huabu.jiucaihezi.studio'
```

两份响应都必须出现且仅出现一个 `access-control-allow-origin: https://huabu.jiucaihezi.studio`。前端镜像更新不会自动修改宿主机 API Nginx 白名单。

## 文武双修请求合同

- 应用 ID 固定为字符串 `2101840271142117377`，API 的 model 固定为 `rh-aiapp`。
- 生成前获取 app-info，保留完整 `nodeInfoList`，按 `nodeId + fieldName` 覆盖值；不要只提交修改过的节点。
- `28:prompt` 为提示词，`27:value` 为本次时长，`29:aspect_ratio` 使用发现结果的完整枚举。
- 图1～图9对应 `6:image`、`35:image`～`42:image`；按选中顺序填写，空槽明确写 `None`，不能沿用发现结果的示例图；超过九张拒绝提交。
- `65:index`：文-MiniMax 为字符串 `0`，武-MiniMax 为字符串 `1`。
- `metadata.rh_aiapp` 携带 `version: 1`、webappId、完整节点；顶层和 extra_fields 的 ID/节点镜像必须一致。旧的 extra_fields 戏种字段不能代替动态节点。
- JSON POST `/v1/videos`，保存返回的任务 ID，再 GET `/v1/videos/{id}`；有 ID 时继续查询原任务，不因等待超时重复创建。
- 图片 Data URL 可直接用于此合同，由服务端转为 RH 文件令牌；无须把 Data URL 问题当作默认根因。

实现在 `web/src/services/api/video.ts`、`rh-aiapp-nodes.ts`。两个模型在韭菜盒子公网渠道使用内置接入，跳过旧自定义脚本；其他模型保持原有流程。专项检查：

```bash
node --experimental-strip-types --test web/tests/rh-aiapp-nodes.test.mjs
```

若仍报错，记录失败请求 URL、状态码、响应体及任务 ID，再判断是节点发现、创建、查询还是下载失败。排障输出先去掉 Authorization、API Key 和硬编码上游密钥；不要直接分享整份 `nginx -T`。
