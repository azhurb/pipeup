import icon from '../../src-tauri/icons/128x128.png'

export function BrandIcon({ size = 32 }: { size?: number }) {
  return <img src={icon} alt="" width={size} height={size} className="shrink-0" draggable={false} />
}
