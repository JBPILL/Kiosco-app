/**
 * Generador estándar de código de barras Code 128 (Subset B) en formato SVG.
 * Compatible al 100% con pistolas lectoras láser, ópticas y cámaras de celular.
 */

const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const START_B = 104
const STOP = 106

export function generateCode128Bars(text: string): boolean[] {
  const safeText = text.replace(/[^\x20-\x7E]/g, '')
  if (!safeText) return []

  const values: number[] = [START_B]
  let checkSum = START_B

  for (let i = 0; i < safeText.length; i++) {
    const val = safeText.charCodeAt(i) - 32
    values.push(val)
    checkSum += val * (i + 1)
  }

  const checkChar = checkSum % 103
  values.push(checkChar)
  values.push(STOP)

  const bars: boolean[] = []
  for (const val of values) {
    const pattern = CODE128_PATTERNS[val]
    if (!pattern) continue
    for (let p = 0; p < pattern.length; p++) {
      const width = parseInt(pattern[p], 10)
      const isBar = p % 2 === 0
      for (let w = 0; w < width; w++) {
        bars.push(isBar)
      }
    }
  }

  return bars
}

export interface BarcodeSvgProps {
  value: string
  width?: number | string
  height?: number
  showText?: boolean
  className?: string
}

export function BarcodeSvg({
  value,
  height = 42,
  showText = false,
  className = '',
}: BarcodeSvgProps) {
  if (!value || !value.trim()) return null

  const bars = generateCode128Bars(value.trim())
  if (bars.length === 0) return null

  const quietZone = 10
  const totalModules = bars.length + quietZone * 2
  const moduleWidth = 1.5
  const svgWidth = totalModules * moduleWidth

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <svg
        viewBox={`0 0 ${svgWidth} ${height}`}
        className="w-full h-full max-w-full overflow-visible"
        preserveAspectRatio="none"
      >
        <rect width={svgWidth} height={height} fill="#ffffff" />
        {bars.map((isBar, idx) => {
          if (!isBar) return null
          const x = (quietZone + idx) * moduleWidth
          return (
            <rect
              key={idx}
              x={x}
              y={0}
              width={moduleWidth}
              height={height}
              fill="#000000"
            />
          )
        })}
      </svg>
      {showText && (
        <span className="font-mono text-[10px] sm:text-xs tracking-widest text-gray-800 dark:text-gray-200 mt-0.5 font-bold">
          {value.trim()}
        </span>
      )}
    </div>
  )
}
