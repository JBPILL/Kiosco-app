// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { beforeAll, expect, it } from 'vitest'
import { encryptFiscalTicket, decryptFiscalTicket } from '../../supabase/functions/_shared/fiscalTicketCipher'
import type { FiscalTicketCipherContext } from '../../supabase/functions/_shared/fiscalTicketCipher'

let key:CryptoKey
const keyId=randomUUID(),time=1000000
const context:FiscalTicketCipherContext={projectRef:'acoyfwwmhaeruciyedri',entorno:'HOMOLOGACION',servicio:'wsfe',certificadoSha256:'a'.repeat(64)}
const ticket={token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:time+120000}
beforeAll(async()=>{key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])})
it('cifra con clave privada no exportable y recupera credenciales sin serializarlas',async()=>{
  const encrypted=await encryptFiscalTicket(ticket,context,key,keyId)
  expect(JSON.stringify(encrypted)).not.toContain('SYNTHETIC')
  const recovered=await decryptFiscalTicket(encrypted,context,key,keyId,time)
  expect(recovered.token).toBe(ticket.token);expect(recovered.sign).toBe(ticket.sign)
  expect(JSON.stringify(recovered)).not.toContain('SYNTHETIC')
  expect({...recovered}).toEqual({expiresAt:ticket.expiresAt})
})
it('usa nonce aleatorio distinto para cada cifrado del mismo TA',async()=>{
  const first=await encryptFiscalTicket(ticket,context,key,keyId),second=await encryptFiscalTicket(ticket,context,key,keyId)
  expect(first.nonce).not.toBe(second.nonce);expect(first.ciphertext).not.toBe(second.ciphertext)
})
it.each(['certificado','clave','keyId','nonce','cifrado','vencimiento','campo_extra','vencido'])('rechaza modificación de %s',async mode=>{
  const encrypted={...await encryptFiscalTicket(ticket,context,key,keyId)},ctx={...context}
  if(mode==='certificado')ctx.certificadoSha256='b'.repeat(64)
  if(mode==='nonce')encrypted.nonce='0'.repeat(24)
  if(mode==='cifrado')encrypted.ciphertext=(encrypted.ciphertext[0]==='a'?'b':'a')+encrypted.ciphertext.slice(1)
  if(mode==='vencimiento')encrypted.expiresAt++
  const otherKey=mode==='clave'?await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']):key
  const input=mode==='campo_extra'?{...encrypted,token:'not-admitted'}:encrypted
  await expect(decryptFiscalTicket(input,ctx,otherKey,mode==='keyId'?randomUUID():keyId,mode==='vencido'?ticket.expiresAt:time))
    .rejects.toThrow('FISCAL_TICKET_CIFRADO_INVALIDO')
})
it('rechaza claves exportables y contexto productivo',async()=>{
  const exportable=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt'])
  await expect(encryptFiscalTicket(ticket,context,exportable,keyId)).rejects.toThrow('FISCAL_TICKET_CIFRADO_INVALIDO')
  await expect(encryptFiscalTicket(ticket,{...context,entorno:'PRODUCCION'} as unknown as FiscalTicketCipherContext,key,keyId)).rejects.toThrow('FISCAL_TICKET_CIFRADO_INVALIDO')
})
