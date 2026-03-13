# 远程访问连接模式（当前实现基线）

## 目标
- 统一描述当前已实现的连接模式语义
- 明确桌面端开关与移动端连接行为边界

## 当前连接模式

### IP 直连（direct）
- 移动端直接访问桌面端 HTTP API（默认端口 `3847`）
- 不依赖 relay 配对信息
- 适用于同局域网或用户自建公网映射场景

### Relay 中转（relay）
- 移动端通过 relay 与桌面端建立会话
- 依赖配对信息（`deviceId`、`pairingKey`）
- 适用于跨网络访问场景

## 桌面端远程访问开关语义
- 开启：允许 relay 模式配对与连接
- 关闭：拒绝 relay 模式新连接
- direct 模式不受该开关影响

## 运行规则
- mode 为 direct 时，按 direct 地址访问 API
- mode 为 relay 时，按 relay 会话通道访问
- 切换 mode 时需清理旧连接状态并重新建立连接

## 验收基线
- 移动端可显式切换 direct / relay
- direct 模式可完成基础 API 访问
- relay 模式可完成配对、连接、断开与重连
- 桌面端开关仅影响 relay 路径
