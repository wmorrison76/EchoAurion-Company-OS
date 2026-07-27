import { LogOut } from 'lucide-react'
import { signOutAction } from '@/app/actions/session'

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        aria-label="Sign out"
        className="flex w-full items-center gap-2 rounded-xl border border-[#2a2a3f] px-3 py-2 text-xs text-[#a0a0b8] transition-colors duration-150 hover:bg-[#22223a] hover:text-white"
      >
        <LogOut size={14} aria-hidden="true" />
        <span>Sign Out</span>
      </button>
    </form>
  )
}
