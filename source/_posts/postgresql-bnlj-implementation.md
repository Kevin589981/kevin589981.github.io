---
title: 深入 PostgreSQL 内核：实现块嵌套循环连接优化
date: 2025-06-05
categories:
  - [Projects]
tags:
  - PostgreSQL
  - 数据库内核
  - 缓存优化
  - C
  - 项目实战
  - 性能优化
---

> 嵌套循环连接（Nested Loop Join）是关系型数据库最基础的连接算法，但其糟糕的缓存利用率一直是性能瓶颈所在。本文记录了在 PostgreSQL 源码层面实现块嵌套循环连接（Block Nested Loop Join，BNLJ）的完整过程：从 GUC 参数注册、执行节点状态扩展，到流水线状态机的设计，以及用 `palloc` 替代 `malloc` 踩坑的教训。最终实验表明，将块大小调至 128 可获得约 48.5% 的性能提升。

## 1. 背景：嵌套循环连接的缓存困境

PostgreSQL 原始嵌套循环连接的逻辑极为直白：

```python
for each outer tuple i:
    for each inner tuple j:
        if join_condition(i, j): emit (i, j)
```

其时间复杂度为 $O(|R| \cdot |S|)$，每处理一个外表元组就要完整扫描一遍内表。这在 I/O 层面造成两个问题：

1. **内表重复扫描**：内表被扫描 $|R|$ 次，每次都从磁盘重新加载；
2. **CPU 缓存浪费**：每次只有一个外表元组在缓存，块内比较无从发生。

块嵌套循环连接通过批量缓存外表元组来解决这两个问题：

```python
for each block B of outer tuples (size = block_size):
    for each inner tuple j:
        for each outer tuple i in B:
            if join_condition(i, j): emit (i, j)
```

设外表元组数为 $R$、内表元组数为 $S$、块大小为 $B$，理论 I/O 代价对比：

$$T_{\text{NLJ}} = R \times S \times C_{\text{page}}$$

$$T_{\text{BNLJ}} = \left\lceil \frac{R}{B} \right\rceil \times S \times C_{\text{page}}$$

当 $B$ 足够大时，内表扫描次数从 $R$ 降至 $\lceil R/B \rceil$，理论加速比为 $B$（受边际效应限制）。

---

## 2. PostgreSQL 执行器架构概述

在动手修改之前，需要理解 PostgreSQL 的执行器工作模式。每个计划节点（Plan Node）实现三个标准接口：

```c
ExecInitNode();                              // 初始化节点，分配资源
while ((tuple = ExecProcNode()) != NULL) {   // 循环拉取元组（Volcano 模型）
    // 处理元组
}
ExecEndNode();                               // 清理资源
```

这是经典的 **Volcano/Iterator 模型**：父节点调用子节点的 `Next()`，子节点按需产出一个元组。对于嵌套循环连接节点（`nodeNestloop.c`），`ExecNestLoop` 函数就是这个 `Next()` 的实现。

本实验的目标就是修改 `ExecNestLoop`，使其从"每次取一个外表元组"变为"每次取一批外表元组"。

---

## 3. 实现步骤

### 3.1 注册 GUC 参数

为了允许通过 SQL 命令动态调整块大小，在 `src/backend/utils/misc/guc.c` 中注册一个整型 GUC 参数：

```c
int block_nested_loop_join_block_size;

static struct config_int ConfigureNamesInt[] =
{
    {
        {"block_nested_loop_size", PGC_USERSET, RESOURCES_MEM,
            gettext_noop("Sets the block size for blocked nested loop joins."),
            NULL,
            GUC_UNIT_BLOCKS
        },
        &block_nested_loop_join_block_size,
        4, 1, 1024,          // 默认值 4，范围 [1, 1024]
        NULL, NULL, NULL
    },
    // ... 其他参数
}
```

之后可以通过 `SET block_nested_loop_size = 64;` 在会话级别动态调整块大小。在 `src/include/executor/nodeNestloop.h` 中导出该变量：

