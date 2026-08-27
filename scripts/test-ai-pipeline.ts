#!/usr/bin/env node

/**
 * Direct AI pipeline test script.
 * Loads env vars and tests the scoring pipeline.
 * Run: npx tsx scripts/test-ai-pipeline.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// Load .env.local
const envPath = path.join(__dirname, '../.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      if (key && value) {
        process.env[key] = value;
      }
    }
  });
}

import { scoreLLMDesignIteration } from '../src/lib/standards/llmScoring';
import type { Canonical } from '../src/types/schema';
import { Source } from '../src/types/schema';

const USER: Source = Source.USER;

function createTestFloor(id: string, wallCount: number, roomCount: number): Canonical.Floor {
  return {
    id,
    elevation: 0,
    floorHeight: 3000,
    walls: Array.from({ length: wallCount }, (_, i) => ({
      id: `wall-${id}-${i}`,
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 1000 },
      typeRef: 'ext-200',
      openingIds: [],
      confidence: 1.0,
      source: USER,
    })),
    rooms: Array.from({ length: roomCount }, (_, i) => ({
      id: `room-${id}-${i}`,
      label: `Room ${i}`,
      type: 'bedroom',
      area: 20000000, // 20m²
      centroid: { x: 500, y: 500 },
      vertices: [],
      boundingWallIds: [],
      confidence: 1.0,
      source: USER,
    })),
    openings: [],
  };
}

async function testPipeline() {
  console.log('\n🚀 Testing AI Pipeline...\n');

  // Check API keys
  console.log('📡 API Configuration:');
  console.log('  ' + (process.env.ANTHROPIC_API_KEY ? '✅' : '❌') + ' ANTHROPIC_API_KEY');
  console.log('  ' + (process.env.OPENAI_API_KEY ? '✅' : '❌') + ' OPENAI_API_KEY');
  console.log('  ' + (process.env.RODIUM_AI_API_KEY ? '✅' : '❌') + ' RODIUM_AI_API_KEY');
  console.log('  ' + (process.env.AGENT_ROUTER_API_KEY ? '✅' : '❌') + ' AGENT_ROUTER_API_KEY');

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    console.log('\n⚠️  No LLM API keys configured. Using fallback rule-based scoring.\n');
  }

  console.log('\n🧪 Test Cases:\n');

  // Test 1: No changes
  console.log('1️⃣  Test: No changes (score should be 0)');
  const baseline1 = createTestFloor('baseline-1', 4, 2);
  try {
    const result1 = await scoreLLMDesignIteration({
      baseline: baseline1,
      redesign: baseline1,
      changeCount: 0,
      wallsAdded: 0,
      wallsRemoved: 0,
      roomsAdded: 0,
      roomsRemoved: 0,
    });
    console.log(`   Score: ${result1.score}, Model: ${result1.model}`);
    console.log(`   Reasoning: ${result1.reasoning}\n`);
  } catch (err) {
    console.error('   ❌ Error:', err instanceof Error ? err.message : err);
  }

  // Test 2: Minor changes
  console.log('2️⃣  Test: Minor changes (< 3 modifications, score should be 1)');
  const baseline2 = createTestFloor('baseline-2', 4, 2);
  const redesign2 = createTestFloor('redesign-2', 5, 2);
  try {
    const result2 = await scoreLLMDesignIteration({
      baseline: baseline2,
      redesign: redesign2,
      changeCount: 2,
      wallsAdded: 1,
      wallsRemoved: 0,
      roomsAdded: 0,
      roomsRemoved: 0,
    });
    console.log(`   Score: ${result2.score}, Model: ${result2.model}`);
    console.log(`   Reasoning: ${result2.reasoning}\n`);
  } catch (err) {
    console.error('   ❌ Error:', err instanceof Error ? err.message : err);
  }

  // Test 3: Significant changes
  console.log('3️⃣  Test: Significant changes (3+ modifications, score should be 2)');
  const baseline3 = createTestFloor('baseline-3', 4, 2);
  const redesign3 = createTestFloor('redesign-3', 6, 4);
  try {
    const result3 = await scoreLLMDesignIteration({
      baseline: baseline3,
      redesign: redesign3,
      changeCount: 5,
      wallsAdded: 2,
      wallsRemoved: 0,
      roomsAdded: 2,
      roomsRemoved: 0,
    });
    console.log(`   Score: ${result3.score}, Model: ${result3.model}`);
    console.log(`   Reasoning: ${result3.reasoning}\n`);
  } catch (err) {
    console.error('   ❌ Error:', err instanceof Error ? err.message : err);
  }

  console.log('✅ AI Pipeline tests complete!\n');
}

testPipeline().catch(console.error);
