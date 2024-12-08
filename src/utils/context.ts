export interface Context {
  [id: string]: any;
}

export interface CheckConfig {
  useOpa?: boolean;
  timeout?: number;
  throwOnError?: boolean;
}

export interface ContextTransform {
  (context: Context): Context;
}

/**
 * Store for contexted passed as part of check() queries
 */
export class ContextStore {
  private baseContext: Context = {}; // cross-query context (global context)
  private transforms: ContextTransform[] = [];

  /**
   * add context to the base context
   */
  public add(context: Context): void {
    this.baseContext = Object.assign(this.baseContext, context);
  }

  public registerTransform(transform: ContextTransform): void {
    this.transforms.push(transform);
  }

  /**
   * merges the global context (this.context) with the context
   * provided for this specific query (context). the specific
   * context overrides the base (global) context.
   */
  public getDerivedContext(context: Context): Context {
    return Object.assign({}, this.baseContext, context);
  }

  public transform(initialContext: Context): Context {
    let context = { ...initialContext };
    for (const transform of this.transforms) {
      context = transform(context);
    }
    return context;
  }
}
