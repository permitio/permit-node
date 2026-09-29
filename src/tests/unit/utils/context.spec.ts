import { Context, ContextStore } from '../../../utils/context';

describe('ContextStore (unit)', () => {
  let store: ContextStore;

  beforeEach(() => {
    store = new ContextStore();
  });

  describe('add / getDerivedContext', () => {
    it('overlays the per-query context on top of the base context', () => {
      store.add({ a: 1, b: 2 });

      const derived = store.getDerivedContext({ b: 99, c: 3 });

      // The query value for `b` wins over the base value.
      expect(derived).toEqual({ a: 1, b: 99, c: 3 });
    });

    it('does not mutate the base context when deriving', () => {
      store.add({ a: 1, b: 2 });

      store.getDerivedContext({ b: 99, c: 3 });

      // A fresh derivation must still see the original, unmodified base.
      expect(store.getDerivedContext({})).toEqual({ a: 1, b: 2 });
    });

    it('returns a new object rather than the stored base', () => {
      store.add({ a: 1 });

      const first = store.getDerivedContext({});
      const second = store.getDerivedContext({});

      expect(first).toEqual({ a: 1 });
      expect(first).not.toBe(second);
    });

    it('accumulates and overrides keys across successive add() calls', () => {
      store.add({ a: 1 });
      store.add({ b: 2 });
      store.add({ a: 9 });

      expect(store.getDerivedContext({})).toEqual({ a: 9, b: 2 });
    });

    it('derives a copy of the query context when the base is empty', () => {
      const query: Context = { only: 'me' };

      const derived = store.getDerivedContext(query);

      expect(derived).toEqual({ only: 'me' });
      expect(derived).not.toBe(query);
    });
  });

  describe('registerTransform / transform', () => {
    it('applies registered transforms in registration order', () => {
      store.registerTransform((ctx) => ({ ...ctx, order: [...(ctx.order ?? []), 1] }));
      store.registerTransform((ctx) => ({ ...ctx, order: [...(ctx.order ?? []), 2] }));

      expect(store.transform({})).toEqual({ order: [1, 2] });
    });

    it('feeds each transform the output of the previous one', () => {
      store.registerTransform((ctx) => ({ ...ctx, x: 1 }));
      store.registerTransform((ctx) => ({ ...ctx, y: ctx.x + 1 }));

      expect(store.transform({})).toEqual({ x: 1, y: 2 });
    });

    it('returns a copy of the initial context when no transforms are registered', () => {
      const initial: Context = { a: 1 };

      const result = store.transform(initial);

      expect(result).toEqual({ a: 1 });
      expect(result).not.toBe(initial);
    });

    it('does not mutate the initial context passed to transform', () => {
      const initial: Context = { a: 1 };
      store.registerTransform((ctx) => ({ ...ctx, b: 2 }));

      store.transform(initial);

      expect(initial).toEqual({ a: 1 });
    });
  });
});
