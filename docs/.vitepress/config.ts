import { defineConfig } from "vitepress";

export default defineConfig({
  title: "Nebula Engine",
  description: "基于 Hono 的轻量级微服务引擎框架",

  // 将 raw markdown 复制到 dist，供 LLM 通过 HTTP fetch 读取
  transformPageData(pageData) {
    // 保留原始内容不变
  },

  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/" },
      { text: "插件", link: "/plugins/" },
    ],

    sidebar: {
      "/guide/": [
        { text: "快速开始", link: "/guide/" },
        { text: "核心原理", link: "/guide/core-concepts" },
        { text: "测试指南", link: "/guide/testing" },
      ],
      "/plugins/": [
        { text: "总览", link: "/plugins/" },
        { text: "Action 插件", link: "/plugins/action" },
        { text: "Route 插件", link: "/plugins/route" },
        { text: "Cache 插件", link: "/plugins/cache" },
        { text: "Schedule 插件", link: "/plugins/schedule" },
        { text: "GracefulShutdown 插件", link: "/plugins/graceful-shutdown" },
        { text: "ClientCode 插件", link: "/plugins/client-code" },
        { text: "DynamicConfig 插件", link: "/plugins/dynamic-config" },
        { text: "ConcurrencyLock 插件", link: "/plugins/concurrency-lock" },
        { text: "编写自定义插件", link: "/plugins/custom" },
      ],
    },

    socialLinks: [
      { icon: "github", link: "https://github.com" },
    ],

    footer: {
      message: "基于 Hono 构建 | MIT License",
    },

    search: {
      provider: "local",
    },
  },
});
