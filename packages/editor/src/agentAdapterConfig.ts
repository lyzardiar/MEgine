import type {
  AgentAdapterCommand,
  AgentAdapterInfo,
} from './transport/editorTransport.ts';

export function createMcpClientConfiguration(info: AgentAdapterInfo): string {
  return JSON.stringify({
    mcpServers: {
      mengine: {
        command: info.mcp.command,
        args: info.mcp.args,
        ...(info.mcp.env ? { env: info.mcp.env } : {}),
      },
    },
  }, null, 2);
}

function quoteCommandPart(value: string): string {
  if (value.length > 0 && !/[\s"]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function formatAgentAdapterCommand(command: AgentAdapterCommand): string {
  return [command.command, ...command.args].map(quoteCommandPart).join(' ');
}
