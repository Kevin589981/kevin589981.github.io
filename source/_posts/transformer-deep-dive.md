---
title: Transformer 架构精读：从 Self-Attention 到 Multi-Head Attention
date: 2025-03-02
categories:
  - CS-Fundamentals
tags:
  - Transformer
  - 深度学习
  - 论文研读
  - NLP
---

> 「Attention is All You Need」(Vaswani et al., 2017) 是现代 LLM 的基石，本文深入解析其核心机制。

## Self-Attention 的本质

Self-Attention 让序列中每个位置都能"看到"所有其他位置，从而捕获长距离依赖。

### 计算公式

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V
$$

其中：
- $Q$（Query）、$K$（Key）、$V$（Value）均由输入线性变换得到
- $\sqrt{d_k}$ 是缩放因子，防止内积过大导致 softmax 梯度消失

### PyTorch 实现片段

```python
import torch
import torch.nn.functional as F

def scaled_dot_product_attention(Q, K, V, mask=None):
    d_k = Q.size(-1)
    scores = torch.matmul(Q, K.transpose(-2, -1)) / (d_k ** 0.5)
    if mask is not None:
        scores = scores.masked_fill(mask == 0, float('-inf'))
    attn_weights = F.softmax(scores, dim=-1)
    return torch.matmul(attn_weights, V), attn_weights
```

## Multi-Head Attention

将 Q/K/V 投影到 $h$ 个子空间分别计算 Attention，再拼接：

$$
\text{MultiHead}(Q,K,V) = \text{Concat}(\text{head}_1, \ldots, \text{head}_h)W^O
$$

**好处**：不同 head 可以关注不同语义维度（句法、语义、指代等）。

## 与 RNN/LSTM 的对比

| 维度 | RNN/LSTM | Transformer |
|------|----------|-------------|
| 并行度 | 串行（时间步依赖） | 完全并行 |
| 长依赖 | 梯度消失 | O(1) 路径长度 |
| 复杂度 | O(n) | O(n²) 注意力 |


