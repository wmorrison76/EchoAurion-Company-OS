import { AppShell } from '@/components/layout/AppShell'
import { BoardRoom } from '@/components/board-room/BoardRoom'

export const metadata = {
  title: 'Board Room · EchoAurion Company OS',
}

export default function BoardRoomPage() {
  return (
    <AppShell
      title="Board Room"
      subtitle="Knights counsel (strategy) — multi-AI orchestration"
    >
      <BoardRoom />
    </AppShell>
  )
}
