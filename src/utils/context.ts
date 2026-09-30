export interface Context {
  [id: string]: any;
}

export interface CheckConfig {
  /**
   * Use OPA for check(); discovery/filtering reject true regardless of error policy.
   * Existing bulk/permission queries retain their configured throw/deny policy.
   */
  useOpa?: boolean;
  /** Request timeout in milliseconds; zero disables the timeout for this call. */
  timeout?: number;
  throwOnError?: boolean;
}

/** Options for a permission query, including its request-specific context. */
export interface GetUserPermissionsConfig extends CheckConfig {
  context?: Context;
}

/**
 * Stores global context merged into each authorization query.
 */
export class ContextStore {
  private baseContext: Context = {}; // cross-query context (global context)

  /**
   * add context to the base context
   */
  public add(context: Context): void {
    this.baseContext = { ...this.baseContext, ...context };
  }

  /**
   * merges the global context (this.context) with the context
   * provided for this specific query (context). the specific
   * context overrides the base (global) context.
   */
  public getDerivedContext(context: Context): Context {
    return { ...this.baseContext, ...context };
  }
}
