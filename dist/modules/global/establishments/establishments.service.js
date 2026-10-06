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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EstablishmentsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EstablishmentsService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const bcrypt = __importStar(require("bcrypt"));
const database_constants_1 = require("../../../database/database.constants");
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const establishment_schema_1 = require("./schemas/establishment.schema");
const tenant_user_schema_1 = require("../../tenant/common/schemas/tenant-user.schema");
const role_enum_1 = require("../../../common/enums/role.enum");
let EstablishmentsService = EstablishmentsService_1 = class EstablishmentsService {
    constructor(establishmentModel, tenantConnectionService) {
        this.establishmentModel = establishmentModel;
        this.tenantConnectionService = tenantConnectionService;
        this.logger = new common_1.Logger(EstablishmentsService_1.name);
    }
    slugify(text) {
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
    async create(dto) {
        const slug = dto.slug ? this.slugify(dto.slug) : this.slugify(dto.name);
        const existing = await this.establishmentModel.findOne({ slug });
        if (existing) {
            throw new common_1.ConflictException(`Un établissement avec le slug '${slug}' existe déjà.`);
        }
        const databaseName = `zaff_tenant_${slug.replace(/-/g, '_')}`;
        const establishment = new this.establishmentModel({
            name: dto.name,
            slug,
            databaseName,
            phone: dto.phone,
            email: dto.email,
            address: dto.address,
            currency: dto.currency || 'F',
            status: 'active',
        });
        await establishment.save();
        this.logger.log(`Created establishment '${establishment.name}' with DB '${databaseName}'`);
        const adminPhone = dto.adminPhone || dto.phone || '+2250102030405';
        const rawPassword = dto.adminPassword || 'Admin1234!';
        const hashedPassword = await bcrypt.hash(rawPassword, 10);
        const userModel = this.tenantConnectionService.getModel(databaseName, tenant_user_schema_1.TenantUser.name, tenant_user_schema_1.TenantUserSchema);
        await userModel.create({
            name: dto.adminName || `Admin ${dto.name}`,
            email: dto.email || null,
            phone: adminPhone,
            password: hashedPassword,
            role: role_enum_1.Role.ADMIN,
            isActive: true,
        });
        this.logger.log(`Initial admin user created in tenant DB '${databaseName}'`);
        return establishment;
    }
    async findAll() {
        return this.establishmentModel.find().sort({ createdAt: -1 }).exec();
    }
    async findById(id) {
        const est = await this.establishmentModel.findById(id).exec();
        if (!est)
            throw new common_1.NotFoundException('Établissement non trouvé.');
        return est;
    }
    async findBySlug(slug) {
        return this.establishmentModel.findOne({ slug: slug.toLowerCase() }).exec();
    }
    async update(id, dto) {
        const est = await this.establishmentModel.findByIdAndUpdate(id, dto, { new: true }).exec();
        if (!est)
            throw new common_1.NotFoundException('Établissement non trouvé.');
        return est;
    }
    async toggleStatus(id) {
        const est = await this.findById(id);
        const newStatus = est.status === 'active' ? 'suspended' : 'active';
        return this.establishmentModel.findByIdAndUpdate(id, { status: newStatus }, { new: true }).exec();
    }
};
exports.EstablishmentsService = EstablishmentsService;
exports.EstablishmentsService = EstablishmentsService = EstablishmentsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(establishment_schema_1.Establishment.name, database_constants_1.GLOBAL_CONNECTION)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        tenant_connection_service_1.TenantConnectionService])
], EstablishmentsService);
//# sourceMappingURL=establishments.service.js.map