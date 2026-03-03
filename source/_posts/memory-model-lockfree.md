---
title: 内存模型与无锁编程：从 CPU 缓存到 C++ 原子操作
date: 2025-12-28
categories:
  - Systems-HPC
  - Paper Reading
tags:
  - C++
  - 并发编程
  - 内存模型
  - 无锁编程
---



> 本文是「底层架构与高性能计算」系列的第一篇，聚焦 C++ 内存模型与无锁数据结构的核心思想。

## 为什么要理解内存模型？

现代多核 CPU 的硬件优化（乱序执行、写缓冲区、缓存一致性协议）会让"看似正确"的并发代码产生灾难性的错误。理解内存模型是写出正确无锁程序的前提。

## CPU 缓存层次与一致性

```
L1 Cache (每核独享, ~4 cycles)
L2 Cache (每核独享或共享, ~12 cycles)
L3 Cache (所有核共享, ~40 cycles)
主内存 (~200 cycles)
```

MESI 协议保证缓存一致性，但**并不保证可见性顺序**。

## C++ 内存序简介

```cpp
#include <atomic>

std::atomic<int> flag{0};
std::atomic<int> data{0};

// 生产者
void producer() {
    data.store(42, std::memory_order_relaxed);
    flag.store(1, std::memory_order_release); // Release 屏障
}

// 消费者
void consumer() {
    while (flag.load(std::memory_order_acquire) == 0) {} // Acquire 屏障
    // 保证能看到 data = 42
    assert(data.load(std::memory_order_relaxed) == 42);
}
```

| 内存序 | 含义 |
|--------|------|
| `relaxed` | 仅保证原子性，不约束顺序 |
| `acquire` | 本线程后续读写不能重排到此操作之前 |
| `release` | 本线程之前的读写不能重排到此操作之后 |
| `seq_cst` | 全局顺序一致（性能最低） |

## 下一篇预告

- Lock-Free Queue 的完整实现（基于 `compare_exchange_weak`）
- ABA 问题及解决方案（Tagged Pointer / Hazard Pointer）
