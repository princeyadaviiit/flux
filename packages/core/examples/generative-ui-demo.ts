/**
 * Phase 3 Example: Generative UI Streaming & HITL Demo
 * Demonstrates:
 * 1. Incremental StreamingUIParser handling partial token streams
 * 2. FluxRenderer with schema validation and mandatory HTML sanitization
 * 3. Human-in-the-Loop (HITL) approval gate for sensitive actions
 */

import { StreamingUIParser } from '../src/renderer/StreamingUIParser';
import { FluxRenderer } from '../src/renderer/FluxRenderer';
import { AgentHITL } from '../src/hitl/AgentHITL';
import { FluxEnvelopeFactory } from '../src/transport/protocol';

async function runGenerativeUIDemo() {
  console.log('====================================================');
  console.log('  FLUX PHASE 3 DEMO: Generative UI & HITL Autonomy');
  console.log('====================================================\n');

  // 1. Initialize Renderer and Register Components
  const renderer = new FluxRenderer();

  renderer.register('UserCard', {
    component: 'UserCardTemplate',
    richTextProps: ['bio'], // Marked for mandatory sanitization (RULES.md §1.2)
    schema: (props, isPartial) => {
      if (!isPartial && !props.name) {
        return { valid: false, errors: ['name is required'] };
      }
      return { valid: true, data: props };
    },
  });

  renderer.onRender(descriptor => {
    console.log(
      `[UI Render] Component: <${descriptor.componentName}> | Complete: ${descriptor.isComplete} | Props:`,
      descriptor.props
    );
  });

  // 2. Simulate LLM Streaming Tokens into StreamingUIParser
  console.log('--- Step 1: Streaming Generative UI Tokens ---');
  const parser = new StreamingUIParser();
  renderer.attachParser(parser);

  const tokenStream = [
    '{"component": "UserCard"',
    ', "name": "Dr. Aris',
    'totle"',
    ', "role": "Philosopher"',
    ', "bio": "Author of <em>Ethics</em><script>malicious()</script>"',
    '}',
  ];

  for (let i = 0; i < tokenStream.length; i++) {
    const chunk = tokenStream[i];
    console.log(`[LLM Token ${i + 1}] Emitting: ${chunk}`);
    parser.addChunk(chunk);
    await new Promise(r => setTimeout(r, 20));
  }

  parser.complete();
  console.log('\n✓ Streaming UI successfully parsed and sanitized.\n');

  // 3. Human-in-the-Loop (HITL) Approval Flow
  console.log('--- Step 2: Human-in-the-Loop Approval Flow ---');
  const hitl = new AgentHITL('super-secret-session-key');

  hitl.onRequest((req, token) => {
    console.log(`[Server -> Client] Approval requested: "${req.summary}" (Action ID: ${req.actionId})`);
    console.log(`[Client Token Received] Nonce: ${token.nonce.slice(0, 8)}... | Sig: ${token.sig.slice(0, 16)}...`);
  });

  // Start sensitive action that pauses execution
  const actionPromise = hitl.executeGatedAction(
    { actionId: 'deploy-agent-v1', summary: 'Publish generative agent to production cluster' },
    'session-xyz-987',
    async () => {
      console.log('🚀 [EXECUTION] Action executing with approved authorization!');
      return { status: 'DEPLOYED_SUCCESSFULLY', cluster: 'us-central1' };
    }
  );

  console.log('[Agent Status] Execution paused awaiting user approval...');
  await new Promise(r => setTimeout(r, 50));

  // User approves via UI
  const pendingToken = hitl.getPendingToken('deploy-agent-v1');
  if (pendingToken) {
    console.log('[User Action] User clicked "Approve" in UI.');
    await hitl.receiveApproval(pendingToken);
  }

  const result = await actionPromise;
  console.log('[Result]', result);

  console.log('\n====================================================');
  console.log('  PHASE 3 DEMO COMPLETE');
  console.log('====================================================');
}

runGenerativeUIDemo().catch(console.error);
