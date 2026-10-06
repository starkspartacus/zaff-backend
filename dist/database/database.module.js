"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const config_1 = require("@nestjs/config");
const database_constants_1 = require("./database.constants");
const tenant_connection_service_1 = require("./tenant-connection.service");
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forRootAsync({
                connectionName: database_constants_1.GLOBAL_CONNECTION,
                imports: [config_1.ConfigModule],
                useFactory: (configService) => {
                    const uri = configService.get('mongodb.uri');
                    const dbName = configService.get('mongodb.globalDbName');
                    return {
                        uri: `${uri}/${dbName}?retryWrites=true&w=majority`,
                    };
                },
                inject: [config_1.ConfigService],
            }),
        ],
        providers: [tenant_connection_service_1.TenantConnectionService],
        exports: [tenant_connection_service_1.TenantConnectionService, mongoose_1.MongooseModule],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map