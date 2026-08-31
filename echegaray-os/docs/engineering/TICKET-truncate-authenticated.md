# TICKET · `authenticated` puede vaciar 176 de las 185 tablas

**Estado:** ABIERTO · **Área:** plataforma / seguridad de la base · **NO es del camino crítico de
cotización** y no se arregla dentro de él (§24 del programa lo separa a propósito).

## El hecho, medido

```sql
select count(*) filter (where has_table_privilege('authenticated', c.oid, 'TRUNCATE')) as truncate_si,
       count(*) as total
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r';
```

Cualquiera que tenga una sesión autenticada —cualquier usuario del OS, con cualquier rol de negocio—
puede ejecutar `truncate public.<tabla>` y vaciarla.

## El número no es fijo, y ahí está lo peor

| momento del 2026-08-30 | truncables / total |
|---|---|
| al abrir el programa | **176 / 185** |
| una hora después, tras crear 11 tablas nuevas | **187 / 196** |

Las once tablas creadas en esa hora —las de precios, genealogía de obra y decisiones de Base
Maestra— **nacieron todas truncables**, sin que ninguna migración lo pidiera. Es el mismo patrón que
ya mordió con los `GRANT` por columna: el permiso no está puesto tabla por tabla, está en los
`default privileges`, así que **cada tabla nueva lo hereda al nacer**.

Por eso citar un número absoluto es engañoso: crece solo. Lo que hay que arreglar no son 187 tablas,
es la regla que las fabrica así.

Entre las alcanzadas están las que el sistema trata como inmutables por diseño —`cotizacion_evento`,
`cotizacion_override_precio`, el log de decisiones de Base Maestra—: tablas cuyas policies prohíben
`update` y `delete` y que, sin embargo, se pueden **vaciar enteras**.

## Por qué RLS no protege

**`TRUNCATE` no pasa por RLS.** Las policies filtran filas en `select`, `insert`, `update` y
`delete`; `truncate` es una operación de tabla, no de filas, y las ignora por completo. Todo el
trabajo de porteros por fila que gobierna quién ve qué obra, qué sueldo y qué cliente **no interviene
acá**: el permiso se decide únicamente por el `GRANT`, y el `GRANT` está dado.

Tampoco deja rastro fila por fila ni dispara los triggers de auditoría por fila. Una tabla vaciada
así no se reconstruye desde el propio sistema.

## El alcance real

Están las que sostienen la operación y la plata: movimientos bancarios, cobranzas, compras, jornales,
cotizaciones, obras, asistencia. Nueve tablas quedan afuera; el resto, no.

## Lo que hay que hacer (fuera de este programa)

1. `revoke truncate on all tables in schema public from authenticated;` y lo mismo en los
   `alter default privileges`, para que **una tabla nueva no nazca otra vez con el permiso puesto** —
   es el mismo patrón que ya mordió con los `GRANT` por columna.
2. Revisar si algún flujo del OS realmente trunca algo con el rol `authenticated`. Casi con certeza
   ninguno: los que limpian usan el rol de servicio. Hay que confirmarlo antes de revocar, no
   después.
3. Un test que corra **como `authenticated`** e intente truncar una tabla, y que exija el rechazo.
   Sin ese test la revocación se pierde en la próxima migración que reponga los grants en masa.

## Por qué no se arregla acá

El programa de capacidad general de cotización tiene prohibido mezclar seguridad global salvo riesgo
directo sobre la cotización. Éste es un riesgo de plataforma, real y grave, pero no cambia una sola
decisión de cómo XSAS cotiza. Se arregla en su propio trabajo, con su propia verificación y su propia
firma — y hasta entonces queda escrito acá, que es distinto de estar resuelto.
