# 部署配置

这里放自托管部署用到的参考配置，主项目代码不依赖这些文件。

运维资料：[服务器手册原文备份](reference/README.md) · [画布与 NewAPI 媒体适配排查](canvas-newapi-compatibility-audit.md)。原文包含历史配置，执行前以实际渠道和插件状态为准。

| 文件 | 用途 |
| --- | --- |
| `nginx/infinite-canvas.conf` | 自定义域名反向代理示例（Cloudflare 源站证书 + 反代容器） |

完整步骤见文档：[自定义域名部署](../docs/content/docs/overview/custom-domain.zh-CN.mdx) · [Custom Domain Deployment](../docs/content/docs/overview/custom-domain.mdx)。

线上画布与文武双修的已验证操作：[部署、回滚与跨域排障手册](huabu-wenwu-runbook.md)。
