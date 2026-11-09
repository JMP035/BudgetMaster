// ─────────────────────────────────────────────────────────────
// CORPUS DE SMS BANCARIOS PARA PRUEBAS DEL PARSER
// ─────────────────────────────────────────────────────────────
// origin 'real'      → formato confirmado por el usuario o por el código/capturas.
// origin 'sintetico' → formato INFERIDO por familia de banco (Banrural, BI, G&T y
//                      varios de BAC); no hay muestras reales todavía. Cuando el
//                      usuario comparta casos reales (buzón de "Mensajes sin clasificar"
//                      y "Compartir muestra de mis SMS"), agregarlos aquí con origin 'real'.
//
// Todos los receivedAt están en hora local (se evalúan al cargar el módulo, así
// que el test fija process.env.TZ antes de cargar este archivo con require).

import type { Currency } from '../services/storage';
import type { SmsKind } from '../services/BankSmsParser';

export interface SmsCaseExpect {
  accepted: boolean;
  kind: SmsKind;
  amount?: number;
  currency?: Currency;
  txType?: 'income' | 'expense' | 'transfer';
  category?: string;
  merchant?: string;
  bank?: string;
  bankRef?: string;
  dateSource?: 'text' | 'received' | 'now';
  day?: string;        // YYYY-MM-DD en hora local
  hhmm?: string;       // HH:MM en hora local
  installments?: number;
}

export interface SmsCase {
  id: string;
  origin: 'real' | 'sintetico';
  body: string;
  address?: string;
  receivedAt?: number;
  expect: SmsCaseExpect;
}

const jul = (d: number, h: number, m: number) => new Date(2026, 6, d, h, m).getTime();
const aug = (d: number, h: number, m: number) => new Date(2026, 7, d, h, m).getTime();
const oct = (d: number, h: number, m: number) => new Date(2026, 9, d, h, m).getTime();
const nov = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m).getTime();

const INFO = '+Info:https://g.bac.gt/SMS';
const visa = (rest: string) => `PRF protege tu BAC VISA: ${rest} ${INFO}`;

export const R1_BODY = visa("compra Aprobada por Q 220.00 en CASTOR'S PIZZA KALU    GUATE el 04/10/26 20:54");
export const R4_BODY = visa('compra Aprobada por Q 687.20 en EEGSA WEB REF.:0000544 GUATE el 29/07/26 07:42');
export const R4C_BODY = visa('compra Aprobada por Q 687.20 en EEGSA WEB REF.:0000544 GUATE el 29/08/26 07:40');
export const R6_BODY = 'JACOB, tu Extra por Q.15,840 esta listo HOY con deposito inmediato en la App: https://g.bac.gt/Ex16/t/mLrnNl o WhatsApp: https://g.bac.gt/ExtraB';
export const S24_BODY = 'Abono a tarjeta de credito BAC ****1234 por Q 2,000.00 aplicado';
export const S47_BODY = 'Banrural: Se debito Q.50.00 de tu Cuenta en: PAGO EMPAGUA';
export const M1_BODY = visa('compra Aprobada por Q 375.00 en LA TRAMA    GUATE el 10/10/26 14:05');
export const M2_BODY = visa('compra Aprobada por Q 15.00 en GOURMELT ZONA 11    GUATE el 10/10/26 16:30');
// BANRURAL: formato inferido (ver comentario de B1-B5): pedir el texto real con la herramienta de muestra.
export const B1_BODY = 'Banrural: Se debito Q.200.00 de tu Cuenta ****5678';
export const B5_BODY = 'Banrural: Se debito Q.6.00 de tu Cuenta ****5678 en: AGENCIA CENTRAL.';

