"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passwordSchema = void 0;
const zod_1 = require("zod");
exports.passwordSchema = zod_1.z.string()
    .min(10, 'Password must be at least 10 characters')
    .regex(/[A-Z]/, 'Password needs an uppercase letter')
    .regex(/[0-9]/, 'Password needs a number');
