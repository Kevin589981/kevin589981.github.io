---
title: C++与数据结构
date: 2024-01-17
categories:
  - [CS-Fundamentals]
tags:
  - 并发编程
  - 数据结构
  - C++
---

### 第一章：环境与头文件 (Environment & Headers)


1.  **万能头**：`#include <bits/stdc++.h>` (包含几乎所有STL)。
2.  **I/O流**：`#include <iostream>` (cin, cout, endl)。
3.  **C风格I/O**：`#include <cstdio>` (scanf, printf, getchar, puts)。
4.  **字符串**：`#include <string>` (string类)。
5.  **C字符串**：`#include <cstring>` (strlen, memset, strcpy, memcpy)。
6.  **数学**：`#include <cmath>` (pow, sqrt, sin, cos, abs-浮点)。
7.  **算法**：`#include <algorithm>` (sort, max, min, reverse, unique, lower_bound)。
8.  **向量**：`#include <vector>`。
9.  **栈**：`#include <stack>`。
10. **队列**：`#include <queue>` (包含 queue 和 priority_queue)。
11. **双端队列**：`#include <deque>`。
12. **集合**：`#include <set>` (包含 set 和 multiset)。
13. **映射**：`#include <map>` (包含 map 和 multimap)。
14. **位集合**：`#include <bitset>`。
15. **命名空间**：`using namespace std;` (必须写在头文件后)。

---

### 第二章：输入输出详解 (I/O Detail)


**cin/cout 系列**
1.  **加速指令**：`ios::sync_with_stdio(0); cin.tie(0); cout.tie(0);` (写在main第一行)。
2.  **加速后果**：开启加速后，**严禁**混用 `scanf/printf`。
3.  **cin读取字符串**：`cin >> s;` (遇到空格、Tab、换行符停止)。
4.  **读一整行**：`getline(cin, s);` (读取直到换行符，**包含空格**)。
5.  **吃掉换行符**：在 `cin >> n;` 后若接 `getline`，必须先 `cin.ignore();` 或 `getchar();`。
6.  **输出换行**：`cout << '\n';` (比 `endl` 快，`endl` 强制刷新缓冲区)。
7.  **多组输入(EOF)**：`while(cin >> n) { ... }`。

**scanf/printf 系列 (格式化)**
23. **int**：`%d`
24. **long long**：`%lld`
25. **float**：`%f`
26. **double**：`%lf` (scanf必须用lf，printf可用f或lf)。
27. **char**：`%c`
28. **char数组(字符串)**：`%s` (遇到空格/换行停止，**不**包含&)。
29. **string类输出**：`printf("%s", s.c_str());` (必须转c_str)。
30. **读取单个字符跳过空白**：`scanf(" %c", &c);` (注意%c前面的**空格**，可跳过回车/空格)。
31. **固定宽度输出**：`%05d` (宽度5，不足补0)。
32. **保留小数**：`%.4f` (保留4位小数，自动四舍五入)。
33. **地址输出**：`%p`。
34. **输入日期格式**：`scanf("%d-%d-%d", &y, &m, &d);` (自动跳过横杠)。
35. **多组输入(EOF)**：`while(scanf("%d", &n) != EOF) { ... }`。

**其他I/O**
36. **快读(getchar)**：`c = getchar()` 每次读一个字符，比scanf快。
37. **输出精度控制(cout)**：`#include <iomanip>`。
38. **cout定点**：`cout << fixed;` (后续变为定点小数模式)。
39. **cout精度**：`cout << setprecision(4) << val;`。

---

### 第三章：数据结构 API 细则 (Data Structures)


#### 1. `std::vector` (动态数组)
40. **定义**：`vector<int> v;`
41. **定义带大小**：`vector<int> v(100);` (默认全是0)。
42. **定义带初值**：`vector<int> v(100, -1);` (100个-1)。
43. **尾部插入**：`v.push_back(val);`
44. **尾部删除**：`v.pop_back();` (无返回值，空vector调用会RE)。
45. **大小**：`v.size();` (返回 `size_t`，比较时建议转 `(int)v.size()`)。
46. **判空**：`v.empty();` (空返回true)。
47. **清空**：`v.clear();` (size变0，capacity不一定变)。
48. **首元素**：`v.front();` 或 `v[0]`。
49. **尾元素**：`v.back();` 或 `v[v.size()-1]`。
50. **调整大小**：`v.resize(n);` (多退少补0)。
51. **翻转**：`reverse(v.begin(), v.end());`。
52. **排序**：`sort(v.begin(), v.end());`。

