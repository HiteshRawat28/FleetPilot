import { describe, expect, it } from 'vitest';
import { parseGoogleTollInfo, rankRouteMetrics } from './routePlanning';

describe('parseGoogleTollInfo',()=>{
  it('parses INR units and nanos without fixed toll multipliers',()=>{
    expect(parseGoogleTollInfo({estimatedPrice:[{currencyCode:'INR',units:'1240',nanos:500000000}]})).toEqual({estimatedToll:1240.5,tollEstimateStatus:'ESTIMATED'});
  });
  it('reports no expected toll when Google omits toll info',()=>{
    expect(parseGoogleTollInfo()).toEqual({estimatedToll:0,tollEstimateStatus:'NO_TOLLS_EXPECTED'});
  });
  it('keeps tolls unknown when a toll exists without an INR price',()=>{
    expect(parseGoogleTollInfo({estimatedPrice:[{currencyCode:'USD',units:'4'}]})).toEqual({estimatedToll:null,tollEstimateStatus:'TOLLS_PRESENT_PRICE_UNKNOWN'});
  });
});

describe('rankRouteMetrics',()=>{
  it('labels candidates from their returned metrics instead of their requested strategy',()=>{
    const requestedShortest={name:'requested-shortest',distanceKm:786,durationMinutes:907};
    const requestedFastest={name:'requested-fastest',distanceKm:1029,durationMinutes:1224};
    const requestedTollSaver={name:'requested-toll-saver',distanceKm:795,durationMinutes:917};
    expect(rankRouteMetrics([requestedShortest,requestedFastest,requestedTollSaver])).toEqual({
      shortest:requestedShortest,
      fastest:requestedShortest
    });
  });
});
