---
title: 全栈图书管理系统：FastAPI + Vue3 工程实践
date: 2025-04-07
categories:
  - [Projects]
tags:
  - FastAPI
  - Vue3
  - SQLAlchemy
  - Python
  - 项目实战
  - 全栈开发
---

> 一次从零开始的全栈开发实践：后端选用 FastAPI + SQLAlchemy ORM + SQLite，前端采用 Vue3 + Vite，实现了一套完整的书城图书销售管理系统。本文记录数据库 Schema 设计中的权衡、RESTful API 的认证方案，以及从 Django 转向 FastAPI、从 pytest 转向 Postman 调试的全过程思考，以及那个调了三天的"200 OK 但前端不显示"的神奇 bug。

## 1. 项目概述与技术选型

### 业务边界

系统覆盖一个书城的核心管理流程：

- **用户管理**：超级管理员 / 普通管理员双角色，基于 Token 的会话管理，单设备登录限制；
- **库存管理**：书籍 CRUD，支持 ISBN 精确/模糊查询；
- **进货流程**：创建进货单 → 付款 → 到货确认，全流程状态机，操作员留痕；
- **零售流程**：多品类购物车 → 创建销售单 → 自动扣减库存；
- **财务管理**：进货/零售双向账单，支持日期/金额范围查询及趋势图。

### 技术栈选型过程

最初计划使用 Django，研究 6 小时后因上手成本过高放弃。最终选型方案：

| 层次 | 选择 | 理由 |
|------|------|------|
| 后端框架 | FastAPI | 自动生成 OpenAPI 文档，类型注解友好，异步支持 |
| ORM | SQLAlchemy | 数据库无关，防 SQL 注入，Python 生态成熟 |
| 数据库 | SQLite | 部署简单，满足课程项目规模 |
| 前端框架 | Vue3 + Vite | 中文文档丰富，响应式系统直观 |
| 接口调试 | Postman | 可持久化保存 Token，比 FastAPI 内置 Swagger 更灵活 |

架构图如下：

![后端架构](/images/bookstore-fastapi-vue3/image-1.png)

![前端架构](/images/bookstore-fastapi-vue3/image.png)

---

## 2. 数据库设计

### 2.1 用户体系：双表分离的登录态管理

用户信息存储在两张表中——这是整个系统最重要的设计决策之一。

**`User` 表**（持久化用户信息）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `username` | String(50) PK | 用户名作为主键 |
| `employee_id` | String(20) UNIQUE | 工号 |
| `true_name` | String(50) | 真实姓名 |
| `gender` | Enum('male','female') | 性别枚举 |
| `isSuperAdmin` | Boolean | 超级管理员标识 |
| `password_hash` | String(128) | MD5 加密密码 |

![User 表结构](/images/bookstore-fastapi-vue3/image-2.png)

**`LoginedUser` 表**（活跃会话表）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `username` | String(50) PK | 登录用户名 |
| `employee_id` | String(20) UNIQUE | 工号（冗余字段） |
| `isSuperAdmin` | Boolean | 权限标识（冗余字段） |
| `token` | String(256) | HS256 加密的 JWT Token |
| `expiration_time` | DateTime | Token 过期时间戳 |

![LoginedUser 表结构](/images/bookstore-fastapi-vue3/image-3.png)

**为什么要将 `employee_id` 和 `isSuperAdmin` 冗余到 `LoginedUser` 表？**

这是一个典型的**以空间换时间**的设计：认证中间件在每次请求时都需要验证权限，如果每次都要联表查询 `User`，N 个并发请求就是 N 次额外的 JOIN。将这两个高频读字段冗余到会话表后，权限验证退化为单表查询。

**单设备登录限制的实现**：每次新登录前，先删除该用户的已有会话记录，再插入新记录。这样旧设备的 Token 在下次请求时会因找不到对应会话而失效，被响应拦截器自动踢出并跳转登录页。

### 2.2 进货流程：状态机约束在数据库层的落地

进货订单有四个状态：`未付款 → 已付款 → 已到货`，或 `未付款 → 已退货`。系统用三个操作员字段 `operator_id / operator_id2 / operator_id3` 记录每个环节的责任人，并通过 `CheckConstraint` 在数据库层强制执行状态-字段联动规则：

