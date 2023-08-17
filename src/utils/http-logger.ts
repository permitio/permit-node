import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import pino from 'pino';

export class AxiosLoggingInterceptor {
  static setupInterceptor(axiosInstance: AxiosInstance, logger: pino.Logger): void {
    // Add a request interceptor
    axiosInstance.interceptors.request.use(
      function (request: AxiosRequestConfig) {
        logger.debug(`Sending HTTP request: ${request?.method?.toUpperCase()} ${request?.url}`);
        return request;
      },
      function (error: any) {
        // Do something with request error
        return Promise.reject(error);
      },
    );

    // Add a response interceptor
    axiosInstance.interceptors.response.use(
      function (response: AxiosResponse<any>) {
        logger.debug(
          `Received HTTP response: ${response?.config?.method?.toUpperCase()} ${
            response?.config?.url
          }, status: ${response?.status}`,
        );
        return response;
      },
      function (error) {
        return Promise.reject(error);
      },
    );
  }
}
