# PromptHub Collector 浏览器插件

一键抓取网页上的 AI 提示词，保存到 PromptHub 收藏库。

## 安装步骤

### Chrome / Edge 安装

1. 打开浏览器，地址栏输入 `chrome://extensions/`（Edge 用户输入 `edge://extensions/`）
2. 打开右上角的 **开发者模式** 开关
3. 点击 **加载已解压的扩展程序**
4. 选择 `extension` 文件夹（即本目录）
5. 安装完成！浏览器工具栏会出现 🍌 图标

## 使用方法

### 方式一：自动扫描

- 打开包含 AI 提示词的网页（如 Twitter、Reddit、Discord、Midjourney 社区等）
- 插件会 **自动扫描** 页面，检测到的提示词旁边会显示「🍌 收藏」按钮
- 点击按钮即可将提示词 + 图片保存到收藏队列

### 方式二：手动扫描

- 点击浏览器工具栏的 🍌 插件图标
- 点击 **🔍 扫描页面** 按钮
- 弹窗中会列出检测到的所有提示词
- 点击 **📋** 复制提示词，或点击 **❤️** 加入收藏队列

### 同步到网站

- 收集的提示词会暂存在插件队列中
- 点击插件弹窗底部的 **🔄 同步到 PromptHub** 按钮
- 系统会自动打开 PromptHub 网站并导入所有收藏的提示词
- 导入后可在网站的 **❤️ 我的收藏** 页面查看和管理

## 功能特点

- ✅ 智能识别 AI 提示词（支持 Midjourney、Stable Diffusion、DALL-E 等格式）
- ✅ 自动提取关联图片
- ✅ 自动分类和标签识别
- ✅ 浮动收藏按钮，一键收藏
- ✅ 批量同步到 PromptHub 网站
- ✅ 支持复制提示词文本

## 支持的网站

- Twitter / X
- Reddit
- Discord（网页版）
- Midjourney 社区
- Civitai
- 任何包含 AI 提示词的网页

## 配置

如果 PromptHub 网站部署到了其他地址，请修改 `popup.js` 中的 `WEBSITE_URL`：

```javascript
const WEBSITE_URL = 'http://localhost:8080'; // 改为你的网站地址
```

同时修改 `background.js` 中的 tab 匹配规则：

```javascript
chrome.tabs.query({ url: '*://localhost*/*' }, (tabs) => { ... });
// 改为你的域名，例如：
// chrome.tabs.query({ url: '*://yourdomain.com*/*' }, (tabs) => { ... });
```