```sql
-- 规则：未付款状态时 operator_id2 必须为空，其他状态时必须存在
(operator_id2 IS NULL AND payment_status == '未付款') OR 
(operator_id2 IS NOT NULL AND payment_status != '未付款')

-- 规则：operator_id3 仅在"已到货"状态时存在
(operator_id3 IS NULL AND payment_status != '已到货') OR 
(operator_id3 IS NOT NULL AND payment_status == '已到货')
```

将业务规则下推到数据库约束层，而不是只在应用层检查，是一种防御性设计——即使绕过 API 直接写数据库也无法破坏数据完整性。

状态流转图：

```
[*] ──> 未付款 ──> 已付款 ──> 已到货
              └──> 已退货
```

### 2.3 销售体系：一对多订单明细

一笔销售单可能包含多种书籍，采用经典的订单头（`SaleOrder`）+ 明细行（`SaleItem`）拆分：

- `SaleOrder.transaction_no`：后端自动生成，格式为 `SO + 年月日时分秒 + 随机数`；
- `SaleItem.sold_price`：独立于 `Book.retail_price`，支持折扣后价格；
- 级联删除：`SaleItem` 设置 `ondelete="CASCADE"`，删除订单时自动清理明细。

### 2.4 财务账单：动态外键关联

`Bill` 表通过 `bill_type`（进货/零售）+ `related_order` 组合实现"动态外键"：当 `bill_type = "进货"` 时，`related_order` 指向 `purchase_orders.id`；当 `bill_type = "零售"` 时，指向 `sale_orders.id`。SQLAlchemy 并不直接支持动态外键约束，这里在应用层保证一致性，数据库层用 `CHECK` 确保两字段同时存在或同时为空。

### 2.5 关于 ISBN 的存储类型选择

ISBN 选择 `String(13)` 而非 `Integer`：
1. 整数存储可能丢失前导零，造成格式错误；
2. 字符串支持 `LIKE` 模糊搜索（`contains` 函数），整数无法模糊查询；
3. 通过 `CheckConstraint` 验证 `LENGTH(isbn) = 13 AND isbn GLOB '[0-9]*'` 保证格式正确性。

### 2.6 关于 `Numeric(10, 2)` 存储金额

金额字段全部使用 `Numeric(10, 2)` 而非 `Float`。原因：`Float` 是近似浮点数，在涉及财务精度的场景下 `0.1 + 0.2 ≠ 0.3` 的问题不可接受；`Numeric` 是精确小数类型，确保分位精确到两位。

---

## 3. 认证与权限系统

### 3.1 Token 生命周期

登录成功后，后端：
1. 生成 `expiration_time = 当前时间戳 + 8小时`；
2. 用 HS256 算法将 `{username, expiration_time}` 签名为 JWT Token；
3. 将 Token 及 `expiration_time` 写入 `LoginedUser` 表（同时踢出旧会话）；
4. 将 `expiration_time` 也单独存一列——验证时直接比较时间戳，无需解码 Token，减少计算量。

前端将 Token 存入 `localStorage`，实现"8 小时免登录"。

### 3.2 FastAPI 依赖注入实现权限分层

```python
# 普通认证：验证 Token 有效性
router = APIRouter(dependencies=[Depends(auth.Auth.get_current_user)])

# 超管认证：额外检查 isSuperAdmin
router_admin = APIRouter(dependencies=[Depends(auth.Auth.admin_required)])
```

`admin_required` 在查询 `LoginedUser` 表时检查 `isSuperAdmin` 字段，若为 False 则返回 403。

### 3.3 前端的双拦截器设计

```javascript
// 请求拦截器：自动注入 Authorization 头
axios.interceptors.request.use(config => {
    const token = localStorage.getItem('token')
    if (token) config.headers['Authorization'] = `Bearer ${token}`
    return config
})

// 响应拦截器：拦截 401，清除登录状态并跳转
axios.interceptors.response.use(null, error => {
    if (error.response?.status === 401) {
        localStorage.clear()
        router.push('/login')
    }
    return Promise.reject(error)
})
```

即使恶意用户修改前端页面绕过权限校验，后端 403/401 响应也会触发响应拦截器强制登出，防止进一步的非授权操作。

---

## 4. 前端界面展示

登录页与主仪表盘：

![主页](/images/bookstore-fastapi-vue3/image-12.png)

![登录页](/images/bookstore-fastapi-vue3/image-13.png)

![仪表盘](/images/bookstore-fastapi-vue3/image-14.png)

进货管理与账单流水趋势图：

![进货管理](/images/bookstore-fastapi-vue3/image-18.png)

