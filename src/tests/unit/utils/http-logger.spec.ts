import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import pino from 'pino';

import { AxiosLoggingInterceptor } from '../../../utils/http-logger';
import { synthAxiosError } from '../../helpers/mock-api';

type RequestUse = AxiosInstance['interceptors']['request']['use'];
type RequestHandlers = Parameters<RequestUse>;

/** A real pino logger that writes nothing, with its debug method spied on. */
function spiedLogger() {
  const logger = pino({ level: 'silent' });
  return { logger, debug: vi.spyOn(logger, 'debug') };
}

/**
 * Installs the logging interceptor and returns the request handlers it registered, so a test can
 * call them with input that a real request flow never produces.
 */
function installAndCaptureRequestHandlers(
  instance: AxiosInstance,
  logger: pino.Logger,
): RequestHandlers {
  const use = vi.spyOn(instance.interceptors.request, 'use');
  AxiosLoggingInterceptor.setupInterceptor(instance, logger);
  expect(use).toHaveBeenCalledTimes(1);
  const handlers = use.mock.calls[0];
  assert(handlers, 'Expected the logging interceptor to register request handlers');
  return handlers;
}

describe('AxiosLoggingInterceptor (unit)', () => {
  it('logs the outgoing request and the response at debug level', async () => {
    const instance = axios.create();
    instance.defaults.adapter = async (
      config: InternalAxiosRequestConfig,
    ): Promise<AxiosResponse> => ({
      data: { ok: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });
    const { logger, debug } = spiedLogger();
    AxiosLoggingInterceptor.setupInterceptor(instance, logger);

    await instance.get('http://example.test/foo');

    expect(debug).toHaveBeenCalledWith('Sending HTTP request: GET http://example.test/foo');
    expect(debug).toHaveBeenCalledWith(
      'Received HTTP response: GET http://example.test/foo, status: 200',
    );
  });

  it('initializes request.headers when the outgoing config has none', async () => {
    const { logger, debug } = spiedLogger();
    const [fulfilled] = installAndCaptureRequestHandlers(axios.create(), logger);
    assert(fulfilled, 'Expected a request fulfilled handler');

    const config = { method: 'get', url: '/x' } as unknown as InternalAxiosRequestConfig;
    const result = await fulfilled(config);

    expect(result.headers).toEqual({});
    expect(debug).toHaveBeenCalledWith('Sending HTTP request: GET /x');
  });

  // The request-interceptor's `rejected` handler only fires when an earlier
  // interceptor in the chain rejects. With a single interceptor installed there
  // is no real request flow that reaches it, so we invoke it directly.
  it('propagates request errors through the rejection handler', async () => {
    const { logger } = spiedLogger();
    const [, rejected] = installAndCaptureRequestHandlers(axios.create(), logger);
    assert(rejected, 'Expected a request rejected handler');

    const boom = new Error('request boom');

    await expect(rejected(boom)).rejects.toBe(boom);
  });

  it('propagates response errors through the rejection handler on a failed request', async () => {
    const instance = axios.create();
    const error = synthAxiosError(500, { message: 'boom' });
    instance.defaults.adapter = async () => {
      throw error;
    };
    const { logger, debug } = spiedLogger();
    AxiosLoggingInterceptor.setupInterceptor(instance, logger);

    await expect(instance.get('http://example.test/foo')).rejects.toBe(error);
    // The request interceptor still logged the outgoing request before the adapter rejected.
    expect(debug).toHaveBeenCalledWith('Sending HTTP request: GET http://example.test/foo');
    // The response-error branch only re-rejects; it does not emit a response log.
    expect(debug).not.toHaveBeenCalledWith(expect.stringContaining('Received HTTP response'));
  });
});
