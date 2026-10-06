"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const configuration_1 = __importDefault(require("./config/configuration"));
const database_module_1 = require("./database/database.module");
const establishments_module_1 = require("./modules/global/establishments/establishments.module");
const auth_module_1 = require("./modules/tenant/auth/auth.module");
const users_module_1 = require("./modules/tenant/users/users.module");
const catalog_module_1 = require("./modules/tenant/catalog/catalog.module");
const stock_module_1 = require("./modules/tenant/stock/stock.module");
const sales_module_1 = require("./modules/tenant/sales/sales.module");
const invoices_module_1 = require("./modules/tenant/invoices/invoices.module");
const customers_module_1 = require("./modules/tenant/customers/customers.module");
const suppliers_module_1 = require("./modules/tenant/suppliers/suppliers.module");
const repairs_module_1 = require("./modules/tenant/repairs/repairs.module");
const warranties_module_1 = require("./modules/tenant/warranties/warranties.module");
const analytics_module_1 = require("./modules/tenant/analytics/analytics.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
            }),
            database_module_1.DatabaseModule,
            establishments_module_1.EstablishmentsModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            catalog_module_1.CatalogModule,
            stock_module_1.StockModule,
            sales_module_1.SalesModule,
            invoices_module_1.InvoicesModule,
            customers_module_1.CustomersModule,
            suppliers_module_1.SuppliersModule,
            repairs_module_1.RepairsModule,
            warranties_module_1.WarrantiesModule,
            analytics_module_1.AnalyticsModule,
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map