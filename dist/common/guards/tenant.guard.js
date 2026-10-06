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
exports.TenantGuard = void 0;
const common_1 = require("@nestjs/common");
const establishments_service_1 = require("../../modules/global/establishments/establishments.service");
let TenantGuard = class TenantGuard {
    constructor(establishmentsService) {
        this.establishmentsService = establishmentsService;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        let slug = req.user?.tenantSlug;
        let id = req.user?.tenantId;
        if (!slug && !id) {
            slug = req.headers['x-tenant-slug'];
            id = req.headers['x-tenant-id'];
        }
        if (!slug && !id) {
            throw new common_1.BadRequestException('Aucun établissement spécifié (En-tête x-tenant-slug manquant ou session invalide).');
        }
        const establishment = slug
            ? await this.establishmentsService.findBySlug(slug)
            : await this.establishmentsService.findById(id);
        if (!establishment) {
            throw new common_1.BadRequestException(`Établissement '${slug || id}' introuvable.`);
        }
        if (establishment.status === 'suspended') {
            throw new common_1.ForbiddenException(`L\'établissement '${establishment.name}' est actuellement suspendu.`);
        }
        req.tenant = establishment;
        return true;
    }
};
exports.TenantGuard = TenantGuard;
exports.TenantGuard = TenantGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [establishments_service_1.EstablishmentsService])
], TenantGuard);
//# sourceMappingURL=tenant.guard.js.map