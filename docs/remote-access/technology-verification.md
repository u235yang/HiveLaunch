# 远程访问技术验证（当前实现基线）

## 结论
- 当前仓库远程访问链路以 Rust + Axum HTTP 服务为核心
- 已实现远程访问启停、状态查询、设备配对管理、密钥重置等关键接口
- 连接模式覆盖 direct 与 relay 两类路径

## 后端基线能力
- HTTP 入口：`infra/tauri/src/http_server.rs`
- 关键端点：
  - `POST /api/remote-access/enable`
  - `POST /api/remote-access/disable`
  - `GET /api/remote-access/status`
  - `POST /api/remote-access/device-name`
  - `DELETE /api/remote-access/paired/:device_id`
  - `POST /api/remote-access/regenerate-key`

## 前端基线能力
- 设置页包含远程访问模块入口
- 支持连接模式切换、状态展示、连通性测试、配对信息展示
- 支持直连地址与 relay 配置项输入

## 当前边界
- 文档仅确认仓库中可验证的已实现能力
- 不包含未落地的协议扩展与远期演进方案
