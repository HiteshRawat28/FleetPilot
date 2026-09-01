import {describe,expect,it} from 'vitest';
import {buildHistoricalTollObservations,estimateHistoricalToll,resolveTollVehicleClass} from './historicalTollEstimate';

const source={id:'a',name:'Ahmedabad',label:'Ahmedabad, Gujarat',city:'Ahmedabad',state:'Gujarat',latitude:23,longitude:72,provider:'BUILT_IN' as const};
const destination={id:'s',name:'Surat',label:'Surat, Gujarat',city:'Surat',state:'Gujarat',latitude:21,longitude:73,provider:'BUILT_IN' as const};

describe('historical toll estimation',()=>{
  it('prefers same-corridor observations and weights the rate by distance',()=>{
    const result=estimateHistoricalToll({source,destination,distanceKm:300,vehicleClass:'LCV',observations:[
      {source:'Ahmedabad Depot, Gujarat',destination:'Surat Hub, Gujarat',distanceKm:250,tollAmountInr:1000,vehicleClass:'LCV',observedAt:'2026-08-01'},
      {source:'Surat',destination:'Ahmedabad',distanceKm:250,tollAmountInr:1250,vehicleClass:'LCV',observedAt:'2026-08-20'},
      {source:'Jaipur',destination:'Ajmer',distanceKm:130,tollAmountInr:900,vehicleClass:'LCV',observedAt:'2026-08-30'}
    ]});
    expect(result).toMatchObject({estimatedTollInr:1350,ratePerKmInr:4.5,source:'HISTORICAL_CORRIDOR',confidence:'MEDIUM',sampleSize:2});
  });
  it('uses same-class fleet history at low confidence and never invents an empty estimate',()=>{
    expect(estimateHistoricalToll({source,destination,distanceKm:100,vehicleClass:'BUS_TRUCK',observations:[]})).toBeUndefined();
  });
  it('bootstraps another vehicle class from positive recorded fleet tolls at low confidence',()=>{
    const result=estimateHistoricalToll({source,destination,distanceKm:265,vehicleClass:'CAR_VAN',observations:[{source:'Ahmedabad',destination:'Surat',distanceKm:265,tollAmountInr:3200,vehicleClass:'BUS_TRUCK',observedAt:'2026-08-31'}]});
    expect(result).toMatchObject({estimatedTollInr:928,source:'HISTORICAL_FLEET_NORMALIZED',confidence:'LOW',sampleSize:1});
  });
  it('derives a conservative toll class from stored vehicle data',()=>{
    expect(resolveTollVehicleClass('Delivery Van',900)).toBe('CAR_VAN');
    expect(resolveTollVehicleClass('Mini Truck',4500)).toBe('LCV');
    expect(resolveTollVehicleClass('Heavy Truck',12000)).toBe('BUS_TRUCK');
  });
  it('matches finance toll expenses to the completed vehicle trip window',()=>{
    const completedAt=new Date('2026-08-02T12:00:00Z');
    const rows=buildHistoricalTollObservations([{id:'t1',vehicleId:'v1',vehicleType:'Mini Truck',vehicleCapacityKg:4500,source:'Ahmedabad',destination:'Surat',distanceKm:250,createdAt:new Date('2026-08-01'),dispatchedAt:new Date('2026-08-02'),completedAt,providerEstimatedTollInr:null}],[{vehicleId:'v1',amountInr:1200,date:new Date('2026-08-02T10:00:00Z')}]);
    expect(rows).toMatchObject([{tollAmountInr:1200,vehicleClass:'LCV'}]);
  });
});
