import { describe,expect,it } from 'vitest';
import { Role } from '@prisma/client';
import { receivesTripNotification } from './notificationAudience';

describe('trip notification audience',()=>{
  it('notifies every non-driver access role',()=>{
    for(const role of [Role.OWNER,Role.ADMIN,Role.FLEET_MANAGER,Role.DISPATCHER,Role.SAFETY_OFFICER,Role.FINANCIAL_ANALYST]){
      expect(receivesTripNotification(role,null,'driver-1')).toBe(true);
    }
  });

  it('only notifies the assigned driver',()=>{
    expect(receivesTripNotification(Role.DRIVER,'driver-1','driver-1')).toBe(true);
    expect(receivesTripNotification(Role.DRIVER,'driver-2','driver-1')).toBe(false);
    expect(receivesTripNotification(Role.DRIVER,'driver-1',null)).toBe(false);
  });
});