export const SMS_CORPUS: SmsCase[] = [
  // ───────────── Reales ─────────────
  { id: 'R1', origin: 'real', body: R1_BODY, receivedAt: oct(5, 2, 10),
    expect: { accepted: true, kind: 'purchase', amount: 220, currency: 'Q', txType: 'expense', category: 'food',
      merchant: "Castor's Pizza Kalu", day: '2026-10-04', hhmm: '20:54', dateSource: 'text' } },
  { id: 'R2', origin: 'real', body: visa('compra Aprobada por Q 2,550.00 en OPTICA ALPI STORE PERI 10 PAG el 24/07/26 21:22'),
    receivedAt: jul(24, 21, 30),
    expect: { accepted: true, kind: 'installment_purchase', amount: 2550, installments: 10, txType: 'expense',
      day: '2026-07-24', hhmm: '21:22' } },
  { id: 'R3', origin: 'real', body: visa('compra Aprobada por Q 5,799.00 en TELGUA AGEN PLZ SAN NICO 48PAG el 26/07/26 10:33'),
    receivedAt: jul(26, 10, 40),
    expect: { accepted: true, kind: 'installment_purchase', amount: 5799, installments: 48, category: 'internet' } },
  { id: 'R4a', origin: 'real', body: R4_BODY, receivedAt: jul(29, 7, 50),
    expect: { accepted: true, kind: 'purchase', amount: 687.2, category: 'utilities', day: '2026-07-29', hhmm: '07:42',
      bankRef: '0000544' } },
  { id: 'R4b', origin: 'real', body: R4_BODY, receivedAt: jul(29, 7, 50),
    expect: { accepted: true, kind: 'purchase', amount: 687.2, category: 'utilities', day: '2026-07-29' } },
  { id: 'R4c', origin: 'real', body: R4C_BODY, receivedAt: aug(29, 7, 50),
    expect: { accepted: true, kind: 'purchase', amount: 687.2, category: 'utilities', day: '2026-08-29', hhmm: '07:40' } },
  { id: 'R5', origin: 'real',
    body: 'Un apoyo EXTRA hace la diferencia! Tienes hasta Q21,440 disponibles. Desembólsalo en segundos desde tu App https://g.bac.gt/EXN3007/t/iTLrMB',
    receivedAt: oct(5, 9, 0), expect: { accepted: false, kind: 'promo' } },
  { id: 'R6', origin: 'real', body: R6_BODY, receivedAt: oct(5, 9, 5),
    expect: { accepted: false, kind: 'promo' } },
  { id: 'R7', origin: 'real', body: visa('compra Aprobada por Q 15.00 en PARQUEO PERI ROOSEVELT    GUATE el 05/10/26 12:10'),
    receivedAt: oct(5, 12, 12),
    expect: { accepted: true, kind: 'purchase', amount: 15, category: 'transport', currency: 'Q' } },
  { id: 'R8', origin: 'real', body: visa('compra Aprobada por USD 1.99 en GOOGLE *Google One    855-836-3987 el 02/10/26 03:15'),
    receivedAt: oct(2, 3, 20),
    expect: { accepted: true, kind: 'purchase', amount: 1.99, currency: 'USD', category: 'subscriptions' } },

  // ───────────── Sintéticos ─────────────
  { id: 'S1', origin: 'sintetico', body: 'PRF protege tu BAC MASTERCARD: compra Aprobada por USD 45.00 en AMAZON MKTPLACE    SEATTLE el 03/10/26 09:12 ' + INFO,
    receivedAt: oct(3, 9, 15), expect: { accepted: true, kind: 'purchase', amount: 45, currency: 'USD', category: 'shopping' } },
  { id: 'S2', origin: 'sintetico', body: visa('compra Aprobada por Q 1,234.50 en SUPER 24 #12 MIXCO    MIXCO el 01/10/26 08:00'),
    receivedAt: oct(1, 8, 2),
    expect: { accepted: true, kind: 'purchase', amount: 1234.5, category: 'groceries', merchant: 'Super 24 #12 Mixco' } },
  { id: 'S3', origin: 'sintetico', body: visa('compra Aprobada por Q.15,840.00 en ELEKTRA PERIFERICO    GUATE el 06/10/26 16:40'),
    receivedAt: oct(6, 16, 41), expect: { accepted: true, kind: 'purchase', amount: 15840, category: 'shopping' } },
  { id: 'S4', origin: 'sintetico', body: visa('compra Aprobada por Q 99.99 en UBER *EATS    GUATE el 07/10/26 21:00'),
    receivedAt: oct(7, 21, 1), expect: { accepted: true, kind: 'purchase', amount: 99.99, category: 'food' } },
  { id: 'S5', origin: 'sintetico', body: visa('compra Aprobada por Q 35.00 en UBER *TRIP    GUATE el 07/10/26 23:10'),
    receivedAt: oct(7, 23, 11), expect: { accepted: true, kind: 'purchase', amount: 35, category: 'transport' } },
  { id: 'S6', origin: 'sintetico', body: visa('compra Aprobada por Q 300.00 en GASOLINERA UNO LAS AMERICAS    GUATE el 08/10/26 07:30'),
    receivedAt: oct(8, 7, 31), expect: { accepted: true, kind: 'purchase', amount: 300, category: 'fuel' } },
  { id: 'S7', origin: 'sintetico', body: visa('compra Aprobada por Q 100.00 en EUREKA STORE    GUATE el 08/10/26 10:00'),
    receivedAt: oct(8, 10, 1), expect: { accepted: true, kind: 'purchase', amount: 100, currency: 'Q' } },
  { id: 'S8', origin: 'sintetico', body: "PRF protege tu BAC VISA: compra Aprobada por Q 220.00 en CASTOR'S PIZZA KALU    GUATE el 04/10/26 20:54. Saldo disponible Q 5,000.00",
    receivedAt: oct(4, 20, 55), expect: { accepted: true, kind: 'purchase', amount: 220, currency: 'Q' } },
  { id: 'S9', origin: 'sintetico', body: visa('compra Aprobada por Q 3,600.00 en CEMACO PRADERA 12 PAG el 09/10/26 15:00'),
    receivedAt: oct(9, 15, 1),
    expect: { accepted: true, kind: 'installment_purchase', amount: 3600, installments: 12, merchant: 'Cemaco Pradera' } },
  { id: 'S10', origin: 'sintetico', body: 'BAC: Compra con tarjeta de debito ****1234 aprobada por Q 89.50 en FARMACIA GALENO Z10 el 06/10/26 18:02',
    receivedAt: oct(6, 18, 3),
    expect: { accepted: true, kind: 'purchase', amount: 89.5, category: 'pharmacy', hhmm: '18:02' } },
  { id: 'S11', origin: 'sintetico', body: 'BAC Credomatic: Retiro en cajero ATM por Q 500.00 de tu cuenta ****1234 el 02/10/26 13:00',
    receivedAt: oct(2, 13, 1),
    expect: { accepted: true, kind: 'atm_withdrawal', amount: 500, txType: 'expense', category: 'atm', bank: 'BAC' } },
  { id: 'S12', origin: 'sintetico', body: 'BANRURAL: Retiro ATM Q.1,000.00 Cta ***5678 06/10/2026 10:15',
    receivedAt: oct(6, 10, 16),
    expect: { accepted: true, kind: 'atm_withdrawal', amount: 1000, category: 'atm', bank: 'BANRURAL', hhmm: '10:15' } },
  { id: 'S13', origin: 'sintetico', body: 'BAC Credomatic: Notificacion de debito por Q 150.00 en cuenta ****1234 por PAGO EEGSA',
    receivedAt: oct(7, 10, 0),
    expect: { accepted: true, kind: 'debit', amount: 150, txType: 'expense', category: 'utilities' } },
  { id: 'S14', origin: 'sintetico', body: 'Banrural: Se debito Q.75.00 de tu Cuenta 3012XXXX en: PAGO TIGO RESIDENCIAL.',
    receivedAt: oct(7, 11, 0), expect: { accepted: true, kind: 'debit', amount: 75, category: 'internet', bank: 'BANRURAL' } },
  { id: 'S15', origin: 'sintetico', body: 'BI: Consumo con Tarjeta de Debito por Q.250.00 en LA TORRE ZONA 14 Fecha: 03/10/2026 Hora: 19:22',
    receivedAt: oct(3, 19, 23),
    expect: { accepted: true, kind: 'purchase', amount: 250, category: 'groceries', bank: 'BI', day: '2026-10-03', hhmm: '19:22' } },
  { id: 'S16', origin: 'sintetico', body: 'G&T Continental: Transaccion autorizada por Q 180.00 en POLLO CAMPERO MAJADAS el 05/10/2026 13:05',
    receivedAt: oct(5, 13, 6), expect: { accepted: true, kind: 'purchase', amount: 180, category: 'food', bank: 'GYT' } },
  { id: 'S17', origin: 'sintetico', body: 'BAC: Se acredito Q 8,500.00 a tu cuenta ****1234 por PAGO DE PLANILLA',
    receivedAt: oct(1, 7, 0), expect: { accepted: true, kind: 'payroll', amount: 8500, txType: 'income', category: 'salary' } },
  { id: 'S18', origin: 'sintetico', body: 'BANRURAL: Se acredito Q.6,200.00 a tu cuenta ***5678 PLANILLA MINDEF',
    receivedAt: oct(1, 7, 5), expect: { accepted: true, kind: 'payroll', amount: 6200, txType: 'income', category: 'military' } },
  { id: 'S19', origin: 'sintetico', body: 'Banrural: Se acredito Q.3,250.00 a tu cuenta ****5678 por transferencia',
    receivedAt: oct(2, 9, 0), expect: { accepted: true, kind: 'transfer_in', amount: 3250, txType: 'income', category: 'transfer_in' } },
  { id: 'S20', origin: 'sintetico', body: 'BI: Recibiste una transferencia de Q 500.00 de JUAN PEREZ a tu cuenta ****9012',
    receivedAt: oct(2, 9, 30), expect: { accepted: true, kind: 'transfer_in', amount: 500, txType: 'income', bank: 'BI' } },
  { id: 'S21', origin: 'sintetico', body: 'BAC: Transferencia ACH enviada por Q 1,200.00 a cuenta ****4455 BANRURAL. Referencia: 88123344',
    receivedAt: oct(3, 12, 0),
    expect: { accepted: true, kind: 'transfer_out', amount: 1200, txType: 'expense', category: 'transfer', bankRef: '88123344', bank: 'BAC' } },
  { id: 'S22', origin: 'sintetico', body: 'BAC: Transferencia entre tus cuentas por Q 2,000.00 realizada con exito',
    receivedAt: oct(3, 12, 30), expect: { accepted: false, kind: 'own_transfer' } },
  { id: 'S23', origin: 'sintetico', body: 'BAC: Hemos recibido tu pago de Q 1,500.00 a tu tarjeta VISA ****1234. Gracias',
    receivedAt: oct(4, 10, 0), expect: { accepted: true, kind: 'card_payment', amount: 1500, txType: 'transfer' } },
  { id: 'S24', origin: 'sintetico', body: S24_BODY, receivedAt: oct(4, 10, 30),
    expect: { accepted: true, kind: 'card_payment', amount: 2000, txType: 'transfer' } },
  { id: 'S25', origin: 'sintetico', body: 'BAC: Deposito en efectivo acreditado a tu cuenta ****1234 por Q 3,000.00',
    receivedAt: oct(4, 15, 0), expect: { accepted: true, kind: 'deposit', amount: 3000, txType: 'income', category: 'other' } },
  { id: 'S26', origin: 'sintetico', body: "BAC: Reverso de compra por Q 220.00 en CASTOR'S PIZZA aplicado a tu tarjeta ****1234",
    receivedAt: oct(5, 11, 0), expect: { accepted: true, kind: 'refund', amount: 220, txType: 'income', category: 'other' } },
  { id: 'S27', origin: 'sintetico', body: 'BAC: Tu compra por Q 99.00 en SHEIN fue anulada',
    receivedAt: oct(5, 11, 30), expect: { accepted: true, kind: 'refund', amount: 99, txType: 'income' } },
  { id: 'S28', origin: 'sintetico', body: 'BAC: compra no aprobada por Q 300.00 en AMAZON fondos insuficientes',
    receivedAt: oct(5, 12, 0), expect: { accepted: false, kind: 'declined' } },
  { id: 'S29', origin: 'sintetico', body: 'BAC: Transaccion rechazada por Q 50.00 en STEAM',
    receivedAt: oct(5, 12, 5), expect: { accepted: false, kind: 'declined' } },
  { id: 'S30', origin: 'sintetico', body: 'BAC VISA: Compra declinada por USD 20.00 en NETFLIX',
    receivedAt: oct(5, 12, 10), expect: { accepted: false, kind: 'declined' } },
  { id: 'S31', origin: 'sintetico', body: 'BAC: Tu codigo de verificacion es 482913 para la compra por Q 500.00 en AMAZON. No lo compartas',
    receivedAt: oct(5, 12, 15), expect: { accepted: false, kind: 'otp' } },
  { id: 'S32', origin: 'sintetico', body: 'BAC: 123456 es tu token para autorizar transferencia de Q 1,000.00',
    receivedAt: oct(5, 12, 20), expect: { accepted: false, kind: 'otp' } },
  { id: 'S33', origin: 'sintetico', body: 'Aprovecha 12 cuotas sin intereses en compras mayores a Q 1,000 con tu BAC VISA',
    receivedAt: oct(6, 9, 0), expect: { accepted: false, kind: 'promo' } },
  { id: 'S34', origin: 'sintetico', body: 'Tu tarjeta BAC tiene Q 25,000 pre-aprobados. Solicitalo llamando al 2361-0909',
    receivedAt: oct(6, 9, 5), expect: { accepted: false, kind: 'promo' } },
  { id: 'S35', origin: 'sintetico', body: 'BAC: Solicitud recibida. Tu prestamo por Q 10,000 esta en proceso',
    receivedAt: oct(6, 9, 10), expect: { accepted: false, kind: 'promo' } },
  { id: 'S36', origin: 'sintetico', body: 'Deposito inmediato! Prestamo personal BAC hasta Q 50,000 en minutos',
    receivedAt: oct(6, 9, 15), expect: { accepted: false, kind: 'promo' } },
  { id: 'S37', origin: 'sintetico', body: 'Gana Q 500 de cashback participando con tu BAC VISA',
    receivedAt: oct(6, 9, 20), expect: { accepted: false, kind: 'promo' } },
  { id: 'S38', origin: 'sintetico', body: 'BAC: Recuerda tu pago minimo de Q 350.00, fecha limite 15/10/26',
    receivedAt: oct(7, 9, 0), expect: { accepted: false, kind: 'statement' } },
  { id: 'S39', origin: 'sintetico', body: 'BAC: Tu saldo disponible es Q 5,320.10 al 05/10/26',
    receivedAt: oct(7, 9, 5), expect: { accepted: false, kind: 'balance_info' } },
  { id: 'S40', origin: 'sintetico', body: 'BAC: Se acredito el desembolso de tu Extra por Q 15,840.00 a tu cuenta ****1234',
    receivedAt: oct(7, 9, 10),
    expect: { accepted: true, kind: 'loan_disbursement', amount: 15840, txType: 'transfer', category: 'transfer' } },
  { id: 'S41', origin: 'sintetico', address: '+50255551234',
    body: 'BAC: compra Aprobada por Q 4,500.00, si no la reconoces verifica en https://bac-gt-seguro.com',
    receivedAt: oct(7, 9, 15), expect: { accepted: false, kind: 'phishing' } },
  { id: 'S42', origin: 'sintetico', address: 'Tigo', body: 'Tigo: Tu pago de Q 100.00 fue recibido. Gracias',
    receivedAt: oct(7, 9, 20), expect: { accepted: false, kind: 'not_bank' } },
  { id: 'S43', origin: 'sintetico', address: '+50244443333', body: 'Hola, te deposito los Q 200 mañana',
    receivedAt: oct(7, 9, 25), expect: { accepted: false, kind: 'not_bank' } },
  { id: 'S44', origin: 'sintetico', body: 'BAC: Notificacion de debito por Q 1.234,50 en cuenta ****1234',
    receivedAt: oct(7, 9, 30), expect: { accepted: true, kind: 'debit', amount: 1234.5 } },
  { id: 'S45', origin: 'sintetico', body: 'BAC VISA: compra Aprobada por Q 220.00 en PIZZA X    GUATE el 31/02/26 20:54',
    receivedAt: oct(5, 10, 0),
    expect: { accepted: true, kind: 'purchase', amount: 220, dateSource: 'received', day: '2026-10-05' } },
  { id: 'S46', origin: 'sintetico', body: 'BAC VISA: compra Aprobada por Q 75.00 en TIENDA X    GUATE el 10/03/26 09:00',
    receivedAt: oct(3, 9, 5),
    expect: { accepted: true, kind: 'purchase', amount: 75, dateSource: 'text', day: '2026-10-03', hhmm: '09:00' } },
  { id: 'S47a', origin: 'sintetico', body: S47_BODY, receivedAt: oct(3, 10, 0),
    expect: { accepted: true, kind: 'debit', amount: 50, category: 'utilities', dateSource: 'received', day: '2026-10-03' } },
  { id: 'S47b', origin: 'sintetico', body: S47_BODY, receivedAt: oct(4, 10, 0),
    expect: { accepted: true, kind: 'debit', amount: 50, category: 'utilities', dateSource: 'received', day: '2026-10-04' } },
  { id: 'S48', origin: 'sintetico', body: 'BAC: Inicio de sesion en Banca en Linea desde un dispositivo nuevo',
    receivedAt: oct(7, 9, 35), expect: { accepted: false, kind: 'security' } },

  // ───────────── Reales: avisos informativos y SMS que no son del banco ─────────────
  // (en los reales el enlace llegaba acortado con "…" al compartirlo; aquí va un token plausible)
  { id: 'N1', origin: 'real', body: 'BANRURAL: Cuenta ****0055 de BANCO INDUSTRIAL, S.A. asociada en Android desde APP BANRURAL en REA-NX9 info. ######',
    receivedAt: nov(2, 9, 0), expect: { accepted: false, kind: 'notice', bank: 'BANRURAL' } },
  { id: 'N2', origin: 'real', body: 'Estimado cliente, su tarjeta BAC Credomatic **5031 ha sido reanudada en el servicio APPLE PAY.',
    receivedAt: nov(2, 9, 5), expect: { accepted: false, kind: 'notice', bank: 'BAC' } },
  { id: 'N3', origin: 'real', body: 'Estimado cliente, su tarjeta BAC Credomatic **2710 ha sido activada en el servicio GOOGLE PAY.',
    receivedAt: nov(2, 9, 10), expect: { accepted: false, kind: 'notice', bank: 'BAC' } },
  { id: 'N4', origin: 'real', body: 'Alcanzaste el 100% del limite de tu tarjeta BAC 5031. Sigue disfrutando de los beneficios, consulta las opciones de pago en https://g.bac.gt/BACTj',
    receivedAt: nov(2, 9, 15), expect: { accepted: false, kind: 'notice' } },
  { id: 'N5', origin: 'real', body: 'Tigo te agradece el pago de tus servicios! Consulta tu plan y la fecha de acreditacion de tus beneficios AQUI http://tgo.gt/plapp17',
    receivedAt: nov(2, 9, 20), expect: { accepted: false, kind: 'not_bank' } },
  { id: 'N6', origin: 'real', body: 'Hoy se vive El Clasico Espanol! Barcelona vs Real Madrid EN VIVO por ViX+. Contratalo aqui: https://tgo.gt/vixm11 No te lo pierdas ya!',
    receivedAt: nov(2, 9, 25), expect: { accepted: false, kind: 'not_bank' } },
  { id: 'N7', origin: 'real', body: 'Reactiva tu plan con todos sus beneficios al poner tu cuenta al dia Aqui http://tgo.gt/smspagomc',
    receivedAt: nov(2, 9, 30), expect: { accepted: false, kind: 'not_bank' } },

  // ───────────── Reales: promociones del banco ─────────────
  { id: 'P1', origin: 'real', body: 'Temporada Black! Sabados de nov con Tarjeta Walmart 15% de ahorro en Walmart, Paiz, Maxi Desp y Desp Fam. Inscribete https://g.bac.gt/Pr0m1',
    receivedAt: nov(2, 10, 0), expect: { accepted: false, kind: 'promo' } },
  { id: 'P2', origin: 'real', body: 'NOMBRE, tienes disponible un Extra por Q.15,440 Solicitalo en minutos y recibe el dinero en tu cuenta, aprende aqui: https://g.bac.gt/Pr0m2',
    receivedAt: nov(2, 10, 5), expect: { accepted: false, kind: 'promo' } },
  { id: 'P3', origin: 'real', body: 'Regresa a recargar INTERNET o SALDO en App BAC y participa en el sorteo de recargas gratis por hasta Q150, hazlo aqui https://g.bac.gt/Pr0m3',
    receivedAt: nov(2, 10, 10), expect: { accepted: false, kind: 'promo' } },
  { id: 'P4', origin: 'real', body: 'Tienes 14600 disponible con tu Tarjeta Walmart. Compra a 24 cuotas y te devolvemos 1cuota. Hasta 24nov Inscribete: https://g.bac.gt/Pr0m4',
    receivedAt: nov(2, 10, 15), expect: { accepted: false, kind: 'promo' } },
  { id: 'P5', origin: 'real', body: 'JACOB dejaste pendiente tu solicitud de Extra por Q.15,840 Retoma el proceso ahora desde Banca Movil. Mira como: https://g.bac.gt/Pr0m5',
    receivedAt: nov(2, 10, 20), expect: { accepted: false, kind: 'promo' } },
  { id: 'P6', origin: 'real', body: 'Ultimos dias de Autoshow! Aprovecha tu precalificacion y nuestras promociones especiales para adquirir tu proximo auto. https://g.bac.gt/Pr0m6',
    receivedAt: nov(2, 10, 25), expect: { accepted: false, kind: 'promo' } },
  { id: 'P7', origin: 'real', body: 'Estrena eso que quieres con Cuotas BAC. Compra a 24 MSI con tu tarjeta Walmart y te devolemos 1 cuota. Inscribite: https://g.bac.gt/Pr0m7',
    receivedAt: nov(2, 10, 30), expect: { accepted: false, kind: 'promo' } },
  { id: 'P8', origin: 'real', body: 'ULTIMO DIA! Inscribete antes del 19 de octubre, realiza una transferencia y participa por un iPhone 17. Inscribete aqui https://g.bac.gt/Pr0m8',
    receivedAt: nov(2, 10, 35), expect: { accepted: false, kind: 'promo' } },
  { id: 'P9', origin: 'real', body: 'Comparte tu Tarjeta CASHBACK con alguien especial y multiplica sus beneficios. Solicita una Extension de Tarjeta aqui: https://g.bac.gt/Pr0m9',
    receivedAt: nov(2, 10, 40), expect: { accepted: false, kind: 'promo' } },
  { id: 'P10', origin: 'real', body: 'NOMBRE, tu Extra por Q.15,840 esta listo HOY con deposito inmediato en la App: https://g.bac.gt/Pr0m10 o WhatsApp: https://g.bac.gt/ExtraB',
    receivedAt: nov(2, 10, 45), expect: { accepted: false, kind: 'promo' } },

  // ───────────── Comercios de Guatemala (formato BAC realista, comercios reportados por el usuario) ─────────────
  { id: 'M1', origin: 'sintetico', body: M1_BODY, receivedAt: oct(10, 14, 8),
    expect: { accepted: true, kind: 'purchase', amount: 375, category: 'food', merchant: 'La Trama' } },
  { id: 'M2', origin: 'sintetico', body: M2_BODY, receivedAt: oct(10, 16, 33),
    expect: { accepted: true, kind: 'purchase', amount: 15, category: 'food', merchant: 'Gourmelt Zona 11' } },
  { id: 'M3', origin: 'sintetico', body: visa('compra Aprobada por Q 119.00 en EL MARINERO MIRAFLORES    GUATE el 11/10/26 13:15'),
    receivedAt: oct(11, 13, 17), expect: { accepted: true, kind: 'purchase', amount: 119, category: 'food' } },
  { id: 'M4', origin: 'sintetico', body: visa('compra Aprobada por Q 20.00 en PARQUEOS    GUATE el 11/10/26 15:00'),
    receivedAt: oct(11, 15, 2), expect: { accepted: true, kind: 'purchase', amount: 20, category: 'transport' } },
  { id: 'M5', origin: 'sintetico', body: visa('compra Aprobada por Q 100.00 en ESTACION DE SERVICIO J    GUATE el 12/10/26 07:45'),
    receivedAt: oct(12, 7, 47),
    expect: { accepted: true, kind: 'purchase', amount: 100, category: 'fuel', merchant: 'Estacion de Servicio J' } },
  { id: 'M6', origin: 'sintetico', body: visa('compra Aprobada por Q 157.40 en LA MEGAPACA MONTSERRAT    GUATE el 12/10/26 11:20'),
    receivedAt: oct(12, 11, 22), expect: { accepted: true, kind: 'purchase', amount: 157.4, category: 'clothes' } },
  { id: 'M7', origin: 'sintetico', body: visa('compra Aprobada por Q 210.00 en PARMA    GUATE el 12/10/26 20:10'),
    receivedAt: oct(12, 20, 12), expect: { accepted: true, kind: 'purchase', amount: 210, category: 'food' } },
  { id: 'M8', origin: 'sintetico', body: visa('compra Aprobada por Q 180.00 en ANFORA    GUATE el 13/10/26 13:40'),
    receivedAt: oct(13, 13, 42), expect: { accepted: true, kind: 'purchase', amount: 180, category: 'food' } },
  { id: 'M9', origin: 'sintetico', body: visa('compra Aprobada por USD 20.00 en ANTHROPIC CLAUDE SUB    SAN FRANCISCO el 13/10/26 02:00'),
    receivedAt: oct(13, 2, 3),
    expect: { accepted: true, kind: 'purchase', amount: 20, currency: 'USD', category: 'subscriptions' } },
  { id: 'M10', origin: 'sintetico', body: visa('compra Aprobada por USD 50.00 en STARLINK    HAWTHORNE el 14/10/26 03:10'),
    receivedAt: oct(14, 3, 12), expect: { accepted: true, kind: 'purchase', amount: 50, currency: 'USD', category: 'internet' } },
  { id: 'M11', origin: 'sintetico', body: visa('compra Aprobada por Q 340.00 en SUMA    GUATE el 14/10/26 18:00'),
    receivedAt: oct(14, 18, 2), expect: { accepted: true, kind: 'purchase', amount: 340, category: 'groceries' } },
  { id: 'M12', origin: 'sintetico', body: visa('compra Aprobada por Q 95.00 en SAN MARTIN    GUATE el 14/10/26 08:15'),
    receivedAt: oct(14, 8, 17), expect: { accepted: true, kind: 'purchase', amount: 95, category: 'food' } },
  { id: 'M13', origin: 'sintetico', body: visa('compra Aprobada por Q 195.00 en TRANSPORTES ROSITA    GUATE el 15/10/26 06:30'),
    receivedAt: oct(15, 6, 32), expect: { accepted: true, kind: 'purchase', amount: 195, category: 'transport' } },
  { id: 'M14', origin: 'sintetico', body: visa("compra Aprobada por Q 150.00 en CARL'S JR ZONA 10    GUATE el 15/10/26 13:20"),
    receivedAt: oct(15, 13, 22),
    expect: { accepted: true, kind: 'purchase', amount: 150, category: 'food', merchant: "Carl's Jr Zona 10" } },
  { id: 'M15', origin: 'sintetico', body: visa('compra Aprobada por Q 99.75 en PAGGO APP RESTAURAN    GUATE el 15/10/26 14:00'),
    receivedAt: oct(15, 14, 2), expect: { accepted: true, kind: 'purchase', amount: 99.75, category: 'food' } },
  { id: 'M16', origin: 'sintetico', body: visa('compra Aprobada por Q 1,029.00 en SOLUCIONES TECNOLOGICA    GUATE el 16/10/26 10:30'),
    receivedAt: oct(16, 10, 32), expect: { accepted: true, kind: 'purchase', amount: 1029, category: 'tech' } },
  { id: 'M17', origin: 'sintetico', body: visa('compra Aprobada por USD 20.00 en OPENAI *CHATGPT SUBSCR    SAN FRANCISCO el 16/10/26 04:00'),
    receivedAt: oct(16, 4, 2),
    expect: { accepted: true, kind: 'purchase', amount: 20, currency: 'USD', category: 'subscriptions' } },

  // ───────────── Contraejemplos: reglas de comercio que NO deben disparar ─────────────
  { id: 'F1', origin: 'sintetico', body: visa('compra Aprobada por Q 60.00 en FARMACIA BATRES    SAN MARTIN el 17/10/26 09:00'),
    receivedAt: oct(17, 9, 2), expect: { accepted: true, kind: 'purchase', amount: 60, category: 'pharmacy' } },
  { id: 'F2', origin: 'sintetico', body: visa('compra Aprobada por Q 900.00 en HOTEL SAN MARTIN    ANTIGUA el 17/10/26 12:00'),
    receivedAt: oct(17, 12, 2), expect: { accepted: true, kind: 'purchase', amount: 900, category: 'travel' } },
  { id: 'F3', origin: 'sintetico', body: visa('compra Aprobada por Q 45.00 en CONSUMAX TIENDA    GUATE el 17/10/26 17:00'),
    receivedAt: oct(17, 17, 2), expect: { accepted: true, kind: 'purchase', amount: 45, category: 'shopping' } },
  { id: 'F4', origin: 'sintetico', body: visa('compra Aprobada por Q 350.00 en PACAYA TOURS    ESCUINTLA el 18/10/26 08:00'),
    receivedAt: oct(18, 8, 2), expect: { accepted: true, kind: 'purchase', amount: 350, category: 'other' } },
  { id: 'F5', origin: 'sintetico', body: visa('compra Aprobada por Q 120.00 en PAGGO APP FERRETERIA EL    GUATE el 18/10/26 10:00'),
    receivedAt: oct(18, 10, 2), expect: { accepted: true, kind: 'purchase', amount: 120, category: 'other' } },
  { id: 'F6', origin: 'sintetico', body: visa('compra Aprobada por USD 999.00 en APPLE STORE OAKLAND el 18/10/26 15:00'),
    receivedAt: oct(18, 15, 2), expect: { accepted: true, kind: 'purchase', amount: 999, currency: 'USD', category: 'other' } },

  // ───────────── BANRURAL (formato inferido: pedir el texto real con la herramienta de muestra) ─────────────
  { id: 'B1', origin: 'sintetico', body: B1_BODY, receivedAt: nov(3, 14, 20),
    expect: { accepted: true, kind: 'transfer_out', amount: 200, category: 'transfer', txType: 'expense', bank: 'BANRURAL' } },
  { id: 'B2', origin: 'sintetico', body: 'Banrural: Se debito Q.5.00 de tu Cuenta ****5678 en: PLAZA ATANASIO TZUL,.', receivedAt: nov(3, 14, 20),
    expect: { accepted: true, kind: 'bank_fee', amount: 5, category: 'bank_fees', merchant: 'Plaza Atanasio Tzul' } },
  { id: 'B3', origin: 'sintetico', body: 'BANRURAL: Cobro de comision por transferencia Q.5.00 cuenta ****5678', receivedAt: nov(3, 14, 22),
    expect: { accepted: true, kind: 'bank_fee', amount: 5, category: 'bank_fees', txType: 'expense' } },
  { id: 'B4', origin: 'sintetico', body: 'BANRURAL: Deposito recibido por Q.515.00 a tu cuenta ****5678', receivedAt: nov(3, 16, 0),
    expect: { accepted: true, kind: 'transfer_in', amount: 515, txType: 'income', category: 'transfer_in' } },
  { id: 'B5', origin: 'sintetico', body: B5_BODY, receivedAt: nov(3, 14, 21),
    expect: { accepted: true, kind: 'debit', amount: 6, category: 'other', txType: 'expense' } },
];