#### 2. `std::stack` (栈 - LIFO)
53. **头文件**：`<stack>`
54. **入栈**：`st.push(val);`
55. **出栈**：`st.pop();` (**无返回值**，仅删除)。
56. **栈顶**：`st.top();` (返回栈顶元素，**不删除**)。
57. **判空**：`st.empty();`
58. **大小**：`st.size();`
59. **RE警示**：对空栈调用 `pop()` 或 `top()` 必报错。
60. **没有clear**：清空需 `while(!st.empty()) st.pop();` 或 `st = stack<int>();`。

#### 3. `std::queue` (队列 - FIFO)
61. **头文件**：`<queue>`
62. **入队**：`q.push(val);`
63. **出队**：`q.pop();` (删除队头，**无返回值**)。
64. **队头**：`q.front();` (注意不是top)。
65. **队尾**：`q.back();`
66. **判空**：`q.empty();`
67. **大小**：`q.size();`

#### 4. `std::priority_queue` (优先队列/堆)
68. **头文件**：`<queue>`
69. **默认定义**：`priority_queue<int> pq;` (**大根堆**，最大的在top)。
70. **小根堆定义**：`priority_queue<int, vector<int>, greater<int>> pq;`。
71. **入堆**：`pq.push(val);` (O(logN))。
72. **堆顶**：`pq.top();` (注意不是front)。
73. **出堆**：`pq.pop();` (删除堆顶)。
74. **结构体堆**：需在结构体内部重载 `<` 运算符。
75. **重载注意**：大根堆按 `<` 排序，如果想让小的在top，重载 `<` 时逻辑要反过来(或者直接重载 `>`)，或者简单点：`return a.x > b.x` (x小的优先级高)。

#### 5. `std::deque` (双端队列)
76. **头队插**：`dq.push_front(val);`
77. **尾队插**：`dq.push_back(val);`
78. **头队出**：`dq.pop_front();`
79. **尾队出**：`dq.pop_back();`
80. **访问**：`dq[i]` (支持随机访问)。

#### 6. `std::set` (集合 - 自动排序+去重)
81. **插入**：`s.insert(val);`
82. **删除值**：`s.erase(val);`
83. **删除迭代器**：`s.erase(iterator);`
84. **查找**：`s.find(val);` (返回迭代器，找不到等于 `s.end()`)。
85. **计数**：`s.count(val);` (在set里只能是0或1)。
86. **大小**：`s.size();`
87. **清空**：`s.clear();`
88. **最小值**：`*s.begin()`。
89. **最大值**：`*s.rbegin()`。
90. **二分查找**：`s.lower_bound(val);` (返回首个 >= val 的迭代器)。
91. **二分查找**：`s.upper_bound(val);` (返回首个 > val 的迭代器)。
92. **遍历**：`for(auto x : s) { ... }` (从小到大)。

#### 7. `std::map` (键值对映射)
93. **定义**：`map<key_type, value_type> mp;`
94. **插入/修改**：`mp[key] = val;`
95. **副作用**：若 `mp[key]` 不存在，读取它会自动创建并赋值为0/空串，导致size+1。
96. **安全查找**：`if (mp.find(key) != mp.end()) ...` 或 `if (mp.count(key)) ...`
97. **遍历**：`for(auto it = mp.begin(); it != mp.end(); it++)`。
98. **键**：`it->first`。
99. **值**：`it->second`。
100. **按键排序**：map默认按key从小到大排序。

---

### 第四章：字符串与常用算法 (String & Algo)


**String 常用函数**
1.   **长度**：`s.length()` 或 `s.size()`。
2.   **判空**：`s.empty()`。
3.   **拼接**：`s1 += s2;` 或 `s = s1 + s2;`。
4.   **比较**：`if (s1 == s2)` (字典序比较)。
5.   **截取**：`s.substr(pos, len);` (**重要**：第二个参数是长度)。
6.   **截取到末尾**：`s.substr(pos);`。
107. **查找**：`s.find("abc");` (返回首个位置下标)。
108. **查找失败**：`s.find(...) == string::npos`。
109. **插入**：`s.insert(pos, "str");`。
110. **删除**：`s.erase(pos, len);`。
111. **替换**：`s.replace(pos, len, "str");`。
112. **转数字**：`stoi(s)` (转int), `stoll(s)` (转long long)。
113. **数字转字符**：`to_string(123)`。

