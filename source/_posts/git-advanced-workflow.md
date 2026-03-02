---
title: Git 工作流进阶：从 rebase 到 worktree 的高效实践
date: 2023-12-02
categories:
  - CS-Fundamentals
tags:
  - Git
  - 工具流
  - 开发效率
---

> 「工具用好了，效率翻倍」——本文整理了日常开发中极为实用但常被忽视的 Git 高级用法。

## 为什么应该用 rebase 而不是 merge？

`merge` 会产生一个额外的合并提交，让历史图变得杂乱；`rebase` 将提交"变基"到目标分支顶端，保持线性历史。

```bash
# 在 feature 分支上，将其变基到 main 最新提交
git checkout feature/my-feature
git rebase main

# 交互式变基：合并/修改/重排最近 5 次提交
git rebase -i HEAD~5
```

交互式变基命令速查：

| 命令 | 含义 |
|------|------|
| `pick` | 保留提交 |
| `squash` / `s` | 合并到上一个提交 |
| `reword` / `r` | 修改提交信息 |
| `drop` / `d` | 删除提交 |
| `fixup` / `f` | 合并但丢弃提交信息 |

## git worktree：同时检出多个分支

当你需要同时查看/修改两个分支时，无需 `stash` 或克隆多份仓库：

```bash
# 在 ../hotfix 目录检出 hotfix/v2.1 分支
git worktree add ../hotfix hotfix/v2.1

# 查看所有 worktree
git worktree list

# 完成后删除
git worktree remove ../hotfix
```

## 常用别名配置（放入 ~/.gitconfig）

```ini
[alias]
    lg = log --oneline --graph --decorate --all
    st = status -sb
    unstage = reset HEAD --
    undo = reset --soft HEAD~1
    save = stash push -m
```

## 下一篇预告

- Docker 多阶段构建：把镜像体积从 1GB 压到 50MB
- Vim 配置：打造适合系统开发的终端 IDE
