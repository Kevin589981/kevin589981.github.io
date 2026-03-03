---
title: 树莓派智能小车：PID 电机控制与 OpenCV 颜色识别实践
date: 2024-06-23
categories:
  - [Projects]
tags:
  - 树莓派
  - OpenCV
  - PID控制
  - Python
  - 嵌入式系统
  - 项目实战
---

> 本文记录了一个基于树莓派的智能小车项目：通过 OpenCV 识别不同颜色的魔方，根据颜色规则从左侧或右侧绕行，并在遇到双魔方时从中间穿越。系统采用多线程架构，将颜色检测、距离测量、PWM 更新三条流水线并行化；电机控制使用 PID 闭环，编码器反馈速度；整体逻辑由有限状态机驱动。文章重点分析了 PID 在电压不稳定供电下的局限性，以及 HSV 颜色空间的实战调参经验。

## 1. 任务描述与规则

场地上设有三个里程碑，每个里程碑放置 1 到 2 个魔方（颜色从红/黄/蓝/绿中选取）：

- **里程碑 1**：1 个魔方
- **里程碑 2**：2 个**同色**魔方，间距 ≥ 2 个车身宽度
- **里程碑 3**：1 个魔方

绕行规则：

| 魔方颜色 | 绕行方向 |
|---------|---------|
| 红色 / 黄色 | 从**左侧**绕过 |
| 蓝色 / 绿色 | 从**右侧**绕过 |
| 双魔方（同色） | 从**两者中间**穿越 |

小车需要在正式测试前不知道具体颜色和位置的情况下，靠实时视觉完成全程。

---

## 2. 系统硬件架构

| 硬件模块 | 型号/说明 | 职责 |
|---------|---------|------|
| 主控 | 树莓派 | 运行所有控制逻辑 |
| 直流电机 + 驱动板 | L298N 类驱动 | 四轮驱动，PWM 调速 |
| 摄像头 | USB 摄像头 | 捕获图像，颜色识别 |
| 超声波传感器 | KS103（I2C） | 测量与前方障碍物距离 |
| 编码器 | Hall 效应编码器，白入 585 脉冲/圈 | 测量轮速，PID 反馈 |

引脚分配（BCM 编号）：

```python
EA, I2, I1 = 13, 19, 26   # 右电机：PWM + 方向
EB, I3, I4 = 16, 20, 21   # 左电机：PWM + 方向
LS, RS = 6, 12             # 左/右编码器输入
```

PWM 频率设为 100 Hz，相比更低频率可以使电机转动更平滑（减少转矩脉动）。

---

## 3. 电机控制：PID 闭环 + 守护线程分离

### 3.1 PID 控制原理

控制目标是让电机实际转速（由编码器采样）跟随设定转速。PID 控制器的离散化形式：

$$u_k = K_p \cdot e_k + K_i \sum_{i=0}^{k} e_i + K_d \cdot (e_k - e_{k-1})$$

其中 $e_k = v_{\text{target}} - v_{\text{actual}}$，$u_k$ 直接映射为 PWM 占空比（限幅在 [0, 100]）。

```python
class PID:
    def __init__(self, P=38.57, I=0.1, D=70, speed=0.5):
        self.Kp, self.Ki, self.Kd = P, I, D
        self.ideal_speed = speed
        self.integral = 0
        self.err_last = 0

    def update(self, feedback_value):
        err = self.ideal_speed - feedback_value
        self.integral += err
        u = self.Kp * err + self.Ki * self.integral + self.Kd * (err - self.err_last)
        self.err_last = err
        return max(0, min(100, u))   # PWM 占空比限幅
```

最终调定的参数为左轮 $K_p=45, K_i=0.1, K_d=70$，右轮 $K_p=40, K_i=0.1, K_d=70$（两轮略有差异是因为电机特性不完全一致）。

### 3.2 三线程解耦架构

直接将 PID 计算和 GPIO 写入放在主控制循环里会导致采样不均匀、响应延迟，系统采用三线程分离：

| 线程 | 职责 | 周期 |
|------|------|------|
| `speed_monitor` | 编码器脉冲计数 → 转速（圈/秒） | 100 ms |
| `pwm_update_daemon` | 读取全局转速 → PID 计算 → 写 PWM | 100 ms |
| 主线程 | 状态机决策：设置目标速度 `left_target_speed / right_target_speed` | 事件驱动 |

