import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it } from 'vitest';
const source=readFileSync(new URL('../../../js/request-view.js',import.meta.url),'utf8');
function views(){
  const win: Record<string,unknown>={U:{esc:(x:unknown)=>String(x ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),fmtDate:(x:unknown)=>String(x)},KAS_API_MAP:{},KAS_DATA:{getHotel:()=>null}};
  runInNewContext(source,{window:win,Intl,Number});
  return win.KAS_REQUEST_VIEW as {state:(b:object,vi:boolean)=>{code:string;stage:number;label:string};timeline:(b:object,vi:boolean)=>string;details:(b:object,vi:boolean)=>string;map:(b:object,p:object)=>Record<string,unknown>};
}
it('a submitted request remains awaiting review even when its stay dates are in the past',()=>{
  const v=views();const booking={salesStatus:'REQUESTED',checkOut:'2000-01-01'};
  expect(v.state(booking,true).stage).toBe(0);
  expect(v.state(booking,true).label).toContain('chờ khách sạn');
  expect(v.timeline(booking,true)).toContain('aria-current="step"');
  expect(v.state({salesStatus:'PAYMENT_PENDING'},true).stage).toBe(2);
  expect(v.state({salesStatus:'WON',stayStatus:'CONFIRMED'},true).stage).toBe(3);
});
it('maps actual guest and room quantities and server amounts without demo defaults',()=>{
  const result=views().map({reference:'TEST-REQUEST',propertySlug:'test-property',adults:4,children:2,rooms:2,nights:3,roomName:'Actual room',totalMinor:2400000,subtotalMinor:2400000,salesStatus:'REQUESTED',guestName:'Guest',guestEmail:'guest@example.invalid'},{});
  expect(result).toMatchObject({adults:4,children:2,rooms:2,nights:3,total:2400000,status:'REQUESTED',roomName:'Actual room',live:true});
});
it('never fabricates taxes, payment confirmation or undefined values for partial server data',()=>{
  const html=views().details({salesStatus:'REQUESTED',checkIn:'2026-10-25',checkOut:'2026-10-26',guest:{},total:null},true);
  expect(html).not.toMatch(/undefined|NaN|demo|VAT|No payment taken/);
  expect(html).toContain('Chưa có xác nhận thanh toán');
  expect(html).not.toContain('CHECKED_IN');
});
it('does not infer cancellations, completed stays or refunds from dates',()=>{
  const v=views();expect(v.state({salesStatus:'REQUESTED',checkOut:'2000-01-01'},false).code).toBe('REQUESTED');
  expect(v.state({salesStatus:'CANCELLED'},false).stage).toBe(-1);
  expect(v.details({salesStatus:'CANCELLED',guest:{},checkIn:'2026-10-25',checkOut:'2026-10-26'},false)).not.toMatch(/Refund|No charge has been made/);
});
