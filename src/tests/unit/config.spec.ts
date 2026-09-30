import { ApiContext } from '#src/api/context';
import { ConfigFactory } from '#src/config';
import { Permit } from '#src/index';

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
      expect(config.log).toEqual({ level: 'warn', label: 'Permit.io', json: true });
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
      process.env['PERMIT_API_KEY'] = 'env-key';
      process.env['PERMIT_PDP_URL'] = 'http://pdp.local:7000';
      process.env['PERMIT_API_URL'] = 'http://api.local:8000';
      process.env['PERMIT_LOG_LEVEL'] = 'debug';
      process.env['PERMIT_LOG_LABEL'] = 'MyLabel';

      const config = ConfigFactory.defaults();

      expect(config.token).toBe('env-key');
      expect(config.pdp).toBe('http://pdp.local:7000');
      expect(config.apiUrl).toBe('http://api.local:8000');
      expect(config.log.level).toBe('debug');
      expect(config.log.label).toBe('MyLabel');
    });
  });

  describe('build', () => {
    it('returns the defaults when given an empty partial', () => {
      const config = ConfigFactory.build({});

      expect(config.token).toBe('');
      expect(config.pdp).toBe('http://localhost:7766');
      expect(config.log).toEqual({ level: 'warn', label: 'Permit.io', json: true });
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
      expect(config.log.json).toBe(true);
    });

    it('deep-merges a nested multiTenancy partial without dropping sibling defaults', () => {
      const config = ConfigFactory.build({ multiTenancy: { defaultTenant: 'tenant-x' } });

      expect(config.multiTenancy.defaultTenant).toBe('tenant-x');
      expect(config.multiTenancy.useDefaultTenantIfEmpty).toBe(true);
    });

    it('layers an explicit token over the env-derived default', () => {
      process.env['PERMIT_API_KEY'] = 'env-key';

      expect(ConfigFactory.build({}).token).toBe('env-key');
      expect(ConfigFactory.build({ token: 'explicit' }).token).toBe('explicit');
    });
  });

  describe('PERMIT_LOG_JSON', () => {
    function setLogJsonEnv(value: string | undefined): void {
      if (value === undefined) {
        delete process.env['PERMIT_LOG_JSON'];
      } else {
        process.env['PERMIT_LOG_JSON'] = value;
      }
    }

    function envLabel(value: string | undefined): string {
      return value === undefined ? 'unset' : JSON.stringify(value);
    }

    const envCases: [string | undefined, boolean][] = [
      [undefined, true],
      ['true', true],
      ['TRUE', true],
      [' True ', true],
      ['false', false],
      ['False', false],
      [' FALSE\n', false],
      ['yes', true],
      ['no', true],
      ['', true],
      ['0', true],
      ['{', true],
    ];
    for (const [value, expected] of envCases) {
      it(`PER-16493: PERMIT_LOG_JSON=${envLabel(value)} gives log.json ${expected}`, () => {
        setLogJsonEnv(value);
        expect(ConfigFactory.build({}).log.json).toBe(expected);
      });
    }

    const overrideCases: [string | undefined, boolean][] = [
      [undefined, false],
      ['true', false],
      ['false', true],
      ['FALSE', true],
      ['yes', false],
      ['', true],
    ];
    for (const [value, json] of overrideCases) {
      it(`PER-16493: log.json ${json} overrides PERMIT_LOG_JSON=${envLabel(value)}`, () => {
        setLogJsonEnv(value);
        expect(ConfigFactory.build({ log: { json } }).log.json).toBe(json);
      });
    }

    it('PER-16493: an unrecognized PERMIT_LOG_JSON does not break new Permit()', () => {
      setLogJsonEnv('yes');
      const permit = new Permit({ token: 'test-token', log: { level: 'silent', json: false } });
      expect(permit.config.log.json).toBe(false);
    });
  });
});