```python
def speed_monitor(interval=0.1):
    GPIO.add_event_detect(LS, GPIO.RISING, callback=encoder_callback)
    GPIO.add_event_detect(RS, GPIO.RISING, callback=encoder_callback)
    while running:
        rspeed = rcounter / 585.0   # 脉冲数 → 圈/秒（每圈 585 脉冲）
        lspeed = lcounter / 585.0
        rcounter = lcounter = 0
        time.sleep(interval)

def pwm_update_daemon(interval=0.1):
    while running:
        if left_pid_global and right_pid_global:
            _set_motor_pwm(left_pid_global.update(lspeed),
                           right_pid_global.update(rspeed))
        time.sleep(interval)
```

主线程只需调用 `set_motor_speed(left, right)` 设定目标速度，PID 计算完全异步完成，主控逻辑得以保持简洁。

---

## 4. 颜色识别：HSV 空间与区域采样

### 4.1 为什么选 HSV 而非 RGB

RGB 颜色通道与亮度强耦合：同一块红色魔方在强光下 RGB 值显著不同，难以用固定阈值分割。HSV（Hue-Saturation-Value）将色调（H）与亮度（V）解耦，只需为每种颜色定义 H 通道的区间，S/V 可设较宽范围，对光照变化鲁棒得多。

四种颜色的典型 HSV 范围（OpenCV 中 H 取值范围 [0, 179]）：

| 颜色 | H 范围 | S 范围 | V 范围 |
|------|--------|--------|--------|
| 红色 | [0,10] ∪ [170,179] | [100,255] | [80,255] |
| 黄色 | [20,35] | [100,255] | [80,255] |
| 蓝色 | [100,130] | [80,255] | [60,255] |
| 绿色 | [40,80] | [60,255] | [60,255] |

> **注意**：红色的 H 值跨越 0°（红色在色环两端），需要取两段范围做并集，再用 `cv2.bitwise_or` 合并掩码。

### 4.2 行采样优化

全帧处理（640×480）在树莓派上帧率很低。系统在图像高度 25% 处取 50 像素高度的横带进行处理：

```python
DEFAULT_ROW_PERCENT = 0.25   # 采样行位置（图像 25% 高度处）
DEFAULT_ROW_HEIGHT  = 50     # 采样区域高度
```

这样每帧只需处理 640×50 = 32000 像素，计算量降低约 94%，同时该高度对应小车前方地面上的魔方区域，有效减少背景干扰。

### 4.3 颜色区域定位

对二值化掩码做高斯模糊去噪后，通过 `cv2.findNonZero` 找到非零像素，计算连续色块的横坐标范围 $[x_{\text{start}}, x_{\text{end}}]$ 和中心 $x_{\text{center}}$，返回给状态机：

```python
def detect_color(frame):
    roi = frame[row_start:row_end, :]
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    results = {}
    for color_name, (lower, upper) in COLOR_RANGES.items():
        mask = cv2.inRange(hsv, lower, upper)
        mask = cv2.GaussianBlur(mask, (5,5), 0)
        # 提取横向色块段落，返回 (x_start, x_end, x_center) 列表
        results[color_name] = extract_segments(mask)
    return results
```

---

## 5. 距离测量：KS103 超声波传感器（I2C）

KS103 通过 I2C 总线通信，触发测量与读取结果的时序：

```python
def measure_distance():
    bus.write_byte_data(KS103_ADDR, REG_TRIGGER, 0x01)  # 发送触发指令
    time.sleep(0.06)                                       # 等待测量完成（约 60ms）
    data = bus.read_i2c_block_data(KS103_ADDR, REG_RESULT, 2)
    distance_cm = (data[0] << 8 | data[1]) / 10.0        # 合并高低字节，单位 mm → cm
    return distance_cm
```

系统对距离数据做滑动窗口中值滤波（窗口大小 5），剔除超声波在近距离或倾斜表面的反射异常值，并在距离小于阈值时触发"即将碰撞"警告信号给状态机。

---

## 6. 状态机：三阶段顺序执行

主控逻辑由 `StateManager` 类管理，顺序执行三个阶段，每个阶段对应一个里程碑：

