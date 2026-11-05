// Interruptores de funcionalidades según los ajustes del usuario.
// Por defecto (campo ausente) la sincronización SMS está encendida.
export const isSmsFeatureOn = (s: { smsEnabled?: boolean }) => s.smsEnabled !== false;
