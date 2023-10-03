export class Config {

  constructor()
  static get global(): Config
  get credentials(): unknown
  get client(): {
    environment:
      | {
      endpoint: string
      env: string
    }
      | string
    credentials: {
      type: string
      token: string
    }
    sessions: boolean
    requestOptions: {
      strictSSL: boolean
    }
  }

  get environment(): unknown

}

export class Fault extends Error {

  errCode: string
  code: string
  statusCode: number
  name: string
  reason: unknown
  path: string
  resource: string
  trace: unknown
  index: unknown
  message: string

  static from(err: unknown, forceError?: boolean): Fault | null

  static create(code: string, message: string, statusCode: number): Fault

}
