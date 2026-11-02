declare module 'pg' {
  export interface QueryResult<R = Record<string, unknown>> {
    rows: R[]
    rowCount?: number
  }

  export class Client {
    constructor(config?: Record<string, unknown>)
    connect(): Promise<void>
    query<R = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<R>>
    end(): Promise<void>
  }

  export namespace pg {
    export type { Client, QueryResult }
  }

  const pg: {
    Client: typeof Client
  }

  export default pg
}
