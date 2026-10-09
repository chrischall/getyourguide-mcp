import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/server';
import { GYGClient } from '../../src/client.js';
import { registerTourTools } from '../../src/tools/tours.js';
import { registerTaxonomyTools } from '../../src/tools/taxonomy.js';

// Every tool here is a read-only GET against an external API: clients that
// label or gate network tools on openWorldHint must see that, consistently
// with the shared gyg_healthcheck (which mcp-utils marks openWorldHint).
describe('tool annotations', () => {
  it('marks every tool read-only, idempotent and open-world', () => {
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    const client = new GYGClient();
    registerTourTools(server, client);
    registerTaxonomyTools(server, client);
    const tools = (server as unknown as { _registeredTools: Record<string, { annotations?: unknown }> })
      ._registeredTools;
    expect(Object.keys(tools)).toHaveLength(9);
    for (const [name, tool] of Object.entries(tools)) {
      expect(tool.annotations, name).toEqual({
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
  });
});
