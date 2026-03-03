---
title: 系统程序员视角：并发陷阱与内存模型精析
date: 2025-11-25
categories:
  - Systems-HPC
  - Paper Reading
tags:
  - 并发编程
  - 内存模型
  - C++
  - 无锁编程
  - ARM
  - 缓存一致性
---
原始论文：
https://github.com/mrkline/concurrency-primer


> 现代多核处理器为了追求极致性能，在编译器、CPU 微架构和缓存层次三个维度上对指令执行顺序进行了激进的重排优化。这些优化在单线程程序中不可见，却在并发场景下引发了难以复现的正确性问题。本文从系统程序员视角出发，系统梳理这些陷阱的根源，以及 C++11 内存模型如何在不牺牲性能的前提下给出精确的解决方案。

## 1. 并发正确性的三大破坏者

并发程序的正确性依赖于一个朴素假设：代码按书写顺序执行，写入立即对所有核心可见。然而现代计算机体系结构在三个层面上系统性地打破了这一假设。

### 1.1 编译器指令重排

编译器为避免 CPU 流水线停顿、提升缓存局部性，会在不改变**单线程语义**的前提下对指令进行重排。然而"不改变单线程语义"并不等同于"不改变多线程语义"：

- 编译器可能将一个对共享变量的写操作**提前**，使其被另一个线程过早观察到；
- 编译器可能通过分支预测**提前执行**某段计算，打乱代码的字面顺序；
- 在 `memory_order_relaxed` 下，编译器可将循环内的原子加载**提升至循环外**，导致轮询逻辑永远读取缓存值。

### 1.2 Store Buffer 与 Invalidation Queue

在多核处理器中，每个核心拥有私有的 L1/L2 缓存，以及写操作的缓冲区：

- **Store Buffer**：写操作首先进入写缓冲区，异步刷新到缓存和内存，导致**写入对其他核心不立即可见**；
- **Invalidation Queue**：缓存一致性协议（如 MESI）发出的缓存失效请求先入队，尚未实际失效，导致**其他核心可能读到过期的缓存行**。

这两个结构共同引入了**可见性延迟**：即使写操作已在逻辑上完成，其效果在另一个核心上观测到的时间点是不确定的。

### 1.3 NUMA 架构下的不均匀延迟

在 NUMA（Non-Uniform Memory Access）架构中，内存被划分为多个节点，每个节点物理上靠近某一组 CPU 核心。当核心访问远端节点的内存时，延迟显著高于本地节点，导致不同核心对同一内存地址的**可见性延迟极度不均匀且不可预测**。

### 1.4 "现在"的幻象

上述三重机制共同导致：在多处理器系统中，**不存在全局一致的"现在"（Now）**。即便两个核心同时读取同一内存地址，所得的值也可能来自不同时刻的版本。用 Preshing 的话说："Creating some sense of order between threads is a team effort of the hardware, the compiler, the programming language, and your application."——在硬件、编译器、语言标准和应用代码四个层次的共同协作下，才能人为构建出线程间的时序关系。

## 2. 数据完整性：撕裂读写问题

除了顺序问题，当操作数据宽度**超过处理器字长**或**内存未对齐**时，单次读写操作可能被 CPU 分解为多次总线事务，产生**撕裂读写（Torn Read/Write）**：

- 32 位机器上读写一个 64 位值：高 32 位和低 32 位可能来自不同时刻；
- 跨缓存行的非对齐访问：两次内存操作可能被中断打断，导致读到"半新半旧"的数据。

原子性在这里不再是逻辑问题，而是必须由**物理硬件**保证的特性。

## 3. 语言层：C++11 内存模型的精准控制

C++11 之前，C/C++ 没有标准化的多线程内存模型，程序员要么依赖重量级的全局互斥锁，要么在对具体平台的汇编语义的理解下直接操作内存（不可移植且易出错）。C++11 引入了 `<atomic>` 和一套枚举类型，赋予程序员对内存序的**细粒度控制**能力。

### 3.1 memory_order 枚举

| 内存序 | 含义 | ARM 指令开销 | 典型场景 |
|---|---|---|---|
| `relaxed` | 仅保证原子性，无顺序约束 | 无屏障 | 不依赖顺序的统计计数器 |
| `consume` | 数据依赖顺序（理论），编译器保守实现为 `acquire` | 单向屏障 | 指针读取后立即解引用 |
| `acquire` | 此操作后的读写不重排到此操作前 | 单向屏障 | 读取侧获取锁/标志 |
| `release` | 此操作前的读写不重排到此操作后 | 单向屏障 | 写入侧释放锁/标志 |
| `acq_rel` | 同时具备 acquire 和 release 语义 | 双向屏障 | RMW 操作（如 CAS） |
| `seq_cst` | 全局顺序一致性 | 全屏障 | 需要全局一致观测顺序的场景 |

