import { describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import { extractResponseText,groqFailure,guidedWorkflowForMessage,toolNamesForRole,validateActionClaim } from './chat';

describe('FleetPilot Copilot role tools',()=>{
  it('gives organization owners and administrators the guarded trip creation tool',()=>{
    expect(toolNamesForRole(Role.OWNER)).toContain('prepare_draft_trip');
    expect(toolNamesForRole(Role.ADMIN)).toContain('prepare_draft_trip');
    for(const role of [Role.FLEET_MANAGER,Role.DISPATCHER,Role.SAFETY_OFFICER,Role.FINANCIAL_ANALYST])expect(toolNamesForRole(role)).not.toContain('prepare_draft_trip');
  });

  it('limits dispatchers to operational and assignment data',()=>{
    expect(toolNamesForRole(Role.DISPATCHER)).toEqual([
      'get_fleet_summary','search_vehicles','search_drivers','search_trips','check_assignment','recommend_assignment','guide_trip_assignment'
    ]);
  });

  it('does not expose finance or trip tools to safety officers',()=>{
    expect(toolNamesForRole(Role.SAFETY_OFFICER)).toEqual([
      'get_fleet_summary','search_drivers'
    ]);
  });

  it('limits financial analysts to summary, finance, and approved analytics',()=>{
    expect(toolNamesForRole(Role.FINANCIAL_ANALYST)).toEqual([
      'get_fleet_summary','get_finance_summary','get_analytics','get_weekly_operations_report','get_utilization_diagnostics','prepare_fuel_entry'
    ]);
  });

  it('keeps guided form preparation aligned with the existing module permissions',()=>{
    expect(toolNamesForRole(Role.FLEET_MANAGER)).toEqual(expect.arrayContaining(['guide_trip_assignment','prepare_maintenance','prepare_fuel_entry']));
    expect(toolNamesForRole(Role.DISPATCHER)).not.toContain('prepare_maintenance');
    expect(toolNamesForRole(Role.DISPATCHER)).not.toContain('prepare_fuel_entry');
    expect(toolNamesForRole(Role.SAFETY_OFFICER)).not.toContain('prepare_fuel_entry');
  });
});

describe('Groq response text extraction',()=>{
  it('uses the aggregate output_text field when present',()=>{
    expect(extractResponseText({output_text:' Fleet status is ready. '})).toBe('Fleet status is ready.');
  });

  it('reads output_text content from raw Responses API message items',()=>{
    expect(extractResponseText({output:[
      {type:'reasoning',content:[{type:'reasoning_text',text:'Internal reasoning must stay hidden.'}]},
      {type:'message',role:'assistant',content:[{type:'output_text',text:'No active trips today.'}]}
    ]})).toBe('No active trips today.');
  });
});

describe('Deterministic guided workflow routing',()=>{
  it('routes every supported workflow without depending on model intent selection',()=>{
    expect(guidedWorkflowForMessage('Help me assign this unassigned trip')?.name).toBe('guide_trip_assignment');
    expect(guidedWorkflowForMessage('Find a replacement driver for trip TRP0008')).toMatchObject({name:'guide_trip_assignment',args:{tripQuery:'TRP0008'}});
    expect(guidedWorkflowForMessage('Which vehicle can safely carry 4,000 kg?')).toMatchObject({name:'recommend_assignment',args:{cargoWeightKg:4000}});
    expect(guidedWorkflowForMessage('Prepare maintenance for vehicles due for service')?.name).toBe('prepare_maintenance');
    expect(guidedWorkflowForMessage('Show licence renewals required this month')?.name).toBe('search_drivers');
    expect(guidedWorkflowForMessage('Build a weekly operations report')?.name).toBe('get_weekly_operations_report');
    expect(guidedWorkflowForMessage('Explain why fleet utilization decreased')?.name).toBe('get_utilization_diagnostics');
    expect(guidedWorkflowForMessage('Prepare a fuel entry for vehicle Truck A with 50 L and cost ₹5,000')).toMatchObject({name:'prepare_fuel_entry',args:{vehicleQuery:'Truck A',liters:50,cost:5000}});
  });
});

describe('Groq error sanitization',()=>{
  it('returns a retryable message without provider account details for rate limits',()=>{
    const error=groqFailure(429) as Error&{status:number};
    expect(error.status).toBe(429);
    expect(error.message).toBe('Copilot is temporarily rate-limited by the AI provider. Wait a few seconds and try again.');
  });

  it('turns authentication failures into a configuration error',()=>{
    const error=groqFailure(401) as Error&{status:number};
    expect(error.status).toBe(503);
    expect(error.message).toContain('backend API key');
  });
});

describe('Copilot action-claim validation',()=>{
  it('replaces a model-invented confirmation button for administrators',()=>{
    expect(validateActionClaim('Please click **[Confirm & Create Draft Trip]** below.',Role.ADMIN)).toContain('No secure trip proposal');
  });

  it('does not alter ordinary answers or responses backed by a signed action',()=>{
    expect(validateActionClaim('The truck is available.',Role.ADMIN)).toBe('The truck is available.');
    expect(validateActionClaim('Click the confirmation button.',Role.ADMIN,[{} as never])).toBe('Click the confirmation button.');
  });
});
