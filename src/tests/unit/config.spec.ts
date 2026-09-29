import { ApiContext } from '../../api/context';
import { ConfigFactory } from '../../config';

const ENV_KEYS = [
  'PERMIT_API_KEY',
  'PERMIT_PDP_URL',
  'PERMIT_API_URL',
  'PERMIT_LOG_LEVEL',
  'PERMIT_LOG_LABEL',
  'PERMIT_LOG_JSON',
] as const;

describe('ConfigFactory (unit)', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    // Snapshot then clear the env so each test starts from the bare defaults.
    saved = {};
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  describe('defaults', () => {
    it('returns the documented defaults when no env vars are set', () => {
      const config = ConfigFactory.defaults();

      expect(config.token).toBe('');
      expect(config.pdp).toBe('http://localhost:7766');
      expect(config.apiUrl).toBe('https://api.permit.io');
      expect(config.log).toEqual({ level: 'warn', label: 'Permit.io', json: false });
      expect(config.multiTenancy).toEqual({
        defaultTenant: 'default',
        useDefaultTenantIfEmpty: true,
      });
      expect(config.timeout).toBeUndefined();
      expect(config.throwOnError).toBe(true);
      expect(config.proxyFactsViaPdp).toBe(false);
      expect(config.factsSyncTimeout).toBeNull();
      expect(config.factsSyncTimeoutPolicy).toBeNull();
      expect(config.apiContext).toBeInstanceOf(ApiContext);
      expect(config.axiosInstance).toBeDefined();
    });

    it('reads scalar overrides from the environment', () => {
      process.env.PERMIT_API_KEY = 'env-key';
      process.env.PERMIT_PDP_URL = 'http://pdp.local:7000';
      process.env.PERMIT_API_URL = 'http://api.local:8000';
      process.env.PERMIT_LOG_LEVEL = 'debug';
      process.env.PERMIT_LOG_LABEL = 'MyLabel';

      const config = ConfigFactory.defaults();

      expect(config.token).toBe('env-key');
      expect(config.pdp).toBe('http://pdp.local:7000');
      expect(config.apiUrl).toBe('http://api.local:8000');
      expect(config.log.level).toBe('debug');
      expect(config.log.label).toBe('MyLabel');
    });

    it('parses PERMIT_LOG_JSON into a boolean', () => {
      process.env.PERMIT_LOG_JSON = 'true';
      expect(ConfigFactory.defaults().log.json).toBe(true);

      process.env.PERMIT_LOG_JSON = 'false';
      expect(ConfigFactory.defaults().log.json).toBe(false);
    });

    it('throws when PERMIT_LOG_JSON is not valid JSON', () => {
      // JSON.parse('maybe') throws; defaults() surfaces that rather than guessing.
      process.env.PERMIT_LOG_JSON = 'maybe';

      expect(() => ConfigFactory.defaults()).toThrow();
    });
  });

  describe('build', () => {
    it('returns the defaults when given an empty partial', () => {
      const config = ConfigFactory.build({});

      expect(config.token).toBe('');
      expect(config.pdp).toBe('http://localhost:7766');
      expect(config.log).toEqual({ level: 'warn', label: 'Permit.io', json: false });
    });

    it('overrides top-level fields while leaving the rest at their defaults', () => {
      const config = ConfigFactory.build({ pdp: 'http://pdp:1234', proxyFactsViaPdp: true });

      expect(config.pdp).toBe('http://pdp:1234');
      expect(config.proxyFactsViaPdp).toBe(true);
      expect(config.apiUrl).toBe('https://api.permit.io');
    });

    it('deep-merges a nested log partial without dropping sibling defaults', () => {
      const config = ConfigFactory.build({ log: { level: 'debug' } });

      expect(config.log.level).toBe('debug');
      // Siblings survive the merge (proves a deep merge, not a shallow replace).
      expect(config.log.label).toBe('Permit.io');
      expect(config.log.json).toBe(false);
    });

    it('deep-merges a nested multiTenancy partial without dropping sibling defaults', () => {
      const config = ConfigFactory.build({ multiTenancy: { defaultTenant: 'tenant-x' } });

      expect(config.multiTenancy.defaultTenant).toBe('tenant-x');
      expect(config.multiTenancy.useDefaultTenantIfEmpty).toBe(true);
    });

    it('layers an explicit token over the env-derived default', () => {
      process.env.PERMIT_API_KEY = 'env-key';

      expect(ConfigFactory.build({}).token).toBe('env-key');
      expect(ConfigFactory.build({ token: 'explicit' }).token).toBe('explicit');
    });
  });
});
