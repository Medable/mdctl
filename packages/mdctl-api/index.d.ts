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

  put<R = unknown, P = unknown>(url: string, params: P): Promise<R>
  delete<R = unknown>(url: string): Promise<R>
  post<R = unknown, P = unknown, P2 = unknown>(
    url: string,
    params: P,
    param?: P2
  ): Promise<R>

  get<R = unknown, P = unknown>(url: string, params?: P): Promise<R>

}
