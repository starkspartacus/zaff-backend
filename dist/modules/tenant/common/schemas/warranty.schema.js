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
exports.WarrantySchema = exports.Warranty = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const warranty_status_enum_1 = require("../../../../common/enums/warranty-status.enum");
let Warranty = class Warranty {
};
exports.Warranty = Warranty;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Sale', default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Warranty.prototype, "saleId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Customer', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Warranty.prototype, "customerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Product', default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Warranty.prototype, "productId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Warranty.prototype, "productName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true, default: null, index: true }),
    __metadata("design:type", String)
], Warranty.prototype, "serialNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: () => new Date() }),
    __metadata("design:type", Date)
], Warranty.prototype, "warrantyStart", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 12 }),
    __metadata("design:type", Number)
], Warranty.prototype, "warrantyDurationMonths", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Date)
], Warranty.prototype, "warrantyEnd", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: warranty_status_enum_1.WarrantyStatus, default: warranty_status_enum_1.WarrantyStatus.ACTIVE, index: true }),
    __metadata("design:type", String)
], Warranty.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Warranty.prototype, "notes", void 0);
exports.Warranty = Warranty = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'warranties' })
], Warranty);
exports.WarrantySchema = mongoose_1.SchemaFactory.createForClass(Warranty);
//# sourceMappingURL=warranty.schema.js.map