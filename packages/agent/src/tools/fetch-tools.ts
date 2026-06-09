import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { createServer, type Server } from 'node:http';
import type { ToolDefinition } from './registry';

export const fetchUrlTool: ToolDefinition = {
  name: 'fetch_url',
  description:
    '抓取指定 URL 的网页内容并转换为纯文本（自动剥离 HTML 标签）。让 Agent 阅读外部资料、文档、博客',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '完整 URL，必须以 http:// 或 https:// 开头',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  isConcurrencySafe: true,
  isReadOnly: true,
  maxResultChars: 1500,
  execute: async ({ url }: { url: string }) => {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 SuperAgent' },
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return `请求失败：HTTP ${res.status}`;
      const html = await res.text();
      return (
        html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim() || '页面无文本内容'
      );
    } catch (err: any) {
      return `抓取失败：${err.message}`;
    }
  },
};

let previewServer: Server | null = null;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.tsx': 'application/javascript; charset=utf-8',
  '.ts': 'application/javascript; charset=utf-8',
  '.jsx': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

export const startPreviewTool: ToolDefinition = {
  name: 'start_preview',
  description:
    '启动 app/ 目录的预览服务器，让浏览器能访问生成的网页应用。生成应用文件后必须立即调用此工具',
  parameters: {
    type: 'object',
    properties: {
      port: { type: 'number', description: '端口号，默认 8080' },
    },
    required: [],
    additionalProperties: false,
  },
  isConcurrencySafe: false,
  isReadOnly: false,
  execute: async ({ port = 8080 }: { port?: number } = {}) => {
    const root = resolve('app');
    if (!existsSync(root))
      return '错误：app/ 目录不存在，请先用 write_file 生成应用文件';

    if (previewServer) return `预览服务器已在运行 → http://localhost:${port}`;

    previewServer = createServer((req, res) => {
      const urlPath = (req.url?.split('?')[0] || '/').replace(
        /\/$/,
        '/index.html',
      );
      const filePath = join(root, urlPath === '/' ? '/index.html' : urlPath);
      try {
        if (!filePath.startsWith(root)) {
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
        const content = readFileSync(filePath);
        res.writeHead(200, {
          'Content-Type':
            MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
      } catch {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    return new Promise<string>((resolve, reject) => {
      previewServer!.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE')
          resolve(`端口 ${port} 已被占用，预览可能已经在跑了`);
        else reject(err);
      });
      previewServer!.listen(port, () => {
        resolve(
          `✓ 预览服务器已启动 → http://localhost:${port}（点击 WebContainer 的 Preview 标签查看）`,
        );
      });
    });
  },
};
