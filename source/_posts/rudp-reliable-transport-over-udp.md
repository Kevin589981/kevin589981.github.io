---
title: 基于 UDP 实现可靠传输：Go-Back-N 与 SACK 的工程实践
date: 2025-11-14
categories:
  - Projects
tags:
  - 网络编程
  - UDP
  - 可靠传输
  - Go-Back-N
  - SACK
  - Python
---

> TCP 的可靠性来自精心设计的重传机制，但其内部细节对上层应用透明。如果要在 UDP 这张"白纸"上手工绘制可靠传输，需要多少工程量？本文复盘了一次 RUDP（Reliable UDP）的完整实现，包括 Go-Back-N 与选择重传（SACK），以及针对各类异常场景的健壮性测试。

## 一、问题背景与协议设计

UDP 是面向无连接的无状态协议：快，但不可靠。数据包可能丢失、乱序、重复或损坏。在 UDP 之上实现可靠传输（RUDP），本质上是在应用层重新实现 TCP 的核心语义，但可以选择性地裁剪开销。

### 1.1 消息类型定义

RUDP 协议定义四种消息类型：`start`、`data`、`end`、`ack`（及 `sack`）。每个数据包格式如下：

```
<type>|<sequence number>|<data>|<checksum>
```

`checksum` 用于检测传输过程中的数据损坏，接收方在序列号确认前首先验证校验和。

### 1.2 核心发送策略

发送端需要满足以下约束：

- 数据包按序、可靠送达，支持丢包、乱序、重复等异常场景；
- 支持 **Go-Back-N**（GBN）与**选择重传**（Selective ACK, SACK）两种模式；
- 发送窗口大小为 5，超时时间 500ms。

---

## 二、发送端实现（Sender.py）

### 2.1 数据分片与窗口管理

文件内容按最大 1472 字节分片，加上 `start` 和 `end` 包，构成完整报文序列。核心状态变量包括：

- `base`：窗口左边界，指向最早未确认的包；
- `next_seq_num`：下一个待发送包的序号；
- `timer`：用于超时重传的时间戳。

```python
# 分片与打包
chunks = [content[i:i+MAX_DATA_SIZE] for i in range(0, len(content), MAX_DATA_SIZE)]
self.packets.append(self.make_packet('start', self.isn, ""))
for i, chunk in enumerate(chunks[:-1]):
    seq = self.isn + 1 + i
    self.packets.append(self.make_packet('data', seq, chunk))
self.packets.append(self.make_packet('end', self.isn + len(self.packets), chunks[-1]))
```

### 2.2 主循环：滑动窗口 + 超时重传

```python
while self.base < len(self.packets):
    # 填满发送窗口
    while (self.next_seq_num < self.base + self.window_size
           and self.next_seq_num < len(self.packets)):
        self.send(self.packets[self.next_seq_num])
        if self.base == self.next_seq_num:
            self.timer = time.time()    # 仅当新窗口打开时启动计时器
        self.next_seq_num += 1

    # 超时检测：重传窗口内所有未确认包
    if (self.base < self.next_seq_num
            and time.time() - self.timer > self.timeout):
        self.handle_timeout()
```

窗口语义的关键设计点：计时器仅在窗口从空变非空时启动，窗口滑动时重置，窗口归零时停止。这一逻辑若出现偏差，轻则包未及时重传，重则触发死锁。

### 2.3 ACK/SACK 处理：快速重传

```python
def handle_new_ack(self, ack):
    self.dup_ack_count = 0
    cum_idx, sack_indices = self._parse_ack_string(ack)
    if cum_idx > self.base:
        self.base = cum_idx    # 滑动窗口左边界
    if self.base < self.next_seq_num:
        self.timer = time.time()    # 仍有未确认包，重启计时器
    else:
        self.timer = None           # 所有包已确认，停止计时器
    if self.sackMode:
        self._update_sack_bitmap(sack_indices)    # 标记已选择确认的包
```

**三次重复 ACK** 触发快速重传（不等待超时），这是对 TCP Fast Retransmit 的直接移植，可在高丢包场景下显著缩短恢复延迟。

