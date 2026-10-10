import { type Context, ContextStore } from '#src/utils/context';

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
});
