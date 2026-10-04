import type { ReactNode } from 'react'
import { DemoNotice } from '@/components/shared/Notices'

/** Shared frame of the login and registration pages. */
export function AuthCard({
  title,
  children,
  footer,
}: {
  title: string
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-4 text-3xl font-bold">{title}</h1>
      <DemoNotice>
        זהו אתר הדגמה. ההתחברות מתבצעת בדפדפן שלכם בלבד, ללא שרת, ואינה מאובטחת. החשבונות נשמרים רק
        במכשיר הזה, ולכן אל תשתמשו בסיסמה אמיתית.
      </DemoNotice>
      <div className="mt-6 rounded-xl border border-line bg-white p-6">{children}</div>
      <p className="mt-4 text-center text-sm text-muted">{footer}</p>
    </div>
  )
}
