#!/usr/bin/env node
import { runMcp } from '@chrischall/mcp-utils';
import { client } from './client.js';
import { registerTaxonomyTools } from './tools/taxonomy.js';
import { registerTourTools } from './tools/tours.js';
import { VERSION } from './version.js';

// runMcp builds the McpServer, applies the registrars (with `client` threaded
// through as deps), prints the banner to stderr, wires SIGINT/SIGTERM graceful
// shutdown, and connects the stdio transport. The deferred-config-error
// pattern is preserved: `client` is constructed at module load in ./client.js
// (GYG_API_KEY is read lazily on the first request), so the host's initial
// tools/list always succeeds before any credential check runs.
await runMcp({
  name: 'getyourguide',
  version: VERSION,
  deps: client,
  tools: [registerTourTools, registerTaxonomyTools],
  banner:
    '[getyourguide-mcp] This project was developed and is maintained by AI (Claude). Use at your own discretion.',
});