![账单流水趋势图](/images/bookstore-fastapi-vue3/image-24.png)

---

## 5. 踩坑记录

### 坑 1：200 OK 但前端页面不显示——调了三天的重定向 bug

这是本项目最匪夷所思的 bug。`GET /book`（注意：没有尾部斜杠）接口返回 200 但前端完全不更新。

根因链：

1. 前端代码写的是 `/book`，FastAPI 路由注册的是 `/book/`；
2. FastAPI/Starlette 对不匹配的路径执行 **301 重定向**：`/book → /book/`；
3. 浏览器遵守安全规范：**重定向时会剥离 `Authorization` 请求头**；
4. 后端收到的第二次请求（`/book/`）没有 Token，但因为代码中漏掉了认证依赖，直接查询并返回了结果；
5. FastAPI 响应里没有 CORS `Access-Control-Allow-Credentials` 等字段，浏览器**自动丢弃**了这个响应。

![请求重定向导致 Authorization 头丢失](/images/bookstore-fastapi-vue3/image-22.png)

修复方式：统一在路由中加尾部斜杠，并修复漏掉认证依赖的接口。

**教训**：状态码 200 ≠ 前端收到了正确响应，浏览器安全机制会在多个环节静默丢弃跨源或认证异常的响应。

### 坑 2：全局变量无法支撑多用户并发登录

最初用一个全局 `dict` 存储登录状态，后来发现：
1. 服务器重启后登录状态丢失；
2. 多用户同时登录时，全局变量存在读写竞争。

改为数据库表 `LoginedUser` 存储，所有问题一并解决——数据库本身提供了持久化和事务隔离。

### 坑 3：pytest 无法保存动态 Token

API 测试最初尝试用 pytest 编写，但 JWT Token 每次登录都会重新生成，无法在测试用例间共享。解决方案：改用 Postman，可在 Collection Variables 中持久化保存 Token，并通过 Pre-request Script 自动刷新。

### 坑 4：GET 请求 URL 中的可选参数为空

当前端查询参数某个字段为空字符串时，URL 变为 `/books/?title=&author=`，后端 SQLAlchemy 会将 `title = ""` 理解为"查 title 等于空字符串的记录"而非"不过滤"。

修复：
- 前端：传参前检查，空值则不加入 URL；
- 后端：查询构建时 `if param and param.strip()` 双重判断。

### 坑 5：外键关联禁止删除书籍

书籍被进货单或销售单引用后，直接删除会触发外键约束错误（SQLite 默认启用外键约束需要 `PRAGMA foreign_keys = ON`）。在书籍删除接口中，检测 `PurchaseOrder` 和 `SaleItem` 两张表是否存在关联记录，若存在则返回 409 并提示原因。

---

## 6. 功能完成情况

所有要求的功能均已实现并测试通过：
- 用户管理（登录/注销/权限/CRUD）
- 书籍管理（精确/模糊查询，外键安全删除）
- 进货管理（完整状态机流转，操作员留痕）
- 零售管理（实时 ISBN/书名模糊搜索，消抖处理）
- 账单管理（多条件过滤，流水趋势图）

![账单管理](/images/bookstore-fastapi-vue3/image-25.png)

项目最终代码量超过 10000 行（前后端合计）。

---

## 7. 设计反思

**什么没做但后来觉得应该做的**：BCNF 范式分解。当前设计中有意保留了一定冗余（如 `LoginedUser` 中的 `employee_id`），这是在查询效率和规范化之间的主动权衡，并非疏忽。

**什么设计了但没用上的**：销售单价打折字段（`discount_price`）。涉及 `Bill` 外键关联和前后端所有接口变更，改动链过长，最终舍弃。这提醒我在项目初期应当更审慎地确认需求边界。

**关于 ORM 的选择**：SQLAlchemy 不仅提供了数据库无关的抽象层，其 Core 层的参数化查询机制从底层防止了 SQL 注入——这在直接拼接 SQL 字符串的方案中是需要额外处理的。

## 延伸阅读

- **[BCNF 范式]**：数据库规范化的理论边界——何时应当分解，何时冗余是合理的工程权衡
- **[JWT 的安全边界]**：HS256 签名而非加密意味着 payload 可以被解码——哪些数据应该放进 Token
- 下一篇预告：SQLAlchemy ORM 性能陷阱——N+1 查询问题与 `selectinload` / `joinedload` 的正确用法
