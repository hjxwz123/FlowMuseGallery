export class ApiClientError<T = unknown> extends Error {
  code: number
  data: T | null

  constructor(message: string, code: number, data: T | null = null) {
    super(message)
    this.name = 'ApiClientError'
    this.code = code
    this.data = data
  }
}
