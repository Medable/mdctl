export class Environment {

  constructor(input: string)
  url: string

}

export class Client {

  environment: Environment

  constructor(params: {
    environment:
      | {
      endpoint: string
      env: string
    }
      | string
    credentials: {
      type?: string
      token?: string
      apiKey?: string
    }
    sessions: boolean
    requestOptions: {
      strictSSL: boolean
    }
  })

  put<R = unknown, O = unknown>(url: string, options?: O): Promise<R>
  delete<R = unknown, O = unknown>(url: string, options?: O): Promise<R>
  post<R = unknown, B = unknown, O = unknown>(
    url: string,
    body: B,
    options?: O
  ): Promise<R>
  get<R = unknown, O = unknown>(url: string, options?: O): Promise<R>
  patch<R = unknown, O = unknown>(url: string, options?: O): Promise<R>

}
