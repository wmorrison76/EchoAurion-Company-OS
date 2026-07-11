import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { EliteLab } from '@/components/lab/EliteLab'

export const dynamic = 'force-dynamic'

export default async function EliteLabPage() {
  const session = await auth()
  if (!session?.user) redirect('/login')

  return (
    <main className="min-h-screen bg-[#0a0a0f]">
      <EliteLab />
    </main>
  )
}
