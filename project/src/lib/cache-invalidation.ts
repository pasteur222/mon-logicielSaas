/**
 * Smart Cache Invalidation System
 * Implements dependency tracking and intelligent cache management
 */

export interface CacheEntry<T = any> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number;
  dependencies: string[];
  tags: string[];
  metadata?: Record<string, any>;
}

export interface CacheDependency {
  key: string;
  dependents: Set<string>;
  lastModified: number;
}

export interface InvalidationRule {
  pattern: string;
  dependencies: string[];
  ttl?: number;
  tags?: string[];
}

class SmartCacheManager {
  private cache = new Map<string, CacheEntry>();
  private dependencies = new Map<string, CacheDependency>();
  private invalidationRules: InvalidationRule[] = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.setupDefaultRules();
    this.startCleanupProcess();
  }

  /**
   * Set cache entry with dependencies
   */
  set<T>(
    key: string,
    data: T,
    ttl: number = 300000, // 5 minutes default
    dependencies: string[] = [],
    tags: string[] = [],
    metadata?: Record<string, any>
  ): void {
    const entry: CacheEntry<T> = {
      key,
      data,
      timestamp: Date.now(),
      ttl,
      dependencies,
      tags,
      metadata
    };

    this.cache.set(key, entry);

    // Register dependencies
    for (const dep of dependencies) {
      if (!this.dependencies.has(dep)) {
        this.dependencies.set(dep, {
          key: dep,
          dependents: new Set(),
          lastModified: Date.now()
        });
      }
      this.dependencies.get(dep)!.dependents.add(key);
    }

    console.log(`💾 [CACHE] Entry cached:`, {
      key,
      ttl,
      dependencies,
      tags
    });
  }

  /**
   * Get cache entry if valid
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }

    // Check TTL expiration
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.delete(key);
      return null;
    }

    // Check dependency freshness
    for (const dep of entry.dependencies) {
      const dependency = this.dependencies.get(dep);
      if (dependency && dependency.lastModified > entry.timestamp) {
        console.log(`🔄 [CACHE] Entry invalidated by dependency:`, {
          key,
          dependency: dep,
          depModified: new Date(dependency.lastModified).toISOString(),
          entryCreated: new Date(entry.timestamp).toISOString()
        });
        this.delete(key);
        return null;
      }
    }

    console.log(`✅ [CACHE] Cache hit:`, { key });
    return entry.data;
  }

  /**
   * Delete cache entry and cleanup dependencies
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    // Remove from dependency tracking
    for (const dep of entry.dependencies) {
      const dependency = this.dependencies.get(dep);
      if (dependency) {
        dependency.dependents.delete(key);
        // Clean up empty dependencies
        if (dependency.dependents.size === 0) {
          this.dependencies.delete(dep);
        }
      }
    }

    this.cache.delete(key);
    console.log(`🗑️ [CACHE] Entry deleted:`, { key });
    return true;
  }

  /**
   * Invalidate cache entries by dependency
   */
  invalidateByDependency(dependencyKey: string): number {
    const dependency = this.dependencies.get(dependencyKey);
    if (!dependency) {
      return 0;
    }

    const dependents = Array.from(dependency.dependents);
    let invalidatedCount = 0;

    for (const dependent of dependents) {
      if (this.delete(dependent)) {
        invalidatedCount++;
      }
    }

    // Update dependency modification time
    dependency.lastModified = Date.now();

    console.log(`🔄 [CACHE] Invalidated by dependency:`, {
      dependency: dependencyKey,
      invalidatedCount,
      dependents
    });

    return invalidatedCount;
  }

  /**
   * Invalidate cache entries by tag
   */
  invalidateByTag(tag: string): number {
    let invalidatedCount = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.includes(tag)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      if (this.delete(key)) {
        invalidatedCount++;
      }
    }

    console.log(`🏷️ [CACHE] Invalidated by tag:`, {
      tag,
      invalidatedCount,
      keys: keysToDelete
    });

    return invalidatedCount;
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidateByPattern(pattern: string): number {
    const regex = new RegExp(pattern);
    let invalidatedCount = 0;
    const keysToDelete: string[] = [];

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      if (this.delete(key)) {
        invalidatedCount++;
      }
    }

    console.log(`🔍 [CACHE] Invalidated by pattern:`, {
      pattern,
      invalidatedCount,
      keys: keysToDelete
    });

    return invalidatedCount;
  }

  /**
   * Smart invalidation based on data changes
   */
  invalidateSmartly(
    changeType: 'create' | 'update' | 'delete',
    entityType: string,
    entityId: string,
    metadata?: Record<string, any>
  ): void {
    console.log(`🧠 [CACHE] Smart invalidation triggered:`, {
      changeType,
      entityType,
      entityId,
      metadata
    });

    // Apply invalidation rules
    for (const rule of this.invalidationRules) {
      const rulePattern = rule.pattern
        .replace('{entityType}', entityType)
        .replace('{entityId}', entityId)
        .replace('{changeType}', changeType);

      this.invalidateByPattern(rulePattern);

      // Invalidate dependencies
      for (const dep of rule.dependencies) {
        const depKey = dep
          .replace('{entityType}', entityType)
          .replace('{entityId}', entityId);
        this.invalidateByDependency(depKey);
      }

      // Invalidate tags
      if (rule.tags) {
        for (const tag of rule.tags) {
          const tagName = tag
            .replace('{entityType}', entityType)
            .replace('{entityId}', entityId);
          this.invalidateByTag(tagName);
        }
      }
    }

    // Entity-specific invalidation logic
    this.applyEntitySpecificInvalidation(changeType, entityType, entityId, metadata);
  }

  /**
   * Apply entity-specific invalidation logic
   */
  private applyEntitySpecificInvalidation(
    changeType: string,
    entityType: string,
    entityId: string,
    metadata?: Record<string, any>
  ): void {
    switch (entityType) {
      case 'quiz':
        this.invalidateByPattern(`quiz:${entityId}:.*`);
        this.invalidateByTag(`quiz-${entityId}`);
        if (changeType === 'update') {
          this.invalidateByDependency(`quiz-questions:${entityId}`);
        }
        break;

      case 'quiz_session':
        this.invalidateByPattern(`session:${entityId}:.*`);
        this.invalidateByTag(`session-${entityId}`);
        if (metadata?.userId) {
          this.invalidateByPattern(`user:${metadata.userId}:sessions`);
        }
        break;

      case 'whatsapp_message':
        if (metadata?.phoneNumber) {
          this.invalidateByPattern(`messages:${metadata.phoneNumber}:.*`);
          this.invalidateByDependency(`conversation:${metadata.phoneNumber}`);
        }
        break;

      case 'auto_reply_rule':
        this.invalidateByTag('auto-reply-rules');
        if (metadata?.userId) {
          this.invalidateByPattern(`rules:${metadata.userId}:.*`);
        }
        break;

      case 'user':
        this.invalidateByPattern(`user:${entityId}:.*`);
        this.invalidateByTag(`user-${entityId}`);
        break;
    }
  }

  /**
   * Setup default invalidation rules
   */
  private setupDefaultRules(): void {
    this.invalidationRules = [
      // Quiz-related rules
      {
        pattern: 'quiz:{entityId}:.*',
        dependencies: ['quiz-questions:{entityId}', 'quiz-settings:{entityId}'],
        tags: ['quiz-{entityId}']
      },
      {
        pattern: 'quiz-list:.*',
        dependencies: ['quiz-metadata'],
        tags: ['quiz-list']
      },

      // Session-related rules
      {
        pattern: 'session:{entityId}:.*',
        dependencies: ['session-state:{entityId}'],
        tags: ['session-{entityId}']
      },
      {
        pattern: 'user-sessions:.*',
        dependencies: ['user-session-list'],
        tags: ['user-sessions']
      },

      // Message-related rules
      {
        pattern: 'messages:.*',
        dependencies: ['conversation-context'],
        tags: ['messages']
      },
      {
        pattern: 'conversation:.*',
        dependencies: ['message-history'],
        tags: ['conversations']
      },

      // Auto-reply rules
      {
        pattern: 'auto-reply:.*',
        dependencies: ['reply-rules'],
        tags: ['auto-reply']
      }
    ];
  }

  /**
   * Start cleanup process for expired entries
   */
  private startCleanupProcess(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, 60000); // Run every minute
  }

  /**
   * Cleanup expired cache entries
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      if (this.delete(key)) {
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 [CACHE] Cleaned up expired entries:`, {
        cleanedCount,
        totalEntries: this.cache.size
      });
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    totalDependencies: number;
    memoryUsage: number;
    hitRate: number;
  } {
    // Calculate approximate memory usage
    let memoryUsage = 0;
    for (const entry of this.cache.values()) {
      memoryUsage += JSON.stringify(entry).length * 2; // Rough estimate
    }

    return {
      totalEntries: this.cache.size,
      totalDependencies: this.dependencies.size,
      memoryUsage,
      hitRate: 0 // Would need hit/miss tracking for accurate calculation
    };
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.dependencies.clear();
    console.log('🧹 [CACHE] All entries cleared');
  }

  /**
   * Stop cleanup process
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// Export singleton instance
export const cacheManager = new SmartCacheManager();

/**
 * Decorator for caching function results
 */
