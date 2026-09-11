'use client'

// EDICIÓN EN LA CELDA — el valor se corrige donde se lee, sin abrir un formulario.
//
// ═══ POR QUÉ EXISTE, Y POR QUÉ ACÁ ═══
//
// El OS no tenía ninguno. Corregir la cantidad de una actividad, su unidad o su responsable obligaba
// a abrir un panel, tocar «Guardar» y volver — treinta y ocho veces si son treinta y ocho filas.
// Nace genérico y en el design system a propósito: Tareas es la primera pantalla que lo necesita,
// pero lo van a usar Base maestra, Presupuestos y Compras, y la segunda copia es la que un día va a
// guardar sin avisar que falló.
//
// ═══ EL CONTRATO ═══
//
// 1. **GUARDA AL SALIR DEL CAMPO** (texto y número) **o AL ELEGIR** (select). No hay botón: un
//    botón por celda son treinta y ocho botones y el que edita igual se va con Tab sin tocarlo.
// 2. **NO GUARDA SI NO CAMBIÓ.** Entrar y salir de una celda no escribe: una escritura por foco
//    ensucia el historial y pisa lo que otro acaba de corregir en otra pestaña.
// 3. **`Escape` cancela** y devuelve el valor original. `Enter` confirma sin esperar al blur.
// 4. **EL ERROR DEL SERVIDOR SE MUESTRA Y EL VALOR NO SE PIERDE.** Si la acción devuelve
//    `{ok:false}`, el campo se queda con lo que la persona escribió y el mensaje aparece debajo. Un
//    campo que se limpia solo hace creer que se guardó algo que no existe.
// 5. **EL VACÍO SE MANDA VACÍO.** Un campo que se borra manda `''`; convertirlo a `0` fabricaría un
//    dato — el error que ya costó un contrato de $0 en este repo.
// 6. **`null` no se dibuja como `0` ni como `—`**: se dibuja el texto de ausencia que pasa el que
//    llama (`falta`), en `faint`, y sigue siendo tocable.
// 7. **LO GUARDADO NO DESAPARECE MIENTRAS EL SERVIDOR VUELVE.** La prop sigue trayendo el valor
//    viejo hasta que `revalidatePath` termina de rehacer la pantalla —en Liquidación, entre diez y
//    veinte segundos—, y hasta el 10/09/2026 la celda volvía a dibujarlo: quien editaba veía su
//    número desaparecer y concluía, con razón, que no se podía editar. La regla de quién gana está
//    en `inlineEdit.ts`, pura y probada.
//
// El id de la fila NUNCA viaja en el formulario: la acción llega ya atada con `.bind(null, id)`.

import { useRef, useState } from 'react'
import { CAMPO } from './Controles'
import {
  alConfirmarGuardado, alLlegarDelServidor, hayQueGuardar, valorVigente, type EstadoInline,
} from './inlineEdit'

export type ResultadoInline = { ok: true } | { ok: false; error: string }

export interface OpcionInline {
  valor: string
  etiqueta: string
}

