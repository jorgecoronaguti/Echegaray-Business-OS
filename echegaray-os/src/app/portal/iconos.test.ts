// LA FIRMA DEL ICONO SE VERIFICA, NO SE CONFÍA.
//
// Un icono que se sale de la firma no rompe nada: se ve un poco más grueso, o no toma el color de la
// fila, o queda de otro tamaño. Nadie abre un ticket por eso y la pantalla se ensucia sola. Por eso
// esto es una regla ejecutable y no una convención escrita en un comentario.
//
// Se lee el ARCHIVO como texto en vez de renderizar: `node --test` no carga `.tsx`, y lo que hay que
// garantizar —que ningún icono traiga color propio ni cambie el trazo— es una propiedad del código
// fuente, no del árbol renderizado.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = new URL('./iconos.tsx', import.meta.url)
const src = readFileSync(FUENTE, 'utf8')

/** El cuerpo de cada icono exportado, sin los comentarios de arriba. */
function iconos() {
  const out: { nombre: string; cuerpo: string }[] = []
  const re = /export function (Icono\w+)\s*\(([\s\S]*?)\n\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) out.push({ nombre: m[1], cuerpo: m[2] })
  return out
}

test('hay iconos y todos se exportan con el prefijo del vocabulario', () => {
  const nombres = iconos().map((i) => i.nombre)
  assert.ok(nombres.length >= 12, `esperaba al menos 12 iconos, encontré ${nombres.length}`)
  assert.equal(new Set(nombres).size, nombres.length, 'hay un nombre repetido')
})

test('ningún icono trae color propio — el color lo decide el estado de la fila', () => {
  for (const { nombre, cuerpo } of iconos()) {
    assert.doesNotMatch(cuerpo, /#[0-9a-fA-F]{3,8}/, `${nombre} tiene un color escrito adentro`)
    assert.doesNotMatch(cuerpo, /stroke="(?!currentColor)[^"]+"/, `${nombre} pisa el stroke`)
    assert.doesNotMatch(cuerpo, /fill="(?!none)[^"]+"/, `${nombre} pinta relleno`)
  }
})

test('la firma canónica está una sola vez, en el envoltorio', () => {
  // Si un icono trae su propio <svg>, se salió del envoltorio y con él de la firma.
  for (const { nombre, cuerpo } of iconos()) {
    assert.doesNotMatch(cuerpo, /<svg/, `${nombre} dibuja su propio <svg> en vez de usar Trazo`)
  }
  assert.match(src, /viewBox="0 0 24 24"/)
  assert.match(src, /strokeWidth="1\.6"/)
  assert.match(src, /stroke="currentColor"/)
  assert.match(src, /fill="none"/)
  assert.equal(src.match(/viewBox=/g)?.length, 1, 'la firma se define una sola vez')
})

test('el triángulo se reusa de /campo: no hay una tercera copia dibujada acá', () => {
  assert.match(src, /import \{ IconoProblema \} from '\.\.\/campo\/iconos'/)
  // El path del triángulo de campo NO puede aparecer copiado.
  assert.doesNotMatch(src, /M12 3\.9 21 19\.4H3z/)
})

test('los iconos que pierden detalle en chico usan el MISMO umbral', () => {
  // Tres iconos deciden por tamaño. Si cada uno eligiera su número, el menú saldría desparejo.
  const usos = src.match(/>= DETALLE_DESDE/g) ?? []
  assert.equal(usos.length, 3, `esperaba 3 iconos con detalle condicional, hay ${usos.length}`)
  assert.doesNotMatch(src, />= 2[01]\b/, 'un umbral escrito a mano en vez de la constante')
})

test('el tamaño no se pierde en ningún icono', () => {
  // IconoAlerta delega en un componente que mide por clase: si no lo envolviera, `tamano` sería
  // decorativo y el triángulo saldría siempre de 24px al lado de iconos de 18px.
  const alerta = iconos().find((i) => i.nombre === 'IconoAlerta')!
  assert.match(alerta.cuerpo, /width: tamano, height: tamano/)
})