**Algorithm 常用函数**
114. **排序**：`sort(begin, end);` (默认升序)。
115. **降序**：`sort(begin, end, greater<int>());`。
116. **自定义排序**：`sort(..., cmp);` (cmp函数返回true表示前者排在前)。
117. **结构体排序**：必须写cmp或重载`<`。
118. **最大值**：`max(a, b);` 或 `max({a, b, c, d});` (C++11)。
119. **最小值**：`min(a, b);`。
120. **交换**：`swap(a, b);`。
121. **反转**：`reverse(begin, end);`。
122. **去重**：`unique(begin, end);` (只对**相邻**重复有效，需先sort)。
123. **去重长度**：`int len = unique(a, a+n) - a;`。
124. **二分查找(>=)**：`lower_bound(begin, end, val);` (返回迭代器)。
125. **二分查找(>)**：`upper_bound(begin, end, val);` (返回迭代器)。
126. **获取下标**：`lower_bound(...) - begin;`。
127. **全排列**：`next_permutation(begin, end);` (变到下一个字典序，返回bool)。
128. **填充**：`fill(begin, end, val);` (按元素填充)。
129. **最大公约数**：`__gcd(a, b);` (注意前面是两个下划线)。
130. **绝对值**：`abs(x)` (整数), `fabs(x)` (小数)。

---

### 第五章：C语言内存操作与类型 (C-Style & Types)


1.   **memset**：`memset(arr, 0, sizeof(arr));` (全0)。
2.   **memset**：`memset(arr, -1, sizeof(arr));` (全-1)。
3.   **memset**：`memset(arr, 0x3f, sizeof(arr));` (无穷大，约10^9)。
4.   **memset陷阱**：**不能**用来赋值1, 2等任意数，因为它是按字节赋值。
5.   **memcpy**：`memcpy(dst, src, sizeof(src));` (复制数组)。
6.   **strlen**：`strlen(s)` (O(N)复杂度，不要放在for循环条件里！)。
7.   **int范围**：约 $\pm 2 \times 10^9$。
8.   **long long范围**：约 $\pm 9 \times 10^{18}$。
9.   **unsigned long long**：约 $1.8 \times 10^{19}$。
10.  **LL常量**：`long long x = 10000000000LL;` (结尾加LL)。
11.  **溢出防范**：`long long ans = 1LL * a * b;`。
12.  **无穷大(int)**：`INT_MAX` 或 `0x3f3f3f3f`。
13.  **无穷大(LL)**：`LLONG_MAX`。
14.  **double比较**：不能直接 `==`，要用 `abs(a-b) < 1e-9`。

---

### 第六章：结构体与重载模板 (Struct & Overload)


1.   **结构体定义**：
    ```cpp
    struct Node {
        int x, y;
    };
    ```
2.   **构造函数**：
    ```cpp
    struct Node {
        int x, y;
        Node(int _x, int _y) : x(_x), y(_y) {} // 方便使用
        Node() {} // 必须手动补上默认构造
    };
    ```
3.   **重载小于号 (用于Sort/Set)**：
    ```cpp
    bool operator < (const Node &a) const {
        if (x != a.x) return x < a.x; // x升序
        return y < a.y; // x相同，y升序
    }
    ```
4.   **重载小于号 (用于优先队列)**：
    ```cpp
    bool operator < (const Node &a) const {
        return x < a.x; // 大根堆：x大的在顶（逻辑反直觉，标准库默认是大根堆）
        // 如果想实现小根堆效果（小的在顶），这里写 return x > a.x;
    }
    ```

---

### 第七章：容易遗忘的坑点 (Common Pitfalls)


