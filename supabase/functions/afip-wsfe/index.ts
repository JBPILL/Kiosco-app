// Edge Function de Supabase: Pasarela Oficial AFIP / ARCA (WSAA + WSFEv1)
// Permite la autorización formal de Facturas A, B y C con firma digital PKCS#7 en servidores de AFIP.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import forge from 'npm:node-forge@1.3.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SolicitudFacturacion {
  venta_id: string
  kiosco_id: string
  tipo_comprobante?: number // 11: Factura C, 6: Factura B, 1: Factura A
  tipo_doc_receptor?: number // 99: Consumidor Final, 96: DNI, 80: CUIT
  nro_doc_receptor?: string
}

function formatearFechaAFIP(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

function parsearXMLTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<(?:[a-zA-Z0-9_]+:)?${tag}[^>]*>([^<]+)</(?:[a-zA-Z0-9_]+:)?${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim() : null
}

function firmarTRA(traXml: string, certPem: string, keyPem: string): string {
  const cert = forge.pki.certificateFromPem(certPem)
  const privateKey = forge.pki.privateKeyFromPem(keyPem)

  const p7 = forge.pkcs7.createSignedData()
  p7.content = forge.util.createBuffer(traXml, 'utf8')
  p7.addCertificate(cert)
  p7.addSigner({
    key: privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  })
  p7.sign()
  const bytes = forge.asn1.toDer(p7.toAsn1()).getBytes()
  return forge.util.encode64(bytes)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Faltan variables de entorno SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    const body: SolicitudFacturacion = await req.json()
    const { venta_id, kiosco_id } = body
    if (!venta_id || !kiosco_id) {
      return new Response(JSON.stringify({ success: false, error: 'Parámetros venta_id y kiosco_id son obligatorios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Obtener la venta verificando pertenencia al kiosco
    const { data: venta, error: errVenta } = await supabaseAdmin
      .from('ventas')
      .select('id, total, kiosco_id, afip_tipo_comprobante')
      .eq('id', venta_id)
      .eq('kiosco_id', kiosco_id)
      .single()

    if (errVenta || !venta) {
      return new Response(JSON.stringify({ success: false, error: 'Venta no encontrada o no pertenece al comercio' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 2. Obtener datos fiscales del kiosco
    const { data: kiosco, error: errKiosco } = await supabaseAdmin
      .from('kioscos')
      .select('id, cuit, afip_punto_venta, afip_entorno, afip_certificado_crt, afip_clave_privada_key, afip_alicuota_iva')
      .eq('id', kiosco_id)
      .single()

    if (errKiosco || !kiosco) {
      return new Response(JSON.stringify({ success: false, error: 'Comercio no encontrado en la base de datos' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const entorno = kiosco.afip_entorno === 'PRODUCCION' ? 'PRODUCCION' : 'HOMOLOGACION'
    const puntoVenta = Number(kiosco.afip_punto_venta || 2)
    const cuitEmisor = (kiosco.cuit || '').replace(/\D/g, '')

    if (!cuitEmisor) {
      return new Response(JSON.stringify({ success: false, error: 'El comercio no tiene CUIT configurado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const certPem = kiosco.afip_certificado_crt
    const keyPem = kiosco.afip_clave_privada_key

    if (!certPem || !keyPem) {
      if (entorno === 'PRODUCCION') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'No se encontraron certificados AFIP (.crt y .key) configurados para operar en Producción',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 3. Obtener o renovar Ticket de Acceso (WSAA)
    let token = ''
    let sign = ''

    if (certPem && keyPem) {
      // Buscar token en caché en la tabla afip_tokens
      const ahora = new Date()
      const margenSeguridad = new Date(ahora.getTime() + 10 * 60 * 1000) // 10 minutos de margen

      const { data: tokenGuardado } = await supabaseAdmin
        .from('afip_tokens')
        .select('*')
        .eq('kiosco_id', kiosco_id)
        .eq('entorno', entorno)
        .gt('expiration_time', margenSeguridad.toISOString())
        .maybeSingle()

      if (tokenGuardado && tokenGuardado.token && tokenGuardado.sign) {
        token = tokenGuardado.token
        sign = tokenGuardado.sign
      } else {
        // Solicitar nuevo Token a WSAA
        const uniqueId = Math.floor(Date.now() / 1000)
        const genTime = new Date(ahora.getTime() - 10 * 60 * 1000).toISOString()
        const expTime = new Date(ahora.getTime() + 10 * 60 * 1000).toISOString()

        const traXml = `<?xml version="1.0" encoding="UTF-8"?>
<loginTicketRequest version="1.0">
  <header>
    <uniqueId>${uniqueId}</uniqueId>
    <generationTime>${genTime}</generationTime>
    <expirationTime>${expTime}</expirationTime>
  </header>
  <service>wsfe</service>
</loginTicketRequest>`

        const cmsBase64 = firmarTRA(traXml, certPem, keyPem)

        const wsaaUrl =
          entorno === 'PRODUCCION'
            ? 'https://wsaa.afip.gov.ar/ws/services/LoginCms'
            : 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms'

        const wsaaSoapReq = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">
  <soapenv:Header/>
  <soapenv:Body>
    <wsaa:loginCms>
      <wsaa:in0>${cmsBase64}</wsaa:in0>
    </wsaa:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

        const wsaaResp = await fetch(wsaaUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/xml;charset=UTF-8',
            SOAPAction: '',
          },
          body: wsaaSoapReq,
        })

        const wsaaXml = await wsaaResp.text()
        const tokenMatch = parsearXMLTag(wsaaXml, 'token')
        const signMatch = parsearXMLTag(wsaaXml, 'sign')
        const expMatch = parsearXMLTag(wsaaXml, 'expirationTime')

        if (!tokenMatch || !signMatch) {
          const fault = parsearXMLTag(wsaaXml, 'faultstring') || 'Error desconocido al autenticar ante AFIP WSAA'
          throw new Error(`WSAA Error: ${fault}`)
        }

        token = tokenMatch
        sign = signMatch
        const expiraIso = expMatch ? new Date(expMatch).toISOString() : new Date(ahora.getTime() + 11 * 3600 * 1000).toISOString()

        // Guardar token en afip_tokens
        await supabaseAdmin.from('afip_tokens').upsert(
          {
            kiosco_id,
            entorno,
            cuit: cuitEmisor,
            token,
            sign,
            expiration_time: expiraIso,
          },
          { onConflict: 'kiosco_id,entorno' }
        )
      }
    }

    // 4. Parámetros del comprobante
    const tipoCmp = Number(body.tipo_comprobante || venta.afip_tipo_comprobante || 11)
    const tipoDoc = Number(body.tipo_doc_receptor || 99)
    const nroDoc = (body.nro_doc_receptor || '0').replace(/\D/g, '') || '0'
    const totalVenta = Number(Number(venta.total).toFixed(2))
    const fechaHoyAFIP = formatearFechaAFIP(new Date())

    // Cálculos de neto e IVA
    const alicuota = Number(kiosco.afip_alicuota_iva || 21)
    let impNeto = totalVenta
    let impIVA = 0
    let alicCodigo = 3 // 0%

    if (tipoCmp === 6 || tipoCmp === 1) {
      // Factura B o A
      impNeto = Number((totalVenta / (1 + alicuota / 100)).toFixed(2))
      impIVA = Number((totalVenta - impNeto).toFixed(2))
      alicCodigo = alicuota === 10.5 ? 4 : 5
    }

    // 5. Invocación a WSFEv1
    const wsfeUrl =
      entorno === 'PRODUCCION'
        ? 'https://servicios1.afip.gob.ar/wsfev1/service.asmx'
        : 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx'

    // 5.1 Consultar último comprobante autorizado
    const soapUltComp = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECompUltimoAutorizado xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>${token}</Token>
        <Sign>${sign}</Sign>
        <Cuit>${cuitEmisor}</Cuit>
      </Auth>
      <PtoVta>${puntoVenta}</PtoVta>
      <CbteTipo>${tipoCmp}</CbteTipo>
    </FECompUltimoAutorizado>
  </soap:Body>
</soap:Envelope>`

    const respUltComp = await fetch(wsfeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado',
      },
      body: soapUltComp,
    })

    const xmlUltComp = await respUltComp.text()
    const cbteNroStr = parsearXMLTag(xmlUltComp, 'CbteNro')
    const ultimoNro = cbteNroStr ? parseInt(cbteNroStr, 10) : 0
    const nuevoNroComp = ultimoNro + 1

    // 5.2 Solicitar CAE (FECAESolicitar)
    const seccionIvaXml =
      impIVA > 0
        ? `<Iva>
            <AlicIva>
              <Id>${alicCodigo}</Id>
              <BaseImp>${impNeto}</BaseImp>
              <Importe>${impIVA}</Importe>
            </AlicIva>
          </Iva>`
        : ''

    const soapCAEReq = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FECAESolicitar xmlns="http://ar.gov.afip.dif.FEV1/">
      <Auth>
        <Token>${token}</Token>
        <Sign>${sign}</Sign>
        <Cuit>${cuitEmisor}</Cuit>
      </Auth>
      <FeCAEReq>
        <FeCabReq>
          <CantReg>1</CantReg>
          <PtoVta>${puntoVenta}</PtoVta>
          <CbteTipo>${tipoCmp}</CbteTipo>
        </FeCabReq>
        <FeDetReq>
          <FECAEDetRequest>
            <Concepto>1</Concepto>
            <DocTipo>${tipoDoc}</DocTipo>
            <DocNro>${nroDoc}</DocNro>
            <CbteDesde>${nuevoNroComp}</CbteDesde>
            <CbteHasta>${nuevoNroComp}</CbteHasta>
            <CbteFch>${fechaHoyAFIP}</CbteFch>
            <ImpTotal>${totalVenta}</ImpTotal>
            <ImpTotConc>0</ImpTotConc>
            <ImpNeto>${impNeto}</ImpNeto>
            <ImpOpEx>0</ImpOpEx>
            <ImpTrib>0</ImpTrib>
            <ImpIVA>${impIVA}</ImpIVA>
            <MonId>PES</MonId>
            <MonCotiz>1</MonCotiz>
            ${seccionIvaXml}
          </FECAEDetRequest>
        </FeDetReq>
      </FeCAEReq>
    </FECAESolicitar>
  </soap:Body>
</soap:Envelope>`

    const respCAE = await fetch(wsfeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: 'http://ar.gov.afip.dif.FEV1/FECAESolicitar',
      },
      body: soapCAEReq,
    })

    const xmlCAE = await respCAE.text()
    const resultado = parsearXMLTag(xmlCAE, 'Resultado')
    const cae = parsearXMLTag(xmlCAE, 'CAE')
    const vtoCae = parsearXMLTag(xmlCAE, 'CAEFchVto')

    if (resultado === 'A' && cae) {
      // Éxito: Persistir en la venta de Supabase con estado OFICIAL
      await supabaseAdmin
        .from('ventas')
        .update({
          afip_cae: cae,
          afip_vto_cae: vtoCae,
          afip_tipo_comprobante: tipoCmp,
          afip_nro_comprobante: nuevoNroComp,
          afip_estado: 'OFICIAL',
          afip_observaciones: null,
        })
        .eq('id', venta_id)

      return new Response(
        JSON.stringify({
          success: true,
          cae,
          vto_cae: vtoCae,
          nro_comprobante: nuevoNroComp,
          resultado: 'A',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    } else {
      // Rechazo o error de validación fiscal
      const msgErr = parsearXMLTag(xmlCAE, 'Msg') || parsearXMLTag(xmlCAE, 'faultstring') || 'Rechazado por AFIP'
      const obs = parsearXMLTag(xmlCAE, 'Obs') || msgErr

      await supabaseAdmin
        .from('ventas')
        .update({
          afip_estado: 'PENDIENTE',
          afip_observaciones: obs,
        })
        .eq('id', venta_id)

      return new Response(
        JSON.stringify({
          success: false,
          resultado: 'R',
          error: obs,
          nro_comprobante: nuevoNroComp,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
  } catch (error: any) {
    console.error('Error no controlado en Edge Function afip-wsfe:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Error procesando comprobante AFIP',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
