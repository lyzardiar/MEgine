import assert from 'node:assert/strict';
import test from 'node:test';
import { TOOLS } from '../../agent/mcp/server.mjs';
import { COMMAND_META } from '../src/agent/commands.ts';

test('every AgentBridge write command has exactly one MCP tool with exact required fields', () => {
  const writeTools = TOOLS.filter((tool) => typeof tool.bridgeCommand === 'string');
  const byCommand = new Map();
  for (const tool of writeTools) {
    const existing = byCommand.get(tool.bridgeCommand) ?? [];
    existing.push(tool);
    byCommand.set(tool.bridgeCommand, existing);
  }

  assert.equal(writeTools.length, COMMAND_META.length);
  assert.deepEqual(
    [...byCommand.keys()].sort(),
    COMMAND_META.map((command) => command.id).sort(),
  );

  for (const command of COMMAND_META) {
    const matches = byCommand.get(command.id) ?? [];
    assert.equal(matches.length, 1, `${command.id} must map to exactly one MCP tool`);
    assert.deepEqual(
      [...(matches[0].inputSchema.required ?? [])].sort(),
      [...(command.paramsSchema.required ?? [])].sort(),
      `${command.id} required fields drifted from its authoritative schema`,
    );
  }
});

test('MCP tool names are unique and every input schema is an object', () => {
  const names = TOOLS.map((tool) => tool.name);
  assert.equal(new Set(names).size, names.length);
  for (const tool of TOOLS) {
    assert.equal(tool.inputSchema?.type, 'object', `${tool.name} must accept an object`);
    assert.equal(
      typeof tool.inputSchema.properties,
      'object',
      `${tool.name} must declare properties`,
    );
  }
});