1.   **数组大小**：全局变量数组最大可开约 `5e7` (int)，main内部只能开 `2e5` 左右。
2.   **RE原因**：除以0。
3.   **RE原因**：数组越界 (index < 0 或 index >= N)。
4.   **RE原因**：爆栈 (递归太深，或局部变量数组太大)。
5.   **TLE原因**：`cin` 没关同步。
6.   **TLE原因**：`endl` 用太多。
7.   **TLE原因**：在循环里重复 `strlen(s)`。
8.   **TLE原因**：`vector` 在头部 `insert` 或 `erase` (O(N)操作)。
9.   **WA原因**：多组数据，该清空的全局变量没清空 (flag, vector, map, count数组)。
10.  **WA原因**：`1 << 40` 溢出 (int只有32位)，应写 `1LL << 40`。
11.  **位运算优先级**：`a & b == c` 会先算 `b==c`。**必须加括号**：`(a & b) == c`。
12.  **宏定义陷阱**：`#define mul(a,b) a*b` -> `mul(1+2, 3)` 变成 `1+2*3=7`。应写 `(a)*(b)`。
13.  **变量命名**：不要用 `time`, `next`, `y1` (cmath/algorithm里可能有冲突)。建议用 `nxt`, `yy1`。
14.  **交互题**：每次输出后必须 `cout.flush()` 或 `fflush(stdout)`。
15.  **Map访问**：只查不改一定用 `find`，不要用 `[]`，否则会增加垃圾数据导致TLE/MLE。
16.  **浮点数陷阱**：`double ans = 1/2;` 结果是0。要写 `1.0/2`。
17.  **Set修改**：Set里的元素是const的，不能直接修改 `it->x`，必须先erase再insert新值。
18.  **Mod负数**：`(a - b) % mod` 可能是负数。正确写法：`((a - b) % mod + mod) % mod`。


### 第八章：图论存储与遍历 (Graph Storage & Traversal)


1.   **邻接矩阵**：`int g[N][N];` 适用于点数 $N \le 2000$。
2.   **邻接表(Vector)**：`vector<int> g[N];` 最通用，带权图用 `struct Edge {int to, w;}; vector<Edge> g[N];`。
3.   **链式前向星**：虽然快但容易写错，建议校赛优先用 Vector，除非卡常。
4.   **建图(无向)**：`g[u].push_back(v); g[v].push_back(u);` (记得双向push)。
5.   **建图(有向)**：`g[u].push_back(v);`。
6.   **DFS栈溢出**：系统栈通常只有几MB，深度超过 $10^5$ 可能爆栈，需改为手写栈或扩栈。
7.   **BFS队列**：`queue<int> q; q.push(start); vis[start]=1;`。
8.   **BFS核心**：**入队时**立刻标记 `vis[x]=1`，不要等到出队才标记（否则会导致大量重复节点入队，退化成指数级）。
9.   **图的清空**：多组数据时，`for(int i=0; i<=n; i++) g[i].clear();`。
10.  **最短路初始化**：`memset(dis, 0x3f, sizeof(dis));`。
11.  **Floyd算法**：三层循环顺序必须是 **k, i, j** (中间点k在最外层)。
12.  **Floyd核心**：`f[i][j] = min(f[i][j], f[i][k] + f[k][j]);`。
13.  **Dijkstra(朴素)**：$O(N^2)$，适用于稠密图，不用堆。
14.  **Dijkstra(堆优化)**：必须用 `priority_queue<PII, vector<PII>, greater<PII>>` (小根堆)。
15.  **Pair定义**：`typedef pair<int, int> PII;` (first存距离，second存点编号)。
16.  **Dijkstra出堆判断**：`if (dis[u] < d) continue;` (懒惰删除，处理重复入堆的旧数据)。
17.  **SPFA/Bellman**：判断负环（入队次数 > n 或 松弛次数 > n）。
18.  **拓扑排序**：维护 `in_degree[]` 数组。
19.  **拓扑步骤**：将所有 `degree==0` 入队 -> 循环 -> 删边(degree--) -> 若为0入队。
20.  **树的直径**：两次DFS（先找最远点A，再从A找最远点B）。
21.  **并查集初始化**：`for(int i=1; i<=n; i++) fa[i] = i;`。
22.  **并查集Find(路径压缩)**：
    ```cpp
    int find(int x) { return x == fa[x] ? x : fa[x] = find(fa[x]); }
    ```
23.  **并查集Merge**：`fa[find(x)] = find(y);`。
24.  **最小生成树(Kruskal)**：按边权排序 + 并查集。
25.  **二分图判定**：染色法 (DFS/BFS)，相邻节点颜色不同。
26.  **网格图方向数组**：`int dx[] = {0, 0, 1, -1}; int dy[] = {1, -1, 0, 0};`。
27.  **网格图边界检查**：`if (nx >= 1 && nx <= n && ny >= 1 && ny <= m)`。
28.  **链式前向星头数组**：`head` 数组初始化为 -1。
29.  **LCA(倍增法)**：`f[u][i] = f[f[u][i-1]][i-1]`。
30.  **树状数组(Lowbit)**：`int lowbit(int x) { return x & -x; }`。
31.  **树状数组(Update)**：`for(; i<=n; i+=lowbit(i)) c[i] += k;`。
32.  **树状数组(Query)**：`for(; i>0; i-=lowbit(i)) res += c[i];`。
33.  **线段树大小**：数组要开 **4N** (`tree[4 * N]`)。
34.  **线段树下标**：左儿 `2*p` (或 `p<<1`)，右儿 `2*p+1` (或 `p<<1|1`)。

