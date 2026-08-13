---
paths:
  - "components/**"
  - "context/**"
  - "app/**"
---

# No usar AsyncStorage directo

No importes ni llames `@react-native-async-storage/async-storage` directamente
desde componentes, contextos de React o rutas de `app/`. Toda persistencia
pasa por `services/storage.ts`: agregá ahí la función que necesites (o usá una
ya existente) en vez de leer/escribir AsyncStorage en el lugar donde lo necesitás.

Esto mantiene la persistencia centralizada y testeable en un solo archivo.