```c
extern int block_nested_loop_join_block_size;
```

### 3.2 扩展 NestLoopState 结构

原始的 `NestLoopState` 只需维护"是否需要新外表元组"等简单状态。BNLJ 需要额外追踪外表**块**的状态，在 `src/include/nodes/execnodes.h` 中扩展：

```c
typedef struct NestLoopState
{
    JoinState   js;                  /* 基类，必须是第一个字段 */
    bool        nl_NeedNewOuter;
    bool        nl_MatchedOuter;
    TupleTableSlot *nl_NullInnerTupleSlot;

    /* === BNLJ 新增字段 === */
    int          block_size;         // 用户配置的块大小
    TupleTableSlot **outerBlock;     // 外表块缓冲区（指针数组）
    int          outerStoredCount;   // 当前块中实际存储的元组数
    int          outerCount;         // 当前正在处理的块内元组索引
    bool         nl_NeedNewBlock;    // 是否需要加载新的外表块
    bool         nl_NeedNewInner;    // 是否需要获取新的内表元组
    bool         no_more_tuple;      // 外表已无更多元组
} NestLoopState;
```

关键设计：`outerBlock` 是 `TupleTableSlot *` 的指针数组，每个槽位独立持有一个元组的拷贝，由 PostgreSQL 统一的元组槽抽象管理生命周期。

### 3.3 初始化：分配块缓冲区

在 `ExecInitNestLoop` 末尾，从全局 GUC 参数读取块大小并分配内存：

```c
nlstate->block_size = block_nested_loop_join_block_size;
nlstate->outerCount = 0;
nlstate->outerStoredCount = 0;

// 使用 palloc 而非 malloc！
nlstate->outerBlock = (TupleTableSlot **)palloc(
    nlstate->block_size * sizeof(TupleTableSlot *));

nlstate->nl_NeedNewBlock = true;
nlstate->nl_NeedNewInner = false;
nlstate->no_more_tuple = false;

// 为每个槽位初始化独立的 TupleTableSlot
for (int i = 0; i < nlstate->block_size; i++) {
    nlstate->outerBlock[i] = ExecInitExtraTupleSlot(
        estate,
        ExecGetResultType(outerPlanState(nlstate)),
        ExecGetResultSlotOps(outerPlanState(nlstate), NULL));
}
```

> **关键教训**：这里**必须用 `palloc`，不能用 `malloc`**。PostgreSQL 的元组槽绑定到内存上下文（Memory Context），如果使用 `malloc` 分配缓冲区，部分自动清理机制会和手动 `free` 产生冲突，导致 `SELECT COUNT(*)` 结果偏大甚至段错误（见第 6 节）。

### 3.4 清理：释放块缓冲区

在 `ExecEndNestLoop` 中清理新分配的状态：

```c
if (node->outerBlock != NULL) {
    for (int i = 0; i < node->block_size; i++) {
        if (node->outerBlock[i])
            ExecClearTuple(node->outerBlock[i]);  // 清除槽位，而非 pfree
    }
    node->outerCount = 0;
    node->outerStoredCount = 0;
    node->block_size = 0;
}
```

注意使用 `ExecClearTuple` 而不是直接 `pfree`，因为槽位的内存由上下文管理，强制 `pfree` 会破坏内存上下文的完整性。

### 3.5 核心执行逻辑：三层流水线状态机

`ExecNestLoop` 是最核心的改动。BNLJ 由三个嵌套的逻辑层构成，使用三个 bool 标志控制状态转移：

```
nl_NeedNewBlock  →  加载外表块
nl_NeedNewInner  →  获取一个内表元组
nl_NeedNewOuter  →  取块内下一个外表元组（触发匹配）
```

状态转移图：

