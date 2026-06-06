import { redirect } from 'next/navigation'

// Root redirects to the Dr. OS dashboard (CLAUDE.md §2).
export default function RootPage() {
  redirect('/dr-os')
}
