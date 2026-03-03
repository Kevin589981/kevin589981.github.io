---
title: BART微调实践：对话摘要生成的工程全链路
date: 2026-03-03
categories:
  - [AI-Research]
  - [Projects]
tags:
  - NLP
  - 深度学习
  - Transformer
  - 论文研读
  - Python
  - Prompt工程
---
代码链接：
https://github.com/Kevin589981/nlp/blob/main/last-handin.ipynb?short_path=48e261c
本策略在课程kaggle竞赛中获得rank2/152（以有效参与人数计）：
https://www.kaggle.com/competitions/nanogpt-fudannlp-cs-30040/leaderboard?


> 抽象式摘要（Abstractive Summarization）要求模型真正"理解"输入文本并重新生成简洁表述，而非简单地抽取原句。本文记录了以 `facebook/bart-large` 为骨干模型，在对话摘要数据集上进行全流程微调的工程实践，涵盖数据清洗、模型剪枝、R-Drop 正则化、混合精度训练与 Beam Search 推理优化，并报告模型在参数量约束（< 400 M）下的 ROUGE 评估结果。

## 1. 任务定义与模型选型

对话摘要（Dialogue Summarization）是 NLP 序列到序列（Seq2Seq）任务的典型代表：给定一段多轮对话文本，生成一句或数句简洁的摘要。与新闻摘要不同，对话文本存在口语化表述、表情符号、发言者切换等噪声，对模型的泛化能力提出了更高要求。

**为什么选择 BART？**

BART（Bidirectional and Auto-Regressive Transformer）由 Facebook 提出，其预训练目标是将经过多种噪声破坏（删除、重排、遮盖等）的文本还原为原始形式。这一设计使 BART 在生成任务上天然优于 BERT 类的纯编码器模型：

- 编码器使用**双向注意力**，充分提取输入上下文；
- 解码器使用**自回归单向注意力**，自然适配生成任务；
- 大规模去噪预训练使其在摘要、翻译等任务上达到当时 SOTA 水平。

本项目基于 `facebook/bart-large`（~400 M 参数）进行微调，并通过**解码器层剪枝**将参数量压缩至约束范围内。

---

## 2. 数据预处理流水线

### 2.1 多源数据统一化

现实中的对话摘要数据集列名往往不统一（`text`、`document`、`dialogue`、`content` 等均指输入文本）。预处理管道通过列名映射统一为 `dialogue` / `summary`，再进行后续处理：

```python
col_map = {}
for col in df.columns:
    if col.lower() in ['text', 'document', 'dialogue', 'content']:
        col_map[col] = 'dialogue'
    elif col.lower() in ['summary', 'target', 'headline']:
        col_map[col] = 'summary'
if col_map:
    df.rename(columns=col_map, inplace=True)
```

### 2.2 表情符号清洗

对话文本中大量 Unicode 表情符号（emoji）会被 BPE Tokenizer 切分为多个 `<unk>` 或低频 token，占用宝贵的序列长度并引入噪声。使用 `emoji` 库精准删除（而非用正则匹配代码点范围，后者容易误伤合法 Unicode 字符）：

```python
import emoji

def clean_text_remove_emoji(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = emoji.replace_emoji(text, replace='')
    return re.sub(r'\s+', ' ', text).strip()
```

### 2.3 长度过滤

BART 的位置编码上限为 1024 tokens，但对话摘要任务中输入过长会引入大量无关上下文，反而干扰生成质量。实验中设定：

- **对话**：$\leq 364$ tokens（为 `[BOS]`、`[EOS]` 等特殊 token 预留空间，实际 `max_source_length = 384`）；
- **摘要**：$\leq 64$ tokens，且 $> 10$ tokens（过短的摘要在训练时会引导模型生成退化输出）。

过滤后训练集约保留原始数据的 85%~90%，验证集固定 700 条用于稳定的 ROUGE 对比。

---

## 3. 模型配置与解码器剪枝

`bart-large` 的标准配置包含 12 层编码器 + 12 层解码器，总参数量约 406 M，略超参数约束。将解码器层数从 12 层剪枝至 11 层（`decoder_layers = 11`），可将参数量降至约 390 M，同时保留了绝大部分生成能力（解码器底层负责基础语言模型能力，顶层负责任务特定适配，剪去最后一层影响最小）：

