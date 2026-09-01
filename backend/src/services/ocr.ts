import { recognize } from 'tesseract.js';

type LicenseExtraction={name?:string;licenseNo?:string;licenseCategory?:string;licenseExpiry?:string;rawText:string;confidence:number};

function normalizedText(value:string){return value.toUpperCase().replace(/[|]/g,'I').replace(/\s+/g,' ').trim()}

function parseDate(value:string){
  const parts=value.split(/[\/.\-]/).map(Number);if(parts.length!==3)return null;
  const [day,month,yearValue]=parts;const year=yearValue<100?2000+yearValue:yearValue;
  const date=new Date(Date.UTC(year,month-1,day));return Number.isNaN(date.getTime())?null:date;
}

export async function extractDrivingLicense(buffer:Buffer):Promise<LicenseExtraction>{
  const result=await recognize(buffer,'eng');const rawText=result.data.text||'';const text=normalizedText(rawText);
  const compact=text.replace(/[^A-Z0-9]/g,'');
  const licenseNo=compact.match(/[A-Z]{2}\d{2}[A-Z0-9]{8,14}/)?.[0];
  const category=text.match(/\b(LMV(?:-TR)?|HMV|MCWG|MCWOG|TRANSPORT|TR)\b/)?.[1];
  const dates=[...text.matchAll(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g)].map(match=>parseDate(match[0])).filter((date):date is Date=>Boolean(date));
  const futureDates=dates.filter(date=>date>new Date()).sort((a,b)=>b.getTime()-a.getTime());
  const name=text.match(/(?:NAME|NAM)\s*[:\-]?\s*([A-Z][A-Z ]{2,35}?)(?=\s+(?:S\/D\/W|DOB|DATE|ADDRESS|DL|LICEN|$))/)?.[1]?.trim();
  return {name,licenseNo,licenseCategory:category,licenseExpiry:futureDates[0]?.toISOString(),rawText,confidence:Math.round(result.data.confidence||0)};
}

export async function extractOdometer(buffer:Buffer){
  const result=await recognize(buffer,'eng');const rawText=result.data.text||'';
  const values=[...rawText.replace(/[, ]/g,'').matchAll(/\b\d{3,8}(?:\.\d)?\b/g)].map(match=>Number(match[0])).filter(Number.isFinite);
  const odometerKm=values.length?Math.max(...values):undefined;
  return {odometerKm,rawText,confidence:Math.round(result.data.confidence||0)};
}

export function parseReceiptText(rawText:string,confidence=0){
  const text=normalizedText(rawText);
  const lines=rawText.toUpperCase().replace(/[|]/g,'I').split(/\r?\n/).map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean);
  const moneyPattern=/\b(?:RS\.?|INR|₹)?\s*([0-9]{1,7}(?:[,.][0-9]{1,2})?)\b/g;
  const totalLines=lines.filter(line=>/GRAND\s*TOTAL|NET\s*(?:AMOUNT|TOTAL)|TOTAL\s*(?:AMOUNT|PAYABLE)?|AMOUNT\s*(?:DUE|PAID)/.test(line));
  const amounts=(totalLines.length?totalLines:lines).flatMap(line=>[...line.matchAll(moneyPattern)].map(match=>Number(match[1].replace(',','.')))).filter(value=>Number.isFinite(value)&&value>0);
  const litersMatches=[...text.matchAll(/\b([0-9]{1,4}(?:[.,][0-9]{1,3})?)\s*(?:L|LTR|LITRE|LITER|LITRES|LITERS)\b/g)].map(match=>Number(match[1].replace(',','.'))).filter(value=>Number.isFinite(value)&&value>0);
  const dates=[...text.matchAll(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g)].map(match=>parseDate(match[0])).filter((date):date is Date=>Boolean(date));
  const vendor=lines.find(line=>line.length>=3&&line.length<=80&&!/INVOICE|RECEIPT|TAX|GST|CASH MEMO|BILL/.test(line));
  return {amount:amounts.length?Math.max(...amounts):undefined,liters:litersMatches[0],vendor,date:dates[0]?.toISOString(),rawText,confidence:Math.round(confidence)};
}

export async function extractReceipt(buffer:Buffer){
  const result=await recognize(buffer,'eng');return parseReceiptText(result.data.text||'',result.data.confidence||0);
}
