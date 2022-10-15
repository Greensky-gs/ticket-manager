export type dbType = {
    connect: (callback: (error?: string) => void) => any;
    query: (sql: string, callback: (error?: string, request?: any[]) => void) => void;
}