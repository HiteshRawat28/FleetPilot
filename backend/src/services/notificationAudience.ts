import { Role } from '@prisma/client';

export function receivesTripNotification(role:Role,candidateDriverId:string|null,assignedDriverId:string|null){
  return role!==Role.DRIVER||Boolean(assignedDriverId&&candidateDriverId===assignedDriverId);
}
