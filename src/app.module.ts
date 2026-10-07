import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { EstablishmentsModule } from './modules/global/establishments/establishments.module';
import { DirectoryModule } from './modules/global/directory/directory.module';
import { ReferenceModule } from './modules/global/reference/reference.module';
import { ImagesModule } from './modules/global/images/images.module';
import { DevicesModule } from './modules/global/devices/devices.module';
import { PlatformModule } from './modules/global/platform/platform.module';
import { GeoModule } from './modules/global/geo/geo.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { AuthModule } from './modules/tenant/auth/auth.module';
import { UsersModule } from './modules/tenant/users/users.module';
import { CatalogModule } from './modules/tenant/catalog/catalog.module';
import { StockModule } from './modules/tenant/stock/stock.module';
import { SalesModule } from './modules/tenant/sales/sales.module';
import { InvoicesModule } from './modules/tenant/invoices/invoices.module';
import { CustomersModule } from './modules/tenant/customers/customers.module';
import { SuppliersModule } from './modules/tenant/suppliers/suppliers.module';
import { RepairsModule } from './modules/tenant/repairs/repairs.module';
import { WarrantiesModule } from './modules/tenant/warranties/warranties.module';
import { AnalyticsModule } from './modules/tenant/analytics/analytics.module';
import { UnitsModule } from './modules/tenant/units/units.module';
import { CashClosingsModule } from './modules/tenant/cash-closings/cash-closings.module';
import { SettingsModule } from './modules/tenant/settings/settings.module';
import { ReturnsModule } from './modules/tenant/returns/returns.module';
import { ContractsModule } from './modules/tenant/contracts/contracts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    DirectoryModule,
    ReferenceModule,
    ImagesModule,
    DevicesModule,
    PlatformModule,
    GeoModule,
    RealtimeModule,
    EstablishmentsModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    StockModule,
    SalesModule,
    InvoicesModule,
    CustomersModule,
    SuppliersModule,
    RepairsModule,
    WarrantiesModule,
    AnalyticsModule,
    UnitsModule,
    CashClosingsModule,
    SettingsModule,
    ReturnsModule,
    ContractsModule,
  ],
})
export class AppModule {}
