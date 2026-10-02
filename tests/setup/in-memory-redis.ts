/**
 * Minimal in-memory stand-in for ioredis, used by integration tests in place
 * of a real Redis server. Implements only the commands used by the app:
 *
 * - auth.service: setex / get / del (admin sessions)
 * - @fastify/rate-limit: incr / expire / pexpire / ttl / pttl / get
 */
export class InMemoryRedis {
  private store = new Map<string, string>();
  private expiries = new Map<string, number>(); // absolute expiry in ms

  private isLive(key: string): boolean {
    const expiry = this.expiries.get(key);
    if (expiry !== undefined && expiry <= Date.now()) {
      this.store.delete(key);
      this.expiries.delete(key);
      return false;
    }
    return this.store.has(key);
  }

  async get(key: string): Promise<string | null> {
    return this.isLive(key) ? this.store.get(key)! : null;
  }

  async set(key: string, value: string, ...args: unknown[]): Promise<"OK"> {
    const mode = String(args[0] ?? "").toUpperCase();
    if (mode === "PX" && args.length >= 2) {
      this.expiries.set(key, Date.now() + Number(args[1]));
    } else if (mode === "EX" && args.length >= 2) {
      this.expiries.set(key, Date.now() + Number(args[1]) * 1000);
    } else {
      this.expiries.delete(key);
    }
    this.store.set(key, value);
    return "OK";
  }

  async setex(key: string, seconds: number, value: string): Promise<"OK"> {
    this.expiries.set(key, Date.now() + seconds * 1000);
    this.store.set(key, value);
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    let removed = 0;
    for (const key of keys) {
      if (this.store.delete(key)) removed += 1;
      this.expiries.delete(key);
    }
    return removed;
  }

  async incr(key: string): Promise<number> {
    const current = parseInt((await this.get(key)) || "0", 10) + 1;
    // Any existing expiry is intentionally preserved so rate-limit counters
    // keep their sliding window across increments.
    this.store.set(key, String(current));
    return current;
  }

  async expire(key: string, seconds: number): Promise<number> {
    if (!this.isLive(key)) return 0;
    this.expiries.set(key, Date.now() + seconds * 1000);
    return 1;
  }

  async pexpire(key: string, milliseconds: number): Promise<number> {
    if (!this.isLive(key)) return 0;
    this.expiries.set(key, Date.now() + milliseconds);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    if (!this.isLive(key)) return -2;
    const expiry = this.expiries.get(key);
    return expiry === undefined ? -1 : Math.ceil((expiry - Date.now()) / 1000);
  }

  async pttl(key: string): Promise<number> {
    if (!this.isLive(key)) return -2;
    const expiry = this.expiries.get(key);
    return expiry === undefined ? -1 : expiry - Date.now();
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp("^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
    return Array.from(this.store.keys()).filter(
      (key) => regex.test(key) && this.isLive(key)
    );
  }

  /** ioredis is an EventEmitter; consumers may attach error handlers. */
  on(): this {
    return this;
  }

  once(): this {
    return this;
  }

  /**
   * ioredis custom-command registration. @fastify/rate-limit's RedisStore
   * defines two Lua commands ("rateLimit" and "rateLimitRead"); this fake
   * implements their exact semantics without a Lua interpreter.
   */
  defineCommand(name: string): void {
    if (name === "rateLimit") {
      (this as unknown as Record<string, unknown>).rateLimit = this.rateLimitCommand.bind(this);
    } else if (name === "rateLimitRead") {
      (this as unknown as Record<string, unknown>).rateLimitRead =
        this.rateLimitReadCommand.bind(this);
    } else {
      throw new Error(`InMemoryRedis: unsupported custom command "${name}"`);
    }
  }

  private flag(value: unknown): boolean {
    return value === true || value === "true";
  }

  private rateLimitCommand(...args: unknown[]): void {
    const cb = args[args.length - 1] as (err: Error | null, result?: unknown) => void;
    const [key, timeWindow, max, continueExceeding, exponentialBackoff] = args as [
      string,
      number,
      number,
      unknown,
      unknown,
    ];
    try {
      const current = parseInt(this.store.get(key) || "0", 10) + 1;
      this.store.set(key, String(current));

      let ttlMs: number;
      if (current === 1 || (this.flag(continueExceeding) && current > max)) {
        ttlMs = Number(timeWindow);
        this.expiries.set(key, Date.now() + ttlMs);
      } else if (this.flag(exponentialBackoff) && current > max) {
        const backoffExponent = current - max - 1;
        ttlMs = Math.min(Number(timeWindow) * 2 ** backoffExponent, Number.MAX_SAFE_INTEGER);
        this.expiries.set(key, Date.now() + ttlMs);
      } else {
        const pttl = this.expiries.has(key) ? this.expiries.get(key)! - Date.now() : -1;
        ttlMs = pttl < 0 ? 0 : pttl;
      }
      cb(null, { current, ttl: ttlMs });
    } catch (err: any) {
      cb(err, undefined);
    }
  }

  private rateLimitReadCommand(...args: unknown[]): void {
    const cb = args[args.length - 1] as (err: Error | null, result?: unknown) => void;
    const key = args[0] as string;
    try {
      const current = this.store.has(key) ? parseInt(this.store.get(key) || "0", 10) : 0;
      const expiry = this.expiries.get(key);
      const ttl = expiry === undefined || expiry <= Date.now() ? 0 : expiry - Date.now();
      cb(null, { current, ttl });
    } catch (err: any) {
      cb(err, undefined);
    }
  }

  async quit(): Promise<"OK"> {
    this.store.clear();
    this.expiries.clear();
    return "OK";
  }

  async disconnect(): Promise<void> {
    this.store.clear();
    this.expiries.clear();
  }
}
