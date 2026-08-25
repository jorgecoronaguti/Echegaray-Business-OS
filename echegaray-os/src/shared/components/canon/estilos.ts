// EL VOCABULARIO LITERAL DE LAS PANTALLAS DE ADMINISTRACIÓN — medido, no elegido.
//
// ═══ POR QUÉ ESTE ARCHIVO EXISTE Y NO ALCANZABA `components/ds` ═══
//
// El dueño rechazó cuatro entregas del rediseño con la misma frase: «estructura parecida, aspecto
// distinto». La causa está escrita en el propio DS: `ds/Tabla.tsx` declara «las tablas no van en
// caja: hairline superior + divisores de fila», y las SIETE pantallas de Administración del zip
// dibujan la tabla DENTRO de una caja blanca con borde #E7E6E2 y radio 10px, encabezado #FAFAF8 de
// 38px y un pie de totales adentro de la misma caja. No es un matiz: es otro objeto. Interpretar el
// mockup a través de un componente que declara lo contrario es exactamente lo que ya falló.
//
// Entonces: los valores de acá salieron de LEER los `style=""` inline de los `.dc.html`. En esos
// archivos el atributo ES el valor computado —no hay hoja de estilos que los altere—, así que el
// número que está escrito es el número que se ve.
//
// ═══ LO QUE NO SE DUPLICA ═══
//
// `ds/Estado.tsx` (pastilla) y `ds/Filtros` (chip) YA fueron medidos contra el mismo zip el 24/08 y
// producen exactamente lo del mockup. Se reusan tal cual. Este archivo agrega SÓLO lo que el DS no
// tiene o tiene distinto. Un tercer lugar donde se defina la pastilla sería el problema que el DS
// existe para evitar.
//
// FUENTES (`/home/jorge/echegaray-design/`, sólo lectura):
//   14 · Presupuestos Cartera · 15 · Presupuesto Edición · 16 · Presupuesto Análisis de partida
//   22 · Proveedores Cartera  · 23 · Proveedor Ficha     · 24 · Compras
//   25 · Clientes Cartera     · 26 · Cliente Ficha       · 27 · Documentos

/**
 * La paleta tal como la escriben los mockups. Coincide con los tokens de `globals.css` —ambos
 * salieron del mismo logo— pero se declara en hex porque acá se porta un archivo, no se consume un
 * sistema: si mañana un token se corre, esta pantalla tiene que seguir midiendo lo que mide el zip.
 */
export const C = {
  /** Fondo de la aplicación. `14:29`, `22:26`, `24:26`. */
  fondo: '#F7F7F5',
  /** Tarjetas y filas. */
  superficie: '#FFFFFF',
  /** Encabezado de tabla y pie de totales. */
  superficieTenue: '#FAFAF8',
  /** Fila de RUBRO en la tabla de partidas (`15`, fila agrupadora). */
  superficieRubro: '#FCFCFA',
  /** Borde de bloque: la caja de la tarjeta y el cierre del encabezado. */
  linea: '#E7E6E2',
  /** Divisor entre filas de una tabla de cartera. */
  lineaFila: '#F1F0EC',
  /** Divisor entre filas de un panel o de una tabla anidada (`16`, `23`, `26`). */
  lineaTenue: '#F5F4F0',
  /** Divisor del encabezado de una tarjeta con título (`16`, `23`, `26`). */
  lineaBloque: '#EFEEEA',
  /** Borde con foco / separador «·» de la línea de campos. */
  lineaFuerte: '#D7D5CF',

  /** Títulos y valores primarios. */
  tinta: '#1F1F1E',
  /** Texto secundario de celda. */
  tintaSuave: '#3A3A38',
  /** Cuerpo y rótulos apagados. */
  apagado: '#6B6B67',
  /** Rótulos de columna, metadatos, captions. */
  tenue: '#91918B',
  /** Iconos de acción en reposo (los tres puntos, la flecha de la fila). */
  inerte: '#C9C4C2',

  /** El amarillo del isotipo: botón primario. Y su hover, medido en `style-hover`. */
  marca: '#FDC900',
  marcaHover: '#EEBE00',
  /** El grafito del logotipo: chip activo y avatar. */
  grafito: '#30302F',
  /** Fila seleccionada. Amarillo de marca rebajado, NO el gris de hover. */
  seleccion: '#FEF9E6',
  /** Hover de fila. */
  hover: '#FAFAF8',
  /** Pista de una barra de progreso (`23`, `25`, `26`). */
  pista: '#EAE7E6',
  /** Fondo del avatar cuadrado de iniciales (`23`, `25`, `26`). */
  avatar: '#F2F1ED',

  /** Semántico. La terna completa (texto/fondo/borde) vive en `ds/Estado.tsx`. */
  pos: '#067647',
  neg: '#B42318',
  warn: '#B54708',
  info: '#175CD3',
} as const

