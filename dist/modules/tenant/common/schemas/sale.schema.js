"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SaleSchema = exports.Sale = exports.SaleItem = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const payment_method_enum_1 = require("../../../../common/enums/payment-method.enum");
const sale_type_enum_1 = require("../../../../common/enums/sale-type.enum");
let SaleItem = class SaleItem {
};
exports.SaleItem = SaleItem;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Product', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], SaleItem.prototype, "productId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], SaleItem.prototype, "productName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], SaleItem.prototype, "productSku", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], SaleItem.prototype, "productCategory", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], SaleItem.prototype, "quantity", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], SaleItem.prototype, "unitPrice", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], SaleItem.prototype, "total", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], SaleItem.prototype, "warrantyEnabled", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], SaleItem.prototype, "warrantyMonths", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], SaleItem.prototype, "serialNumber", void 0);
exports.SaleItem = SaleItem = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], SaleItem);
let Sale = class Sale {
};
exports.Sale = Sale;
__decorate([
    (0, mongoose_1.Prop)({ type: Number, index: true }),
    __metadata("design:type", Number)
], Sale.prototype, "invoiceNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Customer', default: null, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Sale.prototype, "customerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: () => new Date(), index: true }),
    __metadata("design:type", Date)
], Sale.prototype, "saleDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], Sale.prototype, "subtotal", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Sale.prototype, "discount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], Sale.prototype, "total", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: payment_method_enum_1.PaymentMethod, default: payment_method_enum_1.PaymentMethod.CASH }),
    __metadata("design:type", String)
], Sale.prototype, "paymentMethod", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: sale_type_enum_1.SaleType, default: sale_type_enum_1.SaleType.PURCHASE, index: true }),
    __metadata("design:type", String)
], Sale.prototype, "saleType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Sale.prototype, "returnStatus", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], Sale.prototype, "returnDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [SaleItem], default: [] }),
    __metadata("design:type", Array)
], Sale.prototype, "items", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Sale.prototype, "notes", void 0);
exports.Sale = Sale = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'sales' })
], Sale);
exports.SaleSchema = mongoose_1.SchemaFactory.createForClass(Sale);
//# sourceMappingURL=sale.schema.js.map