```python
class StateManager:
    def __init__(self):
        self.current_state = 0         # 当前所处里程碑阶段（1/2/3）
        self.detected_color = None     # 当前识别到的魔方颜色
        self.color_confirm_counter = {} # 颜色稳定确认计数器
        self.last_bypass_direction = None

    def determine_bypass_direction(self):
        if self.current_state in (1, 3):
            # 单魔方：由颜色决定方向
            return 'left' if self.detected_color in LEFT_TURN_COLORS else 'right'
        else:  # 状态 2：双魔方，从中间穿越
            # 基于上一次绕行方向的对称策略
            return 'right' if self.last_bypass_direction == 'left' else 'left'
```

**颜色确认机制**：避免单帧误识别，要求同一颜色连续出现 `N` 帧才确认。通过 `color_confirm_counter` 对每种颜色计数，达到阈值后方触发绕行动作。

**顺序执行主循环**：

```python
def main_control_sequential():
    init_gpio(); start_speed_monitor(); start_pwm_update_daemon()
    init_i2c();  start_distance_measurement()
    camera = init_camera(); start_color_detection()
    time.sleep(2)   # 等待所有线程稳定

    for state in (1, 2, 3):
        state_manager.current_state = state
        handle_state_sequential(state)   # 靠近→识别→绕行→恢复直行

    final_sprint_sequential()           # 全速冲向终点
```

绕行策略采用**矩形绕行**而非圆弧：先原地转向，直行绕过，再原地转回，优点是实现简单、调试方便、不依赖精确的弧度控制。

---

## 7. 实验分析：问题与局限

### 7.1 直行偏差严重

**根本原因**：电池输出电压不稳定，随放电程度持续下降。PID 控制器虽然理论上能通过积分项补偿稳态误差，但电压变化导致**电机特性曲线本身在漂移**，PID 参数无法通用于整场测试。

即便引入了基于颜色中心偏移量的方向修正（`drive_with_color`），实际效果也表现出明显的摆动——修正增益大了蛇行，小了又偏。

```python
def drive_with_color(color_offset, speed=0.5, offset_factor=0.2):
    normalized = min(1.0, abs(color_offset) / 200.0)
    if color_offset > 0:
        right_speed = speed * (1 - offset_factor * normalized)  # 向右偏：压右轮
    else:
        left_speed  = speed * (1 - offset_factor * normalized)  # 向左偏：压左轮
```

**更好的方案**：使用**自适应 PID**，周期性重新标定电机特性（如每次起步前做短暂标定行驶），或改用步进电机消除速度控制对电压的依赖。

### 7.2 转角不准：时间控制转向的缺陷

系统用"旋转固定时间"来实现 90° 转向：

```python
rotate_in_place('clockwise', speed=0.5)
time.sleep(t_90_deg)   # 经验值，与电压强相关
stop_motor()
```

电压不稳 → PID 漂移 → 实际转速与设计转速不符 → 旋转角度近似随机。导致绕行两阶段无法正确衔接，出现找不到下一个魔方、撞墙等问题。

**更好的方案**：用编码器积分计算转过的圆弧长度（轮距 × 转角），闭环控制旋转角度，而非依赖时间。

### 7.3 光照对 HSV 阈值的影响

即使使用了 HSV 空间，在极暗或极亮的测试环境中，S/V 的阈值边界仍需现场微调。建议在系统启动时加入**自动白平衡校正**步骤，或对 V 通道做直方图均衡化后再分割。

---

## 8. 系统设计亮点

1. **完全守护线程化**：编码器采样、PWM 更新、颜色检测、距离测量全部运行在守护线程中（`thread.daemon = True`），主线程退出时自动回收，无需手动管理线程生命周期；

2. **颜色确认防抖**：多帧确认机制将单帧噪声的影响降到最低，代价是引入了固定延迟（约 `N × 100ms`），在实际调试中需要在检测速度和稳定性之间权衡；

3. **模块化代码结构**：`motor_controller.py / detect_color.py / detect_distance.py / main_controller.py` 四模块解耦，每个模块可独立测试，最终在 `main_controller.py` 中聚合。

---

## 延伸阅读

- **[PID 自整定]**：Ziegler-Nichols 方法——在没有精确数学模型的情况下系统化调定 PID 参数
- **[卡尔曼滤波]**：比简单中值滤波更优的传感器融合方法，适用于距离与速度的联合估计
- 下一篇预告：在树莓派上用 YOLOv8 替代 HSV 阈值分割——目标检测的实时性与精度权衡