/**
 * Alto de fila por pantalla. NO se unifican: el zip los escribe distintos y la diferencia es real
 * —una fila de cartera con dos renglones necesita 48, una de una línea 46— así que unificarlos
 * sería justamente «traducir al DS» lo que hay que portar.
 */
export const ALTO = {
  /** Encabezado de una tabla de cartera. `14`, `22`, `24`, `25`, `27`. */
  encabezado: 38,
  /** Encabezado de una tabla anidada dentro de una tarjeta. `23`, `26`. */
  encabezadoBloque: 34,
  /** Encabezado de la tabla de insumos del análisis. `16`. */
  encabezadoInsumo: 32,
  /** Fila de `14` y `25`: llevan dos renglones (nombre + subtítulo). */
  filaAlta: 48,
  /** Fila de `22`, `24`, `26` y `27`: un solo renglón. */
  fila: 46,
  /** Fila de paquetes de `23`. */
  filaBloque: 44,
  /** Fila de partida de `15` y de insumo de `16`. */
  filaPartida: 40,
  /** Fila de RUBRO de `15`. */
  filaRubro: 38,
} as const

/** El radio de la caja de una tarjeta. Idéntico en las nueve pantallas. */
export const RADIO_TARJETA = 10

/**
 * La caja de una tarjeta: `background:#FFFFFF;border:1px solid #E7E6E2;borderRadius:10px;
 * overflow:hidden`. El `overflow:hidden` NO es decorativo — es lo que recorta el encabezado gris y
 * el pie contra el radio; sin él las esquinas se ven cuadradas sobre fondo claro.
 */
export const TARJETA: React.CSSProperties = {
  background: C.superficie,
  border: `1px solid ${C.linea}`,
  borderRadius: RADIO_TARJETA,
  overflow: 'hidden',
}

/** El rótulo de una columna: 10px, versalitas del texto, interletrado .05em, y pegado al borde. */
export function rotuloColumna(alineacion: 'izquierda' | 'derecha' | 'centro' = 'izquierda', chico = false): React.CSSProperties {
  return {
    fontSize: chico ? '9.5px' : '10px',
    color: C.tenue,
    letterSpacing: '.05em',
    paddingBottom: chico ? 7 : 8,
    textAlign: alineacion === 'izquierda' ? undefined : alineacion === 'derecha' ? 'right' : 'center',
  }
}

/**
 * EL PIE DE TOTALES vive DENTRO de la caja, alineado a la derecha, sobre `#FAFAF8`.
 * `display:flex;gap:26px;justifyContent:flex-end;padding:11px 16px`.
 */
export const PIE_TOTALES: React.CSSProperties = {
  display: 'flex',
  gap: 26,
  justifyContent: 'flex-end',
  padding: '11px 16px',
  background: C.superficieTenue,
  flexWrap: 'wrap',
}

/**
 * LA FRANJA DE LA PÁGINA: `padding:14px 20px 10px` para el título y `0 20px 20px` para el cuerpo.
 * Los 20px laterales son de las nueve pantallas; el OS usaba `px-4 lg:px-10` (16/40px).
 */
export const PAGINA = {
  /** Franja del título + buscador + chips + acción primaria. */
  titulo: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 10px', flexWrap: 'wrap' } as React.CSSProperties,
  /** Franja de chips de atención, entre el título y la tabla (`22`, `24`). */
  atencion: { display: 'flex', alignItems: 'center', gap: 8, padding: '0 20px 12px', flexWrap: 'wrap' } as React.CSSProperties,
  /** Franja del cuerpo: la tarjeta de la tabla y, si hay, el panel de la derecha. */
  cuerpo: { display: 'flex', alignItems: 'stretch', padding: '0 20px 20px', minHeight: 0 } as React.CSSProperties,
  /** Franja de una ficha: dos columnas que envuelven. `16`, `23`, `26`. */
  ficha: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 20px 24px', flexWrap: 'wrap' } as React.CSSProperties,
} as const

/**
 * EL ANCHO DEL PANEL LATERAL. `14` y `23` y `26` lo fijan en 372px; `16` en 392px porque adentro
 * lleva la cascada de precio, que necesita dos columnas de importes.
 */
export const PANEL = { cartera: 372, analisis: 392 } as const

/** La columna izquierda de una ficha no baja de 520px: debajo de eso el panel se va abajo. */
export const MIN_COLUMNA_FICHA = 520
