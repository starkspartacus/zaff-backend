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
exports.CreateWarrantyDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const warranty_status_enum_1 = require("../../../../common/enums/warranty-status.enum");
class CreateWarrantyDto {
}
exports.CreateWarrantyDto = CreateWarrantyDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateWarrantyDto.prototype, "saleId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateWarrantyDto.prototype, "customerId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateWarrantyDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Samsung Galaxy S24 Ultra' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateWarrantyDto.prototype, "productName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: 'R5CW10ABCD' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateWarrantyDto.prototype, "serialNumber", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12, description: 'Durée en mois' }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateWarrantyDto.prototype, "warrantyDurationMonths", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: warranty_status_enum_1.WarrantyStatus, default: warranty_status_enum_1.WarrantyStatus.ACTIVE }),
    (0, class_validator_1.IsEnum)(warranty_status_enum_1.WarrantyStatus),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateWarrantyDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateWarrantyDto.prototype, "notes", void 0);
//# sourceMappingURL=create-warranty.dto.js.map