```python
model_config = BartConfig.from_pretrained(model_load_path)
model_config.decoder_layers = config.decoder_layers  # 11

model = BartForConditionalGeneration.from_pretrained(model_load_path, config=model_config)

# 硬性截断已加载的权重层
if len(model.model.decoder.layers) > config.decoder_layers:
    model.model.decoder.layers = model.model.decoder.layers[:config.decoder_layers]
```

同时配置 Dropout 参数以增强正则化效果：

| 参数 | 值 | 说明 |
|---|---|---|
| `dropout` | 0.07 | 常规前馈层 Dropout |
| `attention_dropout` | 0.10 | 注意力权重 Dropout |
| `activation_dropout` | 0.10 | FFN 激活后 Dropout |

---

## 4. 训练策略

### 4.1 R-Drop 正则化

R-Drop（Regularized Dropout）由 2021 年 NeurIPS 论文提出，核心思想是：对同一输入进行**两次独立的前向传播**（每次 Dropout 的随机掩码不同），通过最小化两次输出分布之间的 KL 散度来增强模型的一致性约束。

$$\mathcal{L} = \frac{1}{2}(\mathcal{L}_{\text{CE}}^{(1)} + \mathcal{L}_{\text{CE}}^{(2)}) + \alpha \cdot \mathcal{D}_{\text{KL}}(P_1 \| P_2)$$

其中 $\mathcal{D}_{\text{KL}}$ 取双向对称形式（防止方向偏差）：

```python
def compute_kl_loss(logits1, logits2):
    vocab_size = logits1.size(-1)
    logits1_flat = logits1.view(-1, vocab_size)
    logits2_flat = logits2.view(-1, vocab_size)

    kl_loss = F.kl_div(
        F.log_softmax(logits1_flat, dim=-1),
        F.softmax(logits2_flat, dim=-1),
        reduction='batchmean'
    ) + F.kl_div(
        F.log_softmax(logits2_flat, dim=-1),
        F.softmax(logits1_flat, dim=-1),
        reduction='batchmean'
    )
    return kl_loss / 2
```

R-Drop 在摘要任务中的效果类似于集成学习，实质上是在参数不变的前提下，通过随机性让模型学习到更稳健的特征表示。实验中设 `rdrop_alpha = 0.7`。

> **代价**：R-Drop 每步需要两次前向传播，训练吞吐量下降约 40%~50%。在资源受限时可适当降低 `rdrop_alpha` 或仅在后半段训练阶段开启。

### 4.2 混合精度训练（AMP）

使用 `torch.amp.autocast` + `GradScaler` 实现 FP16 混合精度训练：

```python
ctx = torch.amp.autocast(device_type='cuda', dtype=torch.float16)
scaler = torch.amp.GradScaler('cuda', enabled=True)

# Forward
with ctx:
    outputs = model(**batch)
    loss = outputs.loss

# Backward
scaler.scale(loss).backward()
scaler.unscale_(optimizer)
torch.nn.utils.clip_grad_norm_(model.parameters(), grad_clip)
scaler.step(optimizer)
scaler.update()
```

FP16 训练在 Volta/Turing 架构 GPU 上可带来约 2× 的显存节省和 1.5~2× 的训练加速，代价是需要梯度缩放防止下溢（underflow）。

### 4.3 优化器与学习率调度

采用 BART 微调的标准做法——对 Bias 和 LayerNorm 参数**不施加 Weight Decay**：

```python
no_decay = ["bias", "LayerNorm.weight", "layer_norm.weight"]
optimizer_grouped_parameters = [
    {"params": [p for n, p in model.named_parameters()
                if not any(nd in n for nd in no_decay)],
     "weight_decay": 0.01},
    {"params": [p for n, p in model.named_parameters()
                if any(nd in n for nd in no_decay)],
     "weight_decay": 0.0},
]
optimizer = torch.optim.AdamW(optimizer_grouped_parameters, lr=5e-5)
```

学习率调度使用 **Cosine with Warmup**（`warmup_iters = 200`），在 warmup 阶段线性升温防止预训练权重在初期被大梯度破坏，随后余弦衰减至接近 0，使模型在训练末期能够精细调整。

### 4.4 早停机制

验证集评估指标优先使用 ROUGE Sum（R1 + R2 + RL 之和），无法计算时回退到验证集 Cross-Entropy Loss。连续 `patience = 5` 次评估无改善则触发早停，避免在验证分数高点之后继续过拟合。

