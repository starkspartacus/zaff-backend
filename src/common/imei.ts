/** IMEI valide : 15 chiffres dont le dernier est le chiffre de contrôle (Luhn). Propre à UN seul téléphone. */
export function isValidImei(raw: string | null | undefined): boolean {
  const code = (raw || '').replace(/[\s-]/g, '');
  if (!/^\d{15}$/.test(code)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(code[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}
