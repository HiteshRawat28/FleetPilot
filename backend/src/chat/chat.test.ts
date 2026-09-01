import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { toolNamesForRole } from './chat';

describe('FleetPilot Copilot role tools',()=>{
  it('gives owners the full read-only tool set',()=>{
    expect(toolNamesForRole(Role.OWNER)).toHaveLength(8);
  });

  it('limits dispatchers to operational and assignment data',()=>{
    expect(toolNamesForRole(Role.DISPATCHER)).toEqual([
      'get_fleet_summary','search_vehicles','search_drivers','search_trips','get_analytics','check_assignment'
    ]);
  });

  it('does not expose finance or trip tools to safety officers',()=>{
    expect(toolNamesForRole(Role.SAFETY_OFFICER)).toEqual([
      'get_fleet_summary','search_drivers','get_analytics'
    ]);
  });

  it('limits financial analysts to summary, finance, and approved analytics',()=>{
    expect(toolNamesForRole(Role.FINANCIAL_ANALYST)).toEqual([
      'get_fleet_summary','get_finance_summary','get_analytics'
    ]);
  });
});