### 3.2 计数器的正确实现

```cpp
#include <atomic>

// 错误：普通 int，fetch 和 add 可能被中断
int unsafe_counter = 0;
// void inc() { unsafe_counter++; }  // 读-改-写三步，非原子

// 正确：仅需原子性，无顺序要求
std::atomic<int> counter{0};

void inc() {
    // relaxed：不需要与其他变量建立顺序关系
    counter.fetch_add(1, std::memory_order_relaxed);
}
```

### 3.3 acquire-release 协议：轻量级同步

在"生产者-消费者"场景中，无需 `seq_cst` 的全局顺序，只需保证：**生产者对数据的写入在发布标志之前完成，消费者在读取标志之后才读取数据**。

```cpp
std::atomic<bool> ready{false};
int data = 0;

// 生产者（线程 A）
void producer() {
    data = 42;                                       // 普通写
    ready.store(true, std::memory_order_release);    // 释放屏障：data 的写入不会重排到此之后
}

// 消费者（线程 B）
void consumer() {
    while (!ready.load(std::memory_order_acquire));  // 获取屏障：读取 data 不会重排到此之前
    assert(data == 42);                              // 有保证
}
```

在弱序的 ARM 架构上，`acquire`/`release` 只需单向内存屏障（`dmb ishld`/`dmb ish`），**相比 `seq_cst` 节省约一半的屏障开销**。

### 3.4 CAS 中的差异化内存序

`compare_exchange_weak` 允许根据操作结果指定不同的内存序，实现性能优化：

```cpp
std::atomic<int> foo{0};

bool try_update(int expected, int desired) {
    return foo.compare_exchange_weak(
        expected,
        desired,
        std::memory_order_seq_cst,    // 成功：发布新状态，需全局一致性
        std::memory_order_relaxed     // 失败：仅 expected 被更新，无需同步
    );
}
```

成功时使用 `seq_cst` 确保其他线程能以全局一致顺序观测到此次修改；失败时仅更新局部变量 `expected`，不涉及共享状态，使用 `relaxed` 零屏障开销即可。

## 4. 硬件层：ARM 的 dmb 指令

ARM 是典型的**弱内存序**架构，允许处理器对 load/store 指令大幅重排。为实现原子操作，ARM 提供了 `dmb`（Data Memory Barrier）指令：

```asm
; setFoo：原子写，语义等价于 release store
    dmb ish          ; 确保 str 之前的所有内存操作完成并对其他核心可见
    str r0, [r1]     ; 原子写 foo
    dmb ish          ; 确保 foo 的写入对其他核心可见后，才执行后续内存操作

; getFoo：原子读，语义等价于 acquire load
    dmb ish          ; 确保 ldr 之前的所有内存操作完成
    ldr r0, [r1]     ; 原子读 foo
    dmb ish          ; 确保读取完成后才执行后续内存操作（获取屏障）
```

两个 `dmb` 构成了**完全内存屏障**，在弱序 ARM 上强行建立了符合直觉的顺序一致性。

## 5. LL/SC：ARM 上实现 RMW 操作

ARM 没有专门的 Read-Modify-Write（RMW）指令（如 x86 的 `lock xadd`），而是通过两条配对指令实现：

- **LDREX（Load-Linked）**：加载地址值，并在硬件层设置"独占监视器"；
- **STREX（Store-Conditional）**：仅当监视器仍有效（即目标地址未被其他核心修改）时，才写入新值，否则失败并返回错误码。

```asm
retry:
    ldrex r2, [r1]       ; 加载 foo，设置独占监视器
    add   r2, r2, #1     ; 计算新值
    strex r3, r2, [r1]   ; 条件存储，r3=0 表示成功
    cmp   r3, #0
    bne   retry          ; 失败则重试
```

**假阳性（Spurious Failure）问题**：硬件独占监视器的粒度通常为**缓存行**而非单个字节。若监视器监视的缓存行中的**相邻变量**被其他核心修改，即使目标变量本身未变，STREX 也会失败，导致额外重试，影响高竞争场景下的性能。

