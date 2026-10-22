import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { fakeTenantConnection } from '../../../testing/fake-model';
import { SalesService } from '../sales/sales.service';
import { UnitsService } from './units.service';
import { SaleType } from '../../../common/enums/sale-type.enum';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';

const DB = 'zaff_tenant_test';
const owner = { userId: new Types.ObjectId().toString(), name: 'Patron', role: 'admin' };
const seller = { userId: new Types.ObjectId().toString(), name: 'Awa', role: 'seller' };

describe('Vente par scan : particulier, revendeur, crédit', () => {
  let conn: ReturnType<typeof fakeTenantConnection>;
  let units: UnitsService;
  let phone: any;
  let reseller: any;
  let client: any;

  beforeEach(async () => {
    conn = fakeTenantConnection({ ProductUnit: ['serialNumber'] });
    const notifications: any = { notify: async () => undefined, invalidate: () => undefined };
    const sales = new SalesService(conn as any, notifications);
    units = new UnitsService(conn as any, sales, notifications);
    phone = await conn.getModel(DB, 'Product').create({
      name: 'Galaxy A55', sku: 'A55', category: 'smartphones', salePrice: 250000, resellerPrice: 230000,
      purchasePrice: 210000, stockQuantity: 0, hasSerialNumbers: true,
    });
    const customers = conn.getModel(DB, 'Customer');
    reseller = await customers.create({ name: 'Kader Télécom', phone: '+2250707070707', isReseller: true, balance: 0 });
    client = await customers.create({ name: 'Mme Yao', phone: '+2250505050505', isReseller: false, balance: 0 });
    await units.addUnits(DB, { productId: String(phone._id), serialNumbers: ['IMEI1', 'IMEI2', 'IMEI3'] }, owner);
  });

  it('applique le tarif revendeur au revendeur choisi', async () => {
    const { sale } = await units.sell(DB, { serialNumber: 'IMEI1', customerId: String(reseller._id), saleType: SaleType.RESELLER, confirmation: 'scan' }, seller);
    expect(sale.total).toBe(230000);
    expect(sale.saleType).toBe(SaleType.RESELLER);
    expect(String(sale.customerId)).toBe(String(reseller._id));
  });

  it('prix public pour un particulier, même si le tarif revendeur est demandé sans revendeur', async () => {
    const { sale } = await units.sell(DB, { serialNumber: 'IMEI1', customerId: String(client._id), confirmation: 'scan' }, seller);
    expect(sale.total).toBe(250000);
    await expect(
      units.sell(DB, { serialNumber: 'IMEI2', customerId: String(client._id), saleType: SaleType.RESELLER }, seller),
    ).rejects.toThrow("n'est pas enregistré comme revendeur");
    // Même client retrouvé par son numéro : pas de tarif revendeur non plus
    await expect(
      units.sell(DB, { serialNumber: 'IMEI2', customerName: 'Yao', customerPhone: '+2250505050505', saleType: SaleType.RESELLER }, seller),
    ).rejects.toThrow("n'est pas enregistré comme revendeur");
    expect(conn.models.ProductUnit.docs.find((u) => u.serialNumber === 'IMEI2').status).toBe('in_stock');
  });

  it('vente à crédit au revendeur avec acompte : reste dû et dette du client', async () => {
    const { sale } = await units.sell(
      DB,
      { serialNumber: 'IMEI3', customerId: String(reseller._id), saleType: SaleType.RESELLER, paymentMethod: PaymentMethod.CREDIT, depositAmount: 30000, depositMethod: 'cash' },
      seller,
    );
    expect(sale.amountDue).toBe(200000);
    expect(sale.paymentStatus).toBe('partial');
    expect(conn.models.Customer.docs.find((c) => c._id === reseller._id).balance).toBe(200000);
  });

  it('un vendeur ne vend pas sous le prix d’achat, le propriétaire oui', async () => {
    await expect(units.sell(DB, { serialNumber: 'IMEI1', unitPrice: 200000 }, seller)).rejects.toBeInstanceOf(BadRequestException);
    const { sale } = await units.sell(DB, { serialNumber: 'IMEI1', unitPrice: 200000 }, owner);
    expect(sale.total).toBe(200000);
  });
});