```
初始 → [NeedNewBlock=true]
  └→ 加载块（最多 block_size 个外表元组）
  └→ [NeedNewInner=true] 重置内表扫描
     └→ 获取一个内表元组
        ├→ 内表元组为空 → [NeedNewBlock=true]（内表扫描完，换下一块）
        └→ [NeedNewOuter=true]，重置块内索引
           └→ 遍历块内每个外表元组，执行连接判断
              ├→ 块内元组耗尽 → [NeedNewInner=true]
              └→ 匹配成功 → 投影并返回
```

**层一：加载外表块**

```c
if (node->nl_NeedNewBlock) {
    node->outerStoredCount = 0;
    while (node->outerStoredCount < node->block_size) {
        outerTupleSlot = ExecProcNode(outerPlan);
        if (TupIsNull(outerTupleSlot) && !node->outerStoredCount)
            return NULL;  // 外表为空，整个连接结束
        if (TupIsNull(outerTupleSlot)) {
            node->no_more_tuple = true;
            break;        // 外表已取完，块可能不满
        }
        ExecCopySlot(node->outerBlock[node->outerStoredCount], outerTupleSlot);
        node->outerStoredCount++;
    }
    node->nl_NeedNewBlock = false;
    node->nl_NeedNewInner = true;
    ExecReScan(innerPlan);  // 重置内表，准备新一轮扫描
}
```

**层二：获取内表元组**

```c
if (node->nl_NeedNewInner) {
    innerTupleSlot = ExecProcNode(innerPlan);
    econtext->ecxt_innertuple = innerTupleSlot;
    node->nl_NeedNewInner = false;
    node->outerCount = 0;
    node->nl_NeedNewOuter = true;
    if (TupIsNull(innerTupleSlot)) {
        node->nl_NeedNewBlock = true;  // 内表扫描完，需要新块
        if (node->no_more_tuple)
            return NULL;               // 外表也完了，结束
        continue;
    }
}
```

**层三：遍历块内外表元组（最内层）**

```c
if (node->nl_NeedNewOuter) {
    if (node->outerCount >= node->outerStoredCount) {
        node->nl_NeedNewInner = true;  // 块内遍历完，取下一个内表元组
        node->outerCount = 0;
        continue;
    }
    outerTupleSlot = node->outerBlock[node->outerCount++];
    econtext->ecxt_outertuple = outerTupleSlot;
}
// 执行连接条件判断，成功则投影返回
```

---

## 4. 实验结果

实验使用 PostgreSQL 内置的 `restaurantphone` 表（外表，2463 个元组）进行连接测试，禁用哈希连接与归并连接以强制使用嵌套循环，对不同块大小测量执行时间（每组运行两次取第二次热启动结果）：

| 块大小 | 运行时间（ms） | 相对未优化的加速比 |
|--------|---------------|-------------------|
| 修改前（原始 NLJ） | 455.807 | —— |
| 1      | 457.915       | -0.46%（略慢）   |
| 2      | 332.043       | 27.15%           |
| 4      | 323.550       | 29.02%           |
| 8      | 283.995       | 37.69%           |
| 16     | 255.516       | 43.94%           |
| 32     | 243.390       | 46.60%           |
| 64     | 239.891       | 47.37%           |
| 128    | 234.610       | **48.53%**       |
| 256    | 231.298       | 49.26%           |
| 512    | 230.491       | 49.43%           |
| 1024   | 229.880       | 49.57%           |

![初始嵌套循环连接测试（禁用 hash/merge）](/images/postgresql-bnlj/image-2.png)

---

## 5. 性能分析

### 块大小为 1 时反而变慢

块大小为 1 时，BNLJ 等价于原始的 NLJ，但由于 PostgreSQL 优化器会自动选择代价最低的内外表顺序，我们强制指定的内外表分配与优化器原来的选择**互换了角色**，导致性能略微下降。

### 边际效应：块大小 > 32 后收益递减

从数据可以看出：块大小 32 → 64 的提升约 0.77%，64 → 128 约 1.16%，128 → 256 约 0.73%，此后几乎平台化。原因在于：

