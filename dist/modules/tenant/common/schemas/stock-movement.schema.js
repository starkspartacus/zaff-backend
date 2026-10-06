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
exports.StockMovementSchema = exports.StockMovement = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const stock_movement_enum_1 = require("../../../../common/enums/stock-movement.enum");
let StockMovement = class StockMovement {
};
exports.StockMovement = StockMovement;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Product', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], StockMovement.prototype, "productId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: stock_movement_enum_1.StockMovementType }),
    __metadata("design:type", String)
], StockMovement.prototype, "movementType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], StockMovement.prototype, "quantity", void 0);
__decorate([
    (0, mongoose_1.Prop)({ enum: stock_movement_enum_1.StockReferenceType, default: stock_movement_enum_1.StockReferenceType.MANUAL }),
    __metadata("design:type", String)
], StockMovement.prototype, "referenceType", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], StockMovement.prototype, "referenceId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: null }),
    __metadata("design:type", String)
], StockMovement.prototype, "notes", void 0);
exports.StockMovement = StockMovement = __decorate([
    (0, mongoose_1.Schema)({ timestamps: true, collection: 'stock_movements' })
], StockMovement);
exports.StockMovementSchema = mongoose_1.SchemaFactory.createForClass(StockMovement);
//# sourceMappingURL=stock-movement.schema.js.map