"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.receivesTripNotification = receivesTripNotification;
const client_1 = require("@prisma/client");
function receivesTripNotification(role, candidateDriverId, assignedDriverId) {
    return role !== client_1.Role.DRIVER || Boolean(assignedDriverId && candidateDriverId === assignedDriverId);
}
