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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const bcrypt = __importStar(require("bcrypt"));
const tenant_connection_service_1 = require("../../../database/tenant-connection.service");
const tenant_user_schema_1 = require("../common/schemas/tenant-user.schema");
let UsersService = class UsersService {
    constructor(tenantConnectionService) {
        this.tenantConnectionService = tenantConnectionService;
    }
    getModel(databaseName) {
        return this.tenantConnectionService.getModel(databaseName, tenant_user_schema_1.TenantUser.name, tenant_user_schema_1.TenantUserSchema);
    }
    async create(databaseName, dto) {
        const model = this.getModel(databaseName);
        const existing = await model.findOne({ phone: dto.phone });
        if (existing) {
            throw new common_1.ConflictException(`Un utilisateur avec le téléphone '${dto.phone}' existe déjà.`);
        }
        const hashedPassword = await bcrypt.hash(dto.password, 10);
        const user = await model.create({
            ...dto,
            password: hashedPassword,
            isActive: true,
        });
        const { password, ...safeUser } = user.toObject();
        return safeUser;
    }
    async findAll(databaseName) {
        const model = this.getModel(databaseName);
        return model.find({}, { password: 0 }).sort({ createdAt: -1 }).exec();
    }
    async findById(databaseName, id) {
        const model = this.getModel(databaseName);
        const user = await model.findById(id, { password: 0 }).exec();
        if (!user)
            throw new common_1.NotFoundException('Utilisateur non trouvé.');
        return user;
    }
    async update(databaseName, id, dto) {
        const model = this.getModel(databaseName);
        const updates = { ...dto };
        if (updates.password) {
            updates.password = await bcrypt.hash(updates.password, 10);
        }
        const user = await model.findByIdAndUpdate(id, updates, { new: true, projection: { password: 0 } }).exec();
        if (!user)
            throw new common_1.NotFoundException('Utilisateur non trouvé.');
        return user;
    }
    async remove(databaseName, id) {
        const model = this.getModel(databaseName);
        const res = await model.findByIdAndDelete(id).exec();
        if (!res)
            throw new common_1.NotFoundException('Utilisateur non trouvé.');
        return { message: 'Utilisateur supprimé avec succès.' };
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_connection_service_1.TenantConnectionService])
], UsersService);
//# sourceMappingURL=users.service.js.map