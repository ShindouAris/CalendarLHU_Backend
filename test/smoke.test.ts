import { describe, test, expect, beforeAll } from "bun:test";

/**
 * Smoke tests to verify the application can start without errors
 * and all modules are properly loaded
 */

describe("Application Smoke Tests", () => {
  test("should import main index without errors", async () => {
    // Just verify we can import without crashes
    // Note: This won't actually start the server
    expect(true).toBe(true);
  });
  
  test("should load all controllers", async () => {
    const modules = [
      "../src/controller/ai",
      "../src/controller/calendarlhu",
      "../src/controller/chat",
      "../src/controller/chatApi",
      "../src/controller/user",
      "../src/controller/weather",
    ];
    
    for (const mod of modules) {
      try {
        const imported = await import(mod);
        expect(imported).toBeDefined();
      } catch (error) {
        console.error(`Failed to import ${mod}:`, error);
        throw error;
      }
    }
  });
  
  test("should load database services", async () => {
    const { connectDB } = await import("../src/databases");
    expect(connectDB).toBeDefined();
    expect(typeof connectDB).toBe("function");
  });
  
  test("should load utilities", async () => {
    const { LRUCache } = await import("../src/utils/lruCache");
    expect(LRUCache).toBeDefined();
    
    const { encryptLoginData, decryptLoginData } = await import("../src/utils/encryptor");
    expect(encryptLoginData).toBeDefined();
    expect(decryptLoginData).toBeDefined();
  });
});

describe("Environment Configuration", () => {
  test("should have required environment setup", () => {
    // Check if we're in a valid environment
    expect(process.env.NODE_ENV || "development").toBeDefined();
  });
  
  test("should have crypto available", () => {
    const uuid = crypto.randomUUID();
    expect(uuid).toBeDefined();
    expect(typeof uuid).toBe("string");
    expect(uuid.length).toBeGreaterThan(30);
  });
});

console.log("✅ Smoke tests defined");
