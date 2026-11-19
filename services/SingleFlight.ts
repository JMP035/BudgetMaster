// Candado de módulo de «una sola a la vez» (módulo PURO). Sirve para que dos copias de la pantalla de entrada (o dos
// disparadores: arranque y vuelta a primer plano) no corran a la vez la misma sincronización automática.

export interface SingleFlight {
  /** Corre `fn` si no hay otra en curso; si la hay, devuelve null SIN correr `fn`. El candado se suelta siempre (también si `fn` falla). */
  tryRun<T>(fn: () => Promise<T>): Promise<T | null>;
  /** true mientras corre una. */
  busy(): boolean;
}

export function createSingleFlight(): SingleFlight {
  let running = false;
  return {
    async tryRun<T>(fn: () => Promise<T>): Promise<T | null> {
      if (running) return null;
      running = true;
      try {
        return await fn();
      } finally {
        running = false;
      }
    },
    busy: () => running,
  };
}