**SACK 位图**的核心价值在于：GBN 模式下一旦发生丢包，窗口内所有后续包必须全部重传；而 SACK 允许接收方精确告知哪些包已到达，发送端只需重传真正缺失的包，大幅降低重传放大倍数。

---

## 三、测试设计：覆盖各类异常场景

除了基础功能测试，以下健壮性测试用例专门针对不同类型的网络异常：

| 测试用例 | 模拟场景 | 验证目标 |
|----------|----------|----------|
| `AckCorruptionTest` | ACK/SACK 包内容损坏 | 发送端对无效确认的处理 |
| `AckDuplicationTest` | ACK/SACK 包重复 | 防止重复确认触发不必要的重传 |
| `AckLossTest` | ACK/SACK 包丢失 | 超时重传与窗口滑动正确性 |
| `AckReorderTest` | ACK/SACK 包乱序 | 对乱序确认的兼容性 |
| `DataCorruptionTest` | 数据包内容损坏 | 接收端丢弃损坏包并正确反馈 |
| `DataDuplicationTest` | 数据包重复 | 接收端去重能力 |
| `DataReorderTest` | 数据包乱序 | 接收端乱序缓存与窗口滑动 |
| `GBNTests / SackTests` | 上述场景分别用于两种模式 | 双模式的全覆盖验证 |
| `RandomDropTest` | 随机丢包 | 高丢包环境下的整体可靠性 |

### 3.1 测试结果分析

- **GBN 模式**：所有测试（含高丢包、乱序、重复）均通过，数据可靠送达，未出现死锁或永久丢包。
- **SACK 模式**：选择重传有效减少重传量，在高丢包环境下吞吐量明显优于 GBN。
- **大文件 / 二进制文件传输**：均通过，无数据错误，证明校验与分片逻辑正确。

---

## 四、遇到的问题与解决策略

### 4.1 窗口滑动与定时器同步

初始实现中，定时器更新时机与窗口滑动逻辑耦合不紧，导致部分已发包在某些状态下既不在定时器覆盖范围内、也未收到确认，形成"灰色包"，最终被遗忘。

**解决方案**：明确定义"计时器生命周期"为"窗口非空→停机"，窗口任何变动（发包、收 ACK）都触发相应的计时器操作，消除中间状态。

### 4.2 SACK 位图的双计数问题

SACK 模式下，如果位图更新逻辑与累计 ACK 解析之间存在重叠，可能对同一帧计数两次，导致提前重传或错误统计。通过将 `cum_idx` 推进逻辑与 `sack_indices` 位图更新逻辑严格串行化来消除此问题。

### 4.3 测试框架适配

实验框架对命令行参数格式和包格式有严格要求，手动测试时通过的逻辑在自动化测试中可能因格式错误失败。应在开发阶段就对齐框架期望的格式，避免后期大量调试。

---

## 五、设计权衡总结

RUDP 的实现让两个关键权衡变得清晰：

1. **窗口大小 vs 延迟**：窗口越大，吞吐量越高，但重传代价（GBN 模式）也越大。SACK 通过精确重传打破了这一耦合。
2. **超时值 vs 响应速度**：超时过短导致误重传（假阳性），过长则恢复延迟高。三次重复 ACK 触发的快速重传是应对突发丢包的低延迟补偿机制，无需等待超时周期。

从系统设计角度看，Go-Back-N 与 SACK 的选择实质上是"实现复杂度"与"网络效率"之间的权衡——在今天高丢包的无线网络环境中，SACK 早已是默认选择。

---

## 延伸阅读

- **[RFC 2018 TCP SACK 选项规范]**：选择重传的标准定义，值得对照实现细节阅读。
- **[QUIC 协议设计]**：Google 在 UDP 之上重新设计的可靠传输协议，融合了多路复用、0-RTT 握手等现代设计，是 RUDP 思想的工业级延伸。
- 下一篇预告：从传输层向上走——应用层的长程记忆问题：MemOS 记忆操作系统的工程实践。
