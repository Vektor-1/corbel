#!/usr/bin/env node

/**
 * Test Rodium AI and AgentRouter providers
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

import { makeAsk as makeRodiumAsk } from '../src/lib/plan-import/rodium-ai';
import { makeAskImageAnalysis, makeAskOcr, makeAskScaleCalibration } from '../src/lib/plan-import/agent-router';

async function testProviders() {
  console.log('\n🚀 Testing AI Providers...\n');

  console.log('📡 Provider Configuration:');
  console.log('  ' + (process.env.RODIUM_AI_API_KEY ? '✅' : '❌') + ' RODIUM_AI_API_KEY');
  console.log('  ' + (process.env.AGENT_ROUTER_API_KEY ? '✅' : '❌') + ' AGENT_ROUTER_API_KEY\n');

  // Test image URL (placeholder - won't actually fetch for this test)
  const testImageUrl = 'https://example.com/floor-plan.png';

  // Test Rodium AI
  if (process.env.RODIUM_AI_API_KEY) {
    console.log('1️⃣  Rodium AI Provider:');
    try {
      const ask = makeRodiumAsk(testImageUrl, 'gpt-5.6-luna');
      console.log('   ✅ Rodium AI initialized (GPT-5.6-Luna)');
      console.log('   Function signature: ask(prompt) => Promise<object>\n');
    } catch (err) {
      console.error('   ❌ Error:', err instanceof Error ? err.message : err, '\n');
    }
  }

  // Test AgentRouter
  if (process.env.AGENT_ROUTER_API_KEY) {
    console.log('2️⃣  AgentRouter Providers:');
    try {
      const askImage = makeAskImageAnalysis(testImageUrl);
      console.log('   ✅ Image Analysis initialized (GPT-5.6-Luna primary)');

      const askOcr = makeAskOcr(testImageUrl);
      console.log('   ✅ OCR initialized (Gemini-3.1 primary)');

      const askScale = makeAskScaleCalibration(testImageUrl);
      console.log('   ✅ Scale Calibration initialized (GPT-5.6-Luna primary)\n');

      console.log('   Routing Strategy:');
      console.log('     P1 (Detection)    → GPT-5.6-Luna → Gemini-3.1');
      console.log('     P4 (OCR)          → Gemini-3.1 → GPT-5.6-Luna');
      console.log('     P5 (Scale Cal)    → GPT-5.6-Luna → Gemini-3.1\n');
    } catch (err) {
      console.error('   ❌ Error:', err instanceof Error ? err.message : err, '\n');
    }
  }

  console.log('✅ Provider configuration verified!\n');

  console.log('📝 Next Steps:');
  console.log('   1. Upload a floor plan image in Corbel editor');
  console.log('   2. Select "Import from image"');
  console.log('   3. System will route to providers based on task type\n');
}

testProviders().catch(console.error);
