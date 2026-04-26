import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

function normalizeBaseUrl(baseURL: AxiosRequestConfig['baseURL']): AxiosRequestConfig['baseURL'] {
  if (!baseURL || typeof baseURL !== 'string') return baseURL;
  try {
    const u = new URL(baseURL);
    if (!u.pathname.endsWith('/')) u.pathname = `${u.pathname}/`;
    return u.toString();
  } catch {
    return baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  }
}

function normalizeRequestUrl(url: string): string {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return url.replace(/^\/+/, '');
}

export class HttpService {
  private readonly client: AxiosInstance;

  constructor(config: AxiosRequestConfig) {
    this.client = axios.create({
      ...config,
      baseURL: normalizeBaseUrl(config.baseURL),
    });
  }

  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(normalizeRequestUrl(url), config);
  }

  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.post<T>(normalizeRequestUrl(url), data, config);
  }

  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(normalizeRequestUrl(url), config);
  }
}
