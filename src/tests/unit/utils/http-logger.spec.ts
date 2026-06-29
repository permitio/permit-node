import axios, { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

import { AxiosLoggingInterceptor } from '../../../utils/http-logger';
import { fakeLogger, synthAxiosError } from '../../helpers/mock-api';

type RequestHandler = {
  fulfilled: (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig;
  rejected: (error: unknown) => Promise<never>;
};

function requestHandler(instance: ReturnType<typeof axios.create>): RequestHandler {
  return (instance.interceptors.request as any).handlers[0];
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
    const logger = fakeLogger();
    AxiosLoggingInterceptor.setupInterceptor(instance, logger as any);

    await instance.get('http://example.test/foo');

    expect(logger.debug).toHaveBeenCalledWith('Sending HTTP request: GET http://example.test/foo');
    expect(logger.debug).toHaveBeenCalledWith(
      'Received HTTP response: GET http://example.test/foo, status: 200',
    );
  });

  it('initializes request.headers when the outgoing config has none', () => {
    const instance = axios.create();
    const logger = fakeLogger();
    AxiosLoggingInterceptor.setupInterceptor(instance, logger as any);

    const config = { method: 'get', url: '/x' } as unknown as InternalAxiosRequestConfig;
    const result = requestHandler(instance).fulfilled(config);

    expect(result.headers).toEqual({});
    expect(logger.debug).toHaveBeenCalledWith('Sending HTTP request: GET /x');
  });

  // The request-interceptor's `rejected` handler only fires when an earlier
  // interceptor in the chain rejects. With a single interceptor installed there
  // is no real request flow that reaches it, so we invoke it directly.
  it('propagates request errors through the rejection handler', async () => {
    const instance = axios.create();
    const logger = fakeLogger();
    AxiosLoggingInterceptor.setupInterceptor(instance, logger as any);

    const boom = new Error('request boom');

    await expect(requestHandler(instance).rejected(boom)).rejects.toBe(boom);
  });

  it('propagates response errors through the rejection handler on a failed request', async () => {
    const instance = axios.create();
    const error = synthAxiosError(500, { message: 'boom' });
    instance.defaults.adapter = async () => {
      throw error;
    };
    const logger = fakeLogger();
    AxiosLoggingInterceptor.setupInterceptor(instance, logger as any);

    await expect(instance.get('http://example.test/foo')).rejects.toBe(error);
    // The request interceptor still logged the outgoing request before the adapter rejected.
    expect(logger.debug).toHaveBeenCalledWith('Sending HTTP request: GET http://example.test/foo');
    // The response-error branch only re-rejects; it does not emit a response log.
    expect(logger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Received HTTP response'),
    );
  });
});
