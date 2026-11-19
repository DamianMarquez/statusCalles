import { describe, expect, it } from 'vitest';
import { parseBaObras, parseCsv } from './ba-obras-importer.js';

const header =
  'OBRA_NOMBRE;NOMBRE_JURISDICCION;EJERCICIO_CONTRATO;NRO_CONTRATACION_BAO;TIPO_PROCEDIMIENTO;NUMERO_EXPEDIENTE;CUIT;RAZON_SOCIAL;FECHA_INICIO;FECHA_FIN;AVANCE_FISICO_PCT;MONTO_DEFINITIVO;CALLE;NUMERO;LATITUD;LONGITUD;FUENTE;GESTION';

const csv = [
  '﻿' + header,
  '"Escuela ""Jorge Donn"" - Murature";Ministerio de Educación;2021;558;LPU;EX-1;3056;Mediterráneo SA;2021-11-25;2024-06-02;1;627986500;Murature 5095;;NA;NA;Observatorio;Nueva gestión',
  'Museo del Humor;Ministerio de Cultura;2022;10179;LPU;EX-2;;;2023-05-02;2099-12-31;0;270459255;Diagonal Sur;;-34,610462;-58,374348;Observatorio;Nueva gestión',
  'Obra fuera de la ciudad;Jefatura;2022;1;LPU;EX-3;;;2023-01-01;2024-01-01;50;1;Calle;;-34,2;-58,1;Observatorio;Nueva gestión',
  'Museo del Humor;Ministerio de Cultura;2022;10179;LPU;EX-2;;;2023-05-02;2099-12-31;0;270459255;Diagonal Sur;;-34,610462;-58,374348;Observatorio;Nueva gestión',
].join('\n');

describe('BA Obras parsing', () => {
  it('reads quoted fields, BOM and escaped quotes', () => {
    const rows = parseCsv(csv);
    expect(rows[0]?.[0]).toBe('OBRA_NOMBRE');
    expect(rows[1]?.[0]).toBe('Escuela "Jorge Donn" - Murature');
    expect(rows).toHaveLength(5);
  });

  it('keeps only works with valid coordinates inside CABA, once each, without private data', () => {
    const parsed = parseBaObras(csv);
    expect(parsed.rows).toBe(4);
    expect(parsed.withoutCoordinates).toBe(1);
    expect(parsed.outsideCaba).toBe(1);
    expect(parsed.points).toHaveLength(1);
    const point = parsed.points[0]!;
    expect(point).toMatchObject({
      type: 'PUBLIC_WORK',
      name: 'Museo del Humor',
      latitude: -34.610462,
      longitude: -58.374348,
    });
    expect(point.metadata).toEqual({
      jurisdiction: 'Ministerio de Cultura',
      startDate: '2023-05-02',
      endDate: '2099-12-31',
      address: 'Diagonal Sur',
    });
    expect(JSON.stringify(point)).not.toContain('Mediterráneo');
  });

  it('rejects a CSV without the expected columns', () => {
    expect(() => parseBaObras('A;B\n1;2')).toThrow(/columnas/);
  });
});
