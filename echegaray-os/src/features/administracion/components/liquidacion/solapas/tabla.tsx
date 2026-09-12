// LA REJILLA DE LAS TRES SOLAPAS NUEVAS, UNA SOLA VEZ.
//
// El mockup v2 dibuja el mismo objeto en las pantallas 7, 8 y 12: una grilla CSS con encabezado de
// columna en versalita mono, filas de 46–58 px separadas por un filo, y una fila de total cerrada
// por arriba con el grafito. Copiarla tres veces garantizaba que la cuarta pantalla la corriera un
// píxel; y `ds/Tabla` no sirve acá porque es `<table>` con anchos automáticos, y el mockup fija las
// columnas al píxel para que los números queden en la misma vertical entre cuadros.
//
// Los valores salen de `design/Liquidación de horas v2.dc.html`, líneas 525-547 y 684-694.

import type { CSSProperties, ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'

export const MONO = "'IBM Plex Mono', monospace"

/**
 * EL RITMO VERTICAL DE ESTAS TRES PANTALLAS — UNA CONSTANTE, NO UN NÚMERO POR ARCHIVO.
 *
 * ═══ POR QUÉ NO ES `ALTO_V2` ═══
 *
 * Porque `ALTO_V2` sale de OTRO canvas. Su `fila: 44` es la lista de `Administración v4 · Pantallas`
 * y `ritmo-vertical.test.ts` fija explícitamente que ninguna fila de lista puede llegar a 52 ahí.
 * El canvas que gobierna estas pantallas es `design/Liquidación de horas v2.dc.html`, que dibuja
 * cuadros de datos —no listas maestras— con filas de 44 a 58 px. Promediar los dos ritmos daría una
 * pantalla que no es fiel a ninguno de los dos canvas, que es exactamente el error que ese test
 * documenta («cada canvas es la pantalla que gobierna, y el número sale de ESA pantalla»).
 *
 * ═══ POR QUÉ IGUAL ES UNA CONSTANTE ═══
 *
 * Porque el defecto que `ritmo-vertical.test.ts` caza es real y aplica igual acá: tres pantallas
 * escribiendo `52` a mano derivan sin que nadie se entere. Acá el número se pide una sola vez y cada
 * uno cita la línea del canvas de la que salió. Si el zip cambia, cambia este bloque y nada más.
 *
 * INTEGRADOR: si el OS decide que `patron.tsx` es la única casa de todo ritmo vertical, esto se
 * muda ahí como una familia más. No lo puse ahí solo porque `patron.tsx` es de otro frente y su
 * test declara los cuatro números del v4 como el contrato de ese archivo.
 */
export const ALTO_LIQ = {
  /** Encabezado de columnas, alineado abajo. `dc:526`, `:544`, `:684`. */
  encabezado: 34,
  /** Encabezado de las DOS grillas anchas, que respiran un renglón más. `dc:144`, `dc:398`. */
  encabezadoAncho: 36,
  /** Fila de dato de un cuadro. `dc:527` (pantalla 7), `:545` (pantalla 8). */
  fila: 52,
  /** La fila de persona de la pantalla 8: el canvas la escribe en 48, no en 52. `dc:545`. */
  filaPersona: 48,
  /** La fila de los tres cuadros angostos de la pantalla 12. `dc:687`, `:692`. */
  filaAngosta: 46,
  /** Fila de dato que puede llevar dos renglones. `dc:529`. */
  filaAlta: 58,
  /** Renglón de la lista «lo que no se puede afirmar». `dc:552`. */
  renglon: 44,
  /** Fila de agregado en gris («3 más»). `dc:530`. */
  agregado: 34,
  /** Fila de total, cerrada por arriba con el grafito. `dc:547`, `:694`. */
  total: 52,
  /** Total de una grilla ancha, que pesa más que el total de un cuadro. `dc:368`. */
  totalAncho: 54,
  /** Renglón de panel de dos columnas —rótulo a la izquierda, valor a la derecha—. `dc:248`, `:466`, `:578`. */
  filaPanel: 42,
  /** El ÚLTIMO renglón de un panel: más bajo porque no lleva filo abajo. `dc:560`, `:610`. */
  renglonBajo: 34,
  /** Renglón de dos columnas que puede llevar una frase entera a la derecha. `dc:701`-`:705`. */
  renglonAlto: 48,
  /** Escalón de la escalera bolsillo → costo (pantalla 5), `dc:` costo-hora. */
  escalon: 40,
  /** Fila de total alta de los cuadros por obra y de la quincena cerrada (`dc:` costo-obra / cierre). */
  filaTotalAlta: 56,
} as const

/**
 * ═══ UNA TABLA QUE SE RECORRE EN HORIZONTAL, EN UN TELÉFONO (QA visual, 11/09/2026) ═══
 *
 * A 390-400 px, «Horas», «Pagos», «Convenios» y «Quincena» tienen scroll horizontal propio y NO lo
 * dicen: la tabla se corta en el borde y no hay nada que sugiera que hay más. Y al arrastrar, el
 * nombre de la persona se va con el resto, así que a los tres dedos de desplazamiento los números
 * quedan sin dueño — que en una pantalla de sueldos es la peor forma de leer mal.
 *
 * Se resuelve con DOS cosas, y viven acá y no en cada solapa: cuatro tablas copiando el mismo truco
 * derivan, y la quinta que alguien agregue no lo tendría.
 */

/**
 * EL MARCO QUE PERMITE EL SCROLL Y AVISA QUE HAY MÁS.
 *
 * El degradado del borde es la única señal honesta: aparece porque el contenido excede y se va solo
 * cuando entra. Una flechita fija mentiría en la pantalla ancha, donde no hay nada más a los lados.
 *
 * Es el truco de las sombras con `background-attachment`: las dos capas blancas van `local` —se
 * mueven con el contenido— y las dos grises `scroll`, así que el navegador las tapa solo cuando la
 * tabla llegó a su tope. Sin JS, sin listeners de scroll, y funciona con el dedo.
 */
/**
 * EL CANAL QUE LA TABLA DEJA A CADA LADO. Es el `padding` horizontal con el que las tres solapas
 * llaman a `MARCO_SCROLL`, y `COLUMNA_FIJA` necesita SABERLO para taparlo (ver abajo). Estaba
 * escrito tres veces como `padding: '0 20px'` y por eso el defecto se podía arreglar en una sola y
 * seguir vivo en las otras dos.
 */
export const CANAL_SCROLL = 20

/** El grafito de la marca, translúcido. Sale del token, no de un hex copiado. `patron.tsx`. */
const filoGrafito = (alfa: number): string => `color-mix(in srgb, ${V.grafito} ${alfa}%, transparent)`

export const MARCO_SCROLL: CSSProperties = {
  overflowX: 'auto',
  backgroundImage:
    `linear-gradient(to right, #FFFFFF 30%, rgba(255,255,255,0)),`
    + `linear-gradient(to left, #FFFFFF 30%, rgba(255,255,255,0)),`
    + `linear-gradient(to right, ${filoGrafito(28)}, rgba(255,255,255,0)),`
    + `linear-gradient(to left, ${filoGrafito(28)}, rgba(255,255,255,0))`,
  backgroundPosition: 'left center, right center, left center, right center',
  backgroundRepeat: 'no-repeat',
  // 16 px Y 28% DE GRAFITO, NO 12 px Y 14%. Medido en la captura de QA del 11/09 a 390 px: el filo
  // anterior era indistinguible del borde del cuadro —nadie iba a deducir de él que había ocho
  // columnas más a la derecha— y una señal que no se ve es una señal que no existe. 16 es el paso
  // del grid de 8; 28% mantiene el gris del logo sin convertirlo en una sombra (regla «casi ninguna
  // sombra»: esto no es relieve, es el borde del contenido que sigue).
  backgroundSize: '28px 100%, 28px 100%, 16px 100%, 16px 100%',
  backgroundAttachment: 'local, local, scroll, scroll',
}

/**
 * LA PRIMERA COLUMNA NO SE VA CON EL SCROLL.
 *
 * Es la del nombre. Un importe sin la persona al lado no se puede leer, y en una tabla de catorce
 * columnas el nombre sale de pantalla al primer arrastre. El `background` opaco es obligatorio: sin
 * él las celdas que pasan por debajo se ven a través.
 */
export const COLUMNA_FIJA: CSSProperties = {
  position: 'sticky',
  // ═══ `left: 0` DEJABA PASAR UNA COLUMNA DE DÍA POR DELANTE DEL NOMBRE (medido, 12/09/2026) ═══
  //
  // No era el apilado: con `zIndex: 1` la celda del nombre ya gana sobre sus hermanas. Era DÓNDE
  // frena. El marco recorta su contenido en el borde del PADDING —la franja de 20 px sigue pintando
  // lo que se desplaza— pero la celda pegajosa frena en el borde del CONTENIDO, 20 px más adentro.
  // Quedaba un canal de 20 px donde se veía la columna del día y no el nombre. Medido con
  // `elementFromPoint` a 390 px con `scrollLeft = 300`: a 2, 6, 12 y 18 px del borde el elemento de
  // arriba era el `<button>` de un día; recién a 24 px aparecía el nombre. En Pagos pasaba lo mismo
  // —asomaba un «—» en vez de un número, por eso no se había visto—: las tres grillas, un defecto.
  //
  // `left: -20` frena la celda 20 px antes, justo en el borde del recorte. El margen negativo y el
  // padding del mismo tamaño hacen que su FONDO llegue hasta ahí sin mover una sola letra: el texto
  // sigue empezando donde lo pone la grilla, y el canal queda tapado en blanco.
  left: -CANAL_SCROLL,
  marginLeft: -CANAL_SCROLL,
  paddingLeft: CANAL_SCROLL,
  zIndex: 1,
  // OPACO, SIEMPRE. Lo que pasa por debajo se ve a través de cualquier fondo con alfa — y una fila
  // que se pinta distinta (la abierta) no puede resolverlo con `undefined`: tiene que decir SU
  // color. `fondoDeColumnaFija()` es la única forma de pedirlo.
  background: '#FFFFFF',
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

/**
 * EL FONDO DE LA CELDA FIJA CUANDO LA FILA NO ES BLANCA.
 *
 * Existe para que no se pueda escribir `background: undefined`: eso deja la celda TRANSPARENTE y las
 * columnas de día se leen a través del nombre —el mismo defecto de arriba, por la otra puerta—.
 * Recibe el color de la fila y devuelve uno opaco, nunca nada.
 */
export const fondoDeColumnaFija = (colorDeLaFila?: string): string => colorDeLaFila ?? '#FFFFFF'

/** El contenedor de un cuadro: radio 10, filo `line-2`, sin sombra y sin gradiente. `dc:525`. */
export function Cuadro({ children, ancho, testid }: {
  children: ReactNode; ancho?: number | string; testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{
        width: ancho ?? '100%', maxWidth: '100%', background: '#FFFFFF',
        border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, padding: 28,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}
    >
      {children}
    </div>
  )
}

/** El título de un bloque dentro del cuadro. 12,5 px / 600. `dc:544`. */
export const TituloBloque = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta }}>{children}</div>
)

