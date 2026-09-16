---
paths:
  - "src/**/*.tsx"
  - "src/app/**"
---

# Pantallas

No hay usuarios externos: no hay checkout, ni landing de conversión, ni onboarding. Los usuarios son
el dueño, jefes de obra y administración. Una pantalla existe para que alguien decida o cargue algo,
no para mostrar.

## Antes de agregar una vista

- ¿Qué decisión cambia si este número cambia? Sin respuesta, no es prioritario.
- El dato sale de la **fuente única** en Postgres, no de una consulta propia. La web ya mostró obras
  legacy pausadas mientras el chat mostraba las activas: dos verdades para el mismo concepto.

## Verificación

Una pantalla no se da por buena por compilar. Se mira: el agente `qa-visual` la recorre con un
navegador real, autenticado y por rol. Un test de tipos no ve un layout roto.

Y **verificar autenticado, no anónimo**: la vista anónima puede devolver 200 con cero filas mientras
la autenticada tira 500.

## El sistema visual lo verifica el linter

`@shadcn/lint` está configurado en `eslint.config.mjs` con las reglas del design system del OS: qué
componente se puede reestilar desde afuera, qué colores existen como token, qué clase se puede armar
en tiempo de ejecución. El porqué de cada regla —y de las dos que están apagadas— está medido en la
cabecera de ese archivo. Los mensajes de error están escritos para que un agente no tenga que
adivinar: nombran el componente dueño del estilo, el archivo donde vive y el token que corresponde.

**Ningún trabajo que toque una pantalla se da por terminado sin correr el lint.** Mientras se itera,
sobre los archivos que se tocaron —segundos, no minutos—:

```bash
npx eslint src/features/<dominio>/components/Pantalla.tsx
```

Antes de cerrar, la corrida completa: `npm run lint`.

El criterio es **cero `error`, y cero warning `shadcn/*` en los archivos que tocaste**. La deuda
vieja es de otras pantallas; la que aparece en tu diff es tuya. Estas son las cuentas del 16/09/2026,
y sólo pueden bajar:

| Regla | Hallazgos | Archivos | Qué es |
|---|---:|---:|---|
| `shadcn/no-raw-colors` | 202 | 20 | `text-slate-400` y familia donde ya hay token |
| `shadcn/no-arbitrary-values` | 160 | 83 | un color en hex a mano, teniendo el token |
| `shadcn/no-restyle` | 111 | 27 | color y tipografía puestos desde afuera, casi todo `<Num>` y `<Td>` |
| `shadcn/require-static-classes` | 0 | 0 | en `error`: acá no se vuelve |

Si el total sube, lo subió el cambio que estás haciendo.

**Una excepción legítima se configura, no se silencia.** Si un componente tiene que aceptar de
verdad una categoría de clases, va como contrato en `eslint.config.mjs` con su párrafo de por qué —
ahí ya están los iconos (toman el color del contexto) y los esqueletos de carga. Un
`eslint-disable` suelto sólo para pintar verde es la excepción que nadie va a volver a mirar.

**Y no se crea un componente nuevo para satisfacer al linter.** Si `<Num>` no tiene el tono que
hace falta, el arreglo es una variante en `<Num>`, no un `<NumVerde>` al lado.

## Lo que el linter NO ve

`no-inline-styles` y `no-unknown-classes` están apagadas, y no porque no importen: la primera
porque el patrón del OS es `style={{ ...V }}` con los tokens medidos de `v2/patron.tsx`, y la
segunda porque con Tailwind v3 el linter no puede leer el tema del proyecto y marcaba como
inexistentes 217 clases que existen (`rounded-card`, `h-fila`, `portal-*`). Que no salga un warning
no quiere decir que esté bien: el `style` sigue teniendo que salir de `V`, y una clase inventada
sigue saliendo sin CSS.

Tampoco ve un layout roto, una pantalla que no entra en un teléfono ni un contraste ilegible. Eso lo
sigue mirando `qa-visual` con un navegador real.
