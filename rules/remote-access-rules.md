# HiveLaunch 远程访问与排障规则

## 1. 已确认根因（历史故障）

移动端模型加载 WebSocket 不工作，根因通常不在模型接口，而在 relay 连接阶段失败：

1. Mobile 的 `device_id` / `pairing_key` 与 Desktop 注册不一致或已过期
2. `Connect` 连续失败触发 `RATE_LIMITED`
3. 会话未建立导致后续模型发现 `WsOpen` 不进入业务链路

## 2. 认证级致命错误处理

以下错误视为认证级致命错误，必须抑制自动重连风暴：

- `DEVICE_NOT_FOUND`
- `INVALID_PAIRING_KEY`
- `PAIRING_KEY_EXPIRED`
- `PAIRING_COOLDOWN`
- `RATE_LIMITED`

致命错误后，仅允许以下事件恢复重连：

1. 用户主动重连
2. 凭证更新（storage 变更）
3. 显式调用 connect

## 3. 用户提示规范

- 对用户提示必须可操作：明确指引“去 Desktop 重新生成配对码并同步到 Mobile”。

## 4. 日志规范

- relay 连接链路前缀：`[relay-transport]`
- 模型发现 WS 前缀：`[model-discovery][ws]`
- 最少记录事件：`connect_success` / `connect_failed` / `relay_error` / `ws_open_request` / `ws_open_ack` / `socket_close`
- 日志禁止输出敏感值（`pairing_key`、`token`）

## 5. 标准排障顺序

1. 先看 relay 管理面错误码分布（是否 `PAIRING_KEY_EXPIRED` / `INVALID_PAIRING_KEY`）
2. 确认 Mobile 当前凭证与 Desktop 最新凭证一致
3. 验证 relay 会话是否已建立（session/token）
4. 再验证模型 WS 路径是否真正发起（`/api/agents/discovered-options/ws`）
5. 最后检查模型发现接口与后端实现
