#!/usr/bin/env node
/**
 * Prediction Tracker
 * Log predictions, track outcomes, score epistemic accuracy
 * Part of the persistence layer for epistemic entrepreneurship
 */

const fs = require('fs');
const path = require('path');

const PREDICTIONS_FILE = '/root/clawd-soma/data/predictions.json';

class PredictionTracker {
  constructor() {
    this.ensureDataDir();
    this.predictions = this.loadPredictions();
  }

  ensureDataDir() {
    const dir = path.dirname(PREDICTIONS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  loadPredictions() {
    if (fs.existsSync(PREDICTIONS_FILE)) {
      return JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
    }
    return { predictions: [], accuracy: { total: 0, correct: 0, rate: 0 } };
  }

  savePredictions() {
    fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(this.predictions, null, 2));
  }

  add(prediction, confidence, falsifier, deadline, tags = []) {
    const entry = {
      id: `P${this.predictions.predictions.length + 1}`,
      prediction,
      confidence: parseInt(confidence),
      falsifier,
      deadline,
      tags,
      status: 'open',
      createdAt: new Date().toISOString(),
      resolvedAt: null,
      outcome: null,
      notes: ''
    };
    
    this.predictions.predictions.push(entry);
    this.savePredictions();
    console.log(`✅ Added prediction ${entry.id}: ${prediction}`);
    return entry.id;
  }

  resolve(id, outcome, notes = '') {
    const pred = this.predictions.predictions.find(p => p.id === id);
    if (!pred) {
      console.error(`❌ Prediction ${id} not found`);
      return false;
    }
    
    if (pred.status === 'resolved') {
      console.error(`❌ Prediction ${id} already resolved`);
      return false;
    }

    pred.status = 'resolved';
    pred.outcome = outcome; // 'correct' or 'incorrect'
    pred.resolvedAt = new Date().toISOString();
    pred.notes = notes;

    this.predictions.accuracy.total++;
    if (outcome === 'correct') {
      this.predictions.accuracy.correct++;
    }
    this.predictions.accuracy.rate = 
      Math.round((this.predictions.accuracy.correct / this.predictions.accuracy.total) * 100);

    this.savePredictions();
    console.log(`✅ Resolved ${id}: ${outcome} (${this.predictions.accuracy.rate}% accuracy)`);
    return true;
  }

  list(status = 'all') {
    let preds = this.predictions.predictions;
    if (status !== 'all') {
      preds = preds.filter(p => p.status === status);
    }
    
    console.log(`\n📊 Predictions (${status}):`);
    console.log('=' .repeat(80));
    
    preds.forEach(p => {
      const icon = p.status === 'resolved' 
        ? (p.outcome === 'correct' ? '✅' : '❌')
        : '⏳';
      console.log(`${icon} ${p.id} [${p.confidence}%] ${p.prediction.substring(0, 60)}...`);
      console.log(`   Status: ${p.status} | Deadline: ${p.deadline} | Tags: ${p.tags.join(', ')}`);
      if (p.outcome) {
        console.log(`   Outcome: ${p.outcome} | Notes: ${p.notes}`);
      }
      console.log();
    });

    console.log(`\nAccuracy: ${this.predictions.accuracy.correct}/${this.predictions.accuracy.total} (${this.predictions.accuracy.rate}%)`);
  }

  stats() {
    const open = this.predictions.predictions.filter(p => p.status === 'open').length;
    const resolved = this.predictions.predictions.filter(p => p.status === 'resolved').length;
    const correct = this.predictions.predictions.filter(p => p.outcome === 'correct').length;
    
    console.log('\n📈 Prediction Stats');
    console.log('==================');
    console.log(`Total predictions: ${this.predictions.predictions.length}`);
    console.log(`Open: ${open}`);
    console.log(`Resolved: ${resolved}`);
    console.log(`Correct: ${correct}`);
    console.log(`Accuracy: ${this.predictions.accuracy.rate}%`);
    console.log(`\nBy tag:`);
    
    const tags = {};
    this.predictions.predictions.forEach(p => {
      p.tags.forEach(tag => {
        if (!tags[tag]) tags[tag] = { total: 0, correct: 0 };
        tags[tag].total++;
        if (p.outcome === 'correct') tags[tag].correct++;
      });
    });
    
    Object.entries(tags).forEach(([tag, data]) => {
      const rate = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
      console.log(`  ${tag}: ${data.correct}/${data.total} (${rate}%)`);
    });
  }
}

// CLI
function main() {
  const tracker = new PredictionTracker();
  const command = process.argv[2];

  if (command === 'add') {
    const prediction = process.argv[3];
    const confidence = process.argv[4] || 50;
    const falsifier = process.argv[5] || 'No falsifier set';
    const deadline = process.argv[6] || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const tags = (process.argv[7] || '').split(',').filter(t => t);
    tracker.add(prediction, confidence, falsifier, deadline, tags);
  } else if (command === 'resolve') {
    const id = process.argv[3];
    const outcome = process.argv[4]; // 'correct' or 'incorrect'
    const notes = process.argv[5] || '';
    tracker.resolve(id, outcome, notes);
  } else if (command === 'list') {
    tracker.list(process.argv[3] || 'all');
  } else if (command === 'stats') {
    tracker.stats();
  } else {
    console.log('Usage:');
    console.log('  node prediction-tracker.js add "prediction text" confidence falsifier deadline tags');
    console.log('  node prediction-tracker.js resolve P1 correct "notes"');
    console.log('  node prediction-tracker.js list [open|resolved|all]');
    console.log('  node prediction-tracker.js stats');
  }
}

if (require.main === module) {
  main();
}

module.exports = { PredictionTracker };
