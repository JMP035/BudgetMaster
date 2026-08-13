---
paths:
  - "services/SmsService.ts"
  - "services/SmsService.tsx"
---

# SMS solo existe en Android

Las APIs de SMS (`react-native-get-sms-android` y cualquier otra que dependa
de ellas) solo existen en Android. Siempre protegé el código que las usa con:

```ts
if (Platform.OS === 'android') {
  // lógica de SMS
}
```

Nunca asumas que `SmsService` corre en iOS o web. Si una función exportada de
este archivo puede ser llamada desde código multiplataforma, que devuelva un
resultado seguro (`null`, `[]`, no-op) en vez de fallar cuando `Platform.OS !== 'android'`.
