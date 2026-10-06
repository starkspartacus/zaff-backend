export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb+srv://cinqspartacus_db_user:3POJSanOGRcTluuu@cluster0.a026nzb.mongodb.net',
    globalDbName: process.env.GLOBAL_DATABASE_NAME || 'zaff_global',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'zaff_jwt_secret_token_secure_key_2026',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
});
