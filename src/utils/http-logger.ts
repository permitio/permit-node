import { AxiosRequestConfig, AxiosResponse } from 'axios';
import winston from 'winston';

import { IPermitConfig } from '../config';

export class AxiosLoggingInterceptor {
  static setupInterceptor(config: IPermitConfig, logger: winston.Logger): void {
    // Add a request interceptor
    config.axiosInstance.interceptors.request.use(
      function (request: AxiosRequestConfig) {
        logger.info(`Sending HTTP request: ${request?.method} ${request?.url}`);
        return request;
      },
      function (error: any) {
        // Do something with request error
        return Promise.reject(error);
      },
    );

    // Add a response interceptor
    config.axiosInstance.interceptors.response.use(
      function (response: AxiosResponse<any>) {
        logger.info(
          `Received HTTP response: ${response?.request?.method} ${response?.request?.url}, status: ${response?.status}`,
        );
        return response;
      },
      function (error) {
        return Promise.reject(error);
      },
    );
  }
}