---

### 第九章：数学与数论 (Math & Number Theory)


1.   **快速幂**：`res = 1; while(b) { if(b&1) res=res*a%mod; a=a*a%mod; b>>=1; }`。
2.   **取模防负**：`(a - b % mod + mod) % mod`。
3.   **最大公约数(GCD)**：`__gcd(a, b)` (注意a,b不能同时为0，否则可能RE，但在算法题少见)。
4.   **最小公倍数(LCM)**：`(a / gcd(a, b)) * b` (先除后乘防溢出)。
5.   **判断素数**：`for(int i=2; i*i<=n; i++)`。
6.   **埃氏筛**：`for(i=2...n) if(!vis[i]) for(j=i*i...n, j+=i) vis[j]=1;` (注意 j 从 i*i 开始)。
7.   **逆元(费马小定理)**：当 mod 是质数，`inv(a) = pow(a, mod-2)`。
8.   **组合数公式**：$C(n, m) = \frac{n!}{m!(n-m)!}$。
9.   **递推组合数**：`C[i][j] = (C[i-1][j] + C[i-1][j-1]) % mod;`。
10.  **杨辉三角**：`C[n][k]` 对应杨辉三角第 n 行第 k 个 (0-indexed)。
11.  **卡特兰数**：1, 1, 2, 5, 14, 42... (括号匹配、出栈次序、二叉树计数)。
12.  **唯一分解定理**：$N = p_1^{a_1} p_2^{a_2}...$。
13.  **约数个数**：$(a_1+1)(a_2+1)...$。
14.  **ceil(向上取整)**：`(a + b - 1) / b` (仅限正整数)。
15.  **atan2**：`atan2(y, x)` 返回弧度 $(-\pi, \pi]$，算出极角。
16.  **PI**：`const double PI = acos(-1.0);`。
17.  **两点距离**：`hypot(x1-x2, y1-y2)` (返回double)。
18.  **叉积(Cross Product)**：$x_1 y_2 - x_2 y_1$ (判断向量旋转关系，>0逆时针，<0顺时针)。
19.  **点积(Dot Product)**：$x_1 x_2 + y_1 y_2$。
20.  **曼哈顿距离**：`abs(x1-x2) + abs(y1-y2)`。
21.  **切比雪夫距离**：`max(abs(x1-x2), abs(y1-y2))`。
22.  **等差数列求和**：`n * (a1 + an) / 2`。
23.  **平方和公式**：`n(n+1)(2n+1)/6`。
24.  **异或性质**：`a ^ a = 0`, `a ^ 0 = a`。
25.  **异或交换**：`a ^= b; b ^= a; a ^= b;` (不推荐，容易出bug，直接用 swap)。
26.  **判断奇偶**：`if (x & 1)` (真为奇)。
27.  **除以2**：`x >> 1` (正数向下取整，负数可能有区别，建议直接 `/2`)。
28.  **乘以2**：`x << 1`。
29.  **第k位是否为1**：`if ((x >> k) & 1)`。
30.  **将第k位置1**：`x | (1 << k)`。
31.  **将第k位置0**：`x & ~(1 << k)`。
32.  **前缀和**：`sum[i] = sum[i-1] + a[i];` (下标从1开始)。
33.  **区间和**：`sum[R] - sum[L-1]`。
34.  **差分数组**：`diff[i] += c; diff[j+1] -= c;` (区间[i, j]加c)。
35.  **二维前缀和**：`s[i][j] = s[i-1][j] + s[i][j-1] - s[i-1][j-1] + a[i][j]`。
36.  **二维子矩阵和**：`s[x2][y2] - s[x1-1][y2] - s[x2][y1-1] + s[x1-1][y1-1]`。
37.  **容斥原理**：$|A \cup B| = |A| + |B| - |A \cap B|$。
38.  **抽屉原理**：$n+1$ 个物品放入 $n$ 个抽屉，至少有一个抽屉有2个物品。
39.  **快速乘(防溢出)**：`__int128` (非标准但GCC支持) 或龟速乘逻辑。
40.  **同余**：`a == b (mod m)` 意味着 `(a - b) % m == 0`。
41.  **斐波那契**：`1, 1, 2, 3, 5, 8, 13, 21...` (增长很快，第46项超过int)。
42.  **三角形不等式**：`a + b > c` (两条短边之和大于第三边)。
43.  **海伦公式**：$S = \sqrt{p(p-a)(p-b)(p-c)}$，其中 $p = (a+b+c)/2$。
44.  **直线方程**：$Ax + By + C = 0$。
45.  **浮点数比较**：`const double EPS = 1e-8;`。
46.  **浮点零**：`if (abs(x) < EPS)`。
47.  **浮点相等**：`if (abs(a - b) < EPS)`。
48.  **随机数种子**：`srand(time(0))` (老式) 或 `mt19937 rng(time(0))` (C++11推荐)。
49.  **生成范围随机数**：`rand() % (b - a + 1) + a` (生成 [a, b])。
50.  **整除分块**：`for(int l=1, r; l<=n; l=r+1) { r=n/(n/l); ... }`。

