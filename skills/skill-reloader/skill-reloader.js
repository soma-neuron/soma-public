#!/usr/bin/env node
/**
 * Skill Reloader
 * Hot-reloads skills and critical files after workspace resets
 * Preserves state across restarts for Clawdbot agents
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CONFIG = {
  // Files to preserve across resets
  criticalFiles: [
    'SOUL.md',
    'PROJECTS.md',
    'MEMORY.md',
    'tools/*.js',
    'skills/**',
    'memory/*.md'
  ],
  // Remote backup location (GitHub)
  remote: 'origin',
  branch: 'main',
  // Local cache for fast recovery
  cacheDir: '/tmp/soma-cache'
};

class SkillReloader {
  constructor() {
    this.workspace = '/root/clawd-soma';
    this.cache = CONFIG.cacheDir;
  }

  // Check if this is a fresh workspace (no git or reset detected)
  isFreshWorkspace() {
    const gitDir = path.join(this.workspace, '.git');
    if (!fs.existsSync(gitDir)) return true;
    
    // Check if tools directory is empty (indicator of reset)
    const toolsDir = path.join(this.workspace, 'tools');
    if (fs.existsSync(toolsDir)) {
      const tools = fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'));
      if (tools.length === 0) return true;
    }
    
    return false;
  }

  // Restore from GitHub
  async restoreFromRemote() {
    console.log('🔄 Workspace reset detected. Restoring from remote...');
    
    try {
      // Initialize git if needed
      if (!fs.existsSync(path.join(this.workspace, '.git'))) {
        execSync('git init', { cwd: this.workspace, stdio: 'ignore' });
      }
      
      // Add remote if not exists
      try {
        execSync('git remote get-url origin', { cwd: this.workspace, stdio: 'ignore' });
      } catch {
        execSync(
          `git remote add origin https://${process.env.GITHUB_TOKEN}@github.com/soma-neuron/soma-internal.git`,
          { cwd: this.workspace, stdio: 'ignore' }
        );
      }
      
      // Fetch and reset to remote
      execSync('git fetch origin', { cwd: this.workspace, stdio: 'ignore' });
      execSync('git reset --hard origin/main', { cwd: this.workspace, stdio: 'ignore' });
      
      console.log('✅ Restored from GitHub');
      return true;
    } catch (e) {
      console.error('❌ Restore failed:', e.message);
      return false;
    }
  }

  // Create local cache backup
  createCache() {
    if (!fs.existsSync(this.cache)) {
      fs.mkdirSync(this.cache, { recursive: true });
    }
    
    // Copy critical files to cache
    const filesToCache = [
      'SOUL.md',
      'PROJECTS.md',
      'HEARTBEAT.md',
      'MEMORY.md'
    ];
    
    filesToCache.forEach(file => {
      const src = path.join(this.workspace, file);
      const dest = path.join(this.cache, file);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
      }
    });
    
    console.log('💾 Cached critical files');
  }

  // Restore from local cache (faster than git)
  restoreFromCache() {
    if (!fs.existsSync(this.cache)) {
      console.log('⚠️  No cache found');
      return false;
    }
    
    const filesToRestore = [
      'SOUL.md',
      'PROJECTS.md',
      'HEARTBEAT.md',
      'MEMORY.md'
    ];
    
    let restored = 0;
    filesToRestore.forEach(file => {
      const src = path.join(this.cache, file);
      const dest = path.join(this.workspace, file);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
        restored++;
      }
    });
    
    if (restored > 0) {
      console.log(`✅ Restored ${restored} files from cache`);
      return true;
    }
    return false;
  }

  // Main entry point
  async ensureContinuity() {
    console.log('🔍 Checking workspace continuity...\n');
    
    // Always create cache backup
    this.createCache();
    
    // Check if we need restoration
    if (this.isFreshWorkspace()) {
      // Try cache first (faster)
      if (!this.restoreFromCache()) {
        // Fall back to git
        await this.restoreFromRemote();
      }
      
      console.log('\n🚀 Workspace continuity restored');
      console.log('📊 Current state:');
      this.showStatus();
      return true;
    }
    
    console.log('✅ Workspace intact');
    return false;
  }

  showStatus() {
    const toolsDir = path.join(this.workspace, 'tools');
    const tools = fs.existsSync(toolsDir) 
      ? fs.readdirSync(toolsDir).filter(f => f.endsWith('.js'))
      : [];
    
    console.log(`  Tools: ${tools.length}`);
    console.log(`  Skills: ${fs.existsSync(path.join(this.workspace, 'skills')) ? 'yes' : 'no'}`);
    console.log(`  Memory: ${fs.existsSync(path.join(this.workspace, 'memory')) ? 'yes' : 'no'}`);
    console.log(`  Projects: ${fs.existsSync(path.join(this.workspace, 'PROJECTS.md')) ? 'yes' : 'no'}`);
  }
}

// CLI
function main() {
  const reloader = new SkillReloader();
  
  const command = process.argv[2];
  
  if (command === 'restore') {
    reloader.restoreFromRemote();
  } else if (command === 'cache') {
    reloader.createCache();
    console.log('✅ Cache created');
  } else if (command === 'status') {
    console.log('Fresh workspace:', reloader.isFreshWorkspace());
    reloader.showStatus();
  } else {
    // Default: ensure continuity
    reloader.ensureContinuity();
  }
}

if (require.main === module) {
  main();
}

module.exports = { SkillReloader };