## 6. 无锁编程的真实代价

无锁编程常被误认为等同于高性能，实则需要审慎分析场景。

**无锁的真正优势不在于速度，而在于以下属性**：
- **进度保证**：在 OS 调度不公平（如优先级反转）或中断服务程序（ISR）等上下文中，有锁算法可能永久阻塞，无锁是此时的**唯一可行选择**；
- **避免死锁**：完全消除了死锁的可能性。

**无锁的潜在劣势**：
- 在高竞争环境中，基于 CAS 的重试循环可能导致 CPU 持续空转（livelock）；
- 在低竞争环境中，有锁方案通过让待等待线程睡眠来**减少 CPU 空转**，总体 CPU 利用率反而更高。

选择有锁 vs 无锁，核心依据是**竞争强度和是否可以阻塞**，而非单一的"哪个更快"。

## 7. 缓存伪共享：高并发读的隐藏杀手

下面的读写锁实现看似允许多个读者并行，实则存在严重的**缓存伪共享（False Sharing）**问题：

```cpp
struct RWLock {
    std::atomic<int> readers{0};  // 所有读者共同竞争同一缓存行
    std::atomic<bool> writer{false};
};

void read_lock(RWLock& lk) {
    lk.readers.fetch_add(1, std::memory_order_acquire); // 写操作！导致缓存行失效
}
```

每次读者调用 `fetch_add` 都是一次**写操作**，会导致包含 `readers` 的缓存行在所有参与读取的核心之间**反复失效与传输**。高并发读取下，这种缓存行的 ping-pong 效应可能使性能**差于简单的互斥锁**。

解决方案：为每个核心提供独立的读者计数（per-CPU 计数器），避免多核共写同一缓存行。

## 8. volatile：在并发中的一个致命误解

`volatile` 阻止编译器优化（如省略重复读写、常量折叠），常用于**内存映射 I/O（MMIO）**寄存器访问，防止编译器将硬件寄存器操作优化掉。

然而，`volatile` **不能用于线程同步**，原因有二：

1. **不保证原子性**：`volatile int` 的 `++` 操作仍会分解为三步（读-改-写），可能被中断；
2. **不产生内存屏障**：`volatile` 仅阻止编译器重排，无法阻止 CPU 的乱序执行，也不刷新 Store Buffer。

> **注意**：Java 中的 `volatile` 具有内存屏障语义（等价于 C++ 的 `acquire`/`release`），两者容易混淆，切勿将 Java 的理解代入 C/C++。

## 9. 原子融合陷阱：atomic 并非万能屏障

`std::atomic` 并不会完全禁止编译器优化。在 `memory_order_relaxed` 下，编译器自由度极高，可能发生**原子融合（Atomic Fusion）**：

```cpp
std::atomic<int> flag{0};

// 编译器可能将循环内的 load 提升至循环外
while (flag.load(std::memory_order_relaxed) == 0) {
    // 等待...
}
// 等价被优化为 if (flag == 0) while(true); ← 无限循环！
```

在需要轮询外部修改的场景下，应使用 `memory_order_acquire` 或借助 Linux 内核的 `READ_ONCE()`/`WRITE_ONCE()` 宏，后者通过 `volatile` 转换防止编译器将多次访问合并。

## 10. 总结

在现代多核系统中，"程序按照书写顺序执行"的假设已经失效。系统程序员必须在三个维度上主动建立顺序约束：

| 层次 | 问题来源 | 解决手段 |
|---|---|---|
| 编译器 | 指令重排、原子融合 | `std::atomic`、编译器屏障 |
| 硬件微架构 | Store Buffer、Invalidation Queue | 内存屏障指令（`dmb`、`mfence`） |
| 语言抽象 | 内存模型不可移植 | C++11 `memory_order` 枚举 |

在保证程序正确性的前提下，通过对不同场景选择最轻量的内存序，可以在弱序架构（ARM）上显著降低屏障开销，这正是系统程序员掌握内存模型的核心价值所在。

## 延伸阅读

- **[MESI 协议]**：多核缓存一致性的硬件实现细节，以及 Store Buffer 与 Invalidation Queue 的具体行为分析。
- **[C++ 内存模型规范]**：cppreference 上 `std::memory_order` 的完整语义，以及 N4860（C++20 标准草案）中对 happens-before 关系的形式化定义。
- 下一篇预告：操作系统内核的演进——从 Multics 的通用主义到 Unix 微内核，以及面向异构计算的未来架构设想。
