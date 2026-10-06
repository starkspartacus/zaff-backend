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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EstablishmentsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const establishments_service_1 = require("./establishments.service");
const create_establishment_dto_1 = require("./dto/create-establishment.dto");
const update_establishment_dto_1 = require("./dto/update-establishment.dto");
let EstablishmentsController = class EstablishmentsController {
    constructor(establishmentsService) {
        this.establishmentsService = establishmentsService;
    }
    create(dto) {
        return this.establishmentsService.create(dto);
    }
    findAll() {
        return this.establishmentsService.findAll();
    }
    findOne(id) {
        return this.establishmentsService.findById(id);
    }
    update(id, dto) {
        return this.establishmentsService.update(id, dto);
    }
    toggleStatus(id) {
        return this.establishmentsService.toggleStatus(id);
    }
};
exports.EstablishmentsController = EstablishmentsController;
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Créer un nouvel établissement (Provisionne automatiquement sa base de données dédiée)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_establishment_dto_1.CreateEstablishmentDto]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Lister tous les établissements de la plateforme' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Détails d\'un établissement' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "findOne", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Mettre à jour un établissement' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_establishment_dto_1.UpdateEstablishmentDto]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "update", null);
__decorate([
    (0, common_1.Patch)(':id/toggle-status'),
    (0, swagger_1.ApiOperation)({ summary: 'Activer / Suspendre un établissement' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], EstablishmentsController.prototype, "toggleStatus", null);
exports.EstablishmentsController = EstablishmentsController = __decorate([
    (0, swagger_1.ApiTags)('Global - Establishments (Tenants)'),
    (0, common_1.Controller)('global/establishments'),
    __metadata("design:paramtypes", [establishments_service_1.EstablishmentsService])
], EstablishmentsController);
//# sourceMappingURL=establishments.controller.js.map