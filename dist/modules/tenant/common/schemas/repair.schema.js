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
exports.RepairSchema = exports.Repair = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const repair_status_enum_1 = require("../../../../common/enums/repair-status.enum");
let Repair = class Repair {
};
exports.Repair = Repair;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Customer', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Repair.prototype, "customerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Product', default: null }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Repair.prototype, "productId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], Repair.prototype, "deviceName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true, default: null }),
    __metadata("design:type", String)
], Repair.prototype, "serialNumber", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Repair.prototype, "issueDescription", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: repair_status_enum_1.RepairStatus, default: repair_status_enum_1.RepairStatus.RECEIVED, index: true }),
    __metadata("design:type", String)
], Repair.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Number)
], Repair.prototype, "estimatedCost", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Number)
], Repair.prototype, "actualCost", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Repair.prototype, "laborCost", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Repair.prototype, "partsCost", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Repair.prototype, "diagnosis", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], Repair.prototype, "repairNotes", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: () => new Date() }),
    __metadata("design:type", Date)
], Repair.prototype, "receivedDate", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], Repair.prototype, "estimatedCompletion", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", Date)
], Repair.prototype, "completedDate", void 0);
exports.Repair = Repair = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'repairs' })
], Repair);
exports.RepairSchema = mongoose_1.SchemaFactory.createForClass(Repair);
//# sourceMappingURL=repair.schema.js.map