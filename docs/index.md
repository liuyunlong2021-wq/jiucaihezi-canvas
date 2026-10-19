# Infinite Canvas Documentation Index

## Overview

- [Quick Start](/docs/overview/quick-start)
- [Features](/docs/overview/features)
- [Deploy on Render](/docs/overview/render)
- [Docker Deployment](/docs/overview/docker)
- [Custom Domain Deployment](/docs/overview/custom-domain)
- [Third-party Prompt Sources](/docs/overview/third-party-prompt-repositories)

## Canvas Guide

- [Canvas Node Guide](/docs/canvas/canvas-node-manual)
- [Canvas Shortcuts](/docs/canvas/canvas-shortcuts)
- [Model Call Script Examples](/docs/canvas/model-call-scripts)

## Development and Data

- [FK / 小易 / 易红图生图与图生视频修复方案（TDD）](image-reference-fix-tdd.md)
- [媒体修复实施与验收记录](media-reference-fix-verification.md)
- [Local Development](/docs/development/local-development)
- [Canvas Data Structure](/docs/development/canvas-data-structure)
- [How the Local Codex Connection Works](/docs/development/local-codex-canvas)

## Business

- [Open-source License](/docs/business/license)
- [Business Cooperation](/docs/business/business)

## Support and Security

- [Report a Vulnerability](/docs/support/security)
- [Sponsor the Project](/docs/support/sponsor)

## Project Progress

- [Changelog](/docs/progress/changelog)
- [Pending Tests](/docs/progress/pending-test)
- [TODO](/docs/progress/todo)

## Production Operations

- [灵动 R2 小范围试验](../deploy/lingdong-r2-experiment.md) — 已实现合同、私有签名上传、服务器准备与尚未完成的验收边界。

- [服务器运维资料快照](../deploy/reference/README.md) — 原文备份、来源摘要及历史信息边界。
- [画布与 NewAPI 媒体适配排查](../deploy/canvas-newapi-compatibility-audit.md) — 图生图结果回传、浏览器存储与 Task Plugin 协议缺口。
- [线上画布部署与文武双修排障](../deploy/huabu-wenwu-runbook.md) — 实际 fork 仓库、源码部署、镜像更新、回滚、节点发现 CORS 与成功验收边界。

## Notes

- Canvas projects and My Assets are primarily stored in the browser. WebDAV can be configured for cross-device synchronization.
- The AI API key is stored in the browser, which sends requests directly to OpenAI-compatible endpoints.
