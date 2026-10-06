"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const establishments_service_1 = require("../../global/establishments/establishments.service");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const tenant_user_schema_1 = require("../common/schemas/tenant-user.schema");
let AuthService = AuthService_1 = class AuthService {
    constructor(establishmentsService, tenantConnectionService, jwtService) {
        this.establishmentsService = establishmentsService;
        this.tenantConnectionService = tenantConnectionService;
        this.jwtService = jwtService;
        this.logger = new common_1.Logger(AuthService_1.name);
    }
    normalizePhone(phone) {
        let cleaned = phone.replace(/[\s\-().]/g, '');
        if (cleaned.startsWith('00'))
            cleaned = '+' + cleaned.slice(2);
        return cleaned;
    }
    async login(dto) {
        const identifier = dto.identifier.trim();
        const isPhone = !identifier.includes('@');
        const normalized = isPhone ? this.normalizePhone(identifier) : identifier.toLowerCase();
        let establishment = null;
        if (dto.tenantSlug) {
            establishment = await this.establishmentsService.findBySlug(dto.tenantSlug);
            if (!establishment) {
                throw new common_1.NotFoundException(`Établissement '${dto.tenantSlug}' introuvable.`);
            }
        }
        else {
            const establishments = await this.establishmentsService.findAll();
            for (const est of establishments) {
                if (est.status !== 'active')
                    continue;
                const userModel = this.tenantConnectionService.getModel(est.databaseName, tenant_user_schema_1.TenantUser.name, tenant_user_schema_1.TenantUserSchema);
                const found = await userModel.findOne({
                    $or: [{ phone: normalized }, { email: normalized }],
                });
                if (found) {
                    establishment = est;
                    break;
                }
            }
            if (!establishment) {
                throw new common_1.UnauthorizedException('Identifiants invalides ou aucun établissement associé.');
            }
        }
        const userModel = this.tenantConnectionService.getModel(establishment.databaseName, tenant_user_schema_1.TenantUser.name, tenant_user_schema_1.TenantUserSchema);
        const user = await userModel.findOne({
            $or: [{ phone: normalized }, { email: normalized }],
        });
        if (!user || !user.isActive) {
            throw new common_1.UnauthorizedException('Identifiants incorrects ou compte inactif.');
        }
        const isMatch = await bcrypt.compare(dto.password, user.password);
        if (!isMatch) {
            throw new common_1.UnauthorizedException('Identifiants incorrects.');
        }
        const payload = {
            sub: user._id,
            tenantId: establishment._id,
            tenantSlug: establishment.slug,
            tenantDb: establishment.databaseName,
            role: user.role,
            name: user.name,
            phone: user.phone,
            email: user.email,
        };
        const token = this.jwtService.sign(payload);
        return {
            accessToken: token,
            user: {
                id: user._id,
                name: user.name,
                phone: user.phone,
                email: user.email,
                role: user.role,
            },
            establishment: {
                id: establishment._id,
                name: establishment.name,
                slug: establishment.slug,
                currency: establishment.currency,
            },
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [establishments_service_1.EstablishmentsService,
        tenant_connection_service_1.TenantConnectionService,
        jwt_1.JwtService])
], AuthService);
//# sourceMappingURL=auth.service.js.map