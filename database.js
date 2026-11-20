import {mkdirSync} from 'node:fs';

const url = process.env.DATABASE_URL;
const hosted = process.env.VERCEL === '1';
if (hosted && !url) throw new Error('Configura DATABASE_URL antes de desplegar.');

let db;
let sql;
if (url) {
  const {default: postgres} = await import('postgres');
  sql = postgres(url, {max:1, prepare:false, ssl:process.env.PG_LOCAL === '1' && !hosted ? false : 'require'});
} else {
  const {DatabaseSync} = await import('node:sqlite');
  mkdirSync('data', {recursive:true});
  db = new DatabaseSync(process.env.DB_PATH || 'data/mostrador.sqlite');
  db.exec('PRAGMA foreign_keys=ON');
}

let queue = Promise.resolve();
export function transaction(fn, write=true) {
  if (sql) return sql.begin(async connection => {
    await connection`SET LOCAL search_path TO mostrador`;
    if (write) await connection`SELECT pg_advisory_xact_lock(43938001)`;
    else await connection`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`;
    return fn(postgresQueries(connection));
  });

  const work = queue.then(async () => {
    db.exec(write ? 'BEGIN IMMEDIATE' : 'BEGIN');
    try {
      const value = await fn(sqliteQueries);
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
  queue = work.catch(() => {});
  return work;
}

const sqliteQueries = {
  run: (query,...args) => db.prepare(query).run(...args),
  get: (query,...args) => db.prepare(query).get(...args),
  all: (query,...args) => db.prepare(query).all(...args),
  exec: query => db.exec(query)
};

function postgresQueries(connection) {
  const queryWithParams = (query,args) => {
    let index = 0;
    return connection.unsafe(query.replace(/\?/g, () => '$'+(++index)),args);
  };
  return {
    run: async (query,...args) => {
      const result = await queryWithParams(query,args);
      return {lastInsertRowid:result[0]?.id};
    },
    get: async (query,...args) => (await queryWithParams(query,args))[0],
    all: (query,...args) => queryWithParams(query,args),
    exec: query => connection.unsafe(query)
  };
}

export const postgresEnabled = Boolean(sql);
