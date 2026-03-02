---
title: 从零实现一个简易操作系统内核（一）：启动与保护模式
date: 2026-03-02
categories:
  - Projects
tags:
  - 操作系统
  - x86
  - 汇编
  - 项目实战
---

> 本系列记录从零搭建一个 x86 教学 OS 的完整过程，涵盖 Bootloader、保护模式切换、中断处理、内存分页和进程调度。

## 项目目标

实现一个能够：
- 从 BIOS 引导启动
- 切换到 32 位保护模式
- 处理键盘中断
- 支持基本的进程调度
- 提供简单的系统调用接口

的教学操作系统内核。

## 第一阶段：Bootloader

BIOS 将 MBR（主引导记录，512 字节）加载到 `0x7C00` 并跳转执行。

```nasm
; boot.asm - 16位实模式 Bootloader
[BITS 16]
[ORG 0x7C00]

start:
    ; 清屏
    mov ax, 0x03
    int 0x10

    ; 打印启动信息
    mov si, msg_boot
    call print_string

    ; 加载内核到内存 0x10000
    mov ah, 0x02        ; BIOS 读取扇区
    mov al, 10          ; 读 10 个扇区
    mov ch, 0           ; 柱面 0
    mov cl, 2           ; 从第 2 扇区开始
    mov dh, 0           ; 磁头 0
    mov bx, 0x1000
    mov es, bx
    mov bx, 0           ; 目标地址 ES:BX = 0x10000
    int 0x13
    jc disk_error

    jmp enter_protected_mode

msg_boot db 'Loading Kevin OS...', 0x0D, 0x0A, 0

times 510 - ($ - $$) db 0
dw 0xAA55               ; 引导扇区魔数
```

## 切换保护模式

```nasm
enter_protected_mode:
    cli                     ; 关中断
    lgdt [gdt_descriptor]   ; 加载 GDT

    mov eax, cr0
    or eax, 1
    mov cr0, eax            ; 置 PE 位

    jmp 0x08:protected_mode_start  ; 远跳刷新流水线
```

## 下一篇预告

- GDT 与段描述符详解
- IDT 配置与 IRQ 中断处理
- 进入 C 语言内核环境
