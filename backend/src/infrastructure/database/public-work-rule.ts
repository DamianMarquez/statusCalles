import { sql, type SQL } from 'drizzle-orm';

/**
 * Obras públicas vigentes: fin futuro, o sin fecha de fin pero iniciadas hace menos de un año.
 * Deja pasar cualquier otro tipo de fila. `alias` es el de la tabla `mobility_infrastructure`.
 */
export function publicWorkInForce(alias: string): SQL {
  const table = sql.raw(alias);
  return sql`(${table}.type <> 'PUBLIC_WORK'
    OR ${table}.metadata ->> 'endDate' >= to_char(CURRENT_DATE, 'YYYY-MM-DD')
    OR (${table}.metadata ->> 'endDate' IS NULL
        AND ${table}.metadata ->> 'startDate' >= to_char(CURRENT_DATE - INTERVAL '1 year', 'YYYY-MM-DD')))`;
}