当 $B$ 增大到 $R/k$（$k$ 为小常数）后，$\lceil R/B \rceil$ 变化微乎其微，此时**外表加载本身的固定代价**成为瓶颈：

$$T \approx \underbrace{R \times C_{\text{page}}}_{\text{固定（外表加载）}} + \underbrace{\left\lceil \frac{R}{B} \right\rceil \times S \times C_{\text{page}}}_{\text{可优化部分}}$$

此外 CPU 缓存大小也构成物理上限——当块大小超出 L3 缓存容量时，块内比较本身也开始产生 cache miss。

### 工程建议

块大小 **32 ~ 128** 是性价比最高的区间：对于大多数工作负载，这已能获得接近最优的 I/O 减少效果，同时避免过大块占用过多内存。在实际 PostgreSQL 配置中，可以通过 `block_nested_loop_size` 在会话级别为特定查询精细调优。

---

## 6. 实验中踩的坑

### 坑 1：`malloc` 导致 `SELECT COUNT(*)` 结果偏大

这是本次最诡异的 bug。将块缓冲区用 `malloc` 分配后，执行 `SELECT COUNT(*)` 的结果比实际值偏大。

原因：PostgreSQL 的执行器是**流水线（pipeline）式**的，内存管理依赖**内存上下文（Memory Context）**的生命周期。部分元组槽和 plan node 状态会在查询结束时由上下文统一回收。`malloc` 分配的内存游离于上下文之外，当上下文的自动清理和 `pfree` 产生冲突时，可能导致内存重叠或 use-after-free，使得已释放的元组数据仍被计数。

**解法**：改用 `palloc`，所有分配纳入查询内存上下文，随查询结束自动回收。

![`malloc` 导致 count 偏大的调试输出](/images/postgresql-bnlj/ef0afdae194f6a2c5fb918e4c0001cb.png)

![另一次 debug 截图](/images/postgresql-bnlj/f5eb8b6ccb88b2dd835808ef070cbb3.png)

### 坑 2：死循环定位困难

流水线状态机逻辑中，`nl_NeedNewBlock` 的初始值设置错误，导致程序陷入死循环。由于 PostgreSQL 是多进程架构，GDB 无法直接 attach 到查询进程。解法：

1. 先完成用户连接（`psql`）；
2. `ps aux | grep postgres` 获取查询子进程 PID；
3. `gdb -p <pid>` attach 后中断，观察调用栈和局部变量。

### 坑 3：GDB 调试时内外进程分离

PostgreSQL 会为每个连接 fork 一个子进程，GDB attach 父进程无法追踪查询执行逻辑。需要 attach 到实际执行查询的子进程（`postgres: user db ...` 进程）。

---

## 7. PostgreSQL 内部机制补充说明

### Volcano 模型中的 ExecReScan

`ExecReScan(innerPlan)` 是 BNLJ 能够正确工作的关键调用。每当外表块切换时，内表需要从头扫描，`ExecReScan` 将内表计划节点的状态重置到初始状态（等价于 `rewind`）。

**注意**：只在块切换时调用，而不是每个外表元组触发一次——这正是 BNLJ 相比 NLJ 的核心优化所在（内表扫描次数从 $R$ 降为 $\lceil R/B \rceil$）。

### TupleTableSlot 与 ExecCopySlot

`TupleTableSlot` 是 PostgreSQL 中元组的统一抽象容器。`ExecCopySlot(dst, src)` 将源槽位的元组**深拷贝**到目标槽位，确保外表块持有独立的元组数据，不受后续 `ExecProcNode` 调用的影响。

---

## 延伸阅读

- **[Hash Join 实现]**：哈希连接适用于等值连接，内存需求更高但均摊代价 $O(|R| + |S|)$，与 BNLJ 的适用场景互补
- **[Grace Hash Join]**：当哈希表超出内存时退化为分区式连接，可类比 BNLJ 的分块思路
- 下一篇预告：PostgreSQL 查询优化器代价模型——优化器如何决定使用 NLJ 还是 Hash Join
