import { validateFiscalOwnerApproval } from './fiscalOwnerReview.ts'
import type { FiscalOwnerApproval } from './fiscalOwnerReview.ts'
import { fiscalSha } from './fiscalReplacement.ts'
export interface FiscalPresentationApproval extends FiscalOwnerApproval {presentacion_sha256:string}
export function validateFiscalPresentationApproval(input:unknown,operation:string,bodySha:string,revision:number,id:string,presentationSha:string):Readonly<FiscalPresentationApproval>{
 if(!input||typeof input!=='object'||Array.isArray(input)||!fiscalSha(presentationSha))throw new Error('FISCAL_REVISION_PRESENTACION_NO_CONFIRMADA')
 const {presentacion_sha256,...approval}=input as Record<string,unknown>
 if(presentacion_sha256!==presentationSha)throw new Error('FISCAL_REVISION_PRESENTACION_NO_CONFIRMADA')
 const checked=validateFiscalOwnerApproval(approval,operation,bodySha,revision,id)
 return Object.freeze({...checked,presentacion_sha256:presentationSha})
}