const grilla = (columnas: string, alto: number): CSSProperties => ({
  display: 'grid', gridTemplateColumns: columnas, gap: 14, minHeight: alto, alignItems: 'center',
  borderBottom: `1px solid ${V.linea}`,
})

/** El encabezado de columnas: mono 9,5 px, versalita, alineado abajo. `dc:526`. */
export function Encabezado({ columnas, celdas }: { columnas: string; celdas: ReactNode[] }) {
  return (
    <div style={{
      ...grilla(columnas, ALTO_LIQ.encabezado), alignItems: 'end', paddingBottom: 9,
      fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', color: V.tenue,
      textTransform: 'uppercase',
    }}>
      {celdas.map((c, i) => (
        <div key={i} style={i === 0 ? undefined : { textAlign: 'right' }}>{c}</div>
      ))}
    </div>
  )
}

/** Una fila. `tenue` la baja de peso: es la línea de agregado, no un dato más. */
export function Fila({ columnas, celdas, alto = ALTO_LIQ.fila, tenue = false, testid }: {
  columnas: string; celdas: ReactNode[]; alto?: number; tenue?: boolean; testid?: string
}) {
  return (
    <div data-testid={testid} style={{
      ...grilla(columnas, alto),
      ...(tenue ? { fontSize: '11.5px', color: V.tenue } : null),
    }}>
      {celdas.map((c, i) => (
        <div key={i} style={i === 0 ? { minWidth: 0 } : { textAlign: 'right' }}>{c}</div>
      ))}
    </div>
  )
}