---

### 第十章：动态规划 (Dynamic Programming)


1.   **01背包(一维)**：`for(i=1...n) for(j=V...w[i]) dp[j] = max(dp[j], dp[j-w[i]] + v[i]);`。
2.   **01背包关键**：内层循环 **从大到小** (倒序)。
3.   **完全背包(一维)**：内层循环 **从小到大** (正序)。
4.   **最长上升子序列(LIS)**：`dp[i]` 表示以 `i` 结尾的 LIS 长度。O(N^2)。
5.   **LIS (贪心+二分)**：维护一个 tails 数组，`lower_bound` 替换，`push_back` 扩展，O(NlogN)。
6.   **最长公共子序列(LCS)**：`if(a[i]==b[j]) dp[i][j]=dp[i-1][j-1]+1; else dp[i][j]=max(dp[i-1][j], dp[i][j-1]);`。
7.   **区间DP枚举顺序**：先枚举区间长度 `len`，再枚举左端点 `i`，算出右端点 `j`，最后枚举断点 `k`。
8.   **区间DP模板**：
    ```cpp
    for(int len=2; len<=n; len++) 
        for(int i=1; i+len-1<=n; i++) {
            int j = i+len-1;
            for(int k=i; k<j; k++) dp[i][j] = ...
        }
    ```
9.   **状压DP**：`dp[1 << N]`，用位掩码表示集合。
10.  **判断状态j包含i**：`if ((state >> i) & 1)`。
11.  **树形DP**：通常在 DFS 的回溯阶段进行状态转移。
12.  **最大子段和**：`dp[i] = max(nums[i], dp[i-1] + nums[i]);` (贪心法：`sum = max(0, sum) + x`)。
13.  **数字三角形**：从下往上推 `dp[i][j] += max(dp[i+1][j], dp[i+1][j+1])` 不需要边界检查。
14.  **记忆化搜索**：
    ```cpp
    int solve(int x) {
        if (memo[x] != -1) return memo[x];
        // ... calculation ...
        return memo[x] = ans;
    }
    ```
15.  **初始化DP数组**：求最大值初始化为 0 或 -INF，求最小值初始化为 INF。

---

### 第十一章：字符串进阶与调试 (String & Debug)


1.   **stringstream**：`stringstream ss(str); while(ss >> word) { ... }` (按空格分割字符串)。
2.   **ss清空**：`ss.clear(); ss.str("");` (重复利用时必须这样)。
3.   **字符判断**：`isdigit(c)`, `isalpha(c)`, `islower(c)`, `isupper(c)`。
4.   **大小写转换**：`tolower(c)`, `toupper(c)`。
5.   **string::npos**：通常值为 -1 (但它是 unsigned 类型)，最好直接用 `string::npos` 常量比较。
6.   **字符串字典序**：`"apple" < "banana"` 为 true。
7.   **字符串加法**：`s = s + 'a';` (O(N) 较慢)。
8.   **字符串追加**：`s += 'a';` (O(1) 均摊，推荐)。
9.   **KMP Next数组**：`j=next[j]` 是回跳逻辑。
10.  **Manacher算法**：处理回文串，记得先要在字符间插入 `#` 处理奇偶长度。
11.  **Debug输出**：`cerr << "Value: " << x << endl;` (cerr 不会被输出重定向捕获，适合本地调试，提交时最好注释掉，虽不影响AC但慢)。
12.  **断言**：`assert(x >= 0);` (如果条件为假，程序终止报错，用于查逻辑漏洞)。
13.  **本地文件输入**：
    ```cpp
    #ifndef ONLINE_JUDGE
    freopen("in.txt", "r", stdin);
    freopen("out.txt", "w", stdout);
    #endif
    ```
