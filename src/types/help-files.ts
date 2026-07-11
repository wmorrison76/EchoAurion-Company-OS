export interface HelpArticleView {
  id: string
  slug: string
  title: string
  body: string
  tags: string[]
  panelId: string | null
  updatedAt: string
  createdAt: string
}

export interface ContextualHelpResult {
  draftAnswer: string
  suggestedDirectives: Array<{
    type: 'open_panel' | 'show_message' | 'navigate'
    panelId?: string
    params?: Record<string, unknown>
    title?: string
    body?: string
    path?: string
    severity?: string
  }>
  citedArticleIds: string[]
  seat: string | null
}