/** La fila de total: cerrada por arriba con el grafito, sin filo abajo. `dc:547`. */
export function Total({ columnas, celdas, testid }: {
  columnas: string; celdas: ReactNode[]; testid?: string
}) {
  return (
    <div data-testid={testid} style={{
      display: 'grid', gridTemplateColumns: columnas, gap: 14, minHeight: ALTO_LIQ.total,
      alignItems: 'center', borderTop: `1px solid ${V.grafito}`, fontWeight: 600, color: V.tinta,
    }}>
      {celdas.map((c, i) => (
        <div key={i} style={i === 0 ? { minWidth: 0 } : { textAlign: 'right' }}>{c}</div>
      ))}
    </div>
  )
}

/** El cuerpo con números tabulares. Todo número comparable los lleva (§2 del handoff). */
export const Cuerpo = ({ children }: { children: ReactNode }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', fontSize: '12.5px',
    fontVariantNumeric: 'tabular-nums', color: V.tinta,
  }}>
    {children}
  </div>
)

/** Un dato que no existe. Gris `faint`, nunca cero y nunca rojo: no es un problema, es un hueco. */
export const Hueco = ({ children = '—' }: { children?: ReactNode }) => (
  <span style={{ color: V.tenue }}>{children}</span>
)

/** El encabezado numerado de una pantalla del mockup. `dc:519`. */
export function Titulo({ numero, titulo, bajada }: {
  numero: string; titulo: string; bajada: string
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', paddingBottom: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: '12px', color: V.tenue }}>{numero}</span>
      <span style={{ fontSize: '14.5px', fontWeight: 600, color: V.tinta }}>{titulo}</span>
      <span style={{ fontSize: '12.5px', color: V.apagado }}>— {bajada}</span>
    </div>
  )
}

/** Miles a la argentina, sin decimales. Los pesos de esta pantalla no se cuentan en centavos. */
export const miles = (n: number | null | undefined, decimales = 0): string =>
  n == null || !Number.isFinite(Number(n))
    ? '—'
    : Number(n).toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })
