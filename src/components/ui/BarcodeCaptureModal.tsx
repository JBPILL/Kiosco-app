import { BarcodeScannerModal } from '../pos/BarcodeScannerModal'

interface BarcodeCaptureModalProps {
  isOpen: boolean
  onClose: () => void
  onBarcodeCaptured: (barcode: string) => void
  title?: string
}

/** Catalog capture uses the same camera, decoder and viewport as the POS. */
export function BarcodeCaptureModal({
  title = 'Escanear Código de Barras',
  ...props
}: BarcodeCaptureModalProps) {
  return <BarcodeScannerModal {...props} title={title} />
}
