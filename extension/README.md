# PromptHub Collector 浏览器插件 v2.0

一键抓取网页上的 AI 提示词，保存到 PromptHub 收藏库。

## v2.0 新特性

- 🍌 **右键快速收藏** — 在任意网页选中文字，右键 →「🍌 收藏到 PromptHub」
- 🔍 **智能页面扫描** — 点击插件图标自动扫描当前页面的 AI 提示词
- 📦 **队列管理** — 收集的提示词暂存在插件队列中，支持批量同步
- 🔄 **一键同步** — 将队列中的提示词同步到 PromptHub 网站
- 🎯 **精准识别** — 支持 Midjourney / Stable Diffusion / DALL-E 等格式
- 🖼️ **自动提取图片** — 智能查找提示词附近的关联图片
- 🏷️ **自动分类** — 识别提示词主题并自动分类和打标签
- 🚫 **零干扰** — 不再自动注入浮动按钮，不影响正常浏览

## 安装步骤

### Chrome / Edge 安装

1. 打开浏览器，地址栏输入 `chrome://extensions/`（Edge 用户输入 `edge://extensions/`）
2. 打开右上角的 **开发者模式** 开关
3. 点击 **加载已解压的扩展程序**
4. 选择 `extension` 文件夹（即本目录）
5. 安装完成！浏览器工具栏会出现 🍌 图标

## 使用方法

### 方式一：右键快速收藏

1. 在任意网页选中一段提示词文字
2. 右键 → 点击 **「🍌 收藏到 PromptHub」**
3. 提示词自动加入待同步队列（插件图标会显示角标提示）

### 方式二：扫描页面

1. 打开包含 AI 提示词的网页（如 Twitter、Reddit、Civitai 等）
2. 点击浏览器工具栏的 🍌 插件图标
3. 插件自动扫描页面，弹窗中列出检测到的所有提示词
4. 点击 **📋 复制** 复制提示词文本，或点击 **❤️ 收藏** 加入队列

### 同步到网站

1. 收集足够多的提示词后，点击弹窗底部的 **🔄 同步到网站**
2. 系统自动打开 PromptHub 网站
3. 提示词自动导入到「我的收藏」页面
4. 同步完成后队列自动清空

## 支持的网站

- Twitter / X
- Reddit
- Discord（网页版）
- Midjourney 社区
- Civitai
- 小红书
- 任何包含 AI 提示词的网页

## 技术架构

| 文件 | 说明 |
|------|------|
| `manifest.json` | MV3 配置，权限：activeTab, storage, scripting, contextMenus |
| `background.js` | Service Worker，右键菜单 + 队列管理 + 同步逻辑 |
| `content.js` | 内容脚本，提示词检测 + 扫描响应 + 数据写入 |
| `popup.html` | 弹窗 UI |
| `popup.js` | 弹窗逻辑，页面扫描 + 收藏 + 同步 |
| `icons/` | 4 种尺寸 PNG 图标（16/32/48/128） |

## 数据流

```
用户操作 → chrome.storage.local 队列 → 同步 → 网站 localStorage → 收藏库
         ↑                                              ↓
    右键收藏 / 扫描收藏                          app.js 轮询读取
```

## 网站

PromptHub 线上地址：https://kxbbw81-glitch.github.io/PromptHub-/
