import { IInternalResponse, INameSpaceOptions } from './types';

export function nextTick(): Promise<void> {
  return new Promise(resolve => {
    process.nextTick(resolve);
  });
}

export function timeOutResponse(reason?: string): IInternalResponse {
  return {
    statusCode: 408,
    statusMessage: 'Request Timeout',
    headers: {},
    data: reason || 'Request Timeout',
  };
}

export function isNameSpace(key: string, options: INameSpaceOptions): boolean {
  if (typeof key !== 'string') return false;
  if (!options) return false;
  if (typeof options !== 'object') return false;
  if (!options.expose || !options.target) return false;
  return true;
}

export function errorToData(error: IInternalResponse): IInternalResponse {
  const out: IInternalResponse = { statusCode: 503, data: '', headers: {} };
  try {
    const { message, statusCode, data, headers } = error;
    if (message) {
      return { statusCode, data, headers };
    }
    out.data = message;
    // eslint-disable-next-line no-empty
  } catch (e) {}
  return out;
}
