/**
 * Memory Monitor - Add this to production for real-time memory tracking
 * 
 * Usage: Import and call in src/index.ts after app starts
 */

interface MemoryStats {
  timestamp: string;
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

class MemoryMonitor {
  private stats: MemoryStats[] = [];
  private interval: Timer | null = null;
  private maxSamples = 60; // Keep last 60 samples
  
  start(intervalMs: number = 60000) {
    console.log(`📊 Memory Monitor started (sampling every ${intervalMs / 1000}s)`);
    
    this.interval = setInterval(() => {
      this.collect();
    }, intervalMs);
  }
  
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      console.log("📊 Memory Monitor stopped");
    }
  }
  
  private collect() {
    const usage = process.memoryUsage();
    const stat: MemoryStats = {
      timestamp: new Date().toISOString(),
      rss: usage.rss,
      heapTotal: usage.heapTotal,
      heapUsed: usage.heapUsed,
      external: usage.external,
      arrayBuffers: usage.arrayBuffers || 0,
    };
    
    this.stats.push(stat);
    
    // Keep only last N samples
    if (this.stats.length > this.maxSamples) {
      this.stats.shift();
    }
    
    // Log current stats
    this.logCurrent(stat);
    
    // Check for anomalies
    this.checkAnomalies(stat);
  }
  
  private logCurrent(stat: MemoryStats) {
    console.log(`[Memory] ${stat.timestamp}`);
    console.log(`  RSS: ${this.formatBytes(stat.rss)} | Heap: ${this.formatBytes(stat.heapUsed)}/${this.formatBytes(stat.heapTotal)}`);
  }
  
  private checkAnomalies(stat: MemoryStats) {
    const heapUsedMB = stat.heapUsed / 1024 / 1024;
    const rssMB = stat.rss / 1024 / 1024;
    
    // Alert if memory is high
    if (heapUsedMB > 350) {
      console.warn(`⚠️  HIGH HEAP USAGE: ${this.formatBytes(stat.heapUsed)}`);
    }
    
    if (rssMB > 500) {
      console.warn(`⚠️  HIGH RSS: ${this.formatBytes(stat.rss)}`);
    }
    
    // Check growth rate
    if (this.stats.length >= 10) {
      const tenMinutesAgo = this.stats[this.stats.length - 10];
      const growth = stat.heapUsed - tenMinutesAgo.heapUsed;
      const growthMB = growth / 1024 / 1024;
      
      if (growthMB > 50) {
        console.warn(`⚠️  RAPID MEMORY GROWTH: +${this.formatBytes(growth)} in 10 samples`);
      }
    }
  }
  
  getStats() {
    return {
      current: this.stats[this.stats.length - 1],
      history: this.stats,
      summary: this.getSummary(),
    };
  }
  
  private getSummary() {
    if (this.stats.length === 0) return null;
    
    const heapUsed = this.stats.map(s => s.heapUsed);
    const rss = this.stats.map(s => s.rss);
    
    return {
      heapUsed: {
        min: Math.min(...heapUsed),
        max: Math.max(...heapUsed),
        avg: heapUsed.reduce((a, b) => a + b, 0) / heapUsed.length,
        current: heapUsed[heapUsed.length - 1],
      },
      rss: {
        min: Math.min(...rss),
        max: Math.max(...rss),
        avg: rss.reduce((a, b) => a + b, 0) / rss.length,
        current: rss[rss.length - 1],
      },
      samples: this.stats.length,
    };
  }
  
  private formatBytes(bytes: number): string {
    return `${Math.round(bytes / 1024 / 1024)}MB`;
  }
  
  // HTTP endpoint data (for monitoring dashboards)
  getMetricsJSON() {
    const summary = this.getSummary();
    const current = this.stats[this.stats.length - 1];
    
    return {
      timestamp: current?.timestamp || new Date().toISOString(),
      memory: {
        rss_bytes: current?.rss || 0,
        heap_total_bytes: current?.heapTotal || 0,
        heap_used_bytes: current?.heapUsed || 0,
        external_bytes: current?.external || 0,
      },
      summary: summary ? {
        heap_used_mb: {
          min: Math.round(summary.heapUsed.min / 1024 / 1024),
          max: Math.round(summary.heapUsed.max / 1024 / 1024),
          avg: Math.round(summary.heapUsed.avg / 1024 / 1024),
        },
        rss_mb: {
          min: Math.round(summary.rss.min / 1024 / 1024),
          max: Math.round(summary.rss.max / 1024 / 1024),
          avg: Math.round(summary.rss.avg / 1024 / 1024),
        },
      } : null,
    };
  }
}

// Export singleton instance
export const memoryMonitor = new MemoryMonitor();

// Add HTTP endpoint helper (use in index.ts)
export function setupMemoryEndpoint(app: any) {
  app.get("/metrics/memory", () => {
    return memoryMonitor.getMetricsJSON();
  });
  
  console.log("📊 Memory metrics endpoint: GET /metrics/memory");
}