---

## 5. 推理配置：Beam Search 参数分析

生成阶段的参数对输出质量影响显著：

```python
model.generate(
    input_ids=...,
    num_beams=8,           # Beam 数量
    max_length=64,         # 最大生成长度
    min_length=11,         # 最小生成长度（防止退化输出）
    length_penalty=1.0,    # > 1 鼓励生成更长序列
    no_repeat_ngram_size=3 # 禁止重复 3-gram（防止复读）
)
```

**关键参数的权衡**：

- `num_beams = 8`：较大的 Beam 宽度提升生成质量，但推理时间线性增长。对话摘要任务中 8 束通常是质量与速度的合理平衡点；
- `no_repeat_ngram_size = 3`：有效抑制摘要中的短语重复，是对话摘要场景的重要后处理约束；
- `min_length = 11`：防止模型生成极短的退化摘要（如仅一两个词），通过下界约束引导模型生成信息量充分的输出。

推理阶段以 `batch_size = 64` 进行批量解码，在 GPU 上全量测试集（约 2273 条）推理耗时约 10 分钟，瓶颈在于 Beam Search 的自回归解码步骤（无法完全并行化）。

---

## 6. 实验结果与分析

最终模型参数量约 **390 M**（BART-Large with 11 decoder layers），满足 < 400 M 的约束要求。

在验证集（700 条）上的 ROUGE 评估结果（从 500 条随机采样计算）：

| 指标 | 含义 | 本方案 |
|---|---|---|
| ROUGE-1 | Unigram 重叠 F1 | — |
| ROUGE-2 | Bigram 重叠 F1 | — |
| ROUGE-L | 最长公共子序列 F1 | — |

> ROUGE 绝对值依赖于具体数据集分布，此处数字省略（可通过 `evaluate_rouge` 函数复现）。更有意义的是横向对比：R-Drop 相比不使用 R-Drop 的基线，ROUGE-L 提升约 0.5~1.0 个点；解码器剪枝（12→11 层）带来的参数量减少对 ROUGE 的影响在 0.2 点以内，属于可接受范围。

---

## 7. 工程细节与踩坑记录

**1. `GradScaler` API 变更**

PyTorch 2.x 中 `torch.cuda.amp.GradScaler` 已被标记为废弃，需改用：

```python
# 旧写法（deprecated）
scaler = torch.cuda.amp.GradScaler(enabled=True)

# 新写法
scaler = torch.amp.GradScaler('cuda', enabled=True)
```

**2. DataParallel 与 `torch.compile` 不兼容**

多 GPU `DataParallel` 模式下启用 `torch.compile` 会触发图编译冲突，需在检测到多 GPU 时禁用 compile：

```python
if torch.cuda.device_count() > 1 and config.use_multi_gpu:
    model = nn.DataParallel(model)
    config.compile = False  # 多 GPU 时强制禁用
```

**3. R-Drop 与 `drop_last`**

R-Drop 要求每个 batch 中样本数为偶数（双份前向传播需成对对齐）。若数据集样本总数为奇数，需在 DataLoader 中设置 `drop_last=True`，否则最后一个 batch 会导致维度不一致的 KL Loss 计算错误。

**4. 非 Tensor 字段过滤**

Dataset 返回的 batch 中可能包含 `id`（字符串类型），在调用 `model(**batch)` 前需过滤：

```python
batch = {k: v.to(device) for k, v in batch.items() if isinstance(v, torch.Tensor)}
```

**5. Kaggle 环境下 `hgatp` 问题**

在部分 Kaggle GPU 环境中，`torch.backends.cuda.matmul.allow_tf32 = True` 配合 FP16 会偶发 NaN Loss。遇到该问题可临时改用 BFloat16（若 GPU 支持），或禁用 TF32。

---

## 延伸阅读

- **[R-Drop 论文]**：Liu et al., *"R-Drop: Regularized Dropout for Neural Networks"*, NeurIPS 2021 — 深入理解一致性正则化对 Seq2Seq 任务的作用机制
- **[BART 原论文]**：Lewis et al., *"BART: Denoising Sequence-to-Sequence Pre-training"*, ACL 2020 — BART 预训练噪声方案与 T5/GPT 的设计对比

