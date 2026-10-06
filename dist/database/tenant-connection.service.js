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
var TenantConnectionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantConnectionService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const database_constants_1 = require("./database.constants");
let TenantConnectionService = TenantConnectionService_1 = class TenantConnectionService {
    constructor(globalConnection) {
        this.globalConnection = globalConnection;
        this.logger = new common_1.Logger(TenantConnectionService_1.name);
    }
    getTenantConnection(databaseName) {
        if (!databaseName) {
            throw new Error('Tenant databaseName cannot be empty');
        }
        return this.globalConnection.useDb(databaseName, { useCache: true });
    }
    getModel(databaseName, modelName, schema) {
        const tenantConnection = this.getTenantConnection(databaseName);
        if (tenantConnection.models[modelName]) {
            return tenantConnection.models[modelName];
        }
        return tenantConnection.model(modelName, schema);
    }
    getGlobalConnection() {
        return this.globalConnection;
    }
};
exports.TenantConnectionService = TenantConnectionService;
exports.TenantConnectionService = TenantConnectionService = TenantConnectionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectConnection)(database_constants_1.GLOBAL_CONNECTION)),
    __metadata("design:paramtypes", [mongoose_2.Connection])
], TenantConnectionService);
//# sourceMappingURL=tenant-connection.service.js.map