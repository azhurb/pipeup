import { CapsuleLogo } from './CapsuleLogo'

export function CapsuleIdle() {
  return (
    <div className="relative z-10 flex items-center justify-center w-9 h-9 cursor-pointer">
      <CapsuleLogo size={20} />
    </div>
  )
}
