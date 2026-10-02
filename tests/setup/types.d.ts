declare module "pg" {
  export interface QueryResult<R = any> {
    rows: R[];
    rowCount: number | null;
  }

  export class Pool {
    constructor(config?: {
      connectionString?: string;
      max?: number;
      connectionTimeoutMillis?: number;
      idleTimeoutMillis?: number;
    });
    query<R = any>(queryText: string, values?: any[]): Promise<QueryResult<R>>;
    end(): Promise<void>;
  }

  export namespace pg {
    export type Pool = InstanceType<typeof import("pg").Pool>;
    export type QueryResult<R = any> = import("pg").QueryResult<R>;
  }

  const pg: {
    Pool: typeof Pool;
  };
  export default pg;
}

declare namespace pg {
  export type Pool = import("pg").Pool;
  export type QueryResult<R = any> = import("pg").QueryResult<R>;
}
