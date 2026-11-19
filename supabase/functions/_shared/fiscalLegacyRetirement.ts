/** Ruta retirada: nunca lee solicitudes, credenciales o datos comerciales. */
export function retiredFiscalLegacyHandler(_request:Request):Response{
 return Response.json({success:false,codigo:'RUTA_FISCAL_RETIRADA',emision_habilitada:false,error:'La ruta fiscal heredada fue retirada. Usá el circuito de preparación y revisión autorizado.'},
  {status:410,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
}