14.  **观察数据范围**：`N <= 10` -> O(N!) (全排列)。
15.  **观察数据范围**：`N <= 20` -> O(2^N) (状压/DFS)。
16.  **观察数据范围**：`N <= 100` -> O(N^3) (Floyd/区间DP)。
17.  **观察数据范围**：`N <= 1000` -> O(N^2)。
18.  **观察数据范围**：`N <= 10^5` -> O(NlogN) (Sort/Set/二分)。
19.  **观察数据范围**：`N <= 10^7` -> O(N) (线性筛/双指针)。
20.  **对拍脚本**：写个 `brute_force.cpp`, `solution.cpp`, `generator.cpp` 跑循环比对。
21.  **段错误(SIGSEGV)**：数组越界、指针乱指、爆栈。
22.  **浮点错误(SIGFPE)**：除以0、模0。
23.  **超时(SIGXCPU/TLE)**：死循环、算法复杂度过高。
24.  **输出超限(OLE)**：输出大量调试信息忘删，或死循环输出。
25.  **编译错误(CE)**：C++标准选错、头文件缺失、语法拼写错误。

---

### 第十二章：STL 高级技巧与补充 (STL Advanced)


1.   **bitset 定义**：`bitset<1000> b;` (1000个位，不是字节)。
2.   **bitset 操作**：`b.set(i)` (置1), `b.reset(i)` (置0), `b.flip(i)` (取反)。
3.   **bitset 计数**：`b.count()` (1的个数)。
4.   **bitset 转换**：`b.to_ulong()` (转unsigned long)。
5.   **pair 排序**：默认先比 first，再比 second。
6.   **tuple**：`tuple<int, int, double> t;` (三元组)。
7.   **tuple 访问**：`get<0>(t)`, `get<1>(t)`。
8.   **tie 解包**：`int a, b; tie(a, b) = make_pair(1, 2);`。
9.   **auto 推导**：`auto it = mp.begin();` (省去长类型名)。
10.  **范围For**：`for(auto &x : v) x++;` (加 `&` 可以修改原数组值)。
11.  **multiset 删除**：`st.erase(val)` 会删除**所有**等于 val 的元素。
12.  **multiset 删除单个**：`st.erase(st.find(val))` 只删一个。
13.  **deque**：双端队列，常数比 vector 大，但支持头插 `push_front`。
14.  **list**：双向链表 (STL)，极少用，不支持随机访问 `[]`。
15.  **forward_list**：单向链表。
16.  **unordered_map**：哈希表，平均 O(1)，最坏 O(N) (会被精心构造的数据卡)。
17.  **unordered_map 坑**：不能直接用 `pair` 或 `vector` 做 key (需自定义哈希)。
18.  **map vs unordered_map**：校赛求稳建议用 `map` (红黑树 O(logN))，除非必然超时。
19.  **resize vs reserve**：`resize` 改变大小并初始化；`reserve` 只预留内存，不改变 size (减少重分配次数，优化常数)。
20.  **lambda 捕获**：`[&](int a){...}` 引用捕获外部变量 (所有)。
21.  **lambda 捕获**：`[=](int a){...}` 值捕获外部变量 (拷贝，不可改)。
22.  **rotate 函数**：`rotate(beg, new_beg, end)` 将 `new_beg` 旋转到 `beg` 位置。
23.  **nth_element**：`nth_element(a, a+k, a+n)` 将第 k 小的数放到 `a[k]`，且左边都比它小，右边都比它大 (O(N))。
24.  **prev/next**：`prev(it)` (前一个迭代器), `next(it)` (后一个)。
25.  **distance**：`distance(it1, it2)` 计算两个迭代器距离 (O(N) 或 O(1))。
26.  **accumulate**：`accumulate(v.begin(), v.end(), 0)` 求和 (注意初始值类型，决定结果类型，0为int，0LL为long long)。
27.  **iota**：`iota(v.begin(), v.end(), 1)` 生成 1, 2, 3... 序列。
28.  **min_element/max_element**：返回的是**迭代器**，需 `*` 解引用或减 `begin()` 得下标。
29.  **is_sorted**：判断是否序列已排序。
30.  **function**：`function<int(int, int)> func;` (存储函数)。