export function InlineEdit({
  valor,
  guardar,
  tipo = 'texto',
  opciones,
  falta = 'sin cargar',
  mostrar,
  sufijo,
  etiqueta,
  testid,
  ancho = 'w-full',
  alineado = 'left',
}: {
  /** Lo guardado hoy. `null` es ausencia y se dibuja con `falta`, nunca como 0. */
  valor: string | number | null
  guardar: (v: string) => Promise<ResultadoInline>
  tipo?: 'texto' | 'numero' | 'seleccion' | 'fecha'
  /** Obligatorias con `tipo='seleccion'`. La primera opción suele ser la ausencia. */
  opciones?: OpcionInline[]
  falta?: string
  /**
   * Cómo se LEE el valor guardado: moneda, porcentaje, miles. Sólo afecta al estado de lectura —al
   * editar se muestra el número crudo, porque un `<input type=number>` con «$100.000» adentro no
   * puede recibir un tecleo y el navegador lo descarta entero. Sin esto, una columna de plata pierde
   * el formato en el momento en que se vuelve editable, y una tabla de sueldos sin separador de
   * miles se lee mal justo donde más caro sale leerla mal.
   */
  mostrar?: (valor: string | number) => string
  sufijo?: string
  /** Rótulo accesible: es lo único que distingue esta celda de las otras trescientas. */
  etiqueta: string
  testid?: string
  ancho?: string
  /** `center` lo pide la grilla de Liquidación → Horas: su columna de día está centrada y un campo
   *  alineado a la izquierda dentro de 42 px corre el número respecto de las celdas de al lado. */
  alineado?: 'left' | 'right' | 'center'
}) {
  const original = valor === null ? '' : String(valor)
  // UNA FECHA SE LEE EN es-AR Y SE EDITA EN ISO. El `<input type=date>` exige AAAA-MM-DD, pero
  // mostrar la celda así obliga a leer al revés una fecha en una pantalla donde todas las demás
  // dicen DD/MM/AAAA — y una columna con dos formatos de fecha es una columna que se lee mal.
  const enISO = (v: string) => (tipo === 'fecha' && v
    ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}`
    : v)
  const [borrador, setBorrador] = useState(original)
  const [editando, setEditando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  // EL VALOR DE AFUERA MANDA cuando la fila se vuelve a leer del servidor —salvo mientras alguien
  // está escribiendo: pisarle el texto a mitad de una corrección es perder su trabajo—. Se ajusta
  // DURANTE el render y no en un efecto: con el efecto, la celda se dibuja un fotograma con el
  // valor viejo y se corrige después, que es el parpadeo que hace dudar de si guardó.
  const [estado, setEstado] = useState<EstadoInline>({ delServidor: original, pendiente: null })
  if (!editando && original !== estado.delServidor) {
    const siguiente = alLlegarDelServidor(estado, original)
    setEstado(siguiente)
    setBorrador(valorVigente(siguiente))
  }

  // LO QUE LA CELDA DIBUJA: lo confirmado por la acción hasta que el servidor lo repita (regla 7).
  const vigente = valorVigente(estado)
  const enVuelo = estado.pendiente != null

  async function confirmar(v: string) {
    if (!hayQueGuardar(estado, v)) { setEditando(false); return }
    setGuardando(true)
    const r = await guardar(v)
    setGuardando(false)
    setEditando(false)
    if (r.ok) {
      setEstado(alConfirmarGuardado(estado, v))
      setError(null)
    } else {
      setError(r.error)
    }
  }

  if (tipo === 'seleccion') {
    return (
      <span className="inline-flex flex-col">
        <select
          value={borrador}
          disabled={guardando}
          aria-label={etiqueta}
          data-testid={testid}
          onChange={(e) => { setBorrador(e.target.value); void confirmar(e.target.value) }}
          className={`${CAMPO} ${ancho} !h-7 !px-1.5 !text-[12.5px] border-transparent bg-transparent hover:border-line-strong`}
        >
          {(opciones ?? []).map((o) => (
            <option key={o.valor} value={o.valor}>{o.etiqueta || falta}</option>
          ))}
        </select>
        {error && <span className="text-[11px] text-neg" data-testid={testid ? `${testid}-error` : undefined}>{error}</span>}
      </span>
    )
  }

  if (!editando) {
    return (
      <span className="inline-flex flex-col items-start">
        <button
          type="button"
          data-testid={testid}
          aria-label={etiqueta}
          // MIENTRAS EL SERVIDOR NO CONFIRME, LA CELDA LO DICE SIN MOVER NADA: `aria-busy` para
          // quien navega con lector y un subrayado punteado para quien mira. Un cartel «guardando…»
          // debajo empujaría la fila y la tabla entera bailaría en cada corrección.
          aria-busy={enVuelo || guardando}
          data-pendiente={enVuelo ? '1' : undefined}
          title={enVuelo ? 'Guardado. La pantalla termina de actualizarse en unos segundos.' : undefined}
          onClick={() => { setEditando(true); setError(null); requestAnimationFrame(() => ref.current?.select()) }}
          className={`${ancho} rounded-control border border-transparent px-1.5 py-0.5 text-left hover:border-line-strong ${
            alineado === 'right' ? 'text-right font-mono tabular-nums'
              : alineado === 'center' ? 'text-center font-mono tabular-nums' : ''
          } ${vigente === '' ? 'text-faint' : 'text-ink'} ${
            enVuelo ? 'underline decoration-dotted decoration-warn underline-offset-4' : ''
          } text-[12.5px]`}
        >
          {vigente === ''
            ? falta
            : `${mostrar ? mostrar(vigente) : enISO(vigente)}${sufijo ? ` ${sufijo}` : ''}`}
        </button>
        {error && <span className="text-[11px] text-neg" data-testid={testid ? `${testid}-error` : undefined}>{error}</span>}
      </span>
    )
  }

  return (
    <span className="inline-flex flex-col">
      <input
        ref={ref}
        autoFocus
        type={tipo === 'numero' ? 'number' : tipo === 'fecha' ? 'date' : 'text'}
        step={tipo === 'numero' ? 'any' : undefined}
        value={borrador}
        disabled={guardando}
        aria-label={etiqueta}
        data-testid={testid ? `${testid}-campo` : undefined}
        onChange={(e) => setBorrador(e.target.value)}
        onBlur={() => void confirmar(borrador)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void confirmar(borrador) }
          // ESCAPE DEVUELVE EL ORIGINAL. Sin esto, la única salida de una edición empezada por error
          // es guardarla.
          if (e.key === 'Escape') { e.preventDefault(); setBorrador(vigente); setEditando(false) }
        }}
        className={`${CAMPO} ${ancho} !h-7 !px-1.5 !text-[12.5px] ${alineado === 'right' ? 'text-right font-mono tabular-nums' : alineado === 'center' ? 'text-center font-mono tabular-nums' : ''}`}
      />
      {error && <span className="text-[11px] text-neg" data-testid={testid ? `${testid}-error` : undefined}>{error}</span>}
    </span>
  )
}
