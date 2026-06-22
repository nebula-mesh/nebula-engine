// 构建后将 raw .md 文件复制到 dist/raw/ 目录，供 LLM 通过 HTTP fetch 读取
const fs = require("fs");
const path = require("path");

const docsDir = path.resolve(__dirname, "..");
const distRawDir = path.resolve(docsDir, ".vitepress", "dist", "raw");

// 递归复制 .md 文件
function copyMdFiles(srcDir, destDir, baseDir) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    // 跳过 .vitepress 目录和隐藏文件
    if (entry.name.startsWith(".")) continue;

    const srcPath = path.join(srcDir, entry.name);

    if (entry.isDirectory()) {
      copyMdFiles(srcPath, destDir, baseDir);
    } else if (entry.name.endsWith(".md")) {
      const relativePath = path.relative(baseDir, srcPath);
      const destPath = path.join(destDir, relativePath);
      const destParent = path.dirname(destPath);

      if (!fs.existsSync(destParent)) {
        fs.mkdirSync(destParent, { recursive: true });
      }

      fs.copyFileSync(srcPath, destPath);
      console.log(`  raw/${relativePath}`);
    }
  }
}

console.log("\nCopying raw .md files for LLM access:");
copyMdFiles(docsDir, distRawDir, docsDir);
console.log("Done.\n");
