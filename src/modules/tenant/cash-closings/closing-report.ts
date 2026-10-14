/** Rapport de clôture de caisse : texte (WhatsApp) et HTML (e-mail au patron). Fonction pure, testable. */

export interface ReportInput {
  shopName: string;
  currency: string;
  closing: {
    code: string;
    sellerName: string;
    openedAt: Date;
    closedAt: Date;
    salesCount: number;
    itemsCount: number;
    totals: { cash: number; mobile: number; card: number; bank_transfer: number; credit: number };
    totalAmount: number;
    refunds?: { cash: number; mobile: number; count: number };
    collections?: { amount: number; count: number };
    expectedCash: number;
    declaredCash: number;
    cashDifference: number;
    notes?: string | null;
  };
  sales: Array<{ invoiceNumber: number; total: number; paymentMethod: string; saleDate: Date; items: Array<{ productName: string; quantity: number; serialNumber?: string | null }> }>;
  consignments?: { units: number; value: number; overdueUnits: number; resellers: number };
}

const LABEL: Record<string, string> = { cash: 'Espèces', mobile: 'Mobile Money', card: 'Carte', bank_transfer: 'Virement', credit: 'À crédit' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function buildClosingReport(r: ReportInput) {
  const money = (n: number) => `${Math.round(n || 0).toLocaleString('fr-FR')} ${r.currency}`.replace(/ /g, ' ');
  const day = (d: Date) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hour = (d: Date) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const c = r.closing;
  const diff = c.cashDifference;
  const diffText = diff === 0 ? 'Caisse juste ✅' : diff < 0 ? `⚠️ Il manque ${money(-diff)}` : `⚠️ Excédent de ${money(diff)}`;
  const methods = (Object.keys(LABEL) as Array<keyof typeof c.totals>).filter((k) => c.totals[k]);
  const subject = `Clôture de caisse — ${c.sellerName} — ${day(c.closedAt)} — ${r.shopName}`;

  const lines = [
    `*Clôture de caisse ${c.code}* — ${r.shopName}`,
    `${c.sellerName} · du ${day(c.openedAt)} ${hour(c.openedAt)} au ${day(c.closedAt)} ${hour(c.closedAt)}`,
    '',
    `Ventes : ${c.salesCount} (${c.itemsCount} article${c.itemsCount > 1 ? 's' : ''})`,
    ...methods.map((k) => `• ${LABEL[k]} : ${money(c.totals[k])}`),
    c.refunds?.count ? `• Remboursements : −${money(c.refunds.cash + c.refunds.mobile)} (${c.refunds.count})` : '',
    c.collections?.count ? `• Reçu de clients à crédit : ${money(c.collections.amount)} (${c.collections.count})` : '',
    '',
    `Espèces attendues : ${money(c.expectedCash)}`,
    `Espèces comptées : ${money(c.declaredCash)}`,
    diffText,
    c.notes ? `Note : ${c.notes}` : '',
    r.consignments?.units
      ? `\nChez les revendeurs : ${r.consignments.units} appareil${r.consignments.units > 1 ? 's' : ''} (${money(r.consignments.value)})${r.consignments.overdueUnits ? `, dont ${r.consignments.overdueUnits} en retard` : ''}`
      : '',
    r.sales.length ? '\nDétail :' : '',
    ...r.sales.slice(0, 40).map((s) => `#${s.invoiceNumber} ${hour(s.saleDate)} · ${s.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ` : '') + i.productName + (i.serialNumber ? ` (${i.serialNumber})` : '')).join(', ')} · ${money(s.total)} · ${LABEL[s.paymentMethod] || s.paymentMethod}`),
    r.sales.length > 40 ? `… et ${r.sales.length - 40} autres ventes` : '',
  ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0));
  const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  const row = (k: string, v: string, strong = false) => `<tr><td style="padding:6px 0;color:#555">${esc(k)}</td><td style="padding:6px 0;text-align:right;${strong ? 'font-weight:700' : ''}">${esc(v)}</td></tr>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f6f3ec;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#1a1a1a;color:#e5b83b;border-radius:14px 14px 0 0;padding:18px 20px">
    <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#bbb">Clôture de caisse ${esc(c.code)}</div>
    <div style="font-size:20px;font-weight:700;margin-top:4px">${esc(r.shopName)}</div>
    <div style="font-size:13px;color:#ddd;margin-top:4px">${esc(c.sellerName)} · du ${day(c.openedAt)} ${hour(c.openedAt)} au ${day(c.closedAt)} ${hour(c.closedAt)}</div>
  </div>
  <div style="background:#fff;border-radius:0 0 14px 14px;padding:20px">
    <div style="padding:14px;border-radius:10px;background:${diff === 0 ? '#ecfdf5' : '#fff7ed'};color:${diff === 0 ? '#047857' : '#c2410c'};font-weight:700;text-align:center">${esc(diffText.replace(/[✅⚠️]\s?/g, ''))}</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:14px">
      ${row('Ventes', `${c.salesCount} (${c.itemsCount} article${c.itemsCount > 1 ? 's' : ''})`)}
      ${methods.map((k) => row(LABEL[k], money(c.totals[k]))).join('')}
      ${c.refunds?.count ? row('Remboursements', `−${money(c.refunds.cash + c.refunds.mobile)}`) : ''}
      ${c.collections?.count ? row('Reçu de clients à crédit', money(c.collections.amount)) : ''}
      ${row('Espèces attendues', money(c.expectedCash), true)}
      ${row('Espèces comptées', money(c.declaredCash), true)}
    </table>
    ${c.notes ? `<p style="font-size:13px;color:#555;background:#f6f3ec;border-radius:8px;padding:10px">Note du vendeur : ${esc(c.notes)}</p>` : ''}
    ${r.consignments?.units ? `<p style="font-size:13px;color:#92400e;background:#fffbeb;border-radius:8px;padding:10px">Chez les revendeurs : ${r.consignments.units} appareil(s), ${esc(money(r.consignments.value))}${r.consignments.overdueUnits ? ` — dont ${r.consignments.overdueUnits} en retard` : ''}</p>` : ''}
    ${r.sales.length ? `<h3 style="font-size:14px;margin:18px 0 6px">Détail des ventes</h3><table style="width:100%;border-collapse:collapse;font-size:12px">${r.sales
      .slice(0, 100)
      .map((s) => `<tr style="border-top:1px solid #eee"><td style="padding:6px 0">#${s.invoiceNumber} · ${hour(s.saleDate)}<br><span style="color:#666">${esc(s.items.map((i) => (i.quantity > 1 ? `${i.quantity}× ` : '') + i.productName + (i.serialNumber ? ` (${i.serialNumber})` : '')).join(', '))}</span></td><td style="padding:6px 0;text-align:right;white-space:nowrap">${esc(money(s.total))}<br><span style="color:#666">${esc(LABEL[s.paymentMethod] || s.paymentMethod)}</span></td></tr>`)
      .join('')}</table>` : ''}
    <p style="font-size:11px;color:#999;margin-top:18px">Rapport envoyé automatiquement par ZAFF à chaque clôture de caisse.</p>
  </div>
</div></body></html>`;
  return { subject, text, html };
}
