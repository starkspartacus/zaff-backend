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
exports.CreateStockMovementDto = void 0;
const class_validator_1 = require("class-validator");
const swagger_1 = require("@nestjs/swagger");
const stock_movement_enum_1 = require("../../../../common/enums/stock-movement.enum");
class CreateStockMovementDto {
}
exports.CreateStockMovementDto = CreateStockMovementDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)(),
    __metadata("design:type", String)
], CreateStockMovementDto.prototype, "productId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: stock_movement_enum_1.StockMovementType }),
    (0, class_validator_1.IsEnum)(stock_movement_enum_1.StockMovementType),
    __metadata("design:type", String)
], CreateStockMovementDto.prototype, "movementType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 5 }),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateStockMovementDto.prototype, "quantity", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: stock_movement_enum_1.StockReferenceType, default: stock_movement_enum_1.StockReferenceType.MANUAL }),
    (0, class_validator_1.IsEnum)(stock_movement_enum_1.StockReferenceType),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateStockMovementDto.prototype, "referenceType", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateStockMovementDto.prototype, "referenceId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], CreateStockMovementDto.prototype, "notes", void 0);
//# sourceMappingURL=create-stock-movement.dto.js.map