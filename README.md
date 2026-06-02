# 微信读书热门封面下载器

基于 Node.js 的小工具，输入书名关键词，自动从微信读书平台搜索并下载**阅读人数前三**的书籍高清封面，保存到本地 `cover` 文件夹中。

## 为什么选择微信读书？

- **书籍资源丰富**：平台收录了海量正版中文书籍，覆盖文学、社科、经管、生活等各个领域，几乎能找到所有热门及经典书目。
- **封面尺寸统一**：微信读书的封面图片尺寸高度统一，下载后无需额外裁剪或调整，直接适合用作书单展示、博客插图、个人收藏等。
- **稳定可靠**：调用公开的搜索接口，返回数据格式固定，封面链接可直接拼接高清地址，长期可用且不易失效。
- **无需登录**：搜索和封面下载均为公开资源，无需注册或鉴权，降低了使用门槛。

## 核心原理

1. **搜索书籍**  
   调用微信读书公开的搜索接口 `https://weread.qq.com/api/store/search`，传入书名关键词，获取书籍列表。

2. **筛选与排序**  
   - 优先选择书名完全包含关键词的书籍（若没有则使用全部搜索结果）。  
   - 按 `readingCount`（阅读人数）降序排列，取出前 3 本。  
   - 若不足 3 本，则全部下载。

3. **高清封面地址构造**  
   微信读书返回的封面 URL 通常为普通清晰度（路径含 `/s_`），将其替换为 `/t9_` 即可获得高清大图。

4. **文件保存**  
   封面以 `关键词_Top1.jpg`、`关键词_Top2.jpg` … 的格式命名，统一存储在项目根目录下的 `cover` 文件夹。程序会自动创建该目录。

## 环境配置

- **Node.js**：建议 v14 及以上版本。
- **依赖安装**：本项目仅依赖 `axios` 发送 HTTP 请求。

在项目根目录执行：

```bash
npm install axios
```

## 使用方法

```bash
node index.js <书名>
```

### 示例

```bash
node index.js 三体
```

运行后将依次下载《三体》《三体II：黑暗森林》《三体III：死神永生》（或阅读人数排名前三的版本）的高清封面，保存至 `cover` 文件夹，终端输出如下：

```
[目录] 已创建文件夹: cover
[搜索] 正在搜索: "三体"
[结果] 找到 3 本书，开始下载封面...
[1] 《三体》 阅读人数: 3521000
[下载] 正在下载: https://weread.qq.com/.../t9_...
[成功] 封面已保存: cover/三体_Top1.jpg
...
[完成] 所有任务执行完毕
```

## 项目结构

```
.
├── index.js       # 主程序
├── cover/         # 封面保存目录（自动创建）
└── README.md
```

## 注意事项

- 搜索请求依赖网络，若频繁使用可能触发平台限流，建议合理控制请求频率。
- 若书籍无封面或搜索无结果，程序会给出相应提示并跳过。
- 文件名中的非法字符（如 `\ / : * ? " < > |`）会被替换为下划线，避免系统报错。

MIT License

Copyright (c) 2026 AndDevMK

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
