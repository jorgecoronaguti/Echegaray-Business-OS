// CÓMO SE ESCRIBE UN NÚMERO EN LIQUIDACIÓN. Sin JSX, sin `'use client'`, sin base.
//
// ═══ POR QUÉ ESTO ES UN ARCHIVO Y NO DOS CONSTANTES ═══
//
// Porque `pesos` vivía en `BloqueLiquidacion.tsx` —un componente de servidor— y las celdas
// editables son de cliente: un módulo `'use client'` no puede exportarle una función a un
// componente de servidor (Next convierte sus exports en referencias de cliente). Sin un módulo
// neutral en el medio, cada lado termina con su propia copia del formato, y ahí empieza la columna
// que se lee distinta según la solapa.
//
// ═══ EL DEFECTO QUE `horas` CIERRA (dueño, 11/09/2026) ═══
//
// La solapa Pagos formateaba TODA celda con `pesos`, así que la columna HORAS publicaba «$80» sobre
// 80 horas y «$5.974» sobre el valor hora — los dos con el mismo signo, como si fueran lo mismo. Un
// peso y una hora no son la misma unidad y no se escriben igual: las horas van sin signo y con un
// decimal sólo cuando existe (80, no «80,0»; 8,8 cuando la planilla puso 8,8).

/** Pesos sin centavos. `null` es «falta el dato», nunca 0 (R1 del handoff). */
export const pesos = (n: number | null): string =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`

/** Horas: sin signo de moneda y con un decimal como máximo. `null` es «falta el dato». */
export const horas = (n: number | null): string =>
  n == null ? '—' : Number(n).toLocaleString('es-AR', { maximumFractionDigits: 1 })
