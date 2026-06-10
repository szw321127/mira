import { ToolDefinition, ToolRegistry } from './registry';

export {
  readFileTool,
  writeFileTool,
  listDirectoryTool,
  editFileTool,
} from './file-tools';
export { globTool, grepTool } from './search-tools';
export { bashTool } from './shell-tools';
export { startPreviewTool, fetchUrlTool } from './fetch-tools';
export { pickSearchTool, webFetchTool } from './web-search';
export { createMemoryTool } from './memory-tools';
export { ToolRegistry, truncateResult, type ToolDefinition } from './registry';

export function getToolSearchTool(registry: ToolRegistry): ToolDefinition {
  return {
    name: 'tool_search',
    description:
      '获取延迟工具的完整定义。传入工具名（从系统提示的延迟工具列表中选取），返回该工具的完整参数 Schema',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '工具名，如 "mcp__github__list_issues"。支持逗号分隔多个',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
    isConcurrencySafe: true,
    isReadOnly: true,
    execute: async ({ query }: { query: string }) => {
      const results = registry.searchTools(query);
      if (results.length === 0) return `没有找到工具: ${query}`;
      return results.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
    },
  };
}
