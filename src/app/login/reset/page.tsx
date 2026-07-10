import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm'

export const metadata = {
  title: 'Reset Password · EchoAurion Company OS',
}

type Props = {
  searchParams: { token?: string }
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const session = await auth()
  if (session?.user) redirect('/dr-os')

  const token = typeof searchParams.token === 'string' ? searchParams.token : ''

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#12121a] to-[#0a0a0f] px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Echo<span className="text-[#D4AF37]">Aurion</span>
          </h1>
          <p className="mt-1 text-xs uppercase tracking-widest text-[#a0a0b8]">Company OS</p>
        </div>

        <div className="rounded-xl border border-[#2a2a3f] bg-gradient-to-b from-[#12121a] to-[#0a0a0f] p-6 sm:p-8">
          <h2 className="mb-6 text-sm font-semibold text-white">Set new password</h2>
          <ResetPasswordForm token={token} />
        </div>

        <p className="mt-6 text-center text-xs text-[#5a5a78]">
          Aurion Holdings, Inc. · Dr. OS access only
        </p>
      </div>
    </main>
  )
}
