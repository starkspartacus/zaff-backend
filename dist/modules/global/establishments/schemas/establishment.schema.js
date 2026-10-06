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
exports.EstablishmentSchema = exports.Establishment = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let Establishment = class Establishment {
};
exports.Establishment = Establishment;
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], Establishment.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, lowercase: true, trim: true, index: true }),
    __metadata("design:type", String)
], Establishment.prototype, "slug", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true, lowercase: true, trim: true }),
    __metadata("design:type", String)
], Establishment.prototype, "databaseName", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], Establishment.prototype, "phone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ lowercase: true, trim: true }),
    __metadata("design:type", String)
], Establishment.prototype, "email", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], Establishment.prototype, "address", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'F', trim: true }),
    __metadata("design:type", String)
], Establishment.prototype, "currency", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'active', enum: ['active', 'suspended'] }),
    __metadata("design:type", String)
], Establishment.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'standard' }),
    __metadata("design:type", String)
], Establishment.prototype, "subscriptionPlan", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Object, default: {} }),
    __metadata("design:type", Object)
], Establishment.prototype, "settings", void 0);
exports.Establishment = Establishment = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'establishments' })
], Establishment);
exports.EstablishmentSchema = mongoose_1.SchemaFactory.createForClass(Establishment);
//# sourceMappingURL=establishment.schema.js.map