---

### 第十三章：其他杂项与心态
> AI建议：

1.   **万能头副作用**：编译时间稍长，命名冲突风险 (如 `y1`)。
2.   **命名冲突**：尽量不要用全局变量 `left`, `right`, `count`, `hash` (C++11后 risk 增加)。
3.   **递归层数**：默认大概支持 4w-10w 层，超深需手工扩栈。
4.   **扩栈指令**：`#pragma comment(linker, "/STACK:102400000,102400000")` (Visual C++, G++通常不支持)。
5.   **位域**：`struct { int x:1; }` (一般不用，除非压内存)。
6.   **大端小端**：网络流/二进制文件处理涉及，普通算法题不涉及。
7.   **快读模板**：
    ```cpp
    inline int read() {
        int x=0,f=1;char ch=getchar();
        while(ch<'0'||ch>'9'){if(ch=='-')f=-1;ch=getchar();}
        while(ch>='0'&&ch<='9'){x=x*10+ch-'0';ch=getchar();}
        return x*f;
    }
    ```
8.   **快写模板**：递归 `%10` 输出字符 `putchar`。
9.   **Codeforces/AtCoder**：通常开 O2 优化，STL 极快。
10.  **国内OJ**：POJ 等老OJ 可能不支持 C++11，注意 `unordered` 和 `auto` 不能用。
11.  **long double**：精度比 double 高，但慢。
12.  **比较函数 strict weak ordering**：`cmp(a,b)` 必须保证 `cmp(a,a)` 为 false。
13.  **结构体构造列表**：`Node(int x): x(x) {}` 比 `Node(int x) { this->x = x; }` 略快。
14.  **引用传参**：`void dfs(vector<int> &v)` (**一定要加&**，否则每次递归拷贝数组，直接TLE)。
15.  **常量引用**：`const vector<int> &v` (只读不改，安全且快)。
16.  **内联函数**：`inline` (建议编译器展开，减少函数调用开销)。
17.  **register**：`register int i` (C++17已弃用，现代编译器会自动优化，不用写)。
18.  **循环展开**：手动写 4 次操作代替循环，现代编译器通常能自动做。
19.  **打表**：对于很难推导的题，本地跑出前 100 个结果存数组提交。
20.  **模拟退火**：玄学算法，用于求最优解，非初赛重点。
21.  **对顶堆**：维护动态中位数 (一个大根堆，一个小根堆)。
22.  **单调队列**：滑动窗口最大值 (deque 维护下标)。
23.  **单调栈**：找左右第一个比自己大的数。
24.  **差分约束**：转化为最短路/最长路问题。
25.  **背包空间优化**：滚动数组，从 `dp[i][j]` 变成 `dp[j]`。
26.  **位运算优先级**：`==` 优先级高于 `&`。
27.  **逻辑短路**：`if (x >= 0 && a[x] == 1)` (如果 x<0，后面不会执行，安全)。
28.  **空指针**：`nullptr` (C++11) 优于 `NULL`。
29.  **复数类**：`complex<double>` (自带加减乘除，计算几何可用)。
30.  **1e9+7**：质数。
31.  **998244353**：质数 (NTT常用)。
32.  **19260817**：也是个质数 (哈希常用)。
33.  **memset 0x7f**：`0x7f7f7f7f` (比 0x3f 大，约为 2e9，两个相加会溢出 int)。建议用 `0x3f`。
34.  **ios::binary**：文件读写模式。
35.  **cin.peek()**：看一眼下一个字符但不取走。
36.  **cin.putback(c)**：把字符放回流。
37.  **exit(0)**：强制结束程序 (但在递归中慎用，可能析构函数不执行)。
38.  **return 0**：main 函数必须返回 0，否则 RE。
39.  **代码规范**：缩进对齐，大括号换行风格统一，方便查错。
40.  **心态**：卡题超过 20 分钟换题。
41.  **心态**：有人 AC 了不要慌，可能是水题，跟榜做。
42.  **心态**：罚时很贵，提交前自己测一下 edge cases (0, 1, n, max_n, -1)。
43.  **读题**：注意时间限制 (1s通常算 $10^8$ 次运算)。
44.  **读题**：注意空间限制 (256MB 很大，但 32MB 就要小心开大数组)。
45.  **读题**：再次确认是“子串(substring)”还是“子序列(subsequence)”。
46.  **读题**：再次确认是有向图还是无向图。

