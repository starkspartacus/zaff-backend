"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StockReferenceType = exports.StockMovementType = void 0;
var StockMovementType;
(function (StockMovementType) {
    StockMovementType["IN"] = "in";
    StockMovementType["OUT"] = "out";
    StockMovementType["ADJUSTMENT"] = "adjustment";
})(StockMovementType || (exports.StockMovementType = StockMovementType = {}));
var StockReferenceType;
(function (StockReferenceType) {
    StockReferenceType["SALE"] = "sale";
    StockReferenceType["PURCHASE"] = "purchase";
    StockReferenceType["MANUAL"] = "manual";
    StockReferenceType["ADJUSTMENT"] = "adjustment";
})(StockReferenceType || (exports.StockReferenceType = StockReferenceType = {}));
//# sourceMappingURL=stock-movement.enum.js.map