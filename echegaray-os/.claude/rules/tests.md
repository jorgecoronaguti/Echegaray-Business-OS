---
paths:
  - "orquestador/**/*.test.mjs"
  - ".claude/hooks/*.test.mjs"
  - "scripts/**/*.test.mjs"
  - "tests/*.spec.ts"
---

# Tests

El test es la evidencia de cierre de este repo. Se escribe para que falle por la razón correcta.

## Reglas

- **Primero el test que falla.** Un test escrito después de la corrección prueba que el código hace
  lo que hace, no lo que debe.
- **Contra el español real del dueño**, no contra español de manual: escribe `q` por "que", `cdo`
  por "cuando", sin acentos y con typos. Un parser probado con frases limpias acierta en el test y
  falla en la conversación.
- **Un test que se autolimpia** o no es un test: los que tocan datos autenticados dejan el mundo
  como lo encontraron.
- **No editar un test para que pase.** Si el test estaba bien, el defecto está en el código. Si
  estaba mal, se corrige explicándolo en el commit — es un cambio de contrato, no un ajuste.

## Lo que un test tiene que poder detectar

Que el número esté mal, no sólo que el proceso no tire excepción. Un control que se compara contra
la misma información que produce no es un control. Si el test lee el valor del mismo lugar donde lo
escribió, no está verificando nada.

## Correrlos

```
npm run orq:test                    # 2.351 tests, ~38 s   ← la evidencia de cierre
node --test <archivo>.test.mjs      # uno solo, mientras se itera
npx playwright test tests/<x>.spec.ts   # los 47 del navegador
```

Los tests del núcleo son `.test.mjs` (`node --test`); los del navegador, `tests/*.spec.ts`
(Playwright). **No hay tests bajo `src/`** — buscar ahí es buscar donde no hay.