export function cached(
  keyGenerator: (...args: any[]) => string,
  ttl: number = 300000,
  dependencies: string[] = [],
  tags: string[] = []
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const cacheKey = keyGenerator(...args);
      
      // Try to get from cache
      const cachedResult = cacheManager.get(cacheKey);
      if (cachedResult !== null) {
        return cachedResult;
      }

      // Execute method and cache result
      const result = await method.apply(this, args);
      cacheManager.set(cacheKey, result, ttl, dependencies, tags);
      
      return result;
    };
  };
}

/**
 * Cache helper functions for common patterns
 */
export const CacheHelpers = {
  /**
   * Cache quiz data
   */
  cacheQuiz: (quizId: string, data: any, ttl: number = 600000) => {
    cacheManager.set(
      `quiz:${quizId}:data`,
      data,
      ttl,
      [`quiz-questions:${quizId}`, `quiz-settings:${quizId}`],
      [`quiz-${quizId}`, 'quiz-data']
    );
  },

  /**
   * Cache session data
   */
  cacheSession: (sessionId: string, data: any, ttl: number = 300000) => {
    cacheManager.set(
      `session:${sessionId}:data`,
      data,
      ttl,
      [`session-state:${sessionId}`],
      [`session-${sessionId}`, 'session-data']
    );
  },

  /**
   * Cache conversation context
   */
  cacheConversation: (phoneNumber: string, data: any, ttl: number = 1800000) => {
    cacheManager.set(
      `conversation:${phoneNumber}:context`,
      data,
      ttl,
      [`message-history:${phoneNumber}`],
      [`conversation-${phoneNumber}`, 'conversations']
    );
  },

  /**
   * Cache auto-reply rules
   */
  cacheAutoReplyRules: (userId: string, data: any, ttl: number = 900000) => {
    cacheManager.set(
      `auto-reply:${userId}:rules`,
      data,
      ttl,
      [`reply-rules:${userId}`],
      [`auto-reply-${userId}`, 'auto-reply']
    );
  },

  /**
   * Invalidate quiz-related caches
   */
  invalidateQuiz: (quizId: string) => {
    cacheManager.invalidateSmartly('update', 'quiz', quizId);
  },

  /**
   * Invalidate session-related caches
   */
  invalidateSession: (sessionId: string, userId?: string) => {
    cacheManager.invalidateSmartly('update', 'quiz_session', sessionId, { userId });
  },

  /**
   * Invalidate conversation-related caches
   */
  invalidateConversation: (phoneNumber: string) => {
    cacheManager.invalidateSmartly('update', 'whatsapp_message', 'new', { phoneNumber });
  },

  /**
   * Invalidate auto-reply rule caches
   */
  invalidateAutoReplyRules: (userId: string) => {
    cacheManager.invalidateSmartly('update', 'auto_reply_rule', 'rules', { userId });
  }
};