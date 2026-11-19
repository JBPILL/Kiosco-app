import { fireEvent,render,screen } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { FiscalPresentationForm } from '../components/pos/FiscalPresentationForm'
const context={venta_id:crypto.randomUUID(),operacion_id:crypto.randomUUID(),solicitud_sha256:'a'.repeat(64),lineas:[{detalle_id:crypto.randomUUID(),cantidad:'1.000',precio_unitario:'100.00',subtotal:'100.00'}]}
function fill(){
 for(const [label,value] of [['Razón social del emisor','Nombre'],['Domicilio comercial','Calle 1'],['Inscripción en Ingresos Brutos','Exento'],['Inicio de actividades','20/10/2026'],['Nombre o razón social del receptor','Consumidor final'],['Domicilio del receptor','Sin identificar'],['Descripción del artículo 1','Descripción'],['Otros impuestos nacionales indirectos contenidos','0']])fireEvent.change(screen.getByLabelText(label),{target:{value}})
}
it('requires explicit date and tax amount without configuration defaults',async()=>{
 const save=vi.fn(async()=>{});render(<FiscalPresentationForm context={context} onSave={save}/>);expect((screen.getByLabelText('Inicio de actividades') as HTMLInputElement).value).toBe('')
 fill();fireEvent.submit(screen.getByRole('form'));await vi.waitFor(()=>expect(save).toHaveBeenCalledTimes(1))
 expect(save.mock.calls[0]).toEqual([{version:1,emisor:{razon_social:'Nombre',domicilio_comercial:'Calle 1',ingresos_brutos:'Exento',inicio_actividades:'20261020'},receptor:{nombre:'Consumidor final',domicilio:'Sin identificar'},lineas:[{detalle_id:context.lineas[0].detalle_id,descripcion:'Descripción'}],otros_impuestos_nacionales_indirectos:'0.00'}])
})
it.each([['Inicio de actividades','31/02/2026'],['Inicio de actividades','2026-10-20'],['Otros impuestos nacionales indirectos contenidos','1e3']])('rejects invalid %s without saving',async(label,value)=>{
 const save=vi.fn(async()=>{});render(<FiscalPresentationForm context={context} onSave={save}/>);fill();fireEvent.change(screen.getByLabelText(label),{target:{value}});fireEvent.submit(screen.getByRole('form'));await screen.findByRole('alert');expect(save).not.toHaveBeenCalled()
})
