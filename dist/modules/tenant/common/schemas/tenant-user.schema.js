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
exports.TenantUserSchema = exports.TenantUser = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const role_enum_1 = require("../../../../common/enums/role.enum");
let TenantUser = class TenantUser {
};
exports.TenantUser = TenantUser;
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], TenantUser.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ lowercase: true, trim: true, default: null }),
    __metadata("design:type", String)
], TenantUser.prototype, "email", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true, index: true }),
    __metadata("design:type", String)
], TenantUser.prototype, "phone", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], TenantUser.prototype, "password", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: role_enum_1.Role, default: role_enum_1.Role.STANDARD }),
    __metadata("design:type", String)
], TenantUser.prototype, "role", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], TenantUser.prototype, "isActive", void 0);
exports.TenantUser = TenantUser = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'users' })
], TenantUser);
exports.TenantUserSchema = mongoose_1.SchemaFactory.createForClass(TenantUser);
//# sourceMappingURL=tenant-user.schema.js.map