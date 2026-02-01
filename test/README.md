# Test Suite

This directory contains tests for the CalendarLHU Backend application, with a focus on verifying memory leak fixes.

## Test Files

### 1. smoke.test.ts
Basic smoke tests to ensure the application loads without errors.

**Coverage:**
- Module imports (controllers, services, utilities)
- Environment configuration
- Crypto availability

**Run:**
```bash
bun test test/smoke.test.ts
```

---

### 2. memory-leak-fixes.test.ts
Comprehensive tests for memory leak fixes implemented to reduce memory usage from ~700MB to ~200-250MB.

**Coverage:**
- MessageBufferService cleanup verification
- NonceStore periodic cleanup
- LRUCache size limits and TTL expiration
- Mongoose connection pool configuration
- Memory usage integration tests

**Run:**
```bash
bun test test/memory-leak-fixes.test.ts
```

---

### 3. memory-profiler.ts
Manual memory profiling script to verify memory behavior under various operations.

**Features:**
- LRU Cache memory usage testing
- Nonce store cleanup verification
- Repeated operations leak detection
- Memory growth analysis

**Run:**
```bash
bun run test/memory-profiler.ts
```

**Expected Output:**
- Memory usage before/after each test
- Growth analysis
- Pass/Fail indicators for leak detection

---

## Running All Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test test/<filename>

# Run with verbose output
bun test --verbose
```

## Test Results

Current status: **✅ 15/15 tests passing**

```
test/smoke.test.ts                    6 passed
test/memory-leak-fixes.test.ts        9 passed
----------------------------------------
Total:                               15 passed
```

## Memory Leak Fixes Verified

The test suite verifies the following fixes:

1. ✅ **MessageBufferService** - Maps cleaned up after flush
2. ✅ **NonceStore** - Expired nonces automatically cleaned every 5 minutes
3. ✅ **UserCache** - Optimized capacity (250) and TTL (1 hour)
4. ✅ **Mongoose** - Connection pool properly configured
5. ✅ **Graceful Shutdown** - Resources cleaned up on exit

## Adding New Tests

1. Create a new file: `test/your-test.test.ts`
2. Import from `bun:test`:
   ```typescript
   import { describe, test, expect } from "bun:test";
   ```
3. Write your tests:
   ```typescript
   describe("My Feature", () => {
     test("should do something", () => {
       expect(true).toBe(true);
     });
   });
   ```
4. Run: `bun test test/your-test.test.ts`

## Continuous Integration

These tests should be run:
- Before every commit
- In CI/CD pipeline
- After deployment to verify stability

## Memory Monitoring in Production

For production monitoring, use the memory monitor utility:

```typescript
// In src/index.ts
import { memoryMonitor, setupMemoryEndpoint } from "./utils/memoryMonitor";

// Start monitoring
memoryMonitor.start(60000); // Sample every 60 seconds

// Add metrics endpoint
setupMemoryEndpoint(app);
```

Then access metrics at: `GET /metrics/memory`

## Documentation

For detailed information about the memory leak fixes, see:
- [MEMORY_LEAK_ANALYSIS.md](../MEMORY_LEAK_ANALYSIS.md) - Initial analysis
- [MEMORY_LEAK_FIXES_SUMMARY.md](../MEMORY_LEAK_FIXES_SUMMARY.md) - Fix summary
